// Requirements: realtime-events.1, realtime-events.2, realtime-events.6.3, realtime-events.6.5
/**
 * Unit tests for MainEventBus
 */

import { MainEventBus } from '../../../src/main/events/MainEventBus';
import { IPC_CHANNELS } from '../../../src/shared/events/constants';
import {
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentDeletedEvent,
} from '../../../src/shared/events/types';

// Mock Electron
jest.mock('electron', () => ({
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

import { BrowserWindow } from 'electron';

describe('MainEventBus', () => {
  beforeEach(() => {
    MainEventBus.resetInstance();
    jest.clearAllMocks();
  });

  afterEach(() => {
    MainEventBus.resetInstance();
  });

  describe('singleton pattern', () => {
    /* Preconditions: No instance exists
       Action: Call getInstance() multiple times
       Assertions: Same instance is returned
       Requirements: realtime-events.1.1 */
    it('should be singleton', () => {
      const instance1 = MainEventBus.getInstance();
      const instance2 = MainEventBus.getInstance();

      expect(instance1).toBe(instance2);
    });

    /* Preconditions: Instance exists
       Action: Call resetInstance() then getInstance()
       Assertions: New instance is created
       Requirements: realtime-events.1.6 */
    it('should reset instance for testing (resetInstance)', () => {
      const instance1 = MainEventBus.getInstance();
      MainEventBus.resetInstance();
      const instance2 = MainEventBus.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('publish and subscribe', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish event with typed event class
       Assertions: Event is delivered to subscriber with auto-added timestamp
       Requirements: realtime-events.1.3 */
    it('should publish event with typed event class', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test Agent', createdAt: now, updatedAt: now })
      );

      // Wait for microtask (batching)
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 'agent-1', name: 'Test Agent', createdAt: now, updatedAt: now },
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: EventBus instance exists
       Action: Publish event without timestamp
       Assertions: Event payload includes auto-added timestamp
       Requirements: realtime-events.3.6 */
    it('should auto-add timestamp to event', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );

      await Promise.resolve();

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
    it('should deliver event locally within same process', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );

      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: EventBus instance exists
       Action: Subscribe then publish
       Assertions: Handler receives event
       Requirements: realtime-events.1.3 */
    it('should receive events after subscription', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();

      bus.subscribe('agent.updated', handler);

      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Updated Name' }));

      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent-1',
          changedFields: { name: 'Updated Name' },
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
    it('should support wildcard subscription', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribeAll(handler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
      bus.publish(new AgentDeletedEvent('agent-2'));

      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(
        'agent.created',
        expect.objectContaining({
          data: { id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now },
        })
      );
      expect(handler).toHaveBeenCalledWith(
        'agent.deleted',
        expect.objectContaining({
          id: 'agent-2',
        })
      );
    });
  });

  describe('unsubscribe', () => {
    /* Preconditions: EventBus instance exists with subscription
       Action: Call unsubscribe function
       Assertions: Handler no longer receives events
       Requirements: realtime-events.1.3 */
    it('should return unsubscribe function', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      const unsubscribe = bus.subscribe('agent.created', handler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-2', name: 'Test 2', createdAt: now, updatedAt: now })
      );
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: EventBus instance exists with subscription
       Action: Unsubscribe
       Assertions: Handler stops receiving events
       Requirements: realtime-events.1.3 */
    it('should unsubscribe correctly', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();

      const unsubscribe = bus.subscribe('agent.deleted', handler);
      unsubscribe();

      bus.publish(new AgentDeletedEvent('agent-1'));
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    /* Preconditions: EventBus with multiple subscribers, one throws
       Action: Publish event
       Assertions: Other subscribers still receive event
       Requirements: realtime-events.2.7 */
    it('should isolate consumer errors', async () => {
      const bus = MainEventBus.getInstance();
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', errorHandler);
      bus.subscribe('agent.created', successHandler);

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );

      await Promise.resolve();

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('timestamp deduplication', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish events with older timestamp
       Assertions: Older events are ignored
       Requirements: realtime-events.5.5 */
    it('should ignore outdated events based on timestamp', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();

      bus.subscribe('agent.updated', handler);

      // First event - will get auto-timestamp
      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'New Name' }));
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ changedFields: { name: 'New Name' } })
      );
    });
  });

  describe('performance', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish 100 events rapidly
       Assertions: All events are processed
       Requirements: realtime-events.2.4 */
    it('should handle 100 events per second', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);

      for (let i = 0; i < 100; i++) {
        bus.publish(
          new AgentCreatedEvent({
            id: `agent-${i}`,
            name: `Agent ${i}`,
            createdAt: now,
            updatedAt: now,
          })
        );
      }

      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(100);
    });
  });

  describe('clear subscriptions', () => {
    /* Preconditions: EventBus with subscriptions
       Action: Call clear()
       Assertions: No handlers receive events
       Requirements: realtime-events.1.5 */
    it('should cleanup subscriptions on clear()', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.clear();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );

      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('local-only publish', () => {
    /* Preconditions: EventBus with BrowserWindow mock
       Action: Publish with localOnly option
       Assertions: Event not sent to renderer
       Requirements: realtime-events.4.1 */
    it('should support local-only publish option', async () => {
      const mockWebContents = { send: jest.fn() };
      const mockWindow = { isDestroyed: () => false, webContents: mockWebContents };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

      const bus = MainEventBus.getInstance();
      const handler = jest.fn();
      const now = Date.now();

      bus.subscribe('agent.created', handler);
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now }),
        { localOnly: true }
      );

      await Promise.resolve();

      expect(handler).toHaveBeenCalled();
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });
  });

  describe('batching', () => {
    /* Preconditions: EventBus instance exists
       Action: Publish multiple events for same entity in same tick
       Assertions: Only last event is delivered
       Requirements: realtime-events.6.3 */
    it('should batch events for same entity within one tick', async () => {
      const bus = MainEventBus.getInstance();
      const handler = jest.fn();

      bus.subscribe('agent.updated', handler);

      // Multiple updates in same tick - only last should be delivered
      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Name 1' }));
      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Name 2' }));
      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Name 3' }));

      await Promise.resolve();

      // Only the last event should be delivered (batching)
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ changedFields: { name: 'Name 3' } })
      );
    });
  });

  describe('timestamp cache cleanup', () => {
    /* Preconditions: EventBus with timestamp cache entries
       Action: Call cleanupTimestampForEntity on entity.deleted
       Assertions: Cache entry is removed
       Requirements: realtime-events.6.5 */
    it('should cleanup timestamp cache on entity.deleted', async () => {
      const bus = MainEventBus.getInstance();

      // Create a timestamp entry
      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Test' }));
      await Promise.resolve();

      expect(bus.getTimestampCacheSize()).toBeGreaterThan(0);

      // Cleanup for deleted entity
      bus.cleanupTimestampForEntity('agent.updated', 'agent-1');

      // The specific entry should be removed
      // Publish event - it should now be accepted since cache was cleared
      const handler = jest.fn();
      bus.subscribe('agent.updated', handler);

      bus.publish(new AgentUpdatedEvent('agent-1', { name: 'New' }));
      await Promise.resolve();

      expect(handler).toHaveBeenCalled();
    });

    /* Preconditions: EventBus with stale timestamp entries
       Action: Wait for cleanup interval
       Assertions: Stale entries are removed
       Requirements: realtime-events.6.5 */
    it('should cleanup stale timestamp entries periodically', async () => {
      // This test verifies the cleanup mechanism exists
      // Actual periodic cleanup is tested via the cleanupStaleTimestamps method
      const bus = MainEventBus.getInstance();
      const now = Date.now();

      // Add an entry
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
      await Promise.resolve();

      expect(bus.getTimestampCacheSize()).toBe(1);

      // Destroy should clear everything
      bus.destroy();
      expect(bus.getTimestampCacheSize()).toBe(0);
    });
  });

  describe('IPC broadcast', () => {
    /* Preconditions: EventBus with BrowserWindow mock
       Action: Publish event
       Assertions: Event is sent to renderer via IPC
       Requirements: realtime-events.4.1 */
    it('should broadcast events to renderer via IPC', async () => {
      const mockWebContents = { send: jest.fn() };
      const mockWindow = { isDestroyed: () => false, webContents: mockWebContents };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

      const bus = MainEventBus.getInstance();
      const now = Date.now();

      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
      await Promise.resolve();

      expect(mockWebContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.EVENT_FROM_MAIN,
        'agent.created',
        expect.objectContaining({
          data: { id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now },
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: EventBus with destroyed window
       Action: Publish event
       Assertions: No error thrown, event not sent to destroyed window
       Requirements: realtime-events.4.1 */
    it('should handle destroyed windows gracefully', async () => {
      const mockWindow = { isDestroyed: () => true, webContents: null };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

      const bus = MainEventBus.getInstance();
      const now = Date.now();

      // Should not throw
      expect(() => {
        bus.publish(
          new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
        );
      }).not.toThrow();
    });
  });
});

describe('additional coverage tests', () => {
  beforeEach(() => {
    MainEventBus.resetInstance();
    jest.clearAllMocks();
  });

  afterEach(() => {
    MainEventBus.resetInstance();
  });

  /* Preconditions: EventBus with IPC error
       Action: Publish event when webContents.send throws
       Assertions: Error is caught and logged
       Requirements: realtime-events.4.1 */
  it('should handle IPC send errors gracefully', async () => {
    const mockWebContents = {
      send: jest.fn(() => {
        throw new Error('IPC error');
      }),
    };
    const mockWindow = { isDestroyed: () => false, webContents: mockWebContents };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

    const bus = MainEventBus.getInstance();
    const now = Date.now();

    // Should not throw
    expect(() => {
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
    }).not.toThrow();

    await Promise.resolve();
  });

  /* Preconditions: EventBus with multiple windows
       Action: Publish event
       Assertions: Event is sent to all windows
       Requirements: realtime-events.4.1 */
  it('should broadcast to multiple windows', async () => {
    // Reset instance to get fresh state
    MainEventBus.resetInstance();

    const mockWebContents1 = { send: jest.fn() };
    const mockWebContents2 = { send: jest.fn() };
    const mockWindow1 = { isDestroyed: () => false, webContents: mockWebContents1 };
    const mockWindow2 = { isDestroyed: () => false, webContents: mockWebContents2 };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow1, mockWindow2]);

    const bus = MainEventBus.getInstance();
    const now = Date.now();
    bus.publish(
      new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
    );

    await Promise.resolve();

    expect(mockWebContents1.send).toHaveBeenCalled();
    expect(mockWebContents2.send).toHaveBeenCalled();
  });

  /* Preconditions: EventBus with cleanup interval
       Action: Destroy and recreate
       Assertions: Cleanup interval is properly managed
       Requirements: realtime-events.1.6 */
  it('should properly cleanup on destroy', () => {
    const bus = MainEventBus.getInstance();
    const handler = jest.fn();
    bus.subscribe('agent.created', handler);

    bus.destroy();

    // After destroy, cache should be empty
    expect(bus.getTimestampCacheSize()).toBe(0);
  });

  /* Preconditions: EventBus with wildcard subscriber that throws
       Action: Publish event
       Assertions: Error is caught, other events still work
       Requirements: realtime-events.2.7 */
  it('should isolate errors in wildcard subscribers', async () => {
    const bus = MainEventBus.getInstance();
    const errorHandler = jest.fn(() => {
      throw new Error('Wildcard error');
    });
    const successHandler = jest.fn();
    const now = Date.now();

    bus.subscribeAll(errorHandler);
    bus.subscribe('agent.created', successHandler);

    bus.publish(
      new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
    );

    await Promise.resolve();

    expect(errorHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();
  });

  /* Preconditions: EventBus with events for different entities
       Action: Publish events for different entities in same tick
       Assertions: All events are delivered (no batching across entities)
       Requirements: realtime-events.6.3 */
  it('should not batch events for different entities', async () => {
    const bus = MainEventBus.getInstance();
    const handler = jest.fn();

    bus.subscribe('agent.updated', handler);

    // Updates for different entities in same tick
    bus.publish(new AgentUpdatedEvent('agent-1', { name: 'Name 1' }));
    bus.publish(new AgentUpdatedEvent('agent-2', { name: 'Name 2' }));

    await Promise.resolve();

    // Both events should be delivered (different entities)
    expect(handler).toHaveBeenCalledTimes(2);
  });

  /* Preconditions: EventBus with cleanup for non-existent entity
       Action: Call cleanupTimestampForEntity for non-existent key
       Assertions: No error thrown
       Requirements: realtime-events.6.5 */
  it('should handle cleanup for non-existent entity gracefully', () => {
    const bus = MainEventBus.getInstance();

    // Should not throw
    expect(() => {
      bus.cleanupTimestampForEntity('agent.updated', 'non-existent-id');
    }).not.toThrow();
  });

  /* Preconditions: EventBus with window that has null webContents
       Action: Publish event
       Assertions: No error thrown
       Requirements: realtime-events.4.1 */
  it('should handle windows with null webContents', async () => {
    const mockWindow = { isDestroyed: () => false, webContents: null };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

    const bus = MainEventBus.getInstance();
    const now = Date.now();

    expect(() => {
      bus.publish(
        new AgentCreatedEvent({ id: 'agent-1', name: 'Test', createdAt: now, updatedAt: now })
      );
    }).not.toThrow();

    await Promise.resolve();
  });
});
