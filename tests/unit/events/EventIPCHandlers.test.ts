// Requirements: realtime-events.4
/**
 * Unit tests for EventIPCHandlers
 */

import { ipcMain, IpcMainEvent } from 'electron';
import { registerEventIPCHandlers } from '../../../src/main/events/EventIPCHandlers';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
import { IPC_CHANNELS } from '../../../src/shared/events/constants';

// Mock electron
jest.mock('electron', () => ({
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Mock Logger
jest.mock('../../../src/main/Logger', () => ({
  Logger: {
    create: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock MainEventBus
jest.mock('../../../src/main/events/MainEventBus', () => ({
  MainEventBus: {
    getInstance: jest.fn(() => ({
      deliverFromIPC: jest.fn(),
    })),
  },
}));

describe('EventIPCHandlers', () => {
  let mockDeliverFromIPC: jest.Mock;
  let ipcHandler: (event: IpcMainEvent, type: string, payload: unknown) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeliverFromIPC = jest.fn();
    (MainEventBus.getInstance as jest.Mock).mockReturnValue({
      deliverFromIPC: mockDeliverFromIPC,
    });

    // Capture the IPC handler when registered
    (ipcMain.on as jest.Mock).mockImplementation((channel: string, handler: any) => {
      if (channel === IPC_CHANNELS.EVENT_FROM_RENDERER) {
        ipcHandler = handler;
      }
    });

    registerEventIPCHandlers();
  });

  describe('registration', () => {
    /* Preconditions: IPC handlers not registered
       Action: Call registerEventIPCHandlers()
       Assertions: IPC handler is registered for events from renderer
       Requirements: realtime-events.4.1 */
    it('should register IPC handler for events from renderer', () => {
      expect(ipcMain.on).toHaveBeenCalledWith(
        IPC_CHANNELS.EVENT_FROM_RENDERER,
        expect.any(Function)
      );
    });
  });

  describe('event forwarding', () => {
    /* Preconditions: IPC handler registered
       Action: Receive event from renderer
       Assertions: Event is forwarded to MainEventBus with localOnly option
       Requirements: realtime-events.4.2 */
    it('should forward event to MainEventBus with local option', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = { timestamp: Date.now(), data: { id: 'agent-1', name: 'Test' } };

      ipcHandler(mockEvent, 'agent.created', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('agent.created', payload);
    });

    /* Preconditions: IPC handler registered
       Action: Receive event from renderer with localOnly
       Assertions: Event is not duplicated back to renderer
       Requirements: realtime-events.4.3 */
    it('should not duplicate events from renderer', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        agent: {
          id: 'agent-1',
          name: 'Agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
          status: 'in-progress',
        },
        changedFields: ['name'],
      };

      ipcHandler(mockEvent, 'agent.updated', payload);

      // Verify localOnly is true to prevent sending back to renderer
      expect(mockDeliverFromIPC).toHaveBeenCalledWith('agent.updated', payload);
    });
  });

  describe('error handling', () => {
    /* Preconditions: IPC handler registered
       Action: Receive malformed event (missing type)
       Assertions: Event is ignored, no error thrown
       Requirements: realtime-events.4.4 */
    it('should handle malformed events gracefully - missing type', () => {
      const mockEvent = {} as IpcMainEvent;

      expect(() => {
        ipcHandler(mockEvent, '', { timestamp: Date.now() });
      }).not.toThrow();

      expect(mockDeliverFromIPC).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC handler registered
       Action: Receive malformed event (null type)
       Assertions: Event is ignored, no error thrown
       Requirements: realtime-events.4.4 */
    it('should handle malformed events gracefully - null type', () => {
      const mockEvent = {} as IpcMainEvent;

      expect(() => {
        ipcHandler(mockEvent, null as any, { timestamp: Date.now() });
      }).not.toThrow();

      expect(mockDeliverFromIPC).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC handler registered
       Action: Receive malformed event (missing payload)
       Assertions: Event is ignored, no error thrown
       Requirements: realtime-events.4.4 */
    it('should handle malformed events gracefully - missing payload', () => {
      const mockEvent = {} as IpcMainEvent;

      expect(() => {
        ipcHandler(mockEvent, 'agent.created', null);
      }).not.toThrow();

      expect(mockDeliverFromIPC).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC handler registered
       Action: Receive malformed event (missing timestamp)
       Assertions: Event is ignored, no error thrown
       Requirements: realtime-events.4.4 */
    it('should handle malformed events gracefully - missing timestamp', () => {
      const mockEvent = {} as IpcMainEvent;

      expect(() => {
        ipcHandler(mockEvent, 'agent.created', { data: { id: 'agent-1' } });
      }).not.toThrow();

      expect(mockDeliverFromIPC).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC handler registered, MainEventBus.publish throws
       Action: Receive valid event
       Assertions: Error is caught, no crash
       Requirements: realtime-events.4.4 */
    it('should handle MainEventBus errors gracefully', () => {
      const mockEvent = {} as IpcMainEvent;
      mockDeliverFromIPC.mockImplementationOnce(() => {
        throw new Error('EventBus error');
      });

      expect(() => {
        ipcHandler(mockEvent, 'agent.created', {
          timestamp: Date.now(),
          data: { id: 'agent-1' },
        });
      }).not.toThrow();
    });
  });

  describe('event types', () => {
    /* Preconditions: IPC handler registered
       Action: Receive different event types
       Assertions: All event types are forwarded correctly
       Requirements: realtime-events.4.2 */
    it('should forward agent.created events', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        data: { id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now() },
      };

      ipcHandler(mockEvent, 'agent.created', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('agent.created', payload);
    });

    /* Preconditions: IPC handler registered
       Action: Receive agent.updated event
       Assertions: Event is forwarded correctly
       Requirements: realtime-events.4.2 */
    it('should forward agent.updated events', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        agent: {
          id: 'agent-1',
          name: 'Updated',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
          status: 'awaiting-response',
        },
        changedFields: ['name'],
      };

      ipcHandler(mockEvent, 'agent.updated', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('agent.updated', payload);
    });

    /* Preconditions: IPC handler registered
       Action: Receive agent.archived event
       Assertions: Event is forwarded correctly
       Requirements: realtime-events.4.2, agents.12.3 */
    it('should forward agent.archived events', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        id: 'agent-1',
      };

      ipcHandler(mockEvent, 'agent.archived', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('agent.archived', payload);
    });

    /* Preconditions: IPC handler registered
       Action: Receive user.login event
       Assertions: Event is forwarded correctly
       Requirements: realtime-events.4.2 */
    it('should forward user.login events', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        userId: 'user-123',
      };

      ipcHandler(mockEvent, 'user.login', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('user.login', payload);
    });

    /* Preconditions: IPC handler registered
       Action: Receive message.tool_call event
       Assertions: Event is forwarded correctly
       Requirements: realtime-events.4.2, realtime-events.3.9 */
    it('should forward message.tool_call events', () => {
      const mockEvent = {} as IpcMainEvent;
      const payload = {
        timestamp: Date.now(),
        agentId: 'agent-1',
        llmMessageId: 77,
        callId: 'call-1',
        toolName: 'search_docs',
        arguments: { query: 'status rules' },
      };

      ipcHandler(mockEvent, 'message.tool_call', payload);

      expect(mockDeliverFromIPC).toHaveBeenCalledWith('message.tool_call', payload);
    });
  });
});
