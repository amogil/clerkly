// Requirements: llm-integration.5
// src/main/agents/MainPipeline.ts
// Orchestrates the LLM request/response cycle for a single agent message

import { MessageManager } from './MessageManager';
import { PromptBuilder } from './PromptBuilder';
import { AIAgentSettingsManager } from '../AIAgentSettingsManager';
import { LLMProviderFactory } from '../llm/LLMProviderFactory';
import { MainEventBus } from '../events/MainEventBus';
import {
  MessageLlmReasoningUpdatedEvent,
  MessageLlmTextUpdatedEvent,
  AgentRateLimitEvent,
  LLMPipelineDiagnosticEvent,
} from '../../shared/events/types';
import { LLM_CHAT_MODELS } from '../llm/LLMConfig';
import { Logger } from '../Logger';
import type { ILLMProvider, ChatChunk, ChatOptions, LLMChatResult } from '../llm/ILLMProvider';
import { handleBackgroundError } from '../ErrorHandler';
import { normalizeLLMError } from '../llm/ErrorNormalizer';
import type { IToolExecutor } from '../tools/ToolRunner';
import { ToolRunner } from '../tools/ToolRunner';
import { makeCodeExecError, validateCodeExecInput } from '../code_exec/contracts';
import { normalizeCodeExecOutput } from '../code_exec/SandboxSessionManager';
import {
  buildRunningToolPayload,
  buildTerminalToolPayload,
} from '../code_exec/CodeExecPersistenceMapper';
import {
  AgentTitleCommentParser,
  evaluateAgentTitleGuards,
  normalizeAgentTitleCandidate,
} from './AgentTitleRuntime';

import type { LLMProvider } from '../../types';

type LlmSegmentState = {
  id: number | null;
  reasoning: string;
  text: string;
  order: MessageOrderMeta | null;
};

type RunningToolState = {
  messageId: number;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  startedAt: string;
};

type MessageOrderMeta = {
  runId: string;
  attemptId: number;
  sequence: number;
};

type StreamProcessingResult = {
  output: LLMChatResult;
  finalLlmMessageId: number | null;
  activeLlmMessageId: number | null;
  finalAnswerCall: { callId: string; args: Record<string, unknown> } | null;
  finalAnswerOrder: MessageOrderMeta | null;
  titleCandidate: string | null;
};

type AgentTitleUpdater = {
  getCurrentTitle: (agentId: string) => string | null;
  rename: (agentId: string, name: string) => void;
};

type StreamingCallContext = {
  chatMessages: ReturnType<PromptBuilder['buildMessages']>;
  options: ChatOptions;
  replyToMessageId: number;
  llmProvider: ILLMProvider;
};

type AttemptRuntimeState = {
  attemptMessageIds: Set<number>;
  runningToolCalls: Map<string, RunningToolState>;
  pendingToolCall: { callId: string; toolName: string; args: Record<string, unknown> } | null;
  sequence: number;
  currentSegment: LlmSegmentState;
  pendingReasoningDelta: string;
  pendingTextDelta: string;
  pendingFirstType: 'reasoning' | 'text' | null;
  lastFlushAt: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  pendingToolCallFlushTimer: ReturnType<typeof setTimeout> | null;
  finalLlmMessageId: number | null;
  toolCallsInCurrentStep: number;
  sawAnyToolCall: boolean;
  finalAnswerCall: { callId: string; args: Record<string, unknown> } | null;
  finalAnswerOrder: MessageOrderMeta | null;
  meaningfulChunkSeen: boolean;
  titleParser: AgentTitleCommentParser;
  sawTextChunk: boolean;
};

type AttemptCycleState = {
  attempts: number;
  invalidFinalAnswerSeen: boolean;
  validationFeedback: string | null;
  runId: string;
};

const FINAL_ANSWER_RETRY_EXHAUSTED_MESSAGE =
  'Model returned invalid tool call arguments too many times. Please try again later.';
const MAX_INVALID_TOOL_CALL_RETRIES = 2;
const STREAM_FLUSH_INTERVAL_MS = 100;

class InvalidFinalAnswerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFinalAnswerContractError';
  }
}

class InvalidToolArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidToolArgumentsError';
  }
}

class InvalidToolCallRetryExhaustedError extends Error {
  constructor() {
    super(FINAL_ANSWER_RETRY_EXHAUSTED_MESSAGE);
    this.name = 'InvalidToolCallRetryExhaustedError';
  }
}

/**
 * Error type categories for kind:error messages
 * Requirements: llm-integration.5.3
 */
export type LLMErrorType =
  | 'auth'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'timeout'
  | 'tool'
  | 'protocol';

/**
 * MainPipeline — stateless LLM execution pipeline
 *
 * Responsibilities:
 * - Load API key and provider from settings
 * - Build prompt via PromptBuilder
 * - Call ILLMProvider.chat() with streaming
 * - Create/update kind:llm messages via MessageManager
 * - Emit batched message.llm.reasoning.updated/message.llm.text.updated + message.updated
 * - Handle errors: create kind:error message
 * - Handle AbortSignal cancellation
 *
 * Stateless: all execution state lives in local variables inside run().
 * Multiple agents can run concurrently via Node.js event loop.
 *
 * Requirements: llm-integration.5
 */
export class MainPipeline {
  private logger = Logger.create('MainPipeline');
  private lastTitleRenameTurnByAgent = new Map<string, number>();

  constructor(
    private messageManager: MessageManager,
    private settingsManager: AIAgentSettingsManager,
    private promptBuilder: PromptBuilder,
    private createProvider: (provider: LLMProvider, apiKey: string) => ILLMProvider = (p, k) =>
      LLMProviderFactory.createProvider(p, k),
    private toolExecutor: IToolExecutor = new ToolRunner({}, 3),
    private agentTitleUpdater?: AgentTitleUpdater
  ) {}

  /**
   * Run the LLM pipeline for a user message
   *
   * @param agentId - Agent ID
   * @param userMessageId - ID of the user message that triggered this run
   * @param signal - Optional AbortSignal for cancellation
   *
   * Requirements: llm-integration.5.1, llm-integration.5.2, llm-integration.5.3
   */
  async run(agentId: string, userMessageId: number, signal?: AbortSignal): Promise<void> {
    // Track last created llm message for error handling
    let lastLlmMessageId: number | null = null;

    try {
      const context = await this.buildRunContext(agentId, userMessageId, signal);
      if (!context) return;

      await this.executeWithRetries(
        context,
        agentId,
        userMessageId,
        signal,
        (messageId) => {
          lastLlmMessageId = messageId;
        },
        () => {
          lastLlmMessageId = null;
        }
      );
    } catch (error) {
      this.handleRunError(error, agentId, userMessageId, signal, lastLlmMessageId);
    }
  }

  /**
   * Build settings and prompt context for the run.
   * Requirements: llm-integration.1.3, llm-integration.1.4, llm-integration.5.2
   */
  private async buildRunContext(
    agentId: string,
    userMessageId: number,
    signal?: AbortSignal
  ): Promise<{
    provider: LLMProvider;
    apiKey: string;
    baseChatMessages: ReturnType<PromptBuilder['buildMessages']>;
    options: ChatOptions;
    replyToMessageId: number;
    llmProvider: ILLMProvider;
  } | null> {
    if (signal?.aborted) return null;

    const provider = await this.settingsManager.loadLLMProvider();
    if (signal?.aborted) return null;

    const apiKey = await this.settingsManager.loadAPIKey(provider);
    if (signal?.aborted) return null;

    if (!apiKey) {
      throw new Error('API key is not set. Add it in Settings to continue.');
    }

    const messages = this.messageManager.listForModelHistory(agentId);
    const baseChatMessages = this.promptBuilder.buildMessages(messages);
    const builtPrompt = this.promptBuilder.build();
    const replyToMessageId = userMessageId;
    const options = {
      ...this.resolveOptions(provider),
      tools: this.bindToolExecutors(builtPrompt.tools),
    };
    const llmProvider = this.createProvider(provider, apiKey);

    return { provider, apiKey, baseChatMessages, options, replyToMessageId, llmProvider };
  }

  /**
   * Execute a single provider request with streaming updates.
   * Requirements: llm-integration.1, llm-integration.2, llm-integration.5
   */
  private async executeWithRetries(
    context: {
      baseChatMessages: ReturnType<PromptBuilder['buildMessages']>;
      options: ChatOptions;
      replyToMessageId: number;
      llmProvider: ILLMProvider;
    },
    agentId: string,
    userMessageId: number,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void,
    clearLastLlmMessageId: () => void
  ): Promise<void> {
    const streamResult = await this.callProviderWithStreaming(
      {
        chatMessages: context.baseChatMessages,
        options: context.options,
        replyToMessageId: context.replyToMessageId,
        llmProvider: context.llmProvider,
      },
      agentId,
      signal,
      setLastLlmMessageId
    );

    if (signal?.aborted) {
      this.handleAbortAfterStreaming(
        streamResult.activeLlmMessageId,
        agentId,
        clearLastLlmMessageId
      );
      return;
    }

    if (streamResult.finalLlmMessageId !== null) {
      setLastLlmMessageId(streamResult.finalLlmMessageId);
      this.persistUsageEnvelope(streamResult.finalLlmMessageId, agentId, streamResult.output);
    }
    if (streamResult.finalAnswerCall) {
      this.persistFinalAnswerToolCall(
        agentId,
        context.replyToMessageId,
        streamResult.finalAnswerCall.callId,
        streamResult.finalAnswerCall.args,
        streamResult.finalAnswerOrder
      );
    }
    this.applyAutoTitleCandidate(agentId, streamResult.titleCandidate);
    this.publishStepDiagnostics(agentId, userMessageId, streamResult.output);
    this.logger.info(`Pipeline completed for agent ${agentId}`);
  }

  /**
   * Call provider and map stream chunks into llm message updates/events.
   * Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
   */
  private async callProviderWithStreaming(
    context: StreamingCallContext,
    agentId: string,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void
  ): Promise<StreamProcessingResult> {
    const cycleState: AttemptCycleState = {
      attempts: 0,
      invalidFinalAnswerSeen: false,
      validationFeedback: null,
      runId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };

    for (;;) {
      const attemptState = this.initializeAttemptRuntimeState();
      const attemptId = cycleState.attempts + 1;

      try {
        return await this.runProviderAttempt(
          context,
          agentId,
          signal,
          setLastLlmMessageId,
          cycleState,
          attemptState,
          attemptId
        );
      } catch (error) {
        const shouldRetry = this.handleAttemptFailure(
          error,
          context,
          agentId,
          signal,
          cycleState,
          attemptState,
          setLastLlmMessageId
        );
        if (!shouldRetry) {
          throw error;
        }
        cycleState.attempts += 1;
      }
    }
  }

  // Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
  private initializeAttemptRuntimeState(): AttemptRuntimeState {
    return {
      attemptMessageIds: new Set<number>(),
      runningToolCalls: new Map<string, RunningToolState>(),
      pendingToolCall: null,
      sequence: 0,
      currentSegment: { id: null, reasoning: '', text: '', order: null },
      pendingReasoningDelta: '',
      pendingTextDelta: '',
      pendingFirstType: null,
      lastFlushAt: 0,
      flushTimer: null,
      pendingToolCallFlushTimer: null,
      finalLlmMessageId: null,
      toolCallsInCurrentStep: 0,
      sawAnyToolCall: false,
      finalAnswerCall: null,
      finalAnswerOrder: null,
      meaningfulChunkSeen: false,
      titleParser: new AgentTitleCommentParser(),
      sawTextChunk: false,
    };
  }

  // Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
  private async runProviderAttempt(
    context: StreamingCallContext,
    agentId: string,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void,
    cycleState: AttemptCycleState,
    attemptState: AttemptRuntimeState,
    attemptId: number
  ): Promise<StreamProcessingResult> {
    const chatMessagesForAttempt = this.buildRetryChatMessages(
      context.chatMessages,
      cycleState.validationFeedback
    );
    const output = await context.llmProvider.chat(
      chatMessagesForAttempt,
      context.options,
      (chunk) => {
        this.handleStreamChunk(
          chunk,
          context,
          agentId,
          signal,
          attemptState,
          cycleState.runId,
          attemptId,
          setLastLlmMessageId
        );
      }
    );

    this.flushPendingToolCall(
      context,
      agentId,
      cycleState.runId,
      attemptId,
      setLastLlmMessageId,
      attemptState
    );

    return this.finalizeAttemptResult(
      output,
      context,
      agentId,
      signal,
      cycleState,
      attemptState,
      setLastLlmMessageId,
      attemptId
    );
  }

  // Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
  private handleStreamChunk(
    chunk: ChatChunk,
    context: StreamingCallContext,
    agentId: string,
    signal: AbortSignal | undefined,
    state: AttemptRuntimeState,
    runId: string,
    attemptId: number,
    setLastLlmMessageId: (messageId: number) => void
  ): void {
    if (signal?.aborted) {
      return;
    }

    if (chunk.type === 'reasoning') {
      if (!chunk.delta) {
        return;
      }
      state.meaningfulChunkSeen = true;
      state.currentSegment.reasoning += chunk.delta;
      if (!state.pendingFirstType) {
        state.pendingFirstType = 'reasoning';
      }
      state.pendingReasoningDelta += chunk.delta;
      this.scheduleLlmFlush(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      if (state.pendingToolCall) {
        this.schedulePendingToolCallFlush(
          context,
          agentId,
          runId,
          attemptId,
          setLastLlmMessageId,
          state
        );
      }
      return;
    }

    if (chunk.type === 'text') {
      if (!chunk.delta) {
        return;
      }
      state.sawTextChunk = true;
      state.meaningfulChunkSeen = true;
      state.titleParser.ingest(chunk.delta);
      if (state.pendingToolCall) {
        this.flushPendingToolCall(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      }
      state.currentSegment.text += chunk.delta;
      if (!state.pendingFirstType) {
        state.pendingFirstType = 'text';
      }
      state.pendingTextDelta += chunk.delta;
      this.scheduleLlmFlush(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      return;
    }

    if (chunk.type === 'tool_call') {
      state.meaningfulChunkSeen = true;
      this.scheduleLlmFlush(context, agentId, runId, attemptId, setLastLlmMessageId, state, true);
      state.sawAnyToolCall = true;
      state.toolCallsInCurrentStep += 1;
      if (state.toolCallsInCurrentStep > 1) {
        throw new InvalidToolArgumentsError(
          'Model returned more than one tool_call in a single response'
        );
      }

      this.validateToolCallArguments(chunk.toolName, chunk.arguments);

      if (chunk.toolName === 'final_answer') {
        state.finalAnswerCall = {
          callId: chunk.callId,
          args: this.normalizeFinalAnswerArguments(chunk.arguments),
        };
        return;
      }

      state.pendingToolCall = {
        callId: chunk.callId,
        toolName: chunk.toolName,
        args: chunk.arguments,
      };
      this.schedulePendingToolCallFlush(
        context,
        agentId,
        runId,
        attemptId,
        setLastLlmMessageId,
        state
      );
      return;
    }

    if (chunk.type === 'tool_result') {
      state.meaningfulChunkSeen = true;
      this.scheduleLlmFlush(context, agentId, runId, attemptId, setLastLlmMessageId, state, true);
      state.toolCallsInCurrentStep = 0;
      if (state.pendingToolCall && state.pendingToolCall.callId === chunk.callId) {
        this.flushPendingToolCall(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      }
      const running = state.runningToolCalls.get(chunk.callId);
      if (!running) {
        return;
      }

      const payloadData: Record<string, unknown> = {
        callId: running.callId,
        toolName: running.toolName,
        arguments: running.args,
      };
      const terminalOutput = this.normalizeToolOutputPayload(
        running.toolName,
        chunk.status,
        chunk.output
      );
      const finishedAt = new Date().toISOString();
      const terminalPayload = buildTerminalToolPayload(
        payloadData,
        terminalOutput,
        running.startedAt,
        finishedAt
      );
      this.messageManager.update(running.messageId, agentId, terminalPayload, true);
      state.runningToolCalls.delete(chunk.callId);
      return;
    }

    if (chunk.type === 'turn_error') {
      throw new Error(chunk.message);
    }
  }

  // Requirements: llm-integration.1.6.4, llm-integration.2.3.1
  private clearFlushTimer(state: AttemptRuntimeState): void {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
  }

  // Requirements: llm-integration.1.6.4, llm-integration.2.3.1
  private clearPendingToolCallFlushTimer(state: AttemptRuntimeState): void {
    if (state.pendingToolCallFlushTimer) {
      clearTimeout(state.pendingToolCallFlushTimer);
      state.pendingToolCallFlushTimer = null;
    }
  }

  // Requirements: llm-integration.1.5, llm-integration.1.6
  private nextOrder(
    runId: string,
    attemptId: number,
    state: AttemptRuntimeState
  ): MessageOrderMeta {
    return {
      runId,
      attemptId,
      sequence: ++state.sequence,
    };
  }

  // Requirements: llm-integration.1.6.4, llm-integration.2.3.1, llm-integration.2.5.1
  private flushBufferedLlmSegment(
    context: StreamingCallContext,
    agentId: string,
    runId: string,
    attemptId: number,
    setLastLlmMessageId: (messageId: number) => void,
    state: AttemptRuntimeState
  ): void {
    if (!state.pendingReasoningDelta && !state.pendingTextDelta) {
      return;
    }

    state.currentSegment.id = this.upsertLlmSegment(
      state.currentSegment,
      agentId,
      context.replyToMessageId,
      context.options.model,
      () => this.nextOrder(runId, attemptId, state),
      setLastLlmMessageId,
      state.attemptMessageIds
    );

    const emitReasoning = (): void => {
      if (!state.pendingReasoningDelta) return;
      MainEventBus.getInstance().publish(
        new MessageLlmReasoningUpdatedEvent(
          state.currentSegment.id as number,
          agentId,
          state.pendingReasoningDelta,
          state.currentSegment.reasoning
        )
      );
    };
    const emitText = (): void => {
      if (!state.pendingTextDelta) return;
      MainEventBus.getInstance().publish(
        new MessageLlmTextUpdatedEvent(
          state.currentSegment.id as number,
          agentId,
          state.pendingTextDelta,
          state.currentSegment.text
        )
      );
    };

    if (state.pendingFirstType === 'text') {
      emitText();
      emitReasoning();
    } else {
      emitReasoning();
      emitText();
    }

    state.pendingReasoningDelta = '';
    state.pendingTextDelta = '';
    state.pendingFirstType = null;
    state.lastFlushAt = Date.now();
  }

  // Requirements: llm-integration.1.6.4, llm-integration.2.3.1
  private scheduleLlmFlush(
    context: StreamingCallContext,
    agentId: string,
    runId: string,
    attemptId: number,
    setLastLlmMessageId: (messageId: number) => void,
    state: AttemptRuntimeState,
    force: boolean = false
  ): void {
    if (!state.pendingReasoningDelta && !state.pendingTextDelta) {
      return;
    }

    if (force) {
      this.clearFlushTimer(state);
      this.flushBufferedLlmSegment(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      return;
    }

    const now = Date.now();
    const elapsedSinceLastFlush = now - state.lastFlushAt;
    if (state.lastFlushAt === 0 || elapsedSinceLastFlush >= STREAM_FLUSH_INTERVAL_MS) {
      this.clearFlushTimer(state);
      this.flushBufferedLlmSegment(context, agentId, runId, attemptId, setLastLlmMessageId, state);
      return;
    }

    if (!state.flushTimer) {
      const delayMs = STREAM_FLUSH_INTERVAL_MS - elapsedSinceLastFlush;
      state.flushTimer = setTimeout(
        () => {
          state.flushTimer = null;
          this.flushBufferedLlmSegment(
            context,
            agentId,
            runId,
            attemptId,
            setLastLlmMessageId,
            state
          );
        },
        Math.max(1, delayMs)
      );
    }
  }

  // Requirements: llm-integration.11.1.2, llm-integration.11.1.5
  private flushPendingToolCall(
    context: StreamingCallContext,
    agentId: string,
    runId: string,
    attemptId: number,
    setLastLlmMessageId: (messageId: number) => void,
    state: AttemptRuntimeState
  ): void {
    this.clearPendingToolCallFlushTimer(state);
    this.scheduleLlmFlush(context, agentId, runId, attemptId, setLastLlmMessageId, state, true);
    if (!state.pendingToolCall) {
      return;
    }

    state.finalLlmMessageId = this.finalizeLlmSegmentIfNonEmpty(
      state.currentSegment,
      agentId,
      context.options.model
    );
    if (state.finalLlmMessageId !== null) {
      setLastLlmMessageId(state.finalLlmMessageId);
    }
    state.currentSegment = { id: null, reasoning: '', text: '', order: null };
    state.pendingReasoningDelta = '';
    state.pendingTextDelta = '';
    state.pendingFirstType = null;
    state.lastFlushAt = 0;
    this.clearFlushTimer(state);

    const payloadData: Record<string, unknown> = {
      callId: state.pendingToolCall.callId,
      toolName: state.pendingToolCall.toolName,
      arguments: state.pendingToolCall.args,
      order: this.nextOrder(runId, attemptId, state),
    };
    const startedAt = new Date().toISOString();
    const runningPayload = buildRunningToolPayload(payloadData, startedAt);
    const runningMessage = this.messageManager.create(
      agentId,
      'tool_call',
      runningPayload,
      context.replyToMessageId,
      false
    );
    state.attemptMessageIds.add(runningMessage.id);
    state.runningToolCalls.set(state.pendingToolCall.callId, {
      messageId: runningMessage.id,
      callId: state.pendingToolCall.callId,
      toolName: state.pendingToolCall.toolName,
      args: state.pendingToolCall.args,
      startedAt,
    });
    state.pendingToolCall = null;
  }

  // Requirements: llm-integration.1.6.4, llm-integration.2.3.1
  private schedulePendingToolCallFlush(
    context: StreamingCallContext,
    agentId: string,
    runId: string,
    attemptId: number,
    setLastLlmMessageId: (messageId: number) => void,
    state: AttemptRuntimeState
  ): void {
    if (!state.pendingToolCall) {
      return;
    }
    this.clearPendingToolCallFlushTimer(state);
    state.pendingToolCallFlushTimer = setTimeout(() => {
      state.pendingToolCallFlushTimer = null;
      this.flushPendingToolCall(context, agentId, runId, attemptId, setLastLlmMessageId, state);
    }, STREAM_FLUSH_INTERVAL_MS);
  }

  // Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
  private finalizeAttemptResult(
    output: LLMChatResult,
    context: StreamingCallContext,
    agentId: string,
    signal: AbortSignal | undefined,
    cycleState: AttemptCycleState,
    state: AttemptRuntimeState,
    setLastLlmMessageId: (messageId: number) => void,
    attemptId: number
  ): StreamProcessingResult {
    if (!state.sawTextChunk && typeof output.text === 'string' && output.text.length > 0) {
      state.titleParser.ingest(output.text);
    }
    state.titleParser.finalize();
    const titleCandidate = state.titleParser.getCandidate();

    if (
      state.currentSegment.id !== null &&
      !state.currentSegment.text &&
      typeof output.text === 'string' &&
      output.text.length > 0
    ) {
      state.currentSegment.text = output.text;
    }

    const finalizedSegmentId = this.finalizeLlmSegmentIfNonEmpty(
      state.currentSegment,
      agentId,
      context.options.model
    );
    if (finalizedSegmentId !== null) {
      state.finalLlmMessageId = finalizedSegmentId;
      setLastLlmMessageId(finalizedSegmentId);
    } else if (typeof output.text === 'string' && output.text.trim().length > 0) {
      const msg = this.createCompletedLlmMessage(
        agentId,
        context.replyToMessageId,
        context.options.model,
        output.text,
        this.nextOrder(cycleState.runId, attemptId, state)
      );
      state.attemptMessageIds.add(msg.id);
      state.finalLlmMessageId = msg.id;
      setLastLlmMessageId(msg.id);
    }

    if (state.finalAnswerCall) {
      state.finalAnswerOrder = this.nextOrder(cycleState.runId, attemptId, state);
    }

    if (signal?.aborted) {
      return {
        output,
        finalLlmMessageId: state.finalLlmMessageId,
        activeLlmMessageId: state.currentSegment.id,
        finalAnswerCall: state.finalAnswerCall,
        finalAnswerOrder: state.finalAnswerOrder,
        titleCandidate,
      };
    }

    if (state.finalLlmMessageId === null && !state.finalAnswerCall && !state.sawAnyToolCall) {
      throw new InvalidFinalAnswerContractError(
        'Model returned no assistant text and no completion tool call'
      );
    }
    if (cycleState.invalidFinalAnswerSeen && !state.finalAnswerCall) {
      throw new InvalidFinalAnswerContractError(
        'Model did not return final_answer after invalid completion retry. Please try again later.'
      );
    }

    return {
      output,
      finalLlmMessageId: state.finalLlmMessageId,
      activeLlmMessageId: state.currentSegment.id,
      finalAnswerCall: state.finalAnswerCall,
      finalAnswerOrder: state.finalAnswerOrder,
      titleCandidate,
    };
  }

  // Requirements: llm-integration.11.3.1, llm-integration.11.1.5
  private handleAttemptFailure(
    error: unknown,
    context: StreamingCallContext,
    agentId: string,
    signal: AbortSignal | undefined,
    cycleState: AttemptCycleState,
    state: AttemptRuntimeState,
    setLastLlmMessageId: (messageId: number) => void
  ): boolean {
    this.clearPendingToolCallFlushTimer(state);
    const isInvalidFinalAnswer =
      error instanceof InvalidFinalAnswerContractError ||
      error instanceof InvalidToolArgumentsError;
    if (!isInvalidFinalAnswer) {
      this.flushPendingToolCall(
        context,
        agentId,
        cycleState.runId,
        cycleState.attempts + 1,
        setLastLlmMessageId,
        state
      );
    }
    if (isInvalidFinalAnswer) {
      cycleState.invalidFinalAnswerSeen = Boolean(state.finalAnswerCall);
      cycleState.validationFeedback =
        error instanceof Error ? error.message : 'Invalid tool call arguments.';
    }
    const shouldRetryInvalidFinalAnswer =
      isInvalidFinalAnswer &&
      cycleState.attempts < MAX_INVALID_TOOL_CALL_RETRIES &&
      !signal?.aborted;
    const shouldRetrySilentFailure =
      !isInvalidFinalAnswer &&
      cycleState.attempts < 1 &&
      !state.meaningfulChunkSeen &&
      !signal?.aborted;
    const shouldRetry = shouldRetryInvalidFinalAnswer || shouldRetrySilentFailure;

    if (!shouldRetry) {
      if (isInvalidFinalAnswer) {
        throw new InvalidToolCallRetryExhaustedError();
      }
      throw error;
    }

    for (const messageId of state.attemptMessageIds) {
      this.messageManager.setHidden(messageId, agentId);
    }
    return true;
  }

  // Requirements: llm-integration.11.2.3, llm-integration.11.2.3.1, llm-integration.11.2.3.3
  private buildRetryChatMessages(
    baseChatMessages: ReturnType<PromptBuilder['buildMessages']>,
    validationFeedback: string | null
  ): ReturnType<PromptBuilder['buildMessages']> {
    if (!validationFeedback) {
      return baseChatMessages;
    }

    return [
      ...baseChatMessages,
      {
        role: 'system',
        content: `Tool call validation failed: ${validationFeedback}. Regenerate tool call with valid arguments and continue.`,
      },
    ];
  }

  /**
   * Apply valid title candidate through AgentManager update path.
   * Requirements: llm-integration.16.8, llm-integration.16.9, llm-integration.16.10, llm-integration.16.11, llm-integration.16.12
   */
  private applyAutoTitleCandidate(agentId: string, candidate: string | null): void {
    if (!candidate || !this.agentTitleUpdater) {
      return;
    }

    try {
      const normalizedCandidate = normalizeAgentTitleCandidate(candidate);
      if (!normalizedCandidate) {
        this.logger.debug(`Auto-title skipped for agent ${agentId}: invalid candidate`);
        return;
      }

      const currentTitle = this.agentTitleUpdater.getCurrentTitle(agentId);
      if (!currentTitle) {
        return;
      }

      const userTurn = this.getUserTurnCount(agentId);
      const guardDecision = evaluateAgentTitleGuards({
        currentTitle,
        nextTitle: normalizedCandidate,
        currentUserTurn: userTurn,
        lastRenameUserTurn: this.lastTitleRenameTurnByAgent.get(agentId) ?? null,
      });
      if (!guardDecision.allow) {
        this.logger.debug(
          `Auto-title skipped for agent ${agentId}: reason=${guardDecision.reason} similarity=${guardDecision.similarity}`
        );
        return;
      }

      this.agentTitleUpdater.rename(agentId, normalizedCandidate);
      this.lastTitleRenameTurnByAgent.set(agentId, userTurn);
    } catch (error) {
      this.logger.warn(
        `Auto-title failed for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Calculate current user turn number for cooldown guard.
   * Requirements: llm-integration.16.10
   */
  private getUserTurnCount(agentId: string): number {
    return this.messageManager
      .list(agentId)
      .filter((message) => message.kind === 'user' && !message.hidden).length;
  }

  private validateToolCallArguments(toolName: string, args: Record<string, unknown>): void {
    if (toolName === 'code_exec') {
      const validated = validateCodeExecInput(args);
      if (!validated.ok) {
        throw new InvalidToolArgumentsError(
          validated.error?.message ?? 'Invalid code_exec arguments.'
        );
      }
      return;
    }

    if (toolName !== 'final_answer') {
      return;
    }

    const summaryPoints = args['summary_points'];
    if (!Array.isArray(summaryPoints)) {
      throw new InvalidFinalAnswerContractError('final_answer.summary_points is required');
    }

    if (summaryPoints.length < 1 || summaryPoints.length > 10) {
      throw new InvalidFinalAnswerContractError(
        'final_answer.summary_points must contain from 1 to 10 items'
      );
    }

    for (const point of summaryPoints) {
      if (typeof point !== 'string') {
        throw new InvalidFinalAnswerContractError(
          'final_answer.summary_points items must be strings'
        );
      }
      if (point.length > 200) {
        throw new InvalidFinalAnswerContractError(
          'final_answer.summary_points item length must be <= 200'
        );
      }
    }
  }

  private persistFinalAnswerToolCall(
    agentId: string,
    replyToMessageId: number,
    callId: string,
    args: Record<string, unknown>,
    order: MessageOrderMeta | null
  ): void {
    this.messageManager.create(
      agentId,
      'tool_call',
      {
        data: {
          callId,
          toolName: 'final_answer',
          arguments: this.normalizeFinalAnswerArguments(args),
          order: order ?? undefined,
        },
      },
      replyToMessageId,
      true
    );
  }

  private normalizeToolOutputPayload(
    toolName: string,
    status: 'success' | 'error' | 'timeout' | 'cancelled',
    output: unknown
  ): Record<string, unknown> {
    if (toolName === 'code_exec') {
      const normalized = normalizeCodeExecOutput(output);
      if (status === 'cancelled') {
        return { ...normalized, status: 'cancelled' };
      }
      if (status === 'timeout') {
        return {
          ...normalized,
          status: 'timeout',
          error:
            normalized.error ??
            makeCodeExecError('limit_exceeded', 'code_exec timeout limit exceeded.').error,
        };
      }
      if (status === 'error' && !normalized.error) {
        return {
          ...normalized,
          status: 'error',
          error: makeCodeExecError('internal_error', 'code_exec failed.').error,
        };
      }
      return { ...normalized } as Record<string, unknown>;
    }

    const safeOutput = output ?? `Tool "${toolName}" is not available.`;
    return {
      status,
      content: this.stringifyToolOutput(safeOutput),
    };
  }

  /**
   * Convert tool output payload to stable text for persisted message payload.
   * Requirements: llm-integration.11.2
   */
  private stringifyToolOutput(output: unknown): string {
    if (typeof output === 'string') {
      return output;
    }
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }

  /**
   * Normalize final_answer tool arguments for persisted runtime contract.
   * Requirements: llm-integration.9.5.1
   */
  private normalizeFinalAnswerArguments(args: Record<string, unknown>): Record<string, unknown> {
    return { ...args };
  }

  /**
   * Upsert in-flight llm message during streaming.
   * Requirements: llm-integration.1.5, llm-integration.1.6
   */
  private upsertLlmSegment(
    segment: LlmSegmentState,
    agentId: string,
    replyToMessageId: number,
    model: string,
    nextOrder: () => MessageOrderMeta,
    setLastLlmMessageId: (messageId: number) => void,
    attemptMessageIds: Set<number>
  ): number {
    if (!segment.order) {
      segment.order = nextOrder();
    }

    const streamingPayload = {
      data: {
        model,
        reasoning: segment.reasoning
          ? { text: segment.reasoning, excluded_from_replay: true }
          : undefined,
        text: segment.text || undefined,
        order: segment.order,
      },
    };

    if (segment.id === null) {
      const llmMsg = this.messageManager.create(
        agentId,
        'llm',
        streamingPayload,
        replyToMessageId,
        false
      );
      attemptMessageIds.add(llmMsg.id);
      setLastLlmMessageId(llmMsg.id);
      return llmMsg.id;
    }

    this.messageManager.update(segment.id, agentId, streamingPayload, false);
    return segment.id;
  }

  private finalizeLlmSegmentIfNonEmpty(
    segment: LlmSegmentState,
    agentId: string,
    model: string
  ): number | null {
    if (segment.id === null) {
      return null;
    }

    const hasReasoning = segment.reasoning.trim().length > 0;
    const hasText = segment.text.trim().length > 0;
    if (!hasReasoning && !hasText) {
      return null;
    }

    this.messageManager.update(
      segment.id,
      agentId,
      {
        data: {
          model,
          reasoning: segment.reasoning
            ? { text: segment.reasoning, excluded_from_replay: true }
            : undefined,
          text: segment.text || undefined,
          order: segment.order ?? undefined,
        },
      },
      true
    );
    return segment.id;
  }

  private createCompletedLlmMessage(
    agentId: string,
    replyToMessageId: number,
    model: string,
    text: string,
    order: MessageOrderMeta
  ): { id: number } {
    return this.messageManager.create(
      agentId,
      'llm',
      {
        data: {
          model,
          text,
          order,
        },
      },
      replyToMessageId,
      true
    );
  }

  /**
   * Handle cancellation after streaming finishes.
   * Requirements: llm-integration.8.5, llm-integration.8.7
   */
  private handleAbortAfterStreaming(
    llmMessageId: number | null,
    agentId: string,
    clearLastLlmMessageId: () => void
  ): void {
    if (llmMessageId !== null) {
      this.hideIncompleteLlmMessage(llmMessageId, agentId);
      clearLastLlmMessageId();
    }
  }

  /**
   * Persist usage envelope in a dedicated DB column as separate step.
   * Requirements: llm-integration.13
   */
  private persistUsageEnvelope(messageId: number, agentId: string, output: LLMChatResult): void {
    if (!output.usage) {
      return;
    }

    try {
      this.messageManager.setUsage(messageId, agentId, output.usage);
    } catch (error) {
      handleBackgroundError(error, 'Message Usage Persistence');
    }
  }

  /**
   * Handle errors outside the retry loop.
   * Requirements: llm-integration.3, llm-integration.8.7, realtime-events.4.8
   */
  private handleRunError(
    error: unknown,
    agentId: string,
    userMessageId: number,
    signal: AbortSignal | undefined,
    lastLlmMessageId: number | null
  ): void {
    if (error instanceof InvalidToolCallRetryExhaustedError) {
      if (lastLlmMessageId !== null) {
        try {
          this.hideIncompleteLlmMessage(lastLlmMessageId, agentId);
        } catch {
          // ignore update errors during terminal retry-exhaustion handling
        }
      }
      this.finalizePendingToolCallsForTurn(agentId, userMessageId, error.message);
      this.messageManager.create(
        agentId,
        'error',
        {
          data: {
            error: {
              type: 'provider',
              message: error.message,
            },
          },
        },
        userMessageId,
        true
      );
      return;
    }

    const errorName = error instanceof Error ? error.name : typeof error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const signalAborted = signal?.aborted ?? false;
    const normalizedError = normalizeLLMError(error);
    const errorType = normalizedError.type;

    this.logger.warn(
      `Pipeline failure diagnostics: agentId=${agentId}, userMessageId=${userMessageId}, signalAborted=${
        signalAborted
      }, errorName=${errorName}, errorMessage=${errorMessage}`
    );
    MainEventBus.getInstance().publish(
      new LLMPipelineDiagnosticEvent(
        signalAborted ? 'warn' : 'error',
        'MainPipeline',
        `Pipeline failure diagnostics: ${errorMessage}`,
        {
          agentId,
          userMessageId,
          signalAborted,
          errorName,
          errorType,
        }
      )
    );

    if (signalAborted) {
      this.finalizePendingToolCallsForTurn(agentId, userMessageId, 'Request cancelled.');
      if (lastLlmMessageId !== null) {
        try {
          this.hideIncompleteLlmMessage(lastLlmMessageId, agentId);
        } catch {
          // ignore update errors during cancellation
        }
      }
      return;
    }

    this.logger.error(`Pipeline error for agent ${agentId}: ${errorMessage}`);

    if (lastLlmMessageId !== null) {
      try {
        this.hideIncompleteLlmMessage(lastLlmMessageId, agentId);
      } catch {
        // ignore
      }
    }
    this.finalizePendingToolCallsForTurn(agentId, userMessageId, normalizedError.message);

    const errorReplyTo = userMessageId;

    if (errorType === 'rate_limit') {
      const retryAfterSeconds = normalizedError.retryAfterSeconds ?? 10;
      MainEventBus.getInstance().publish(
        new AgentRateLimitEvent(agentId, userMessageId, retryAfterSeconds)
      );
      return;
    }

    const errorPayload: Record<string, unknown> = {
      type: errorType,
      message: normalizedError.message,
    };
    if (errorType === 'auth') {
      errorPayload['action_link'] = { label: 'Open Settings', screen: 'settings' };
    }

    this.messageManager.create(
      agentId,
      'error',
      {
        data: {
          error: errorPayload,
        },
      },
      errorReplyTo,
      true
    );
  }

  /**
   * Finalize pending tool_call rows for the current user turn so UI does not keep stale in-progress blocks.
   * Requirements: llm-integration.11.2, llm-integration.11.3
   */
  private finalizePendingToolCallsForTurn(
    agentId: string,
    userMessageId: number,
    errorText: string
  ): void {
    const allVisible = this.messageManager.list(agentId);
    const pendingForTurn = allVisible.filter(
      (msg) =>
        msg.kind === 'tool_call' &&
        !msg.done &&
        !msg.hidden &&
        (msg.replyToMessageId ?? null) === userMessageId
    );

    for (const message of pendingForTurn) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(message.payloadJson) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      const data =
        payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? (payload.data as Record<string, unknown>)
          : {};
      const toolName = typeof data.toolName === 'string' ? data.toolName : '';
      const cancelled = errorText === 'Request cancelled.';
      if (toolName === 'code_exec') {
        data.output = cancelled
          ? {
              status: 'cancelled',
              stdout: '',
              stderr: '',
              stdout_truncated: false,
              stderr_truncated: false,
            }
          : {
              status: 'error',
              stdout: '',
              stderr: '',
              stdout_truncated: false,
              stderr_truncated: false,
              error: { code: 'internal_error', message: errorText },
            };
      } else {
        data.output = {
          status: cancelled ? 'cancelled' : 'error',
          content: errorText,
        };
      }

      this.messageManager.update(
        message.id,
        agentId,
        {
          ...payload,
          data,
        },
        true
      );
    }
  }

  /**
   * Resolve model and reasoning effort for a given provider.
   * Uses test config when NODE_ENV=test, prod config otherwise.
   * Requirements: llm-integration.5.1, llm-integration.5.8
   */
  private resolveOptions(provider: LLMProvider): ChatOptions {
    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    return LLM_CHAT_MODELS[provider]?.[env] ?? LLM_CHAT_MODELS.openai[env];
  }

  /**
   * Bind runtime tool executors to tool definitions for AI SDK native tool-loop.
   * Requirements: llm-integration.11.4, llm-integration.11.5
   */
  private bindToolExecutors(
    tools: NonNullable<ChatOptions['tools']>
  ): NonNullable<ChatOptions['tools']> {
    const runLimited = this.createConcurrencyLimiter(3);
    return tools.map((toolDef) => ({
      ...toolDef,
      execute: async (args: Record<string, unknown>, executeOptions?: unknown) =>
        runLimited(async () => {
          const abortSignal = this.extractToolAbortSignal(executeOptions);
          const toolCallId = this.extractToolCallId(executeOptions);
          if (toolDef.execute) {
            return toolDef.execute(args, abortSignal);
          }

          const [result] = await this.toolExecutor.executeBatch(
            [
              {
                callId: toolCallId ?? `call-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                toolName: toolDef.name,
                arguments: args,
              },
            ],
            abortSignal
          );

          if (!result) {
            throw new Error(`Tool "${toolDef.name}" returned no result.`);
          }

          if (result.status === 'success') {
            return { status: 'success', content: result.output };
          }

          throw new Error(result.output);
        }),
    }));
  }

  private extractToolAbortSignal(executeOptions: unknown): AbortSignal | undefined {
    if (executeOptions && typeof executeOptions === 'object' && 'abortSignal' in executeOptions) {
      const candidate = (executeOptions as { abortSignal?: unknown }).abortSignal;
      if (
        candidate &&
        typeof candidate === 'object' &&
        'addEventListener' in candidate &&
        typeof (candidate as { addEventListener?: unknown }).addEventListener === 'function'
      ) {
        return candidate as AbortSignal;
      }
    }

    if (
      executeOptions &&
      typeof executeOptions === 'object' &&
      'addEventListener' in executeOptions &&
      typeof (executeOptions as { addEventListener?: unknown }).addEventListener === 'function'
    ) {
      return executeOptions as AbortSignal;
    }

    return undefined;
  }

  private extractToolCallId(executeOptions: unknown): string | undefined {
    if (executeOptions && typeof executeOptions === 'object' && 'toolCallId' in executeOptions) {
      const candidate = (executeOptions as { toolCallId?: unknown }).toolCallId;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return undefined;
  }

  private createConcurrencyLimiter(limit: number): <T>(job: () => Promise<T>) => Promise<T> {
    let active = 0;
    const queue: Array<() => void> = [];

    const release = (): void => {
      active = Math.max(0, active - 1);
      const next = queue.shift();
      if (next) {
        next();
      }
    };

    return async <T>(job: () => Promise<T>): Promise<T> => {
      if (active >= limit) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active += 1;
      try {
        return await job();
      } finally {
        release();
      }
    };
  }

  private publishStepDiagnostics(
    agentId: string,
    userMessageId: number,
    output: LLMChatResult
  ): void {
    if (!output.stepDiagnostics || output.stepDiagnostics.length === 0) {
      return;
    }

    for (const step of output.stepDiagnostics) {
      MainEventBus.getInstance().publish(
        new LLMPipelineDiagnosticEvent(
          'warn',
          'MainPipeline',
          `Step diagnostic: step=${step.stepIndex} finishReason=${step.finishReason ?? 'unknown'} toolCalls=${step.toolCallsCount} toolResults=${step.toolResultsCount} latencyMs=${step.latencyMs ?? 0}`,
          {
            agentId,
            userMessageId,
            signalAborted: false,
            errorName: 'StepDiagnostic',
            errorType: 'provider',
          }
        )
      );
    }
  }

  /**
   * Hide interrupted llm message and keep it in unfinished state.
   * Requirements: llm-integration.3.2
   */
  private hideIncompleteLlmMessage(messageId: number, agentId: string): void {
    this.messageManager.hideAndMarkIncomplete(messageId, agentId);
  }
}
