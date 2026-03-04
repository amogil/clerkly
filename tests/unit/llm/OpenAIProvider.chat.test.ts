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

function sseResponsesEvent(event: Record<string, unknown>): string {
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

  describe('successful chat without reasoning', () => {
    /* Preconditions: OpenAI returns structured output with no reasoning
       Action: Call chat() with messages and options
       Assertions: Returns LLMAction with correct content; onChunk called once with done:true
       Requirements: llm-integration.3.1, llm-integration.3.3 */
    it('should return LLMAction with content', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hello back!' } });
      const reader = buildMockReader([
        sseResponsesEvent({ type: 'response.output_text.delta', delta: actionJson }),
        sseResponsesEvent({ type: 'response.completed', response: { usage: {} } }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.action.type).toBe('text');
      expect(result.action.content).toBe('Hello back!');
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
        sseResponsesEvent({ type: 'response.reasoning_text.delta', delta: 'Let me think' }),
        sseResponsesEvent({ type: 'response.reasoning_text.delta', delta: ' about this' }),
        sseResponsesEvent({ type: 'response.output_text.delta', delta: actionJson }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.action.content).toBe('Answer');

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
      const reader = buildMockReader([
        sseResponsesEvent({ type: 'response.output_text.delta', delta: actionJson }),
        sseResponsesEvent({
          type: 'response.completed',
          response: {
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              total_tokens: 30,
              input_tokens_details: { cached_tokens: 5 },
              output_tokens_details: { reasoning_tokens: 8 },
            },
          },
        }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});

      expect(result.usage).toEqual({
        canonical: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          cached_tokens: 5,
          reasoning_tokens: 8,
        },
        raw: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          input_tokens_details: { cached_tokens: 5 },
          output_tokens_details: { reasoning_tokens: 8 },
        },
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
        headers: { get: () => null },
        json: async () => ({}),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Rate limit/
      );
    });

    /* Preconditions: OpenAI returns 429 with retry-after header
       Action: Call chat()
       Assertions: Error message uses retry-after seconds from header
       Requirements: llm-integration.3.7.6 */
    it('should prioritize retry-after header when present', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'retry-after' ? '7' : null) },
        json: async () => ({ error: { message: 'Please try again in 20s' } }),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Retry again in 7s|try again in 7s/i
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

  describe('chunk without choices', () => {
    /* Preconditions: SSE stream contains irrelevant non-response event
       Action: Call chat()
       Assertions: Event is skipped, final action still returned
       Requirements: llm-integration.3.2 */
    it('should skip unknown events', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'OK' } });
      const reader = buildMockReader([
        sseResponsesEvent({ type: 'response.unknown.delta', delta: 'noop' }),
        sseResponsesEvent({ type: 'response.output_text.delta', delta: actionJson }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});
      expect(result.action.content).toBe('OK');
    });
  });

  describe('unknown HTTP error without error.message', () => {
    /* Preconditions: OpenAI returns unknown status (599) with no error.message in body
       Action: Call chat()
       Assertions: Throws generic connection failed message
       Requirements: llm-integration.3.4 */
    it('should throw generic error for unknown status with no message', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 599,
        json: async () => ({}),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /Connection failed/
      );
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
        sseResponsesEvent({ type: 'response.output_text.delta', delta: part1 }),
        sseResponsesEvent({ type: 'response.output_text.delta', delta: part2 }),
        sseResponsesEvent({ type: 'response.output_text.delta', delta: part3 }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});
      expect(result.action.content).toBe('Full answer');
    });
  });

  describe('structured output contract in request', () => {
    /* Preconditions: OpenAI provider receives chat request
       Action: Call chat() and inspect outgoing request body
       Assertions: Request uses Responses API format with text.format json_schema
       Requirements: llm-integration.5.7, llm-integration.5.7.1, llm-integration.11 */
    it('should include text.format json_schema and avoid legacy response_format', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'OK' } });
      const reader = buildMockReader([
        sseResponsesEvent({ type: 'response.output_text.delta', delta: actionJson }),
        'data: [DONE]',
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      await provider.chat(
        [
          { role: 'system', content: 'Base system prompt' },
          { role: 'user', content: 'Hello' },
        ],
        mockOptions,
        () => {}
      );

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl.toLowerCase()).toContain('responses');

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
        input?: Array<{ role: string; content: string }>;
        text?: { format?: { type?: string; strict?: boolean; schema?: Record<string, unknown> } };
        response_format?: unknown;
      };
      expect(body.text?.format?.type).toBe('json_schema');
      expect(body.text?.format?.strict).toBe(true);
      expect(body.text?.format?.schema).toBeDefined();
      const schema = body.text?.format?.schema as Record<string, unknown>;
      const actionProperties = ((schema.properties as Record<string, unknown>)?.action ??
        {}) as Record<string, unknown>;
      expect(actionProperties).toBeDefined();
      expect(body.response_format).toBeUndefined();
      expect(Array.isArray(body.input)).toBe(true);
    });
  });
});
