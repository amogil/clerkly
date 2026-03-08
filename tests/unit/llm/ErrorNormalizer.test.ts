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

  /* Preconditions: RetryError from SDK
     Action: normalizeLLMError
     Assertions: mapped to provider
     Requirements: llm-integration.3.10 */
  it('maps RetryError to provider', () => {
    const normalized = normalizeLLMError({
      name: 'RetryError',
      message: 'Retries exhausted',
    });
    expect(normalized.type).toBe('provider');
    expect(normalized.message).toBe('Provider service unavailable. Please try again later.');
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
    expect(normalized.message).toBe('Tool execution failed. Please try again.');
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
    expect(normalized.message).toBe('Response stream error. Please try again.');
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
});
