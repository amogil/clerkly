// Requirements: agents.2, agents.10
// tests/unit/agents/AgentManager.test.ts
// Unit tests for AgentManager

import { AgentManager } from '../../../src/main/agents/AgentManager';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
} from '../../../src/shared/events/types';
import { AGENT_STATUS, MESSAGE_KIND } from '../../../src/shared/utils/agentStatus';
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
      },
      messages: {
        listByAgent: jest.fn(),
        getLastByAgent: jest.fn().mockReturnValue(null),
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

  /* Preconditions: AgentManager constructed
     Action: Constructor subscribes to event bus
     Assertions: Subscriptions for MESSAGE_CREATED and MESSAGE_UPDATED are registered
     Requirements: agents.12.2, agents.12.4 */
  it('should subscribe to MESSAGE_CREATED and MESSAGE_UPDATED events', () => {
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      EVENT_TYPES.MESSAGE_CREATED,
      expect.any(Function)
    );
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      EVENT_TYPES.MESSAGE_UPDATED,
      expect.any(Function)
    );
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
        status: AGENT_STATUS.NEW,
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
        kind: MESSAGE_KIND.USER,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.IN_PROGRESS);
    });

    /* Preconditions: Agent with last message of kind 'final_answer' exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'completed'
       Requirements: realtime-events.9.2, agents.5.2 */
    it('should compute status as completed when last message is final_answer', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.FINAL_ANSWER,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ data: { text: 'Done' } }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.COMPLETED);
    });

    /* Preconditions: Agent with last message containing error status exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'error'
       Requirements: realtime-events.9.2, agents.5.3, llm-integration.2 */
    it('should compute status as error when last message has kind error', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.ERROR,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          data: { error: { type: 'network', message: 'Failed' } },
        }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.ERROR);
    });

    /* Preconditions: Agent with last message of kind 'llm' containing result.status='error' (legacy payload)
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'in-progress' (legacy result.status is ignored and action is absent)
       Requirements: realtime-events.9.2, agents.5.4, llm-integration.2 */
    it('should ignore legacy result.status in payload and use kind instead', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          data: { result: { status: 'error', message: 'Failed' } },
        }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: false,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.IN_PROGRESS);
    });

    /* Preconditions: Agent with last message of kind 'llm' without action (reasoning-only, not final_answer) exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'in-progress'
       Requirements: realtime-events.9.2, agents.5.1, agents.9.2 */
    it('should compute status as in-progress when last llm message has no action', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ data: { text: 'Thinking...' } }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: false,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.IN_PROGRESS);
    });

    /* Preconditions: Agent with last message of kind 'llm' and finalized action exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'awaiting-response'
       Requirements: realtime-events.9.2, agents.5.4, agents.9.2 */
    it('should compute status as awaiting-response when last llm message has action', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({
          data: {
            reasoning: { text: 'Thinking...' },
            action: { type: 'text', content: 'Done' },
          },
        }),
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: true,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.AWAITING_RESPONSE);
    });

    /* Preconditions: Last message is visible
       Action: Call toEventAgent()
       Assertions: Status is computed from getLastByAgent fast path without loading full history
       Requirements: realtime-events.6.1 */
    it('should avoid full history read when latest message is visible', () => {
      const lastMessage = {
        id: 5,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: JSON.stringify({ data: { reasoning: { text: 'x' } } }),
        usageJson: null,
        replyToMessageId: 4,
        hidden: false,
        done: false,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);
      mockDbManager.messages.listByAgent = jest.fn();

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.IN_PROGRESS);
      expect(mockDbManager.messages.listByAgent).not.toHaveBeenCalled();
    });

    /* Preconditions: Agent with malformed llm payload exists
       Action: Call toEventAgent() with agent
       Assertions: Returns AgentSnapshot with status 'in-progress' without throwing
       Requirements: realtime-events.9.2, agents.9.2 */
    it('should compute status as in-progress when llm payload is malformed', () => {
      const lastMessage = {
        id: 1,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:30:00.000Z',
        payloadJson: '{invalid json',
        usageJson: null,
        replyToMessageId: null,
        hidden: false,
        done: false,
      };
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(lastMessage);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.IN_PROGRESS);
    });

    /* Preconditions: Last message is hidden llm(done=false), previous visible message is llm(done=true)
       Action: Call toEventAgent() with agent
       Assertions: Hidden message is ignored, status is computed from last visible message
       Requirements: agents.9.2 */
    it('should ignore hidden last message and compute status from last visible message', () => {
      const history = [
        {
          id: 1,
          agentId: mockAgent.agentId,
          kind: MESSAGE_KIND.LLM,
          timestamp: '2026-02-15T10:00:00.000Z',
          payloadJson: JSON.stringify({
            data: {
              reasoning: { text: 'Done' },
              action: { type: 'text', content: 'Final' },
            },
          }),
          usageJson: null,
          replyToMessageId: null,
          hidden: false,
          done: true,
        },
        {
          id: 2,
          agentId: mockAgent.agentId,
          kind: MESSAGE_KIND.LLM,
          timestamp: '2026-02-15T10:01:00.000Z',
          payloadJson: JSON.stringify({ data: { reasoning: { text: 'Interrupted' } } }),
          usageJson: null,
          replyToMessageId: 1,
          hidden: true,
          done: false,
        },
      ];
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(history[1]);
      mockDbManager.messages.listByAgent = jest.fn().mockReturnValue([history[0]]);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.AWAITING_RESPONSE);
    });

    /* Preconditions: Agent has only hidden messages
       Action: Call toEventAgent() with agent
       Assertions: Status is `new` because visible history is empty
       Requirements: agents.9.2 */
    it('should return new status when all messages are hidden', () => {
      const hiddenHistory = [
        {
          id: 1,
          agentId: mockAgent.agentId,
          kind: MESSAGE_KIND.USER,
          timestamp: '2026-02-15T10:00:00.000Z',
          payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
          usageJson: null,
          replyToMessageId: null,
          hidden: true,
          done: true,
        },
      ];
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(hiddenHistory[0]);
      mockDbManager.messages.listByAgent = jest.fn().mockReturnValue([]);

      const snapshot = (agentManager as any).toEventAgent(mockAgent);

      expect(snapshot.status).toBe(AGENT_STATUS.NEW);
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
      expect(publishedEvent.agent.archivedAt).toBe(new Date('2026-02-15T11:00:00.000Z').getTime());
      expect(typeof publishedEvent.timestamp).toBe('number');
    });

    /* Preconditions: AgentManager initialized, agent has running pipeline
       Action: Call archive()
       Assertions: Pipeline cancelled before archiving
       Requirements: agents.10.4, llm-integration.6 */
    it('should cancel running pipeline when archiving agent', () => {
      const archivedAgent = { ...mockAgent, archivedAt: '2026-02-15T11:00:00.000Z' };
      mockDbManager.agents.findById = jest
        .fn()
        .mockReturnValueOnce(mockAgent)
        .mockReturnValueOnce(archivedAgent);
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      // Register a pipeline controller
      const controller = new AbortController();
      agentManager.setPipelineController('abc123xyz0', controller);

      agentManager.archive('abc123xyz0');

      // Controller should have been aborted
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('setPipelineController / cancelPipeline', () => {
    /* Preconditions: No pipeline running
       Action: Call cancelPipeline()
       Assertions: No error thrown
       Requirements: llm-integration.6 */
    it('should do nothing when no pipeline is running', () => {
      expect(() => agentManager.cancelPipeline('abc123xyz0')).not.toThrow();
    });

    /* Preconditions: Pipeline controller registered
       Action: Call cancelPipeline()
       Assertions: AbortController aborted, controller removed
       Requirements: llm-integration.6 */
    it('should abort controller and remove it', () => {
      const controller = new AbortController();
      agentManager.setPipelineController('abc123xyz0', controller);

      agentManager.cancelPipeline('abc123xyz0');

      expect(controller.signal.aborted).toBe(true);

      // Second cancel should not throw (controller already removed)
      expect(() => agentManager.cancelPipeline('abc123xyz0')).not.toThrow();
    });

    /* Preconditions: Two different agents have pipeline controllers
       Action: Cancel one agent's pipeline
       Assertions: Only that agent's controller is aborted
       Requirements: llm-integration.6 */
    it('should only cancel the specified agent pipeline', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      agentManager.setPipelineController('agent-1', controller1);
      agentManager.setPipelineController('agent-2', controller2);

      agentManager.cancelPipeline('agent-1');

      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(false);
    });
  });

  describe('handleMessageCreated (MESSAGE_CREATED event handler)', () => {
    /* Preconditions: AgentManager initialized, agent exists, message created with timestamp
       Action: handleMessageCreated called with agentId and message timestamp
       Assertions: Agent updatedAt set to message timestamp (not current time), AGENT_UPDATED event published
       Requirements: agents.1.4, agents.12.2, realtime-events.9.7 */
    it('should update agent updatedAt to message timestamp and publish AGENT_UPDATED event', () => {
      // Clear publish calls from constructor
      mockEventBus.publish.mockClear();

      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue(null);

      // Message timestamp (5 minutes ago)
      const messageTimestamp = Date.now() - 5 * 60 * 1000;

      // Call private method with message timestamp
      (agentManager as any).handleMessageCreated('abc123xyz0', messageTimestamp);

      // Verify update was called with message timestamp
      expect(mockDbManager.agents.update).toHaveBeenCalledWith('abc123xyz0', {
        updatedAt: new Date(messageTimestamp).toISOString(),
      });

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

    /* Preconditions: AgentManager initialized, update throws error
       Action: handleMessageCreated called with agentId and timestamp
       Assertions: handleBackgroundError called, error re-thrown
       Requirements: agents.1.4, error-notifications.1 */
    it('should call handleBackgroundError and re-throw error on failure', () => {
      // Mock handleBackgroundError function
      const ErrorHandlerModule = require('../../../src/main/ErrorHandler');
      const handleBackgroundErrorSpy = jest
        .spyOn(ErrorHandlerModule, 'handleBackgroundError')
        .mockImplementation(() => {});

      // Mock update to throw error
      const testError = new Error('Database connection failed');
      mockDbManager.agents.update = jest.fn().mockImplementation(() => {
        throw testError;
      });

      const messageTimestamp = Date.now();

      // Should throw error after calling handleBackgroundError
      expect(() =>
        (agentManager as any).handleMessageCreated('abc123xyz0', messageTimestamp)
      ).toThrow('Database connection failed');

      // Verify handleBackgroundError was called with error and context
      expect(handleBackgroundErrorSpy).toHaveBeenCalledWith(testError, 'Agent Update');

      handleBackgroundErrorSpy.mockRestore();
    });

    /* Preconditions: AgentManager initialized, agent not found after update
       Action: handleMessageCreated called with agentId and timestamp
       Assertions: No AGENT_UPDATED event published
       Requirements: agents.1.4, agents.12.2 */
    it('should not publish AGENT_UPDATED if agent not found', () => {
      // Clear publish calls from constructor
      mockEventBus.publish.mockClear();

      // Mock findById to return undefined
      mockDbManager.agents.findById = jest.fn().mockReturnValue(undefined);

      const messageTimestamp = Date.now();

      // Call private method
      (agentManager as any).handleMessageCreated('abc123xyz0', messageTimestamp);

      // Verify update was called
      expect(mockDbManager.agents.update).toHaveBeenCalledWith('abc123xyz0', {
        updatedAt: new Date(messageTimestamp).toISOString(),
      });

      // Verify no event was published
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageUpdated (MESSAGE_UPDATED event handler)', () => {
    /* Preconditions: Agent exists and last message is finalized llm with action
       Action: handleMessageUpdated called with agentId
       Assertions: Publishes AGENT_UPDATED with recomputed status
       Requirements: agents.9.2, agents.9.3, agents.12.2 */
    it('should publish AGENT_UPDATED with recomputed status on message update', () => {
      mockDbManager.messages.getLastByAgent = jest.fn().mockReturnValue({
        id: 2,
        agentId: mockAgent.agentId,
        kind: MESSAGE_KIND.LLM,
        timestamp: '2026-02-15T10:31:00.000Z',
        payloadJson: JSON.stringify({
          data: { action: { type: 'text', content: 'Done' } },
        }),
        usageJson: null,
        replyToMessageId: 1,
        hidden: false,
        done: true,
      });

      (agentManager as any).handleMessageUpdated(mockAgent.agentId);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(AgentUpdatedEvent);
      expect(publishedEvent.agent.status).toBe(AGENT_STATUS.AWAITING_RESPONSE);
    });

    /* Preconditions: Agent lookup throws error
       Action: handleMessageUpdated called
       Assertions: Error is re-thrown after error handling path
       Requirements: error-notifications.1 */
    it('should re-throw errors from handleMessageUpdated', () => {
      mockDbManager.agents.findById = jest.fn().mockImplementation(() => {
        throw new Error('DB update failed');
      });

      expect(() => (agentManager as any).handleMessageUpdated(mockAgent.agentId)).toThrow(
        'DB update failed'
      );
    });
  });

  describe('clearPipelineController', () => {
    /* Preconditions: Controller set for agent via setPipelineController
       Action: clearPipelineController called with same controller instance
       Assertions: Controller is removed (subsequent cancelPipeline does nothing)
       Requirements: llm-integration.6 */
    it('should remove controller when called with matching instance', () => {
      const controller = new AbortController();
      agentManager.setPipelineController('abc123xyz0', controller);

      agentManager.clearPipelineController('abc123xyz0', controller);

      // After clearing, cancelPipeline should not abort anything
      agentManager.cancelPipeline('abc123xyz0');
      expect(controller.signal.aborted).toBe(false);
    });

    /* Preconditions: Controller A set, then controller B set for same agent
       Action: clearPipelineController called with controller A (old one)
       Assertions: Controller B is NOT removed — newer pipeline is preserved
       Requirements: llm-integration.6 */
    it('should NOT remove controller when called with a different (newer) instance', () => {
      const controllerA = new AbortController();
      const controllerB = new AbortController();

      agentManager.setPipelineController('abc123xyz0', controllerA);
      // Simulate new message: cancel A, set B
      agentManager.cancelPipeline('abc123xyz0');
      agentManager.setPipelineController('abc123xyz0', controllerB);

      // Old pipeline finishes — tries to clear with controllerA
      agentManager.clearPipelineController('abc123xyz0', controllerA);

      // controllerB must still be registered — cancelPipeline should abort it
      agentManager.cancelPipeline('abc123xyz0');
      expect(controllerB.signal.aborted).toBe(true);
    });

    /* Preconditions: No controller set for agent
       Action: clearPipelineController called
       Assertions: No error thrown
       Requirements: llm-integration.6 */
    it('should not throw when no controller is registered', () => {
      const controller = new AbortController();
      expect(() => agentManager.clearPipelineController('nonexistent', controller)).not.toThrow();
    });
  });
});
