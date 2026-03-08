// Requirements: llm-integration.5

import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import type { ChatChunk } from '../../../src/main/llm/ILLMProvider';
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

describe('AnthropicProvider.chat()', () => {
  let provider: AnthropicProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new AnthropicProvider('test-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('maps thinking/text deltas to reasoning/text chunks and returns final text', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 12, output_tokens: 0 } },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Think' },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Anthropic answer' },
      }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 8 } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'claude-sonnet-4-5-20250929' },
      (chunk) => chunks.push(chunk)
    );

    expect(result.text).toBe('Anthropic answer');
    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Think' });
    expect(result.usage?.canonical.total_tokens).toBe(20);
  });

  it('maps HTTP 429 with retry-after header', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '6' : null) },
      json: async () => ({ error: { message: 'rate limited' } }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, () => {})
    ).rejects.toThrow('Rate limit exceeded. Please try again in 6s');
  });

  it('emits tool_call when tool_use block is streamed', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool-1', name: 'search_docs' },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"query":"ai sdk"}' },
      }),
      sseEvent({ type: 'content_block_stop', index: 0 }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, (chunk) =>
      chunks.push(chunk)
    );

    expect(chunks).toContainEqual({
      type: 'tool_call',
      callId: 'tool-1',
      toolName: 'search_docs',
      arguments: { query: 'ai sdk' },
    });
  });

  it('emits multiple tool_call chunks in one turn', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool-1', name: 'tool_a' },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"a":1}' },
      }),
      sseEvent({ type: 'content_block_stop', index: 0 }),
      sseEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'tool-2', name: 'tool_b' },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"b":2}' },
      }),
      sseEvent({ type: 'content_block_stop', index: 1 }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 2 } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, (chunk) =>
      chunks.push(chunk)
    );

    const toolCalls = chunks.filter((chunk) => chunk.type === 'tool_call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls).toContainEqual({
      type: 'tool_call',
      callId: 'tool-1',
      toolName: 'tool_a',
      arguments: { a: 1 },
    });
    expect(toolCalls).toContainEqual({
      type: 'tool_call',
      callId: 'tool-2',
      toolName: 'tool_b',
      arguments: { b: 2 },
    });
  });

  it('sends tools with auto parallel policy when tools are provided', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(
      [{ role: 'user', content: 'hi' }],
      {
        model: 'claude-sonnet',
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

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)
    ) as Record<string, unknown>;

    expect(body.tools).toEqual([
      {
        name: 'search_docs',
        description: 'Search docs',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);
    expect(body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: false });
  });

  it('does not send tools/tool_choice when tools list is empty', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'claude-sonnet', tools: [] },
      () => {}
    );

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)
    ) as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('maps HTTP 429 without header using provider message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: { message: 'Please try again in 5.1s' } }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, () => {})
    ).rejects.toThrow('Please try again in 5.1s');
  });

  it('emits turn_error chunk when anthropic stream sends error event', async () => {
    const reader = buildMockReader([
      sseEvent({
        type: 'error',
        error: { message: 'anthropic stream failed' },
      }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, (chunk) =>
        chunks.push(chunk)
      )
    ).rejects.toThrow('anthropic stream failed');

    expect(chunks).toContainEqual({
      type: 'turn_error',
      errorType: 'provider',
      message: 'anthropic stream failed',
    });
  });

  it('wraps abort-like errors into LLMRequestAbortedError', async () => {
    const abortError = new Error('aborted');
    (abortError as Error & { name: string }).name = 'AbortError';
    fetchMock.mockRejectedValue(abortError);

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, () => {})
    ).rejects.toThrow(
      'Model response timeout. The provider took too long to respond. Please try again later.'
    );
  });

  it('uses CHAT_TIMEOUT_MS for abort controller timer', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
      'data: [DONE]',
    ]);
    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat([{ role: 'user', content: 'hi' }], { model: 'claude-sonnet' }, () => {});

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), CHAT_TIMEOUT_MS);
    setTimeoutSpy.mockRestore();
  });
});
