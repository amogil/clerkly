// Requirements: token-management-ui.1.3, token-management-ui.1.6
/**
 * Custom error classes for authentication module
 */

/**
 * Error thrown when user session has expired (401 Unauthorized)
 * Used for type-safe error handling in authentication flow
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}
