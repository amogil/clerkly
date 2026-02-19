// Requirements: realtime-events.1.3, clerkly.3
/**
 * EventLogger - Centralized event logging via EventBus subscription
 * Subscribes to all events and logs them automatically
 */

import { MainEventBus } from './MainEventBus';
import { Logger } from '../Logger';
import { EventType, ClerklyEvents, BaseEvent, getEntityId } from '../../shared/events/types';
import { Unsubscribe } from '../../shared/events/types';

/**
 * EventLogger - Singleton that subscribes to all events and logs them
 * Requirements: realtime-events.1.3, clerkly.3
 */
export class EventLogger {
  private static instance: EventLogger | null = null;
  private logger: Logger;
  private unsubscribe: Unsubscribe | null = null;

  private constructor() {
    this.logger = Logger.create('EventLogger');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EventLogger {
    if (!EventLogger.instance) {
      EventLogger.instance = new EventLogger();
    }
    return EventLogger.instance;
  }

  /**
   * Reset instance for testing
   */
  public static resetInstance(): void {
    if (EventLogger.instance) {
      EventLogger.instance.stop();
      EventLogger.instance = null;
    }
  }

  /**
   * Start listening to all events
   */
  public start(): void {
    if (this.unsubscribe) {
      this.logger.debug('EventLogger already started');
      return;
    }

    const eventBus = MainEventBus.getInstance();
    this.unsubscribe = eventBus.subscribeAll(this.handleEvent.bind(this));
    this.logger.info('EventLogger started');
  }

  /**
   * Stop listening to events
   */
  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      this.logger.info('EventLogger stopped');
    }
  }

  /**
   * Handle incoming event and log it
   */
  private handleEvent<T extends EventType>(type: T, payload: ClerklyEvents[T]): void {
    const logMessage = this.formatEventLog(type, payload);
    this.logger.info(logMessage);
  }

  /**
   * Format event for logging - generic approach extracting key fields from payload
   */
  private formatEventLog<T extends EventType>(type: T, payload: ClerklyEvents[T]): string {
    const details: string[] = [];

    // Extract entity id if available
    const entityId = getEntityId(payload as BaseEvent & { id?: string; data?: { id?: string } });
    if (entityId) {
      details.push(`id: ${entityId}`);
    }

    // Extract common fields from payload
    const p = payload as unknown as Record<string, unknown>;
    if ('userId' in p && p.userId) {
      details.push(`userId: ${p.userId}`);
    }
    if ('email' in p && p.email) {
      details.push(`email: ${p.email}`);
    }
    if ('user' in p && typeof p.user === 'object' && p.user && 'email' in (p.user as object)) {
      details.push(`email: ${(p.user as { email: string }).email}`);
    }
    if ('error' in p && p.error) {
      details.push(`error: ${p.error}`);
    }
    if ('errorCode' in p && p.errorCode) {
      details.push(`code: ${p.errorCode}`);
    }
    if ('context' in p && p.context) {
      details.push(`context: ${p.context}`);
    }
    if ('message' in p && p.message && !('error' in p)) {
      details.push(`message: ${p.message}`);
    }

    if (details.length > 0) {
      return `Event: ${type} (${details.join(', ')})`;
    }
    return `Event: ${type}`;
  }
}
