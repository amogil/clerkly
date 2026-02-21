// Requirements: llm-integration.3
// tests/unit/llm/OpenAIProvider.chat.test.ts
// Unit tests for OpenAIProvider.chat()

import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';

/**
 * Build a mock response body reader from SSE data lines.
 * Returns a mock that simulates ReadableStream.getReader() in Node.js Jest environment.
 */
function buildMockReader(lines: string[]) {
  const chunks = lines.map((line) => Buffer.from(line + '\n'));
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

function sseChunk(delta: { reasoning?: string; content?: string }, usage?: object): string {
  const chunk = {
    choices: [{ delta, finish_reason: null }],
    ...(usage ? { usage } : {}),
  };
  return `data: ${JSON.stringify(chunk)}`;
}

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'gpt-4o-mini' };

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

  describe('successful chat without reasoning', () => {
    /* Preconditions: OpenAI returns structured output with no reasoning
       Action: Call chat() with messages and options
       Assertions: Returns LLMAction with correct content; onChunk called once with done:true
       Requirements: llm-integration.3.1, llm-integration.3.3 */
    it('should return LLMAction with content', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hello back!' } });
      const reader = buildMockReader([sseChunk({ content: actionJson }), 'data: [DONE]']);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.type).toBe('text');
      expect(result.content).toBe('Hello back!');
      // Only the done:true sentinel chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('successful chat with reasoning', () => {
    /* Preconditions: OpenAI streams reasoning chunks then structured output
       Action: Call chat() with messages and options
       Assertions: onChunk called for each reasoning delta; final action returned
       Requirements: llm-integration.3.2, llm-integration.3.3 */
    it('should stream reasoning chunks and return final action', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Answer' } });
      const reader = buildMockReader([
        sseChunk({ reasoning: 'Let me think' }),
        sseChunk({ reasoning: ' about this' }),
        sseChunk({ content: actionJson }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.content).toBe('Answer');

      const reasoningChunks = chunks.filter((c) => !c.done);
      expect(reasoningChunks).toHaveLength(2);
      expect(reasoningChunks[0]).toEqual({ type: 'reasoning', delta: 'Let me think', done: false });
      expect(reasoningChunks[1]).toEqual({ type: 'reasoning', delta: ' about this', done: false });

      const doneChunk = chunks.find((c) => c.done);
      expect(doneChunk).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('usage fields', () => {
    /* Preconditions: OpenAI returns usage in final chunk
       Action: Call chat()
       Assertions: usage fields correctly mapped including cached and reasoning tokens
       Requirements: llm-integration.3.3 */
    it('should map usage fields correctly', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hi' } });
      const usageChunk = {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens_details: { reasoning_tokens: 8 },
        },
      };
      const reader = buildMockReader([
        sseChunk({ content: actionJson }),
        `data: ${JSON.stringify(usageChunk)}`,
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});

      expect(result.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        cached_tokens: 5,
        reasoning_tokens: 8,
      });
    });
  });

  describe('network error', () => {
    /* Preconditions: fetch throws a network error
       Action: Call chat()
       Assertions: Throws error (propagates)
       Requirements: llm-integration.3.4 */
    it('should throw on network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        'Failed to fetch'
      );
    });
  });

  describe('HTTP 401', () => {
    /* Preconditions: OpenAI returns 401 Unauthorized
       Action: Call chat()
       Assertions: Throws error with auth message
       Requirements: llm-integration.3.4 */
    it('should throw on 401 unauthorized', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Invalid API key/
      );
    });
  });

  describe('HTTP 429', () => {
    /* Preconditions: OpenAI returns 429 rate limit
       Action: Call chat()
       Assertions: Throws error with rate limit message
       Requirements: llm-integration.3.4 */
    it('should throw on 429 rate limit', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Rate limit/
      );
    });
  });

  describe('empty response', () => {
    /* Preconditions: OpenAI returns stream with no content
       Action: Call chat()
       Assertions: Throws error about empty response
       Requirements: llm-integration.3.4 */
    it('should throw on empty content', async () => {
      const reader = buildMockReader(['data: [DONE]']);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Empty response/
      );
    });
  });

  describe('timeout / abort', () => {
    /* Preconditions: fetch is aborted via AbortController
       Action: Call chat() when request is aborted
       Assertions: Throws AbortError
       Requirements: llm-integration.3.4 */
    it('should throw when request is aborted', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchMock.mockRejectedValue(abortError);

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow();
    });
  });

  describe('content split across multiple chunks', () => {
    /* Preconditions: JSON content arrives in multiple SSE chunks
       Action: Call chat()
       Assertions: Content is correctly accumulated and parsed
       Requirements: llm-integration.3.2 */
    it('should accumulate content split across chunks', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Full answer' } });
      const part1 = actionJson.slice(0, 10);
      const part2 = actionJson.slice(10, 25);
      const part3 = actionJson.slice(25);

      const reader = buildMockReader([
        sseChunk({ content: part1 }),
        sseChunk({ content: part2 }),
        sseChunk({ content: part3 }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});
      expect(result.content).toBe('Full answer');
    });
  });
});
