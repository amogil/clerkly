// Requirements: agents.4, agents.7, realtime-events.9
// tests/unit/agents/MessageManager.test.ts
// Unit tests for MessageManager

import { MessageManager } from '../../../src/main/agents/MessageManager';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import { MessageCreatedEvent, MessageUpdatedEvent } from '../../../src/shared/events/types';
import type { IDatabaseManager } from '../../../src/main/DatabaseManager';
import type { Message } from '../../../src/main/db/schema';

// Mock MainEventBus
jest.mock('../../../src/main/events/MainEventBus', () => ({
  MainEventBus: {
    getInstance: jest.fn(() => ({
      publish: jest.fn(),
      subscribe: jest.fn(),
    })),
  },
}));

// Mock Logger
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

describe('MessageManager', () => {
  let messageManager: MessageManager;
  let mockDbManager: jest.Mocked<IDatabaseManager>;
  let mockEventBus: { publish: jest.Mock; subscribe: jest.Mock };

  const mockMessage: Message = {
    id: 1,
    agentId: 'agent-123',
    kind: 'user',
    timestamp: '2026-02-15T10:30:00.000Z',
    payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
    usageJson: null,
    replyToMessageId: null,
    hidden: false,
    done: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = { publish: jest.fn(), subscribe: jest.fn() };
    (MainEventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    mockDbManager = {
      messages: {
        listByAgent: jest.fn().mockReturnValue([mockMessage]),
        listByAgentPaginated: jest
          .fn()
          .mockReturnValue({ messages: [mockMessage], hasMore: false }),
        getLastByAgent: jest.fn().mockReturnValue(mockMessage),
        getLastUserByAgent: jest.fn().mockReturnValue(mockMessage),
        getById: jest.fn().mockReturnValue(mockMessage),
        create: jest.fn().mockReturnValue(mockMessage),
        update: jest.fn(),
        setDone: jest.fn(),
        updateUsageJson: jest.fn(),
      },
      agents: {} as IDatabaseManager['agents'],
      settings: {} as IDatabaseManager['settings'],
      users: {} as IDatabaseManager['users'],
      global: {} as IDatabaseManager['global'],
      setUserManager: jest.fn(),
      getDatabase: jest.fn(),
      getCurrentUserId: jest.fn(),
      getCurrentUserIdStrict: jest.fn(),
    } as unknown as jest.Mocked<IDatabaseManager>;

    messageManager = new MessageManager(mockDbManager);
  });

  describe('toEventMessage (private method)', () => {
    /* Preconditions: Message with valid JSON payload exists
       Action: Call toEventMessage() with message
       Assertions: Returns MessageSnapshot with parsed payload and Unix timestamp
       Requirements: realtime-events.9.2, realtime-events.9.4, realtime-events.9.5 */
    it('should convert Message to MessageSnapshot with parsed payload', () => {
      const snapshot = (messageManager as any).toEventMessage(mockMessage);

      expect(snapshot).toEqual({
        id: mockMessage.id,
        agentId: mockMessage.agentId,
        kind: 'user',
        timestamp: new Date(mockMessage.timestamp).getTime(),
        payload: { data: { text: 'Hello' } },
        replyToMessageId: mockMessage.replyToMessageId ?? null,
        hidden: false,
        done: true,
      });
      expect(typeof snapshot.timestamp).toBe('number');
      expect(typeof snapshot.payload).toBe('object');
    });

    /* Preconditions: Message with complex payload exists
       Action: Call toEventMessage() with message
       Assertions: Returns MessageSnapshot with fully parsed payload
       Requirements: realtime-events.9.4 */
    it('should parse complex payload correctly', () => {
      const complexMessage: Message = {
        id: 2,
        agentId: 'agent-123',
        kind: 'llm',
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          data: {
            text: 'Response',
            result: { status: 'success', value: 42 },
          },
        }),
        usageJson: null,
        replyToMessageId: 1,
        hidden: false,
        done: false,
      };

      const snapshot = (messageManager as any).toEventMessage(complexMessage);

      expect(snapshot.kind).toBe('llm');
      expect(snapshot.payload).toEqual({
        data: {
          text: 'Response',
          result: { status: 'success', value: 42 },
        },
      });
    });

    /* Preconditions: Message with invalid JSON payload exists
       Action: Call toEventMessage() with message
       Assertions: Throws error with descriptive message
       Requirements: realtime-events.9.6 */
    it('should throw error for invalid JSON payload', () => {
      const invalidMessage: Message = {
        id: 3,
        agentId: 'agent-123',
        kind: 'user',
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: 'invalid json {',
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };

      expect(() => (messageManager as any).toEventMessage(invalidMessage)).toThrow(
        /Failed to parse message payload for message 3/
      );
    });

    /* Preconditions: Message with empty JSON payload exists
       Action: Call toEventMessage() with message
       Assertions: Throws error (not returns null)
       Requirements: realtime-events.9.6 */
    it('should throw error for empty JSON payload, not return null', () => {
      const emptyMessage: Message = {
        id: 4,
        agentId: 'agent-123',
        kind: 'user',
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: '',
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };

      expect(() => (messageManager as any).toEventMessage(emptyMessage)).toThrow();
    });
  });

  describe('list', () => {
    /* Preconditions: MessageManager initialized, messages exist
       Action: Call list() with agentId
       Assertions: Repository listByAgent called, messages returned
       Requirements: agents.4.8 */
    it('should return list of messages from repository', () => {
      const messages = [mockMessage, { ...mockMessage, id: 2 }];
      mockDbManager.messages.listByAgent = jest.fn().mockReturnValue(messages);

      const result = messageManager.list('agent-123');

      expect(mockDbManager.messages.listByAgent).toHaveBeenCalledWith('agent-123');
      expect(result).toEqual(messages);
    });
  });

  describe('listForModelHistory', () => {
    /* Preconditions: Messages include hidden and kind:error
       Action: Call listForModelHistory(agentId)
       Assertions: Excludes hidden and kind:error messages
       Requirements: llm-integration.3.9, llm-integration.8.6 */
    it('should exclude hidden and kind:error messages from model history', () => {
      const visibleUser: Message = { ...mockMessage, id: 1, kind: 'user', hidden: false };
      const hiddenLlm: Message = { ...mockMessage, id: 2, kind: 'llm', hidden: true };
      const errorMsg: Message = {
        ...mockMessage,
        id: 3,
        kind: 'error',
        hidden: false,
        payloadJson: JSON.stringify({ data: { error: { message: 'fail' } } }),
      };

      mockDbManager.messages.listByAgent = jest
        .fn()
        .mockReturnValue([visibleUser, hiddenLlm, errorMsg]);

      const result = messageManager.listForModelHistory('agent-123');

      expect(mockDbManager.messages.listByAgent).toHaveBeenCalledWith('agent-123', true);
      expect(result).toEqual([visibleUser]);
    });
  });

  describe('listPaginated', () => {
    /* Preconditions: MessageManager initialized, messages exist
       Action: Call listPaginated() with agentId and limit
       Assertions: Repository listByAgentPaginated called, messages + hasMore returned
       Requirements: agents.13.1, agents.13.2 */
    it('should return paginated messages from repository', () => {
      const result = messageManager.listPaginated('agent-123', 50, undefined);

      expect(mockDbManager.messages.listByAgentPaginated).toHaveBeenCalledWith(
        'agent-123',
        50,
        undefined
      );
      expect(result).toEqual({ messages: [mockMessage], hasMore: false });
    });

    /* Preconditions: MessageManager initialized, many messages exist
       Action: Call listPaginated() with beforeId
       Assertions: Repository called with beforeId, hasMore=true when more pages exist
       Requirements: agents.13.2, agents.13.4 */
    it('should pass beforeId and return hasMore=true when more pages exist', () => {
      mockDbManager.messages.listByAgentPaginated = jest
        .fn()
        .mockReturnValue({ messages: [mockMessage], hasMore: true });

      const result = messageManager.listPaginated('agent-123', 20, 100);

      expect(mockDbManager.messages.listByAgentPaginated).toHaveBeenCalledWith(
        'agent-123',
        20,
        100
      );
      expect(result.hasMore).toBe(true);
    });

    /* Preconditions: MessageManager initialized, no messages exist
       Action: Call listPaginated() with agentId
       Assertions: Empty messages array and hasMore=false returned
       Requirements: agents.13.1 */
    it('should return empty list when no messages exist', () => {
      mockDbManager.messages.listByAgentPaginated = jest
        .fn()
        .mockReturnValue({ messages: [], hasMore: false });

      const result = messageManager.listPaginated('agent-123', 50, undefined);

      expect(result).toEqual({ messages: [], hasMore: false });
    });
  });

  describe('getLastMessage', () => {
    /* Preconditions: MessageManager initialized, messages exist
       Action: Call getLastMessage() with agentId
       Assertions: Repository getLastByAgent called, last message returned
       Requirements: agents.5.5 */
    it('should return last message from repository', () => {
      const result = messageManager.getLastMessage('agent-123');

      expect(mockDbManager.messages.getLastByAgent).toHaveBeenCalledWith('agent-123');
      expect(result).toEqual(mockMessage);
    });

    /* Preconditions: MessageManager initialized, no messages exist
       Action: Call getLastMessage() with agentId
       Assertions: Returns null
       Requirements: agents.5.5 */
    it('should return null when no messages exist', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      const result = messageManager.getLastMessage('agent-123');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    /* Preconditions: MessageManager initialized
       Action: Call create() with agentId and payload
       Assertions: Repository create called, event published with snapshot, message returned
       Requirements: agents.4.3, agents.7.1, agents.12.4, realtime-events.9.7 */
    it('should create message and publish event with snapshot', () => {
      const payload = { data: { text: 'Hello' } };

      const result = messageManager.create('agent-123', 'user', payload, null);

      expect(mockDbManager.messages.create).toHaveBeenCalledWith(
        'agent-123',
        'user',
        JSON.stringify(payload),
        null,
        false,
        undefined
      );
      expect(result).toEqual(mockMessage);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageCreatedEvent);
      expect(publishedEvent.message.id).toBe(mockMessage.id);
      expect(publishedEvent.message.kind).toBe('user');
      expect(publishedEvent.message.payload).toEqual(payload);
      expect(typeof publishedEvent.timestamp).toBe('number');
    });
  });

  describe('hideErrorMessages', () => {
    /* Preconditions: Agent has visible kind:error messages (hidden=false)
       Action: Call hideErrorMessages(agentId)
       Assertions: Repository hideErrorMessages called, message.updated emitted for each returned (newly hidden) message
       Requirements: llm-integration.3.8 */
    it('should hide error messages and emit message.updated for each newly hidden one', () => {
      const visibleError: Message = {
        id: 10,
        agentId: 'agent-123',
        kind: 'error',
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ data: { error: { type: 'provider', message: 'fail' } } }),
        usageJson: null,
        replyToMessageId: null,
        hidden: true, // returned by repo already with hidden=true
        done: true,
      };

      // Repository returns only the records that were actually changed
      mockDbManager.messages.hideErrorMessages = jest.fn().mockReturnValue([visibleError]);

      messageManager.hideErrorMessages('agent-123');

      expect(mockDbManager.messages.hideErrorMessages).toHaveBeenCalledWith('agent-123');
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const event = mockEventBus.publish.mock.calls[0][0];
      expect(event).toBeInstanceOf(MessageUpdatedEvent);
      expect(event.message.id).toBe(10);
      expect(event.message.hidden).toBe(true);
    });

    /* Preconditions: Agent has no visible kind:error messages (repo returns empty array)
       Action: Call hideErrorMessages(agentId)
       Assertions: No events emitted
       Requirements: llm-integration.3.8 */
    it('should not emit events when no visible error messages exist', () => {
      mockDbManager.messages.hideErrorMessages = jest.fn().mockReturnValue([]);

      messageManager.hideErrorMessages('agent-123');

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('setHidden', () => {
    /* Preconditions: MessageManager initialized, getById returns null after setHidden
       Action: Call setHidden() for a message that no longer exists
       Assertions: setHidden called, no event published
       Requirements: llm-integration.8.5 */
    it('should not publish event when hidden message is not found after update', () => {
      mockDbManager.messages.setHidden = jest.fn();
      mockDbManager.messages.getById = jest.fn().mockReturnValue(null);

      (messageManager as any).setHidden(999, 'agent-123');

      expect(mockDbManager.messages.setHidden).toHaveBeenCalledWith(999, 'agent-123');
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    /* Preconditions: MessageManager initialized
       Action: Call update() with messageId, agentId, and new payload
       Assertions: Repository update called, event published with snapshot
       Requirements: agents.7.1, realtime-events.9.7 */
    it('should update message and publish event with snapshot', () => {
      const payload = { data: { text: 'Updated' } };
      const updatedMessage: Message = { ...mockMessage, payloadJson: JSON.stringify(payload) };
      mockDbManager.messages.getById = jest.fn().mockReturnValue(updatedMessage);

      messageManager.update(1, 'agent-123', payload);

      expect(mockDbManager.messages.update).toHaveBeenCalledWith(
        1,
        'agent-123',
        JSON.stringify(payload),
        undefined
      );
      expect(mockDbManager.messages.getById).toHaveBeenCalledWith(1, 'agent-123');
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageUpdatedEvent);
      expect(publishedEvent.message.id).toBe(1);
      expect(publishedEvent.message.agentId).toBe('agent-123');
      expect(publishedEvent.message.kind).toBe('user');
      expect(publishedEvent.message.payload).toEqual(payload);
      expect(typeof publishedEvent.timestamp).toBe('number');
    });

    /* Preconditions: MessageManager initialized, getById returns null (message deleted)
       Action: Call update() with messageId that no longer exists
       Assertions: Repository update called, no event published
       Requirements: agents.7.1 */
    it('should not publish event when updated message is not found', () => {
      mockDbManager.messages.getById = jest.fn().mockReturnValue(null);

      messageManager.update(999, 'agent-123', { data: { text: 'x' } });

      expect(mockDbManager.messages.update).toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('setUsage', () => {
    /* Preconditions: MessageManager initialized and message exists
       Action: Call setUsage() with canonical+raw envelope
       Assertions: Repository updateUsageJson called with serialized envelope
       Requirements: llm-integration.13 */
    it('should persist usage envelope into messages.usage_json', () => {
      const usage = {
        canonical: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
        raw: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      };

      messageManager.setUsage(1, 'agent-123', usage);

      expect(mockDbManager.messages.updateUsageJson).toHaveBeenCalledWith(
        1,
        'agent-123',
        JSON.stringify(usage)
      );
    });

    /* Preconditions: Usage envelope provided for message persistence
       Action: Call setUsage() and inspect serialized payload
       Assertions: usage_json does not duplicate provider/model/timestamp metadata
       Requirements: llm-integration.13.5 */
    it('should not include provider/model/timestamp in serialized usage_json envelope', () => {
      const usage = {
        canonical: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
        raw: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      };

      messageManager.setUsage(1, 'agent-123', usage);

      const usageJson = (mockDbManager.messages.updateUsageJson as jest.Mock).mock
        .calls[0][2] as string;
      const parsed = JSON.parse(usageJson) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('provider');
      expect(parsed).not.toHaveProperty('model');
      expect(parsed).not.toHaveProperty('timestamp');
      expect(parsed.raw).not.toHaveProperty('provider');
      expect(parsed.raw).not.toHaveProperty('model');
      expect(parsed.raw).not.toHaveProperty('timestamp');
    });
  });
});
