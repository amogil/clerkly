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

  describe('create', () => {
    /* Preconditions: AgentManager initialized with mock DatabaseManager
       Action: Call create() without name
       Assertions: Repository create called, event published, agent returned
       Requirements: agents.2.3, agents.2.4, agents.12.1 */
    it('should create agent with default name and publish event', () => {
      const result = agentManager.create();

      expect(mockDbManager.agents.create).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockAgent);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentCreatedEvent);
      // AgentCreatedEvent stores data as instance property, toPayload() returns { data }
      expect(publishedEvent.data.id).toBe(mockAgent.agentId);
    });

    /* Preconditions: AgentManager initialized with mock DatabaseManager
       Action: Call create() with custom name
       Assertions: Repository create called with name
       Requirements: agents.2.3 */
    it('should create agent with custom name', () => {
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
       Assertions: Repository update called, event published
       Requirements: agents.10.4, agents.12.2 */
    it('should update agent and publish event', () => {
      agentManager.update('abc123xyz0', { name: 'Updated Name' });

      expect(mockDbManager.agents.update).toHaveBeenCalledWith('abc123xyz0', {
        name: 'Updated Name',
      });
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentUpdatedEvent);
      // AgentUpdatedEvent stores id as instance property
      expect(publishedEvent.id).toBe('abc123xyz0');
      expect(publishedEvent.changedFields).toEqual({ name: 'Updated Name' });
    });
  });

  describe('archive', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: Call archive()
       Assertions: Repository archive called, event published
       Requirements: agents.10.4, agents.12.3 */
    it('should archive agent and publish event', () => {
      agentManager.archive('abc123xyz0');

      expect(mockDbManager.agents.archive).toHaveBeenCalledWith('abc123xyz0');
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentArchivedEvent);
      // AgentArchivedEvent stores id as instance property
      expect(publishedEvent.id).toBe('abc123xyz0');
    });
  });

  describe('handleMessageCreated (MESSAGE_CREATED event handler)', () => {
    /* Preconditions: AgentManager initialized, agent exists
       Action: handleMessageCreated called with agentId
       Assertions: Agent updatedAt updated, AGENT_UPDATED event published
       Requirements: agents.1.4, agents.12.2 */
    it('should update agent updatedAt and publish AGENT_UPDATED event', () => {
      // Clear publish calls from constructor
      mockEventBus.publish.mockClear();

      // Call private method through type assertion
      (agentManager as any).handleMessageCreated('abc123xyz0');

      // Verify agent.touch() was called
      expect(mockDbManager.agents.touch).toHaveBeenCalledWith('abc123xyz0');

      // Verify agent was fetched
      expect(mockDbManager.agents.findById).toHaveBeenCalledWith('abc123xyz0');

      // Verify AGENT_UPDATED event was published
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentUpdatedEvent);
      expect(publishedEvent.id).toBe('abc123xyz0');
      expect(publishedEvent.changedFields.updatedAt).toBeDefined();
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
