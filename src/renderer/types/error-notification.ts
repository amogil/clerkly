// Requirements: error-notifications.1.2

/**
 * Error notification interface for displaying error messages to users
 *
 * This interface defines the structure of error notifications shown when
 * background processes fail (data loading, synchronization, API requests).
 *
 * @see ErrorNotificationManager
 */
export interface ErrorNotification {
  /**
   * Unique identifier for the notification
   *
   * Used to track and dismiss specific notifications.
   * Format: `error-${timestamp}-${random}`
   */
  id: string;

  /**
   * Brief description of the problem
   *
   * A user-friendly message explaining what went wrong.
   * Should be concise and understandable without technical jargon.
   *
   * @example "Failed to load user profile"
   * @example "Network connection error"
   */
  message: string;

  /**
   * Context of the operation that failed
   *
   * Describes what the application was trying to do when the error occurred.
   * Helps users understand the scope and impact of the error.
   *
   * @example "Loading profile data"
   * @example "Syncing calendar events"
   * @example "Refreshing authentication token"
   */
  context: string;

  /**
   * Timestamp when the notification was created
   *
   * Milliseconds since Unix epoch (Date.now()).
   * Used for sorting notifications and implementing auto-dismiss timing.
   */
  timestamp: number;
}
