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
 * Google Gemini LLM provider implementation
 * Uses AI SDK streamText for chat, manual fetch for testConnection
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
   * Requirements: settings.2.5, settings.2.6, settings.2.7, settings.2.8
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
   * Send a chat request with streaming reasoning/text and native tool-calling events.
   * Requirements: llm-integration.5.1, llm-integration.5.4, llm-integration.5.5, llm-integration.5.7, llm-integration.11.5
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void,
    signal?: AbortSignal
  ): Promise<LLMChatResult> {
    const apiUrl = process.env.CLERKLY_GOOGLE_LLM_API_URL ?? this.config.apiUrl;
    const baseURL = apiUrl.replace(/\/models\/.*$/, '');
    const controller = new AbortController();
    if (signal?.aborted) {
      controller.abort();
    }
    const abortFromExternalSignal = () => controller.abort();
    signal?.addEventListener('abort', abortFromExternalSignal);
    // Requirements: llm-integration.3.6, llm-integration.3.6.1
    // Timer resets on each onStepFinish and experimental_onStepStart so tool execution time doesn't count toward model timeout.
    // pauseTimeout/resumeTimeout ensure intra-step tool execution does not consume the timeout budget.
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
      () => controller.abort(),
      CHAT_TIMEOUT_MS
    );
    const pauseTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    const resumeTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
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
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');

      const google = createGoogleGenerativeAI({ apiKey: this.apiKey, baseURL });
      const tools = this.buildToolSet(
        options,
        tool as unknown as (definition: { description: string; inputSchema: unknown }) => unknown,
        jsonSchema as unknown as (schema: Record<string, unknown>) => unknown,
        pauseTimeout,
        resumeTimeout
      );

      const result = streamText({
        model: google.chat(options.model) as unknown as Parameters<typeof streamText>[0]['model'],
        messages: messages as unknown as Parameters<typeof streamText>[0]['messages'],
        sendReasoning: true,
        tools,
        stopWhen: stepCountIs(AI_SDK_MAX_STEPS),
        maxRetries: AI_SDK_MAX_RETRIES,
        abortSignal: controller.signal,
        onStepFinish: (event: Record<string, unknown>) => {
          // Requirements: llm-integration.3.6.1
          // Reset per-step timeout so tool execution time doesn't eat into model response time
          resumeTimeout();
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
          resumeTimeout();
          const stepIndex =
            typeof event.stepNumber === 'number'
              ? event.stepNumber
              : typeof event.stepIndex === 'number'
                ? event.stepIndex
                : stepDiagnostics.length;
          stepStartedAt.set(stepIndex, Date.now());
        },
        providerOptions: {
          google: {
            ...(options.reasoningEffort
              ? {
                  thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: this.reasoningBudget(options.reasoningEffort),
                  },
                }
              : {}),
            ...(options.tools && options.tools.length > 0
              ? {
                  functionCallingConfig: {
                    mode: 'VALIDATED',
                  },
                }
              : {}),
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
          // Requirements: llm-integration.3.11
          // Preserve the original error object so that ErrorNormalizer can extract
          // statusCode, name (AI_RetryError, AI_APICallError), lastError, etc.
          // from the real AI SDK error chain.
          // NOTE: We throw the original error BEFORE calling onChunk because
          // the onChunk callback for 'turn_error' throws a plain Error(message)
          // which would mask the rich SDK error structure.
          if (part.error instanceof Error) {
            throw part.error;
          }
          const message = typeof part.error === 'string' ? part.error : ERROR_MESSAGES.unknown;
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
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      signal?.removeEventListener('abort', abortFromExternalSignal);
    }
  }

  // Requirements: llm-integration.3.6.1
  private buildToolSet(
    options: ChatOptions,
    toolFactory: (definition: {
      description: string;
      inputSchema: unknown;
      execute?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown> | unknown;
    }) => unknown,
    jsonSchemaFactory: (schema: Record<string, unknown>) => unknown,
    pauseTimeout: () => void,
    resumeTimeout: () => void
  ): Record<string, unknown> | undefined {
    if (!options.tools || options.tools.length === 0) {
      return undefined;
    }

    const entries = options.tools.map((toolDef) => {
      // Wrap execute to pause/resume timeout so tool execution time
      // does not count toward the CHAT_TIMEOUT_MS budget
      const wrappedExecute = toolDef.execute
        ? async (args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
            pauseTimeout();
            try {
              return await (
                toolDef.execute as (
                  args: Record<string, unknown>,
                  signal?: AbortSignal
                ) => Promise<unknown> | unknown
              )(args, signal);
            } finally {
              resumeTimeout();
            }
          }
        : undefined;
      return [
        toolDef.name,
        toolFactory({
          description: toolDef.description,
          inputSchema: jsonSchemaFactory(toolDef.parameters),
          execute: wrappedExecute,
        }),
      ];
    });
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

  private reasoningBudget(effort: 'low' | 'medium' | 'high'): number {
    const budgets = { low: 1024, medium: 8000, high: 16000 };
    return budgets[effort];
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
}
