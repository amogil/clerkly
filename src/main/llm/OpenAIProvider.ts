// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8, llm-integration.3

import {
  ILLMProvider,
  TestConnectionResult,
  ChatMessage,
  ChatOptions,
  ChatChunk,
  LLMStructuredOutput,
  LLMUsage,
} from './ILLMProvider';
import { LLM_PROVIDERS, ERROR_MESSAGES, CHAT_TIMEOUT_MS } from './LLMConfig';
import {
  buildStructuredOutputInstruction,
  getOpenAIStructuredOutputJsonSchema,
  safeParseStructuredOutput,
} from './StructuredOutputContract';

interface OpenAIResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface OpenAIResponsesEvent {
  type?: string;
  delta?: string;
  text?: string;
  response?: {
    usage?: OpenAIResponsesUsage;
  };
  usage?: OpenAIResponsesUsage;
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
      const testBody = {
        model: this.config.testModel,
        input: [{ role: 'user', content: 'test' }],
        max_output_tokens: this.config.testMaxTokens,
        text: { format: { type: 'json_object' } },
      };
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testBody),
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
  ): Promise<LLMStructuredOutput> {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');
    const systemBase = systemMessages.map((m) => m.content).join('\n');
    const structuredInstruction = buildStructuredOutputInstruction();
    const mergedSystemPrompt = [systemBase, structuredInstruction].filter(Boolean).join('\n\n');
    const requestMessages: ChatMessage[] = mergedSystemPrompt
      ? [{ role: 'system', content: mergedSystemPrompt }, ...conversationMessages]
      : conversationMessages;

    // Allow runtime override via env (used by functional tests with MockLLMServer)
    const apiUrl = process.env.CLERKLY_OPENAI_API_URL ?? this.config.apiUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: options.model,
        input: requestMessages,
        stream: true,
        text: {
          format: {
            type: 'json_schema',
            strict: true,
            name: 'structured_output',
            schema: getOpenAIStructuredOutputJsonSchema(),
          },
        },
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
      };

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
        const retryAfterSeconds = this.parseRetryAfterHeader(response);
        if (response.status === 429 && retryAfterSeconds !== null) {
          throw new Error(`Rate limit exceeded. Please try again in ${retryAfterSeconds}s`);
        }
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
  ): Promise<LLMStructuredOutput> {
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

          let event: OpenAIResponsesEvent;
          try {
            event = JSON.parse(data) as OpenAIResponsesEvent;
          } catch {
            continue;
          }

          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            contentAccumulator += event.delta;
          }

          if (
            typeof event.type === 'string' &&
            event.type.includes('reasoning') &&
            typeof event.delta === 'string' &&
            event.delta.length > 0
          ) {
            onChunk({ type: 'reasoning', delta: event.delta, done: false });
          }

          if (event.type === 'response.completed') {
            const completedUsage = event.response?.usage ?? event.usage;
            if (completedUsage) {
              usage = this.mapResponsesUsage(completedUsage);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Signal reasoning done
    onChunk({ type: 'reasoning', delta: '', done: true });

    // Parse structured output
    const output = this.parseAction(contentAccumulator);
    return { ...output, usage };
  }

  /**
   * Parse structured output JSON into LLMAction
   * Requirements: llm-integration.3.3, llm-integration.9.8
   */
  private parseAction(json: string): LLMStructuredOutput {
    if (!json.trim()) {
      throw new Error('Empty response from LLM');
    }
    try {
      const parsedJson = JSON.parse(json) as unknown;
      const normalized = this.normalizeNullableImageFields(parsedJson);
      const parsed = safeParseStructuredOutput(normalized);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }
      return parsed.data;
    } catch {
      throw new Error(`Failed to parse LLM response: ${json}`);
    }
  }

  private normalizeNullableImageFields(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
      return value;
    }
    const root = value as Record<string, unknown>;
    const images = root['images'];
    if (!Array.isArray(images)) {
      return value;
    }
    root['images'] = images.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const image = { ...(item as Record<string, unknown>) };
      if (image['alt'] === null) {
        delete image['alt'];
      }
      if (image['link'] === null) {
        delete image['link'];
      }
      return image;
    });
    return root;
  }

  private mapResponsesUsage(raw: OpenAIResponsesUsage): LLMUsage {
    const canonical = {
      input_tokens: raw.input_tokens ?? 0,
      output_tokens: raw.output_tokens ?? 0,
      total_tokens: raw.total_tokens ?? 0,
      cached_tokens: raw.input_tokens_details?.cached_tokens,
      reasoning_tokens: raw.output_tokens_details?.reasoning_tokens,
    };

    return {
      canonical,
      raw: raw as Record<string, unknown>,
    };
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
