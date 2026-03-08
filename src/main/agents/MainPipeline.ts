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
    const builtPrompt = this.promptBuilder.build(messages);
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
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void,
    clearLastLlmMessageId: () => void
  ): Promise<void> {
    let llmMessageId: number | null = null;
    let accumulatedReasoning = '';
    let accumulatedText = '';
    const toolCallMessageIds = new Map<string, number>();
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
      toolCallMessageIds
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
    this.persistUsageEnvelope(finalMessageId, agentId, streamResult.output);
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
    toolCallMessageIds: Map<string, number>
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
              llmMessageId = this.persistInProgressToolCall(
                llmMessageId,
                agentId,
                context.replyToMessageId,
                context.options.model,
                accumulatedReasoning,
                accumulatedText,
                setLastLlmMessageId,
                chunk.callId,
                chunk.toolName,
                chunk.arguments,
                toolCallMessageIds
              );
              return;
            }

            if (chunk.type === 'tool_result') {
              meaningfulChunkSeen = true;
              this.finalizeSingleToolCall(
                agentId,
                context.replyToMessageId,
                chunk.callId,
                chunk.toolName,
                chunk.arguments,
                chunk.output,
                chunk.status,
                toolCallMessageIds
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
   * Persist in-progress tool call snapshot from model chunk.
   * Requirements: llm-integration.11.1, llm-integration.11.2
   */
  private persistInProgressToolCall(
    llmMessageId: number | null,
    agentId: string,
    replyToMessageId: number,
    model: string,
    accumulatedReasoning: string,
    accumulatedText: string,
    setLastLlmMessageId: (messageId: number) => void,
    callId: string,
    toolName: string,
    args: Record<string, unknown>,
    toolCallMessageIds: Map<string, number>
  ): number | null {
    const toolPayload = {
      data: {
        callId,
        toolName,
        arguments: args,
      },
    };
    const existingToolMessageId = toolCallMessageIds.get(callId);
    if (existingToolMessageId !== undefined) {
      this.messageManager.update(existingToolMessageId, agentId, toolPayload, false);
      return llmMessageId;
    }
    const toolMessage = this.messageManager.create(
      agentId,
      'tool_call',
      toolPayload,
      replyToMessageId,
      false
    );
    toolCallMessageIds.set(callId, toolMessage.id);

    // Keep llm progress message visible for reasoning/text stream continuity.
    return this.upsertStreamingMessage(
      llmMessageId,
      agentId,
      replyToMessageId,
      model,
      accumulatedReasoning,
      accumulatedText,
      setLastLlmMessageId
    );
  }

  /**
   * Finalize persisted tool_call message with tool result emitted by AI SDK stream.
   * Requirements: llm-integration.11.2, llm-integration.11.3
   */
  private finalizeSingleToolCall(
    agentId: string,
    replyToMessageId: number,
    callId: string,
    toolName: string,
    args: Record<string, unknown>,
    output: unknown,
    status: 'success' | 'error',
    toolCallMessageIds: Map<string, number>
  ): void {
    let outputText: string;
    if (typeof output === 'string') {
      outputText = output;
    } else {
      try {
        outputText = JSON.stringify(output);
      } catch {
        outputText = String(output);
      }
    }

    const payload = {
      data: {
        callId,
        toolName,
        arguments: args,
        output: {
          status,
          content: outputText,
        },
      },
    };

    const messageId = toolCallMessageIds.get(callId);
    if (messageId !== undefined) {
      this.messageManager.update(messageId, agentId, payload, true);
      return;
    }

    const created = this.messageManager.create(
      agentId,
      'tool_call',
      payload,
      replyToMessageId,
      true
    );
    toolCallMessageIds.set(callId, created.id);
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
    return tools.map((toolDef) => ({
      ...toolDef,
      execute: async (args: Record<string, unknown>, signal?: AbortSignal) => {
        if (toolDef.execute) {
          return toolDef.execute(args, signal);
        }

        const [result] = await this.toolExecutor.executeBatch(
          [
            {
              callId: `call-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              toolName: toolDef.name,
              arguments: args,
            },
          ],
          signal
        );

        if (!result) {
          throw new Error(`Tool "${toolDef.name}" returned no result.`);
        }

        if (result.status === 'success') {
          return { status: 'success', content: result.output };
        }

        throw new Error(result.output);
      },
    }));
  }

  /**
   * Hide interrupted llm message and keep it in unfinished state.
   * Requirements: llm-integration.3.2
   */
  private hideIncompleteLlmMessage(messageId: number, agentId: string): void {
    this.messageManager.hideAndMarkIncomplete(messageId, agentId);
  }
}
