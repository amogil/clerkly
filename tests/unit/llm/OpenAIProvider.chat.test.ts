// Requirements: llm-integration.5

import * as aiModule from 'ai';
import * as openAiSdkModule from '@ai-sdk/openai';
import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import type { ChatMessage, ChatOptions, ChatChunk } from '../../../src/main/llm/ILLMProvider';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';
import { CHAT_TIMEOUT_MS } from '../../../src/main/llm/LLMConfig';

jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((definition) => ({ ...definition })),
  jsonSchema: jest.fn((schema) => schema),
  stepCountIs: jest.fn((stepCount) => ({ type: 'step-count-is', stepCount })),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(),
}));

const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const mockOptions: ChatOptions = { model: 'gpt-5-nano' };

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

describe('OpenAIProvider.chat()', () => {
  let provider: OpenAIProvider;
  let responsesMock: jest.Mock;

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key');
    responsesMock = jest.fn().mockReturnValue({ specificationVersion: 'v3' });
    (openAiSdkModule.createOpenAI as unknown as jest.Mock).mockReturnValue({
      responses: responsesMock,
    });
    (aiModule.streamText as unknown as jest.Mock).mockReset();
    (aiModule.tool as unknown as jest.Mock).mockClear();
    (aiModule.jsonSchema as unknown as jest.Mock).mockClear();
    (aiModule.stepCountIs as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams reasoning/text chunks and returns usage envelope', async () => {
    mockSdkResult(
      [
        { type: 'reasoning-delta', text: 'Think ' },
        { type: 'text-delta', text: 'Hello' },
        { type: 'text-delta', text: ' world' },
      ],
      {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 2,
        reasoningTokens: 1,
      }
    );

    const chunks: ChatChunk[] = [];
    const result = await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    expect(result.text).toBe('Hello world');
    expect(result.usage?.canonical).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cached_tokens: 2,
      reasoning_tokens: 1,
    });
    expect(chunks).toContainEqual({ type: 'reasoning', delta: 'Think ' });
    expect(chunks).toContainEqual({ type: 'text', delta: 'Hello' });
    expect(chunks).toContainEqual({ type: 'text', delta: ' world' });
    expect(aiModule.stepCountIs).toHaveBeenCalledWith(100000);
    expect(aiModule.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: { type: 'step-count-is', stepCount: 100000 },
      })
    );
  });

  it('emits tool_call chunks for multiple calls in one turn', async () => {
    mockSdkResult([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool_a',
        input: { a: 1 },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'tool_b',
        input: { b: 2 },
      },
      { type: 'text-delta', text: 'ok' },
    ]);

    const chunks: ChatChunk[] = [];
    await provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk));

    const toolCalls = chunks.filter((chunk) => chunk.type === 'tool_call');
    expect(toolCalls).toEqual([
      { type: 'tool_call', callId: 'call-1', toolName: 'tool_a', arguments: { a: 1 } },
      { type: 'tool_call', callId: 'call-2', toolName: 'tool_b', arguments: { b: 2 } },
    ]);
  });

  it('emits tool_result chunks for successful and failed tool execution parts', async () => {
    mockSdkResult([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool_a',
        input: { a: 1 },
        output: { ok: true },
      },
      {
        type: 'tool-error',
        toolCallId: 'call-2',
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
        callId: 'call-1',
        toolName: 'tool_a',
        arguments: { a: 1 },
        output: { ok: true },
        status: 'success',
      },
      {
        type: 'tool_result',
        callId: 'call-2',
        toolName: 'tool_b',
        arguments: { b: 2 },
        output: { message: 'tool failed' },
        status: 'error',
      },
    ]);
  });

  it('passes tool definitions and provider options to streamText', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'gpt-5-nano',
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
    expect(streamArgs.providerOptions.openai).toEqual({
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
      strictJsonSchema: true,
      parallelToolCalls: true,
    });
    expect(streamArgs.tools).toHaveProperty('search_docs');
    expect(aiModule.jsonSchema).toHaveBeenCalledWith({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    expect(aiModule.tool).toHaveBeenCalled();
    expect(responsesMock).toHaveBeenCalledWith('gpt-5-nano');
  });

  it('does not build tool definitions when tools list is empty', async () => {
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(
      mockMessages,
      {
        model: 'gpt-5-nano',
        tools: [],
      },
      () => {}
    );

    const streamArgs = (aiModule.streamText as unknown as jest.Mock).mock.calls[0][0];
    expect(streamArgs.tools).toBeUndefined();
    expect(aiModule.tool).not.toHaveBeenCalled();
    expect(aiModule.jsonSchema).not.toHaveBeenCalled();
  });

  /* Preconditions: SDK stream yields an error part with an Error instance
     Action: chat() processes the error part
     Assertions: Original Error is thrown directly (preserving AI SDK error chain for ErrorNormalizer);
       no turn_error chunk is emitted because the error is thrown before onChunk
     Requirements: llm-integration.3.11 */
  it('throws original Error when SDK stream yields error part', async () => {
    const sdkError = new Error('broken');
    mockSdkResult([{ type: 'error', error: sdkError }]);

    const chunks: ChatChunk[] = [];
    await expect(
      provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk))
    ).rejects.toThrow('broken');
    // No turn_error chunk emitted — the original error is thrown directly
    // so that ErrorNormalizer can extract statusCode from the AI SDK error chain
    expect(chunks).toEqual([]);
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

  /* Preconditions: External abort signal is already aborted before provider chat call starts
     Action: Start provider chat with pre-aborted signal
     Assertions: Provider throws LLMRequestAbortedError and does not continue normal streaming
     Requirements: llm-integration.5.1, llm-integration.12.4 */
  it('throws LLMRequestAbortedError when external signal is already aborted before chat starts', async () => {
    (aiModule.streamText as unknown as jest.Mock).mockImplementation(({ abortSignal }) => {
      if (abortSignal?.aborted) {
        const abortError = new Error('aborted before start');
        (abortError as Error & { name: string }).name = 'AbortError';
        throw abortError;
      }
      return { fullStream: toAsyncIterable([]), totalUsage: Promise.resolve({}) };
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.chat(mockMessages, mockOptions, () => {}, controller.signal)
    ).rejects.toBeInstanceOf(LLMRequestAbortedError);
  });

  it('uses CHAT_TIMEOUT_MS for abort controller timer', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockSdkResult([{ type: 'text-delta', text: 'ok' }]);

    await provider.chat(mockMessages, mockOptions, () => {});

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), CHAT_TIMEOUT_MS);
    setTimeoutSpy.mockRestore();
  });

  /* Preconditions: SDK invokes onStepFinish during multi-step tool loop
     Action: provider.chat() completes with onStepFinish callback
     Assertions: timeout timer is reset (clearTimeout + setTimeout called again) after each step
     Requirements: llm-integration.3.6, llm-integration.3.6.1 */
  it('resets timeout timer on each onStepFinish so tool execution does not eat model timeout', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    (aiModule.streamText as unknown as jest.Mock).mockImplementation((options) => {
      // Simulate two steps: first is a tool-call step, second is final
      options.onStepFinish?.({
        stepNumber: 0,
        finishReason: 'tool-calls',
        toolCalls: [{ id: 't1' }],
        toolResults: [{ id: 't1' }],
        usage: {},
      });
      options.onStepFinish?.({
        stepNumber: 1,
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
        usage: {},
      });
      return {
        fullStream: toAsyncIterable([{ type: 'text-delta', text: 'ok' }]),
        totalUsage: Promise.resolve({}),
      };
    });

    await provider.chat(mockMessages, mockOptions, () => {});

    // Initial setTimeout + 2 resets in onStepFinish = 3 calls with CHAT_TIMEOUT_MS
    const timeoutCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] === CHAT_TIMEOUT_MS);
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(3);

    // clearTimeout called at least 2 times by resetTimeout + 1 in finally
    const clearCalls = clearTimeoutSpy.mock.calls.length;
    expect(clearCalls).toBeGreaterThanOrEqual(3);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  /* Preconditions: SDK multi-step tool loop where tool execution happens between onStepFinish and
       experimental_onStepStart of the next step
     Action: provider.chat() completes with both onStepFinish and experimental_onStepStart callbacks
     Assertions: timeout timer is reset at experimental_onStepStart giving post-tool continuation
       a fresh full timeout budget
     Requirements: llm-integration.3.6.1 */
  it('resets timeout timer on experimental_onStepStart so post-tool continuation gets fresh budget', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    (aiModule.streamText as unknown as jest.Mock).mockImplementation((options) => {
      // Step 0: model responds with tool_call
      options.experimental_onStepStart?.({ stepNumber: 0 });
      options.onStepFinish?.({
        stepNumber: 0,
        finishReason: 'tool-calls',
        toolCalls: [{ id: 't1' }],
        toolResults: [{ id: 't1' }],
        usage: {},
      });
      // Tool execution happens here (time passes in real scenario)
      // Step 1: post-tool continuation — this must reset timeout
      options.experimental_onStepStart?.({ stepNumber: 1 });
      options.onStepFinish?.({
        stepNumber: 1,
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
        usage: {},
      });
      return {
        fullStream: toAsyncIterable([{ type: 'text-delta', text: 'ok' }]),
        totalUsage: Promise.resolve({}),
      };
    });

    await provider.chat(mockMessages, mockOptions, () => {});

    // Initial setTimeout(1) + onStepStart(0)(2) + onStepFinish(0)(3) + onStepStart(1)(4) + onStepFinish(1)(5)
    // = 5 calls with CHAT_TIMEOUT_MS
    const timeoutCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] === CHAT_TIMEOUT_MS);
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(5);

    // clearTimeout called by each resetTimeout (4 resets) + 1 in finally = at least 5
    const clearCalls = clearTimeoutSpy.mock.calls.length;
    expect(clearCalls).toBeGreaterThanOrEqual(5);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
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
