// Requirements: token-management-ui.1.1, token-management-ui.1.2, token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5, token-management-ui.1.6, error-notifications.1.1, error-notifications.1.4

import { TokenStorageManager } from './TokenStorageManager';
import { DateTimeFormatter } from '../utils/DateTimeFormatter';
import { Logger } from '../Logger';
import { handleBackgroundError } from '../ErrorHandler';
import { MainEventBus } from '../events/MainEventBus';
import { AuthFailedEvent } from '../../shared/events/types';
import { SessionExpiredError } from './errors';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for APIRequestHandler module
const logger = Logger.create('APIRequestHandler');

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Flag to prevent multiple simultaneous token clearances
 * Requirements: token-management-ui.1.4 - Prevent race conditions
 */
let isClearing401 = false;

/**
 * OAuth Client Manager instance for token refresh
 * Set by the main process during initialization
 */
let oauthClientManager: any = null;

/**
 * Set the OAuth Client Manager instance
 * Requirements: token-management-ui.1.1, token-management-ui.1.2 - Enable automatic token refresh
 * @param manager OAuthClientManager instance
 */
export function setOAuthClientManager(manager: any): void {
  oauthClientManager = manager;
}

/**
 * Centralized API Request Handler
 * Handles all API requests with automatic HTTP 401 detection and token management
 * Requirements: token-management-ui.1.1, token-management-ui.1.2, token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5
 *
 * This handler wraps fetch() to provide:
 * - Automatic token refresh when access token is expired (token-management-ui.1.1, token-management-ui.1.2)
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
  logger.info(`Making API request: ${JSON.stringify({ url, context })}`);

  try {
    // Requirements: token-management-ui.1.1, token-management-ui.1.2 - Check if access token is expired and refresh if needed
    if (oauthClientManager) {
      const tokens = await tokenStorage.loadTokens();
      if (tokens && tokens.expiresAt) {
        const now = Date.now();
        const isExpired = tokens.expiresAt <= now;

        if (isExpired) {
          logger.info('Access token expired, refreshing automatically');
          const refreshed = await oauthClientManager.refreshAccessToken();

          if (refreshed) {
            logger.info('Token refreshed successfully');
            // Reload tokens to get the new access token
            const newTokens = await tokenStorage.loadTokens();
            if (newTokens && options.headers) {
              // Update Authorization header with new token
              // Handle both plain objects and Headers instances
              if (options.headers instanceof Headers) {
                options.headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
              } else {
                (options.headers as Record<string, string>)['Authorization'] =
                  `Bearer ${newTokens.accessToken}`;
              }
            }
          } else {
            logger.info('Token refresh failed, continuing with expired token');
          }
        }
      }
    }

    // Requirements: token-management-ui.1.4 - Make the API request
    const response = await fetch(url, options);
    logger.info(`Response received: ${JSON.stringify({ status: response.status, url })}`);

    // Requirements: token-management-ui.1.3, token-management-ui.1.4 - Check for authorization error
    if (response.status === 401) {
      // Requirements: token-management-ui.1.4 - Prevent race conditions with multiple simultaneous 401 errors
      if (!isClearing401) {
        isClearing401 = true;

        try {
          // Requirements: token-management-ui.1.5 - Log error with context
          const logContext = context || 'API Request';
          // Requirements: token-management-ui.1.5 - Log authorization errors with context
          // Requirements: settings.2.3 - Use fixed format for log timestamps
          logger.error(
            `Authorization error (401) from ${logContext}: ${JSON.stringify({
              url,
              timestamp: DateTimeFormatter.formatLogTimestamp(Date.now()),
              context: logContext,
            })}`
          );

          // Requirements: token-management-ui.1.3 - Clear all tokens from storage
          logger.info('Clearing all tokens due to 401 error');
          await tokenStorage.deleteTokens();

          // Requirements: token-management-ui.1.3 - Emit auth.failed event via EventBus
          // The event will be handled by the renderer process to show LoginError with errorCode 'invalid_grant'
          const eventBus = MainEventBus.getInstance();
          eventBus.publish(new AuthFailedEvent('Session expired', 'invalid_grant'));
        } finally {
          // Reset flag after a short delay to allow other requests to see the cleared state
          setTimeout(() => {
            isClearing401 = false;
          }, 100);
        }
      }

      // Requirements: token-management-ui.1.3, token-management-ui.1.6 - Throw typed error for session expiry
      throw new SessionExpiredError();
    }

    return response;
  } catch (error) {
    // Requirements: token-management-ui.1.5, error-notifications.1.1, error-notifications.1.4 - Log all errors with context and notify user
    const logContext = context || 'API Request';
    logger.error(
      `Request failed for ${logContext}: ${error instanceof Error ? error.message : String(error)}`
    );

    // Requirements: error-notifications.1.1, error-notifications.1.4 - Notify user about API request failures
    handleBackgroundError(error, logContext);

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
