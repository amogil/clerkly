// Requirements: llm-integration.5
// src/main/agents/MainPipeline.ts
// Orchestrates the LLM request/response cycle for a single agent message

import { MessageManager } from './MessageManager';
import {
  PromptBuilder,
  buildAutoTitleMetadataContractPrompt,
  CodeExecFeature,
} from './PromptBuilder';
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
import type {
  ILLMProvider,
  ChatChunk,
  ChatOptions,
  LLMChatResult,
  ChatMessage,
} from '../llm/ILLMProvider';
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
  parseAgentTitleMetadataPayload,
  type AgentTitleMetadata,
  isValidRenameNeedScore,
  TITLE_META_COMMENT_PREFIX,
  TITLE_RENAME_MIN_USER_TURN_GAP,
} from './AgentTitleRuntime';
import type { Message } from '../db/schema';
import { DEFAULT_AGENT_TITLE } from '../../shared/constants/agents';

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
  finalLlmPayload: Record<string, unknown> | null;
  activeLlmMessageId: number | null;
  finalAnswerCall: { callId: string; args: Record<string, unknown> } | null;
  finalAnswerOrder: MessageOrderMeta | null;
  titleMetadata: AgentTitleMetadata | null;
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
  private autoTitleHistoryCache = new Map<
    string,
    { lastProcessedMessageId: number; lastRenameUserTurn: number | null }
  >();

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

  // Requirements: llm-integration.16.10
  clearAutoTitleCache(agentId: string): void {
    this.autoTitleHistoryCache.delete(agentId);
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
    historyMessages: Message[];
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
    const autoTitleInstruction = this.buildAutoTitleSystemInstruction(agentId, messages);
    const baseChatMessages = this.injectSystemMessage(
      this.promptBuilder.buildMessages(messages, provider),
      autoTitleInstruction
    );
    this.injectFeatureCredentials(provider, apiKey);
    const builtPrompt = this.promptBuilder.build(provider);
    const replyToMessageId = userMessageId;
    const options = {
      ...this.resolveOptions(provider),
      tools: this.bindToolExecutors(builtPrompt.tools, signal),
    };
    const llmProvider = this.createProvider(provider, apiKey);

    return {
      provider,
      apiKey,
      historyMessages: messages,
      baseChatMessages,
      options,
      replyToMessageId,
      llmProvider,
    };
  }

  /**
   * Execute a single provider request with streaming updates.
   * Requirements: llm-integration.1, llm-integration.2, llm-integration.5
   */
  private async executeWithRetries(
    context: {
      historyMessages: Message[];
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
      if (!streamResult.finalAnswerOrder) {
        throw new InvalidFinalAnswerContractError(
          'Missing order metadata for final_answer tool_call'
        );
      }
      this.persistFinalAnswerToolCall(
        agentId,
        context.replyToMessageId,
        streamResult.finalAnswerCall.callId,
        streamResult.finalAnswerCall.args,
        streamResult.finalAnswerOrder
      );
    }
    const messagesForAutoTitle = this.extendHistorySnapshotWithFinalLlm(
      context.historyMessages,
      agentId,
      context.replyToMessageId,
      streamResult.finalLlmMessageId,
      streamResult.finalLlmPayload
    );
    this.applyAutoTitleCandidate(
      agentId,
      streamResult.titleMetadata,
      streamResult.finalLlmMessageId,
      streamResult.finalLlmPayload,
      messagesForAutoTitle
    );
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
      },
      signal
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
      if (this.shouldDeferToolPayloadTextFlush(state)) {
        return;
      }
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
      this.flushPendingToolCall(context, agentId, runId, attemptId, setLastLlmMessageId, state);
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
    };
    const toolOrder = this.nextOrder(runId, attemptId, state);
    const startedAt = new Date().toISOString();
    const runningPayload = buildRunningToolPayload(payloadData, startedAt);
    const runningMessage = this.messageManager.createWithOrder(
      agentId,
      'tool_call',
      runningPayload,
      context.replyToMessageId,
      toolOrder,
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
    const outputText = typeof output.text === 'string' ? output.text : '';
    const rawToolPayloadCandidateText =
      outputText.trim().length > 0 ? outputText : state.currentSegment.text;
    const toolPayloadCandidateText = this.stripLeadingDuplicateToolPayloadText(
      this.stripLeadingMirroredToolPayloadText(rawToolPayloadCandidateText, state),
      state
    );
    if (state.currentSegment.text) {
      state.currentSegment.text = this.stripLeadingDuplicateToolPayloadText(
        this.stripLeadingMirroredToolPayloadText(state.currentSegment.text, state),
        state
      );
    }
    const suppressDuplicateToolPayloadText =
      this.shouldSuppressTechnicalToolPayloadText(toolPayloadCandidateText, state) ||
      toolPayloadCandidateText.trim().length === 0;
    if (suppressDuplicateToolPayloadText && state.currentSegment.id !== null) {
      this.hideIncompleteLlmMessage(state.currentSegment.id, agentId);
      state.currentSegment = { id: null, reasoning: '', text: '', order: null };
    }

    if (!state.sawTextChunk && outputText.length > 0) {
      state.titleParser.ingest(outputText);
    }
    state.titleParser.finalize();
    const titleMetadata = parseAgentTitleMetadataPayload(state.titleParser.getCandidate());

    if (
      state.currentSegment.id !== null &&
      !state.currentSegment.text &&
      outputText.length > 0 &&
      !suppressDuplicateToolPayloadText
    ) {
      state.currentSegment.text = outputText;
    }

    let finalLlmPayload: Record<string, unknown> | null = null;
    const finalizedSegmentId = this.finalizeLlmSegmentIfNonEmpty(
      state.currentSegment,
      agentId,
      context.options.model
    );
    if (finalizedSegmentId !== null) {
      state.finalLlmMessageId = finalizedSegmentId;
      setLastLlmMessageId(finalizedSegmentId);
      finalLlmPayload = {
        data: {
          model: context.options.model,
          reasoning: state.currentSegment.reasoning
            ? { text: state.currentSegment.reasoning, excluded_from_replay: true }
            : undefined,
          text: state.currentSegment.text || undefined,
        },
      };
    } else if (toolPayloadCandidateText.trim().length > 0 && !suppressDuplicateToolPayloadText) {
      const fallbackOrder = this.nextOrder(cycleState.runId, attemptId, state);
      const msg = this.createCompletedLlmMessage(
        agentId,
        context.replyToMessageId,
        context.options.model,
        toolPayloadCandidateText,
        fallbackOrder
      );
      state.attemptMessageIds.add(msg.id);
      state.finalLlmMessageId = msg.id;
      setLastLlmMessageId(msg.id);
      finalLlmPayload = {
        data: {
          model: context.options.model,
          text: toolPayloadCandidateText,
        },
      };
    }

    if (state.finalAnswerCall) {
      state.finalAnswerOrder = this.nextOrder(cycleState.runId, attemptId, state);
    }

    if (signal?.aborted) {
      return {
        output,
        finalLlmMessageId: state.finalLlmMessageId,
        finalLlmPayload,
        activeLlmMessageId: state.currentSegment.id,
        finalAnswerCall: state.finalAnswerCall,
        finalAnswerOrder: state.finalAnswerOrder,
        titleMetadata,
      };
    }

    if (state.finalLlmMessageId === null && !state.finalAnswerCall && !state.sawAnyToolCall) {
      throw new InvalidFinalAnswerContractError(
        'Model returned no assistant text and no completion tool call'
      );
    }
    // Orphaned tool_call: model made a tool call (sawAnyToolCall) but returned no text
    // and no final_answer afterward. This happens when Vercel AI SDK (ai@5.1.5) silently
    // loses the abort error during multi-step tool loop — step N's TransformStream
    // controller closes before streamStep(N+1) can enqueue the error. The provider returns
    // { text: '' } as if the call succeeded.
    //
    // We use InvalidFinalAnswerContractError so that handleAttemptFailure retries the model
    // call (up to MAX_INVALID_TOOL_CALL_RETRIES). On retry, the pipeline resends the
    // conversation (including the tool result from the first attempt) and the model gets
    // another chance to respond. If all retries fail the same way, the user sees an error.
    // Requirements: llm-integration.11.5.4
    if (state.sawAnyToolCall && state.finalLlmMessageId === null && !state.finalAnswerCall) {
      throw new InvalidFinalAnswerContractError(
        'Model returned a tool call but provided no response after the tool result. Retrying.'
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
      finalLlmPayload,
      activeLlmMessageId: state.currentSegment.id,
      finalAnswerCall: state.finalAnswerCall,
      finalAnswerOrder: state.finalAnswerOrder,
      titleMetadata,
    };
  }

  // Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1
  private shouldSuppressTechnicalToolPayloadText(
    outputText: string,
    state: AttemptRuntimeState
  ): boolean {
    if (!state.sawAnyToolCall) {
      return false;
    }
    const parsedPayload = this.parseToolPayloadMirrorJson(outputText);
    if (!parsedPayload) {
      return false;
    }
    return this.isToolPayloadMirror(parsedPayload, state);
  }

  // Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1
  private shouldDeferToolPayloadTextFlush(state: AttemptRuntimeState): boolean {
    if (!state.sawAnyToolCall) {
      return false;
    }
    if (state.currentSegment.id !== null) {
      return false;
    }
    const trimmed = state.currentSegment.text.trimStart();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('```')) {
      return false;
    }

    const parsedPayload = this.parseToolPayloadMirrorJson(state.currentSegment.text);
    if (!parsedPayload) {
      return true;
    }
    return this.isToolPayloadMirror(parsedPayload, state);
  }

  // Requirements: llm-integration.9.5.6
  private parseToolPayloadMirrorJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const directParsed = this.parseJsonObject(trimmed);
    if (directParsed) {
      return directParsed;
    }

    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fencedMatch) {
      return null;
    }
    return this.parseJsonObject(fencedMatch[1] ?? '');
  }

  // Requirements: llm-integration.9.5.6
  private stripLeadingMirroredToolPayloadText(text: string, state: AttemptRuntimeState): string {
    if (!state.sawAnyToolCall) {
      return text;
    }
    const trimmedStart = text.trimStart();
    if (!trimmedStart) {
      return text;
    }

    const fencedPrefixMatch = trimmedStart.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedPrefixMatch) {
      const fencedParsed = this.parseJsonObject(fencedPrefixMatch[1] ?? '');
      if (fencedParsed && this.isToolPayloadMirror(fencedParsed, state)) {
        return trimmedStart.slice(fencedPrefixMatch[0].length).trimStart();
      }
    }

    if (!trimmedStart.startsWith('{')) {
      return text;
    }

    const extracted = this.extractLeadingJsonObject(trimmedStart);
    if (!extracted) {
      return text;
    }
    const parsedPrefix = this.parseJsonObject(extracted.objectText);
    if (!parsedPrefix || !this.isToolPayloadMirror(parsedPrefix, state)) {
      return text;
    }
    return extracted.rest.trimStart();
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6
  private stripLeadingDuplicateToolPayloadText(text: string, state: AttemptRuntimeState): string {
    if (!state.finalAnswerCall) {
      return text;
    }

    const summaryPoints = state.finalAnswerCall.args['summary_points'];
    if (!Array.isArray(summaryPoints) || summaryPoints.length === 0) {
      return text;
    }

    const expectedPoints = summaryPoints.filter(
      (point): point is string => typeof point === 'string'
    );

    const extracted = this.extractLeadingMarkdownList(text);
    if (extracted) {
      if (this.areNormalizedSummaryPointsEqual(extracted.items, expectedPoints)) {
        return extracted.rest.trimStart();
      }

      const textWithoutSummaryPrefix = this.stripLeadingSummaryListWithTrailingSuffix(
        extracted.items,
        expectedPoints,
        extracted.rest
      );
      if (textWithoutSummaryPrefix !== null) {
        return textWithoutSummaryPrefix;
      }
    }

    const escapedListItems = this.extractEscapedNewlineMarkdownListItems(text);
    if (!escapedListItems) {
      return text;
    }

    if (!this.areNormalizedSummaryPointsEqual(escapedListItems, expectedPoints)) {
      return text;
    }

    return '';
  }

  // Requirements: llm-integration.9.5.6
  private extractLeadingJsonObject(text: string): { objectText: string; rest: string } | null {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            objectText: text.slice(0, i + 1),
            rest: text.slice(i + 1),
          };
        }
      }
    }
    return null;
  }

  // Requirements: llm-integration.9.5.6
  private parseJsonObject(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6
  private extractLeadingMarkdownList(text: string): { items: string[]; rest: string } | null {
    const trimmedStart = text.trimStart();
    if (!trimmedStart) {
      return null;
    }

    const lineBreakMatch = trimmedStart.match(/\r?\n/);
    const newline = lineBreakMatch?.[0] ?? '\n';
    const lines = trimmedStart.split(/\r?\n/);
    const items: string[] = [];
    let consumedChars = 0;
    let sawListItem = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const item = this.parseMarkdownListItem(line);
      const lineLength = line.length;
      const separatorLength = index < lines.length - 1 ? newline.length : 0;

      if (item !== null) {
        sawListItem = true;
        items.push(item);
        consumedChars += lineLength + separatorLength;
        continue;
      }

      if (!sawListItem) {
        if (line.trim().length === 0) {
          consumedChars += lineLength + separatorLength;
          continue;
        }
        return null;
      }

      if (line.trim().length === 0) {
        consumedChars += lineLength + separatorLength;
        const rest = trimmedStart.slice(consumedChars);
        return { items, rest };
      }

      return { items, rest: trimmedStart.slice(consumedChars) };
    }

    if (!sawListItem) {
      return null;
    }

    return {
      items,
      rest: trimmedStart.slice(consumedChars),
    };
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6
  private parseMarkdownListItem(line: string): string | null {
    const checkboxMatch = line.match(/^\s*[-*+]\s+\[(?: |x|X)\]\s+(.+?)\s*$/);
    if (checkboxMatch) {
      return checkboxMatch[1] ?? null;
    }

    const bulletMatch = line.match(/^\s*(?:[-*+]|(?:\d+|[A-Za-z])[.)])\s+(.+?)\s*$/);
    if (bulletMatch) {
      return bulletMatch[1] ?? null;
    }

    return null;
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6.2
  private extractEscapedNewlineMarkdownListItems(text: string): string[] | null {
    const trimmed = text.trim();
    if (!trimmed.includes('\\n')) {
      return null;
    }
    const normalized = trimmed.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    const lines = normalized.split('\n');
    const items: string[] = [];

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const item = this.parseMarkdownListItem(line);
      if (item === null) {
        return null;
      }
      items.push(item);
    }

    return items.length > 0 ? items : null;
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6.2
  private stripLeadingSummaryListWithTrailingSuffix(
    candidateItems: string[],
    expectedItems: string[],
    rest: string
  ): string | null {
    if (candidateItems.length !== expectedItems.length) {
      return null;
    }

    for (let index = 0; index < expectedItems.length - 1; index += 1) {
      const expectedItem = expectedItems[index] ?? '';
      const candidateItem = candidateItems[index] ?? '';
      if (
        this.normalizeSummaryPointText(candidateItem) !==
        this.normalizeSummaryPointText(expectedItem)
      ) {
        return null;
      }
    }

    const lastIndex = expectedItems.length - 1;
    const expectedLastItem = (expectedItems[lastIndex] ?? '').trimStart();
    const candidateLastItem = (candidateItems[lastIndex] ?? '').trimStart();

    if (!candidateLastItem.startsWith(expectedLastItem)) {
      return null;
    }

    const trailingSuffix = candidateLastItem.slice(expectedLastItem.length);
    return `${trailingSuffix}${rest}`.trimStart();
  }

  // Requirements: llm-integration.9.5.6
  private isToolPayloadMirror(
    parsedPayload: Record<string, unknown>,
    state: AttemptRuntimeState
  ): boolean {
    const containers: Record<string, unknown>[] = [parsedPayload];
    const dataPayload = parsedPayload['data'];
    if (dataPayload && typeof dataPayload === 'object' && !Array.isArray(dataPayload)) {
      containers.push(dataPayload as Record<string, unknown>);
    }

    for (const container of containers) {
      const summaryPoints = container['summary_points'];
      const toolName = container['toolName'];
      const callId = container['callId'];
      const hasEnvelopeKeys =
        Object.prototype.hasOwnProperty.call(container, 'toolName') ||
        Object.prototype.hasOwnProperty.call(container, 'arguments') ||
        Object.prototype.hasOwnProperty.call(container, 'output') ||
        Object.prototype.hasOwnProperty.call(container, 'callId');

      if (Array.isArray(summaryPoints)) {
        if (
          state.finalAnswerCall &&
          this.areSummaryPointsEqual(summaryPoints, state.finalAnswerCall.args['summary_points'])
        ) {
          return true;
        }
      }

      if (hasEnvelopeKeys) {
        const matchingFinalCallId =
          typeof callId === 'string' &&
          state.finalAnswerCall !== null &&
          callId === state.finalAnswerCall.callId;
        const matchingFinalAnswerEnvelope = toolName === 'final_answer' && matchingFinalCallId;
        if (matchingFinalAnswerEnvelope) {
          return true;
        }
      }
    }

    return false;
  }

  // Requirements: llm-integration.9.5.6
  private areSummaryPointsEqual(candidate: unknown[], expected: unknown): boolean {
    if (!Array.isArray(expected)) {
      return false;
    }
    if (candidate.length !== expected.length) {
      return false;
    }
    return candidate.every((item, index) => item === expected[index]);
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6
  private areNormalizedSummaryPointsEqual(candidate: string[], expected: string[]): boolean {
    if (candidate.length !== expected.length) {
      return false;
    }

    return candidate.every((item, index) => {
      const expectedItem = expected[index] ?? '';
      return this.normalizeSummaryPointText(item) === this.normalizeSummaryPointText(expectedItem);
    });
  }

  // Requirements: llm-integration.9.5.3.3, llm-integration.9.5.6
  private normalizeSummaryPointText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
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

  // Requirements: llm-integration.16.1, llm-integration.16.2, llm-integration.16.10
  private buildAutoTitleSystemInstruction(agentId: string, messages: Message[]): string | null {
    if (!this.agentTitleUpdater) {
      return null;
    }

    const currentTitle = this.agentTitleUpdater.getCurrentTitle(agentId);
    if (!currentTitle) {
      return null;
    }

    const userTurn = this.getUserTurnCount(messages);
    const lastRenameUserTurn = this.getLastRenameUserTurnFromHistory(agentId, messages, null);
    if (
      lastRenameUserTurn !== null &&
      userTurn - lastRenameUserTurn < TITLE_RENAME_MIN_USER_TURN_GAP
    ) {
      return null;
    }

    const shouldEnforceMeaningfulFirstRename = this.isDefaultAgentTitle(currentTitle);
    if (shouldEnforceMeaningfulFirstRename && !this.hasMeaningfulUserMessageInHistory(messages)) {
      return null;
    }

    return buildAutoTitleMetadataContractPrompt(currentTitle);
  }

  // Requirements: llm-integration.16.2
  private injectSystemMessage(
    messages: ReturnType<PromptBuilder['buildMessages']>,
    instruction: string | null
  ): ReturnType<PromptBuilder['buildMessages']> {
    if (!instruction) {
      return messages;
    }

    const firstNonSystemIndex = messages.findIndex((message) => message.role !== 'system');
    const instructionMessage: ChatMessage = { role: 'system', content: instruction };

    if (firstNonSystemIndex === -1) {
      return [...messages, instructionMessage];
    }

    return [
      ...messages.slice(0, firstNonSystemIndex),
      instructionMessage,
      ...messages.slice(firstNonSystemIndex),
    ];
  }

  /**
   * Apply valid title candidate through AgentManager update path.
   * Requirements: llm-integration.16.8, llm-integration.16.9, llm-integration.16.10, llm-integration.16.11, llm-integration.16.12
   */
  private applyAutoTitleCandidate(
    agentId: string,
    metadata: AgentTitleMetadata | null,
    sourceLlmMessageId: number | null,
    sourceLlmPayload: Record<string, unknown> | null,
    messagesSnapshot: Message[]
  ): void {
    if (!metadata || !this.agentTitleUpdater) {
      return;
    }

    try {
      const normalizedCandidate = normalizeAgentTitleCandidate(metadata.title);
      if (!normalizedCandidate) {
        this.logger.debug(`Auto-title skipped for agent ${agentId}: invalid candidate`);
        return;
      }
      if (!isValidRenameNeedScore(metadata.renameNeedScore)) {
        this.logger.debug(`Auto-title skipped for agent ${agentId}: invalid rename_need_score`);
        return;
      }

      const currentTitle = this.agentTitleUpdater.getCurrentTitle(agentId);
      if (!currentTitle) {
        return;
      }

      const shouldEnforceMeaningfulFirstRename = this.isDefaultAgentTitle(currentTitle);
      if (
        shouldEnforceMeaningfulFirstRename &&
        !this.hasMeaningfulUserMessageInHistory(messagesSnapshot)
      ) {
        this.logger.debug(
          `Auto-title skipped for agent ${agentId}: first rename requires meaningful user message in history`
        );
        return;
      }

      const userTurn = this.getUserTurnCount(messagesSnapshot);
      const lastRenameUserTurn = this.getLastRenameUserTurnFromHistory(
        agentId,
        messagesSnapshot,
        sourceLlmMessageId
      );
      const guardDecision = evaluateAgentTitleGuards({
        currentTitle,
        nextTitle: normalizedCandidate,
        renameNeedScore: metadata.renameNeedScore,
        currentUserTurn: userTurn,
        lastRenameUserTurn,
      });
      if (!guardDecision.allow) {
        this.logger.debug(
          `Auto-title skipped for agent ${agentId}: reason=${guardDecision.reason} score=${metadata.renameNeedScore}`
        );
        return;
      }

      this.agentTitleUpdater.rename(agentId, normalizedCandidate);
      this.markAutoTitleApplied(agentId, sourceLlmMessageId, sourceLlmPayload, normalizedCandidate);
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
  private getUserTurnCount(messages: Message[]): number {
    return messages.filter((message) => message.kind === 'user' && !message.hidden).length;
  }

  /**
   * Recover durable cooldown state from persisted chat history.
   * Requirements: llm-integration.16.10
   */
  private getLastRenameUserTurnFromHistory(
    agentId: string,
    messages: Message[],
    excludedLlmMessageId: number | null
  ): number | null {
    const filteredMessages = messages.filter((message) => {
      if (message.hidden) {
        return false;
      }
      if (excludedLlmMessageId === null) {
        return true;
      }
      return message.id !== excludedLlmMessageId;
    });

    const lastFilteredMessage =
      filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1] : null;
    const lastProcessedMessageId = lastFilteredMessage ? lastFilteredMessage.id : 0;
    const cache = this.autoTitleHistoryCache.get(agentId);
    if (cache && cache.lastProcessedMessageId === lastProcessedMessageId) {
      return cache.lastRenameUserTurn;
    }

    let userTurn = 0;
    let currentTitle = DEFAULT_AGENT_TITLE;
    let lastRenameUserTurn: number | null = null;
    let hasMeaningfulUserMessageInHistory = false;

    for (const message of filteredMessages) {
      if (message.kind === 'user') {
        userTurn += 1;
        hasMeaningfulUserMessageInHistory =
          hasMeaningfulUserMessageInHistory || this.isMeaningfulUserMessage(message);
        continue;
      }

      if (message.kind !== 'llm') {
        continue;
      }

      const historicalAppliedTitle = this.extractAppliedAutoTitleFromMessage(message);
      if (!historicalAppliedTitle) {
        continue;
      }
      const normalizedHistoricalCandidate = normalizeAgentTitleCandidate(historicalAppliedTitle);
      if (!normalizedHistoricalCandidate) {
        continue;
      }

      if (this.isDefaultAgentTitle(currentTitle) && !hasMeaningfulUserMessageInHistory) {
        continue;
      }

      const guardDecision = evaluateAgentTitleGuards({
        currentTitle,
        nextTitle: normalizedHistoricalCandidate,
        renameNeedScore: 100,
        currentUserTurn: userTurn,
        lastRenameUserTurn,
      });
      if (!guardDecision.allow) {
        continue;
      }

      currentTitle = normalizedHistoricalCandidate;
      lastRenameUserTurn = userTurn;
    }

    this.autoTitleHistoryCache.set(agentId, {
      lastProcessedMessageId,
      lastRenameUserTurn,
    });
    return lastRenameUserTurn;
  }

  /**
   * Persist durable marker for successful auto-title rename.
   * Requirements: llm-integration.16.10, llm-integration.16.12
   */
  private markAutoTitleApplied(
    agentId: string,
    sourceLlmMessageId: number | null,
    sourceLlmPayload: Record<string, unknown> | null,
    appliedTitle: string
  ): void {
    if (sourceLlmMessageId === null || !sourceLlmPayload) {
      return;
    }

    try {
      const data =
        sourceLlmPayload.data &&
        typeof sourceLlmPayload.data === 'object' &&
        !Array.isArray(sourceLlmPayload.data)
          ? (sourceLlmPayload.data as Record<string, unknown>)
          : {};
      data.auto_title_applied = true;
      data.auto_title_applied_title = appliedTitle;
      this.messageManager.update(
        sourceLlmMessageId,
        agentId,
        {
          ...sourceLlmPayload,
          data,
        },
        true
      );
    } catch (error) {
      this.logger.warn(
        `Auto-title marker persist failed for agent ${agentId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Parse durable successful auto-title marker from persisted llm message payload.
   * Requirements: llm-integration.16.10
   */
  private extractAppliedAutoTitleFromMessage(message: Message): string | null {
    try {
      const payload = JSON.parse(message.payloadJson) as {
        data?: { auto_title_applied?: unknown; auto_title_applied_title?: unknown };
      };
      if (payload?.data?.auto_title_applied !== true) {
        return null;
      }
      const title = payload?.data?.auto_title_applied_title;
      return typeof title === 'string' ? title : null;
    } catch {
      return null;
    }
  }

  // Requirements: llm-integration.16.10
  private extendHistorySnapshotWithFinalLlm(
    baseHistory: Message[],
    agentId: string,
    replyToMessageId: number,
    finalLlmMessageId: number | null,
    finalLlmPayload: Record<string, unknown> | null
  ): Message[] {
    if (finalLlmMessageId === null || !finalLlmPayload) {
      return baseHistory;
    }

    return [
      ...baseHistory,
      {
        id: finalLlmMessageId,
        agentId,
        kind: 'llm',
        timestamp: new Date().toISOString(),
        payloadJson: JSON.stringify(finalLlmPayload),
        usageJson: null,
        replyToMessageId,
        hidden: false,
        done: true,
      },
    ];
  }

  /**
   * Check whether agent title is still the default one.
   * Requirements: llm-integration.16.10
   */
  private isDefaultAgentTitle(title: string): boolean {
    const normalized = normalizeAgentTitleCandidate(title);
    return (normalized ?? title).toLocaleLowerCase() === DEFAULT_AGENT_TITLE.toLocaleLowerCase();
  }

  /**
   * Determine if user message contains meaningful text for first auto-rename.
   * Requirements: llm-integration.16.10
   */
  private isMeaningfulUserMessage(message: Message | null): boolean {
    if (!message || message.kind !== 'user') {
      return false;
    }
    try {
      const payload = JSON.parse(message.payloadJson) as { data?: { text?: unknown } };
      const text = typeof payload?.data?.text === 'string' ? payload.data.text : '';
      const meaningfulUnits = text.match(/[\p{L}\p{N}]/gu) ?? [];
      return meaningfulUnits.length >= 3;
    } catch {
      return false;
    }
  }

  // Requirements: llm-integration.16.10
  private hasMeaningfulUserMessageInHistory(messages: Message[]): boolean {
    return messages.some((message) => !message.hidden && this.isMeaningfulUserMessage(message));
  }

  // Requirements: llm-integration.9.5.3.2, llm-integration.16.1.4
  private assertToolPayloadHasNoAutoTitleMetadata(
    value: unknown,
    path: string,
    createError: (message: string) => Error
  ): void {
    if (typeof value === 'string') {
      if (value.includes(TITLE_META_COMMENT_PREFIX)) {
        throw createError(`${path} must not contain auto-title metadata comments`);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.assertToolPayloadHasNoAutoTitleMetadata(item, `${path}[${index}]`, createError);
      });
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    Object.entries(value).forEach(([key, nestedValue]) => {
      this.assertToolPayloadHasNoAutoTitleMetadata(nestedValue, `${path}.${key}`, createError);
    });
  }

  private validateToolCallArguments(toolName: string, args: Record<string, unknown>): void {
    if (toolName === 'code_exec') {
      const validated = validateCodeExecInput(args);
      if (!validated.ok) {
        throw new InvalidToolArgumentsError(
          validated.error?.message ?? 'Invalid code_exec arguments.'
        );
      }
      this.assertToolPayloadHasNoAutoTitleMetadata(
        args,
        toolName,
        (message) => new InvalidToolArgumentsError(message)
      );
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
      if (point.trim().length < 1) {
        throw new InvalidFinalAnswerContractError(
          'final_answer.summary_points items must be non-empty'
        );
      }
      if (point.length > 200) {
        throw new InvalidFinalAnswerContractError(
          'final_answer.summary_points item length must be <= 200'
        );
      }
    }

    this.assertToolPayloadHasNoAutoTitleMetadata(
      args,
      toolName,
      (message) => new InvalidFinalAnswerContractError(message)
    );
  }

  private persistFinalAnswerToolCall(
    agentId: string,
    replyToMessageId: number,
    callId: string,
    args: Record<string, unknown>,
    order: MessageOrderMeta
  ): void {
    this.messageManager.createWithOrder(
      agentId,
      'tool_call',
      {
        data: {
          callId,
          toolName: 'final_answer',
          arguments: this.normalizeFinalAnswerArguments(args),
        },
      },
      replyToMessageId,
      order,
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
      },
    };

    if (segment.id === null) {
      const llmMsg = this.messageManager.createWithOrder(
        agentId,
        'llm',
        streamingPayload,
        replyToMessageId,
        segment.order,
        false
      );
      attemptMessageIds.add(llmMsg.id);
      setLastLlmMessageId(llmMsg.id);
      return llmMsg.id;
    }

    this.messageManager.updateWithOrder(
      segment.id,
      agentId,
      streamingPayload,
      segment.order,
      false
    );
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
    if (!segment.order) {
      throw new InvalidFinalAnswerContractError('Missing order metadata for llm segment');
    }

    this.messageManager.updateWithOrder(
      segment.id,
      agentId,
      {
        data: {
          model,
          reasoning: segment.reasoning
            ? { text: segment.reasoning, excluded_from_replay: true }
            : undefined,
          text: segment.text || undefined,
        },
      },
      segment.order,
      true,
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
    return this.messageManager.createWithOrder(
      agentId,
      'llm',
      {
        data: {
          model,
          text,
        },
      },
      replyToMessageId,
      order,
      true,
      undefined,
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

    // Requirements: llm-integration.3.6
    // Wrap non-abort error handling in try/catch for resilience: if DB operations
    // (hideIncompleteLlmMessage, finalizePendingToolCallsForTurn, messageManager.create)
    // throw, log the secondary error instead of letting it propagate and get silently
    // swallowed by handleBackgroundError.
    try {
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
    } catch (secondaryError) {
      this.logger.error(
        `Failed to create error message for agent ${agentId}: ${secondaryError instanceof Error ? secondaryError.message : String(secondaryError)}`
      );
    }
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
   * Inject runtime credentials into features that need them (e.g. CodeExecFeature).
   * Requirements: sandbox-web-search.1, sandbox-web-search.2
   */
  private injectFeatureCredentials(provider: LLMProvider, apiKey: string): void {
    this.promptBuilder.forEachFeature((feature) => {
      if (feature instanceof CodeExecFeature) {
        feature.setCredentials(provider, apiKey);
      }
    });
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
    tools: NonNullable<ChatOptions['tools']>,
    fallbackSignal?: AbortSignal
  ): NonNullable<ChatOptions['tools']> {
    const runLimited = this.createConcurrencyLimiter(3);
    return tools.map((toolDef) => ({
      ...toolDef,
      execute: async (args: Record<string, unknown>, executeOptions?: unknown) =>
        runLimited(async () => {
          const abortSignal = this.extractToolAbortSignal(executeOptions) ?? fallbackSignal;
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
    const isAbortSignalLike = (candidate: unknown): candidate is AbortSignal => {
      return Boolean(
        candidate &&
        typeof candidate === 'object' &&
        'addEventListener' in candidate &&
        typeof (candidate as { addEventListener?: unknown }).addEventListener === 'function'
      );
    };

    if (executeOptions && typeof executeOptions === 'object' && 'abortSignal' in executeOptions) {
      const candidate = (executeOptions as { abortSignal?: unknown }).abortSignal;
      if (isAbortSignalLike(candidate)) {
        return candidate as AbortSignal;
      }
    }

    if (executeOptions && typeof executeOptions === 'object' && 'signal' in executeOptions) {
      const candidate = (executeOptions as { signal?: unknown }).signal;
      if (isAbortSignalLike(candidate)) {
        return candidate as AbortSignal;
      }
    }

    if (
      executeOptions &&
      typeof executeOptions === 'object' &&
      'context' in executeOptions &&
      (executeOptions as { context?: unknown }).context &&
      typeof (executeOptions as { context?: unknown }).context === 'object'
    ) {
      const context = (executeOptions as { context?: { abortSignal?: unknown; signal?: unknown } })
        .context;
      if (isAbortSignalLike(context?.abortSignal)) {
        return context.abortSignal as AbortSignal;
      }
      if (isAbortSignalLike(context?.signal)) {
        return context.signal as AbortSignal;
      }
    }

    if (isAbortSignalLike(executeOptions)) {
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
