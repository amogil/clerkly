// Requirements: llm-integration.5.7.1

import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatMessage } from '../../../src/main/llm/ILLMProvider';

jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((definition) => ({ ...definition })),
  jsonSchema: jest.fn((schema) => schema),
  stepCountIs: jest.fn((stepCount) => ({ type: 'step-count-is', stepCount })),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(),
}));

function mockStreamTextWithSingleDelta() {
  const streamTextMock = jest.requireMock('ai').streamText as jest.Mock;
  streamTextMock.mockReturnValue({
    fullStream: (async function* () {
      yield { type: 'text-delta', text: 'ok' };
    })(),
    totalUsage: Promise.resolve({}),
  });
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
    const streamTextMock = jest.requireMock('ai').streamText as jest.Mock;
    const createOpenAIMock = jest.requireMock('@ai-sdk/openai').createOpenAI as jest.Mock;
    const responsesMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    createOpenAIMock.mockReturnValue({ responses: responsesMock });
    mockStreamTextWithSingleDelta();

    await provider.chat(messages, { model: 'gpt-5-nano' }, () => undefined);

    const streamArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    expect(streamArgs.messages).toEqual(messages);
    expect(streamArgs).not.toHaveProperty('text');
  });

  it('Anthropic request does not enforce output_config json_schema in chat flow', async () => {
    const provider = new AnthropicProvider('test-key');
    const streamTextMock = jest.requireMock('ai').streamText as jest.Mock;
    const createAnthropicMock = jest.requireMock('@ai-sdk/anthropic').createAnthropic as jest.Mock;
    const messagesModelMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    createAnthropicMock.mockReturnValue({ messages: messagesModelMock });
    mockStreamTextWithSingleDelta();

    await provider.chat(messages, { model: 'claude-3-7-sonnet-latest' }, () => undefined);

    const streamArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    expect(streamArgs).not.toHaveProperty('output_config');
  });

  it('Google request does not enforce responseSchema in chat flow', async () => {
    const provider = new GoogleProvider('test-key');
    const streamTextMock = jest.requireMock('ai').streamText as jest.Mock;
    const createGoogleMock = jest.requireMock('@ai-sdk/google')
      .createGoogleGenerativeAI as jest.Mock;
    const chatModelMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    createGoogleMock.mockReturnValue({ chat: chatModelMock });
    mockStreamTextWithSingleDelta();

    await provider.chat(messages, { model: 'gemini-2.5-flash' }, () => undefined);

    const streamArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const generationConfig = (streamArgs as { generationConfig?: Record<string, unknown> })
      .generationConfig;
    expect(generationConfig?.responseSchema).toBeUndefined();
  });
});
