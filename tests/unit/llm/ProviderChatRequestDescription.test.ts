// Requirements: llm-integration.5.7.1

import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatMessage } from '../../../src/main/llm/ILLMProvider';

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

const messages: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Say hello' },
];

describe('Provider chat request formats', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('OpenAI request does not enforce JSON schema response format in chat flow', async () => {
    const provider = new OpenAIProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const reader = buildMockReader([
      sseEvent({ type: 'response.output_text.delta', delta: 'ok' }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(messages, { model: 'gpt-5-nano' }, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    expect(body.stream).toBe(true);
    expect(body.input).toEqual(messages);
    expect(body).not.toHaveProperty('text.format');
  });

  it('Anthropic request does not enforce output_config json_schema in chat flow', async () => {
    const provider = new AnthropicProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseEvent({
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'ok',
        },
      }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(messages, { model: 'claude-3-7-sonnet-latest' }, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    expect(body).not.toHaveProperty('output_config');
  });

  it('Google request does not enforce responseSchema in chat flow', async () => {
    const provider = new GoogleProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const reader = buildMockReader([
      sseEvent({
        candidates: [
          {
            content: {
              parts: [{ text: 'ok' }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(messages, { model: 'gemini-2.5-flash' }, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    expect((body.generationConfig as Record<string, unknown>).responseSchema).toBeUndefined();
  });
});
