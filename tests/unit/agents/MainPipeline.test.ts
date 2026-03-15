// Requirements: llm-integration.1, llm-integration.2, llm-integration.5

import { MainPipeline } from '../../../src/main/agents/MainPipeline';
import {
  FullHistoryStrategy,
  PromptBuilder as PromptBuilderClass,
} from '../../../src/main/agents/PromptBuilder';
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
    createWithOrder: jest
      .fn()
      .mockImplementation(
        (
          agentId: string,
          kind: string,
          payload: any,
          replyToMessageId: number | null,
          _order: unknown,
          done?: boolean
        ) => messageManager.create(agentId, kind, payload, replyToMessageId, done)
      ),
    update: jest.fn(),
    updateWithOrder: jest
      .fn()
      .mockImplementation(
        (messageId: number, agentId: string, payload: any, _order: unknown, done?: boolean) =>
          messageManager.update(messageId, agentId, payload, done)
      ),
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
  const agentTitleUpdater = {
    getCurrentTitle: jest.fn().mockReturnValue('New Agent'),
    rename: jest.fn(),
  };
  const pipeline = new MainPipeline(
    messageManager,
    settingsManager,
    promptBuilder,
    createProvider,
    toolExecutor,
    agentTitleUpdater
  );

  return {
    pipeline,
    messageManager,
    settingsManager,
    promptBuilder,
    llmProvider,
    toolExecutor,
    agentTitleUpdater,
    mockPublish,
  };
}

async function assertAiSdkModelMessages(messages: ChatMessage[]): Promise<void> {
  if (typeof (globalThis as { TransformStream?: unknown }).TransformStream === 'undefined') {
    const webStreams = await import('stream/web');
    (globalThis as { TransformStream?: unknown }).TransformStream = webStreams.TransformStream;
  }
  const { modelMessageSchema } = await import('ai');
  const parsed = (modelMessageSchema as { array: () => { safeParse: (v: unknown) => unknown } })
    .array()
    .safeParse(messages) as { success: boolean; error?: { issues?: Array<{ message: string }> } };
  expect(parsed.success).toBe(true);
}

function assertToolReplayLinked(messages: ChatMessage[]): void {
  const called = new Set<string>();
  const completed = new Set<string>();

  for (const message of messages as unknown as Array<Record<string, unknown>>) {
    const role = message['role'];
    const content = Array.isArray(message['content']) ? message['content'] : [];

    if (role === 'assistant') {
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as Record<string, unknown>)['type'] === 'tool-call'
        ) {
          const toolCallId = (part as Record<string, unknown>)['toolCallId'];
          if (typeof toolCallId === 'string') called.add(toolCallId);
        }
      }
    }

    if (role === 'tool') {
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as Record<string, unknown>)['type'] === 'tool-result'
        ) {
          const toolCallId = (part as Record<string, unknown>)['toolCallId'];
          if (typeof toolCallId === 'string') {
            expect(called.has(toolCallId)).toBe(true);
            completed.add(toolCallId);
          }
        }
      }
    }
  }

  for (const toolCallId of called) {
    expect(completed.has(toolCallId)).toBe(true);
  }
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

  it('sends AI SDK-valid linked replay history to provider.chat when terminal tool_call exists', async () => {
    const { pipeline, llmProvider, messageManager, promptBuilder } = makeMocks();
    const realPromptBuilder = new PromptBuilderClass('sys', [], new FullHistoryStrategy());

    const userMsg = makeMessage(1, 'user');
    userMsg.payloadJson = JSON.stringify({ data: { text: 'run code' } });
    const terminalToolCall = makeMessage(2, 'tool_call');
    terminalToolCall.payloadJson = JSON.stringify({
      data: {
        callId: 'call-main-pipeline',
        toolName: 'code_exec',
        arguments: { code: 'console.log(1)' },
        output: { status: 'success', stdout: '1' },
      },
    });
    messageManager.listForModelHistory = jest.fn().mockReturnValue([userMsg, terminalToolCall]);
    promptBuilder.buildMessages = jest
      .fn()
      .mockImplementation((history: Message[]) => realPromptBuilder.buildMessages(history));

    llmProvider.chat.mockImplementation(
      async (messages: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        await assertAiSdkModelMessages(messages);
        assertToolReplayLinked(messages);
        onChunk({ type: 'text', delta: 'ok' });
        return { text: 'ok' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
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
    expect(textEvents).toHaveLength(1);
    expect((textEvents[0] as MessageLlmTextUpdatedEvent).delta).toBe('Hello back');

    expect(messageManager.setUsage).toHaveBeenCalledWith(
      2,
      'agent-1',
      expect.objectContaining({
        canonical: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      })
    );
  });

  /* Preconditions: active stream receives multiple text chunks within one 100ms window
     Action: run MainPipeline with fake timers and advance time step-by-step
     Assertions: intermediate persisted updates are throttled to <=1 per 100ms and deltas are batched
     Requirements: llm-integration.1.6.4, llm-integration.2.3.1, llm-integration.2.5.1, llm-integration.14.4 */
  it('throttles intermediate llm updates and batches text deltas in 100ms window', async () => {
    jest.useFakeTimers();
    try {
      const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'text', delta: 'A' });
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
          onChunk({ type: 'text', delta: 'B' });
          onChunk({ type: 'text', delta: 'C' });
          await new Promise<void>((resolve) => setTimeout(resolve, 60));
          return { text: 'ABC' };
        }
      );

      const runPromise = pipeline.run('agent-1', 1);
      await jest.advanceTimersByTimeAsync(49);

      const inFlightUpdatesBeforeFlush = (messageManager.update as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[3] === false
      );
      expect(inFlightUpdatesBeforeFlush).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(51);
      await jest.runAllTimersAsync();
      await runPromise;

      const inFlightUpdates = (messageManager.update as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[3] === false
      );
      expect(inFlightUpdates).toHaveLength(1);
      expect((inFlightUpdates[0]?.[2] as { data?: { text?: string } }).data?.text).toBe('ABC');

      const textEvents = mockPublish.mock.calls
        .map((call: [unknown]) => call[0])
        .filter((e: unknown) => e instanceof MessageLlmTextUpdatedEvent) as
        | MessageLlmTextUpdatedEvent[]
        | [];
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0]?.delta).toBe('A');
      expect(textEvents[1]?.delta).toBe('BC');
    } finally {
      jest.useRealTimers();
    }
  });

  /* Preconditions: text delta is buffered (<100ms since previous flush) and tool_call arrives
     Action: run MainPipeline where tool_call boundary appears before timer-based flush
     Assertions: pending llm buffer is force-flushed before persisted tool_call(running) creation
     Requirements: llm-integration.1.6.4, llm-integration.2.3.1, llm-integration.11.1.2, llm-integration.11.1.5 */
  it('force-flushes pending llm buffer before creating running tool_call', async () => {
    jest.useFakeTimers();
    try {
      const { pipeline, llmProvider, messageManager } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'text', delta: 'A' });
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
          onChunk({ type: 'text', delta: 'B' });
          onChunk({
            type: 'tool_call',
            callId: 'call-force-flush',
            toolName: 'code_exec',
            arguments: { code: "console.log('x')" },
          });
          onChunk({
            type: 'tool_result',
            callId: 'call-force-flush',
            toolName: 'code_exec',
            arguments: { code: "console.log('x')" },
            output: { status: 'success', stdout: 'x\n', stderr: '' },
            status: 'success',
          });
          return { text: 'AB' };
        }
      );

      const runPromise = pipeline.run('agent-1', 1);
      await jest.runAllTimersAsync();
      await runPromise;

      const updateMock = messageManager.update as jest.Mock;
      const createMock = messageManager.create as jest.Mock;

      const forcedFlushUpdateIndex = updateMock.mock.calls.findIndex(
        (call: unknown[]) =>
          call[3] === false &&
          ((call[2] as { data?: { text?: string } })?.data?.text ?? '') === 'AB'
      );
      const runningToolCreateIndex = createMock.mock.calls.findIndex(
        (call: unknown[]) => call[1] === 'tool_call' && call[4] === false
      );

      expect(forcedFlushUpdateIndex).toBeGreaterThanOrEqual(0);
      expect(runningToolCreateIndex).toBeGreaterThanOrEqual(0);
      expect(
        updateMock.mock.invocationCallOrder[forcedFlushUpdateIndex] <
          createMock.mock.invocationCallOrder[runningToolCreateIndex]
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  /* Preconditions: reasoning chunk has glued bold markdown; display normalization must not affect persistence
     Action: run MainPipeline with reasoning and text chunks
     Assertions: persisted payload and reasoning event keep raw model text
     Requirements: agents.4.11.6, agents.4.11.7 */
  it('persists raw reasoning text without display-time markdown spacing normalization', async () => {
    const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'Soon!**Resolving next step**' });
        onChunk({ type: 'text', delta: 'Answer' });
        return { text: 'Answer' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning: { text: 'Soon!**Resolving next step**', excluded_from_replay: true },
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
          reasoning: { text: 'Soon!**Resolving next step**', excluded_from_replay: true },
          text: 'Answer',
        }),
      }),
      true
    );

    const reasoningEvent = mockPublish.mock.calls
      .map((call: [unknown]) => call[0])
      .find((event: unknown) => event instanceof MessageLlmReasoningUpdatedEvent) as
      | MessageLlmReasoningUpdatedEvent
      | undefined;
    expect(reasoningEvent).toBeDefined();
    expect(reasoningEvent?.delta).toBe('Soon!**Resolving next step**');
    expect(reasoningEvent?.accumulatedText).toBe('Soon!**Resolving next step**');
  });

  /* Preconditions: Stream contains markdown metadata comment with JSON payload split across chunks
     Action: Run MainPipeline with text deltas that include <!-- clerkly:title-meta: ... -->
     Assertions: Agent rename is triggered with normalized title and llm text remains unchanged
     Requirements: llm-integration.16.1, llm-integration.16.3, llm-integration.16.7, llm-integration.16.11 */
  it('extracts title from markdown comment and renames agent without mutating output text', async () => {
    const { pipeline, messageManager, llmProvider, agentTitleUpdater } = makeMocks();
    (messageManager.list as jest.Mock).mockReturnValue([
      makeMessage(1, 'user'),
      makeMessage(2, 'user'),
      makeMessage(3, 'user'),
      makeMessage(4, 'user'),
      makeMessage(5, 'user'),
      makeMessage(6, 'user'),
    ]);

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'text', delta: 'Answer start ' });
        onChunk({ type: 'text', delta: '<!-- clerkly:title-meta: {"title":"Sprint' });
        onChunk({ type: 'text', delta: ' retrospective plan","rename_need_score":90} --> end' });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).toHaveBeenCalledWith('agent-1', 'Sprint retrospective plan');
    const hasCommentInUpdatedText = (messageManager.update as jest.Mock).mock.calls.some(
      (call: unknown[]) => {
        const payload = call[2] as { data?: { text?: string } };
        return (
          payload.data?.text?.includes(
            '<!-- clerkly:title-meta: {"title":"Sprint retrospective plan","rename_need_score":90} -->'
          ) ?? false
        );
      }
    );
    expect(hasCommentInUpdatedText).toBe(true);
  });

  /* Preconditions: First meaningful user turn, default chat title, cooldown guard allows rename metadata request
     Action: Run MainPipeline and inspect provider chat messages
     Assertions: Runtime system prompt includes auto-title contract and current title context
     Requirements: llm-integration.16.1, llm-integration.16.2, llm-integration.16.10 */
  it('injects auto-title metadata contract into system messages when current turn is eligible', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    const user = makeMessage(1, 'user');
    user.payloadJson = JSON.stringify({ data: { text: 'Plan sprint roadmap' } });
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue([user]);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('New Agent');

    llmProvider.chat.mockResolvedValue({ text: 'Answer' });

    await pipeline.run('agent-1', 1);

    const sentMessages = llmProvider.chat.mock.calls[0]?.[0] as ChatMessage[];
    const systemPrompt = sentMessages
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n');

    expect(systemPrompt).toContain('Auto-title metadata contract:');
    expect(systemPrompt).toContain(
      '<!-- clerkly:title-meta: {"title":"<short title>","rename_need_score":NN} -->'
    );
    expect(systemPrompt).toContain('Current chat title: "New Agent".');
    expect(systemPrompt).toContain('target 3-12 words');
    expect(systemPrompt).toContain('max 200 characters');
  });

  /* Preconditions: Last successful rename happened fewer than 5 user turns ago
     Action: Run MainPipeline and inspect provider chat messages
     Assertions: Runtime auto-title contract is omitted while cooldown is active
     Requirements: llm-integration.16.10 */
  it('does not inject auto-title metadata contract while cooldown is active', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();

    const user1 = makeMessage(1, 'user');
    user1.payloadJson = JSON.stringify({ data: { text: 'Plan sprint backlog' } });
    const llmPast = makeMessage(2, 'llm');
    llmPast.payloadJson = JSON.stringify({
      data: {
        text: 'Done <!-- clerkly:title-meta: {"title":"Sprint backlog planning","rename_need_score":90} -->',
        auto_title_applied: true,
        auto_title_applied_title: 'Sprint backlog planning',
      },
    });
    const user2 = makeMessage(3, 'user');
    user2.payloadJson = JSON.stringify({ data: { text: 'follow up one' } });
    const user3 = makeMessage(4, 'user');
    user3.payloadJson = JSON.stringify({ data: { text: 'follow up two' } });
    const user4 = makeMessage(5, 'user');
    user4.payloadJson = JSON.stringify({ data: { text: 'follow up three' } });
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue([
      user1,
      llmPast,
      user2,
      user3,
      user4,
    ]);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('Sprint backlog planning');

    llmProvider.chat.mockResolvedValue({ text: 'Answer' });

    await pipeline.run('agent-1', 5);

    const sentMessages = llmProvider.chat.mock.calls[0]?.[0] as ChatMessage[];
    const systemPrompt = sentMessages
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n');

    expect(systemPrompt).not.toContain('Auto-title metadata contract:');
    expect(systemPrompt).not.toContain(
      '<!-- clerkly:title-meta: {"title":"<short title>","rename_need_score":NN} -->'
    );
  });

  /* Preconditions: Stream has unterminated title metadata comment and payload reaches 260 chars
     Action: Run MainPipeline and finalize stream
     Assertions: Rename is skipped and response flow completes
     Requirements: llm-integration.16.4, llm-integration.16.5, llm-integration.16.12 */
  it('skips rename when title metadata comment exceeds 260 chars without closing marker', async () => {
    const { pipeline, llmProvider, agentTitleUpdater } = makeMocks();
    const longPayload = 'x'.repeat(260);

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta: `<!-- clerkly:title-meta: {"title":"${longPayload}`,
        });
        onChunk({ type: 'text', delta: ' regular response text' });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  /* Preconditions: Valid title metadata exists but rename callback throws error
     Action: Run MainPipeline and execute auto-title update
     Assertions: Pipeline still completes and does not create kind:error due to rename failure
     Requirements: llm-integration.16.12 */
  it('does not interrupt chat flow when auto-title rename throws', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    (messageManager.list as jest.Mock).mockReturnValue([
      makeMessage(1, 'user'),
      makeMessage(2, 'user'),
      makeMessage(3, 'user'),
      makeMessage(4, 'user'),
      makeMessage(5, 'user'),
      makeMessage(6, 'user'),
    ]);
    agentTitleUpdater.rename.mockImplementation(() => {
      throw new Error('rename failed');
    });

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Release board","rename_need_score":90} --> body',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).toHaveBeenCalledTimes(1);
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.anything(),
      1,
      true
    );
  });

  /* Preconditions: First turn emits title comment but rename throws, so no applied marker is persisted
     Action: Run next user turn immediately with another valid title candidate
     Assertions: Cooldown is not activated by failed rename and second turn may rename immediately
     Requirements: llm-integration.16.10, llm-integration.16.12 */
  it('does not apply cooldown after failed rename with persisted comment only', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();

    const user1 = makeMessage(1, 'user');
    user1.payloadJson = JSON.stringify({ data: { text: 'Plan sprint backlog' } });
    const llmFailed = makeMessage(10, 'llm');
    llmFailed.payloadJson = JSON.stringify({
      data: {
        text: 'Done <!-- clerkly:title-meta: {"title":"Sprint backlog planning","rename_need_score":90} -->',
      },
    });
    const user2 = makeMessage(11, 'user');
    user2.payloadJson = JSON.stringify({ data: { text: 'Plan roadmap milestones' } });

    (messageManager.list as jest.Mock).mockImplementation(() => [user1, llmFailed, user2]);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue([user1, llmFailed, user2]);

    agentTitleUpdater.rename
      .mockImplementationOnce(() => {
        throw new Error('rename failed');
      })
      .mockImplementationOnce(() => undefined);

    llmProvider.chat
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({
            type: 'text',
            delta:
              '<!-- clerkly:title-meta: {"title":"Sprint backlog planning","rename_need_score":90} --> body',
          });
          return { text: '' };
        }
      )
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({
            type: 'text',
            delta:
              '<!-- clerkly:title-meta: {"title":"Product roadmap plan","rename_need_score":90} --> body',
          });
          return { text: '' };
        }
      );

    await pipeline.run('agent-1', 1);
    await pipeline.run('agent-1', 11);

    expect(agentTitleUpdater.rename).toHaveBeenNthCalledWith(
      1,
      'agent-1',
      'Sprint backlog planning'
    );
    expect(agentTitleUpdater.rename).toHaveBeenNthCalledWith(2, 'agent-1', 'Product roadmap plan');
  });

  /* Preconditions: Candidate title exists, current title is default, triggering user message is non-meaningful
     Action: Run MainPipeline with auto-title metadata
     Assertions: First rename is skipped
     Requirements: llm-integration.16.10 */
  it('skips first auto-rename when triggering user message is non-meaningful', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    const meaninglessUser = makeMessage(1, 'user');
    meaninglessUser.payloadJson = JSON.stringify({ data: { text: '...' } });
    (messageManager.list as jest.Mock).mockReturnValue([meaninglessUser]);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue([meaninglessUser]);

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Useful title","rename_need_score":90} --> answer',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  /* Preconditions: Current title is default, history already has meaningful user message, triggering message is non-meaningful
     Action: Run MainPipeline and inspect provider chat messages
     Assertions: Auto-title metadata contract is still injected because history is meaningful
     Requirements: llm-integration.16.10 */
  it('injects auto-title metadata contract when history has meaningful message and triggering message is non-meaningful', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    const meaningfulUser = makeMessage(1, 'user');
    meaningfulUser.payloadJson = JSON.stringify({ data: { text: 'Plan sprint roadmap' } });
    const nonMeaningfulUser = makeMessage(2, 'user');
    nonMeaningfulUser.payloadJson = JSON.stringify({ data: { text: '1' } });
    const snapshot = [meaningfulUser, nonMeaningfulUser];
    (messageManager.list as jest.Mock).mockReturnValue(snapshot);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue(snapshot);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('New Agent');

    llmProvider.chat.mockResolvedValue({ text: 'Answer' });

    await pipeline.run('agent-1', 2);

    const sentMessages = llmProvider.chat.mock.calls[0]?.[0] as ChatMessage[];
    const systemPrompt = sentMessages
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n');

    expect(systemPrompt).toContain('Auto-title metadata contract:');
    expect(systemPrompt).toContain(
      '<!-- clerkly:title-meta: {"title":"<short title>","rename_need_score":NN} -->'
    );
  });

  /* Preconditions: Current title is default, history already has meaningful user message, triggering message is non-meaningful
     Action: Run MainPipeline with valid auto-title metadata
     Assertions: Rename is applied because meaningful-history guard passes
     Requirements: llm-integration.16.10 */
  it('applies first auto-rename when history has meaningful message and triggering message is non-meaningful', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    const meaningfulUser = makeMessage(1, 'user');
    meaningfulUser.payloadJson = JSON.stringify({ data: { text: 'Plan sprint roadmap' } });
    const nonMeaningfulUser = makeMessage(2, 'user');
    nonMeaningfulUser.payloadJson = JSON.stringify({ data: { text: '1' } });
    const snapshot = [meaningfulUser, nonMeaningfulUser];
    (messageManager.list as jest.Mock).mockReturnValue(snapshot);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue(snapshot);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('New Agent');

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Sprint planning board","rename_need_score":90} --> answer',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 2);

    expect(agentTitleUpdater.rename).toHaveBeenCalledWith('agent-1', 'Sprint planning board');
  });

  /* Preconditions: Persisted history already contains a recent successful rename in fewer than 5 user turns
     Action: Run MainPipeline in a fresh pipeline instance and process new title candidate
     Assertions: Cooldown guard skips rename based on persisted history replay
     Requirements: llm-integration.16.10 */
  it('enforces cooldown from persisted history replay without in-memory state', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();

    const user1 = makeMessage(1, 'user');
    user1.payloadJson = JSON.stringify({ data: { text: 'Plan sprint backlog' } });
    const llmPast = makeMessage(10, 'llm');
    llmPast.payloadJson = JSON.stringify({
      data: {
        text: 'Done <!-- clerkly:title-meta: {"title":"Sprint backlog planning","rename_need_score":90} -->',
        auto_title_applied: true,
        auto_title_applied_title: 'Sprint backlog planning',
      },
    });
    const user2 = makeMessage(11, 'user');
    user2.payloadJson = JSON.stringify({ data: { text: 'follow up one' } });
    const user3 = makeMessage(12, 'user');
    user3.payloadJson = JSON.stringify({ data: { text: 'follow up two' } });
    const user4 = makeMessage(13, 'user');
    user4.payloadJson = JSON.stringify({ data: { text: 'follow up three' } });
    const snapshot = [user1, llmPast, user2, user3, user4];
    (messageManager.list as jest.Mock).mockReturnValue(snapshot);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue(snapshot);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('Sprint backlog planning');

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Roadmap planning board","rename_need_score":90} --> body',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 13);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  /* Preconditions: Agent title updater returns empty current title
     Action: Run MainPipeline with valid auto-title metadata
     Assertions: Rename is skipped because guard cannot compare against current title
     Requirements: llm-integration.16.12 */
  it('skips auto-rename when current title is unavailable', async () => {
    const { pipeline, llmProvider, agentTitleUpdater } = makeMocks();
    agentTitleUpdater.getCurrentTitle.mockReturnValue('');

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Stable title","rename_need_score":90} --> body',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  /* Preconditions: Triggering user message has invalid JSON payload while current title is default
     Action: Run MainPipeline with valid auto-title metadata
     Assertions: First rename is skipped because meaningful-text check fails safely on parse error
     Requirements: llm-integration.16.10, llm-integration.16.12 */
  it('skips first auto-rename when triggering user payload is invalid JSON', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();
    const invalidUser = makeMessage(1, 'user');
    invalidUser.payloadJson = '{ invalid';
    (messageManager.list as jest.Mock).mockReturnValue([invalidUser]);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue([invalidUser]);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('New Agent');

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Useful title","rename_need_score":90} --> body',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  /* Preconditions: Persisted history snapshot does not change between runs
     Action: Run MainPipeline twice for the same agent with identical message list
     Assertions: Cooldown decision remains stable and rename is not applied in both runs
     Requirements: llm-integration.16.10 */
  it('keeps cooldown decision stable across repeated runs with identical history snapshot', async () => {
    const { pipeline, llmProvider, messageManager, agentTitleUpdater } = makeMocks();

    const user1 = makeMessage(1, 'user');
    user1.payloadJson = JSON.stringify({ data: { text: 'Plan sprint backlog' } });
    const llmPast = makeMessage(10, 'llm');
    llmPast.payloadJson = JSON.stringify({
      data: {
        text: 'Done <!-- clerkly:title-meta: {"title":"Sprint backlog planning","rename_need_score":90} -->',
        auto_title_applied: true,
        auto_title_applied_title: 'Sprint backlog planning',
      },
    });
    const user2 = makeMessage(11, 'user');
    user2.payloadJson = JSON.stringify({ data: { text: 'follow up one' } });
    const user3 = makeMessage(12, 'user');
    user3.payloadJson = JSON.stringify({ data: { text: 'follow up two' } });
    const user4 = makeMessage(13, 'user');
    user4.payloadJson = JSON.stringify({ data: { text: 'follow up three' } });
    const snapshot = [user1, llmPast, user2, user3, user4];
    (messageManager.list as jest.Mock).mockReturnValue(snapshot);
    (messageManager.listForModelHistory as jest.Mock).mockReturnValue(snapshot);
    agentTitleUpdater.getCurrentTitle.mockReturnValue('Sprint backlog planning');

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'text',
          delta:
            '<!-- clerkly:title-meta: {"title":"Roadmap planning board","rename_need_score":90} --> body',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 13);
    await pipeline.run('agent-1', 13);

    expect(agentTitleUpdater.rename).not.toHaveBeenCalled();
  });

  it('persists buffered tool_call after llm finalization in same turn', async () => {
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
          output: expect.objectContaining({ status: 'running' }),
        }),
      }),
      1,
      false
    );
    expect(messageManager.update).toHaveBeenCalledWith(
      100,
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

    const llmDoneUpdate = (messageManager.update as jest.Mock).mock.calls.find(
      (call: unknown[]) =>
        call[3] === true &&
        typeof call[2] === 'object' &&
        call[2] !== null &&
        'data' in (call[2] as Record<string, unknown>)
    );
    const toolCallCreate = (messageManager.create as jest.Mock).mock.calls.find(
      (call: unknown[]) => call[1] === 'tool_call'
    );
    expect(llmDoneUpdate).toBeDefined();
    expect(toolCallCreate).toBeDefined();
    expect((llmDoneUpdate as unknown[]).length).toBeGreaterThan(0);
    expect((toolCallCreate as unknown[]).length).toBeGreaterThan(0);
    expect(
      (messageManager.update as jest.Mock).mock.invocationCallOrder[
        (messageManager.update as jest.Mock).mock.calls.indexOf(llmDoneUpdate as unknown[])
      ]
    ).toBeLessThan(
      (messageManager.create as jest.Mock).mock.invocationCallOrder[
        (messageManager.create as jest.Mock).mock.calls.indexOf(toolCallCreate as unknown[])
      ]
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
            summary_points: ['Step A done', 'Step B done'],
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
          arguments: expect.objectContaining({ summary_points: ['Done'] }),
        }),
      }),
      1,
      true
    );
  });

  it('creates kind:error when final_answer arguments are missing required summary_points', async () => {
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
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            type: 'provider',
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'final_answer',
        }),
      }),
      1,
      expect.anything()
    );
  });

  /* Preconditions: provider returns final_answer with whitespace-only summary_points item
     Action: run pipeline once
     Assertions: invalid tool arguments are surfaced as provider error and final_answer is not persisted
     Requirements: llm-integration.9.5.3.1, llm-integration.9.5.4, llm-integration.12.3 */
  it('creates kind:error when final_answer contains blank summary point', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-blank',
          toolName: 'final_answer',
          arguments: { summary_points: ['   '] },
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            type: 'provider',
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'final_answer',
        }),
      }),
      1,
      expect.anything()
    );
  });

  /* Preconditions: first attempt returns invalid final_answer, second attempt returns valid final_answer
     Action: run pipeline with retry/repair
     Assertions: persisted final_answer is created once with attemptId=2 in order metadata
     Requirements: llm-integration.11.3.1, llm-integration.11.1.5 */
  it('increments attemptId in order metadata after retry before persisting final_answer', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();

    llmProvider.chat
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({
            type: 'tool_call',
            callId: 'final-invalid',
            toolName: 'final_answer',
            arguments: {},
          });
          return { text: '' };
        }
      )
      .mockImplementationOnce(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({
            type: 'tool_call',
            callId: 'final-valid',
            toolName: 'final_answer',
            arguments: { summary_points: ['ok after retry'] },
          });
          return { text: '' };
        }
      );

    await pipeline.run('agent-1', 1);

    const finalCalls = (messageManager.createWithOrder as jest.Mock).mock.calls.filter(
      (call: unknown[]) =>
        call[1] === 'tool_call' &&
        Boolean((call[2] as { data?: { toolName?: string } }).data?.toolName === 'final_answer')
    );
    expect(finalCalls).toHaveLength(1);
    expect(finalCalls[0]?.[4]).toEqual(
      expect.objectContaining({
        runId: expect.any(String),
        attemptId: 2,
        sequence: expect.any(Number),
      })
    );
  });

  it('retries and fails when final_answer is combined with another tool call in same turn', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    let attempt = 0;

    llmProvider.chat.mockImplementation(async (msgs: ChatMessage[], _opts, onChunk) => {
      attempt += 1;
      if (attempt > 1) {
        const retryFeedback = msgs.find(
          (msg) =>
            msg.role === 'system' &&
            typeof msg.content === 'string' &&
            msg.content.includes('Tool call validation failed:')
        ) as { content?: string } | undefined;
        expect(retryFeedback?.content).toContain('more than one tool_call');
      }
      onChunk({
        type: 'tool_call',
        callId: `call-final-${attempt}`,
        toolName: 'final_answer',
        arguments: { summary_points: ['done'] },
      });
      onChunk({
        type: 'tool_call',
        callId: `call-code-${attempt}`,
        toolName: 'code_exec',
        arguments: { code: 'console.log(1)' },
      });
      return { text: '' };
    });

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'final_answer',
        }),
      }),
      1,
      expect.anything()
    );
  });

  it('does not persist tool_call for invalid code_exec arguments and emits kind:error after retries', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-code-invalid',
          toolName: 'code_exec',
          arguments: {},
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'code_exec',
        }),
      }),
      1,
      expect.anything()
    );
    expect(messageManager.update).not.toHaveBeenCalledWith(
      expect.any(Number),
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'code_exec',
        }),
      }),
      expect.any(Boolean)
    );
  });

  it('passes validation feedback to provider on retry after invalid tool arguments', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    let attempt = 0;

    llmProvider.chat.mockImplementation(async (msgs: ChatMessage[], _opts, onChunk) => {
      attempt += 1;
      if (attempt < 3) {
        const hasRetryFeedback = msgs.some(
          (msg) =>
            msg.role === 'system' &&
            typeof msg.content === 'string' &&
            msg.content.includes('Tool call validation failed:')
        );
        if (attempt === 1) {
          expect(hasRetryFeedback).toBe(false);
        } else {
          expect(hasRetryFeedback).toBe(true);
        }
      }
      onChunk({
        type: 'tool_call',
        callId: `retry-invalid-${attempt}`,
        toolName: 'code_exec',
        arguments: {},
      });
      return { text: '' };
    });

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
  });

  it('accepts plain text on retry after initial empty turn without completion marker', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    let attempt = 0;

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, _onChunk: (c: ChatChunk) => void) => {
        attempt += 1;
        if (attempt === 1) {
          return { text: '' };
        }
        return { text: 'Recovered plain text response' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(2);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'llm',
      expect.objectContaining({
        data: expect.objectContaining({
          text: 'Recovered plain text response',
        }),
      }),
      1,
      true
    );
    expect(messageManager.create).not.toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('hides last partial llm message when final_answer retry limit is exhausted', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();
    let attempt = 0;

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        attempt += 1;
        onChunk({ type: 'text', delta: 'Partial content' });
        onChunk({
          type: 'tool_call',
          callId: `call-final-${attempt}`,
          toolName: 'final_answer',
          arguments: {},
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.setHidden).toHaveBeenCalledTimes(2);
    expect(messageManager.setHidden).toHaveBeenNthCalledWith(2, 2, 'agent-1');
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
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

  it('rejects multiple tool calls in one response and finishes with kind:error', async () => {
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
    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
  });

  it.each(['error', 'timeout', 'cancelled'] as const)(
    'persists terminal tool_call and continues flow when tool_result arrives with %s status',
    async (terminalStatus) => {
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
            status: terminalStatus,
          });
          return { text: 'final after stub' };
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'tool_call',
        expect.objectContaining({
          data: expect.objectContaining({
            callId: 'call-stub',
            toolName: 'unknown_tool',
            output: expect.objectContaining({
              status: 'running',
            }),
          }),
        }),
        1,
        false
      );
      expect(messageManager.update).toHaveBeenCalledWith(
        100,
        'agent-1',
        expect.objectContaining({
          data: expect.objectContaining({
            callId: 'call-stub',
            output: expect.objectContaining({ status: terminalStatus }),
          }),
        }),
        true
      );
      expect(messageManager.create).not.toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.anything(),
        expect.anything(),
        true
      );
      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.objectContaining({
          data: expect.objectContaining({
            text: 'final after stub',
          }),
        }),
        1,
        true
      );
    }
  );

  /* Preconditions: provider emits pre-tool reasoning, one valid tool_call, then post-tool text
     Action: run pipeline for one attempt
     Assertions: created llm/tool_call/llm messages carry deterministic order metadata with monotonic sequence
     Requirements: llm-integration.11.1.5 */
  it('adds run-attempt sequence order metadata to persisted pre-tool, tool_call, and post-tool messages', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'pre ' });
        onChunk({
          type: 'tool_call',
          callId: 'call-ordered',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
        });
        onChunk({ type: 'text', delta: 'post text' });
        onChunk({
          type: 'tool_result',
          callId: 'call-ordered',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
          output: { status: 'success', stdout: 'ok\n', stderr: '' },
          status: 'success',
        });
        return { text: 'post text' };
      }
    );

    await pipeline.run('agent-1', 1);

    const creates = (messageManager.createWithOrder as jest.Mock).mock.calls;
    const llmCreates = creates.filter((call) => call[1] === 'llm');
    const toolCreates = creates.filter((call) => call[1] === 'tool_call');

    expect(llmCreates).toHaveLength(2);
    expect(toolCreates).toHaveLength(1);

    const preOrder = llmCreates[0]?.[4] as { runId: string; attemptId: number; sequence: number };
    const toolOrder = toolCreates[0]?.[4] as { runId: string; attemptId: number; sequence: number };
    const postOrder = llmCreates[1]?.[4] as {
      runId: string;
      attemptId: number;
      sequence: number;
    };

    expect(preOrder).toEqual(
      expect.objectContaining({ runId: expect.any(String), attemptId: 1, sequence: 1 })
    );
    expect(toolOrder).toEqual(
      expect.objectContaining({ runId: preOrder.runId, attemptId: 1, sequence: 2 })
    );
    expect(postOrder).toEqual(
      expect.objectContaining({ runId: preOrder.runId, attemptId: 1, sequence: 3 })
    );
  });

  /* Preconditions: provider emits reasoning before valid tool_call and then post-tool text
     Action: run pipeline for one attempt
     Assertions: pre-tool llm segment is finalized before running tool_call is persisted
     Requirements: llm-integration.11.1.2 */
  it('finalizes pre-tool llm segment before creating running tool_call', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'pre reasoning' });
        onChunk({
          type: 'tool_call',
          callId: 'call-pre-finalize',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
        });
        onChunk({ type: 'text', delta: 'post text' });
        onChunk({
          type: 'tool_result',
          callId: 'call-pre-finalize',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
          output: { status: 'success', stdout: 'ok\n', stderr: '' },
          status: 'success',
        });
        return { text: 'post text' };
      }
    );

    await pipeline.run('agent-1', 1);

    const updateMock = messageManager.update as jest.Mock;
    const createMock = messageManager.create as jest.Mock;

    const finalizedPreToolUpdateIndex = updateMock.mock.calls.findIndex(
      (call) =>
        call[3] === true &&
        typeof call[2]?.data?.reasoning?.text === 'string' &&
        call[2].data.reasoning.text.includes('pre reasoning')
    );
    expect(finalizedPreToolUpdateIndex).toBeGreaterThanOrEqual(0);

    const runningToolCreateIndex = createMock.mock.calls.findIndex(
      (call) =>
        call[1] === 'tool_call' &&
        call[2]?.data?.callId === 'call-pre-finalize' &&
        call[4] === false
    );
    expect(runningToolCreateIndex).toBeGreaterThanOrEqual(0);

    const finalizedPreToolOrder =
      updateMock.mock.invocationCallOrder[finalizedPreToolUpdateIndex] ?? -1;
    const runningToolCreateOrder =
      createMock.mock.invocationCallOrder[runningToolCreateIndex] ?? -1;

    expect(finalizedPreToolOrder).toBeGreaterThan(0);
    expect(runningToolCreateOrder).toBeGreaterThan(0);
    expect(finalizedPreToolOrder).toBeLessThan(runningToolCreateOrder);
  });

  /* Preconditions: provider emits tool_call in the middle of reasoning stream
     Action: run pipeline for one attempt
     Assertions: running tool_call is persisted only after reasoning stream tail is appended
     Requirements: llm-integration.11.1.2 */
  it('buffers tool_call until reasoning stream tail is processed', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({ type: 'reasoning', delta: 'pre ' });
        onChunk({
          type: 'tool_call',
          callId: 'call-buffered-reasoning',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
        });
        onChunk({ type: 'reasoning', delta: 'tail' });
        onChunk({ type: 'text', delta: 'post text' });
        onChunk({
          type: 'tool_result',
          callId: 'call-buffered-reasoning',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
          output: { status: 'success', stdout: 'ok\n', stderr: '' },
          status: 'success',
        });
        return { text: 'post text' };
      }
    );

    await pipeline.run('agent-1', 1);

    const createMock = messageManager.create as jest.Mock;
    const updateMock = messageManager.update as jest.Mock;

    const tailReasoningCreateIndex = createMock.mock.calls.findIndex(
      (call) =>
        call[1] === 'llm' &&
        call[4] === false &&
        typeof call[2]?.data?.reasoning?.text === 'string' &&
        call[2].data.reasoning.text.includes('tail')
    );
    const tailReasoningUpdateIndex = updateMock.mock.calls.findIndex(
      (call) =>
        call[3] === false &&
        typeof call[2]?.data?.reasoning?.text === 'string' &&
        call[2].data.reasoning.text.includes('tail')
    );
    expect(Math.max(tailReasoningCreateIndex, tailReasoningUpdateIndex)).toBeGreaterThanOrEqual(0);

    const runningToolCreateIndex = createMock.mock.calls.findIndex(
      (call) =>
        call[1] === 'tool_call' &&
        call[2]?.data?.callId === 'call-buffered-reasoning' &&
        call[4] === false
    );
    expect(runningToolCreateIndex).toBeGreaterThanOrEqual(0);

    const tailReasoningOrder =
      tailReasoningCreateIndex >= 0
        ? (createMock.mock.invocationCallOrder[tailReasoningCreateIndex] ?? -1)
        : (updateMock.mock.invocationCallOrder[tailReasoningUpdateIndex] ?? -1);
    const runningToolCreateOrder =
      createMock.mock.invocationCallOrder[runningToolCreateIndex] ?? -1;

    expect(tailReasoningOrder).toBeGreaterThan(0);
    expect(runningToolCreateOrder).toBeGreaterThan(0);
    expect(tailReasoningOrder).toBeLessThan(runningToolCreateOrder);
  });

  /* Preconditions: provider emits tool_call, then delays tool_result, and does not emit post-tool text
     Action: run pipeline for one attempt
     Assertions: running tool_call is persisted before terminal update even without post-tool llm segment
     Requirements: llm-integration.11.1.2, llm-integration.11.1.3.1, code_exec.4.6 */
  it('persists running tool_call before terminal update when model step has no post-tool text', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-no-post-text',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        onChunk({
          type: 'tool_result',
          callId: 'call-no-post-text',
          toolName: 'code_exec',
          arguments: { code: "console.log('ok')" },
          output: { status: 'success', stdout: 'ok\n', stderr: '' },
          status: 'success',
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    const createMock = messageManager.create as jest.Mock;
    const updateMock = messageManager.update as jest.Mock;

    const runningCreateIndex = createMock.mock.calls.findIndex(
      (call) =>
        call[1] === 'tool_call' &&
        call[2]?.data?.callId === 'call-no-post-text' &&
        call[2]?.data?.output?.status === 'running' &&
        call[4] === false
    );
    expect(runningCreateIndex).toBeGreaterThanOrEqual(0);

    const terminalUpdateIndex = updateMock.mock.calls.findIndex(
      (call) =>
        call[2]?.data?.callId === 'call-no-post-text' &&
        call[2]?.data?.output?.status === 'success' &&
        call[3] === true
    );
    expect(terminalUpdateIndex).toBeGreaterThanOrEqual(0);

    const runningCreateOrder = createMock.mock.invocationCallOrder[runningCreateIndex] ?? -1;
    const terminalUpdateOrder = updateMock.mock.invocationCallOrder[terminalUpdateIndex] ?? -1;
    expect(runningCreateOrder).toBeGreaterThan(0);
    expect(terminalUpdateOrder).toBeGreaterThan(0);
    expect(runningCreateOrder).toBeLessThan(terminalUpdateOrder);
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

  it('persists pending tool_call and finalizes it on provider failure before completion', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-fail',
          toolName: 'search_docs',
          arguments: { query: 'x' },
        });
        throw new Error('Connection dropped');
      }
    );

    await pipeline.run('agent-1', 1);

    const toolCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'tool_call'
    );
    expect(toolCreates).toHaveLength(1);
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(1);
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

    expect(messageManager.hideAndMarkIncomplete).not.toHaveBeenCalled();
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
    const toolCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'tool_call'
    );
    expect(toolCreates).toHaveLength(1);
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

  /* Preconditions: provider returns single valid final_answer tool_call
     Action: run pipeline
     Assertions: persisted final_answer includes order metadata
     Requirements: llm-integration.11.1.5 */
  it('persists final_answer with order metadata', async () => {
    const { pipeline, messageManager, llmProvider } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'final-ordered',
          toolName: 'final_answer',
          arguments: { summary_points: ['done'] },
        });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    const finalCall = (messageManager.createWithOrder as jest.Mock).mock.calls.find(
      (call: unknown[]) =>
        call[1] === 'tool_call' &&
        Boolean((call[2] as { data?: { toolName?: string } }).data?.toolName === 'final_answer')
    );
    expect(finalCall).toBeDefined();
    expect(finalCall?.[4]).toEqual(
      expect.objectContaining({
        runId: expect.any(String),
        attemptId: 1,
        sequence: expect.any(Number),
      })
    );
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

  it('treats duplicate tool_call chunks as invalid multi-tool response and retries', async () => {
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

    expect(llmProvider.chat).toHaveBeenCalledTimes(3);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
      true
    );
  });

  it('allows one tool_call per step across multi-step provider stream', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-step-1',
          toolName: 'search_docs',
          arguments: { q: 'part-1' },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-step-1',
          toolName: 'search_docs',
          arguments: { q: 'part-1' },
          output: { status: 'ok-1' },
          status: 'success',
        });
        onChunk({ type: 'text', delta: 'after first tool ' });
        onChunk({
          type: 'tool_call',
          callId: 'call-step-2',
          toolName: 'search_docs',
          arguments: { q: 'part-2' },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-step-2',
          toolName: 'search_docs',
          arguments: { q: 'part-2' },
          output: { status: 'ok-2' },
          status: 'success',
        });
        return { text: 'done' };
      }
    );

    await pipeline.run('agent-1', 1);

    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
    const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'error'
    );
    expect(errorCreates).toHaveLength(0);
  });

  it('persists final_answer tool_result using finalized buffered row', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        onChunk({
          type: 'tool_result',
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
          output: { ignored: true },
          status: 'success',
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
          callId: 'call-final',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        }),
      }),
      1,
      true
    );
    const finalToolCall = (messageManager.create as jest.Mock).mock.calls.find(
      (call: unknown[]) =>
        call[1] === 'tool_call' &&
        typeof call[2] === 'object' &&
        call[2] !== null &&
        (call[2] as { data?: { toolName?: string } }).data?.toolName === 'final_answer'
    );
    expect(finalToolCall).toBeDefined();
    expect((finalToolCall as unknown[])[2]).toEqual(
      expect.objectContaining({
        data: expect.not.objectContaining({
          output: expect.anything(),
        }),
      })
    );
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains raw JSON mirroring summary_points
     Action: Run pipeline for one user turn
     Assertions: final_answer tool_call is persisted, but duplicate kind:llm text bubble is not persisted
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('does not persist duplicate llm text when output.text mirrors final_answer payload JSON', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-json-dup',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return { text: '{"summary_points":["Done"]}' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(0);
    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'tool_call',
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        }),
      }),
      1,
      true
    );
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains JSON with different summary_points
     Action: Run pipeline for one user turn
     Assertions: JSON text is persisted as kind:llm because it does not mirror current final_answer payload
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when output.text JSON does not mirror final_answer payload', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-json-non-mirror',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return { text: '{"summary_points":["Different payload"]}' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
    expect(llmCreates[0]?.[2]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          text: '{"summary_points":["Different payload"]}',
        }),
      })
    );
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains fenced JSON mirroring summary_points
     Action: Run pipeline for one user turn
     Assertions: Duplicate technical JSON text is suppressed and kind:llm is not persisted
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('does not persist duplicate llm text when output.text fenced JSON mirrors final_answer payload', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-json-fenced',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return { text: '```json\n{"summary_points":["Done"]}\n```' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(0);
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains nested data.summary_points mirroring payload
     Action: Run pipeline for one user turn
     Assertions: Duplicate technical JSON text is suppressed and kind:llm is not persisted
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('does not persist duplicate llm text when output.text nested JSON mirrors final_answer payload', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-json-nested',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return { text: '{"data":{"summary_points":["Done"]}}' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(0);
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains tool envelope with matching final_answer callId
     Action: Run pipeline for one user turn
     Assertions: Envelope mirror text is treated as duplicate technical payload and suppressed
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('does not persist duplicate llm text when output.text mirrors final_answer envelope with matching callId', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-json-envelope',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return {
          text: '{"toolName":"final_answer","callId":"call-final-json-envelope","arguments":{"summary_points":["Other"]}}',
        };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(0);
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains final_answer envelope with different callId
     Action: Run pipeline for one user turn
     Assertions: Non-mirror envelope text is preserved as kind:llm
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when output.text final_answer envelope has different callId', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-envelope-current',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return {
          text: '{"toolName":"final_answer","callId":"call-final-envelope-other","arguments":{"summary_points":["Done"]}}',
        };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains envelope with matching callId but non-final toolName
     Action: Run pipeline for one user turn
     Assertions: Non-final-answer envelope text is preserved as kind:llm
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when output.text envelope has matching callId but non-final toolName', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-envelope-same-id',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return {
          text: '{"toolName":"code_exec","callId":"call-final-envelope-same-id","arguments":{"summary_points":["Done"]}}',
        };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
  });

  /* Preconditions: Provider returns valid final_answer tool_call and output.text contains non-JSON textual payload
     Action: Run pipeline for one user turn
     Assertions: Non-JSON text is preserved as kind:llm
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when output.text is non-JSON payload-like text', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-non-json',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        return { text: 'summary_points: ["Done"]' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
  });

  /* Preconditions: Provider returns no tool_call and output.text contains JSON with summary_points
     Action: Run pipeline for one user turn
     Assertions: Text is preserved because suppression is disabled without any tool_call
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when output.text looks like payload but turn has no tool_call', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockResolvedValue({ text: '{"summary_points":["Done"]}' });

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
  });

  /* Preconditions: Provider streams final_answer tool_call and then streamed JSON chunks mirroring final payload
     Action: Run pipeline for one user turn
     Assertions: Streamed mirror text is suppressed and kind:llm is not persisted
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('does not persist duplicate llm text when streamed JSON chunks mirror final_answer payload', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-stream-mirror',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        onChunk({ type: 'text', delta: '{"summary_points":' });
        onChunk({ type: 'text', delta: '["Done"]}' });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
    expect(messageManager.hideAndMarkIncomplete).toHaveBeenCalledWith(2, 'agent-1');
    const completedLlmCreates = llmCreates.filter((call: unknown[]) => call[4] === true);
    expect(completedLlmCreates).toHaveLength(0);
  });

  /* Preconditions: Provider streams final_answer tool_call and then streamed JSON chunks with non-mirror payload
     Action: Run pipeline for one user turn
     Assertions: Streamed non-mirror text is preserved as kind:llm
     Requirements: llm-integration.9.5.6, llm-integration.9.5.6.1 */
  it('persists llm text when streamed JSON chunks do not mirror final_answer payload', async () => {
    const { pipeline, llmProvider, messageManager } = makeMocks();

    llmProvider.chat.mockImplementation(
      async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
        onChunk({
          type: 'tool_call',
          callId: 'call-final-stream-non-mirror',
          toolName: 'final_answer',
          arguments: { summary_points: ['Done'] },
        });
        onChunk({ type: 'text', delta: '{"summary_points":' });
        onChunk({ type: 'text', delta: '["Different payload"]}' });
        return { text: '' };
      }
    );

    await pipeline.run('agent-1', 1);

    const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[1] === 'llm'
    );
    expect(llmCreates).toHaveLength(1);
    expect(llmCreates[0]?.[2]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          text: '{"summary_points":["Different payload"]}',
        }),
      })
    );
  });

  it('creates kind:error when final_answer tool_result has missing required summary_points', async () => {
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

    expect(messageManager.create).toHaveBeenCalledWith(
      'agent-1',
      'error',
      expect.objectContaining({
        data: expect.objectContaining({
          error: expect.objectContaining({
            type: 'provider',
            message: expect.stringContaining('invalid tool call arguments'),
          }),
        }),
      }),
      1,
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
          type: 'tool_call',
          callId: 'call-circular',
          toolName: 'search_docs',
          arguments: { q: 1 },
        });
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
            status: 'running',
          }),
        }),
      }),
      1,
      false
    );
    expect(messageManager.update).toHaveBeenCalledWith(
      100,
      'agent-1',
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-circular',
          output: expect.objectContaining({
            status: 'error',
            content: '[object Object]',
          }),
        }),
      }),
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
