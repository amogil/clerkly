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
  getStructuredOutputJsonSchema,
  safeParseStructuredOutput,
} from './StructuredOutputContract';

// ─── Google Gemini SSE event shapes ──────────────────────────────────────────

interface GeminiPart {
  text: string;
  thought?: boolean;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Google Gemini LLM provider implementation
 * Uses native HTTP+SSE for chat, manual fetch for testConnection
 *
 * Requirements: settings.3, llm-integration.3
 */
export class GoogleProvider implements ILLMProvider {
  private config = LLM_PROVIDERS.google;
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  getProviderName(): string {
    return this.config.name;
  }

  /**
   * Test connection to Google Generative AI API
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      const response = await fetch(`${this.config.apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
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
   * Uses streamGenerateContent endpoint with alt=sse.
   * Structured output: system instruction tells model to respond with JSON
   * { action: { type: "text", content: "..." } }
   * Thinking chunks (thought: true) are streamed via onChunk callback.
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMStructuredOutput> {
    // Build streaming URL: replace generateContent with streamGenerateContent
    const baseApiUrl = process.env.CLERKLY_GOOGLE_LLM_API_URL ?? this.config.apiUrl;
    const streamUrl =
      baseApiUrl.replace('generateContent', 'streamGenerateContent') +
      `?key=${this.apiKey}&alt=sse`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      // Separate system messages
      const systemMessages = messages.filter((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      const systemBase = systemMessages.map((m) => m.content).join('\n');
      const structuredInstruction = buildStructuredOutputInstruction();
      const systemInstruction = (systemBase ? systemBase + '\n\n' : '') + structuredInstruction;

      // Map to Gemini contents format
      const contents = conversationMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const body: Record<string, unknown> = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: getStructuredOutputJsonSchema(),
        },
      };

      if (options.reasoningEffort) {
        body.generationConfig = {
          ...(body.generationConfig as object),
          thinkingConfig: {
            thinkingBudget: this.reasoningBudget(options.reasoningEffort),
          },
        };
      }

      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse Gemini SSE stream, call onChunk for reasoning, return final LLMAction
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
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          let chunk: GeminiStreamChunk;
          try {
            chunk = JSON.parse(data) as GeminiStreamChunk;
          } catch {
            continue;
          }

          if (chunk.usageMetadata) {
            usage = {
              canonical: {
                input_tokens: chunk.usageMetadata.promptTokenCount ?? 0,
                output_tokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                total_tokens: chunk.usageMetadata.totalTokenCount ?? 0,
              },
              raw: chunk.usageMetadata as Record<string, unknown>,
            };
          }

          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.thought) {
              onChunk({ type: 'reasoning', delta: part.text, done: false });
            } else {
              contentAccumulator += part.text;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    onChunk({ type: 'reasoning', delta: '', done: true });

    return { ...this.parseAction(contentAccumulator), usage };
  }

  /**
   * Map reasoningEffort to Gemini thinking budget tokens
   */
  private reasoningBudget(effort: 'low' | 'medium' | 'high'): number {
    const budgets = { low: 1024, medium: 8000, high: 16000 };
    return budgets[effort];
  }

  /**
   * Parse structured output JSON into structured action
   * Requirements: llm-integration.3.3
   */
  private parseAction(json: string): LLMStructuredOutput {
    if (!json.trim()) {
      throw new Error('Empty response from LLM');
    }
    try {
      const parsedJson = JSON.parse(json) as unknown;
      const parsed = safeParseStructuredOutput(parsedJson);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }
      return parsed.data;
    } catch {
      throw new Error(`Failed to parse LLM response: ${json}`);
    }
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
