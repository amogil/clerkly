/**
 * @jest-environment jsdom
 */
// Requirements: realtime-events.7
/**
 * Unit tests for useEventSubscription hooks
 */

import { renderHook, act } from '@testing-library/react';
import {
  useEventSubscription,
  useEventSubscriptionMultiple,
  useEventSubscriptionAll,
  useEventPublish,
} from '../../../src/renderer/events/useEventSubscription';
import { RendererEventBus } from '../../../src/renderer/events/RendererEventBus';
import { AgentCreatedEvent, AgentCreatedPayload } from '../../../src/shared/events/types';

// Mock RendererEventBus
jest.mock('../../../src/renderer/events/RendererEventBus', () => {
  const mockSubscribe = jest.fn();
  const mockSubscribeAll = jest.fn();
  const mockPublish = jest.fn();

  return {
    RendererEventBus: {
      getInstance: jest.fn(() => ({
        subscribe: mockSubscribe,
        subscribeAll: mockSubscribeAll,
        publish: mockPublish,
      })),
    },
  };
});

describe('useEventSubscription hooks', () => {
  let mockSubscribe: jest.Mock;
  let mockSubscribeAll: jest.Mock;
  let mockPublish: jest.Mock;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    const instance = RendererEventBus.getInstance();
    mockSubscribe = instance.subscribe as jest.Mock;
    mockSubscribeAll = instance.subscribeAll as jest.Mock;
    mockPublish = instance.publish as jest.Mock;
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockSubscribeAll.mockReturnValue(mockUnsubscribe);
  });

  describe('useEventSubscription', () => {
    /* Preconditions: Component mounts
       Action: Use useEventSubscription hook
       Assertions: subscribe is called with event type
       Requirements: realtime-events.7.1 */
    it('should subscribe to event on mount', () => {
      const callback = jest.fn();

      renderHook(() => useEventSubscription('agent.created', callback));

      expect(mockSubscribe).toHaveBeenCalledWith('agent.created', expect.any(Function));
    });

    /* Preconditions: Component is mounted
       Action: Component unmounts
       Assertions: unsubscribe is called
       Requirements: realtime-events.7.2 */
    it('should unsubscribe on component unmount', () => {
      const callback = jest.fn();

      const { unmount } = renderHook(() => useEventSubscription('agent.created', callback));

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    /* Preconditions: Component is mounted
       Action: Event is received
       Assertions: callback is called with event data
       Requirements: realtime-events.7.1 */
    it('should call callback with correct event data', () => {
      const callback = jest.fn();
      let capturedHandler: (payload: AgentCreatedPayload) => void;

      mockSubscribe.mockImplementation((type, handler) => {
        capturedHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useEventSubscription('agent.created', callback));

      const payload: AgentCreatedPayload = {
        timestamp: Date.now(),
        data: { id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now() },
      };

      act(() => {
        capturedHandler(payload);
      });

      expect(callback).toHaveBeenCalledWith(payload);
    });

    /* Preconditions: Component is mounted with callback
       Action: Callback reference changes
       Assertions: Does not resubscribe
       Requirements: realtime-events.7.5 */
    it('should not resubscribe when callback changes (useRef)', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const { rerender } = renderHook(({ cb }) => useEventSubscription('agent.created', cb), {
        initialProps: { cb: callback1 },
      });

      expect(mockSubscribe).toHaveBeenCalledTimes(1);

      rerender({ cb: callback2 });

      // Should not resubscribe
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: React Strict Mode enabled
       Action: Component mounts (double mount/unmount)
       Assertions: Handles correctly without errors
       Requirements: realtime-events.7.6 */
    it('should handle React Strict Mode (double mount/unmount)', () => {
      const callback = jest.fn();

      // Simulate Strict Mode behavior
      const { unmount } = renderHook(() => useEventSubscription('agent.created', callback));

      // First mount
      expect(mockSubscribe).toHaveBeenCalledTimes(1);

      // Unmount and remount (Strict Mode behavior)
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

      // Remount
      renderHook(() => useEventSubscription('agent.created', callback));
      expect(mockSubscribe).toHaveBeenCalledTimes(2);
    });

    /* Preconditions: Component is mounted
       Action: Callback throws error
       Assertions: Error is handled gracefully
       Requirements: realtime-events.7.1 */
    it('should handle errors in callback gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      let capturedHandler: (payload: AgentCreatedPayload) => void;

      mockSubscribe.mockImplementation((type, handler) => {
        capturedHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useEventSubscription('agent.created', errorCallback));

      const payload: AgentCreatedPayload = {
        timestamp: Date.now(),
        data: { id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now() },
      };

      // Should not throw
      expect(() => {
        act(() => {
          capturedHandler(payload);
        });
      }).toThrow('Callback error');

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('useEventSubscriptionMultiple', () => {
    /* Preconditions: Component mounts
       Action: Use useEventSubscriptionMultiple hook
       Assertions: subscribe is called for each event type
       Requirements: realtime-events.7.3 */
    it('should support multiple event types', () => {
      const callback = jest.fn();

      renderHook(() => useEventSubscriptionMultiple(['agent.created', 'agent.deleted'], callback));

      expect(mockSubscribe).toHaveBeenCalledTimes(2);
      expect(mockSubscribe).toHaveBeenCalledWith('agent.created', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('agent.deleted', expect.any(Function));
    });

    /* Preconditions: Component is mounted with multiple subscriptions
       Action: Component unmounts
       Assertions: All subscriptions are cleaned up
       Requirements: realtime-events.7.3 */
    it('should unsubscribe all on unmount', () => {
      const callback = jest.fn();
      const unsubscribe1 = jest.fn();
      const unsubscribe2 = jest.fn();

      mockSubscribe.mockReturnValueOnce(unsubscribe1).mockReturnValueOnce(unsubscribe2);

      const { unmount } = renderHook(() =>
        useEventSubscriptionMultiple(['agent.created', 'agent.deleted'], callback)
      );

      unmount();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
    });

    /* Preconditions: Component is mounted
       Action: Event is received
       Assertions: callback is called with type and payload
       Requirements: realtime-events.7.3 */
    it('should call callback with type and payload', () => {
      const callback = jest.fn();
      let capturedHandler: (payload: AgentCreatedPayload) => void;

      mockSubscribe.mockImplementation((type, handler) => {
        if (type === 'agent.created') {
          capturedHandler = handler;
        }
        return mockUnsubscribe;
      });

      renderHook(() => useEventSubscriptionMultiple(['agent.created', 'agent.deleted'], callback));

      const payload: AgentCreatedPayload = {
        timestamp: Date.now(),
        data: { id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now() },
      };

      act(() => {
        capturedHandler(payload);
      });

      expect(callback).toHaveBeenCalledWith('agent.created', payload);
    });
  });

  describe('useEventSubscriptionAll', () => {
    /* Preconditions: Component mounts
       Action: Use useEventSubscriptionAll hook
       Assertions: subscribeAll is called
       Requirements: realtime-events.7.4 */
    it('should support wildcard subscription', () => {
      const callback = jest.fn();

      renderHook(() => useEventSubscriptionAll(callback));

      expect(mockSubscribeAll).toHaveBeenCalledWith(expect.any(Function));
    });

    /* Preconditions: Component is mounted
       Action: Component unmounts
       Assertions: unsubscribe is called
       Requirements: realtime-events.7.4 */
    it('should unsubscribe on unmount', () => {
      const callback = jest.fn();

      const { unmount } = renderHook(() => useEventSubscriptionAll(callback));

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    /* Preconditions: Component is mounted
       Action: Any event is received
       Assertions: callback is called with type and payload
       Requirements: realtime-events.7.4 */
    it('should call callback with type and payload', () => {
      const callback = jest.fn();
      let capturedHandler: (type: string, payload: unknown) => void;

      mockSubscribeAll.mockImplementation((handler) => {
        capturedHandler = handler;
        return mockUnsubscribe;
      });

      renderHook(() => useEventSubscriptionAll(callback));

      const payload: AgentCreatedPayload = {
        timestamp: Date.now(),
        data: { id: 'agent-1', name: 'Test', createdAt: Date.now(), updatedAt: Date.now() },
      };

      act(() => {
        capturedHandler('agent.created', payload);
      });

      expect(callback).toHaveBeenCalledWith('agent.created', payload);
    });
  });

  describe('useEventPublish', () => {
    /* Preconditions: Component mounts
       Action: Use useEventPublish hook
       Assertions: Returns a publish function
       Requirements: realtime-events.7 */
    it('should return a publish function', () => {
      const { result } = renderHook(() => useEventPublish());

      expect(typeof result.current).toBe('function');
    });

    /* Preconditions: Component is mounted
       Action: Call publish function with typed event
       Assertions: EventBus.publish is called with the event
       Requirements: realtime-events.7 */
    it('should call EventBus.publish when invoked with typed event', () => {
      const { result } = renderHook(() => useEventPublish());

      const event = new AgentCreatedEvent({
        id: 'agent-1',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      act(() => {
        result.current(event);
      });

      expect(mockPublish).toHaveBeenCalledWith(event);
    });

    /* Preconditions: Component is mounted
       Action: Rerender component
       Assertions: Same function reference is returned
       Requirements: realtime-events.7 */
    it('should return memoized function', () => {
      const { result, rerender } = renderHook(() => useEventPublish());

      const firstRef = result.current;

      rerender();

      expect(result.current).toBe(firstRef);
    });
  });
});
