// Requirements: llm-integration.3
// tests/unit/llm/GoogleProvider.chat.test.ts
// Unit tests for GoogleProvider.chat()

import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';

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

function sseChunk(data: object): string {
  return `data: ${JSON.stringify(data)}`;
}

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'gemini-3-flash-preview' };

describe('GoogleProvider.chat()', () => {
  let provider: GoogleProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new GoogleProvider('test-api-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful chat without reasoning', () => {
    /* Preconditions: Gemini returns text parts with no thought parts
       Action: Call chat() with messages and options
       Assertions: Returns LLMAction with correct content; onChunk called once with done:true
       Requirements: llm-integration.3.1, llm-integration.3.3 */
    it('should return LLMAction with content', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hello back!' } });
      const reader = buildMockReader([
        sseChunk({
          candidates: [{ content: { parts: [{ text: actionJson }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        }),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.type).toBe('text');
      expect(result.content).toBe('Hello back!');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('successful chat with reasoning', () => {
    /* Preconditions: Gemini streams thought parts then text parts
       Action: Call chat() with messages and reasoningEffort option
       Assertions: onChunk called for each thought part; final action returned
       Requirements: llm-integration.3.2, llm-integration.3.3 */
    it('should stream reasoning chunks and return final action', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Answer' } });
      const reader = buildMockReader([
        sseChunk({
          candidates: [{ content: { parts: [{ text: 'Let me think', thought: true }] } }],
        }),
        sseChunk({
          candidates: [{ content: { parts: [{ text: ' more', thought: true }] } }],
        }),
        sseChunk({
          candidates: [{ content: { parts: [{ text: actionJson }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 15, totalTokenCount: 20 },
        }),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(
        mockMessages,
        { ...mockOptions, reasoningEffort: 'medium' },
        (c) => chunks.push(c)
      );

      expect(result.content).toBe('Answer');

      const reasoningChunks = chunks.filter((c) => !c.done);
      expect(reasoningChunks).toHaveLength(2);
      expect(reasoningChunks[0]).toEqual({ type: 'reasoning', delta: 'Let me think', done: false });
      expect(reasoningChunks[1]).toEqual({ type: 'reasoning', delta: ' more', done: false });

      const doneChunk = chunks.find((c) => c.done);
      expect(doneChunk).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('usage fields', () => {
    /* Preconditions: Gemini returns usageMetadata in final chunk
       Action: Call chat()
       Assertions: usage fields correctly mapped
       Requirements: llm-integration.3.3 */
    it('should map usage fields correctly', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hi' } });
      const reader = buildMockReader([
        sseChunk({
          candidates: [{ content: { parts: [{ text: actionJson }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        }),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});

      expect(result.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      });
    });
  });

  describe('HTTP 401', () => {
    /* Preconditions: Gemini returns 401 Unauthorized
       Action: Call chat()
       Assertions: Throws error with auth message
       Requirements: llm-integration.3.4 */
    it('should throw on 401 unauthorized', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Invalid API key/
      );
    });
  });

  describe('HTTP 429', () => {
    /* Preconditions: Gemini returns 429 rate limit
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
    /* Preconditions: Gemini returns stream with no content parts
       Action: Call chat()
       Assertions: Throws error about empty response
       Requirements: llm-integration.3.4 */
    it('should throw on empty content', async () => {
      const reader = buildMockReader([sseChunk({ candidates: [{ content: { parts: [] } }] })]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Empty response/
      );
    });
  });

  describe('no response body', () => {
    /* Preconditions: fetch returns response with null body
       Action: Call chat()
       Assertions: Throws "No response body"
       Requirements: llm-integration.3.4 */
    it('should throw when response body is null', async () => {
      fetchMock.mockResolvedValue({ ok: true, body: null });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        'No response body'
      );
    });
  });

  describe('network error', () => {
    /* Preconditions: fetch throws a network error
       Action: Call chat()
       Assertions: Throws error
       Requirements: llm-integration.3.4 */
    it('should throw on network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

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
        sseChunk({ candidates: [{ content: { parts: [{ text: part1 }] } }] }),
        sseChunk({ candidates: [{ content: { parts: [{ text: part2 }] } }] }),
        sseChunk({
          candidates: [{ content: { parts: [{ text: part3 }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
        }),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});
      expect(result.content).toBe('Full answer');
    });
  });

  describe('streaming URL', () => {
    /* Preconditions: GoogleProvider configured with default API URL
       Action: Call chat()
       Assertions: fetch called with streamGenerateContent endpoint and alt=sse
       Requirements: llm-integration.3.1 */
    it('should use streamGenerateContent endpoint with alt=sse', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'OK' } });
      const reader = buildMockReader([
        sseChunk({ candidates: [{ content: { parts: [{ text: actionJson }] } }] }),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      await provider.chat(mockMessages, mockOptions, () => {});

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('streamGenerateContent');
      expect(calledUrl).toContain('alt=sse');
      expect(calledUrl).toContain('key=test-api-key');
    });
  });
});
