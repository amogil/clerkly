// Requirements: ui.9.1, ui.9.2, ui.9.3, ui.9.4, ui.9.5, ui.9.6

import { TokenStorageManager } from './TokenStorageManager';
import { BrowserWindow } from 'electron';
import { DateTimeFormatter } from '../utils/DateTimeFormatter';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Flag to prevent multiple simultaneous token clearances
 * Requirements: ui.9.4 - Prevent race conditions
 */
let isClearing401 = false;

/**
 * OAuth Client Manager instance for token refresh
 * Set by the main process during initialization
 */
let oauthClientManager: any = null;

/**
 * Set the OAuth Client Manager instance
 * Requirements: ui.9.1, ui.9.2 - Enable automatic token refresh
 * @param manager OAuthClientManager instance
 */
export function setOAuthClientManager(manager: any): void {
  oauthClientManager = manager;
}

/**
 * Centralized API Request Handler
 * Handles all API requests with automatic HTTP 401 detection and token management
 * Requirements: ui.9.1, ui.9.2, ui.9.3, ui.9.4, ui.9.5
 *
 * This handler wraps fetch() to provide:
 * - Automatic token refresh when access token is expired (ui.9.1, ui.9.2)
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
  Logger.info(
    'APIRequestHandler',
    `[APIRequestHandler] Making API request: ${JSON.stringify({ url, context })}`
  );

  try {
    // Requirements: ui.9.1, ui.9.2 - Check if access token is expired and refresh if needed
    if (oauthClientManager) {
      const tokens = await tokenStorage.loadTokens();
      if (tokens && tokens.expiresAt) {
        const now = Date.now();
        const isExpired = tokens.expiresAt <= now;

        if (isExpired) {
          Logger.info(
            'APIRequestHandler',
            '[APIRequestHandler] Access token expired, refreshing automatically'
          );
          const refreshed = await oauthClientManager.refreshAccessToken();

          if (refreshed) {
            Logger.info('APIRequestHandler', '[APIRequestHandler] Token refreshed successfully');
            // Reload tokens to get the new access token
            const newTokens = await tokenStorage.loadTokens();
            if (newTokens && options.headers) {
              // Update Authorization header with new token
              (options.headers as Record<string, string>)['Authorization'] =
                `Bearer ${newTokens.accessToken}`;
            }
          } else {
            Logger.info(
              'APIRequestHandler',
              '[APIRequestHandler] Token refresh failed, continuing with expired token'
            );
          }
        }
      }
    }

    // Requirements: ui.9.4 - Make the API request
    const response = await fetch(url, options);
    Logger.info(
      'APIRequestHandler',
      `Response received: ${JSON.stringify({ status: response.status, url })}`
    );

    // Requirements: ui.9.3, ui.9.4 - Check for authorization error
    if (response.status === 401) {
      // Requirements: ui.9.4 - Prevent race conditions with multiple simultaneous 401 errors
      if (!isClearing401) {
        isClearing401 = true;

        try {
          // Requirements: ui.9.5 - Log error with context
          const logContext = context || 'API Request';
          // Requirements: ui.9.5 - Log authorization errors with context
          // Requirements: ui.11.3 - Use fixed format for log timestamps
          Logger.error(
            'APIRequestHandler',
            `Authorization error (401) from ${logContext}: ${JSON.stringify({
              url,
              timestamp: DateTimeFormatter.formatLogTimestamp(Date.now()),
              context: logContext,
            })}`
          );

          // Requirements: ui.9.3 - Clear all tokens from storage
          Logger.info(
            'APIRequestHandler',
            '[APIRequestHandler] Clearing all tokens due to 401 error'
          );
          await tokenStorage.deleteTokens();

          // Requirements: ui.9.3 - Emit auth error event to show LoginError component
          // The event will be handled by the renderer process to show LoginError with errorCode 'invalid_grant'
          const allWindows = BrowserWindow.getAllWindows();
          Logger.info(
            'APIRequestHandler',
            `[APIRequestHandler] Total windows: ${allWindows.length}`
          );
          const mainWindow = allWindows[0];
          Logger.info(
            'APIRequestHandler',
            `[APIRequestHandler] Main window found: ${!!mainWindow}`
          );
          if (mainWindow) {
            Logger.info(
              'APIRequestHandler',
              `[APIRequestHandler] Main window ID: ${mainWindow.id}`
            );
            Logger.info(
              'APIRequestHandler',
              '[APIRequestHandler] Sending auth:error event to renderer'
            );
            mainWindow.webContents.send('auth:error', {
              error: 'Session expired',
              errorCode: 'invalid_grant',
            });
            Logger.info(
              'APIRequestHandler',
              '[APIRequestHandler] auth:error event sent successfully'
            );
          } else {
            Logger.error(
              'APIRequestHandler',
              '[APIRequestHandler] No main window found, cannot send auth:error event'
            );
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
    Logger.error(
      'APIRequestHandler',
      `Request failed for ${logContext}: ${error instanceof Error ? error.message : String(error)}`
    );

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
