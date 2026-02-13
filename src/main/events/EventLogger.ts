// Requirements: realtime-events.1.3, clerkly.3
/**
 * EventLogger - Centralized event logging via EventBus subscription
 * Subscribes to all events and logs them automatically
 */

import { MainEventBus } from './MainEventBus';
import { Logger } from '../Logger';
import { EventType, ClerklyEvents } from '../../shared/events/types';
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
   * Format event for logging
   */
  private formatEventLog<T extends EventType>(type: T, payload: ClerklyEvents[T]): string {
    // Extract relevant info based on event type
    switch (type) {
      case 'auth.succeeded':
        return `Event: ${type} (userId: ${(payload as ClerklyEvents['auth.succeeded']).userId})`;
      case 'auth.failed':
        return `Event: ${type} (error: ${(payload as ClerklyEvents['auth.failed']).error}, code: ${(payload as ClerklyEvents['auth.failed']).errorCode || 'none'})`;
      case 'profile.synced':
        return `Event: ${type} (email: ${(payload as ClerklyEvents['profile.synced']).profile.email})`;
      case 'error.created':
        return `Event: ${type} (context: ${(payload as ClerklyEvents['error.created']).context}, message: ${(payload as ClerklyEvents['error.created']).message})`;
      case 'user.login':
        return `Event: ${type} (userId: ${(payload as ClerklyEvents['user.login']).userId})`;
      case 'user.logout':
        return `Event: ${type}`;
      case 'agent.created':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['agent.created']).data.id})`;
      case 'agent.updated':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['agent.updated']).id})`;
      case 'agent.deleted':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['agent.deleted']).id})`;
      case 'message.created':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['message.created']).data.id})`;
      case 'message.updated':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['message.updated']).id})`;
      case 'user.profile.updated':
        return `Event: ${type} (id: ${(payload as ClerklyEvents['user.profile.updated']).id})`;
      default:
        return `Event: ${type}`;
    }
  }
}
