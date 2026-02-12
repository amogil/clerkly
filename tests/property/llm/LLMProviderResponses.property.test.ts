// Requirements: settings.3.8

import * as fc from 'fast-check';
import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import { ERROR_MESSAGES } from '../../../src/main/llm/LLMConfig';

// Mock global fetch
global.fetch = jest.fn();

describe('LLM Provider Responses Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 11: HTTP Status Code Handling
   * For any HTTP status code, providers must return appropriate error messages
   * **Validates: Requirement settings.3.8**
   */
  describe('Property 11: HTTP Status Code Handling', () => {
    /* Preconditions: Any HTTP status code provided
       Action: Test connection with various HTTP status codes
       Assertions: Provider returns appropriate error message for each status
       Requirements: settings.3.8 */
    it('should handle various HTTP status codes correctly', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 200, max: 599 }),
          fc.constantFrom(...providers),
          async (statusCode, provider) => {
            // Mock fetch response
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: statusCode >= 200 && statusCode < 300,
              status: statusCode,
              json: async () => ({ error: { message: 'Test error' } }),
            });

            const result = await provider.testConnection('test-key');

            // Property: Success only for 2xx status codes
            if (statusCode >= 200 && statusCode < 300) {
              expect(result.success).toBe(true);
              expect(result.error).toBeUndefined();
            } else {
              expect(result.success).toBe(false);
              expect(result.error).toBeDefined();
              expect(typeof result.error).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Known error status codes (401, 403, 429, 500, 502, 503)
       Action: Test connection with known error status codes
       Assertions: Provider returns specific error messages from ERROR_MESSAGES
       Requirements: settings.3.8 */
    it('should return specific error messages for known status codes', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      const knownStatuses = [401, 403, 429, 500, 502, 503];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...knownStatuses),
          fc.constantFrom(...providers),
          async (statusCode, provider) => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false,
              status: statusCode,
              json: async () => ({}),
            });

            const result = await provider.testConnection('test-key');

            // Property: Known status codes return specific error messages
            expect(result.success).toBe(false);
            expect(result.error).toBe(ERROR_MESSAGES[statusCode as keyof typeof ERROR_MESSAGES]);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Unknown error status codes (not in ERROR_MESSAGES)
       Action: Test connection with unknown status codes
       Assertions: Provider returns generic error message with API error details
       Requirements: settings.3.8 */
    it('should return generic error message for unknown status codes', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc
            .integer({ min: 400, max: 599 })
            .filter((code) => ![401, 403, 429, 500, 502, 503].includes(code)),
          fc.constantFrom(...providers),
          fc.string({ minLength: 5, maxLength: 100 }),
          async (statusCode, provider, errorMessage) => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false,
              status: statusCode,
              json: async () => ({ error: { message: errorMessage } }),
            });

            const result = await provider.testConnection('test-key');

            // Property: Unknown status codes return custom error message
            expect(result.success).toBe(false);
            expect(result.error).toBe(`Connection failed: ${errorMessage}`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 12: Error Response Format Handling
   * For any error response format, providers must extract error message correctly
   * **Validates: Requirement settings.3.8**
   */
  describe('Property 12: Error Response Format Handling', () => {
    /* Preconditions: Various error response formats
       Action: Test connection with different error response structures
       Assertions: Provider extracts error message correctly or uses fallback
       Requirements: settings.3.8 */
    it('should handle various error response formats', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...providers),
          fc.string({ minLength: 5, maxLength: 100 }),
          fc.oneof(
            // Format 1: { error: { message: "..." } }
            fc.record({ error: fc.record({ message: fc.string() }) }),
            // Format 2: { error: "..." }
            fc.record({ error: fc.string() }),
            // Format 3: { message: "..." }
            fc.record({ message: fc.string() }),
            // Format 4: Empty object
            fc.constant({}),
            // Format 5: null
            fc.constant(null)
          ),
          async (provider, apiKey, errorData) => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false,
              status: 400,
              json: async () => errorData,
            });

            const result = await provider.testConnection(apiKey);

            // Property: Always returns error result
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            if (result.error) {
              expect(result.error.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: JSON parsing fails
       Action: Test connection when response.json() throws error
       Assertions: Provider handles JSON parsing error gracefully
       Requirements: settings.3.8 */
    it('should handle JSON parsing errors gracefully', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...providers),
          fc.integer({ min: 400, max: 599 }),
          async (provider, statusCode) => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false,
              status: statusCode,
              json: async () => {
                throw new Error('Invalid JSON');
              },
            });

            const result = await provider.testConnection('test-key');

            // Property: Returns error with appropriate message
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 13: Network Error Handling
   * For any network error, providers must return appropriate error messages
   * **Validates: Requirement settings.3.8**
   */
  describe('Property 13: Network Error Handling', () => {
    /* Preconditions: Various network errors
       Action: Test connection with different network error types
       Assertions: Provider returns appropriate error message for each error type
       Requirements: settings.3.8 */
    it('should handle various network errors correctly', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...providers),
          fc.oneof(
            // AbortError (timeout)
            fc.constant({ name: 'AbortError', message: 'The operation was aborted' }),
            // TimeoutError
            fc.constant({ name: 'TimeoutError', message: 'Request timeout' }),
            // Network error
            fc.constant({ name: 'NetworkError', message: 'Network failure' }),
            // Generic error
            fc.constant({ name: 'Error', message: 'Something went wrong' })
          ),
          async (provider, errorObj) => {
            const error = new Error(errorObj.message);
            error.name = errorObj.name;
            (global.fetch as jest.Mock).mockRejectedValueOnce(error);

            const result = await provider.testConnection('test-key');

            // Property: Always returns error result
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();

            // Property: Timeout errors return timeout message
            if (errorObj.name === 'AbortError' || errorObj.name === 'TimeoutError') {
              expect(result.error).toBe(ERROR_MESSAGES.timeout);
            } else {
              // Property: Other errors return network error message
              expect(result.error).toBe(ERROR_MESSAGES.network);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Any API key string
       Action: Test connection with network error
       Assertions: Error message does not contain API key
       Requirements: settings.3.8 */
    it('should not leak API key in error messages', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...providers),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (provider, apiKey) => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

            const result = await provider.testConnection(apiKey);

            // Property: Error message does not contain API key
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).not.toContain(apiKey);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Provider Consistency
   * All providers must handle errors consistently
   * **Validates: Requirement settings.3.8**
   */
  describe('Property 14: Provider Consistency', () => {
    /* Preconditions: Same error conditions for all providers
       Action: Test all providers with same error status code
       Assertions: All providers return same error message
       Requirements: settings.3.8 */
    it('should return consistent error messages across providers', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      const knownStatuses = [401, 403, 429, 500, 502, 503];

      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...knownStatuses), async (statusCode) => {
          const results = [];

          for (const provider of providers) {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false,
              status: statusCode,
              json: async () => ({}),
            });

            const result = await provider.testConnection('test-key');
            results.push(result);
          }

          // Property: All providers return same error message for same status
          const firstError = results[0].error;
          for (const result of results) {
            expect(result.success).toBe(false);
            expect(result.error).toBe(firstError);
          }
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Same network error for all providers
       Action: Test all providers with same network error
       Assertions: All providers return same error message
       Requirements: settings.3.8 */
    it('should return consistent network error messages across providers', async () => {
      const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('AbortError', 'TimeoutError', 'NetworkError'),
          async (errorName) => {
            const results = [];

            for (const provider of providers) {
              const error = new Error('Test error');
              error.name = errorName;
              (global.fetch as jest.Mock).mockRejectedValueOnce(error);

              const result = await provider.testConnection('test-key');
              results.push(result);
            }

            // Property: All providers return same error message for same error type
            const firstError = results[0].error;
            for (const result of results) {
              expect(result.success).toBe(false);
              expect(result.error).toBe(firstError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
