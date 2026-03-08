// Requirements: llm-integration.5

import * as aiModule from 'ai';
import * as anthropicSdkModule from '@ai-sdk/anthropic';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';
import { CHAT_TIMEOUT_MS } from '../../../src/main/llm/LLMConfig';

jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((definition) => ({ ...definition })),
  jsonSchema: jest.fn((schema) => schema),
  stepCountIs: jest.fn(() => ({ kind: 'step-count' })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(),
}));

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'claude-sonnet-4-5-20250929' };

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

describe('AnthropicProvider.chat()', () => {
  let provider: AnthropicProvider;
  let messagesMock: jest.Mock;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
    messagesMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    (anthropicSdkModule.createAnthropic as unknown as jest.Mock).mockReturnValue({
      messages: messagesMock,
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
        { type: 'reasoning-delta', text: 'Think ' },
        { type: 'text-delta', text: 'Anthropic' },
        { type: 'text-delta', text: ' answer' },
      ],
      {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      }
    );

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(result.text).toBe('Anthropic answer');
    expect(result.usage?.canonical.total_tokens).toBe(20);
    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Think ' });
    expect(chunks).toContainEqual({ type: 'text', delta: 'Anthropic' });
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

  it('passes tools and anthropic provider options to streamText', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'claude-sonnet-4-5-20250929',
        reasoningEffort: 'high',
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
    expect(streamArgs.providerOptions.anthropic).toEqual({
      thinking: {
        type: 'enabled',
        budgetTokens: 16000,
      },
      disableParallelToolUse: false,
    });
    expect(streamArgs.tools).toHaveProperty('search_docs');
    expect(aiModule.jsonSchema).toHaveBeenCalledWith({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    expect(aiModule.tool).toHaveBeenCalled();
    expect(messagesMock).toHaveBeenCalledWith('claude-sonnet-4-5-20250929');
  });

  it('does not build tool definitions when tools list is empty', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'claude-sonnet-4-5-20250929',
        tools: [],
      },
      () => {}
    );

    const streamArgs = (aiModule.streamText as unknown as jest.Mock).mock.calls[0][0];
    expect(streamArgs.tools).toBeUndefined();
    expect(aiModule.tool).not.toHaveBeenCalled();
    expect(aiModule.jsonSchema).not.toHaveBeenCalled();
  });

  it('emits turn_error and throws when SDK stream yields error part', async () => {
    mockSdkResult([{ type: 'error', error: new Error('anthropic stream failed') }]);

    const chunks: ChatChunk[] = [];
    await expect(
      provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk))
    ).rejects.toThrow('anthropic stream failed');
    expect(chunks).toContainEqual({
      type: 'turn_error',
      errorType: 'provider',
      message: 'anthropic stream failed',
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

  it('collects per-step diagnostics from SDK onStep callbacks', async () => {
    (aiModule.streamText as unknown as jest.Mock).mockImplementation((options) => {
      options.experimental_onStepStart?.({ stepNumber: 0 });
      options.onStepFinish?.({
        stepNumber: 0,
        finishReason: 'stop',
        toolCalls: [{ id: 't1' }],
        toolResults: [{ id: 't1' }],
        usage: { inputTokens: 1, outputTokens: 2 },
      });
      return {
        fullStream: toAsyncIterable([{ type: 'text-delta', text: 'ok' }]),
        totalUsage: Promise.resolve({}),
      };
    });

    const result = await provider.chat(mockMessages, mockOptions, () => {});
    expect(result.stepDiagnostics?.[0]).toEqual(
      expect.objectContaining({
        stepIndex: 0,
        finishReason: 'stop',
        toolCallsCount: 1,
        toolResultsCount: 1,
      })
    );
  });
});
