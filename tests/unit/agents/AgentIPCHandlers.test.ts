// Requirements: agents.2, agents.4, agents.10, llm-integration.6
// tests/unit/agents/AgentIPCHandlers.test.ts
// Unit tests for AgentIPCHandlers

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AgentIPCHandlers } from '../../../src/main/agents/AgentIPCHandlers';
import { AgentManager } from '../../../src/main/agents/AgentManager';
import { MessageManager } from '../../../src/main/agents/MessageManager';
import { MainPipeline } from '../../../src/main/agents/MainPipeline';
import type { MessagePayload } from '../../../src/shared/utils/agentStatus';
import type { Agent, Message } from '../../../src/main/db/schema';

// Mock electron
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
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

describe('AgentIPCHandlers', () => {
  let handlers: AgentIPCHandlers;
  let mockAgentManager: jest.Mocked<AgentManager>;
  let mockMessageManager: jest.Mocked<MessageManager>;
  let mockPipeline: jest.Mocked<MainPipeline>;
  let registeredHandlers: Map<string, (...args: unknown[]) => Promise<unknown>>;

  const mockAgent: Agent = {
    agentId: 'abc123xyz0',
    userId: 'user123456',
    name: 'Test Agent',
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-02-15T10:00:00.000Z',
    archivedAt: null,
  };

  const mockMessage: Message = {
    id: 1,
    agentId: 'abc123xyz0',
    kind: 'user',
    timestamp: '2026-02-15T10:00:00.000Z',
    payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
  };

  const mockMessageSnapshot = {
    id: 1,
    agentId: 'abc123xyz0',
    kind: 'user',
    timestamp: new Date('2026-02-15T10:00:00.000Z').getTime(),
    payload: { data: { text: 'Hello' } },
  };

  const mockAgentSnapshot = {
    id: 'abc123xyz0',
    name: 'Test Agent',
    createdAt: new Date('2026-02-15T10:00:00.000Z').getTime(),
    updatedAt: new Date('2026-02-15T10:00:00.000Z').getTime(),
    archivedAt: null,
    status: 'new' as const,
  };

  const mockEvent = {} as IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandlers = new Map();

    // Capture registered handlers
    (ipcMain.handle as jest.Mock).mockImplementation(
      (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        registeredHandlers.set(channel, handler);
      }
    );

    mockAgentManager = {
      create: jest.fn().mockReturnValue(mockAgent),
      list: jest.fn().mockReturnValue([mockAgent]),
      get: jest.fn().mockReturnValue(mockAgent),
      update: jest.fn(),
      archive: jest.fn(),
      toEventAgent: jest.fn().mockReturnValue(mockAgentSnapshot),
      cancelPipeline: jest.fn(),
      setPipelineController: jest.fn(),
    } as unknown as jest.Mocked<AgentManager>;

    mockMessageManager = {
      list: jest.fn().mockReturnValue([mockMessage]),
      create: jest.fn().mockReturnValue(mockMessage),
      update: jest.fn(),
      getLastMessage: jest.fn().mockReturnValue(mockMessage),
      toEventMessage: jest.fn().mockReturnValue(mockMessageSnapshot),
    } as unknown as jest.Mocked<MessageManager>;

    mockPipeline = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MainPipeline>;

    handlers = new AgentIPCHandlers(mockAgentManager, mockMessageManager, mockPipeline);
  });

  describe('registerHandlers', () => {
    /* Preconditions: AgentIPCHandlers initialized
       Action: Call registerHandlers()
       Assertions: All 9 handlers registered
       Requirements: agents.2, agents.4, agents.5.5 */
    it('should register all IPC handlers', () => {
      handlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledTimes(9);
      expect(ipcMain.handle).toHaveBeenCalledWith('agents:create', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('agents:list', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('agents:get', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('agents:update', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('agents:archive', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('messages:list', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('messages:create', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('messages:update', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('messages:get-last', expect.any(Function));
    });

    /* Preconditions: Handlers already registered
       Action: Call registerHandlers() again
       Assertions: Handlers not registered twice
       Requirements: agents.2 */
    it('should not register handlers twice', () => {
      handlers.registerHandlers();
      handlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledTimes(9);
    });
  });

  describe('unregisterHandlers', () => {
    /* Preconditions: Handlers registered
       Action: Call unregisterHandlers()
       Assertions: All handlers removed
       Requirements: agents.2 */
    it('should unregister all handlers', () => {
      handlers.registerHandlers();
      handlers.unregisterHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(9);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('agents:create');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('agents:list');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('agents:get');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('agents:update');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('agents:archive');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('messages:list');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('messages:create');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('messages:update');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('messages:get-last');
    });

    /* Preconditions: Handlers not registered
       Action: Call unregisterHandlers()
       Assertions: No error, no removeHandler calls
       Requirements: agents.2 */
    it('should do nothing if handlers not registered', () => {
      handlers.unregisterHandlers();

      expect(ipcMain.removeHandler).not.toHaveBeenCalled();
    });
  });

  describe('agents:create handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke agents:create with name
       Assertions: AgentManager.create called, AgentSnapshot returned
       Requirements: agents.2.3, agents.2.4, realtime-events.9.8 */
    it('should create agent and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:create')!;

      const result = await handler(mockEvent, { name: 'My Agent' });

      expect(mockAgentManager.create).toHaveBeenCalledWith('My Agent');
      expect(mockAgentManager.toEventAgent).toHaveBeenCalledWith(mockAgent);
      expect(result).toEqual({ success: true, data: mockAgentSnapshot });
    });

    /* Preconditions: Handlers registered
       Action: Invoke agents:create without name
       Assertions: AgentManager.create called with undefined
       Requirements: agents.2.5 */
    it('should create agent with default name', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:create')!;

      await handler(mockEvent, {});

      expect(mockAgentManager.create).toHaveBeenCalledWith(undefined);
    });

    /* Preconditions: Handlers registered, AgentManager throws
       Action: Invoke agents:create
       Assertions: Error returned
       Requirements: agents.2 */
    it('should return error on failure', async () => {
      mockAgentManager.create = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:create')!;

      const result = await handler(mockEvent, { name: 'Test' });

      expect(result).toEqual({ success: false, error: 'Database error' });
    });
  });

  describe('agents:list handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke agents:list
       Assertions: AgentManager.list called, AgentSnapshot[] returned
       Requirements: agents.1.3, agents.10.2, realtime-events.9.8 */
    it('should list agents and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:list')!;

      const result = await handler(mockEvent);

      expect(mockAgentManager.list).toHaveBeenCalled();
      expect(mockAgentManager.toEventAgent).toHaveBeenCalledWith(mockAgent);
      expect(result).toEqual({ success: true, data: [mockAgentSnapshot] });
    });

    /* Preconditions: Handlers registered, AgentManager throws
       Action: Invoke agents:list
       Assertions: Error returned
       Requirements: agents.1.3 */
    it('should return error on failure', async () => {
      mockAgentManager.list = jest.fn().mockImplementation(() => {
        throw new Error('No user logged in');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:list')!;

      const result = await handler(mockEvent);

      expect(result).toEqual({ success: false, error: 'No user logged in' });
    });
  });

  describe('agents:get handler', () => {
    /* Preconditions: Handlers registered, agent exists
       Action: Invoke agents:get with agentId
       Assertions: AgentManager.get called, agent returned
       Requirements: agents.3.2, agents.10.4 */
    it('should get agent and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:get')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0' });

      expect(mockAgentManager.get).toHaveBeenCalledWith('abc123xyz0');
      expect(mockAgentManager.toEventAgent).toHaveBeenCalledWith(mockAgent);
      expect(result).toEqual({ success: true, data: mockAgentSnapshot });
    });

    /* Preconditions: Handlers registered, agent not found
       Action: Invoke agents:get with invalid agentId
       Assertions: Error returned
       Requirements: agents.10.4 */
    it('should return error when agent not found', async () => {
      mockAgentManager.get = jest.fn().mockReturnValue(undefined);
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:get')!;

      const result = await handler(mockEvent, { agentId: 'nonexistent' });

      expect(result).toEqual({ success: false, error: 'Agent not found' });
    });
  });

  describe('agents:update handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke agents:update with new name
       Assertions: AgentManager.update called, success returned
       Requirements: agents.10.4 */
    it('should update agent and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:update')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0', name: 'New Name' });

      expect(mockAgentManager.update).toHaveBeenCalledWith('abc123xyz0', { name: 'New Name' });
      expect(result).toEqual({ success: true });
    });

    /* Preconditions: Handlers registered, AgentManager throws
       Action: Invoke agents:update
       Assertions: Error returned
       Requirements: agents.10.4 */
    it('should return error on failure', async () => {
      mockAgentManager.update = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:update')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0', name: 'New Name' });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });

  describe('agents:archive handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke agents:archive
       Assertions: AgentManager.archive called, success returned
       Requirements: agents.10.4 */
    it('should archive agent and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('agents:archive')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0' });

      expect(mockAgentManager.archive).toHaveBeenCalledWith('abc123xyz0');
      expect(result).toEqual({ success: true });
    });
  });

  describe('messages:list handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke messages:list with agentId
       Assertions: MessageManager.list called, MessageSnapshot[] returned
       Requirements: agents.4.8, user-data-isolation.7.6, realtime-events.9.8 */
    it('should list messages and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:list')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0' });

      expect(mockMessageManager.list).toHaveBeenCalledWith('abc123xyz0');
      expect(mockMessageManager.toEventMessage).toHaveBeenCalledWith(mockMessage);
      expect(result).toEqual({ success: true, data: [mockMessageSnapshot] });
    });

    /* Preconditions: Handlers registered, access denied
       Action: Invoke messages:list for agent user doesn't own
       Assertions: Error returned
       Requirements: user-data-isolation.7.6 */
    it('should return error when access denied', async () => {
      mockMessageManager.list = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:list')!;

      const result = await handler(mockEvent, { agentId: 'other-agent' });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });

  describe('messages:create handler', () => {
    const userPayload: MessagePayload = {
      data: { text: 'Hello, agent!' },
    };

    /* Preconditions: Handlers registered
       Action: Invoke messages:create with kind and payload
       Assertions: MessageManager.create called with kind, MessageSnapshot returned
       Requirements: agents.4.3, agents.7.1, realtime-events.9.8, llm-integration.2 */
    it('should create message and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:create')!;

      const result = await handler(mockEvent, {
        agentId: 'abc123xyz0',
        kind: 'user',
        payload: userPayload,
      });

      expect(mockMessageManager.create).toHaveBeenCalledWith('abc123xyz0', 'user', userPayload);
      expect(mockMessageManager.toEventMessage).toHaveBeenCalledWith(mockMessage);
      expect(result).toEqual({ success: true, data: mockMessageSnapshot });
    });

    /* Preconditions: Handlers registered
       Action: Invoke messages:create with kind:user
       Assertions: Pipeline launched asynchronously, IPC returns before pipeline completes
       Requirements: llm-integration.6 */
    it('should launch pipeline asynchronously for kind:user and return immediately', async () => {
      let pipelineResolve!: () => void;
      const pipelinePromise = new Promise<void>((resolve) => {
        pipelineResolve = resolve;
      });
      mockPipeline.run = jest.fn().mockReturnValue(pipelinePromise);

      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:create')!;

      // IPC should return before pipeline resolves
      const result = await handler(mockEvent, {
        agentId: 'abc123xyz0',
        kind: 'user',
        payload: userPayload,
      });

      // IPC returned immediately
      expect(result).toEqual({ success: true, data: mockMessageSnapshot });
      // Pipeline was started
      expect(mockPipeline.run).toHaveBeenCalledWith(
        'abc123xyz0',
        mockMessage.id,
        expect.any(AbortSignal)
      );
      // Previous pipeline was cancelled
      expect(mockAgentManager.cancelPipeline).toHaveBeenCalledWith('abc123xyz0');
      // Controller was registered
      expect(mockAgentManager.setPipelineController).toHaveBeenCalledWith(
        'abc123xyz0',
        expect.any(AbortController)
      );

      // Resolve pipeline to avoid unhandled promise
      pipelineResolve();
      await pipelinePromise;
    });

    /* Preconditions: Handlers registered
       Action: Invoke messages:create with kind:llm (not user)
       Assertions: Pipeline NOT launched
       Requirements: llm-integration.6 */
    it('should NOT launch pipeline for non-user kinds', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:create')!;

      await handler(mockEvent, {
        agentId: 'abc123xyz0',
        kind: 'llm',
        payload: userPayload,
      });

      expect(mockPipeline.run).not.toHaveBeenCalled();
    });

    /* Preconditions: Handlers registered, pipeline rejects
       Action: Invoke messages:create with kind:user, pipeline throws
       Assertions: handleBackgroundError called, IPC still returns success
       Requirements: llm-integration.6, error-notifications.1.1 */
    it('should call handleBackgroundError if pipeline rejects in background', async () => {
      const ErrorHandlerModule = require('../../../src/main/ErrorHandler');
      const handleBackgroundErrorSpy = jest
        .spyOn(ErrorHandlerModule, 'handleBackgroundError')
        .mockImplementation(() => {});

      const pipelineError = new Error('LLM error');
      mockPipeline.run = jest.fn().mockRejectedValue(pipelineError);

      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:create')!;

      const result = await handler(mockEvent, {
        agentId: 'abc123xyz0',
        kind: 'user',
        payload: userPayload,
      });

      expect(result).toEqual({ success: true, data: mockMessageSnapshot });

      // Allow microtasks to flush
      await new Promise((r) => setTimeout(r, 0));

      expect(handleBackgroundErrorSpy).toHaveBeenCalledWith(pipelineError, 'LLM Pipeline');

      handleBackgroundErrorSpy.mockRestore();
    });

    /* Preconditions: Handlers registered, access denied
       Action: Invoke messages:create for agent user doesn't own
       Assertions: Error returned
       Requirements: user-data-isolation.7.6 */
    it('should return error when access denied', async () => {
      mockMessageManager.create = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:create')!;

      const result = await handler(mockEvent, {
        agentId: 'other-agent',
        kind: 'user',
        payload: userPayload,
      });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });

  describe('messages:update handler', () => {
    const updatedPayload: MessagePayload = {
      data: { text: 'Updated response' },
    };

    /* Preconditions: Handlers registered
       Action: Invoke messages:update with new payload
       Assertions: MessageManager.update called, success returned
       Requirements: agents.7.1 */
    it('should update message and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:update')!;

      const result = await handler(mockEvent, {
        messageId: 1,
        agentId: 'abc123xyz0',
        payload: updatedPayload,
      });

      expect(mockMessageManager.update).toHaveBeenCalledWith(1, 'abc123xyz0', updatedPayload);
      expect(result).toEqual({ success: true });
    });

    /* Preconditions: Handlers registered, access denied
       Action: Invoke messages:update for message user doesn't own
       Assertions: Error returned
       Requirements: user-data-isolation.7.6 */
    it('should return error when access denied', async () => {
      mockMessageManager.update = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:update')!;

      const result = await handler(mockEvent, {
        messageId: 1,
        agentId: 'other-agent',
        payload: updatedPayload,
      });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });

  describe('messages:get-last handler', () => {
    /* Preconditions: Handlers registered
       Action: Invoke messages:get-last with agentId
       Assertions: MessageManager.getLastMessage called, MessageSnapshot returned
       Requirements: agents.5.5, realtime-events.9.8 */
    it('should get last message and return success', async () => {
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:get-last')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0' });

      expect(mockMessageManager.getLastMessage).toHaveBeenCalledWith('abc123xyz0');
      expect(mockMessageManager.toEventMessage).toHaveBeenCalledWith(mockMessage);
      expect(result).toEqual({ success: true, data: mockMessageSnapshot });
    });

    /* Preconditions: Handlers registered, no messages
       Action: Invoke messages:get-last
       Assertions: null returned
       Requirements: agents.5.5 */
    it('should return null when no messages exist', async () => {
      mockMessageManager.getLastMessage = jest.fn().mockReturnValue(null);
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:get-last')!;

      const result = await handler(mockEvent, { agentId: 'abc123xyz0' });

      expect(result).toEqual({ success: true, data: null });
    });

    /* Preconditions: Handlers registered, access denied
       Action: Invoke messages:get-last for agent user doesn't own
       Assertions: Error returned
       Requirements: user-data-isolation.7.6 */
    it('should return error when access denied', async () => {
      mockMessageManager.getLastMessage = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });
      handlers.registerHandlers();
      const handler = registeredHandlers.get('messages:get-last')!;

      const result = await handler(mockEvent, { agentId: 'other-agent' });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });
});
