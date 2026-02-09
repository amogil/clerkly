// Requirements: google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6, clerkly.3.8

import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Error details interface
 * Requirements: google-oauth-auth.9.6
 */
export interface ErrorDetails {
  title: string;
  message: string;
  suggestion: string;
}

/**
 * Error response interface
 * Requirements: google-oauth-auth.9.3
 */
export interface ErrorResponse {
  success: false;
  error: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

/**
 * Error mapping for OAuth errors
 * Requirements: google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.6
 */
const ERROR_MAP: Record<string, ErrorDetails> = {
  popup_closed_by_user: {
    title: 'Sign in cancelled',
    message: 'You closed the sign-in window before completing authentication.',
    suggestion: 'Please try again and complete the sign-in process.',
  },
  access_denied: {
    title: 'Access denied',
    message: 'You denied access to your Google account.',
    suggestion: 'Clerkly needs access to your Google account to function properly.',
  },
  network_error: {
    title: 'Network error',
    message: 'Unable to connect to Google authentication servers.',
    suggestion: 'Please check your internet connection and try again.',
  },
  invalid_grant: {
    title: 'Session expired',
    message: 'Your authentication session has expired.',
    suggestion: 'Please sign in again to continue.',
  },
  invalid_request: {
    title: 'Invalid request',
    message: 'The authentication request was malformed.',
    suggestion: 'Please try again or contact support if the problem persists.',
  },
  server_error: {
    title: 'Server error',
    message: 'Google authentication servers are experiencing issues.',
    suggestion: 'Please try again in a few moments.',
  },
  temporarily_unavailable: {
    title: 'Service unavailable',
    message: 'Google authentication service is temporarily unavailable.',
    suggestion: 'Please try again in a few moments.',
  },
  csrf_attack_detected: {
    title: 'Security error',
    message: 'The authentication request failed security validation.',
    suggestion: 'Please try signing in again.',
  },
  database_error: {
    title: 'Storage error',
    message: 'Unable to save authentication data.',
    suggestion: 'Please check application permissions and try again.',
  },
  profile_fetch_failed: {
    title: 'Profile loading failed',
    message: 'Unable to load your Google profile information.',
    suggestion: 'Please check your internet connection and try signing in again.',
  },
};

/**
 * Get error details for a given error code
 * Requirements: google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.6
 * @param errorCode Error code from OAuth flow
 * @param errorMessage Optional custom error message
 * @returns Error details with title, message, and suggestion
 */
export function getErrorDetails(errorCode?: string, errorMessage?: string): ErrorDetails {
  if (errorCode && ERROR_MAP[errorCode]) {
    return ERROR_MAP[errorCode];
  }

  return {
    title: 'Authentication failed',
    message: errorMessage || 'An unexpected error occurred during authentication.',
    suggestion: 'Please try signing in again or contact support if the problem persists.',
  };
}

/**
 * Log error with context
 * Requirements: google-oauth-auth.9.5
 * @param operation Operation that failed
 * @param error Error object or message
 * @param context Additional context for debugging
 */
export function logError(
  operation: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorObj = error as { message?: string; code?: string; error?: string };
  const errorMessage = errorObj?.message || String(error) || 'Unknown error';
  const errorCode = errorObj?.code || errorObj?.error || 'unknown';

  Logger.error(
    'OAuth',
    `${operation} failed: ${errorMessage} ${JSON.stringify({
      errorCode,
      timestamp: Date.now(),
      context: context || {},
    })}`
  );
}

/**
 * Create error response
 * Requirements: google-oauth-auth.9.3
 * @param error Error message
 * @param errorCode Optional error code
 * @param details Optional additional details
 * @returns Structured error response
 */
export function createErrorResponse(
  error: string,
  errorCode?: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    success: false,
    error,
    errorCode,
    details,
  };
}
