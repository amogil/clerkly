// Requirements: llm-integration.5

import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';
import { CHAT_TIMEOUT_MS } from '../../../src/main/llm/LLMConfig';

function buildMockReader(lines: string[]) {
  const chunks = lines.map((line) => Buffer.from(`${line}\n`));
  let index = 0;
  return {
    read: jest.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: chunks[index++] };
      }
      return { done: true, value: undefined };
    }),
    releaseLock: jest.fn(),
  };
}

function sseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}`;
}

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'gpt-5-nano' };

describe('OpenAIProvider.chat()', () => {
  let provider: OpenAIProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams reasoning/text chunks and returns usage envelope', async () => {
    const reader = buildMockReader([
      sseEvent({ type: 'response.reasoning_text.delta', delta: 'Think ' }),
      sseEvent({ type: 'response.output_text.delta', delta: 'Hello' }),
      sseEvent({ type: 'response.output_text.delta', delta: ' world' }),
      sseEvent({
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 1 },
          },
        },
      }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(result.text).toBe('Hello world');
    expect(result.usage?.canonical).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cached_tokens: 2,
      reasoning_tokens: 1,
    });

    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Think ' });
    expect(chunks).toContainEqual({ type: 'text', delta: 'Hello' });
    expect(chunks).toContainEqual({ type: 'text', delta: ' world' });
  });

  it('emits single tool_call chunk after full arguments assembly', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        call_id: 'call-1',
        name: 'search_docs',
        delta: '{"query":"str',
      }),
      sseEvent({
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta: 'eaming"}',
      }),
      sseEvent({
        type: 'response.function_call_arguments.done',
        output_index: 0,
      }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(chunks).toContainEqual({
      type: 'tool_call',
      callId: 'call-1',
      toolName: 'search_docs',
      arguments: { query: 'streaming' },
    });
  });

  it('emits multiple tool_call chunks in one turn', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        call_id: 'call-1',
        name: 'tool_a',
        delta: '{"a":1}',
      }),
      sseEvent({
        type: 'response.function_call_arguments.done',
        output_index: 0,
      }),
      sseEvent({
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        call_id: 'call-2',
        name: 'tool_b',
        delta: '{"b":2}',
      }),
      sseEvent({
        type: 'response.function_call_arguments.done',
        output_index: 1,
      }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const toolCalls = chunks.filter((chunk) => chunk.type === 'tool_call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls).toContainEqual({
      type: 'tool_call',
      callId: 'call-1',
      toolName: 'tool_a',
      arguments: { a: 1 },
    });
    expect(toolCalls).toContainEqual({
      type: 'tool_call',
      callId: 'call-2',
      toolName: 'tool_b',
      arguments: { b: 2 },
    });
  });

  it('sends tools in Responses API request when options.tools is provided', async () => {
    const reader = buildMockReader([
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(
      mockMessages,
      {
        model: 'gpt-5-nano',
        tools: [
          {
            name: 'search_docs',
            description: 'Search docs',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      },
      () => {}
    );

    const requestBody = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    );
    expect(requestBody.tools).toEqual([
      {
        type: 'function',
        name: 'search_docs',
        description: 'Search docs',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);
  });

  it('maps HTTP 429 with retry-after header into readable error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '7' : null) },
      json: async () => ({ error: { message: 'rate limit' } }),
    });

    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
      'Rate limit exceeded. Please try again in 7s'
    );
  });

  it('maps HTTP 429 without retry-after header using provider error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: { message: 'rate limited by provider' } }),
    });

    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
      'Rate limit exceeded. Please try again later.'
    );
  });

  it('ignores invalid retry-after header values and falls back to status mapping', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => 'NaN' },
      json: async () => ({ error: { message: 'rate body' } }),
    });

    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
      'Rate limit exceeded. Please try again later.'
    );
  });

  it('throws LLMRequestAbortedError on timeout/abort-like failures', async () => {
    const abortError = new Error('aborted');
    (abortError as Error & { name: string }).name = 'AbortError';
    fetchMock.mockRejectedValue(abortError);

    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toBeInstanceOf(
      LLMRequestAbortedError
    );
  });

  it('uses CHAT_TIMEOUT_MS for abort controller timer', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const reader = buildMockReader([
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(mockMessages, mockOptions, () => {});

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), CHAT_TIMEOUT_MS);
    setTimeoutSpy.mockRestore();
  });

  it('extracts reasoning text from object delta and nested part/item shapes', async () => {
    const reader = buildMockReader([
      sseEvent({ type: 'response.reasoning_summary_text.delta', delta: { text: 'A' } }),
      sseEvent({
        type: 'response.content_part.added',
        part: { type: 'reasoning_summary_text', text: 'B' },
      }),
      sseEvent({
        type: 'response.output_item.added',
        item: { type: 'reasoning', content: [{ text: 'C' }] },
      }),
      sseEvent({
        type: 'response.delta',
        delta: { type: 'reasoning_summary_text', content: 'D' },
      }),
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const reasoningDeltas = chunks
      .filter((chunk) => chunk.type === 'reasoning')
      .map((chunk) => (chunk as { type: 'reasoning'; delta: string }).delta);
    expect(reasoningDeltas.join('')).toContain('ABCD');
  });

  it('extracts reasoning from event.text and array content shapes', async () => {
    const reader = buildMockReader([
      sseEvent({ type: 'response.reasoning_text.delta', text: 'X' }),
      sseEvent({
        type: 'response.reasoning_summary_text.delta',
        delta: { content: [{ text: 'Y' }] },
      }),
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const reasoning = chunks
      .filter((chunk) => chunk.type === 'reasoning')
      .map((chunk) => (chunk as { type: 'reasoning'; delta: string }).delta)
      .join('');
    expect(reasoning).toContain('XY');
  });

  it('deduplicates repeated reasoning snapshots', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'response.content_part.added',
        part: { type: 'reasoning_summary_text', text: 'Think carefully' },
      }),
      sseEvent({
        type: 'response.content_part.added',
        part: { type: 'reasoning_summary_text', text: 'Think carefully' },
      }),
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const reasoningChunks = chunks.filter((chunk) => chunk.type === 'reasoning');
    expect(reasoningChunks).toHaveLength(1);
  });

  it('falls back to default tool call ids and handles malformed tool arguments', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'response.function_call_arguments.delta',
        output_index: 2,
        delta: '{bad-json',
      }),
      sseEvent({
        type: 'response.function_call_arguments.done',
        output_index: 2,
      }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(chunks).toContainEqual({
      type: 'tool_call',
      callId: '',
      toolName: '',
      arguments: {},
    });
  });

  it('falls back to completed output text when no output_text.delta arrived', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'response.completed',
        output: [{ type: 'message', content: [{ text: 'from-completed' }] }],
        response: { usage: {} },
      }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(result.text).toBe('from-completed');
    expect(chunks).toContainEqual({ type: 'text', delta: 'from-completed' });
  });

  it('ignores malformed SSE payload lines', async () => {
    const reader = buildMockReader([
      'data: {not-json}',
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await expect(provider.chat(mockMessages, mockOptions, () => {})).resolves.toEqual(
      expect.objectContaining({ text: 'ok' })
    );
  });

  it('throws when response stream body is missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, body: undefined });
    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
      'No response body'
    );
  });

  it('maps response.error SSE into provider error', async () => {
    const reader = buildMockReader([sseEvent({ type: 'response.error', text: 'broken' })]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });
    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow('broken');
  });

  it('uses fallback unknown error text for response.error without message', async () => {
    const reader = buildMockReader([sseEvent({ type: 'response.error' })]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });
    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow();
  });
});
