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
import type { ILLMProvider, ChatOptions } from '../llm/ILLMProvider';

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
    // Track the created llm message id (null until first chunk arrives)
    let llmMessageId: number | null = null;
    let accumulatedReasoning = '';

    try {
      // ── 1. Load settings ──────────────────────────────────────────────────
      const provider = await this.settingsManager.loadLLMProvider();
      const apiKey = await this.settingsManager.loadAPIKey(provider);

      if (!apiKey) {
        throw new Error('Invalid API key. Please check your key and try again.');
      }

      // ── 2. Check cancellation before starting ─────────────────────────────
      if (signal?.aborted) return;

      // ── 3. Build prompt ───────────────────────────────────────────────────
      const messages = this.messageManager.list(agentId);
      const chatMessages = this.promptBuilder.buildMessages(messages);

      // ── 4. Determine reply_to_message_id ──────────────────────────────────
      // The llm message replies to the user message that triggered it
      const replyToMessageId = userMessageId;

      // ── 5. Determine model and options ───────────────────────────────────
      const options = this.resolveOptions(provider);

      // ── 6. Create LLM provider ────────────────────────────────────────────
      const llmProvider = this.createProvider(provider, apiKey);

      // ── 7. Call LLM with streaming ────────────────────────────────────────
      const action = await llmProvider.chat(chatMessages, options, (chunk) => {
        if (signal?.aborted) return;

        if (chunk.type === 'reasoning' && !chunk.done && chunk.delta) {
          accumulatedReasoning += chunk.delta;

          if (llmMessageId === null) {
            // Create the llm message on first reasoning chunk
            const llmMsg = this.messageManager.create(
              agentId,
              'llm',
              {
                data: {
                  model: options.model,
                  reasoning: { text: accumulatedReasoning, excluded_from_replay: true },
                },
              },
              replyToMessageId
            );
            llmMessageId = llmMsg.id;
          } else {
            // Update reasoning in existing message
            this.messageManager.update(llmMessageId, agentId, {
              data: {
                model: options.model,
                reasoning: { text: accumulatedReasoning, excluded_from_replay: true },
              },
            });
          }

          // Emit reasoning-specific event
          MainEventBus.getInstance().publish(
            new MessageLlmReasoningUpdatedEvent(
              llmMessageId!,
              agentId,
              chunk.delta,
              accumulatedReasoning
            )
          );
        }
      });

      // ── 8. Check cancellation after streaming ─────────────────────────────
      if (signal?.aborted) {
        if (llmMessageId !== null) {
          // Hide the partial llm message — Requirements: llm-integration.8.5
          this.messageManager.setHidden(llmMessageId, agentId);
        }
        return;
      }

      // ── 9. Write final action ─────────────────────────────────────────────
      const finalPayload = {
        data: {
          model: options.model,
          reasoning: accumulatedReasoning
            ? { text: accumulatedReasoning, excluded_from_replay: true }
            : undefined,
          action: { type: action.type, content: action.content },
          usage: action.usage,
        },
      };

      if (llmMessageId === null) {
        // No reasoning chunks — create message now
        this.messageManager.create(agentId, 'llm', finalPayload, replyToMessageId);
      } else {
        this.messageManager.update(llmMessageId, agentId, finalPayload);
      }

      this.logger.info(`Pipeline completed for agent ${agentId}`);
    } catch (error) {
      if (signal?.aborted) {
        // Cancelled — hide llm message if created, no error message
        // Requirements: llm-integration.8.7
        if (llmMessageId !== null) {
          try {
            this.messageManager.setHidden(llmMessageId, agentId);
          } catch {
            // ignore update errors during cancellation
          }
        }
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Pipeline error for agent ${agentId}: ${errorMessage}`);

      // Hide existing llm message — Requirements: llm-integration.3.2
      if (llmMessageId !== null) {
        try {
          this.messageManager.setHidden(llmMessageId, agentId);
        } catch {
          // ignore
        }
      }

      // Create error message
      const errorType = classifyError(errorMessage);
      const errorReplyTo = userMessageId;

      // Rate limit — emit event for UI banner instead of kind:error message
      // Requirements: llm-integration.3.7
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
}
