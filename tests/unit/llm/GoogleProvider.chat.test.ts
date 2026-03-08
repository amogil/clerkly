// Requirements: llm-integration.5

import * as aiModule from 'ai';
import * as googleSdkModule from '@ai-sdk/google';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';
import { CHAT_TIMEOUT_MS } from '../../../src/main/llm/LLMConfig';

jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((definition) => ({ ...definition })),
  jsonSchema: jest.fn((schema) => schema),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(),
}));

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'gemini-2.5-pro' };

function toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function mockSdkResult(parts: unknown[], usage: Record<string, number> = {}) {
  (aiModule.streamText as unknown as jest.Mock).mockReturnValue({
    fullStream: toAsyncIterable(parts),
    totalUsage: Promise.resolve(usage),
  });
}

describe('GoogleProvider.chat()', () => {
  let provider: GoogleProvider;
  let chatMock: jest.Mock;

  beforeEach(() => {
    provider = new GoogleProvider('test-api-key');
    chatMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    (googleSdkModule.createGoogleGenerativeAI as unknown as jest.Mock).mockReturnValue({
      chat: chatMock,
    });
    (aiModule.streamText as unknown as jest.Mock).mockReset();
    (aiModule.tool as unknown as jest.Mock).mockClear();
    (aiModule.jsonSchema as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams reasoning/text chunks and returns usage envelope', async () => {
    mockSdkResult(
      [
        { type: 'reasoning-delta', text: 'Let me think' },
        { type: 'text-delta', text: 'Gemini' },
        { type: 'text-delta', text: ' answer' },
      ],
      {
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10,
      }
    );

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(result.text).toBe('Gemini answer');
    expect(result.usage?.canonical.total_tokens).toBe(10);
    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Let me think' });
    expect(chunks).toContainEqual({ type: 'text', delta: 'Gemini' });
    expect(chunks).toContainEqual({ type: 'text', delta: ' answer' });
  });

  it('emits tool_call chunks for multiple calls in one turn', async () => {
    mockSdkResult([
      { type: 'tool-call', toolCallId: 'tool-1', toolName: 'tool_a', input: { a: 1 } },
      { type: 'tool-call', toolCallId: 'tool-2', toolName: 'tool_b', input: { b: 2 } },
      { type: 'text-delta', text: 'ok' },
    ]);

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const toolCalls = chunks.filter((chunk) => chunk.type === 'tool_call');
    expect(toolCalls).toEqual([
      { type: 'tool_call', callId: 'tool-1', toolName: 'tool_a', arguments: { a: 1 } },
      { type: 'tool_call', callId: 'tool-2', toolName: 'tool_b', arguments: { b: 2 } },
    ]);
  });

  it('emits tool_result chunks for successful and failed tool execution parts', async () => {
    mockSdkResult([
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'tool_a',
        input: { a: 1 },
        output: { ok: true },
      },
      {
        type: 'tool-error',
        toolCallId: 'tool-2',
        toolName: 'tool_b',
        input: { b: 2 },
        error: new Error('tool failed'),
      },
    ]);

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const toolResults = chunks.filter((chunk) => chunk.type === 'tool_result');
    expect(toolResults).toEqual([
      {
        type: 'tool_result',
        callId: 'tool-1',
        toolName: 'tool_a',
        arguments: { a: 1 },
        output: { ok: true },
        status: 'success',
      },
      {
        type: 'tool_result',
        callId: 'tool-2',
        toolName: 'tool_b',
        arguments: { b: 2 },
        output: { message: 'tool failed' },
        status: 'error',
      },
    ]);
  });

  it('passes thinkingConfig and validated function-calling policy to streamText', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'gemini-2.5-pro',
        reasoningEffort: 'low',
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

    const streamArgs = (aiModule.streamText as unknown as jest.Mock).mock.calls[0][0];
    expect(streamArgs.providerOptions.google).toEqual({
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 1024,
      },
      functionCallingConfig: {
        mode: 'VALIDATED',
      },
    });
    expect(streamArgs.tools).toHaveProperty('search_docs');
    expect(aiModule.tool).toHaveBeenCalled();
    expect(aiModule.jsonSchema).toHaveBeenCalledWith({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    expect(chatMock).toHaveBeenCalledWith('gemini-2.5-pro');
  });

  it('does not build tool definitions when tools list is empty', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'gemini-2.5-pro',
        tools: [],
      },
      () => {}
    );

    const streamArgs = (aiModule.streamText as unknown as jest.Mock).mock.calls[0][0];
    expect(streamArgs.tools).toBeUndefined();
    expect(streamArgs.providerOptions.google.functionCallingConfig).toBeUndefined();
    expect(aiModule.tool).not.toHaveBeenCalled();
    expect(aiModule.jsonSchema).not.toHaveBeenCalled();
  });

  it('emits turn_error and throws when SDK stream yields error part', async () => {
    mockSdkResult([{ type: 'error', error: new Error('google stream failed') }]);

    const chunks: ChatChunk[] = [];
    await expect(
      provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk))
    ).rejects.toThrow('google stream failed');
    expect(chunks).toContainEqual({
      type: 'turn_error',
      errorType: 'provider',
      message: 'google stream failed',
    });
  });

  it('throws LLMRequestAbortedError when SDK throws abort-like error', async () => {
    const abortError = new Error('aborted');
    (abortError as Error & { name: string }).name = 'AbortError';
    (aiModule.streamText as unknown as jest.Mock).mockImplementation(() => {
      throw abortError;
    });

    await expect(provider.chat(mockMessages, mockOptions, () => {})).rejects.toBeInstanceOf(
      LLMRequestAbortedError
    );
  });

  it('uses CHAT_TIMEOUT_MS for abort controller timer', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(mockMessages, mockOptions, () => {});

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), CHAT_TIMEOUT_MS);
    setTimeoutSpy.mockRestore();
  });
});
