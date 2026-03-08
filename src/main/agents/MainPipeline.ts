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
  MessageToolCallEvent,
  AgentRateLimitEvent,
  LLMPipelineDiagnosticEvent,
} from '../../shared/events/types';
import { LLM_CHAT_MODELS } from '../llm/LLMConfig';
import { Logger } from '../Logger';
import type { ILLMProvider, ChatOptions, LLMChatResult } from '../llm/ILLMProvider';
import { handleBackgroundError } from '../ErrorHandler';
import { LLMRequestAbortedError } from '../llm/LLMErrors';

import type { LLMProvider } from '../../types';

/**
 * Error type categories for kind:error messages
 * Requirements: llm-integration.5.3
 */
export type LLMErrorType = 'auth' | 'rate_limit' | 'provider' | 'network' | 'timeout';

/**
 * Classify an error message into a typed category
 * Requirements: llm-integration.5.3
 */
function classifyError(message: string): LLMErrorType {
  const lower = message.toLowerCase();
  if (
    lower.includes('invalid api key') ||
    lower.includes('api key is not set') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return 'auth';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'rate_limit';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'network';
  }
  return 'provider';
}

/**
 * Parse retry-after seconds from error message text.
 * Supports formats like "Please try again in 10.384s" or "retry after 5 seconds".
 * Returns default 10 seconds if not found.
 * Requirements: llm-integration.3.7.6
 */
function parseRetryAfterSeconds(message: string): number {
  // Match "in N.NNNs" or "in Ns" (OpenAI format)
  const match = message.match(/in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (match && match[1]) {
    return Math.ceil(parseFloat(match[1]));
  }
  // Match "retry after N seconds"
  const match2 = message.match(/retry\s+after\s+(\d+)/i);
  if (match2 && match2[1]) {
    return parseInt(match2[1], 10);
  }
  return 10; // default
}

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
    private createProvider: (provider: LLMProvider, apiKey: string) => ILLMProvider = (p, k) => {
      const instance = LLMProviderFactory.createProvider(p);
      // Recreate with apiKey — OpenAIProvider accepts it in constructor
      // We use a workaround: cast and reconstruct
      void instance;
      const { OpenAIProvider } = require('../llm/OpenAIProvider') as {
        OpenAIProvider: new (key: string) => ILLMProvider;
      };
      const { AnthropicProvider } = require('../llm/AnthropicProvider') as {
        AnthropicProvider: new (key: string) => ILLMProvider;
      };
      const { GoogleProvider } = require('../llm/GoogleProvider') as {
        GoogleProvider: new (key: string) => ILLMProvider;
      };
      switch (p) {
        case 'openai':
          return new OpenAIProvider(k);
        case 'anthropic':
          return new AnthropicProvider(k);
        case 'google':
          return new GoogleProvider(k);
        default:
          throw new Error(`Unknown provider: ${p}`);
      }
    }
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
    const options = { ...this.resolveOptions(provider), tools: builtPrompt.tools };
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
    const streamResult = await this.callProviderWithStreaming(
      context,
      agentId,
      signal,
      setLastLlmMessageId
    );

    if (signal?.aborted) {
      this.handleAbortAfterStreaming(streamResult.llmMessageId, agentId, clearLastLlmMessageId);
      return;
    }

    const finalMessageId = this.writeFinalMessage(
      agentId,
      context.replyToMessageId,
      streamResult.llmMessageId,
      context.options.model,
      streamResult.accumulatedReasoning,
      streamResult.accumulatedText,
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
      baseChatMessages: ReturnType<PromptBuilder['buildMessages']>;
      options: ChatOptions;
      replyToMessageId: number;
      llmProvider: ILLMProvider;
    },
    agentId: string,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void
  ): Promise<{
    output: LLMChatResult;
    llmMessageId: number | null;
    accumulatedReasoning: string;
    accumulatedText: string;
  }> {
    let llmMessageId: number | null = null;
    let accumulatedReasoning = '';
    let accumulatedText = '';

    const output = await context.llmProvider.chat(
      context.baseChatMessages,
      context.options,
      (chunk) => {
        if (signal?.aborted) {
          return;
        }

        if (chunk.type === 'reasoning') {
          if (!chunk.delta) {
            return;
          }
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
            new MessageToolCallEvent(
              agentId,
              llmMessageId,
              chunk.callId,
              chunk.toolName,
              chunk.arguments
            )
          );
          return;
        }

        if (chunk.type === 'turn_error') {
          throw new Error(chunk.message);
        }
      }
    );

    if (!accumulatedText) {
      accumulatedText =
        output.text || (output as { action?: { content?: string } }).action?.content || '';
    }

    return { output, llmMessageId, accumulatedReasoning, accumulatedText };
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
    const legacyAction = (output as { action?: { content?: string } }).action;
    const finalText = accumulatedText || output.text || legacyAction?.content || '';
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
    const errorType =
      error instanceof LLMRequestAbortedError ? 'timeout' : classifyError(errorMessage);

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
      const retryAfterSeconds = parseRetryAfterSeconds(errorMessage);
      MainEventBus.getInstance().publish(
        new AgentRateLimitEvent(agentId, userMessageId, retryAfterSeconds)
      );
      return;
    }

    const errorPayload: Record<string, unknown> = {
      type: errorType,
      message: errorMessage,
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
   * Hide interrupted llm message and keep it in unfinished state.
   * Requirements: llm-integration.3.2
   */
  private hideIncompleteLlmMessage(messageId: number, agentId: string): void {
    this.messageManager.hideAndMarkIncomplete(messageId, agentId);
  }
}
