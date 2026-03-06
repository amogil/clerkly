// Requirements: llm-integration.5
// tests/unit/agents/MainPipeline.test.ts
// Unit tests for MainPipeline

import { MainPipeline } from '../../../src/main/agents/MainPipeline';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import {
  MessageLlmReasoningUpdatedEvent,
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
  LLMStructuredOutput,
} from '../../../src/main/llm/ILLMProvider';
import type { Message } from '../../../src/main/db/schema';
import { LLM_CHAT_MODELS } from '../../../src/main/llm/LLMConfig';
import { InvalidStructuredOutputError } from '../../../src/main/llm/StructuredOutputContract';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  const messageManager = {
    list: jest.fn().mockReturnValue([userMsg]),
    listForModelHistory: jest.fn().mockReturnValue([userMsg]),
    getLastMessage: jest.fn().mockReturnValue(userMsg),
    create: jest.fn().mockImplementation((_agentId: string, kind: string) => {
      if (kind === 'llm') return llmMsg;
      if (kind === 'error') return errorMsg;
      return makeMessage(99, kind);
    }),
    update: jest.fn(),
    setHidden: jest.fn(),
    setDone: jest.fn(),
    setUsage: jest.fn(),
    toEventMessage: jest.fn().mockReturnValue({
      id: 1,
      agentId: 'agent-1',
      kind: 'user',
      timestamp: Date.now(),
      payload: {},
      replyToMessageId: null,
      hidden: false,
      done: true,
    }),
  } as unknown as jest.Mocked<MessageManager>;

  const settingsManager = {
    loadLLMProvider: jest.fn().mockResolvedValue('openai'),
    loadAPIKey: jest.fn().mockResolvedValue('sk-test-key'),
  } as unknown as jest.Mocked<AIAgentSettingsManager>;

  const promptBuilder = {
    buildMessages: jest.fn().mockReturnValue([{ role: 'user', content: 'Hello' }]),
  } as unknown as jest.Mocked<PromptBuilder>;

  const llmProvider: jest.Mocked<ILLMProvider> = {
    chat: jest.fn(),
    testConnection: jest.fn(),
    getProviderName: jest.fn().mockReturnValue('OpenAI'),
  };

  const createProvider = jest.fn().mockReturnValue(llmProvider);

  const pipeline = new MainPipeline(messageManager, settingsManager, promptBuilder, createProvider);

  return {
    pipeline,
    messageManager,
    settingsManager,
    promptBuilder,
    llmProvider,
    createProvider,
    mockPublish,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MainPipeline.run()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful cycle without reasoning', () => {
    /* Preconditions: LLM returns action immediately, no reasoning chunks
       Action: Call run(agentId, userMessageId)
       Assertions: kind:llm message created with action; no reasoning events emitted
       Requirements: llm-integration.5.1 */
    it('should create llm message with action on success', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Hello back!' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.objectContaining({
          data: expect.objectContaining({
            action: { type: 'text', content: 'Hello back!' },
          }),
        }),
        1,
        true
      );
    });
  });

  describe('usage_json persistence', () => {
    /* Preconditions: Provider returns usage envelope in successful response
       Action: Call run(agentId, userMessageId)
       Assertions: usage is persisted via dedicated MessageManager.setUsage step
       Requirements: llm-integration.13 */
    it('should persist usage envelope as separate step after llm finalization', async () => {
      const { pipeline, llmProvider, messageManager } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'with usage' },
            usage: {
              canonical: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
              raw: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
            },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.setUsage).toHaveBeenCalledWith(
        2,
        'agent-1',
        expect.objectContaining({
          canonical: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
        })
      );
    });
  });

  describe('successful cycle with reasoning', () => {
    /* Preconditions: LLM streams reasoning chunks then returns action
       Action: Call run(agentId, userMessageId)
       Assertions: llm message created on first chunk; reasoning events emitted per chunk; final update with action
       Requirements: llm-integration.5.1, llm-integration.5.2 */
    it('should emit reasoning events and update message on each chunk', async () => {
      const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'Let me think', done: false });
          onChunk({ type: 'reasoning', delta: ' more', done: false });
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Answer' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      // llm message created on first reasoning chunk
      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.any(Object),
        1,
        false
      );

      // reasoning events emitted for each non-done chunk
      const reasoningEvents = mockPublish.mock.calls
        .map((call: [unknown]) => call[0])
        .filter((e: unknown) => e instanceof MessageLlmReasoningUpdatedEvent);
      expect(reasoningEvents).toHaveLength(2);
      expect((reasoningEvents[0] as MessageLlmReasoningUpdatedEvent).delta).toBe('Let me think');
      expect((reasoningEvents[0] as MessageLlmReasoningUpdatedEvent).accumulatedText).toBe(
        'Let me think'
      );
      expect((reasoningEvents[1] as MessageLlmReasoningUpdatedEvent).delta).toBe(' more');
      expect((reasoningEvents[1] as MessageLlmReasoningUpdatedEvent).accumulatedText).toBe(
        'Let me think more'
      );

      // final update with action
      expect(messageManager.update).toHaveBeenLastCalledWith(
        2, // llmMsg.id
        'agent-1',
        expect.objectContaining({
          data: expect.objectContaining({
            action: { type: 'text', content: 'Answer' },
          }),
        }),
        true
      );
    });

    /* Preconditions: LLM streams reasoning and then final action
       Action: Call run(agentId, userMessageId)
       Assertions: llm updates keep done=false during reasoning and switch to done=true on final action
       Requirements: llm-integration.1.6.1, llm-integration.1.6.2 */
    it('should keep llm done=false during reasoning and set done=true on final action', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'chunk-1', done: false });
          onChunk({ type: 'reasoning', delta: 'chunk-2', done: false });
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Final answer' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.any(Object),
        1,
        false
      );

      const updateDoneFlags = (messageManager.update as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[3]
      );
      expect(updateDoneFlags).toContain(false);
      expect(updateDoneFlags.at(-1)).toBe(true);
    });
  });

  describe('error before first chunk', () => {
    /* Preconditions: LLM throws before any chunks
       Action: Call run(agentId, userMessageId)
       Assertions: No llm message created; kind:error message created; no hidden llm message
       Requirements: llm-integration.5.3 */
    it('should create only error message when LLM fails before streaming', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockRejectedValue(new Error('Network error'));

      await pipeline.run('agent-1', 1);

      // No llm message created
      const llmCreates = (messageManager.create as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'llm'
      );
      expect(llmCreates).toHaveLength(0);

      // Error message created
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
  });

  describe('error after streaming started', () => {
    /* Preconditions: LLM streams one reasoning chunk then throws
       Action: Call run(agentId, userMessageId)
       Assertions: llm message hidden via setHidden; kind:error message created
       Requirements: llm-integration.5.3 */
    it('should hide llm message and create error message', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'Thinking...', done: false });
          throw new Error('Connection dropped');
        }
      );

      await pipeline.run('agent-1', 1);

      // llm message hidden via setHidden — Requirements: llm-integration.3.2
      expect(messageManager.setHidden).toHaveBeenCalledWith(2, 'agent-1');
      expect(messageManager.setDone).toHaveBeenCalledWith(2, 'agent-1', false);

      // error message created
      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.any(Object),
        1,
        true
      );
    });
  });

  describe('invalid structured output retries', () => {
    /* Preconditions: LLM keeps returning invalid structured output
       Action: Call run(agentId, userMessageId)
       Assertions: Pipeline performs initial call + 2 retries, then creates provider error
       Requirements: llm-integration.12.1, llm-integration.12.2 */
    it('should retry invalid structured output twice and then create error', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'invalid-type', content: 'Bad payload' },
          } as unknown as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(llmProvider.chat).toHaveBeenCalledTimes(3);
      const secondAttemptMessages = (llmProvider.chat as jest.Mock).mock
        .calls[1][0] as ChatMessage[];
      const thirdAttemptMessages = (llmProvider.chat as jest.Mock).mock
        .calls[2][0] as ChatMessage[];
      expect(
        secondAttemptMessages.some((m) =>
          m.content.includes('did not match the required JSON schema')
        )
      ).toBe(true);
      expect(
        thirdAttemptMessages.some((m) =>
          m.content.includes('did not match the required JSON schema')
        )
      ).toBe(true);
      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.objectContaining({
          data: {
            error: {
              type: 'provider',
              message: 'Invalid response format. Please try again later.',
            },
          },
        }),
        1,
        true
      );
    });

    /* Preconditions: LLM provider throws InvalidStructuredOutputError (parse/schema failure)
       Action: Call run(agentId, userMessageId)
       Assertions: Pipeline catches error, retries twice, then creates standardized error
       Requirements: llm-integration.12.1, llm-integration.12.2 */
    it('should retry when provider throws InvalidStructuredOutputError and then create error', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockRejectedValue(
        new InvalidStructuredOutputError('{"action":{"type":"invalid-type","content":"Broken"}}')
      );

      await pipeline.run('agent-1', 1);

      expect(llmProvider.chat).toHaveBeenCalledTimes(3);
      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.objectContaining({
          data: {
            error: {
              type: 'provider',
              message: 'Invalid response format. Please try again later.',
            },
          },
        }),
        1,
        true
      );
    });
  });

  describe('auth error includes action_link', () => {
    /* Preconditions: LLM returns 401 auth error
       Action: Call run(agentId, userMessageId)
       Assertions: error message has action_link with screen:settings
       Requirements: llm-integration.5.3 */
    it('should include action_link for auth errors', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockRejectedValue(
        new Error('Invalid API key. Please check your key and try again.')
      );

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
  });

  describe('reply_to_message_id', () => {
    /* Preconditions: User message with id=5 triggers pipeline
       Action: Call run('agent-1', 5)
       Assertions: llm message has reply_to_message_id: 5
       Requirements: llm-integration.5.1 */
    it('should set reply_to_message_id to userMessageId', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'OK' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 5);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.any(Object),
        5,
        true
      );
    });
  });

  describe('missing API key', () => {
    /* Preconditions: No API key saved in settings
       Action: Call run(agentId, userMessageId)
       Assertions: kind:error message created with type:auth
       Requirements: llm-integration.5.3 */
    it('should create auth error when API key is missing', async () => {
      const { pipeline, messageManager, settingsManager } = makeMocks();

      (settingsManager.loadAPIKey as jest.Mock).mockResolvedValue(null);

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.objectContaining({
          data: expect.objectContaining({
            error: expect.objectContaining({
              type: 'auth',
              message: 'API key is not set. Add it in Settings to continue.',
            }),
          }),
        }),
        1,
        true
      );
    });
  });

  describe('AbortSignal cancellation before API key validation', () => {
    /* Preconditions: Signal is aborted before context build and API key is missing
       Action: Call run() with pre-aborted signal
       Assertions: Pipeline exits silently without creating auth error message
       Requirements: llm-integration.8.7 */
    it('should not create auth error when aborted before API key check', async () => {
      const { pipeline, messageManager, settingsManager } = makeMocks();
      const controller = new AbortController();
      controller.abort();
      (settingsManager.loadAPIKey as jest.Mock).mockResolvedValue(null);

      await pipeline.run('agent-1', 1, controller.signal);

      expect(messageManager.create).not.toHaveBeenCalled();
    });
  });

  describe('AbortSignal cancellation before start', () => {
    /* Preconditions: AbortSignal already aborted before run()
       Action: Call run() with pre-aborted signal
       Assertions: No messages created, no LLM call
       Requirements: llm-integration.5.4 */
    it('should do nothing when signal is already aborted', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      const controller = new AbortController();
      controller.abort();

      await pipeline.run('agent-1', 1, controller.signal);

      expect(llmProvider.chat).not.toHaveBeenCalled();
      expect(messageManager.create).not.toHaveBeenCalled();
    });
  });

  describe('AbortSignal cancellation after streaming', () => {
    /* Preconditions: Signal aborted after reasoning chunk received
       Action: Call run() with signal aborted mid-stream
       Assertions: llm message hidden via setHidden; no error message created
       Requirements: llm-integration.5.4 */
    it('should hide llm message when aborted after streaming', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();
      const controller = new AbortController();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'Thinking', done: false });
          // Abort after first chunk
          controller.abort();
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Answer' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1, controller.signal);

      // llm message was created (first chunk), then hidden
      expect(messageManager.setHidden).toHaveBeenCalledWith(2, 'agent-1');

      // No error message
      const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'error'
      );
      expect(errorCreates).toHaveLength(0);
    });
  });

  describe('classifyError variants', () => {
    /* Preconditions: LLM throws various error types
       Action: Call run() with different error messages
       Assertions: Error type correctly classified
       Requirements: llm-integration.5.3 */
    it('should classify rate_limit error', async () => {
      const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();
      llmProvider.chat.mockRejectedValue(
        new Error('Rate limit exceeded. Please try again in 10.000s')
      );

      await pipeline.run('agent-1', 1);

      // Rate limit should NOT create kind:error — instead emits AgentRateLimitEvent
      // Requirements: llm-integration.3.7
      const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'error'
      );
      expect(errorCreates).toHaveLength(0);

      // AgentRateLimitEvent should be published
      const { AgentRateLimitEvent } = require('../../../src/shared/events/types');
      const rateLimitEvents = mockPublish.mock.calls
        .map((call: [unknown]) => call[0])
        .filter((e: unknown) => e instanceof AgentRateLimitEvent);
      expect(rateLimitEvents).toHaveLength(1);
      expect((rateLimitEvents[0] as InstanceType<typeof AgentRateLimitEvent>).agentId).toBe(
        'agent-1'
      );
      expect((rateLimitEvents[0] as InstanceType<typeof AgentRateLimitEvent>).userMessageId).toBe(
        1
      );
      expect(
        (rateLimitEvents[0] as InstanceType<typeof AgentRateLimitEvent>).retryAfterSeconds
      ).toBe(10);
    });

    it('should classify timeout error', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();
      llmProvider.chat.mockRejectedValue(new Error('Connection timeout'));

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

    it('should classify typed abort error as timeout', async () => {
      const { pipeline, messageManager, llmProvider, mockPublish } = makeMocks();
      llmProvider.chat.mockRejectedValue(
        new LLMRequestAbortedError(
          'Model response timeout. The provider took too long to respond. Please try again later.',
          new DOMException('The operation was aborted', 'AbortError')
        )
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'error',
        expect.objectContaining({
          data: expect.objectContaining({
            error: expect.objectContaining({
              type: 'timeout',
              message:
                'Model response timeout. The provider took too long to respond. Please try again later.',
            }),
          }),
        }),
        1,
        true
      );

      const diagnosticEvents = mockPublish.mock.calls
        .map((call: [unknown]) => call[0])
        .filter((event: unknown) => event instanceof LLMPipelineDiagnosticEvent);
      expect(diagnosticEvents).toHaveLength(1);
      const diagnostic = diagnosticEvents[0] as LLMPipelineDiagnosticEvent;
      expect(diagnostic.details).toMatchObject({
        agentId: 'agent-1',
        userMessageId: 1,
        signalAborted: false,
        errorName: 'LLMRequestAbortedError',
        errorType: 'timeout',
      });
    });

    it('should classify provider error for unknown messages', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();
      llmProvider.chat.mockRejectedValue(new Error('Something went wrong on the server'));

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
  });

  describe('resolveModel for different providers', () => {
    /* Preconditions: Different providers configured
       Action: Call run() with anthropic/google provider
       Assertions: Correct model used for each provider
       Requirements: llm-integration.5.1 */
    it('should use anthropic model for anthropic provider', async () => {
      const { pipeline, messageManager, settingsManager, llmProvider } = makeMocks();
      (settingsManager.loadLLMProvider as jest.Mock).mockResolvedValue('anthropic');

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Claude answer' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.objectContaining({
          data: expect.objectContaining({ model: LLM_CHAT_MODELS.anthropic.prod.model }),
        }),
        1,
        true
      );
    });

    it('should use google model for google provider', async () => {
      const { pipeline, messageManager, settingsManager, llmProvider } = makeMocks();
      (settingsManager.loadLLMProvider as jest.Mock).mockResolvedValue('google');

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content: 'Gemini answer' },
          } as LLMStructuredOutput;
        }
      );

      await pipeline.run('agent-1', 1);

      expect(messageManager.create).toHaveBeenCalledWith(
        'agent-1',
        'llm',
        expect.objectContaining({
          data: expect.objectContaining({ model: LLM_CHAT_MODELS.google.test.model }),
        }),
        1,
        true
      );
    });
  });

  describe('AbortSignal cancellation in catch block', () => {
    /* Preconditions: Signal aborted, LLM throws, llm message was already created
       Action: Call run() where abort happens during error handling
       Assertions: llm message hidden via setHidden; no error message
       Requirements: llm-integration.5.4 */
    it('should hide llm message and skip error message when aborted in catch', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();
      const controller = new AbortController();

      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          onChunk({ type: 'reasoning', delta: 'Thinking', done: false });
          controller.abort();
          throw new Error('Aborted by signal');
        }
      );

      await pipeline.run('agent-1', 1, controller.signal);

      // llm message hidden via setHidden
      expect(messageManager.setHidden).toHaveBeenCalledWith(2, 'agent-1');

      // No error message created
      const errorCreates = (messageManager.create as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[1] === 'error'
      );
      expect(errorCreates).toHaveLength(0);
    });
  });
  describe('parallel agents isolation', () => {
    /* Preconditions: Two agents run concurrently
       Action: Call run() for agent-1 and agent-2 simultaneously
       Assertions: Each agent gets its own messages; no cross-contamination
       Requirements: llm-integration.5.5 */
    it('should isolate state between concurrent runs', async () => {
      const { pipeline, messageManager, llmProvider } = makeMocks();

      // Both agents return different content
      let callCount = 0;
      llmProvider.chat.mockImplementation(
        async (_msgs: ChatMessage[], _opts: ChatOptions, onChunk: (c: ChatChunk) => void) => {
          callCount++;
          const content = callCount === 1 ? 'Response for agent-1' : 'Response for agent-2';
          onChunk({ type: 'reasoning', delta: '', done: true });
          return {
            action: { type: 'text', content },
          } as LLMStructuredOutput;
        }
      );

      // Run both concurrently
      await Promise.all([pipeline.run('agent-1', 1), pipeline.run('agent-2', 2)]);

      // Both should have created llm messages
      expect(messageManager.create).toHaveBeenCalledTimes(2);
    });
  });
});
