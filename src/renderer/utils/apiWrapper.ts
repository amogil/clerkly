// Requirements: error-notifications.2.1, error-notifications.2.2, error-notifications.2.3, error-notifications.2.4, error-notifications.2.5, error-notifications.2.6

import { toast } from 'sonner';
import { isNoUserLoggedInError } from '../../shared/errors/userErrors';
interface ApiCallOptions {
  /**
   * If true, don't show toast notification on error
   */
  silent?: boolean;
}

/**
 * Wrapper for IPC API calls with automatic error handling
 *
 * @param apiCall - Function that returns IPC result
 * @param context - Context of the operation (e.g., "Loading agents")
 * @param options - Optional configuration
 * @returns Data on success, null on error
 */
export async function callApi<T>(
  apiCall: () => Promise<{ success: boolean; data?: T; error?: string }>,
  context: string,
  options?: ApiCallOptions
): Promise<T | null> {
  try {
    const result = await apiCall();

    // Requirements: error-notifications.2.5 - Return data on success
    if (result.success && result.data !== undefined) {
      return result.data;
    }

    // Requirements: error-notifications.2.3 - Show toast on IPC error
    const errorMessage = result.error || 'Unknown error';
    if (isNoUserLoggedInError(errorMessage)) {
      return null;
    }
    if (!options?.silent) {
      toast.error(`${context}: ${errorMessage}`);
    }

    // Requirements: error-notifications.2.5 - Return null on error
    return null;
  } catch (error) {
    // Requirements: error-notifications.2.4 - Show toast on exception
    if (!options?.silent) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`${context}: ${message}`);
    }

    // Requirements: error-notifications.2.5 - Return null on error
    return null;
  }
}
