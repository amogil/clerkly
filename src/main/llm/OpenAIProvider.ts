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

/**
 * OpenAI LLM provider implementation
 * Supports testConnection() and chat() with streaming reasoning/text + tool calling
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
      const maxOutputTokens = Math.max(16, this.config.testMaxTokens);
      const testBody = {
        model: this.config.testModel,
        input: [{ role: 'user', content: 'Return JSON: {"ok": true}' }],
        max_output_tokens: maxOutputTokens,
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
   * Send a chat request with streaming reasoning/text and native tool-calling events.
   * Requirements: llm-integration.5.1, llm-integration.5.4, llm-integration.5.5, llm-integration.5.7
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMChatResult> {
    // Allow runtime override via env (used by functional tests with MockLLMServer).
    // AI SDK expects baseURL without trailing `/responses`.
    const apiUrl = process.env.CLERKLY_OPENAI_API_URL ?? this.config.apiUrl;
    const baseURL = apiUrl.replace(/\/responses\/?$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      if (typeof (globalThis as { TransformStream?: unknown }).TransformStream === 'undefined') {
        const webStreams = await import('stream/web');
        (globalThis as { TransformStream?: unknown }).TransformStream = webStreams.TransformStream;
      }
      if (typeof (globalThis as { ReadableStream?: unknown }).ReadableStream === 'undefined') {
        const webStreams = await import('stream/web');
        (globalThis as { ReadableStream?: unknown }).ReadableStream = webStreams.ReadableStream;
      }

      const { streamText, tool, jsonSchema, stepCountIs } = await import('ai');
      const stopWhen = typeof stepCountIs === 'function' ? stepCountIs(5) : undefined;
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({ apiKey: this.apiKey, baseURL });
      const tools = this.buildToolSet(
        options,
        tool as unknown as (definition: { description: string; inputSchema: unknown }) => unknown,
        jsonSchema as unknown as (schema: Record<string, unknown>) => unknown
      );
      const result = streamText({
        model: openai.responses(options.model) as unknown as Parameters<
          typeof streamText
        >[0]['model'],
        messages: messages as unknown as Parameters<typeof streamText>[0]['messages'],
        tools,
        ...(stopWhen ? { stopWhen } : {}),
        maxRetries: 0,
        abortSignal: controller.signal,
        providerOptions: {
          openai: {
            ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
            strictJsonSchema: true,
            parallelToolCalls: true,
          },
        },
      } as unknown as Parameters<typeof streamText>[0]);

      let textAccumulator = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          textAccumulator += part.text;
          onChunk({ type: 'text', delta: part.text });
          continue;
        }
        if (part.type === 'reasoning-delta') {
          onChunk({ type: 'reasoning', delta: part.text });
          continue;
        }
        if (part.type === 'tool-call') {
          const args =
            part.input && typeof part.input === 'object' && !Array.isArray(part.input)
              ? (part.input as Record<string, unknown>)
              : {};
          onChunk({
            type: 'tool_call',
            callId: part.toolCallId ?? '',
            toolName: part.toolName ?? '',
            arguments: args,
          });
          continue;
        }
        if (part.type === 'tool-result') {
          const args =
            part.input && typeof part.input === 'object' && !Array.isArray(part.input)
              ? (part.input as Record<string, unknown>)
              : {};
          onChunk({
            type: 'tool_result',
            callId: part.toolCallId ?? '',
            toolName: part.toolName ?? '',
            arguments: args,
            output: part.output,
            status: 'success',
          });
          continue;
        }
        if (part.type === 'tool-error') {
          const args =
            part.input && typeof part.input === 'object' && !Array.isArray(part.input)
              ? (part.input as Record<string, unknown>)
              : {};
          const errorText =
            typeof part.error === 'string'
              ? part.error
              : part.error instanceof Error
                ? part.error.message
                : 'Tool execution failed';
          onChunk({
            type: 'tool_result',
            callId: part.toolCallId ?? '',
            toolName: part.toolName ?? '',
            arguments: args,
            output: { message: errorText },
            status: 'error',
          });
          continue;
        }
        if (part.type === 'error') {
          const message =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : ERROR_MESSAGES.unknown;
          onChunk({ type: 'turn_error', errorType: 'provider', message });
          throw new Error(message);
        }
      }

      const totalUsage = await result.totalUsage;
      const usage: LLMUsage = {
        canonical: {
          input_tokens: totalUsage.inputTokens ?? 0,
          output_tokens: totalUsage.outputTokens ?? 0,
          total_tokens:
            totalUsage.totalTokens ??
            (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0),
          cached_tokens: totalUsage.cachedInputTokens ?? undefined,
          reasoning_tokens: totalUsage.reasoningTokens ?? undefined,
        },
        raw: totalUsage as unknown as Record<string, unknown>,
      };

      return { text: textAccumulator, usage };
    } catch (error) {
      if (isAbortLikeError(error) || this.isSdkAbortLikeError(error)) {
        throw new LLMRequestAbortedError(this.mapExceptionToMessage(error), error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildToolSet(
    options: ChatOptions,
    toolFactory: (definition: {
      description: string;
      inputSchema: unknown;
      execute?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown> | unknown;
    }) => unknown,
    jsonSchemaFactory: (schema: Record<string, unknown>) => unknown
  ): Record<string, unknown> | undefined {
    if (!options.tools || options.tools.length === 0) {
      return undefined;
    }

    const entries = options.tools.map((toolDef) => [
      toolDef.name,
      toolFactory({
        description: toolDef.description,
        inputSchema: jsonSchemaFactory(toolDef.parameters),
        execute: toolDef.execute,
      }),
    ]);
    return Object.fromEntries(entries);
  }

  private isSdkAbortLikeError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    if ('cause' in error && isAbortLikeError(error.cause)) {
      return true;
    }

    if ('message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      return message.includes('abort') || message.includes('timed out');
    }

    return false;
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
