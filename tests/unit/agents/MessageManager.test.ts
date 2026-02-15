// Requirements: agents.4, agents.7
// tests/unit/agents/MessageManager.test.ts
// Unit tests for MessageManager

import { MessageManager, MessagePayload } from '../../../src/main/agents/MessageManager';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import { MessageCreatedEvent, MessageUpdatedEvent } from '../../../src/shared/events/types';
import type { IDatabaseManager } from '../../../src/main/DatabaseManager';
import type { Message } from '../../../src/main/db/schema';

// Mock MainEventBus
jest.mock('../../../src/main/events/MainEventBus', () => ({
  MainEventBus: {
    getInstance: jest.fn(() => ({
      publish: jest.fn(),
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
  let mockEventBus: { publish: jest.Mock };

  const mockMessage: Message = {
    id: 1,
    agentId: 'abc123xyz0',
    timestamp: '2026-02-15T10:00:00.000Z',
    payloadJson: JSON.stringify({ kind: 'user', data: { text: 'Hello' } }),
  };

  const userPayload: MessagePayload = {
    kind: 'user',
    data: { text: 'Hello, agent!' },
  };

  const llmPayload: MessagePayload = {
    kind: 'llm',
    data: { text: 'Hello, user!' },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = { publish: jest.fn() };
    (MainEventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    mockDbManager = {
      agents: {
        create: jest.fn(),
        list: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        archive: jest.fn(),
        touch: jest.fn(),
      },
      messages: {
        listByAgent: jest.fn().mockReturnValue([mockMessage]),
        create: jest.fn().mockReturnValue(mockMessage),
        update: jest.fn(),
      },
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

  describe('list', () => {
    /* Preconditions: MessageManager initialized, messages exist for agent
       Action: Call list() with agentId
       Assertions: Repository listByAgent called, messages returned
       Requirements: agents.4.8, user-data-isolation.7.6 */
    it('should return list of messages for agent', () => {
      const messages = [mockMessage, { ...mockMessage, id: 2 }];
      mockDbManager.messages.listByAgent = jest.fn().mockReturnValue(messages);

      const result = messageManager.list('abc123xyz0');

      expect(mockDbManager.messages.listByAgent).toHaveBeenCalledWith('abc123xyz0');
      expect(result).toEqual(messages);
    });

    /* Preconditions: MessageManager initialized, no messages for agent
       Action: Call list() with agentId
       Assertions: Empty array returned
       Requirements: agents.4.8 */
    it('should return empty array when no messages', () => {
      mockDbManager.messages.listByAgent = jest.fn().mockReturnValue([]);

      const result = messageManager.list('abc123xyz0');

      expect(result).toEqual([]);
    });

    /* Preconditions: MessageManager initialized, access denied
       Action: Call list() with agentId user does not own
       Assertions: Error thrown
       Requirements: user-data-isolation.7.6 */
    it('should throw error when access denied', () => {
      mockDbManager.messages.listByAgent = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(() => messageManager.list('other-agent')).toThrow('Access denied');
    });
  });

  describe('create', () => {
    /* Preconditions: MessageManager initialized, agent exists
       Action: Call create() with user message payload
       Assertions: Repository create called with JSON, event published
       Requirements: agents.4.3, agents.7.1, agents.12.4 */
    it('should create user message and publish event', () => {
      const result = messageManager.create('abc123xyz0', userPayload);

      expect(mockDbManager.messages.create).toHaveBeenCalledWith(
        'abc123xyz0',
        JSON.stringify(userPayload)
      );
      expect(result).toEqual(mockMessage);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageCreatedEvent);
      // MessageCreatedEvent stores data as instance property, toPayload() returns { data }
      expect(publishedEvent.data.id).toBe(mockMessage.id);
      expect(publishedEvent.data.agentId).toBe(mockMessage.agentId);
    });

    /* Preconditions: MessageManager initialized, agent exists
       Action: Call create() with llm message payload
       Assertions: Repository create called with correct kind
       Requirements: agents.7.2 */
    it('should create llm message with correct payload', () => {
      messageManager.create('abc123xyz0', llmPayload);

      expect(mockDbManager.messages.create).toHaveBeenCalledWith(
        'abc123xyz0',
        JSON.stringify(llmPayload)
      );
    });

    /* Preconditions: MessageManager initialized, agent exists
       Action: Call create() with final_answer payload
       Assertions: Repository create called with correct kind
       Requirements: agents.7.6 */
    it('should create final_answer message', () => {
      const finalAnswerPayload: MessagePayload = {
        kind: 'final_answer',
        data: { text: 'Done!', format: 'text' },
      };

      messageManager.create('abc123xyz0', finalAnswerPayload);

      expect(mockDbManager.messages.create).toHaveBeenCalledWith(
        'abc123xyz0',
        JSON.stringify(finalAnswerPayload)
      );
    });

    /* Preconditions: MessageManager initialized, access denied
       Action: Call create() for agent user does not own
       Assertions: Error thrown
       Requirements: user-data-isolation.7.6 */
    it('should throw error when access denied', () => {
      mockDbManager.messages.create = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(() => messageManager.create('other-agent', userPayload)).toThrow('Access denied');
    });
  });

  describe('update', () => {
    /* Preconditions: MessageManager initialized, message exists
       Action: Call update() with new payload
       Assertions: Repository update called, event published
       Requirements: agents.7.1, agents.12.5 */
    it('should update message and publish event', () => {
      const updatedPayload: MessagePayload = {
        kind: 'llm',
        data: { text: 'Updated response' },
      };

      messageManager.update(1, 'abc123xyz0', updatedPayload);

      expect(mockDbManager.messages.update).toHaveBeenCalledWith(
        1,
        'abc123xyz0',
        JSON.stringify(updatedPayload)
      );
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MessageUpdatedEvent);
      // MessageUpdatedEvent stores id as instance property
      expect(publishedEvent.id).toBe(1);
      expect(publishedEvent.changedFields).toEqual({
        payloadJson: JSON.stringify(updatedPayload),
      });
    });

    /* Preconditions: MessageManager initialized, access denied
       Action: Call update() for message user does not own
       Assertions: Error thrown
       Requirements: user-data-isolation.7.6 */
    it('should throw error when access denied', () => {
      mockDbManager.messages.update = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(() => messageManager.update(1, 'other-agent', userPayload)).toThrow('Access denied');
    });
  });
});
