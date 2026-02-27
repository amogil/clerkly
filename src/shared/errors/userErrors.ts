export const NO_USER_LOGGED_IN_ERROR = 'No user logged in';

// Requirements: user-data-isolation.3.2, user-data-isolation.4.3, error-notifications.1.5
export function isNoUserLoggedInError(error: unknown): boolean {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';

  return message.toLowerCase().includes(NO_USER_LOGGED_IN_ERROR.toLowerCase());
}
