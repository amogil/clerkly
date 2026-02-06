// Requirements: ui.9.3, ui.9.4, ui.9.5, ui.9.6

import { TokenStorageManager } from './TokenStorageManager';

/**
 * Flag to prevent multiple simultaneous token clearances
 * Requirements: ui.9.4 - Prevent race conditions
 */
let isClearing401 = false;

/**
 * Centralized API Request Handler
 * Handles all API requests with automatic HTTP 401 detection and token management
 * Requirements: ui.9.3, ui.9.4, ui.9.5
 *
 * This handler wraps fetch() to provide:
 * - Automatic detection of HTTP 401 Unauthorized errors
 * - Centralized token clearing on authorization failures
 * - Protection against race conditions when multiple requests fail simultaneously
 * - Consistent error logging with context
 *
 * @param url API endpoint URL
 * @param options Fetch options (headers, method, body, etc.)
 * @param tokenStorage TokenStorageManager instance for clearing tokens
 * @param context Optional context string for logging (e.g., "UserInfo API", "Calendar API")
 * @returns Response from the API
 * @throws Error if request fails or authorization error occurs
 */
export async function handleAPIRequest(
  url: string,
  options: RequestInit,
  tokenStorage: TokenStorageManager,
  context?: string
): Promise<Response> {
  try {
    // Requirements: ui.9.4 - Make the API request
    const response = await fetch(url, options);

    // Requirements: ui.9.3, ui.9.4 - Check for authorization error
    if (response.status === 401) {
      // Requirements: ui.9.4 - Prevent race conditions with multiple simultaneous 401 errors
      if (!isClearing401) {
        isClearing401 = true;

        try {
          // Requirements: ui.9.5 - Log error with context
          const logContext = context || 'API Request';
          console.error(`[APIRequestHandler] Authorization error (401) from ${logContext}`, {
            url,
            timestamp: new Date().toISOString(),
            context: logContext,
          });

          // Requirements: ui.9.3 - Clear all tokens from storage
          console.log('[APIRequestHandler] Clearing all tokens due to 401 error');
          await tokenStorage.deleteTokens();

          // Requirements: ui.9.3 - Emit auth error event to show LoginError component
          // The event will be handled by the renderer process to show LoginError with errorCode 'invalid_grant'
          if (process.type === 'browser') {
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
              mainWindow.webContents.send('auth:error', {
                message: 'Session expired',
                errorCode: 'invalid_grant',
              });
            }
          }
        } finally {
          // Reset flag after a short delay to allow other requests to see the cleared state
          setTimeout(() => {
            isClearing401 = false;
          }, 100);
        }
      }

      // Requirements: ui.9.3 - Throw error to inform caller
      throw new Error('Authorization failed: Session expired (HTTP 401)');
    }

    return response;
  } catch (error) {
    // Requirements: ui.9.5 - Log all errors with context
    const logContext = context || 'API Request';
    console.error(`[APIRequestHandler] Request failed for ${logContext}:`, error);

    // Re-throw the error for caller to handle
    throw error;
  }
}

/**
 * Reset the clearing flag (for testing purposes)
 * @internal
 */
export function resetClearingFlag(): void {
  isClearing401 = false;
}
