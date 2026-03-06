// Requirements: realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6
/**
 * Main process EventBus implementation using mitt
 * Singleton pattern with IPC broadcast to renderer processes
 */

import mitt, { Emitter } from 'mitt';
import { BrowserWindow } from 'electron';
import {
  ClerklyEvents,
  EventType,
  EventPayload,
  EventPayloadWithoutTimestamp,
  EventHandler,
  WildcardEventHandler,
  Unsubscribe,
  PublishOptions,
  BaseEvent,
  getEventKey,
  TypedEventClass,
} from '../../shared/events/types';
import { IPC_CHANNELS, EVENT_CONFIG, EVENT_TYPES } from '../../shared/events/constants';
import { Logger } from '../Logger';

// Internal event map type for mitt
type MittEvents = {
  [K in EventType]: ClerklyEvents[K];
} & {
  '*': { type: EventType; payload: ClerklyEvents[EventType] };
};

/**
 * MainEventBus - Singleton event bus for main process
 * Requirements: realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6
 */
export class MainEventBus {
  private static instance: MainEventBus | null = null;
  private emitter: Emitter<MittEvents>;
  private logger: Logger;
  private lastEventTimestamps: Map<string, number> = new Map();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private pendingBatch: Map<
    string,
    { type: EventType; payload: BaseEvent; options?: PublishOptions }
  > = new Map();
  private batchScheduled = false;
  private nonCoalescedSequence = 0;

  private constructor() {
    this.emitter = mitt<MittEvents>();
    this.logger = Logger.create('MainEventBus');
    this.startTimestampCleanup();
  }

  /**
   * Get singleton instance
   * Requirements: realtime-events.1.1
   */
  public static getInstance(): MainEventBus {
    if (!MainEventBus.instance) {
      MainEventBus.instance = new MainEventBus();
    }
    return MainEventBus.instance;
  }

  /**
   * Reset instance for testing
   * Requirements: realtime-events.1.6
   */
  public static resetInstance(): void {
    if (MainEventBus.instance) {
      MainEventBus.instance.destroy();
      MainEventBus.instance = null;
    }
  }

  /**
   * Publish an event (timestamp is added automatically)
   * Only accepts TypedEventClass instances
   * Requirements: realtime-events.1.3, realtime-events.5.5, realtime-events.6.3
   *
   * @example
   * eventBus.publish(new AuthSucceededEvent('user-123'));
   * eventBus.publish(new ProfileSyncedEvent({ id: '1', email: 'test@example.com' }));
   */
  public publish<T extends EventType>(event: TypedEventClass<T>, options?: PublishOptions): void {
    const type = event.type as T;
    const eventPayload = event.toPayload() as EventPayloadWithoutTimestamp<T>;

    // Add timestamp automatically
    const payloadWithTimestamp = {
      ...eventPayload,
      timestamp: Date.now(),
    } as EventPayload<T>;

    const eventKey = this.getBatchKey(type, payloadWithTimestamp);

    // Add to batch for same-tick batching
    // Requirements: realtime-events.6.3
    this.pendingBatch.set(eventKey, { type, payload: payloadWithTimestamp, options });

    if (!this.batchScheduled) {
      this.batchScheduled = true;
      queueMicrotask(() => this.flushBatch());
    }
  }

  /**
   * Deliver event received from renderer via IPC
   * Used when receiving events that already have timestamp
   * Delivers locally only (no broadcast back to renderer)
   * Requirements: realtime-events.4.3
   */
  public deliverFromIPC<T extends EventType>(type: T, payload: EventPayload<T>): void {
    const eventKey = this.getBatchKey(type, payload);

    // Add to batch for same-tick batching, always localOnly
    this.pendingBatch.set(eventKey, { type, payload, options: { localOnly: true } });

    if (!this.batchScheduled) {
      this.batchScheduled = true;
      queueMicrotask(() => this.flushBatch());
    }
  }

  /**
   * Flush pending batch of events
   * Requirements: realtime-events.6.3
   */
  private flushBatch(): void {
    this.batchScheduled = false;
    const batch = new Map(this.pendingBatch);
    this.pendingBatch.clear();

    for (const [eventKey, { type, payload, options }] of batch) {
      this.deliverEvent(type as EventType, payload, eventKey, options);
    }
  }

  // Requirements: realtime-events.6.3, llm-integration.2
  private getBatchKey<T extends EventType>(type: T, payload: EventPayload<T>): string {
    const baseKey = getEventKey(type, payload);
    if (
      type === EVENT_TYPES.MESSAGE_UPDATED ||
      type === EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED
    ) {
      this.nonCoalescedSequence += 1;
      return `${baseKey}:seq:${this.nonCoalescedSequence}`;
    }
    return baseKey;
  }

  /**
   * Deliver a single event after batching
   * Requirements: realtime-events.5.5, realtime-events.2.7
   */
  private deliverEvent<T extends EventType>(
    type: T,
    payload: EventPayload<T>,
    eventKey: string,
    options?: PublishOptions
  ): void {
    // Timestamp-based deduplication
    // Requirements: realtime-events.5.5
    const lastTimestamp = this.lastEventTimestamps.get(eventKey);
    if (lastTimestamp !== undefined && payload.timestamp <= lastTimestamp) {
      this.logger.debug(
        `Ignoring outdated event: ${type} (${payload.timestamp} <= ${lastTimestamp})`
      );
      return;
    }
    this.lastEventTimestamps.set(eventKey, payload.timestamp);

    this.logger.debug(`Publishing event: ${type}`);

    // Emit locally with error isolation
    // Requirements: realtime-events.2.7
    try {
      this.emitter.emit(type, payload as MittEvents[T]);
    } catch (error) {
      this.logger.error(`Error in event handler for ${type}: ${error}`);
    }

    // Broadcast to renderer processes unless localOnly
    // Requirements: realtime-events.4.1
    if (!options?.localOnly) {
      this.broadcastToRenderer(type, payload);
    }
  }

  /**
   * Broadcast event to all renderer processes
   * Requirements: realtime-events.4.1
   */
  private broadcastToRenderer<T extends EventType>(type: T, payload: EventPayload<T>): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        try {
          win.webContents.send(IPC_CHANNELS.EVENT_FROM_MAIN, type, payload);
        } catch (error) {
          this.logger.error(`Error broadcasting to window: ${error}`);
        }
      }
    }
  }

  /**
   * Subscribe to a specific event type
   * Requirements: realtime-events.1.3, realtime-events.2.7
   */
  public subscribe<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    // Wrap handler with error isolation
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

    // Use mitt's wildcard handler
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
   * Cleanup timestamp cache entry for deleted entity
   * Requirements: realtime-events.6.5
   */
  public cleanupTimestampForEntity(type: EventType, entityId: string): void {
    const key = `${type}:${entityId}`;
    if (this.lastEventTimestamps.has(key)) {
      this.lastEventTimestamps.delete(key);
      this.logger.debug(`Cleaned up timestamp cache for: ${key}`);
    }
  }

  /**
   * Start periodic cleanup of stale timestamp entries
   * Requirements: realtime-events.6.5
   */
  private startTimestampCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleTimestamps();
    }, EVENT_CONFIG.TIMESTAMP_CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * Remove stale timestamp entries (older than TTL)
   * Requirements: realtime-events.6.5
   */
  private cleanupStaleTimestamps(): void {
    const now = Date.now();
    const staleThreshold = now - EVENT_CONFIG.TIMESTAMP_TTL_MS;
    let cleanedCount = 0;

    for (const [key, timestamp] of this.lastEventTimestamps) {
      if (timestamp < staleThreshold) {
        this.lastEventTimestamps.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} stale timestamp entries`);
    }
  }

  /**
   * Destroy the event bus and cleanup resources
   * Requirements: realtime-events.1.6
   */
  public destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.clear();
    this.lastEventTimestamps.clear();
    this.pendingBatch.clear();
    this.logger.debug('MainEventBus destroyed');
  }

  /**
   * Get timestamp cache size (for testing)
   */
  public getTimestampCacheSize(): number {
    return this.lastEventTimestamps.size;
  }
}
