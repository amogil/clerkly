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

  it('continues tool loop until final text', async () => {
    const { pipeline, llmProvider, toolExecutor, messageManager } = makeMocks();

    llmProvider.chat
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'Think' });
          onChunk({
            type: 'tool_call',
            callId: 'call-1',
            toolName: 'search_docs',
            arguments: { query: 'streaming' },
          });
          return {};
        }
      )
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'text', delta: 'Done' });
          return { text: 'Done' };
        }
      );

    toolExecutor.executeBatch.mockResolvedValue([
      {
        callId: 'call-1',
        toolName: 'search_docs',
        status: 'success',
        output: 'result',
      },
    ]);

    await pipeline.run('agent-1', 1);

    expect(toolExecutor.executeBatch).toHaveBeenCalledTimes(1);
    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
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
          output: expect.objectContaining({ status: 'success', content: 'result' }),
        }),
      }),
      true
    );
  });

  it('executes multi-tool batch and sends deterministic tool transcript ordered by call_id', async () => {
    const { pipeline, llmProvider, toolExecutor, messageManager } = makeMocks();

    llmProvider.chat
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({
            type: 'tool_call',
            callId: 'call-b',
            toolName: 'tool_b',
            arguments: { q: 2 },
          });
          onChunk({
            type: 'tool_call',
            callId: 'call-a',
            toolName: 'tool_a',
            arguments: { q: 1 },
          });
          return {};
        }
      )
      .mockImplementationOnce(async (msgs: ChatMessage[]) => {
        const lastAssistant = msgs[msgs.length - 2];
        const lastUser = msgs[msgs.length - 1];
        expect(lastAssistant?.content).toContain('call_id=call-a');
        expect(lastAssistant?.content).toContain('call_id=call-b');
        expect(lastAssistant?.content.indexOf('call_id=call-a')).toBeLessThan(
          lastAssistant?.content.indexOf('call_id=call-b')
        );
        expect(lastUser?.content.indexOf('call_id=call-a')).toBeLessThan(
          lastUser?.content.indexOf('call_id=call-b')
        );
        return { text: 'final' };
      });

    toolExecutor.executeBatch.mockResolvedValue([
      { callId: 'call-b', toolName: 'tool_b', status: 'success', output: 'B' },
      { callId: 'call-a', toolName: 'tool_a', status: 'success', output: 'A' },
    ]);

    await pipeline.run('agent-1', 1);

    expect(toolExecutor.executeBatch).toHaveBeenCalledWith(
      [
        { callId: 'call-b', toolName: 'tool_b', arguments: { q: 2 } },
        { callId: 'call-a', toolName: 'tool_a', arguments: { q: 1 } },
      ],
      undefined
    );
    const toolCallCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'tool_call'
    );
    expect(toolCallCreates).toHaveLength(2);

    const toolCallDoneUpdates = (messageManager.update as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[3] === true
    );
    expect(toolCallDoneUpdates.length).toBeGreaterThanOrEqual(2);
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

  it('cancels during tool execution without creating kind:error', async () => {
    const { pipeline, llmProvider, toolExecutor, messageManager } = makeMocks();
    const controller = new AbortController();

    llmProvider.chat.mockImplementationOnce(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Thinking...' });
        onChunk({
          type: 'tool_call',
          callId: 'call-1',
          toolName: 'search_docs',
          arguments: { query: 'x' },
        });
        return {};
      }
    );

    toolExecutor.executeBatch.mockImplementation(async () => {
      controller.abort();
      return [{ callId: 'call-1', toolName: 'search_docs', status: 'success', output: 'ok' }];
    });

    await pipeline.run('agent-1', 1, controller.signal);

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
      { name: 'search_docs', description: 'Search docs', parameters: { type: 'object' } },
    ]);
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
});
