// Requirements: llm-integration.3.5, llm-integration.3.10, error-notifications.1.4

import {
  normalizeLLMError,
  parseRetryAfterSecondsFromText,
} from '../../../src/main/llm/ErrorNormalizer';
import { LLMRequestAbortedError } from '../../../src/main/llm/LLMErrors';

describe('ErrorNormalizer', () => {
  /* Preconditions: rate-limit text contains "in N.NNs"
     Action: parse retry-after
     Assertions: seconds are parsed and rounded up
     Requirements: llm-integration.3.7.6 */
  it('parses retry-after seconds from "in N.NNs" text', () => {
    expect(parseRetryAfterSecondsFromText('Rate limit exceeded. Please try again in 9.2s')).toBe(
      10
    );
  });

  /* Preconditions: APICallError with statusCode 401
     Action: normalizeLLMError
     Assertions: mapped to auth
     Requirements: llm-integration.3.10 */
  it('maps APICallError 401 to auth', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 401,
      message: 'Unauthorized',
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.message).toBe('Invalid API key. Please check your key and try again.');
  });

  /* Preconditions: APICallError with statusCode 403
     Action: normalizeLLMError
     Assertions: mapped to auth
     Requirements: llm-integration.3.10 */
  it('maps APICallError 403 to auth', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 403,
      message: 'Forbidden',
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.message).toBe('Invalid API key. Please check your key and try again.');
  });

  /* Preconditions: APICallError with statusCode 429 and retry-after header
     Action: normalizeLLMError
     Assertions: mapped to rate_limit with retryAfterSeconds
     Requirements: llm-integration.3.7.6, llm-integration.3.10 */
  it('maps APICallError 429 with retry-after header to rate_limit', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 429,
      message: 'Too many requests',
      responseHeaders: { 'retry-after': '7' },
    });
    expect(normalized.type).toBe('rate_limit');
    expect(normalized.message).toBe('Rate limit exceeded. Please try again later.');
    expect(normalized.retryAfterSeconds).toBe(7);
  });

  /* Preconditions: APICallError without statusCode
     Action: normalizeLLMError
     Assertions: mapped to network
     Requirements: llm-integration.3.10 */
  it('maps APICallError without statusCode to network', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      message: 'fetch failed',
    });
    expect(normalized.type).toBe('network');
    expect(normalized.message).toBe('Network error. Please check your internet connection.');
  });

  /* Preconditions: APICallError with statusCode 503
     Action: normalizeLLMError
     Assertions: mapped to provider
     Requirements: llm-integration.3.10 */
  it('maps APICallError 5xx to provider', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 503,
      message: 'Service unavailable',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.message).toBe('Provider service unavailable. Please try again later.');
  });

  /* Preconditions: RetryError from SDK without recognizable details
     Action: normalizeLLMError
     Assertions: mapped to provider
     Requirements: llm-integration.3.10 */
  it('maps generic RetryError to provider', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Retries exhausted',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.message).toBe('Provider service unavailable. Please try again later.');
  });

  /* Preconditions: RetryError carries auth wording
     Action: normalizeLLMError
     Assertions: mapped to auth
     Requirements: llm-integration.3.10 */
  it('maps RetryError with auth wording to auth', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Unauthorized: invalid api key',
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.message).toBe('Invalid API key. Please check your key and try again.');
  });

  /* Preconditions: RetryError wraps APICallError with 401 status in cause chain
     Action: normalizeLLMError
     Assertions: mapped to auth
     Requirements: llm-integration.3.10 */
  it('maps RetryError with auth status in cause chain to auth', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Retries exhausted',
      cause: {
        name: 'APICallError',
        statusCode: 401,
        message: 'Unauthorized',
      },
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.message).toBe('Invalid API key. Please check your key and try again.');
  });

  /* Preconditions: RetryError carries 429 wording
     Action: normalizeLLMError
     Assertions: mapped to rate_limit with parsed retryAfterSeconds
     Requirements: llm-integration.3.7.6, llm-integration.3.10 */
  it('maps RetryError with 429 wording to rate_limit', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Rate limit exceeded. Please try again in 3.2s',
    });
    expect(normalized.type).toBe('rate_limit');
    expect(normalized.message).toBe('Rate limit exceeded. Please try again later.');
    expect(normalized.retryAfterSeconds).toBe(4);
  });

  /* Preconditions: ToolExecutionError from SDK
     Action: normalizeLLMError
     Assertions: mapped to tool with standardized message
     Requirements: llm-integration.3.5, llm-integration.3.10 */
  it.each([
    'NoSuchToolError',
    'InvalidToolInputError',
    'ToolExecutionError',
    'ToolCallRepairError',
  ])('maps %s to tool category', (errorName) => {
    const normalized = normalizeLLMError({
      name: errorName,
      message: 'tool failed',
    });
    expect(normalized.type).toBe('tool');
    expect(normalized.message).toBe('Tool execution failed. Please try again later.');
  });

  /* Preconditions: UIMessageStreamError from SDK
     Action: normalizeLLMError
     Assertions: mapped to protocol with standardized message
     Requirements: llm-integration.3.5, llm-integration.3.10 */
  it('maps UIMessageStreamError to protocol category', () => {
    const normalized = normalizeLLMError({
      name: 'UIMessageStreamError',
      message: 'stream invalid',
    });
    expect(normalized.type).toBe('protocol');
    expect(normalized.message).toBe('Response stream error. Please try again later.');
  });

  /* Preconditions: provider error text contains invalid ModelMessage schema prompt error
     Action: normalizeLLMError
     Assertions: mapped to protocol instead of provider
     Requirements: llm-integration.3.10 */
  it('maps invalid prompt ModelMessage schema errors to protocol', () => {
    const normalized = normalizeLLMError({
      name: 'Error',
      message: 'Invalid prompt: The messages do not match the ModelMessage[] schema.',
    });
    expect(normalized.type).toBe('protocol');
    expect(normalized.message).toBe('Response stream error. Please try again later.');
  });

  /* Preconditions: LLMRequestAbortedError
     Action: normalizeLLMError
     Assertions: mapped to timeout
     Requirements: llm-integration.3.10 */
  it('maps LLMRequestAbortedError to timeout', () => {
    const normalized = normalizeLLMError(
      new LLMRequestAbortedError('Model response timeout', new Error('aborted'))
    );
    expect(normalized.type).toBe('timeout');
    expect(normalized.message).toBe(
      'Model response timeout. The provider took too long to respond. Please try again later.'
    );
  });

  /* Preconditions: APICallError with statusCode 503
     Action: normalizeLLMError
     Assertions: normalized error includes statusCode: 503
     Requirements: llm-integration.3.11 */
  it('should include statusCode in normalized error for APICallError 5xx', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 503,
      message: 'Service unavailable',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(503);
    expect(normalized.message).toBe('Provider service unavailable. Please try again later.');
  });

  /* Preconditions: APICallError with statusCode 500
     Action: normalizeLLMError
     Assertions: normalized error includes statusCode: 500
     Requirements: llm-integration.3.11 */
  it('should include statusCode 500 in normalized error for APICallError', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(500);
  });

  /* Preconditions: APICallError with statusCode 502
     Action: normalizeLLMError
     Assertions: normalized error includes statusCode: 502
     Requirements: llm-integration.3.11 */
  it('should include statusCode 502 in normalized error for APICallError', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 502,
      message: 'Bad gateway',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(502);
  });

  /* Preconditions: APICallError with statusCode 401
     Action: normalizeLLMError
     Assertions: normalized error includes statusCode: 401
     Requirements: llm-integration.3.11 */
  it('should include statusCode in normalized error for APICallError 401/403', () => {
    const normalized401 = normalizeLLMError({
      name: 'APICallError',
      statusCode: 401,
      message: 'Unauthorized',
    });
    expect(normalized401.type).toBe('auth');
    expect(normalized401.statusCode).toBe(401);

    const normalized403 = normalizeLLMError({
      name: 'APICallError',
      statusCode: 403,
      message: 'Forbidden',
    });
    expect(normalized403.type).toBe('auth');
    expect(normalized403.statusCode).toBe(403);
  });

  /* Preconditions: APICallError with statusCode 429
     Action: normalizeLLMError
     Assertions: normalized error includes statusCode: 429
     Requirements: llm-integration.3.11 */
  it('should include statusCode in normalized error for APICallError 429', () => {
    const normalized = normalizeLLMError({
      name: 'APICallError',
      statusCode: 429,
      message: 'Too many requests',
    });
    expect(normalized.type).toBe('rate_limit');
    expect(normalized.statusCode).toBe(429);
  });

  /* Preconditions: Error with no HTTP status code (network error, timeout, tool error)
     Action: normalizeLLMError
     Assertions: statusCode is undefined in normalized error
     Requirements: llm-integration.3.11 */
  it('should not include statusCode when original error has no HTTP status', () => {
    const networkError = normalizeLLMError({
      name: 'APICallError',
      message: 'fetch failed',
    });
    expect(networkError.type).toBe('network');
    expect(networkError.statusCode).toBeUndefined();

    const timeoutError = normalizeLLMError(
      new LLMRequestAbortedError('timeout', new Error('aborted'))
    );
    expect(timeoutError.type).toBe('timeout');
    expect(timeoutError.statusCode).toBeUndefined();

    const toolError = normalizeLLMError({
      name: 'ToolExecutionError',
      message: 'tool failed',
    });
    expect(toolError.type).toBe('tool');
    expect(toolError.statusCode).toBeUndefined();
  });

  /* Preconditions: RetryError wrapping APICallError with statusCode 401 in cause chain
     Action: normalizeLLMError
     Assertions: statusCode is extracted from cause chain
     Requirements: llm-integration.3.11 */
  it('should extract statusCode from RetryError cause chain', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Retries exhausted',
      cause: {
        name: 'APICallError',
        statusCode: 401,
        message: 'Unauthorized',
      },
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.statusCode).toBe(401);
  });

  /* Preconditions: RetryError wrapping APICallError with statusCode 503 in cause chain (generic fallback)
     Action: normalizeLLMError
     Assertions: statusCode is extracted from cause chain for generic RetryError
     Requirements: llm-integration.3.11 */
  it('should extract statusCode from RetryError cause chain for 5xx fallback', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Retries exhausted',
      cause: {
        name: 'APICallError',
        statusCode: 503,
        message: 'Service unavailable',
      },
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(503);
  });

  /* Preconditions: Real AI SDK APICallError uses name 'AI_APICallError' with statusCode 500
     Action: normalizeLLMError
     Assertions: mapped to provider with statusCode: 500
     Requirements: llm-integration.3.10, llm-integration.3.11 */
  it('maps AI_APICallError (real AI SDK name) with statusCode 500 to provider', () => {
    const normalized = normalizeLLMError({
      name: 'AI_APICallError',
      statusCode: 500,
      message: 'Internal Server Error',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(500);
    expect(normalized.message).toBe('Provider service unavailable. Please try again later.');
  });

  /* Preconditions: Real AI SDK APICallError uses name 'AI_APICallError' with statusCode 401
     Action: normalizeLLMError
     Assertions: mapped to auth with statusCode: 401
     Requirements: llm-integration.3.10, llm-integration.3.11 */
  it('maps AI_APICallError (real AI SDK name) with statusCode 401 to auth', () => {
    const normalized = normalizeLLMError({
      name: 'AI_APICallError',
      statusCode: 401,
      message: 'Unauthorized',
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.statusCode).toBe(401);
  });

  /* Preconditions: Real AI SDK RetryError (name: AI_RetryError) wraps AI_APICallError in lastError
     Action: normalizeLLMError
     Assertions: statusCode is extracted from lastError (not cause) for provider error
     Requirements: llm-integration.3.10, llm-integration.3.11 */
  it('maps AI_RetryError with AI_APICallError in lastError to provider with statusCode', () => {
    const normalized = normalizeLLMError({
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts.',
      lastError: {
        name: 'AI_APICallError',
        statusCode: 500,
        message: 'Internal Server Error',
      },
      errors: [
        {
          name: 'AI_APICallError',
          statusCode: 500,
          message: 'Internal Server Error',
        },
      ],
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.statusCode).toBe(500);
  });

  /* Preconditions: Real AI SDK RetryError wraps AI_APICallError 401 in lastError (auth scenario)
     Action: normalizeLLMError
     Assertions: statusCode is extracted from lastError for auth error
     Requirements: llm-integration.3.10, llm-integration.3.11 */
  it('maps AI_RetryError with AI_APICallError 401 in lastError to auth with statusCode', () => {
    const normalized = normalizeLLMError({
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts.',
      lastError: {
        name: 'AI_APICallError',
        statusCode: 401,
        message: 'Unauthorized',
      },
      errors: [
        {
          name: 'AI_APICallError',
          statusCode: 401,
          message: 'Unauthorized',
        },
      ],
    });
    expect(normalized.type).toBe('auth');
    expect(normalized.statusCode).toBe(401);
  });

  /* Preconditions: Real AI SDK RetryError wraps AI_APICallError 429 in errors[]
     Action: normalizeLLMError
     Assertions: statusCode extracted from errors array for rate limit
     Requirements: llm-integration.3.10, llm-integration.3.11 */
  it('maps AI_RetryError with AI_APICallError 429 in errors to rate_limit with statusCode', () => {
    const normalized = normalizeLLMError({
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts.',
      lastError: {
        name: 'AI_APICallError',
        statusCode: 429,
        message: 'Too many requests',
      },
      errors: [
        {
          name: 'AI_APICallError',
          statusCode: 429,
          message: 'Too many requests',
        },
      ],
    });
    expect(normalized.type).toBe('rate_limit');
    expect(normalized.statusCode).toBe(429);
  });
});
