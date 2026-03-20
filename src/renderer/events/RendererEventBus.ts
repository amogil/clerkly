// Requirements: realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6
/**
 * Renderer process EventBus implementation using mitt
 * Singleton pattern with IPC communication to main process
 */

import mitt, { Emitter } from 'mitt';
import {
  ClerklyEvents,
  EventType,
  EventPayload,
  EventHandler,
  WildcardEventHandler,
  Unsubscribe,
  PublishOptions,
  getEventKey,
  TypedEventClass,
} from '../../shared/events/types';
import { Logger } from '../Logger';
import { EVENT_TYPES } from '../../shared/events/constants';

// Internal event map type for mitt
type MittEvents = {
  [K in EventType]: ClerklyEvents[K];
} & {
  '*': { type: EventType; payload: ClerklyEvents[EventType] };
};

/**
 * RendererEventBus - Singleton event bus for renderer process
 * Requirements: realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6
 */
export class RendererEventBus {
  private static instance: RendererEventBus | null = null;
  private emitter: Emitter<MittEvents>;
  private logger: Logger;
  private lastEventTimestamps: Map<string, number> = new Map();
  private ipcUnsubscribe: (() => void) | null = null;

  private constructor() {
    this.emitter = mitt<MittEvents>();
    this.logger = Logger.create('RendererEventBus');
    this.setupIPCListener();
  }

  /**
   * Get singleton instance
   * Requirements: realtime-events.1.1
   */
  public static getInstance(): RendererEventBus {
    if (!RendererEventBus.instance) {
      RendererEventBus.instance = new RendererEventBus();
    }
    return RendererEventBus.instance;
  }

  /**
   * Reset instance for testing
   * Requirements: realtime-events.1.6
   */
  public static resetInstance(): void {
    if (RendererEventBus.instance) {
      RendererEventBus.instance.destroy();
      RendererEventBus.instance = null;
    }
  }

  /**
   * Setup IPC listener for events from main process
   * Requirements: realtime-events.2.9
   */
  private setupIPCListener(): void {
    if (typeof window !== 'undefined' && window.api?.events?.onEvent) {
      this.ipcUnsubscribe = window.api.events.onEvent((type: string, payload: unknown) => {
        this.logger.debug(`Received event from main: ${type}`);
        // Deliver locally without sending back to main
        this.deliverLocally(type as EventType, payload as ClerklyEvents[EventType]);
      });
      this.logger.debug('IPC listener setup complete');
    }
  }

  private isNonCoalescedStreamingType(type: EventType): boolean {
    return (
      type === EVENT_TYPES.MESSAGE_UPDATED ||
      type === EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED ||
      type === EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED
    );
  }

  /**
   * Publish an event (timestamp is added automatically)
   * Only accepts TypedEventClass instances
   * Requirements: realtime-events.1.3, realtime-events.4.2
   *
   * @example
   * eventBus.publish(new AuthSucceededEvent('user-123'));
   * eventBus.publish(new ProfileSyncedEvent({ id: '1', email: 'test@example.com' }));
   */
  public publish<T extends EventType>(event: TypedEventClass<T>, options?: PublishOptions): void {
    const type = event.type as T;
    const eventPayload = event.toPayload();

    // Add timestamp automatically
    const payloadWithTimestamp = {
      ...eventPayload,
      timestamp: Date.now(),
    } as EventPayload<T>;

    const eventKey = getEventKey(type, payloadWithTimestamp);

    // Timestamp-based deduplication
    // Requirements: realtime-events.5.5
    const lastTimestamp = this.lastEventTimestamps.get(eventKey);
    const isOutdated =
      lastTimestamp !== undefined &&
      (this.isNonCoalescedStreamingType(type)
        ? payloadWithTimestamp.timestamp < lastTimestamp
        : payloadWithTimestamp.timestamp <= lastTimestamp);
    if (isOutdated) {
      this.logger.debug(
        `Ignoring outdated event: ${type} (${payloadWithTimestamp.timestamp} <= ${lastTimestamp})`
      );
      return;
    }
    this.lastEventTimestamps.set(eventKey, payloadWithTimestamp.timestamp);

    this.logger.debug(`Publishing event: ${type}`);

    // Emit locally with error isolation
    this.deliverLocally(type, payloadWithTimestamp);

    // Send to main process unless localOnly
    // Requirements: realtime-events.4.2
    if (!options?.localOnly) {
      this.sendToMain(type, payloadWithTimestamp);
    }
  }

  /**
   * Deliver event locally without IPC
   * Requirements: realtime-events.2.7
   */
  private deliverLocally<T extends EventType>(type: T, payload: EventPayload<T>): void {
    try {
      this.emitter.emit(type, payload as MittEvents[T]);
    } catch (error) {
      this.logger.error(`Error in event handler for ${type}: ${error}`);
    }
  }

  /**
   * Send event to main process via IPC
   * Requirements: realtime-events.4.2
   */
  private sendToMain<T extends EventType>(type: T, payload: EventPayload<T>): void {
    if (typeof window !== 'undefined' && window.api?.events?.sendEvent) {
      try {
        window.api.events.sendEvent(type, payload);
        this.logger.debug(`Sent event to main: ${type}`);
      } catch (error) {
        this.logger.error(`Error sending event to main: ${error}`);
      }
    }
  }

  /**
   * Subscribe to a specific event type
   * Requirements: realtime-events.1.3, realtime-events.2.7
   */
  public subscribe<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    const wrappedHandler = (payload: ClerklyEvents[T]) => {
      try {
        handler(payload);
      } catch (error) {
        this.logger.error(`Error in subscriber for ${type}: ${error}`);
      }
    };

    this.emitter.on(
      type,
      wrappedHandler as MittEvents[T] extends ClerklyEvents[T] ? typeof wrappedHandler : never
    );
    this.logger.debug(`Subscribed to event: ${type}`);

    return () => {
      this.emitter.off(
        type,
        wrappedHandler as MittEvents[T] extends ClerklyEvents[T] ? typeof wrappedHandler : never
      );
      this.logger.debug(`Unsubscribed from event: ${type}`);
    };
  }

  /**
   * Subscribe to all events (wildcard)
   * Requirements: realtime-events.1.3
   */
  public subscribeAll(handler: WildcardEventHandler): Unsubscribe {
    const wrappedHandler = (type: EventType, payload: ClerklyEvents[EventType]) => {
      try {
        handler(type, payload);
      } catch (error) {
        this.logger.error(`Error in wildcard subscriber: ${error}`);
      }
    };

    this.emitter.on(
      '*',
      wrappedHandler as (type: keyof MittEvents, event: MittEvents[keyof MittEvents]) => void
    );
    this.logger.debug('Subscribed to all events (wildcard)');

    return () => {
      this.emitter.off(
        '*',
        wrappedHandler as (type: keyof MittEvents, event: MittEvents[keyof MittEvents]) => void
      );
      this.logger.debug('Unsubscribed from all events (wildcard)');
    };
  }

  /**
   * Clear all subscriptions
   * Requirements: realtime-events.1.5
   */
  public clear(): void {
    this.emitter.all.clear();
    this.logger.debug('Cleared all subscriptions');
  }

  /**
   * Destroy the event bus and cleanup resources
   * Requirements: realtime-events.1.6, realtime-events.4.7
   */
  public destroy(): void {
    // Cleanup IPC listener
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
      this.logger.debug('IPC listener cleaned up');
    }
    this.clear();
    this.lastEventTimestamps.clear();
    this.logger.debug('RendererEventBus destroyed');
  }

  /**
   * Get timestamp cache size (for testing)
   */
  public getTimestampCacheSize(): number {
    return this.lastEventTimestamps.size;
  }
}
