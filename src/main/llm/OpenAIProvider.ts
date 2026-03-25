// Requirements: settings.2.5, settings.2.6, settings.2.7, settings.2.8, llm-integration.3

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

const AI_SDK_MAX_RETRIES = 2;
const AI_SDK_MAX_STEPS = 100000;

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
   * Requirements: settings.2.5, settings.2.6, settings.2.7, settings.2.8
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
   * Requirements: llm-integration.5.1, llm-integration.5.4, llm-integration.5.5, llm-integration.5.7, llm-integration.11.5
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void,
    signal?: AbortSignal
  ): Promise<LLMChatResult> {
    // Allow runtime override via env (used by functional tests with MockLLMServer).
    // AI SDK expects baseURL without trailing `/responses`.
    const apiUrl = process.env.CLERKLY_OPENAI_API_URL ?? this.config.apiUrl;
    const baseURL = apiUrl.replace(/\/responses\/?$/, '');
    const controller = new AbortController();
    if (signal?.aborted) {
      controller.abort();
    }
    const abortFromExternalSignal = () => controller.abort();
    signal?.addEventListener('abort', abortFromExternalSignal);
    // Requirements: llm-integration.3.6, llm-integration.3.6.1
    // Timer resets on each onStepFinish so tool execution time doesn't count toward model timeout
    let timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    };
    const stepDiagnostics: Array<{
      stepIndex: number;
      finishReason?: string;
      toolCallsCount: number;
      toolResultsCount: number;
      latencyMs?: number;
      usage?: Record<string, unknown>;
    }> = [];
    const stepStartedAt = new Map<number, number>();

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
        sendReasoning: true,
        tools,
        stopWhen: stepCountIs(AI_SDK_MAX_STEPS),
        maxRetries: AI_SDK_MAX_RETRIES,
        abortSignal: controller.signal,
        onStepFinish: (event: Record<string, unknown>) => {
          // Requirements: llm-integration.3.6.1
          // Reset per-step timeout so tool execution time doesn't eat into model response time
          resetTimeout();
          const stepIndex =
            typeof event.stepNumber === 'number'
              ? event.stepNumber
              : typeof event.stepIndex === 'number'
                ? event.stepIndex
                : stepDiagnostics.length;
          const now = Date.now();
          const startedAt = stepStartedAt.get(stepIndex) ?? now;
          const toolCalls = Array.isArray(event.toolCalls) ? event.toolCalls.length : 0;
          const toolResults = Array.isArray(event.toolResults) ? event.toolResults.length : 0;
          const usage =
            event.usage && typeof event.usage === 'object'
              ? (event.usage as Record<string, unknown>)
              : undefined;
          const finishReason =
            typeof event.finishReason === 'string' ? event.finishReason : undefined;
          stepDiagnostics.push({
            stepIndex,
            finishReason,
            toolCallsCount: toolCalls,
            toolResultsCount: toolResults,
            latencyMs: Math.max(0, now - startedAt),
            usage,
          });
        },
        experimental_onStepStart: (event: Record<string, unknown>) => {
          // Requirements: llm-integration.3.6.1
          // Reset timeout at step start so tool execution between steps doesn't consume model timeout budget
          resetTimeout();
          const stepIndex =
            typeof event.stepNumber === 'number'
              ? event.stepNumber
              : typeof event.stepIndex === 'number'
                ? event.stepIndex
                : stepDiagnostics.length;
          stepStartedAt.set(stepIndex, Date.now());
        },
        providerOptions: {
          openai: {
            ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
            reasoningSummary: 'auto',
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
          const callId = this.normalizeToolCallId(part.toolCallId, part.toolName);
          onChunk({
            type: 'tool_call',
            callId,
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
          const callId = this.normalizeToolCallId(part.toolCallId, part.toolName);
          onChunk({
            type: 'tool_result',
            callId,
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
          const callId = this.normalizeToolCallId(part.toolCallId, part.toolName);
          onChunk({
            type: 'tool_result',
            callId,
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

      return { text: textAccumulator, usage, stepDiagnostics };
    } catch (error) {
      if (isAbortLikeError(error) || this.isSdkAbortLikeError(error)) {
        throw new LLMRequestAbortedError(this.mapExceptionToMessage(error), error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromExternalSignal);
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
   * Requirements: settings.2.8
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
   * Requirements: settings.2.8
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

  private normalizeToolCallId(rawCallId: string | undefined, toolName: string | undefined): string {
    if (typeof rawCallId === 'string' && rawCallId.trim().length > 0) {
      return rawCallId;
    }
    const safeToolName =
      typeof toolName === 'string' && toolName.trim().length > 0 ? toolName.trim() : 'tool';
    return `call-${safeToolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
