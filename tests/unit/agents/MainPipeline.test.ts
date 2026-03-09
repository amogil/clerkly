// Requirements: llm-integration.1, llm-integration.2, llm-integration.5

import { MainPipeline } from '../../../src/main/agents/MainPipeline';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import {
  MessageLlmReasoningUpdatedEvent,
  MessageLlmTextUpdatedEvent,
  AgentRateLimitEvent,
  LLMPipelineDiagnosticEvent,
} from '../../../src/shared/events/types';
import type { MessageManager } from '../../../src/main/agents/MessageManager';
import type { AIAgentSettingsManager } from '../../../src/main/AIAgentSettingsManager';
import type { PromptBuilder } from '../../../src/main/agents/PromptBuilder';
import type {
  ILLMProvider,
  ChatMessage,
  ChatOptions,
  ChatChunk,
} from '../../../src/main/llm/ILLMProvider';
import type { IToolExecutor } from '../../../src/main/tools/ToolRunner';
import type { Message } from '../../../src/main/db/schema';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';

jest.mock('../../../src/main/events/MainEventBus', () => ({
  MainEventBus: {
    getInstance: jest.fn(() => ({ publish: jest.fn() })),
  },
}));

jest.mock('../../../src/main/Logger', () => ({
  Logger: {
    create: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

function makeMessage(id: number, kind: string = 'user'): Message {
  return {
    id,
    agentId: 'agent-1',
    kind,
    timestamp: new Date().toISOString(),
    payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
    usageJson: null,
    replyToMessageId: null,
    hidden: false,
    done: true,
  };
}

function makeMocks() {
  const mockPublish = jest.fn();
  (MainEventBus.getInstance as jest.Mock).mockReturnValue({ publish: mockPublish });

  const userMsg = makeMessage(1, 'user');
  const llmMsg = makeMessage(2, 'llm');
  const errorMsg = makeMessage(3, 'error');
  let nextToolMessageId = 100;

  const messageManager = {
    list: jest.fn().mockReturnValue([userMsg]),
    listForModelHistory: jest.fn().mockReturnValue([userMsg]),
    getLastMessage: jest.fn().mockReturnValue(userMsg),
    create: jest.fn().mockImplementation((_agentId: string, kind: string) => {
      if (kind === 'llm') return llmMsg;
      if (kind === 'error') return errorMsg;
      if (kind === 'tool_call') return makeMessage(nextToolMessageId++, kind);
      return makeMessage(99, kind);
    }),
    update: jest.fn(),
    setHidden: jest.fn(),
    hideAndMarkIncomplete: jest.fn(),
    setDone: jest.fn(),
    setUsage: jest.fn(),
    toEventMessage: jest.fn(),
  } as unknown as jest.Mocked<MessageManager>;

  const settingsManager = {
    loadLLMProvider: jest.fn().mockResolvedValue('openai'),
    loadAPIKey: jest.fn().mockResolvedValue('sk-test-key'),
  } as unknown as jest.Mocked<AIAgentSettingsManager>;

  const promptBuilder = {
    build: jest.fn().mockReturnValue({ systemPrompt: 'sys', history: '', tools: [] }),
    buildMessages: jest.fn().mockReturnValue([{ role: 'user', content: 'Hello' }]),
  } as unknown as jest.Mocked<PromptBuilder>;

  const llmProvider: jest.Mocked<ILLMProvider> = {
    chat: jest.fn(),
    testConnection: jest.fn(),
    getProviderName: jest.fn().mockReturnValue('OpenAI'),
  };

  const createProvider = jest.fn().mockReturnValue(llmProvider);
  const toolExecutor: jest.Mocked<IToolExecutor> = {
    executeBatch: jest.fn().mockResolvedValue([]),
  };
  const pipeline = new MainPipeline(
    messageManager,
    settingsManager,
    promptBuilder,
    createProvider,
    toolExecutor
  );

  return {
    pipeline,
    messageManager,
    settingsManager,
    promptBuilder,
    llmProvider,
    toolExecutor,
    mockPublish,
  };
}

describe('MainPipeline.run()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('default provider factory wiring resolves known providers and rejects unknown', () => {
    const { messageManager, settingsManager, promptBuilder } = makeMocks();
    const pipeline = new MainPipeline(messageManager, settingsManager, promptBuilder);
    const createProvider = (
      pipeline as unknown as { createProvider: (p: string, k: string) => unknown }
    ).createProvider;

    expect(createProvider('openai', 'k')).toBeDefined();
    expect(createProvider('anthropic', 'k')).toBeDefined();
    expect(createProvider('google', 'k')).toBeDefined();
    expect(() => createProvider('unknown', 'k')).toThrow('Unknown provider: unknown');
  });

  it('streams reasoning/text and finalizes llm message with data.text', async () => {
    const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Let me think ' });
        onChunk({ type: 'text', delta: 'Hello' });
        onChunk({ type: 'text', delta: ' back' });
        return {
          usage: {
            canonical: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            raw: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: { text: 'Let me think ', excluded_from_replay: true },
        }),
      }),
      1,
      false
    );

    expect(messageManager.update).toHaveBeenLastCalledWith(
      2,
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          text: 'Hello back',
        }),
      }),
      true
    );
    const finalPayload = (messageManager.update as jest.Mock).mock.calls.at(-1)?.[2] as {
      data?: Record<string, unknown>;
    };
    expect(finalPayload.data?.text).toBe('Hello back');
    expect(finalPayload.data).not.toHaveProperty('action');

    const reasoningEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((e: unknown) => e instanceof MessageLlmReasoningUpdatedEvent);
    expect(reasoningEvents).toHaveLength(1);

    const textEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((e: unknown) => e instanceof MessageLlmTextUpdatedEvent);
    expect(textEvents).toHaveLength(2);

    expect(messageManager.setUsage).toHaveBeenCalledWith(
      2,
      'agent-1',
      expect.objectContaining({
        canonical: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      })
    );
  });

  it('persists tool_call lifecycle from tool_call/tool_result stream chunks and finalizes llm text', async () => {
    const { pipeline, llmProvider, toolExecutor, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Think' });
        onChunk({
          type: 'tool_call',
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
          output: { result: 'ok' },
          status: 'success',
        });
        onChunk({ type: 'text', delta: 'Done' });
        return { text: 'Done' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(toolExecutor.executeBatch).not.toHaveBeenCalled();
    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'streaming' },
        }),
      }),
      1,
      false
    );
    expect(messageManager.update).toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-1',
          toolName: 'search_docs',
          output: expect.objectContaining({ status: 'success' }),
        }),
      }),
      true
    );
  });

  it('persists valid final_answer tool_call as completed', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: {
            text: 'Task completed',
            summary_points: ['Step A done', 'Step B done'],
          },
        });
        return { text: 'assistant text' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: expect.objectContaining({
            text: 'Task completed',
          }),
        }),
      }),
      1,
      true
    );
  });

  it('persists final_answer tool_call without local validation retry loop in MainPipeline', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        onChunk({
          type: 'tool_call',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: {
            text: 'Task completed',
            summary_points: ['Done'],
          },
        });
        return { text: 'assistant text final' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
    expect(messageManager.hideAndMarkIncomplete).not.toHaveBeenCalled();
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: expect.objectContaining({ text: 'Task completed' }),
        }),
      }),
      1,
      true
    );
  });

  it('normalizes final_answer defaults in runtime payload when fields are absent', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-defaults',
          toolName: 'final_answer',
          arguments: {},
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-final-defaults',
          toolName: 'final_answer',
          arguments: { summary_points: [] },
        }),
      }),
      1,
      true
    );
  });

  it('creates kind:error when provider returns final invalid final_answer failure', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    const invalidToolError = new Error('Tool arguments are invalid');
    invalidToolError.name = 'InvalidToolInputError';
    llmProvider.chat.mockRejectedValue(invalidToolError);

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            type: 'tool',
          }),
        }),
      }),
      1,
      true
    );
  });

  it('handles multiple tool calls from one turn via stream chunks', async () => {
    const { pipeline, llmProvider, toolExecutor, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'tool_call', callId: 'call-b', toolName: 'tool_b', arguments: { q: 2 } });
        onChunk({ type: 'tool_call', callId: 'call-a', toolName: 'tool_a', arguments: { q: 1 } });
        onChunk({
          type: 'tool_result',
          callId: 'call-b',
          toolName: 'tool_b',
          arguments: { q: 2 },
          output: { ok: 'B' },
          status: 'success',
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-a',
          toolName: 'tool_a',
          arguments: { q: 1 },
          output: { ok: 'A' },
          status: 'success',
        });
        return { text: 'final' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(toolExecutor.executeBatch).not.toHaveBeenCalled();
    const toolCallCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'tool_call'
    );
    expect(toolCallCreates).toHaveLength(2);

    const toolCallDoneUpdates = (messageManager.update as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[3] === true
    );
    expect(toolCallDoneUpdates.length).toBeGreaterThanOrEqual(2);
  });

  it('finalizes tool_call with error output when tool_result arrives with error status', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-stub',
          toolName: 'unknown_tool',
          arguments: { foo: 'bar' },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-stub',
          toolName: 'unknown_tool',
          arguments: { foo: 'bar' },
          output: { message: 'Tool "unknown_tool" is not available.' },
          status: 'error',
        });
        return { text: 'final after stub' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.update).toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-stub',
          toolName: 'unknown_tool',
          output: expect.objectContaining({
            status: 'error',
          }),
        }),
      }),
      true
    );
  });

  it('creates finalized llm message from result.text when no text chunks were emitted', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();

    llmProvider.chat.mockResolvedValue({ text: 'Fallback final text' });

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({ data: expect.objectContaining({ text: 'Fallback final text' }) }),
      1,
      true
    );
  });

  it('hides in-flight llm message and creates error on provider failure after streaming start', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        throw new Error('Connection dropped');
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({ error: expect.objectContaining({ type: 'provider' }) }),
      }),
      1,
      true
    );
  });

  it('creates auth error with action_link when api key is missing', async () => {
    const { pipeline, messageManager } = makeMocks();
    const settingsManager = (pipeline as unknown as { settingsManager: AIAgentSettingsManager })
      .settingsManager as unknown as { loadAPIKey: jest.Mock };
    settingsManager.loadAPIKey.mockResolvedValue('');

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            type: 'auth',
            action_link: { label: 'Open Settings', screen: 'settings' },
          }),
        }),
      }),
      1,
      true
    );
  });

  it('publishes AgentRateLimitEvent and does not create error message for rate limit', async () => {
    const { pipeline, llmProvider, messageManager, mockPublish } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('Rate limit exceeded. Please try again in 9.2s'));

    await pipeline.run('agent-1', 1);

    const rateLimitEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((event: unknown) => event instanceof AgentRateLimitEvent);
    expect(rateLimitEvents).toHaveLength(1);

    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('parses "retry after N seconds" form for rate-limit event', async () => {
    const { pipeline, llmProvider, mockPublish } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('429 retry after 7 seconds'));

    await pipeline.run('agent-1', 1);

    const rateLimitEvent = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .find((event: unknown) => event instanceof AgentRateLimitEvent) as
      | AgentRateLimitEvent
      | undefined;
    expect(rateLimitEvent?.retryAfterSeconds).toBe(7);
  });

  it('falls back to default retry-after seconds when rate-limit text has no parsable delay', async () => {
    const { pipeline, llmProvider, mockPublish } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('Rate limit exceeded'));

    await pipeline.run('agent-1', 1);

    const rateLimitEvent = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .find((event: unknown) => event instanceof AgentRateLimitEvent) as
      | AgentRateLimitEvent
      | undefined;
    expect(rateLimitEvent?.retryAfterSeconds).toBe(10);
  });

  it('maps provider abort errors to timeout kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockRejectedValue(
      new LLMRequestAbortedError('Model response timeout', new Error('aborted'))
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'timeout' }),
        }),
      }),
      1,
      true
    );
  });

  it('hides in-flight llm message and does not create error when aborted', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    const controller = new AbortController();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        controller.abort();
        onChunk({ type: 'text', delta: 'partial' });
        return { text: 'partial' };
      }
    );

    await pipeline.run('agent-1', 1, controller.signal);

    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('returns early without side effects when already aborted before run', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();
    const controller = new AbortController();
    controller.abort();

    await pipeline.run('agent-1', 1, controller.signal);

    expect(llmProvider.chat).not.toHaveBeenCalled();
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('cancels after tool_call streaming without creating kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    const controller = new AbortController();

    llmProvider.chat.mockImplementation(async (_m, _o, onChunk) => {
      onChunk({ type: 'reasoning', delta: 'Thinking...' });
      onChunk({
        type: 'tool_call',
        callId: 'call-1',
        toolName: 'search_docs',
        arguments: { query: 'x' },
      });
      controller.abort();
      return {};
    });

    await pipeline.run('agent-1', 1, controller.signal);

    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('cancels before final llm completion without creating kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    const controller = new AbortController();

    llmProvider.chat.mockImplementation(async (_m, _o, onChunk) => {
      onChunk({ type: 'reasoning', delta: 'Thinking...' });
      controller.abort();
      return { text: 'partial' };
    });

    await pipeline.run('agent-1', 1, controller.signal);

    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('passes tools from PromptBuilder to provider chat options', async () => {
    const { pipeline, llmProvider } = makeMocks();
    const promptBuilder = (pipeline as unknown as { promptBuilder: PromptBuilder })
      .promptBuilder as unknown as { build: jest.Mock };
    promptBuilder.build.mockReturnValue({
      systemPrompt: 'sys',
      history: '',
      tools: [{ name: 'search_docs', description: 'Search docs', parameters: { type: 'object' } }],
    });

    llmProvider.chat.mockResolvedValue({ text: 'ok' });
    await pipeline.run('agent-1', 1);

    const optionsArg = (llmProvider.chat as jest.Mock).mock.calls[0][1] as ChatOptions;
    expect(optionsArg.tools).toEqual([
      expect.objectContaining({
        name: 'search_docs',
        description: 'Search docs',
        parameters: { type: 'object' },
        execute: expect.any(Function),
      }),
    ]);
  });

  it('uses tool-provided execute handler when available', async () => {
    const { pipeline } = makeMocks();
    const toolExecute = jest.fn().mockResolvedValue({ ok: true });
    const bind = (
      pipeline as unknown as {
        bindToolExecutors: (
          tools: NonNullable<ChatOptions['tools']>
        ) => NonNullable<ChatOptions['tools']>;
      }
    ).bindToolExecutors.bind(pipeline);

    const [bound] = bind([
      {
        name: 'custom_tool',
        description: 'Custom tool',
        parameters: { type: 'object' },
        execute: toolExecute,
      },
    ]);

    const output = await bound.execute?.({ x: 1 });
    expect(output).toEqual({ ok: true });
    expect(toolExecute).toHaveBeenCalledWith({ x: 1 }, undefined);
  });

  it('falls back to ToolRunner execution for tools without execute', async () => {
    const { pipeline, toolExecutor } = makeMocks();
    const bind = (
      pipeline as unknown as {
        bindToolExecutors: (
          tools: NonNullable<ChatOptions['tools']>
        ) => NonNullable<ChatOptions['tools']>;
      }
    ).bindToolExecutors.bind(pipeline);

    toolExecutor.executeBatch.mockResolvedValueOnce([
      {
        callId: 'call-1',
        toolName: 'fallback_tool',
        status: 'success',
        output: 'done',
      },
    ]);

    const [bound] = bind([
      {
        name: 'fallback_tool',
        description: 'Fallback tool',
        parameters: { type: 'object' },
      },
    ]);

    const successOutput = await bound.execute?.({ foo: 'bar' });
    expect(successOutput).toEqual({ status: 'success', content: 'done' });
    expect(toolExecutor.executeBatch).toHaveBeenCalledTimes(1);

    toolExecutor.executeBatch.mockResolvedValueOnce([
      {
        callId: 'call-2',
        toolName: 'fallback_tool',
        status: 'policy_denied',
        output: 'denied',
      },
    ]);

    await expect(bound.execute?.({ foo: 'bar' })).rejects.toThrow('denied');
  });

  it('handles empty tool registry without calling tool executor', async () => {
    const { pipeline, llmProvider, toolExecutor } = makeMocks();
    const promptBuilder = (pipeline as unknown as { promptBuilder: PromptBuilder })
      .promptBuilder as unknown as { build: jest.Mock };
    promptBuilder.build.mockReturnValue({
      systemPrompt: 'sys',
      history: '',
      tools: [],
    });

    llmProvider.chat.mockResolvedValue({ text: 'ok' });
    await pipeline.run('agent-1', 1);

    const optionsArg = (llmProvider.chat as jest.Mock).mock.calls[0][1] as ChatOptions;
    expect(optionsArg.tools).toEqual([]);
    expect(toolExecutor.executeBatch).not.toHaveBeenCalled();
  });

  it('publishes diagnostic event on pipeline failures', async () => {
    const { pipeline, llmProvider, mockPublish } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('provider blew up'));

    await pipeline.run('agent-1', 1);

    const diagnostics = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((event: unknown) => event instanceof LLMPipelineDiagnosticEvent);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('publishes step diagnostics when provider returns stepDiagnostics', async () => {
    const { pipeline, llmProvider, mockPublish } = makeMocks();
    llmProvider.chat.mockResolvedValue({
      text: 'ok',
      stepDiagnostics: [
        {
          stepIndex: 0,
          finishReason: 'stop',
          toolCallsCount: 1,
          toolResultsCount: 1,
          latencyMs: 10,
        },
      ],
    });

    await pipeline.run('agent-1', 1);

    const stepDiagnosticEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter(
        (event: unknown) =>
          event instanceof LLMPipelineDiagnosticEvent &&
          (event as LLMPipelineDiagnosticEvent).message.includes('Step diagnostic:')
      );
    expect(stepDiagnosticEvents).toHaveLength(1);
  });

  it('handles generic fetch-like errors as network errors', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('fetch failed'));

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'network' }),
        }),
      }),
      1,
      true
    );
  });

  it('uses provider fallback category for unknown errors', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockRejectedValue(new Error('something strange'));

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'provider' }),
        }),
      }),
      1,
      true
    );
  });

  it('retries once when provider fails before first meaningful chunk', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat
      .mockRejectedValueOnce(new Error('temporary provider error'))
      .mockResolvedValueOnce({ text: 'Recovered response' });

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({ data: expect.objectContaining({ text: 'Recovered response' }) }),
      1,
      true
    );
  });

  it('does not retry after first meaningful chunk is emitted', async () => {
    const { pipeline, llmProvider } = makeMocks();
    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        throw new Error('stream interrupted');
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('limits retries to one attempt before first meaningful chunk', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat
      .mockRejectedValueOnce(new Error('temporary provider error 1'))
      .mockRejectedValueOnce(new Error('temporary provider error 2'));

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'provider' }),
        }),
      }),
      1,
      true
    );
  });

  it('maps ToolExecutionError-like failures to tool kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockRejectedValue({ name: 'ToolExecutionError', message: 'executor failed' });

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'tool' }),
        }),
      }),
      1,
      true
    );
  });

  it('maps UIMessageStreamError-like failures to protocol kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockRejectedValue({ name: 'UIMessageStreamError', message: 'invalid stream' });

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({ type: 'protocol' }),
        }),
      }),
      1,
      true
    );
  });

  it('calls handleBackgroundError when usage persistence fails', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    (messageManager.setUsage as jest.Mock).mockImplementation(() => {
      throw new Error('db failed');
    });

    llmProvider.chat.mockResolvedValue({
      text: 'ok',
      usage: {
        canonical: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        raw: {},
      },
    });

    await pipeline.run('agent-1', 1);

    expect(messageManager.setUsage).toHaveBeenCalled();
  });

  it('on aborted signal with thrown error hides in-flight message and skips kind:error', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    const controller = new AbortController();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        controller.abort();
        throw new Error('late failure');
      }
    );

    await pipeline.run('agent-1', 1, controller.signal);

    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('ignores empty reasoning/text deltas and falls back to output.text', async () => {
    const { pipeline, llmProvider, messageManager, mockPublish } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: '' });
        onChunk({ type: 'text', delta: '' });
        return { text: 'fallback final text' };
      }
    );

    await pipeline.run('agent-1', 1);

    const reasoningEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((e: unknown) => e instanceof MessageLlmReasoningUpdatedEvent);
    const textEvents = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .filter((e: unknown) => e instanceof MessageLlmTextUpdatedEvent);
    expect(reasoningEvents).toHaveLength(0);
    expect(textEvents).toHaveLength(0);

    expect(messageManager.create).toHaveBeenLastCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({
        data: expect.objectContaining({
          text: 'fallback final text',
        }),
      }),
      1,
      true
    );
  });

  it('retries once when stream emits turn_error before meaningful chunks', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'turn_error', errorType: 'provider', message: 'stream error' });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: 'Provider service unavailable. Please try again later.',
          }),
        }),
      }),
      1,
      true
    );
  });

  it('updates existing tool_call when duplicate callId arrives', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-dup',
          toolName: 'search_docs',
          arguments: { q: 'v1' },
        });
        onChunk({
          type: 'tool_call',
          callId: 'call-dup',
          toolName: 'search_docs',
          arguments: { q: 'v2' },
        });
        return { text: 'done' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.update).toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-dup',
          arguments: { q: 'v2' },
        }),
      }),
      false
    );
  });

  it('finalizes final_answer tool_result by updating existing row', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { text: 'Final answer text' },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { text: 'Final answer text' },
          output: { ignored: true },
          status: 'success',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.update).toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { text: 'Final answer text', summary_points: [] },
        }),
      }),
      true
    );
  });

  it('normalizes final_answer defaults during tool_result finalize when fields are absent', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-defaults-result',
          toolName: 'final_answer',
          arguments: {},
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-final-defaults-result',
          toolName: 'final_answer',
          arguments: {},
          output: { ignored: true },
          status: 'success',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.update).toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-final-defaults-result',
          toolName: 'final_answer',
          arguments: { summary_points: [] },
        }),
      }),
      true
    );
  });

  it('stores String(output) when tool_result output is non-serializable', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_result',
          callId: 'call-circular',
          toolName: 'search_docs',
          arguments: { q: 1 },
          output: circular,
          status: 'error',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-circular',
          output: expect.objectContaining({
            status: 'error',
            content: '[object Object]',
          }),
        }),
      }),
      1,
      true
    );
  });

  it('finalizes pending tool_call rows even when payloadJson is invalid JSON', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    messageManager.list.mockReturnValue([
      makeMessage(1, 'user'),
      {
        ...makeMessage(33, 'tool_call'),
        done: false,
        hidden: false,
        replyToMessageId: 1,
        payloadJson: '{broken-json',
      },
    ]);
    llmProvider.chat.mockRejectedValue(new Error('provider failed'));

    await pipeline.run('agent-1', 1);

    expect(messageManager.update).toHaveBeenCalledWith(
      33,
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          output: expect.objectContaining({
            status: 'error',
            content: 'Provider service unavailable. Please try again later.',
          }),
        }),
      }),
      true
    );
  });

  it('covers helper branches for execute options and limiter queue', async () => {
    const { pipeline, toolExecutor } = makeMocks();
    const signal = new AbortController().signal;

    const extractAbortSignal = (
      pipeline as unknown as { extractToolAbortSignal: (arg: unknown) => AbortSignal | undefined }
    ).extractToolAbortSignal.bind(pipeline);
    const extractToolCallId = (
      pipeline as unknown as { extractToolCallId: (arg: unknown) => string | undefined }
    ).extractToolCallId.bind(pipeline);
    const createLimiter = (
      pipeline as unknown as {
        createConcurrencyLimiter: (limit: number) => <T>(job: () => Promise<T>) => Promise<T>;
      }
    ).createConcurrencyLimiter.bind(pipeline);
    const bindToolExecutors = (
      pipeline as unknown as {
        bindToolExecutors: (
          tools: Array<{
            name: string;
            execute?: (args: Record<string, unknown>) => Promise<unknown>;
          }>
        ) => Array<{
          execute: (args: Record<string, unknown>, opts?: unknown) => Promise<unknown>;
        }>;
      }
    ).bindToolExecutors.bind(pipeline);

    expect(extractAbortSignal({ abortSignal: signal })).toBe(signal);
    expect(extractAbortSignal(signal)).toBe(signal);
    expect(extractToolCallId({ toolCallId: '  ' })).toBeUndefined();

    const limiter = createLimiter(1);
    const order: string[] = [];
    await Promise.all([
      limiter(async () => {
        order.push('first-start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('first-end');
      }),
      limiter(async () => {
        order.push('second');
      }),
    ]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);

    toolExecutor.executeBatch.mockResolvedValueOnce([]);
    const bound = bindToolExecutors([{ name: 'tool_without_result' }]);
    await expect(bound[0].execute({})).rejects.toThrow('returned no result');
  });
});
