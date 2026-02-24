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

// ─── Anthropic SSE event shapes ───────────────────────────────────────────────

interface AnthropicContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block: { type: 'thinking' | 'text'; thinking?: string; text?: string };
}

interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: { type: 'thinking_delta'; thinking: string } | { type: 'text_delta'; text: string };
}

interface AnthropicMessageDelta {
  type: 'message_delta';
  usage?: { output_tokens?: number };
}

interface AnthropicMessageStart {
  type: 'message_start';
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number };
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
   * Send a chat request with streaming reasoning and structured output
   * Requirements: llm-integration.3.1, llm-integration.3.2, llm-integration.3.3
   *
   * Structured output: system prompt instructs model to respond with JSON
   * { action: { type: "text", content: "..." } }
   * Reasoning (thinking) chunks are streamed via onChunk callback.
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMAction> {
    const apiUrl = process.env.CLERKLY_ANTHROPIC_API_URL ?? this.config.apiUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      // Separate system messages from conversation messages
      const systemMessages = messages.filter((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      // Build system prompt: inject JSON output instruction
      const systemBase = systemMessages.map((m) => m.content).join('\n');
      const systemPrompt =
        (systemBase ? systemBase + '\n\n' : '') +
        'Always respond with valid JSON in this exact format: {"action":{"type":"text","content":"<your response here>"}}';

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
        throw new Error(this.mapErrorToMessage(response.status, errorData));
      }

      return await this.parseStream(response, onChunk);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse Anthropic SSE stream, call onChunk for reasoning, return final LLMAction
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
    let inputTokens = 0;
    let outputTokens = 0;

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
          } else if (event.type === 'message_delta') {
            const e = event as AnthropicMessageDelta;
            outputTokens += e.usage?.output_tokens ?? 0;
          } else if (event.type === 'content_block_delta') {
            const e = event as AnthropicContentBlockDelta;
            if (e.delta.type === 'thinking_delta') {
              onChunk({ type: 'reasoning', delta: e.delta.thinking, done: false });
            } else if (e.delta.type === 'text_delta') {
              contentAccumulator += e.delta.text;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    onChunk({ type: 'reasoning', delta: '', done: true });

    const usage: LLMUsage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };

    return { ...this.parseAction(contentAccumulator), usage };
  }

  /**
   * Map reasoningEffort to Anthropic thinking budget tokens
   */
  private reasoningBudget(effort: 'low' | 'medium' | 'high'): number {
    const budgets = { low: 1024, medium: 8000, high: 16000 };
    return budgets[effort];
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
      const parsed = JSON.parse(json) as { action: { type: 'text'; content: string } };
      return { type: parsed.action.type, content: parsed.action.content };
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
}
