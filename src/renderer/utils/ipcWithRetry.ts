// Utility for IPC calls with automatic retry on "No handler registered" errors
// Solves race condition when renderer loads faster than main process registers handlers

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  initialDelay: 100,
  maxDelay: 1000,
  backoffMultiplier: 2,
};

/**
 * Execute IPC call with automatic retry on "No handler registered" errors
 * Uses exponential backoff: 100ms, 200ms, 400ms, 800ms, 1000ms
 */
export async function ipcWithRetry<T>(
  ipcCall: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await ipcCall();
    } catch (error) {
      lastError = error as Error;

      // Only retry on "No handler registered" errors
      const isHandlerError =
        error instanceof Error && error.message.includes('No handler registered');

      if (!isHandlerError || attempt === opts.maxAttempts) {
        throw error;
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('IPC call failed after retries');
}
