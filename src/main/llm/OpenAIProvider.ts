// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8, llm-integration.3

import {
  ILLMProvider,
  TestConnectionResult,
  ChatMessage,
  ChatOptions,
  ChatChunk,
  LLMAction,
  LLMUsage,
} from './ILLMProvider';
import { LLM_PROVIDERS, ERROR_MESSAGES, CHAT_TIMEOUT_MS } from './LLMConfig';

/**
 * OpenAI SSE event data shape
 */
interface OpenAIStreamDelta {
  reasoning?: string;
  content?: string;
}

interface OpenAIStreamChoice {
  delta: OpenAIStreamDelta;
  finish_reason?: string | null;
}

interface OpenAIStreamChunk {
  choices: OpenAIStreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/**
 * OpenAI structured output action schema
 */
interface OpenAIAction {
  type: 'text';
  content: string;
}

/**
 * OpenAI LLM provider implementation
 * Supports testConnection() and chat() with streaming reasoning + structured output
 *
 * Requirements: settings.3, llm-integration.3
 */
export class OpenAIProvider implements ILLMProvider {
  private config = LLM_PROVIDERS.openai;
  private apiKey: string;

  /**
   * @param apiKey - OpenAI API key. Pass empty string for test-connection-only usage.
   */
  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  getProviderName(): string {
    return this.config.name;
  }

  /**
   * Test connection to OpenAI API
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
   * Send a chat request with streaming reasoning and structured output
   * Requirements: llm-integration.3.1, llm-integration.3.2, llm-integration.3.3
   *
   * Structured output JSON schema: { action: { type: "text", content: "..." } }
   * Reasoning chunks are streamed via onChunk callback.
   * Action (JSON) is received whole at the end.
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMAction> {
    // Allow runtime override via env (used by functional tests with MockLLMServer)
    const apiUrl = process.env.CLERKLY_OPENAI_API_URL ?? this.config.apiUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: options.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        // Structured output: action with type and content
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'action',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                action: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['text'] },
                    content: { type: 'string' },
                  },
                  required: ['type', 'content'],
                  additionalProperties: false,
                },
              },
              required: ['action'],
              additionalProperties: false,
            },
          },
        },
      };

      if (options.reasoningEffort) {
        body.reasoning_effort = options.reasoningEffort;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(this.mapErrorToMessage(response.status, errorData));
      }

      return await this.parseStream(response, onChunk);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse SSE stream, call onChunk for reasoning, return final LLMAction
   * Requirements: llm-integration.3.2, llm-integration.3.3
   */
  private async parseStream(
    response: Response,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMAction> {
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
    let usage: LLMUsage | undefined;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(data) as OpenAIStreamChunk;
          } catch {
            continue;
          }

          // Capture usage from the final chunk
          if (chunk.usage) {
            usage = this.mapUsage(chunk.usage);
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Stream reasoning chunks
          if (delta.reasoning) {
            onChunk({ type: 'reasoning', delta: delta.reasoning, done: false });
          }

          // Accumulate content (structured output JSON)
          if (delta.content) {
            contentAccumulator += delta.content;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Signal reasoning done
    onChunk({ type: 'reasoning', delta: '', done: true });

    // Parse structured output
    const action = this.parseAction(contentAccumulator);
    return { ...action, usage };
  }

  /**
   * Parse structured output JSON into LLMAction
   * Requirements: llm-integration.3.3
   */
  private parseAction(json: string): LLMAction {
    if (!json.trim()) {
      throw new Error('Empty response from LLM');
    }
    try {
      const parsed = JSON.parse(json) as { action: OpenAIAction };
      return { type: parsed.action.type, content: parsed.action.content };
    } catch {
      throw new Error(`Failed to parse LLM response: ${json}`);
    }
  }

  /**
   * Map OpenAI usage object to LLMUsage
   * Requirements: llm-integration.3.3
   */
  private mapUsage(raw: OpenAIStreamChunk['usage']): LLMUsage {
    return {
      input_tokens: raw?.prompt_tokens ?? 0,
      output_tokens: raw?.completion_tokens ?? 0,
      total_tokens: raw?.total_tokens ?? 0,
      cached_tokens: raw?.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: raw?.completion_tokens_details?.reasoning_tokens,
    };
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
}
