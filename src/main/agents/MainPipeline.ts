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
import type { ILLMProvider, ChatOptions, LLMChatResult } from '../llm/ILLMProvider';
import { handleBackgroundError } from '../ErrorHandler';
import { normalizeLLMError } from '../llm/ErrorNormalizer';
import type { IToolExecutor } from '../tools/ToolRunner';
import { ToolRunner } from '../tools/ToolRunner';

import type { LLMProvider } from '../../types';

type BufferedToolCall = {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  resultStatus?: 'success' | 'error';
  resultOutput?: unknown;
};

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
 * - Emit message.llm.reasoning.updated + message.updated on each reasoning chunk
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

  constructor(
    private messageManager: MessageManager,
    private settingsManager: AIAgentSettingsManager,
    private promptBuilder: PromptBuilder,
    private createProvider: (provider: LLMProvider, apiKey: string) => ILLMProvider = (p, k) =>
      LLMProviderFactory.createProvider(p, k),
    private toolExecutor: IToolExecutor = new ToolRunner({}, 3)
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
    let llmMessageId: number | null = null;
    let accumulatedReasoning = '';
    let accumulatedText = '';
    const bufferedToolCalls = new Map<string, BufferedToolCall>();
    const streamResult = await this.callProviderWithStreaming(
      {
        chatMessages: context.baseChatMessages,
        options: context.options,
        replyToMessageId: context.replyToMessageId,
        llmProvider: context.llmProvider,
      },
      agentId,
      signal,
      setLastLlmMessageId,
      llmMessageId,
      accumulatedReasoning,
      accumulatedText,
      bufferedToolCalls
    );

    llmMessageId = streamResult.llmMessageId;
    accumulatedReasoning = streamResult.accumulatedReasoning;
    accumulatedText = streamResult.accumulatedText;

    if (signal?.aborted) {
      this.handleAbortAfterStreaming(llmMessageId, agentId, clearLastLlmMessageId);
      return;
    }

    const finalMessageId = this.writeFinalMessage(
      agentId,
      context.replyToMessageId,
      llmMessageId,
      context.options.model,
      accumulatedReasoning,
      accumulatedText,
      streamResult.output
    );
    setLastLlmMessageId(finalMessageId);
    this.flushBufferedToolCalls(agentId, context.replyToMessageId, bufferedToolCalls);
    this.persistUsageEnvelope(finalMessageId, agentId, streamResult.output);
    this.publishStepDiagnostics(agentId, userMessageId, streamResult.output);
    this.logger.info(`Pipeline completed for agent ${agentId}`);
  }

  /**
   * Call provider and map stream chunks into llm message updates/events.
   * Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
   */
  private async callProviderWithStreaming(
    context: {
      chatMessages: ReturnType<PromptBuilder['buildMessages']>;
      options: ChatOptions;
      replyToMessageId: number;
      llmProvider: ILLMProvider;
    },
    agentId: string,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void,
    llmMessageId: number | null,
    accumulatedReasoning: string,
    accumulatedText: string,
    bufferedToolCalls: Map<string, BufferedToolCall>
  ): Promise<{
    output: LLMChatResult;
    llmMessageId: number | null;
    accumulatedReasoning: string;
    accumulatedText: string;
  }> {
    let attempts = 0;
    for (;;) {
      let meaningfulChunkSeen = false;

      try {
        const output = await context.llmProvider.chat(
          context.chatMessages,
          context.options,
          (chunk) => {
            if (signal?.aborted) {
              return;
            }

            if (chunk.type === 'reasoning') {
              if (!chunk.delta) {
                return;
              }
              meaningfulChunkSeen = true;
              accumulatedReasoning += chunk.delta;
              llmMessageId = this.upsertStreamingMessage(
                llmMessageId,
                agentId,
                context.replyToMessageId,
                context.options.model,
                accumulatedReasoning,
                accumulatedText,
                setLastLlmMessageId
              );
              MainEventBus.getInstance().publish(
                new MessageLlmReasoningUpdatedEvent(
                  llmMessageId,
                  agentId,
                  chunk.delta,
                  accumulatedReasoning
                )
              );
              return;
            }

            if (chunk.type === 'text') {
              if (!chunk.delta) {
                return;
              }
              meaningfulChunkSeen = true;
              accumulatedText += chunk.delta;
              llmMessageId = this.upsertStreamingMessage(
                llmMessageId,
                agentId,
                context.replyToMessageId,
                context.options.model,
                accumulatedReasoning,
                accumulatedText,
                setLastLlmMessageId
              );
              MainEventBus.getInstance().publish(
                new MessageLlmTextUpdatedEvent(llmMessageId, agentId, chunk.delta, accumulatedText)
              );
              return;
            }

            if (chunk.type === 'tool_call') {
              meaningfulChunkSeen = true;
              this.bufferToolCall(bufferedToolCalls, chunk.callId, chunk.toolName, chunk.arguments);
              return;
            }

            if (chunk.type === 'tool_result') {
              meaningfulChunkSeen = true;
              this.bufferToolResult(
                bufferedToolCalls,
                chunk.callId,
                chunk.toolName,
                chunk.arguments,
                chunk.output,
                chunk.status
              );
              return;
            }

            if (chunk.type === 'turn_error') {
              throw new Error(chunk.message);
            }
          }
        );

        if (!accumulatedText) {
          accumulatedText = output.text || '';
        }

        return {
          output,
          llmMessageId,
          accumulatedReasoning,
          accumulatedText,
        };
      } catch (error) {
        const shouldRetry = attempts < 1 && !meaningfulChunkSeen && !signal?.aborted;
        if (!shouldRetry) {
          throw error;
        }
        attempts += 1;
      }
    }
  }

  /**
   * Buffer tool_call chunks until llm finalization.
   * Requirements: llm-integration.11.1, llm-integration.11.1.1, llm-integration.11.1.2
   */
  private bufferToolCall(
    bufferedToolCalls: Map<string, BufferedToolCall>,
    callId: string,
    toolName: string,
    args: Record<string, unknown>
  ): void {
    const existing = bufferedToolCalls.get(callId);
    if (existing) {
      existing.toolName = toolName;
      existing.args = args;
      return;
    }
    bufferedToolCalls.set(callId, {
      callId,
      toolName,
      args,
    });
  }

  /**
   * Buffer tool_result chunks until llm finalization.
   * Requirements: llm-integration.11.1.1, llm-integration.11.2
   */
  private bufferToolResult(
    bufferedToolCalls: Map<string, BufferedToolCall>,
    callId: string,
    toolName: string,
    args: Record<string, unknown>,
    output: unknown,
    status: 'success' | 'error'
  ): void {
    const existing = bufferedToolCalls.get(callId);
    if (existing) {
      existing.toolName = toolName;
      existing.args = args;
      existing.resultOutput = output;
      existing.resultStatus = status;
      return;
    }
    bufferedToolCalls.set(callId, {
      callId,
      toolName,
      args,
      resultOutput: output,
      resultStatus: status,
    });
  }

  /**
   * Persist buffered tool calls after llm message is finalized.
   * Requirements: llm-integration.11.1.1, llm-integration.11.1.2, llm-integration.11.2
   */
  private flushBufferedToolCalls(
    agentId: string,
    replyToMessageId: number,
    bufferedToolCalls: Map<string, BufferedToolCall>
  ): void {
    for (const buffered of bufferedToolCalls.values()) {
      const isFinalAnswer = buffered.toolName === 'final_answer';
      const argumentsPayload = isFinalAnswer
        ? this.normalizeFinalAnswerArguments(buffered.args)
        : buffered.args;
      const payloadData: Record<string, unknown> = {
        callId: buffered.callId,
        toolName: buffered.toolName,
        arguments: argumentsPayload,
      };

      if (!isFinalAnswer) {
        const resultStatus = buffered.resultStatus ?? 'error';
        const resultOutput =
          buffered.resultOutput ?? `Tool "${buffered.toolName}" is not available.`;
        payloadData.output = {
          status: resultStatus,
          content: this.stringifyToolOutput(resultOutput),
        };
      }

      this.messageManager.create(
        agentId,
        'tool_call',
        { data: payloadData },
        replyToMessageId,
        true
      );
    }
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
   * Requirements: llm-integration.9.5.1.2
   */
  private normalizeFinalAnswerArguments(args: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    normalized.summary_points = Array.isArray(args.summary_points) ? args.summary_points : [];
    return normalized;
  }

  /**
   * Upsert in-flight llm message during streaming.
   * Requirements: llm-integration.1.5, llm-integration.1.6
   */
  private upsertStreamingMessage(
    llmMessageId: number | null,
    agentId: string,
    replyToMessageId: number,
    model: string,
    accumulatedReasoning: string,
    accumulatedText: string,
    setLastLlmMessageId: (messageId: number) => void
  ): number {
    const streamingPayload = {
      data: {
        model,
        reasoning: accumulatedReasoning
          ? { text: accumulatedReasoning, excluded_from_replay: true }
          : undefined,
        text: accumulatedText || undefined,
      },
    };

    if (llmMessageId === null) {
      const llmMsg = this.messageManager.create(
        agentId,
        'llm',
        streamingPayload,
        replyToMessageId,
        false
      );
      setLastLlmMessageId(llmMsg.id);
      return llmMsg.id;
    }

    this.messageManager.update(llmMessageId, agentId, streamingPayload, false);
    return llmMessageId;
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
   * Finalize llm message with done=true and canonical data.text.
   * Requirements: llm-integration.1.6, llm-integration.6.6.1
   */
  private writeFinalMessage(
    agentId: string,
    replyToMessageId: number,
    llmMessageId: number | null,
    model: string,
    accumulatedReasoning: string,
    accumulatedText: string,
    output: LLMChatResult
  ): number {
    const finalText = accumulatedText || output.text || '';
    const finalPayload = {
      data: {
        model,
        reasoning: accumulatedReasoning
          ? { text: accumulatedReasoning, excluded_from_replay: true }
          : undefined,
        text: finalText,
      },
    };

    if (llmMessageId === null) {
      const msg = this.messageManager.create(agentId, 'llm', finalPayload, replyToMessageId, true);
      return msg.id;
    }

    this.messageManager.update(llmMessageId, agentId, finalPayload, true);
    return llmMessageId;
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

      data.output = {
        status: 'error',
        content: errorText,
      };

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
