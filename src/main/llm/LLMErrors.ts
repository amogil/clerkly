// Requirements: llm-integration.3.4, llm-integration.5.3

/**
 * Typed error for LLM request abort/timeout cases.
 * Keeps provider-level abort details while exposing a stable user-facing message.
 * Requirements: llm-integration.3.4, llm-integration.5.3
 */
export class LLMRequestAbortedError extends Error {
  readonly causeError: unknown;

  constructor(message: string, causeError: unknown) {
    super(message);
    this.name = 'LLMRequestAbortedError';
    this.causeError = causeError;
  }
}

/**
 * Detect abort-like fetch errors from runtime implementations.
 * Requirements: llm-integration.3.4
 */
export function isAbortLikeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
