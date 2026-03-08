// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8, llm-integration.3

import {
  ILLMProvider,
  TestConnectionResult,
  ChatMessage,
  ChatOptions,
  ChatChunk,
  LLMChatResult,
  LLMUsage,
} from './ILLMProvider';
import { LLM_PROVIDERS, ERROR_MESSAGES, CHAT_TIMEOUT_MS } from './LLMConfig';
import { LLMRequestAbortedError, isAbortLikeError } from './LLMErrors';

// ─── Anthropic SSE event shapes ───────────────────────────────────────────────

interface AnthropicContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'thinking'; thinking?: string }
    | { type: 'text'; text?: string }
    | {
        type: 'tool_use';
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      };
}

interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string };
}

interface AnthropicMessageDelta {
  type: 'message_delta';
  usage?: Record<string, unknown> & { output_tokens?: number };
}

interface AnthropicMessageStart {
  type: 'message_start';
  message?: {
    usage?: Record<string, unknown> & { input_tokens?: number; output_tokens?: number };
  };
}

type AnthropicSSEEvent =
  | AnthropicContentBlockStart
  | AnthropicContentBlockDelta
  | AnthropicMessageDelta
  | AnthropicMessageStart
  | { type: string };

/**
 * Anthropic LLM provider implementation
 * Uses native HTTP+SSE for chat, manual fetch for testConnection
 *
 * Requirements: settings.3, llm-integration.3
 */
export class AnthropicProvider implements ILLMProvider {
  private config = LLM_PROVIDERS.anthropic;
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  getProviderName(): string {
    return this.config.name;
  }

  /**
   * Test connection to Anthropic API
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.testModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: this.config.testMaxTokens,
        }),
        signal: AbortSignal.timeout(this.config.testTimeoutMs),
      });

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: this.mapErrorToMessage(response.status, errorData) };
    } catch (error) {
      return { success: false, error: this.mapExceptionToMessage(error) };
    }
  }

  /**
   * Send a chat request with streaming reasoning/text deltas.
   * Requirements: llm-integration.3.1, llm-integration.3.2, llm-integration.3.3
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMChatResult> {
    const apiUrl = process.env.CLERKLY_ANTHROPIC_API_URL ?? this.config.apiUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      // Separate system messages from conversation messages
      const systemMessages = messages.filter((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      const systemPrompt = systemMessages.map((m) => m.content).join('\n');

      const body: Record<string, unknown> = {
        model: options.model,
        max_tokens: 16000,
        system: systemPrompt,
        messages: conversationMessages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      };

      if (options.reasoningEffort) {
        body.thinking = {
          type: 'enabled',
          budget_tokens: this.reasoningBudget(options.reasoningEffort),
        };
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const retryAfterSeconds = this.parseRetryAfterHeader(response);
        if (response.status === 429 && retryAfterSeconds !== null) {
          throw new Error(`Rate limit exceeded. Please try again in ${retryAfterSeconds}s`);
        }
        if (response.status === 429) {
          const providerMessage = this.extractErrorMessage(errorData);
          if (providerMessage) {
            throw new Error(providerMessage);
          }
        }
        throw new Error(this.mapErrorToMessage(response.status, errorData));
      }

      return await this.parseStream(response, onChunk);
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw new LLMRequestAbortedError(this.mapExceptionToMessage(error), error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse Anthropic SSE stream, call onChunk for deltas, return final text.
   * Requirements: llm-integration.3.2, llm-integration.3.3
   */
  private async parseStream(
    response: Response,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMChatResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder =
      typeof TextDecoder !== 'undefined'
        ? new TextDecoder()
        : { decode: (v: Uint8Array, _opts?: unknown) => Buffer.from(v).toString('utf-8') };

    let buffer = '';
    let contentAccumulator = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let rawUsage: Record<string, unknown> = {};
    const pendingToolCallsByIndex = new Map<
      number,
      { callId: string; toolName: string; inputJsonText: string }
    >();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          let event: AnthropicSSEEvent;
          try {
            event = JSON.parse(data) as AnthropicSSEEvent;
          } catch {
            continue;
          }

          if (event.type === 'message_start') {
            const e = event as AnthropicMessageStart;
            inputTokens = e.message?.usage?.input_tokens ?? 0;
            outputTokens = e.message?.usage?.output_tokens ?? 0;
            if (e.message?.usage && typeof e.message.usage === 'object') {
              rawUsage = { ...rawUsage, ...(e.message.usage as Record<string, unknown>) };
            }
          } else if (event.type === 'message_delta') {
            const e = event as AnthropicMessageDelta;
            outputTokens += e.usage?.output_tokens ?? 0;
            if (e.usage && typeof e.usage === 'object') {
              rawUsage = { ...rawUsage, ...(e.usage as Record<string, unknown>) };
            }
          } else if (event.type === 'content_block_delta') {
            const e = event as AnthropicContentBlockDelta;
            if (e.delta.type === 'thinking_delta') {
              onChunk({ type: 'reasoning', delta: e.delta.thinking });
            } else if (e.delta.type === 'text_delta') {
              contentAccumulator += e.delta.text;
              onChunk({ type: 'text', delta: e.delta.text });
            } else if (e.delta.type === 'input_json_delta') {
              const pending = pendingToolCallsByIndex.get(e.index);
              if (pending) {
                pending.inputJsonText += e.delta.partial_json;
              }
            }
          } else if (event.type === 'content_block_start') {
            const e = event as AnthropicContentBlockStart;
            if (e.content_block.type === 'tool_use') {
              const toolCall = {
                callId: e.content_block.id ?? '',
                toolName: e.content_block.name ?? '',
                inputJsonText:
                  e.content_block.input && Object.keys(e.content_block.input).length > 0
                    ? JSON.stringify(e.content_block.input)
                    : '',
              };
              pendingToolCallsByIndex.set(e.index, toolCall);
            }
          } else if (event.type === 'content_block_stop') {
            const stopEvent = event as { type: 'content_block_stop'; index?: number };
            const index = typeof stopEvent.index === 'number' ? stopEvent.index : -1;
            const pending = pendingToolCallsByIndex.get(index);
            if (pending) {
              let args: Record<string, unknown> = {};
              try {
                const parsed = JSON.parse(pending.inputJsonText) as unknown;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  args = parsed as Record<string, unknown>;
                }
              } catch {
                args = {};
              }

              onChunk({
                type: 'tool_call',
                callId: pending.callId,
                toolName: pending.toolName,
                arguments: args,
              });
              pendingToolCallsByIndex.delete(index);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const usage: LLMUsage = {
      canonical: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      raw: rawUsage,
    };

    return { text: contentAccumulator, usage };
  }

  /**
   * Map reasoningEffort to Anthropic thinking budget tokens
   */
  private reasoningBudget(effort: 'low' | 'medium' | 'high'): number {
    const budgets = { low: 1024, medium: 8000, high: 16000 };
    return budgets[effort];
  }

  /**
   * Map HTTP status code to user-friendly error message
   * Requirements: settings.3.8
   */
  private mapErrorToMessage(status: number, errorData: unknown): string {
    const message = ERROR_MESSAGES[status as keyof typeof ERROR_MESSAGES];
    if (message) return message;
    const errorMessage =
      typeof errorData === 'object' &&
      errorData !== null &&
      'error' in errorData &&
      typeof (errorData as { error?: { message?: string } }).error === 'object' &&
      (errorData as { error?: { message?: string } }).error !== null &&
      'message' in (errorData as { error: { message?: string } }).error
        ? (errorData as { error: { message: string } }).error.message
        : ERROR_MESSAGES.unknown;
    return `Connection failed: ${errorMessage}`;
  }

  /**
   * Map exception to user-friendly error message
   * Requirements: settings.3.8
   */
  private mapExceptionToMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      return ERROR_MESSAGES.timeout;
    }
    return ERROR_MESSAGES.network;
  }

  private extractErrorMessage(errorData: unknown): string | null {
    if (
      typeof errorData === 'object' &&
      errorData !== null &&
      'error' in errorData &&
      typeof (errorData as { error?: { message?: string } }).error === 'object' &&
      (errorData as { error?: { message?: string } }).error !== null &&
      'message' in (errorData as { error: { message?: string } }).error
    ) {
      const message = (errorData as { error: { message?: string } }).error.message;
      return typeof message === 'string' && message.trim().length > 0 ? message : null;
    }
    return null;
  }

  private parseRetryAfterHeader(response: Response): number | null {
    const headers = response.headers as Headers | undefined;
    if (!headers || typeof headers.get !== 'function') {
      return null;
    }
    const retryAfter = headers.get('retry-after');
    if (!retryAfter) {
      return null;
    }
    const parsed = Number(retryAfter);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.ceil(parsed);
  }
}
