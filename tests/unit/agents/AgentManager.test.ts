// Requirements: agents.2, agents.10
// tests/unit/agents/AgentManager.test.ts
// Unit tests for AgentManager

import { AgentManager } from '../../../src/main/agents/AgentManager';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
} from '../../../src/shared/events/types';
import type { IDatabaseManager } from '../../../src/main/DatabaseManager';
import type { Agent } from '../../../src/main/db/schema';

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

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockDbManager: jest.Mocked<IDatabaseManager>;
  let mockEventBus: { publish: jest.Mock; subscribe: jest.Mock };

  const mockAgent: Agent = {
    agentId: 'abc123xyz0',
    userId: 'user123456',
    name: 'Test Agent',
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-02-15T10:00:00.000Z',
    archivedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = { publish: jest.fn(), subscribe: jest.fn() };
    (MainEventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    mockDbManager = {
      agents: {
        create: jest.fn().mockReturnValue(mockAgent),
        list: jest.fn().mockReturnValue([mockAgent]),
        findById: jest.fn().mockReturnValue(mockAgent),
        update: jest.fn(),
        archive: jest.fn(),
        touch: jest.fn(),
      },
      messages: {
        listByAgent: jest.fn(),
        create: jest.fn(),
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

    agentManager = new AgentManager(mockDbManager);
  });

  describe('toEventAgent (private method)', () => {
    /* Preconditions: Agent with no messages exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'new'
       Requirements: realtime-events.9.2, realtime-events.9.4, realtime-events.9.5 */
    it('should convert Agent to AgentSnapshot with status new when no messages', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot).toEqual({
        id: mockAgent.agentId,
        name: mockAgent.name,
        createdAt: new Date(mockAgent.createdAt).getTime(),
        updatedAt: new Date(mockAgent.updatedAt).getTime(),
        archivedAt: null,
        status: 'new',
      });
      expect(typeof snapshot.createdAt).toBe('number');
      expect(typeof snapshot.updatedAt).toBe('number');
    });

    /* Preconditions: Agent with archived timestamp exists
       Action: Call toEventAgent() with archived agent
       Assertions: Returns AgentSnapshot with archivedAt as Unix timestamp
       Requirements: realtime-events.9.2, realtime-events.9.4 */
    it('should convert archivedAt to Unix timestamp', () => {
      const archivedAgent = {
        ...mockAgent,
        archivedAt: '2026-02-15T11:00:00.000Z',
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      const snapshot = (agentManager as any).toEventAgent(archivedAgent);

      expect(snapshot.archivedAt).toBe(new Date('2026-02-15T11:00:00.000Z').getTime());
      expect(typeof snapshot.archivedAt).toBe('number');
    });

    /* Preconditions: Agent with last message of kind 'user' exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'in-progress'
       Requirements: realtime-events.9.2, agents.5.1 */
    it('should compute status as in-progress when last message is from user', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ kind: 'user', data: { text: 'Hello' } }),
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe('in-progress');
    });

    /* Preconditions: Agent with last message of kind 'final_answer' exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'completed'
       Requirements: realtime-events.9.2, agents.5.2 */
    it('should compute status as completed when last message is final_answer', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ kind: 'final_answer', data: { text: 'Done' } }),
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe('completed');
    });

    /* Preconditions: Agent with last message containing error status exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'error'
       Requirements: realtime-events.9.2, agents.5.3 */
    it('should compute status as error when last message has error result', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          kind: 'llm',
          data: { result: { status: 'error', message: 'Failed' } },
        }),
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe('error');
    });

    /* Preconditions: Agent with last message of kind 'llm' (not final_answer) exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'awaiting-response'
       Requirements: realtime-events.9.2, agents.5.4 */
    it('should compute status as awaiting-response when last message is from LLM', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ kind: 'llm', data: { text: 'Thinking...' } }),
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe('awaiting-response');
    });
  });

  describe('create', () => {
    /* Preconditions: AgentManager initialized with mock DatabaseManager
       Action: Call create() without name
       Assertions: Repository create called with default name, event published with snapshot, agent returned
       Requirements: agents.2.3, agents.2.4, agents.12.1, realtime-events.9.7 */
    it('should create agent with default name and publish event with snapshot', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      const result = agentManager.create();

      expect(mockDbManager.agents.create).toHaveBeenCalledWith('New Agent');
      expect(result).toEqual(mockAgent);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentCreatedEvent);
      expect(publishedEvent.agent.id).toBe(mockAgent.agentId);
      expect(publishedEvent.agent.status).toBe('new');
      expect(typeof publishedEvent.timestamp).toBe('number');
    });

    /* Preconditions: AgentManager initialized with mock DatabaseManager
       Action: Call create() with custom name
       Assertions: Repository create called with name
       Requirements: agents.2.3 */
    it('should create agent with custom name', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      agentManager.create('My Custom Agent');

      expect(mockDbManager.agents.create).toHaveBeenCalledWith('My Custom Agent');
    });
  });

  describe('list', () => {
    /* Preconditions: AgentManager initialized, repository returns agents
       Action: Call list()
       Assertions: Repository list called, agents returned
       Requirements: agents.1.3, agents.10.2 */
    it('should return list of agents from repository', () => {
      const agents = [mockAgent, { ...mockAgent, agentId: 'xyz987abc0' }];
      mockDbManager.agents.list = jest.fn().mockReturnValue(agents);

      const result = agentManager.list();

      expect(mockDbManager.agents.list).toHaveBeenCalled();
      expect(result).toEqual(agents);
    });

    /* Preconditions: AgentManager initialized, repository returns empty array
       Action: Call list()
       Assertions: Empty array returned
       Requirements: agents.1.3 */
    it('should return empty array when no agents', () => {
      mockDbManager.agents.list = jest.fn().mockReturnValue([]);

      const result = agentManager.list();

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: Call get() with valid agentId
       Assertions: Repository findById called, agent returned
       Requirements: agents.3.2, agents.10.4 */
    it('should return agent by id', () => {
      const result = agentManager.get('abc123xyz0');

      expect(mockDbManager.agents.findById).toHaveBeenCalledWith('abc123xyz0');
      expect(result).toEqual(mockAgent);
    });

    /* Preconditions: AgentManager initialized, agent does not exist
       Action: Call get() with invalid agentId
       Assertions: undefined returned
       Requirements: agents.10.4 */
    it('should return undefined for non-existent agent', () => {
      mockDbManager.agents.findById = jest.fn().mockReturnValue(undefined);

      const result = agentManager.get('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: Call update() with new name
       Assertions: Repository update called, event published with snapshot
       Requirements: agents.10.4, agents.12.2, realtime-events.9.7 */
    it('should update agent and publish event with snapshot', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      agentManager.update('abc123xyz0', { name: 'Updated Name' });

      expect(mockDbManager.agents.update).toHaveBeenCalledWith('abc123xyz0', {
        name: 'Updated Name',
      });
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentUpdatedEvent);
      expect(publishedEvent.agent.id).toBe('abc123xyz0');
      expect(publishedEvent.agent.status).toBe('new');
      expect(typeof publishedEvent.timestamp).toBe('number');
    });
  });

  describe('archive', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: Call archive()
       Assertions: Repository archive called, event published with snapshot including archivedAt
       Requirements: agents.10.4, agents.12.3, realtime-events.9.7 */
    it('should archive agent and publish event with snapshot', () => {
      const archivedAgent = {
        ...mockAgent,
        archivedAt: '2026-02-15T11:00:00.000Z',
      };
      mockDbManager.agents.findById = jest
        .fn()
        .mockReturnValueOnce(mockAgent) // First call in archive() before archiving
        .mockReturnValueOnce(archivedAgent); // Second call after archiving
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      agentManager.archive('abc123xyz0');

      expect(mockDbManager.agents.archive).toHaveBeenCalledWith('abc123xyz0');
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentArchivedEvent);
      expect(publishedEvent.agent.id).toBe('abc123xyz0');
      expect(publishedEvent.agent.archivedAt).toBe(
        new Date('2026-02-15T11:00:00.000Z').getTime()
      );
      expect(typeof publishedEvent.timestamp).toBe('number');
    });
  });

  describe('handleMessageCreated (MESSAGE_CREATED event handler)', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: handleMessageCreated called with agentId
       Assertions: Agent updatedAt updated, AGENT_UPDATED event published with snapshot
       Requirements: agents.1.4, agents.12.2, realtime-events.9.7 */
    it('should update agent updatedAt and publish AGENT_UPDATED event with snapshot', () => {
      // Clear publish calls from constructor
      mockEventBus.publish.mockClear();

      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      // Call private method through type assertion
      (agentManager as any).handleMessageCreated('abc123xyz0');

      // Verify agent.touch() was called
      expect(mockDbManager.agents.touch).toHaveBeenCalledWith('abc123xyz0');

      // Verify agent was fetched
      expect(mockDbManager.agents.findById).toHaveBeenCalledWith('abc123xyz0');

      // Verify AGENT_UPDATED event was published with snapshot
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentUpdatedEvent);
      expect(publishedEvent.agent.id).toBe('abc123xyz0');
      expect(publishedEvent.agent.status).toBe('new');
      expect(typeof publishedEvent.timestamp).toBe('number');
    });

    /* Preconditions: AgentManager initialized, touch() throws error
       Action: handleMessageCreated called with agentId
       Assertions: handleBackgroundError called, error re-thrown
       Requirements: agents.1.4, error-notifications.1 */
    it('should call handleBackgroundError and re-throw error on failure', () => {
      // Mock handleBackgroundError function
      const ErrorHandlerModule = require('../../../src/main/ErrorHandler');
      const handleBackgroundErrorSpy = jest
        .spyOn(ErrorHandlerModule, 'handleBackgroundError')
        .mockImplementation(() => {});

      // Mock touch() to throw error
      const testError = new Error('Database connection failed');
      mockDbManager.agents.touch = jest.fn().mockImplementation(() => {
        throw testError;
      });

      // Should throw error after calling handleBackgroundError
      expect(() => (agentManager as any).handleMessageCreated('abc123xyz0')).toThrow(
        'Database connection failed'
      );

      // Verify handleBackgroundError was called with error and context
      expect(handleBackgroundErrorSpy).toHaveBeenCalledWith(testError, 'Agent Update');

      handleBackgroundErrorSpy.mockRestore();
    });

    /* Preconditions: AgentManager initialized, agent not found after touch
       Action: handleMessageCreated called with agentId
       Assertions: No AGENT_UPDATED event published
       Requirements: agents.1.4, agents.12.2 */
    it('should not publish AGENT_UPDATED if agent not found', () => {
      // Clear publish calls from constructor
      mockEventBus.publish.mockClear();

      // Mock findById to return undefined
      mockDbManager.agents.findById = jest.fn().mockReturnValue(undefined);

      // Call private method
      (agentManager as any).handleMessageCreated('abc123xyz0');

      // Verify touch was called
      expect(mockDbManager.agents.touch).toHaveBeenCalledWith('abc123xyz0');

      // Verify no event was published
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });
});
