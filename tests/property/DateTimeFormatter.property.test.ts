// Requirements: ui.11.1, ui.11.3, ui.11.4

import * as fc from 'fast-check';
import { DateTimeFormatter } from '../../src/utils/DateTimeFormatter';

describe('DateTimeFormatter Property-Based Tests', () => {
  /* Preconditions: various random timestamps generated
     Action: call formatDate() and formatDateTime() for each timestamp
     Assertions: results are non-empty strings, do not throw errors
     Requirements: ui.11.1 */
  it('should format any valid timestamp without errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        (timestamp) => {
          const dateResult = DateTimeFormatter.formatDate(timestamp);
          const dateTimeResult = DateTimeFormatter.formatDateTime(timestamp);

          expect(dateResult).toBeTruthy();
          expect(typeof dateResult).toBe('string');
          expect(dateResult.length).toBeGreaterThan(0);

          expect(dateTimeResult).toBeTruthy();
          expect(typeof dateTimeResult).toBe('string');
          expect(dateTimeResult.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: various random timestamps generated
     Action: call formatLogTimestamp() for each timestamp
     Assertions: result matches YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
     Requirements: ui.11.3, clerkly.3.2, clerkly.3.3 */
  it('should always use fixed format for log timestamps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        (timestamp) => {
          const result = DateTimeFormatter.formatLogTimestamp(timestamp);

          // Must match YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: various random timestamps (past, present, future)
     Action: call formatDate() and formatDateTime()
     Assertions: results do NOT contain relative format words
     Requirements: ui.11.4 */
  it('should never use relative time formats', () => {
    const relativeWords = ['ago', 'yesterday', 'tomorrow', 'hours', 'minutes', 'seconds', 'days'];

    fc.assert(
      fc.property(
        fc.integer({
          min: Date.now() - 365 * 24 * 60 * 60 * 1000,
          max: Date.now() + 365 * 24 * 60 * 60 * 1000,
        }),
        (timestamp) => {
          const dateResult = DateTimeFormatter.formatDate(timestamp);
          const dateTimeResult = DateTimeFormatter.formatDateTime(timestamp);

          relativeWords.forEach((word) => {
            expect(dateResult.toLowerCase()).not.toContain(word);
            expect(dateTimeResult.toLowerCase()).not.toContain(word);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Date objects created from various timestamps
     Action: call all formatting methods with Date objects
     Assertions: all methods accept Date objects and return valid results
     Requirements: ui.11.1, ui.11.3, clerkly.3.2, clerkly.3.3 */
  it('should accept both timestamps and Date objects', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        (timestamp) => {
          const date = new Date(timestamp);

          const dateResult = DateTimeFormatter.formatDate(date);
          const dateTimeResult = DateTimeFormatter.formatDateTime(date);
          const logResult = DateTimeFormatter.formatLogTimestamp(date);

          expect(dateResult).toBeTruthy();
          expect(dateTimeResult).toBeTruthy();
          expect(logResult).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: various timestamps with different time components
     Action: call formatLogTimestamp()
     Assertions: format is consistent and parseable with timezone
     Requirements: ui.11.3, clerkly.3.2, clerkly.3.3 */
  it('should produce parseable log timestamps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        (timestamp) => {
          const result = DateTimeFormatter.formatLogTimestamp(timestamp);

          // Parse the result with timezone
          const match = result.match(
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/
          );
          expect(match).not.toBeNull();

          if (match) {
            const [, year, month, day, hours, minutes, seconds, timezone] = match;

            // Validate ranges
            expect(parseInt(year)).toBeGreaterThanOrEqual(1970);
            expect(parseInt(month)).toBeGreaterThanOrEqual(1);
            expect(parseInt(month)).toBeLessThanOrEqual(12);
            expect(parseInt(day)).toBeGreaterThanOrEqual(1);
            expect(parseInt(day)).toBeLessThanOrEqual(31);
            expect(parseInt(hours)).toBeGreaterThanOrEqual(0);
            expect(parseInt(hours)).toBeLessThanOrEqual(23);
            expect(parseInt(minutes)).toBeGreaterThanOrEqual(0);
            expect(parseInt(minutes)).toBeLessThanOrEqual(59);
            expect(parseInt(seconds)).toBeGreaterThanOrEqual(0);
            expect(parseInt(seconds)).toBeLessThanOrEqual(59);

            // Validate timezone format
            expect(timezone).toMatch(/^[+-]\d{2}:\d{2}$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
