// Requirements: realtime-events.7.1, realtime-events.7.2, realtime-events.7.3, realtime-events.7.4
/**
 * React hooks for subscribing to events from RendererEventBus
 * Provides automatic cleanup on component unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import { RendererEventBus } from './RendererEventBus';
import {
  EventType,
  EventPayload,
  EventHandler,
  WildcardEventHandler,
} from '../../shared/events/types';

/**
 * Hook for subscribing to a single event type
 * Automatically unsubscribes when component unmounts
 * Requirements: realtime-events.7.1, realtime-events.7.2
 *
 * @param eventType - The event type to subscribe to
 * @param callback - Handler function called when event is received
 */
export function useEventSubscription<T extends EventType>(
  eventType: T,
  callback: EventHandler<T>
): void {
  // Use ref to avoid resubscribing when callback changes
  // Requirements: realtime-events.7.5
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();

    const handler: EventHandler<T> = (payload: EventPayload<T>) => {
      callbackRef.current(payload);
    };

    const unsubscribe = eventBus.subscribe(eventType, handler);

    // Cleanup on unmount
    // Requirements: realtime-events.7.2
    return unsubscribe;
  }, [eventType]);
}

/**
 * Hook for subscribing to multiple event types
 * Automatically unsubscribes when component unmounts
 * Requirements: realtime-events.7.3
 *
 * @param eventTypes - Array of event types to subscribe to
 * @param callback - Handler function called when any of the events is received
 */
export function useEventSubscriptionMultiple(
  eventTypes: EventType[],
  callback: WildcardEventHandler
): void {
  // Use ref to avoid resubscribing when callback changes
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Memoize event types array to avoid unnecessary resubscriptions
  const eventTypesKey = eventTypes.join(',');

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();
    const unsubscribes: (() => void)[] = [];

    for (const eventType of eventTypes) {
      const handler = (payload: EventPayload<typeof eventType>) => {
        callbackRef.current(eventType, payload);
      };
      unsubscribes.push(eventBus.subscribe(eventType, handler));
    }

    // Cleanup all subscriptions on unmount
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypesKey]);
}

/**
 * Hook for subscribing to all events (wildcard)
 * Automatically unsubscribes when component unmounts
 * Requirements: realtime-events.7.4
 *
 * @param callback - Handler function called when any event is received
 */
export function useEventSubscriptionAll(callback: WildcardEventHandler): void {
  // Use ref to avoid resubscribing when callback changes
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();

    const handler: WildcardEventHandler = (type, payload) => {
      callbackRef.current(type, payload);
    };

    const unsubscribe = eventBus.subscribeAll(handler);

    // Cleanup on unmount
    return unsubscribe;
  }, []);
}

/**
 * Hook for publishing events
 * Returns a memoized publish function
 *
 * @returns publish function
 */
export function useEventPublish() {
  return useCallback(<T extends EventType>(type: T, payload: EventPayload<T>) => {
    const eventBus = RendererEventBus.getInstance();
    eventBus.publish(type, payload);
  }, []);
}
