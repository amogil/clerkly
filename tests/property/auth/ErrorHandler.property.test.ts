// Requirements: google-oauth-auth.9.3

import * as fc from 'fast-check';
import { getErrorDetails, createErrorResponse } from '../../../src/main/auth/ErrorHandler';

describe('ErrorHandler Property-Based Tests', () => {
  /**
   * Property 16: Error Propagation
   * For any error returned by Google OAuth API, the OAuth client must propagate
   * the error code and description without modification.
   * **Validates: Requirements 9.3**
   */
  describe('Property 16: Error Propagation', () => {
    /* Preconditions: Any error code and message from OAuth API
       Action: Create error response with code and message
       Assertions: Error code and message are preserved exactly as provided
       Requirements: google-oauth-auth.9.3 */
    it('should propagate error code and message without modification', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (errorCode, errorMessage) => {
            const response = createErrorResponse(errorMessage, errorCode);

            // Property: Error code is preserved exactly
            expect(response.errorCode).toBe(errorCode);

            // Property: Error message is preserved exactly
            expect(response.error).toBe(errorMessage);

            // Property: Response structure is consistent
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Various error codes including known and unknown
       Action: Get error details for any error code
       Assertions: Function always returns valid ErrorDetails structure
       Requirements: google-oauth-auth.9.3 */
    it('should always return valid error details structure', () => {
      // JavaScript special properties that should be filtered out
      const specialProperties = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
      ];

      fc.assert(
        fc.property(
          fc.option(
            fc.string().filter((s) => !specialProperties.includes(s)),
            { nil: undefined }
          ),
          fc.option(fc.string(), { nil: undefined }),
          (errorCode, errorMessage) => {
            const details = getErrorDetails(errorCode, errorMessage);

            // Property: Always returns ErrorDetails structure
            expect(details).toHaveProperty('title');
            expect(details).toHaveProperty('message');
            expect(details).toHaveProperty('suggestion');

            // Property: All fields are non-empty strings
            expect(typeof details.title).toBe('string');
            expect(typeof details.message).toBe('string');
            expect(typeof details.suggestion).toBe('string');
            expect(details.title.length).toBeGreaterThan(0);
            expect(details.message.length).toBeGreaterThan(0);
            expect(details.suggestion.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Known error codes from OAuth spec
       Action: Get error details for known error codes
       Assertions: Returns consistent details for same error code
       Requirements: google-oauth-auth.9.3 */
    it('should return consistent details for known error codes', () => {
      const knownErrorCodes = [
        'popup_closed_by_user',
        'access_denied',
        'network_error',
        'invalid_grant',
        'invalid_request',
        'server_error',
        'temporarily_unavailable',
        'csrf_attack_detected',
        'database_error',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...knownErrorCodes), (errorCode) => {
          const details1 = getErrorDetails(errorCode);
          const details2 = getErrorDetails(errorCode);

          // Property: Same error code always returns same details
          expect(details1).toEqual(details2);

          // Property: Known error codes have specific titles (not default)
          expect(details1.title).not.toBe('Authentication failed');
        }),
        { numRuns: 50 }
      );
    });

    /* Preconditions: Unknown error codes with custom messages
       Action: Get error details for unknown codes with various messages
       Assertions: Custom message is used when provided, default otherwise
       Requirements: google-oauth-auth.9.3 */
    it('should use custom message for unknown error codes', () => {
      const knownErrorCodes = [
        'popup_closed_by_user',
        'access_denied',
        'network_error',
        'invalid_grant',
        'invalid_request',
        'server_error',
        'temporarily_unavailable',
        'csrf_attack_detected',
        'database_error',
      ];

      // JavaScript special properties that should be filtered out
      const specialProperties = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
      ];

      fc.assert(
        fc.property(
          fc
            .string()
            .filter(
              (s) => !knownErrorCodes.includes(s) && !specialProperties.includes(s) && s.length > 0
            ),
          fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          (unknownCode, customMessage) => {
            const details = getErrorDetails(unknownCode, customMessage);

            // Property: Unknown codes get default title
            expect(details.title).toBe('Authentication failed');

            // Property: Custom message is used if provided
            if (customMessage) {
              expect(details.message).toBe(customMessage);
            } else {
              expect(details.message).toBe('An unexpected error occurred during authentication.');
            }

            // Property: Default suggestion is provided
            expect(details.suggestion).toBe(
              'Please try signing in again or contact support if the problem persists.'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Error response created with various parameters
       Action: Create error responses with different combinations of parameters
       Assertions: Response structure is always consistent
       Requirements: google-oauth-auth.9.3 */
    it('should maintain consistent error response structure', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.option(fc.string(), { nil: undefined }),
          fc.option(fc.object(), {
            nil: undefined,
          }),
          (error, errorCode, details) => {
            const response = createErrorResponse(error, errorCode, details);

            // Property: Always has success: false
            expect(response.success).toBe(false);

            // Property: Always has error field
            expect(response).toHaveProperty('error');
            expect(response.error).toBe(error);

            // Property: errorCode is preserved if provided
            if (errorCode) {
              expect(response.errorCode).toBe(errorCode);
            }

            // Property: details are preserved if provided
            if (details !== undefined) {
              expect(response.details).toBe(details);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Multiple error responses created in sequence
       Action: Create multiple error responses with different errors
       Assertions: Each response is independent and correct
       Requirements: google-oauth-auth.9.3 */
    it('should handle multiple error responses independently', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              error: fc.string({ minLength: 1 }),
              errorCode: fc.option(fc.string(), { nil: undefined }),
              details: fc.option(fc.object(), {
                nil: undefined,
              }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (errors) => {
            const responses = errors.map((e) =>
              createErrorResponse(e.error, e.errorCode, e.details)
            );

            // Property: Each response matches its input
            responses.forEach((response, index) => {
              expect(response.error).toBe(errors[index].error);
              if (errors[index].errorCode) {
                expect(response.errorCode).toBe(errors[index].errorCode);
              }
              expect(response.success).toBe(false);
            });

            // Property: Responses are independent
            expect(responses.length).toBe(errors.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
