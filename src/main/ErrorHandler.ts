// Requirements: ui.7.1, ui.7.4

import { BrowserWindow } from 'electron';

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
  console.error(`[${context}] Error:`, errorMessage);

  // Log stack trace if available for debugging
  if (error instanceof Error && error.stack) {
    console.error(`[${context}] Stack trace:`, error.stack);
  }

  // Requirements: ui.7.1 - Send error notification to all renderer processes
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((window) => {
    window.webContents.send('error:notify', errorMessage, context);
  });
}
