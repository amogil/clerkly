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

interface OpenAIResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface OpenAIResponsesEvent {
  type?: string;
  output_index?: number;
  item_id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: unknown;
  delta?: unknown;
  text?: string;
  part?: { type?: string; text?: string; delta?: string; content?: unknown };
  item?: { type?: string; text?: string; delta?: string; content?: unknown };
  response?: {
    usage?: OpenAIResponsesUsage;
  };
  usage?: OpenAIResponsesUsage;
}

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

      const { streamText, tool, jsonSchema } = await import('ai');
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({ apiKey: this.apiKey, baseURL });
      const sdkModel = openai.responses(options.model) as unknown as {
        specificationVersion?: string;
      };
      if (sdkModel.specificationVersion !== 'v2') {
        return await this.chatWithLegacyTransport(apiUrl, messages, options, onChunk, controller);
      }
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
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'AI_UnsupportedModelVersionError'
      ) {
        return await this.chatWithLegacyTransport(apiUrl, messages, options, onChunk, controller);
      }
      if (isAbortLikeError(error)) {
        throw new LLMRequestAbortedError(this.mapExceptionToMessage(error), error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async chatWithLegacyTransport(
    apiUrl: string,
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void,
    controller: AbortController
  ): Promise<LLMChatResult> {
    const body: Record<string, unknown> = {
      model: options.model,
      input: messages,
      stream: true,
      ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((toolDef) => ({
        type: 'function',
        name: toolDef.name,
        description: toolDef.description,
        parameters: toolDef.parameters,
      }));
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
      const retryAfterSeconds = this.parseRetryAfterHeader(response);
      if (response.status === 429 && retryAfterSeconds !== null) {
        throw new Error(`Rate limit exceeded. Please try again in ${retryAfterSeconds}s`);
      }
      throw new Error(this.mapErrorToMessage(response.status, errorData));
    }

    return await this.parseStream(response, onChunk);
  }

  private buildToolSet(
    options: ChatOptions,
    toolFactory: (definition: { description: string; inputSchema: unknown }) => unknown,
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
      }),
    ]);
    return Object.fromEntries(entries);
  }

  /**
   * Parse SSE stream and emit normalized chunks.
   * Requirements: llm-integration.5.1, llm-integration.5.4, llm-integration.5.5
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
    let textAccumulator = '';
    let reasoningAccumulator = '';
    let usage: LLMUsage | undefined;
    const toolCallsByIndex = new Map<
      number,
      { callId: string; toolName: string; argumentsText: string }
    >();

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

          if (event.type === 'response.error') {
            const message =
              typeof event.text === 'string' && event.text ? event.text : ERROR_MESSAGES.unknown;
            onChunk({ type: 'turn_error', errorType: 'provider', message });
            throw new Error(message);
          }

          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            textAccumulator += event.delta;
            onChunk({ type: 'text', delta: event.delta });
          }

          if (this.isReasoningEvent(event)) {
            const reasoningDelta = this.extractReasoningDelta(event);
            if (reasoningDelta) {
              const normalized = this.normalizeReasoningDelta(reasoningDelta, reasoningAccumulator);
              reasoningAccumulator = normalized.accumulated;
              if (normalized.delta) {
                onChunk({ type: 'reasoning', delta: normalized.delta });
              }
            }
          }

          this.collectToolCallDelta(event, toolCallsByIndex);
          const completedToolCall = this.extractCompletedToolCall(event, toolCallsByIndex);
          if (completedToolCall) {
            onChunk({
              type: 'tool_call',
              callId: completedToolCall.callId,
              toolName: completedToolCall.toolName,
              arguments: completedToolCall.arguments,
            });
          }

          if (event.type === 'response.completed') {
            const completedText = this.extractCompletedText(event);
            if (completedText && !textAccumulator) {
              textAccumulator = completedText;
              onChunk({ type: 'text', delta: completedText });
            }
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
    return { text: textAccumulator, usage };
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

  private extractReasoningDelta(event: OpenAIResponsesEvent): string | null {
    if (typeof event.delta === 'string' && event.delta.length > 0) {
      return event.delta;
    }

    if (typeof event.text === 'string' && event.text.length > 0) {
      return event.text;
    }

    if (event.delta && typeof event.delta === 'object') {
      const obj = event.delta as { text?: unknown; delta?: unknown; content?: unknown };
      if (typeof obj.text === 'string' && obj.text.length > 0) return obj.text;
      if (typeof obj.delta === 'string' && obj.delta.length > 0) return obj.delta;
      if (typeof obj.content === 'string' && obj.content.length > 0) return obj.content;
      if (Array.isArray(obj.content)) {
        const joined = this.extractTextFromContentParts(obj.content);
        if (joined.length > 0) return joined;
      }
    }

    if (event.part && typeof event.part === 'object') {
      const partText = this.extractTextFromNode(event.part);
      if (partText) return partText;
    }

    if (event.item && typeof event.item === 'object') {
      const itemText = this.extractTextFromNode(event.item);
      if (itemText) return itemText;
    }

    return null;
  }

  private isReasoningEvent(event: OpenAIResponsesEvent): boolean {
    if (typeof event.type === 'string' && event.type.includes('reasoning')) {
      return true;
    }

    const partType = event.part?.type;
    if (typeof partType === 'string' && partType.includes('reasoning')) {
      return true;
    }

    const itemType = event.item?.type;
    if (typeof itemType === 'string' && itemType.includes('reasoning')) {
      return true;
    }

    if (event.delta && typeof event.delta === 'object' && 'type' in event.delta) {
      const deltaType = (event.delta as { type?: unknown }).type;
      if (typeof deltaType === 'string' && deltaType.includes('reasoning')) {
        return true;
      }
    }

    return false;
  }

  private extractTextFromNode(node: {
    text?: unknown;
    delta?: unknown;
    content?: unknown;
  }): string | null {
    if (typeof node.text === 'string' && node.text.length > 0) return node.text;
    if (typeof node.delta === 'string' && node.delta.length > 0) return node.delta;
    if (typeof node.content === 'string' && node.content.length > 0) return node.content;
    if (Array.isArray(node.content)) {
      const joined = this.extractTextFromContentParts(node.content);
      if (joined.length > 0) return joined;
    }
    return null;
  }

  private extractTextFromContentParts(content: unknown[]): string {
    return content
      .map((item) =>
        item && typeof item === 'object' && 'text' in item && typeof item.text === 'string'
          ? item.text
          : ''
      )
      .join('');
  }

  private normalizeReasoningDelta(
    incoming: string,
    accumulated: string
  ): { delta: string | null; accumulated: string } {
    if (!incoming) {
      return { delta: null, accumulated };
    }

    if (!accumulated) {
      return { delta: incoming, accumulated: incoming };
    }

    if (incoming === accumulated) {
      return { delta: null, accumulated };
    }

    if (incoming.startsWith(accumulated)) {
      const appended = incoming.slice(accumulated.length);
      if (!appended) {
        return { delta: null, accumulated };
      }
      return { delta: appended, accumulated: incoming };
    }

    if (accumulated.endsWith(incoming)) {
      return { delta: null, accumulated };
    }

    return { delta: incoming, accumulated: accumulated + incoming };
  }

  private collectToolCallDelta(
    event: OpenAIResponsesEvent,
    toolCallsByIndex: Map<number, { callId: string; toolName: string; argumentsText: string }>
  ): void {
    if (event.type !== 'response.function_call_arguments.delta') {
      return;
    }

    const outputIndex = typeof event.output_index === 'number' ? event.output_index : 0;
    const previous = toolCallsByIndex.get(outputIndex);
    const delta = typeof event.delta === 'string' ? event.delta : '';
    const callId = event.call_id ?? previous?.callId ?? '';
    const toolName = event.name ?? previous?.toolName ?? '';
    const argumentsText = `${previous?.argumentsText ?? ''}${delta}`;

    toolCallsByIndex.set(outputIndex, { callId, toolName, argumentsText });
  }

  private extractCompletedToolCall(
    event: OpenAIResponsesEvent,
    toolCallsByIndex: Map<number, { callId: string; toolName: string; argumentsText: string }>
  ): { callId: string; toolName: string; arguments: Record<string, unknown> } | null {
    if (event.type !== 'response.function_call_arguments.done') {
      return null;
    }

    const outputIndex = typeof event.output_index === 'number' ? event.output_index : 0;
    const previous = toolCallsByIndex.get(outputIndex);
    const argumentsText =
      typeof event.arguments === 'string' ? event.arguments : (previous?.argumentsText ?? '');
    const callId = event.call_id ?? previous?.callId ?? `call-${outputIndex}`;
    const toolName = event.name ?? previous?.toolName ?? 'unknown_tool';
    toolCallsByIndex.delete(outputIndex);

    return {
      callId,
      toolName,
      arguments: this.parseToolArguments(argumentsText),
    };
  }

  private parseToolArguments(argumentsText: string): Record<string, unknown> {
    if (!argumentsText.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(argumentsText);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private extractCompletedText(event: OpenAIResponsesEvent): string {
    if (!Array.isArray(event.output)) {
      return '';
    }

    const parts: string[] = [];
    for (const outputItem of event.output) {
      if (!outputItem || typeof outputItem !== 'object') {
        continue;
      }
      const item = outputItem as { type?: string; content?: unknown; text?: unknown };
      if (typeof item.text === 'string' && item.text.length > 0) {
        parts.push(item.text);
      }
      if (!Array.isArray(item.content)) {
        continue;
      }
      for (const contentPart of item.content) {
        if (!contentPart || typeof contentPart !== 'object') {
          continue;
        }
        const part = contentPart as { text?: unknown };
        if (typeof part.text === 'string' && part.text.length > 0) {
          parts.push(part.text);
        }
      }
    }

    return parts.join('');
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
