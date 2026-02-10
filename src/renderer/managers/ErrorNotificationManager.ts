// Requirements: ui.7.1, ui.7.2, ui.7.3
import type { ErrorNotification } from '../types/error-notification';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * ErrorNotificationManager manages error notifications in the application
 *
 * This class provides a centralized way to show, dismiss, and track error notifications.
 * It implements a pub-sub pattern for UI components to subscribe to notification changes.
 *
 * Features:
 * - Show error notifications with message and context
 * - Auto-dismiss notifications after 15 seconds
 * - Manual dismissal of notifications
 * - Subscribe to notification changes for reactive UI updates
 *
 * Requirements: ui.7.1, ui.7.2, ui.7.3
 * Properties: 20, 21, 22
 *
 * @example
 * ```typescript
 * const manager = new ErrorNotificationManager();
 *
 * // Show a notification
 * const id = manager.showNotification(
 *   'Failed to load user profile',
 *   'Loading profile data'
 * );
 *
 * // Subscribe to changes
 * const unsubscribe = manager.subscribe((notifications) => {
 *   this.logger.info(`Active notifications: ${notifications}`);
 * });
 *
 * // Manually dismiss
 * manager.dismissNotification(id);
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export class ErrorNotificationManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('ErrorNotificationManager');
  private notifications: ErrorNotification[] = [];
  private listeners: ((notifications: ErrorNotification[]) => void)[] = [];
  private readonly AUTO_DISMISS_DELAY = 15000; // 15 seconds

  /**
   * Show an error notification
   *
   * Creates a new error notification and adds it to the active notifications list.
   * The notification will automatically dismiss after 15 seconds.
   *
   * Requirements: ui.7.1, ui.7.2
   * Property: 20, 21
   *
   * @param message - Brief description of the problem
   * @param context - Context of the operation that failed
   * @returns The unique ID of the created notification
   *
   * @example
   * ```typescript
   * manager.showNotification(
   *   'Network connection error',
   *   'Syncing calendar events'
   * );
   * ```
   */
  showNotification(message: string, context: string): string {
    // Requirements: ui.7.2 - Notification must contain message and context
    const notification: ErrorNotification = {
      id: `error-${Date.now()}-${Math.random()}`,
      message,
      context,
      timestamp: Date.now(),
    };

    // Requirements: ui.7.1 - Show notification to user
    this.notifications.push(notification);
    this.notifyListeners();

    // Requirements: ui.7.3 - Auto-dismiss after 15 seconds
    // Property: 22
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, this.AUTO_DISMISS_DELAY);

    // Requirements: ui.7.4 - Log errors for debugging
    Logger.info(
      'ErrorNotificationManager',
      `[ErrorNotificationManager] Notification shown: ${notification}`
    );

    return notification.id;
  }

  /**
   * Dismiss a notification
   *
   * Removes the notification with the specified ID from the active notifications list.
   * This can be called manually by the user clicking on the notification or automatically
   * after the auto-dismiss timeout.
   *
   * Requirements: ui.7.3
   * Property: 22
   *
   * @param id - The unique ID of the notification to dismiss
   *
   * @example
   * ```typescript
   * const id = manager.showNotification('Error', 'Context');
   * manager.dismissNotification(id);
   * ```
   */
  dismissNotification(id: string): void {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.notifyListeners();
      Logger.info(
        'ErrorNotificationManager',
        `[ErrorNotificationManager] Notification dismissed: ${id}`
      );
    }
  }

  /**
   * Subscribe to notification changes
   *
   * Registers a listener function that will be called whenever the notifications list changes.
   * The listener receives a copy of the current notifications array.
   *
   * @param listener - Function to call when notifications change
   * @returns Unsubscribe function to remove the listener
   *
   * @example
   * ```typescript
   * const unsubscribe = manager.subscribe((notifications) => {
   *   this.logger.info(`Current notifications: ${notifications}`);
   * });
   *
   * // Later, cleanup
   * unsubscribe();
   * ```
   */
  subscribe(listener: (notifications: ErrorNotification[]) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of notification changes
   *
   * Calls each registered listener with a copy of the current notifications array.
   * Uses a shallow copy to prevent external modifications to the internal state.
   *
   * @private
   */
  private notifyListeners(): void {
    // Send a copy of the notifications array to prevent external modifications
    this.listeners.forEach((listener) => listener([...this.notifications]));
  }
}
