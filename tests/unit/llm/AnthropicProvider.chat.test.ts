// Requirements: llm-integration.3
// tests/unit/llm/AnthropicProvider.chat.test.ts
// Unit tests for AnthropicProvider.chat()

import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';
import { InvalidStructuredOutputError } from '../../../src/main/llm/StructuredOutputContract';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';

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

function sseEvent(type: string, data: object): string {
  return `data: ${JSON.stringify({ type, ...data })}`;
}

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'claude-haiku-4-6' };

describe('AnthropicProvider.chat()', () => {
  let provider: AnthropicProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful chat without reasoning', () => {
    /* Preconditions: Anthropic returns text content with no thinking block
       Action: Call chat() with messages and options
       Assertions: Returns LLMAction with correct content; onChunk called once with done:true
       Requirements: llm-integration.3.1, llm-integration.3.3 */
    it('should return LLMAction with content', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hello back!' } });
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 10, output_tokens: 0 } } }),
        sseEvent('content_block_start', { index: 0, content_block: { type: 'text' } }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: actionJson },
        }),
        sseEvent('message_delta', { usage: { output_tokens: 20 } }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(mockMessages, mockOptions, (c) => chunks.push(c));

      expect(result.action.type).toBe('text');
      expect(result.action.content).toBe('Hello back!');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('successful chat with reasoning', () => {
    /* Preconditions: Anthropic streams thinking block then text content
       Action: Call chat() with messages and reasoningEffort option
       Assertions: onChunk called for each thinking delta; final action returned
       Requirements: llm-integration.3.2, llm-integration.3.3 */
    it('should stream reasoning chunks and return final action', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Answer' } });
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
        sseEvent('content_block_start', { index: 0, content_block: { type: 'thinking' } }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Let me think' },
        }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: ' more' },
        }),
        sseEvent('content_block_start', { index: 1, content_block: { type: 'text' } }),
        sseEvent('content_block_delta', {
          index: 1,
          delta: { type: 'text_delta', text: actionJson },
        }),
        sseEvent('message_delta', { usage: { output_tokens: 15 } }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const chunks: ChatChunk[] = [];
      const result = await provider.chat(
        mockMessages,
        { ...mockOptions, reasoningEffort: 'medium' },
        (c) => chunks.push(c)
      );

      expect(result.action.content).toBe('Answer');

      const reasoningChunks = chunks.filter((c) => !c.done);
      expect(reasoningChunks).toHaveLength(2);
      expect(reasoningChunks[0]).toEqual({ type: 'reasoning', delta: 'Let me think', done: false });
      expect(reasoningChunks[1]).toEqual({ type: 'reasoning', delta: ' more', done: false });

      const doneChunk = chunks.find((c) => c.done);
      expect(doneChunk).toEqual({ type: 'reasoning', delta: '', done: true });
    });
  });

  describe('usage fields', () => {
    /* Preconditions: Anthropic returns usage in message_start and message_delta
       Action: Call chat()
       Assertions: usage fields correctly mapped
       Requirements: llm-integration.3.3 */
    it('should map usage fields correctly', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Hi' } });
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 10, output_tokens: 0 } } }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: actionJson },
        }),
        sseEvent('message_delta', { usage: { output_tokens: 20 } }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});

      expect(result.usage).toEqual({
        canonical: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        },
        raw: {
          input_tokens: 10,
          output_tokens: 20,
        },
      });
    });
  });

  describe('HTTP 401', () => {
    /* Preconditions: Anthropic returns 401 Unauthorized
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
    /* Preconditions: Anthropic returns 429 rate limit
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

    /* Preconditions: Anthropic returns 429 with retry-after header
       Action: Call chat()
       Assertions: Error message uses retry-after seconds from header
       Requirements: llm-integration.3.7.6 */
    it('should prioritize retry-after header when present', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'retry-after' ? '11' : null) },
        json: async () => ({ error: { message: 'Please try again later' } }),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        /try again in 11s/i
      );
    });

    /* Preconditions: Anthropic returns 429 without retry-after but with provider message
       Action: Call chat()
       Assertions: Provider message is preserved for retry-after parsing upstream
       Requirements: llm-integration.3.7.6 */
    it('should keep provider 429 message when header is absent', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({ error: { message: 'Please try again in 12.4s' } }),
      });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(/12\.4s/);
    });
  });

  describe('empty response', () => {
    /* Preconditions: Anthropic returns stream with no text content
       Action: Call chat()
       Assertions: Throws error about empty response
       Requirements: llm-integration.3.4 */
    it('should throw on empty content', async () => {
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toThrow(
        InvalidStructuredOutputError
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

  describe('timeout / abort', () => {
    /* Preconditions: fetch is aborted via AbortController
       Action: Call chat() when request is aborted
       Assertions: Throws typed LLMRequestAbortedError with timeout message
       Requirements: llm-integration.3.4 */
    it('should throw typed timeout error when request is aborted', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchMock.mockRejectedValue(abortError);

      await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toBeInstanceOf(
        LLMRequestAbortedError
      );
    });
  });

  describe('content split across multiple chunks', () => {
    /* Preconditions: JSON content arrives in multiple text_delta events
       Action: Call chat()
       Assertions: Content is correctly accumulated and parsed
       Requirements: llm-integration.3.2 */
    it('should accumulate content split across chunks', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'Full answer' } });
      const part1 = actionJson.slice(0, 10);
      const part2 = actionJson.slice(10, 25);
      const part3 = actionJson.slice(25);

      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
        sseEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: part1 } }),
        sseEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: part2 } }),
        sseEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: part3 } }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const result = await provider.chat(mockMessages, mockOptions, () => {});
      expect(result.action.content).toBe('Full answer');
    });
  });

  describe('system messages', () => {
    /* Preconditions: messages array contains system message
       Action: Call chat()
       Assertions: fetch called with system prompt extracted from messages
       Requirements: llm-integration.3.1 */
    it('should extract system messages into system prompt', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'OK' } });
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: actionJson },
        }),
        sseEvent('message_stop', {}),
      ]);
      fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const messagesWithSystem: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chat(messagesWithSystem, mockOptions, () => {});

      const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
        system: string;
        messages: ChatMessage[];
      };
      expect(callBody.system).toContain('You are a helpful assistant.');
      expect(callBody.messages).toHaveLength(1);
      expect(callBody.messages[0].role).toBe('user');
    });
  });

  describe('structured output contract in request', () => {
    /* Preconditions: Anthropic provider receives chat request
       Action: Call chat() and inspect outgoing request body
       Assertions: Request includes output_config.format with json_schema
       Requirements: llm-integration.11 */
    it('should include output_config.format json_schema in request', async () => {
      const actionJson = JSON.stringify({ action: { type: 'text', content: 'OK' } });
      const reader = buildMockReader([
        sseEvent('message_start', { message: { usage: { input_tokens: 1, output_tokens: 0 } } }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: actionJson },
        }),
        sseEvent('message_stop', {}),
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

      const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
        system: string;
        output_config?: { format?: { type?: string; schema?: Record<string, unknown> } };
      };
      expect(callBody.system).toContain('Field semantics and formats:');
      expect(callBody.output_config?.format?.type).toBe('json_schema');
      expect(callBody.output_config?.format?.schema).toBeDefined();
    });
  });
});
