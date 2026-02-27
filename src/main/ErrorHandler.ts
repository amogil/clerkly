// Requirements: error-notifications.1.1, error-notifications.1.4, error-notifications.1.5

import { Logger } from './Logger';
import { MainEventBus } from './events/MainEventBus';
import { ErrorCreatedEvent } from '../shared/events/types';
import { isNoUserLoggedInError } from '../shared/errors/userErrors';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for ErrorHandler module
const logger = Logger.create('ErrorHandler');

// Requirements: error-notifications.1.5, user-data-isolation.1.21
/**
 * Check if error should be filtered (not shown to user)
 * Requirements: error-notifications.1.5, user-data-isolation.1.21
 *
 * Filters race condition errors that should be logged but not shown to users:
 * - NO_USER_LOGGED_IN_ERROR during logout (race condition between logout and data operations)
 * - Cancelled/aborted operations (user-initiated cancellations)
 * - Explicit race condition errors
 *
 * @param error Error object or error message
 * @param context Context of the operation that failed
 * @returns true if error should be filtered (not shown), false otherwise
 */
export function shouldFilterError(error: unknown, context: string): boolean {
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const contextLower = context.toLowerCase();

  // Filter NO_USER_LOGGED_IN_ERROR during logout (race condition)
  if (isNoUserLoggedInError(error) && contextLower.includes('logout')) {
    return true;
  }

  // Filter cancelled operations
  if (errorMessage.includes('cancelled') || errorMessage.includes('aborted')) {
    return true;
  }

  // Filter race condition errors
  if (errorMessage.includes('race condition') || errorMessage.includes('concurrent operation')) {
    return true;
  }

  return false;
}

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Handle background errors and notify renderer processes via EventBus
 * Requirements: error-notifications.1.1, error-notifications.1.4, error-notifications.1.5
 *
 * This function provides centralized error handling for background processes.
 * It logs errors to console with context and publishes error.created event
 * which is broadcast to all renderer processes via EventBus.
 * Race condition errors are filtered and logged but not shown to users.
 *
 * @param error Error object or error message
 * @param context Context of the operation that failed (e.g., "Profile Fetch", "Token Refresh")
 */
export function handleBackgroundError(error: unknown, context: string): void {
  // Requirements: error-notifications.1.4 - Log error to console with context
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('[' + context + '] Error: ' + errorMessage);

  // Log stack trace if available for debugging
  if (error instanceof Error && error.stack) {
    logger.error('[' + context + '] Stack trace: ' + error.stack);
  }

  // Requirements: error-notifications.1.5 - Filter race condition errors
  if (shouldFilterError(error, context)) {
    logger.info('[' + context + '] Error filtered (race condition), not showing notification');
    return;
  }

  // Requirements: error-notifications.1.1 - Publish error.created event via EventBus
  // EventBus automatically broadcasts to all renderer processes
  const eventBus = MainEventBus.getInstance();
  eventBus.publish(new ErrorCreatedEvent(errorMessage, context));
}
