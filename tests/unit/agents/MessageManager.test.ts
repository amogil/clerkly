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
    timestamp: '2026-02-15T10:30:00.000Z',
    payloadJson: JSON.stringify({ kind: 'user', data: { text: 'Hello' } }),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = { publish: jest.fn(), subscribe: jest.fn() };
    (MainEventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    mockDbManager = {
      messages: {
        listByAgent: jest.fn().mockReturnValue([mockMessage]),
        getLastByAgent: jest.fn().mockReturnValue(mockMessage),
        create: jest.fn().mockReturnValue(mockMessage),
        update: jest.fn(),
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
        timestamp: new Date(mockMessage.timestamp).getTime(),
        payload: { kind: 'user', data: { text: 'Hello' } },
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
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          kind: 'llm',
          data: {
            text: 'Response',
            result: { status: 'success', value: 42 },
          },
        }),
      };

      const snapshot = (messageManager as any).toEventMessage(complexMessage);

      expect(snapshot.payload).toEqual({
        kind: 'llm',
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
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: 'invalid json {',
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
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: '',
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
      const payload = { kind: 'user' as const, data: { text: 'Hello' } };

      const result = messageManager.create('agent-123', payload);

      expect(mockDbManager.messages.create).toHaveBeenCalledWith(
        'agent-123',
        JSON.stringify(payload)
      );
      expect(result).toEqual(mockMessage);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageCreatedEvent);
      expect(publishedEvent.message.id).toBe(mockMessage.id);
      expect(publishedEvent.message.payload).toEqual(payload);
      expect(typeof publishedEvent.timestamp).toBe('number');
    });
  });

  describe('update', () => {
    /* Preconditions: MessageManager initialized
       Action: Call update() with messageId, agentId, and new payload
       Assertions: Repository update called, event published with snapshot
       Requirements: agents.7.1, realtime-events.9.7 */
    it('should update message and publish event with snapshot', () => {
      const payload = { kind: 'user' as const, data: { text: 'Updated' } };

      messageManager.update(1, 'agent-123', payload);

      expect(mockDbManager.messages.update).toHaveBeenCalledWith(
        1,
        'agent-123',
        JSON.stringify(payload)
      );
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageUpdatedEvent);
      expect(publishedEvent.message.id).toBe(1);
      expect(publishedEvent.message.agentId).toBe('agent-123');
      expect(publishedEvent.message.payload).toEqual(payload);
      expect(typeof publishedEvent.timestamp).toBe('number');
    });
  });
});
