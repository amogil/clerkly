// Requirements: google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6

import {
  getErrorDetails,
  logError,
  createErrorResponse,
} from '../../../src/main/auth/ErrorHandler';

describe('ErrorHandler', () => {
  describe('getErrorDetails', () => {
    /* Preconditions: Error code is 'popup_closed_by_user'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for user cancellation
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for popup_closed_by_user error', () => {
      const details = getErrorDetails('popup_closed_by_user');

      expect(details.title).toBe('Sign in cancelled');
      expect(details.message).toBe(
        'You closed the sign-in window before completing authentication.'
      );
      expect(details.suggestion).toBe('Please try again and complete the sign-in process.');
    });

    /* Preconditions: Error code is 'access_denied'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for access denial
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for access_denied error', () => {
      const details = getErrorDetails('access_denied');

      expect(details.title).toBe('Access denied');
      expect(details.message).toBe('You denied access to your Google account.');
      expect(details.suggestion).toBe(
        'Clerkly needs access to your Google account to function properly.'
      );
    });

    /* Preconditions: Error code is 'network_error'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for network error
       Requirements: google-oauth-auth.9.2, google-oauth-auth.9.6 */
    it('should return correct details for network_error', () => {
      const details = getErrorDetails('network_error');

      expect(details.title).toBe('Network error');
      expect(details.message).toBe('Unable to connect to Google authentication servers.');
      expect(details.suggestion).toBe('Please check your internet connection and try again.');
    });

    /* Preconditions: Error code is 'invalid_grant'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for session expiration
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for invalid_grant error', () => {
      const details = getErrorDetails('invalid_grant');

      expect(details.title).toBe('Session expired');
      expect(details.message).toBe('Your authentication session has expired.');
      expect(details.suggestion).toBe('Please sign in again to continue.');
    });

    /* Preconditions: Error code is 'invalid_request'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for invalid request
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for invalid_request error', () => {
      const details = getErrorDetails('invalid_request');

      expect(details.title).toBe('Invalid request');
      expect(details.message).toBe('The authentication request was malformed.');
      expect(details.suggestion).toBe(
        'Please try again or contact support if the problem persists.'
      );
    });

    /* Preconditions: Error code is 'server_error'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for server error
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for server_error', () => {
      const details = getErrorDetails('server_error');

      expect(details.title).toBe('Server error');
      expect(details.message).toBe('Google authentication servers are experiencing issues.');
      expect(details.suggestion).toBe('Please try again in a few moments.');
    });

    /* Preconditions: Error code is 'temporarily_unavailable'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for service unavailable
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for temporarily_unavailable error', () => {
      const details = getErrorDetails('temporarily_unavailable');

      expect(details.title).toBe('Service unavailable');
      expect(details.message).toBe('Google authentication service is temporarily unavailable.');
      expect(details.suggestion).toBe('Please try again in a few moments.');
    });

    /* Preconditions: Error code is 'csrf_attack_detected'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for security error
       Requirements: google-oauth-auth.9.4, google-oauth-auth.9.6 */
    it('should return correct details for csrf_attack_detected error', () => {
      const details = getErrorDetails('csrf_attack_detected');

      expect(details.title).toBe('Security error');
      expect(details.message).toBe('The authentication request failed security validation.');
      expect(details.suggestion).toBe('Please try signing in again.');
    });

    /* Preconditions: Error code is 'database_error'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for storage error
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6 */
    it('should return correct details for database_error', () => {
      const details = getErrorDetails('database_error');

      expect(details.title).toBe('Storage error');
      expect(details.message).toBe('Unable to save authentication data.');
      expect(details.suggestion).toBe('Please check application permissions and try again.');
    });

    /* Preconditions: Error code is 'profile_fetch_failed'
       Action: Call getErrorDetails with error code
       Assertions: Returns correct title, message, and suggestion for profile fetch failure
       Requirements: google-oauth-auth.9.1, google-oauth-auth.9.6, google-oauth-auth.3.7 */
    it('should return correct details for profile_fetch_failed error', () => {
      const details = getErrorDetails('profile_fetch_failed');

      expect(details.title).toBe('Profile loading failed');
      expect(details.message).toBe('Unable to load your Google profile information.');
      expect(details.suggestion).toBe(
        'Please check your internet connection and try signing in again.'
      );
    });

    /* Preconditions: Error code is unknown or not in error map
       Action: Call getErrorDetails with unknown error code
       Assertions: Returns default error details with generic message
       Requirements: google-oauth-auth.9.6 */
    it('should return default details for unknown error code', () => {
      const details = getErrorDetails('unknown_error_code');

      expect(details.title).toBe('Authentication failed');
      expect(details.message).toBe('An unexpected error occurred during authentication.');
      expect(details.suggestion).toBe(
        'Please try signing in again or contact support if the problem persists.'
      );
    });

    /* Preconditions: Error code is unknown but custom error message provided
       Action: Call getErrorDetails with unknown error code and custom message
       Assertions: Returns default title with custom message
       Requirements: google-oauth-auth.9.6 */
    it('should use custom error message for unknown error code', () => {
      const customMessage = 'Custom error occurred';
      const details = getErrorDetails('unknown_error', customMessage);

      expect(details.title).toBe('Authentication failed');
      expect(details.message).toBe(customMessage);
      expect(details.suggestion).toBe(
        'Please try signing in again or contact support if the problem persists.'
      );
    });

    /* Preconditions: No error code provided
       Action: Call getErrorDetails with undefined error code
       Assertions: Returns default error details
       Requirements: google-oauth-auth.9.6 */
    it('should return default details when no error code provided', () => {
      const details = getErrorDetails();

      expect(details.title).toBe('Authentication failed');
      expect(details.message).toBe('An unexpected error occurred during authentication.');
      expect(details.suggestion).toBe(
        'Please try signing in again or contact support if the problem persists.'
      );
    });
  });

  describe('logError', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: Error object with message and code
       Action: Call logError with operation name and error
       Assertions: Error is logged with operation, message, code, and timestamp
       Requirements: google-oauth-auth.9.5 */
    it('should log error with context', () => {
      const operation = 'token_exchange';
      const error = { message: 'Token exchange failed', code: 'invalid_grant' };
      const context = { userId: '123' };

      logError(operation, error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[OAuth] token_exchange failed: Token exchange failed',
        expect.objectContaining({
          errorCode: 'invalid_grant',
          timestamp: expect.any(Number),
          context: { userId: '123' },
        })
      );
    });

    /* Preconditions: Error is a string
       Action: Call logError with string error
       Assertions: Error is logged with string converted to message
       Requirements: google-oauth-auth.9.5 */
    it('should handle string errors', () => {
      const operation = 'auth_flow';
      const error = 'Network connection failed';

      logError(operation, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[OAuth] auth_flow failed: Network connection failed',
        expect.objectContaining({
          errorCode: 'unknown',
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: Error object without message
       Action: Call logError with error object that has no message
       Assertions: Error is logged with 'Unknown error' message
       Requirements: google-oauth-auth.9.5 */
    it('should handle errors without message', () => {
      const operation = 'logout';
      const error = { code: 'revoke_failed' };

      logError(operation, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[OAuth] logout failed: [object Object]',
        expect.objectContaining({
          errorCode: 'revoke_failed',
          timestamp: expect.any(Number),
        })
      );
    });

    /* Preconditions: No context provided
       Action: Call logError without context parameter
       Assertions: Error is logged with empty context object
       Requirements: google-oauth-auth.9.5 */
    it('should log error without context', () => {
      const operation = 'refresh_token';
      const error = new Error('Refresh failed');

      logError(operation, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[OAuth] refresh_token failed: Refresh failed',
        expect.objectContaining({
          timestamp: expect.any(Number),
          context: {},
        })
      );
    });
  });

  describe('createErrorResponse', () => {
    /* Preconditions: Error message provided
       Action: Call createErrorResponse with error message
       Assertions: Returns structured error response with success: false and error message
       Requirements: google-oauth-auth.9.3 */
    it('should create error response with message', () => {
      const error = 'Authentication failed';
      const response = createErrorResponse(error);

      expect(response).toEqual({
        success: false,
        error: 'Authentication failed',
        errorCode: undefined,
        details: undefined,
      });
    });

    /* Preconditions: Error message and error code provided
       Action: Call createErrorResponse with message and code
       Assertions: Returns structured error response with both message and code
       Requirements: google-oauth-auth.9.3 */
    it('should create error response with error code', () => {
      const error = 'Access denied';
      const errorCode = 'access_denied';
      const response = createErrorResponse(error, errorCode);

      expect(response).toEqual({
        success: false,
        error: 'Access denied',
        errorCode: 'access_denied',
        details: undefined,
      });
    });

    /* Preconditions: Error message, code, and additional details provided
       Action: Call createErrorResponse with all parameters
       Assertions: Returns structured error response with all fields
       Requirements: google-oauth-auth.9.3 */
    it('should create error response with details', () => {
      const error = 'Token exchange failed';
      const errorCode = 'invalid_grant';
      const details = { attemptedAt: Date.now() };
      const response = createErrorResponse(error, errorCode, details);

      expect(response).toEqual({
        success: false,
        error: 'Token exchange failed',
        errorCode: 'invalid_grant',
        details: { attemptedAt: expect.any(Number) },
      });
    });

    /* Preconditions: Error response created
       Action: Check response structure
       Assertions: Response always has success: false
       Requirements: google-oauth-auth.9.3 */
    it('should always have success: false', () => {
      const response1 = createErrorResponse('Error 1');
      const response2 = createErrorResponse('Error 2', 'code');
      const response3 = createErrorResponse('Error 3', 'code', { detail: 'info' });

      expect(response1.success).toBe(false);
      expect(response2.success).toBe(false);
      expect(response3.success).toBe(false);
    });
  });
});
