/**
 * @jest-environment node
 */

// Requirements: realtime-events.1, realtime-events.2, realtime-events.4.7
/**
 * Unit tests for RendererEventBus
 */

import { RendererEventBus } from '../../../src/renderer/events/RendererEventBus';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
} from '../../../src/shared/events/types';

// Mock Logger
jest.mock('../../../src/renderer/Logger', () => ({
  Logger: {
    create: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock window.api.events
const mockOnEvent = jest.fn();
const mockSendEvent = jest.fn();
const mockUnsubscribe = jest.fn();

beforeAll(() => {
  (global as any).window = {
    api: {
      events: {
        onEvent: mockOnEvent.mockReturnValue(mockUnsubscribe),
        sendEvent: mockSendEvent,
      },
    },
  };
});

afterAll(() => {
  delete (global as any).window;
});

describe('RendererEventBus', () => {
  beforeEach(() => {
    RendererEventBus.resetInstance();
    jest.clearAllMocks();
    mockOnEvent.mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    RendererEventBus.resetInstance();
  });

  describe('singleton pattern', () => {
    /* Preconditions: No instance exists
       Action: Call getInstance() multiple times
       Assertions: Same instance is returned
       Requirements: realtime-events.1.1 */
    it('should be singleton', () => {
      const instance1 = RendererEventBus.getInstance();
      const instance2 = RendererEventBus.getInstance();

      expect(instance1).toBe(instance2);
    });

    /* Preconditions: Instance exists
       Action: Call resetInstance() then getInstance()
       Assertions: New instance is created
       Requirements: realtime-events.1.6 */
    it('should reset instance for testing (resetInstance)', () => {
      const instance1 = RendererEventBus.getInstance();
      RendererEventBus.resetInstance();
      const instance2 = RendererEventBus.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('publish and subscribe', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish event with typed event class
       Assertions: Event is delivered to subscriber with auto-added timestamp
       Requirements: realtime-events.1.3 */
    it('should publish event with typed event class', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test Agent', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: { id: 'agent-1', name: 'Test Agent', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' },
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: EventBus instance exists
       Action: Publish event without timestamp
       Assertions: Event payload includes auto-added timestamp
       Requirements: realtime-events.3.6 */
    it('should auto-add timestamp to event', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
      // Timestamp should be recent
      const receivedTimestamp = handler.mock.calls[0][0].timestamp;
      expect(receivedTimestamp).toBeGreaterThanOrEqual(now);
      expect(receivedTimestamp).toBeLessThanOrEqual(now + 1000);
    });

    /* Preconditions: EventBus instance exists with subscriber
       Action: Publish event
       Assertions: Event is delivered locally
       Requirements: realtime-events.1.4 */
    it('should deliver event locally within same process', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: EventBus instance exists
       Action: Subscribe then publish
       Assertions: Handler receives event
       Requirements: realtime-events.1.3 */
    it('should receive events after subscription', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();

      bus.subscribe('agent.updated', handler);

      bus.publish(new AgentUpdatedEvent({ id: 'agent-1', name: 'Updated Name', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: null, status: 'new' }));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: expect.objectContaining({
            id: 'agent-1',
            name: 'Updated Name',
          }),
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('wildcard subscription', () => {
    /* Preconditions: EventBus instance exists
       Action: Subscribe with wildcard, publish different events
       Assertions: Handler receives all events
       Requirements: realtime-events.1.3 */
    it('should support wildcard subscription', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribeAll(handler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );
      bus.publish(new AgentArchivedEvent({ id: 'agent-2', name: 'Test', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: Date.now(), status: 'new' }));

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(
        'agent.created',
        expect.objectContaining({
          agent: { id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' },
        })
      );
      expect(handler).toHaveBeenCalledWith(
        'agent.archived',
        expect.objectContaining({
          agent: expect.objectContaining({
            id: 'agent-2',
          }),
        })
      );
    });
  });

  describe('unsubscribe', () => {
    /* Preconditions: EventBus instance exists with subscription
       Action: Call unsubscribe function
       Assertions: Handler no longer receives events
       Requirements: realtime-events.1.3 */
    it('should return unsubscribe function', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      const unsubscribe = bus.subscribe('agent.created', handler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-2', name: 'Test 2', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: EventBus instance exists with subscription
       Action: Unsubscribe
       Assertions: Handler stops receiving events
       Requirements: realtime-events.1.3 */
    it('should unsubscribe correctly', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();

      const unsubscribe = bus.subscribe('agent.archived', handler);
      unsubscribe();

      bus.publish(new AgentArchivedEvent({ id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: Date.now(), status: 'new' }));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    /* Preconditions: EventBus with multiple subscribers, one throws
       Action: Publish event
       Assertions: Other subscribers still receive event
       Requirements: realtime-events.2.7 */
    it('should isolate consumer errors', () => {
      const bus = RendererEventBus.getInstance();
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', errorHandler);
      bus.subscribe('agent.created', successHandler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('timestamp deduplication', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish event
       Assertions: Event is delivered
       Requirements: realtime-events.5.5 */
    it('should deliver events with auto-timestamp', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();

      bus.subscribe('agent.updated', handler);

      bus.publish(new AgentUpdatedEvent({ id: 'agent-1', name: 'New Name', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: null, status: 'new' }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ 
          agent: expect.objectContaining({ name: 'New Name' }) 
        })
      );
    });
  });

  describe('IPC integration', () => {
    /* Preconditions: EventBus instance exists
       Action: Create instance
       Assertions: IPC listener is setup
       Requirements: realtime-events.2.9 */
    it('should setup IPC listener on construction', () => {
      RendererEventBus.getInstance();

      expect(mockOnEvent).toHaveBeenCalled();
    });

    /* Preconditions: EventBus instance exists
       Action: Publish event
       Assertions: Event is sent to main via IPC with auto-added timestamp
       Requirements: realtime-events.4.2 */
    it('should send events to main via IPC', () => {
      const bus = RendererEventBus.getInstance();
      const now = Date.now();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(mockSendEvent).toHaveBeenCalledWith(
        'agent.created',
        expect.objectContaining({
          agent: { id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' },
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: EventBus instance exists
       Action: Destroy instance
       Assertions: IPC listener is cleaned up
       Requirements: realtime-events.4.7 */
    it('should cleanup IPC listeners on destroy', () => {
      const bus = RendererEventBus.getInstance();
      bus.destroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    /* Preconditions: EventBus with localOnly option
       Action: Publish with localOnly
       Assertions: Event not sent to main
       Requirements: realtime-events.4.2 */
    it('should not send to main when localOnly is true', () => {
      const bus = RendererEventBus.getInstance();
      mockSendEvent.mockClear();
      const now = Date.now();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' }),
        { localOnly: true }
      );

      expect(mockSendEvent).not.toHaveBeenCalled();
    });

    /* Preconditions: EventBus receives event from main
       Action: Main sends event via IPC
       Assertions: Event is delivered locally
       Requirements: realtime-events.2.9 */
    it('should receive events from main and deliver locally', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);

      // Simulate receiving event from main (with timestamp already added)
      const ipcCallback = mockOnEvent.mock.calls[0][0];
      const payload = {
        timestamp: now,
        agent: { id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' },
      };

      ipcCallback('agent.created', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  });

  describe('clear subscriptions', () => {
    /* Preconditions: EventBus with subscriptions
       Action: Call clear()
       Assertions: No handlers receive events
       Requirements: realtime-events.1.5 */
    it('should cleanup subscriptions on clear()', () => {
      const bus = RendererEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.clear();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('additional coverage tests', () => {
    /* Preconditions: EventBus with wildcard subscriber that throws
       Action: Publish event
       Assertions: Error is caught
       Requirements: realtime-events.2.7 */
    it('should isolate errors in wildcard subscribers', () => {
      const bus = RendererEventBus.getInstance();
      const errorHandler = jest.fn(() => {
        throw new Error('Wildcard error');
      });
      const successHandler = jest.fn();
      const now = Date.now();

      bus.subscribeAll(errorHandler);
      bus.subscribe('agent.created', successHandler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    /* Preconditions: EventBus with IPC send error
       Action: Publish event when sendEvent throws
       Assertions: Error is caught and logged
       Requirements: realtime-events.4.2 */
    it('should handle IPC send errors gracefully', () => {
      mockSendEvent.mockImplementationOnce(() => {
        throw new Error('IPC error');
      });

      const bus = RendererEventBus.getInstance();
      const now = Date.now();

      expect(() => {
        bus.publish(
          new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
        );
      }).not.toThrow();
    });

    /* Preconditions: EventBus with timestamp cache
       Action: Destroy
       Assertions: Cache is cleared
       Requirements: realtime-events.1.6 */
    it('should clear timestamp cache on destroy', () => {
      const bus = RendererEventBus.getInstance();
      const now = Date.now();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now, archivedAt: null, status: 'new' })
      );

      expect(bus.getTimestampCacheSize()).toBeGreaterThan(0);

      bus.destroy();

      expect(bus.getTimestampCacheSize()).toBe(0);
    });
  });
});
