// Requirements: llm-integration.5
// src/main/agents/MainPipeline.ts
// Orchestrates the LLM request/response cycle for a single agent message

import { MessageManager } from './MessageManager';
import { PromptBuilder } from './PromptBuilder';
import { AIAgentSettingsManager } from '../AIAgentSettingsManager';
import { LLMProviderFactory } from '../llm/LLMProviderFactory';
import { MainEventBus } from '../events/MainEventBus';
import { MessageLlmReasoningUpdatedEvent, AgentRateLimitEvent } from '../../shared/events/types';
import { LLM_CHAT_MODELS } from '../llm/LLMConfig';
import { Logger } from '../Logger';
import type { ILLMProvider, ChatOptions, LLMStructuredOutput } from '../llm/ILLMProvider';
import { ImageStorageManager } from '../media/ImageStorageManager';
import { parseImagePlaceholders } from '../../shared/utils/imagePlaceholders';
import { safeParseStructuredOutput } from '../llm/StructuredOutputContract';
import { handleBackgroundError } from '../ErrorHandler';

import type { LLMProvider } from '../../types';

const INVALID_STRUCTURED_OUTPUT_RETRY_INSTRUCTION =
  'Your previous response did not match the required JSON schema. Reply again using the exact required format only.';

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
    private imageStorageManager: ImageStorageManager,
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
        () => lastLlmMessageId,
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
    const replyToMessageId = userMessageId;
    const options = this.resolveOptions(provider);
    const llmProvider = this.createProvider(provider, apiKey);

    return { provider, apiKey, baseChatMessages, options, replyToMessageId, llmProvider };
  }

  /**
   * Execute the LLM request with retry/validation and image downloads.
   * Requirements: llm-integration.1, llm-integration.3, llm-integration.9, llm-integration.12
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
    getLastLlmMessageId: () => number | null,
    clearLastLlmMessageId: () => void
  ): Promise<void> {
    // Requirements: llm-integration.12.1
    // Initial request + up to 2 retries.
    const maxRetries = 2;
    const maxAttempts = maxRetries + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { output, llmMessageId, accumulatedReasoning } = await this.callProviderWithStreaming(
        context,
        attempt,
        agentId,
        signal,
        setLastLlmMessageId
      );

      if (signal?.aborted) {
        this.handleAbortAfterStreaming(llmMessageId, agentId, clearLastLlmMessageId);
        return;
      }

      const validation = this.validateStructuredOutput(output);
      if (!validation.ok) {
        const action = this.handleInvalidStructuredOutput(
          attempt,
          maxAttempts,
          agentId,
          context.replyToMessageId,
          llmMessageId,
          clearLastLlmMessageId
        );
        if (action === 'retry') {
          continue;
        }
        return;
      }

      const finalMessageId = this.writeFinalAction(
        agentId,
        context.replyToMessageId,
        llmMessageId,
        accumulatedReasoning,
        context.options,
        output
      );
      setLastLlmMessageId(finalMessageId);

      this.persistUsageEnvelope(finalMessageId, agentId, output);

      this.queueImageDownloads(agentId, String(finalMessageId), output, validation.placeholders);

      this.logger.info(`Pipeline completed for agent ${agentId}`);
      return;
    }

    if (getLastLlmMessageId() !== null) {
      clearLastLlmMessageId();
    }
  }

  /**
   * Call provider with streaming reasoning updates.
   * Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2
   */
  private async callProviderWithStreaming(
    context: {
      baseChatMessages: ReturnType<PromptBuilder['buildMessages']>;
      options: ChatOptions;
      replyToMessageId: number;
      llmProvider: ILLMProvider;
    },
    attempt: number,
    agentId: string,
    signal: AbortSignal | undefined,
    setLastLlmMessageId: (messageId: number) => void
  ): Promise<{
    output: LLMStructuredOutput;
    llmMessageId: number | null;
    accumulatedReasoning: string;
  }> {
    let llmMessageId: number | null = null;
    let accumulatedReasoning = '';

    const chatMessages =
      attempt === 0
        ? context.baseChatMessages
        : [
            ...context.baseChatMessages,
            {
              role: 'system' as const,
              content: INVALID_STRUCTURED_OUTPUT_RETRY_INSTRUCTION,
            },
          ];

    const output = await context.llmProvider.chat(chatMessages, context.options, (chunk) => {
      if (signal?.aborted) return;
      if (chunk.type !== 'reasoning' || chunk.done || !chunk.delta) return;

      accumulatedReasoning += chunk.delta;
      llmMessageId = this.upsertReasoningMessage(
        llmMessageId,
        agentId,
        context.replyToMessageId,
        context.options.model,
        accumulatedReasoning,
        chunk.delta,
        setLastLlmMessageId
      );
    });

    return { output, llmMessageId, accumulatedReasoning };
  }

  /**
   * Create or update the llm message for reasoning chunks.
   * Requirements: llm-integration.1.5, llm-integration.1.6, llm-integration.2.1
   */
  private upsertReasoningMessage(
    llmMessageId: number | null,
    agentId: string,
    replyToMessageId: number,
    model: string,
    accumulatedReasoning: string,
    delta: string,
    setLastLlmMessageId: (messageId: number) => void
  ): number {
    if (llmMessageId === null) {
      const llmMsg = this.messageManager.create(
        agentId,
        'llm',
        {
          data: {
            model,
            reasoning: { text: accumulatedReasoning, excluded_from_replay: true },
          },
        },
        replyToMessageId
      );
      setLastLlmMessageId(llmMsg.id);
      llmMessageId = llmMsg.id;
    } else {
      this.messageManager.update(llmMessageId, agentId, {
        data: {
          model,
          reasoning: { text: accumulatedReasoning, excluded_from_replay: true },
        },
      });
    }

    MainEventBus.getInstance().publish(
      new MessageLlmReasoningUpdatedEvent(llmMessageId, agentId, delta, accumulatedReasoning)
    );

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
      this.messageManager.setHidden(llmMessageId, agentId);
      clearLastLlmMessageId();
    }
  }

  /**
   * Handle invalid structured output.
   * Requirements: llm-integration.12.1, llm-integration.12.2
   */
  private handleInvalidStructuredOutput(
    attempt: number,
    maxAttempts: number,
    agentId: string,
    replyToMessageId: number,
    llmMessageId: number | null,
    clearLastLlmMessageId: () => void
  ): 'retry' | 'error' {
    if (llmMessageId !== null) {
      this.messageManager.setHidden(llmMessageId, agentId);
      clearLastLlmMessageId();
    }
    if (attempt < maxAttempts - 1) {
      return 'retry';
    }

    this.messageManager.create(
      agentId,
      'error',
      {
        data: {
          error: {
            type: 'provider',
            message: 'Invalid response format. Please try again later.',
          },
        },
      },
      replyToMessageId
    );
    return 'error';
  }

  /**
   * Write the final LLM action to the message.
   * Requirements: llm-integration.1.6, llm-integration.7.3
   */
  private writeFinalAction(
    agentId: string,
    replyToMessageId: number,
    llmMessageId: number | null,
    accumulatedReasoning: string,
    options: ChatOptions,
    output: LLMStructuredOutput
  ): number {
    const finalPayload = {
      data: {
        model: options.model,
        reasoning: accumulatedReasoning
          ? { text: accumulatedReasoning, excluded_from_replay: true }
          : undefined,
        action: { type: output.action.type, content: output.action.content },
        images: output.images,
      },
    };

    if (llmMessageId === null) {
      const msg = this.messageManager.create(agentId, 'llm', finalPayload, replyToMessageId);
      return msg.id;
    }

    this.messageManager.update(llmMessageId, agentId, finalPayload);
    return llmMessageId;
  }

  /**
   * Persist usage envelope in a dedicated DB column as separate step.
   * Requirements: llm-integration.13
   */
  private persistUsageEnvelope(
    messageId: number,
    agentId: string,
    output: LLMStructuredOutput
  ): void {
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
   * Requirements: llm-integration.3, llm-integration.8.7
   */
  private handleRunError(
    error: unknown,
    agentId: string,
    userMessageId: number,
    signal: AbortSignal | undefined,
    lastLlmMessageId: number | null
  ): void {
    if (signal?.aborted) {
      if (lastLlmMessageId !== null) {
        try {
          this.messageManager.setHidden(lastLlmMessageId, agentId);
        } catch {
          // ignore update errors during cancellation
        }
      }
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Pipeline error for agent ${agentId}: ${errorMessage}`);

    if (lastLlmMessageId !== null) {
      try {
        this.messageManager.setHidden(lastLlmMessageId, agentId);
      } catch {
        // ignore
      }
    }

    const errorType = classifyError(errorMessage);
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
      errorReplyTo
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

  // Requirements: llm-integration.9.1, llm-integration.9.7, llm-integration.9.8
  private validateStructuredOutput(output: LLMStructuredOutput): {
    ok: boolean;
    placeholders: Array<{ id: number; link?: string; size?: { width: number; height: number } }>;
  } {
    // Validate only model structured payload fields.
    // Provider usage envelope is handled separately via messages.usage_json.
    const parsed = safeParseStructuredOutput({
      action: output.action,
      images: output.images,
    });
    if (!parsed.success) {
      return { ok: false, placeholders: [] };
    }

    const { placeholders, invalid } = parseImagePlaceholders(parsed.data.action.content);
    if (invalid) {
      return { ok: false, placeholders };
    }

    return { ok: true, placeholders };
  }

  // Requirements: llm-integration.9.6, llm-integration.9.4
  private queueImageDownloads(
    agentId: string,
    messageId: string,
    output: LLMStructuredOutput,
    placeholders: Array<{ id: number }>
  ): void {
    const images = output.images ?? [];
    const placeholderIds = new Set(placeholders.map((p) => p.id));
    const downloaded = new Set<number>();

    for (const image of images) {
      if (downloaded.has(image.id)) continue;
      downloaded.add(image.id);
      void this.imageStorageManager.downloadAndStore(agentId, messageId, image.id, image.url);
    }

    for (const placeholderId of placeholderIds) {
      if (!downloaded.has(placeholderId)) {
        this.imageStorageManager.markMissingDescriptor(agentId, messageId, placeholderId);
      }
    }
  }
}
