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
  stepCountIs: jest.fn((stepCount) => ({ type: 'step-count-is', stepCount })),
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
    (aiModule.stepCountIs as unknown as jest.Mock).mockClear();
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
    expect(aiModule.stepCountIs).toHaveBeenCalledWith(100000);
    expect(aiModule.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: { type: 'step-count-is', stepCount: 100000 },
      })
    );
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

  /* Preconditions: SDK stream yields an error part with an Error instance
     Action: chat() processes the error part
     Assertions: Original Error is thrown directly (preserving AI SDK error chain for ErrorNormalizer);
       no turn_error chunk is emitted because the error is thrown before onChunk
     Requirements: llm-integration.3.11 */
  it('throws original Error when SDK stream yields error part', async () => {
    const sdkError = new Error('google stream failed');
    mockSdkResult([{ type: 'error', error: sdkError }]);

    const chunks: ChatChunk[] = [];
    await expect(
      provider.chat(mockMessages, mockOptions, (chunk) => chunks.push(chunk))
    ).rejects.toThrow('google stream failed');
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

    const timeoutCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] === CHAT_TIMEOUT_MS);
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(3);

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

  /* Preconditions: Tool with execute function is provided; tool execution takes time
     Action: provider.chat() invokes tool execute via buildToolSet wrapper
     Assertions: Ordered events verify pause is called before tool execute and resume is called
       after, so tool time does not consume CHAT_TIMEOUT_MS budget
     Requirements: llm-integration.3.6.1 */
  it('pauses timeout during tool execution and resumes after', async () => {
    const events: string[] = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((...args: Parameters<typeof setTimeout>) => {
        if (args[1] === CHAT_TIMEOUT_MS) {
          events.push('setTimeout:CHAT_TIMEOUT_MS');
        }
        return originalSetTimeout(...args);
      });
    const clearTimeoutSpy = jest
      .spyOn(global, 'clearTimeout')
      .mockImplementation((...args: Parameters<typeof clearTimeout>) => {
        events.push('clearTimeout');
        return originalClearTimeout(...args);
      });

    const toolExecute = jest.fn().mockImplementation(async () => {
      events.push('toolExecute');
      return { result: 'ok' };
    });

    (aiModule.streamText as unknown as jest.Mock).mockImplementation(() => {
      return {
        fullStream: toAsyncIterable([{ type: 'text-delta', text: 'ok' }]),
        totalUsage: Promise.resolve({}),
      };
    });

    // The tool mock captures the execute wrapper from buildToolSet and awaits it
    // to ensure the full pause->execute->resume sequence completes
    (aiModule.tool as unknown as jest.Mock).mockImplementation((definition) => {
      if (definition.execute) {
        definition.execute({ code: 'test' });
      }
      return { ...definition };
    });

    await provider.chat(
      mockMessages,
      {
        model: 'gemini-2.5-pro',
        tools: [
          {
            name: 'code_exec',
            description: 'Execute code',
            parameters: { type: 'object', properties: { code: { type: 'string' } } },
            execute: toolExecute,
          },
        ],
      },
      () => {}
    );

    // Wait for the async execute wrapper (pause->execute->resume) to complete
    await new Promise((resolve) => originalSetTimeout(resolve, 20));

    // Verify tool executor was called
    expect(toolExecute).toHaveBeenCalledWith({ code: 'test' }, undefined);

    // Verify ordering: pause (clearTimeout without follow-up setTimeout) must come before
    // toolExecute, and resume (setTimeout:CHAT_TIMEOUT_MS) must come after toolExecute
    const pauseIndex = events.indexOf('clearTimeout');
    const executeIndex = events.indexOf('toolExecute');
    const resumeAfterExecuteEvents = events.slice(executeIndex + 1);
    const resumeIndex = events.indexOf('setTimeout:CHAT_TIMEOUT_MS', executeIndex + 1);

    expect(pauseIndex).toBeGreaterThanOrEqual(0);
    expect(executeIndex).toBeGreaterThan(pauseIndex);
    expect(resumeIndex).toBeGreaterThan(executeIndex);
    // Between pause (clearTimeout) and execute, there must NOT be a setTimeout:CHAT_TIMEOUT_MS
    // (that would mean timeout was resumed before execute, defeating the pause purpose)
    const eventsBetweenPauseAndExecute = events.slice(pauseIndex + 1, executeIndex);
    expect(eventsBetweenPauseAndExecute).not.toContain('setTimeout:CHAT_TIMEOUT_MS');
    // After execute, resume must fire setTimeout:CHAT_TIMEOUT_MS
    expect(resumeAfterExecuteEvents).toContain('setTimeout:CHAT_TIMEOUT_MS');

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  /* Preconditions: Tool with execute function that throws an error is provided
     Action: provider.chat() invokes tool execute via buildToolSet wrapper, tool throws
     Assertions: Ordered events verify resume (setTimeout:CHAT_TIMEOUT_MS) is called after tool
       execution failure via finally block, preserving pause->execute->resume ordering
     Requirements: llm-integration.3.6.1 */
  it('resumes timeout after tool execution failure', async () => {
    const events: string[] = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((...args: Parameters<typeof setTimeout>) => {
        if (args[1] === CHAT_TIMEOUT_MS) {
          events.push('setTimeout:CHAT_TIMEOUT_MS');
        }
        return originalSetTimeout(...args);
      });
    const clearTimeoutSpy = jest
      .spyOn(global, 'clearTimeout')
      .mockImplementation((...args: Parameters<typeof clearTimeout>) => {
        events.push('clearTimeout');
        return originalClearTimeout(...args);
      });

    const toolError = new Error('tool crashed');
    const toolExecute = jest.fn().mockImplementation(async () => {
      events.push('toolExecute');
      throw toolError;
    });

    (aiModule.streamText as unknown as jest.Mock).mockImplementation(() => {
      return {
        fullStream: toAsyncIterable([{ type: 'text-delta', text: 'ok' }]),
        totalUsage: Promise.resolve({}),
      };
    });

    let wrappedExecuteError: Error | null = null;

    (aiModule.tool as unknown as jest.Mock).mockImplementation((definition) => {
      if (definition.execute) {
        definition.execute({ code: 'test' }).catch((err: Error) => {
          wrappedExecuteError = err;
        });
      }
      return { ...definition };
    });

    await provider.chat(
      mockMessages,
      {
        model: 'gemini-2.5-pro',
        tools: [
          {
            name: 'code_exec',
            description: 'Execute code',
            parameters: { type: 'object', properties: { code: { type: 'string' } } },
            execute: toolExecute,
          },
        ],
      },
      () => {}
    );

    // Wait for the async error to propagate and finally block to complete
    await new Promise((resolve) => originalSetTimeout(resolve, 20));

    // Verify the tool error propagated
    expect(wrappedExecuteError).toBe(toolError);

    // Verify ordering: pause->execute->resume even when tool throws
    const pauseIndex = events.indexOf('clearTimeout');
    const executeIndex = events.indexOf('toolExecute');
    const resumeIndex = events.indexOf('setTimeout:CHAT_TIMEOUT_MS', executeIndex + 1);

    expect(pauseIndex).toBeGreaterThanOrEqual(0);
    expect(executeIndex).toBeGreaterThan(pauseIndex);
    // resume must still fire after execute (via finally block) even though tool threw
    expect(resumeIndex).toBeGreaterThan(executeIndex);
    // Between pause and execute, no setTimeout:CHAT_TIMEOUT_MS should occur
    const eventsBetweenPauseAndExecute = events.slice(pauseIndex + 1, executeIndex);
    expect(eventsBetweenPauseAndExecute).not.toContain('setTimeout:CHAT_TIMEOUT_MS');

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
