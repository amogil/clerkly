// Requirements: ui.7.1, ui.7.4

import { BrowserWindow } from 'electron';
import { Logger } from './Logger';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for ErrorHandler module
const logger = Logger.create('ErrorHandler');

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Handle background errors and notify renderer processes
 * Requirements: ui.7.1, ui.7.4
 *
 * This function provides centralized error handling for background processes.
 * It logs errors to console with context and sends notifications to all renderer processes.
 *
 * @param error Error object or error message
 * @param context Context of the operation that failed (e.g., "Profile Fetch", "Token Refresh")
 *
 * @example
 * ```typescript
 * try {
 *   await fetchProfile();
 * } catch (error) {
 *   handleBackgroundError(error, 'Profile Fetch');
 * }
 * ```
 */
export function handleBackgroundError(error: unknown, context: string): void {
  // Requirements: ui.7.4 - Log error to console with context
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`[${context}] Error: ${errorMessage}`);

  // Log stack trace if available for debugging
  if (error instanceof Error && error.stack) {
    logger.error(`[${context}] Stack trace: ${error.stack}`);
  }

  // Requirements: ui.7.1 - Send error notification to all renderer processes
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((window) => {
    window.webContents.send('error:notify', errorMessage, context);
  });
}
