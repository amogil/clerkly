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

/**
 * Anthropic LLM provider implementation
 * Uses AI SDK streamText for chat, manual fetch for testConnection
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
   * Requirements: settings.2.5, settings.2.6, settings.2.7, settings.2.8
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
   * Send a chat request with streaming reasoning/text and native tool-calling events.
   * Requirements: llm-integration.5.1, llm-integration.5.4, llm-integration.5.5, llm-integration.5.7
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMChatResult> {
    const apiUrl = process.env.CLERKLY_ANTHROPIC_API_URL ?? this.config.apiUrl;
    const baseURL = apiUrl.replace(/\/messages\/?$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
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

      const { streamText, tool, jsonSchema } = await import('ai');
      const { createAnthropic } = await import('@ai-sdk/anthropic');

      const anthropic = createAnthropic({ apiKey: this.apiKey, baseURL });
      const tools = this.buildToolSet(
        options,
        tool as unknown as (definition: { description: string; inputSchema: unknown }) => unknown,
        jsonSchema as unknown as (schema: Record<string, unknown>) => unknown
      );

      const result = streamText({
        model: anthropic.messages(options.model) as unknown as Parameters<
          typeof streamText
        >[0]['model'],
        messages: messages as unknown as Parameters<typeof streamText>[0]['messages'],
        sendReasoning: true,
        tools,
        maxRetries: AI_SDK_MAX_RETRIES,
        abortSignal: controller.signal,
        onStepFinish: (event: Record<string, unknown>) => {
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
          const stepIndex =
            typeof event.stepNumber === 'number'
              ? event.stepNumber
              : typeof event.stepIndex === 'number'
                ? event.stepIndex
                : stepDiagnostics.length;
          stepStartedAt.set(stepIndex, Date.now());
        },
        providerOptions: {
          anthropic: {
            ...(options.reasoningEffort
              ? {
                  thinking: {
                    type: 'enabled',
                    budgetTokens: this.reasoningBudget(options.reasoningEffort),
                  },
                }
              : {}),
            disableParallelToolUse: false,
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

      return { text: textAccumulator, usage, stepDiagnostics };
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
