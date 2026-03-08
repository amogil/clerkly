// Requirements: llm-integration.5

import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatChunk } from '../../../src/main/llm/ILLMProvider';

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

describe('GoogleProvider.chat()', () => {
  let provider: GoogleProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new GoogleProvider('test-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('maps thought/text parts to reasoning/text chunks and returns final text', async () => {
    const reader = buildMockReader([
      sseEvent({
        candidates: [
          {
            content: {
              parts: [{ text: 'Let me think', thought: true }, { text: 'Gemini answer' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 7,
          totalTokenCount: 10,
        },
      }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'gemini-2.5-pro' },
      (chunk) => chunks.push(chunk)
    );

    expect(result.text).toBe('Gemini answer');
    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Let me think' });
    expect(result.usage?.canonical.total_tokens).toBe(10);
  });

  it('maps HTTP 429 with retry-after header', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '4' : null) },
      json: async () => ({ error: { message: 'rate limited' } }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'gemini-2.5-pro' }, () => {})
    ).rejects.toThrow('Rate limit exceeded. Please try again in 4s');
  });

  it('maps HTTP 429 without header using provider message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: { message: 'Try again in a moment' } }),
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'gemini-2.5-pro' }, () => {})
    ).rejects.toThrow('Try again in a moment');
  });

  it('wraps abort-like errors into LLMRequestAbortedError', async () => {
    const abortError = new Error('aborted');
    (abortError as Error & { name: string }).name = 'AbortError';
    fetchMock.mockRejectedValue(abortError);

    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], { model: 'gemini-2.5-pro' }, () => {})
    ).rejects.toThrow(
      'Model response timeout. The provider took too long to respond. Please try again later.'
    );
  });
});
