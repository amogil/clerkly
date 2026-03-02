// Requirements: llm-integration.11, llm-integration.5.7.1

import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatMessage, ChatChunk } from '../../../src/main/llm/ILLMProvider';

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

function sseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}`;
}

function expectStructuredSchemaWithDescriptions(schema: unknown): void {
  const typed = schema as Record<string, unknown>;
  expect(typed.type).toBe('object');
  expect(typed.description).toBe('Structured response payload returned by the assistant.');

  const properties = typed.properties as Record<string, unknown>;
  const action = properties.action as Record<string, unknown>;
  const images = properties.images as Record<string, unknown>;

  expect(action.description).toBe('Primary assistant action payload shown to the user.');
  const actionProps = action.properties as Record<string, unknown>;
  expect((actionProps.type as Record<string, unknown>).description).toBe(
    'Action discriminator. Must be "text". User-visible response text is stored in action.content.'
  );
  expect((actionProps.content as Record<string, unknown>).description).toBe(
    'User-visible response text. Can include image placeholders like [[image:1]].'
  );

  expect(images.description).toBe(
    'Optional image descriptors referenced by placeholders in action.content. Descriptors without placeholders may still be returned for background download.'
  );

  const imageItem = (images.items as Record<string, unknown>).properties as Record<string, unknown>;
  expect((imageItem.id as Record<string, unknown>).description).toBe(
    'Natural number image identifier that must match placeholder id in action.content.'
  );
  expect((imageItem.url as Record<string, unknown>).description).toBe(
    'Direct HTTP/HTTPS URL to download image content.'
  );
  expect((imageItem.alt as Record<string, unknown>).description).toBe(
    'Optional human-readable alternative text for accessibility.'
  );
  expect((imageItem.link as Record<string, unknown>).description).toBe(
    'Optional clickable target URL associated with the rendered image in chat.'
  );
}

function expectInstructionWithFieldFormatsAndImageLinks(instruction: string): void {
  expect(instruction).toContain('Field semantics and formats:');
  expect(instruction).toContain('- action.type: always "text"; defines the action kind.');
  expect(instruction).toContain(
    '- action.content: user-visible assistant text; may include image placeholders.'
  );
  expect(instruction).toContain(
    '- images: optional list of image descriptors tied to placeholders in action.content.'
  );
  expect(instruction).toContain(
    '- images[].id: natural number identifier matching placeholder id.'
  );
  expect(instruction).toContain('- images[].url: image URL for download/rendering.');
  expect(instruction).toContain('- images[].alt: optional accessibility text for rendered image.');
  expect(instruction).toContain(
    '- images[].link: optional clickable URL opened when image is clicked.'
  );

  expect(instruction).toContain('[[image:<id>]]');
  expect(instruction).toContain('[[image:<id>|link:<url>]]');
  expect(instruction).toContain('[[image:<id>|size:<width>x<height>]]');
  expect(instruction).toContain('[[image:<id>|link:<url>|size:<width>x<height>]]');
}

const messages: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Show me a diagram' },
];

describe('Provider structured output description in requests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* Preconditions: OpenAI provider is called with streaming response mocked
     Action: Execute chat() and inspect outgoing request body
     Assertions: Request contains schema with field descriptions and text instruction with field formats/image links
     Requirements: llm-integration.11.1, llm-integration.11.2, llm-integration.11.3, llm-integration.11.4, llm-integration.5.7.1 */
  it('should send complete schema and instruction in OpenAI request', async () => {
    const provider = new OpenAIProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const actionJson = JSON.stringify({ action: { type: 'text', content: 'ok' } });
    const reader = buildMockReader([
      sseEvent({ type: 'response.output_text.delta', delta: actionJson }),
      sseEvent({ type: 'response.completed', response: { usage: {} } }),
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const chunks: ChatChunk[] = [];
    await provider.chat(messages, { model: 'gpt-5-nano' }, (chunk) => chunks.push(chunk));
    expect(chunks.at(-1)).toEqual({ type: 'reasoning', delta: '', done: true });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    const input = body.input as Array<Record<string, unknown>>;
    const systemInstruction = String(input[0]?.content ?? '');
    const schema = (((body.text as Record<string, unknown>).format as Record<string, unknown>)
      .schema ?? {}) as Record<string, unknown>;

    expectStructuredSchemaWithDescriptions(schema);
    expectInstructionWithFieldFormatsAndImageLinks(systemInstruction);
  });

  it('should send complete schema and instruction in Anthropic request', async () => {
    const provider = new AnthropicProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const actionJson = JSON.stringify({ action: { type: 'text', content: 'ok' } });
    const reader = buildMockReader([
      sseEvent({
        type: 'message_start',
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: actionJson } }),
      sseEvent({ type: 'message_delta', usage: { output_tokens: 1 } }),
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(messages, { model: 'claude-3-7-sonnet-latest' }, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    const systemInstruction = String(body.system ?? '');
    const schema = ((
      (body.output_config as Record<string, unknown>).format as Record<string, unknown>
    ).schema ?? {}) as Record<string, unknown>;

    expectStructuredSchemaWithDescriptions(schema);
    expectInstructionWithFieldFormatsAndImageLinks(systemInstruction);
  });

  it('should send complete schema and instruction in Google request', async () => {
    const provider = new GoogleProvider('test-key');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const actionJson = JSON.stringify({ action: { type: 'text', content: 'ok' } });
    const reader = buildMockReader([
      sseEvent({
        candidates: [{ content: { parts: [{ text: actionJson }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
    ]);

    fetchMock.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    await provider.chat(messages, { model: 'gemini-2.5-flash' }, () => undefined);

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<
      string,
      unknown
    >;

    const systemInstruction = String(
      ((
        (body.system_instruction as Record<string, unknown>).parts as Array<Record<string, unknown>>
      )?.[0]?.text ?? '') as string
    );
    const schema = ((body.generationConfig as Record<string, unknown>).responseSchema ??
      {}) as Record<string, unknown>;

    expectStructuredSchemaWithDescriptions(schema);
    expectInstructionWithFieldFormatsAndImageLinks(systemInstruction);
  });
});
