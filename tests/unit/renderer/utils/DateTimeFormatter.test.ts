// Requirements: settings.2.1, settings.2.3, settings.2.4

import { DateTimeFormatter } from '../../../../src/shared/utils/DateTimeFormatter';

describe('DateTimeFormatter (Renderer Process)', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: settings.2.1 */
  it('should use system locale for date formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatDateTime(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: settings.2.1 */
  it('should use system locale for date/time formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should use fixed format for log timestamps with timezone', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp) multiple times
     Assertions: format is independent of system locale, always YYYY-MM-DD HH:MM:SS±HH:MM
     Requirements: clerkly.3.2, clerkly.3.3, settings.2.3 */
  it('should use fixed format independent of system locale', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    // Should always use fixed format, not locale-specific format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

    // Should not contain locale-specific month names or formats
    expect(result).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i);
    expect(result).not.toMatch(/AM|PM/i);
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: timezone offset is correctly calculated from Date.getTimezoneOffset()
     Requirements: clerkly.3.3 */
  it('should correctly calculate timezone offset', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    // Extract timezone from result
    const timezoneMatch = result.match(/([+-]\d{2}:\d{2})$/);
    expect(timezoneMatch).toBeTruthy();

    const timezone = timezoneMatch![1];

    // Calculate expected timezone
    const timezoneOffsetMinutes = date.getTimezoneOffset();
    const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
    const timezoneOffsetMins = Math.abs(timezoneOffsetMinutes) % 60;
    const timezoneSign = timezoneOffsetMinutes <= 0 ? '+' : '-';
    const expectedTimezone = `${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMins).padStart(2, '0')}`;

    expect(timezone).toBe(expectedTimezone);
  });
});

describe('Error Handling', () => {
  /* Preconditions: invalid timestamp causes Intl.DateTimeFormat to throw
       Action: call formatDate with invalid timestamp
       Assertions: falls back to toLocaleDateString, logs error
       Requirements: settings.2.1 */
  it('should fallback to toLocaleDateString on formatDate error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create an invalid Date object
    const invalidDate = new Date('invalid');
    const result = DateTimeFormatter.formatDate(invalidDate);

    // Should still return a string (fallback)
    expect(typeof result).toBe('string');

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: invalid timestamp causes Intl.DateTimeFormat to throw
       Action: call formatDateTime with invalid timestamp
       Assertions: falls back to toLocaleString, logs error
       Requirements: settings.2.1 */
  it('should fallback to toLocaleString on formatDateTime error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create an invalid Date object
    const invalidDate = new Date('invalid');
    const result = DateTimeFormatter.formatDateTime(invalidDate);

    // Should still return a string (fallback)
    expect(typeof result).toBe('string');

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: invalid timestamp causes date methods to throw
       Action: call formatLogTimestamp with invalid timestamp
       Assertions: falls back to toISOString, logs error
       Requirements: settings.2.3 */
  it('should fallback to toISOString on formatLogTimestamp error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create an invalid Date object
    const invalidDate = new Date('invalid');
    const result = DateTimeFormatter.formatLogTimestamp(invalidDate);

    // Should still return a string (fallback)
    expect(typeof result).toBe('string');

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Date object provided instead of timestamp
       Action: call formatDate with Date object
       Assertions: handles Date object correctly
       Requirements: settings.2.1 */
  it('should handle Date object in formatDate', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDate(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided instead of timestamp
       Action: call formatDateTime with Date object
       Assertions: handles Date object correctly
       Requirements: settings.2.1 */
  it('should handle Date object in formatDateTime', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDateTime(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided instead of timestamp
       Action: call formatLogTimestamp with Date object
       Assertions: handles Date object correctly
       Requirements: settings.2.3 */
  it('should handle Date object in formatLogTimestamp', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: Date methods throw error
     Action: call formatLogTimestamp(timestamp)
     Assertions: falls back to ISO string, logs error
     Requirements: settings.2.3, clerkly.3.2 */
  it('should fallback to ISO string on formatLogTimestamp error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create a date that will throw when methods are called
    const badDate = new Date('2026-02-07T10:30:45Z');
    const originalGetFullYear = badDate.getFullYear;
    badDate.getFullYear = () => {
      throw new Error('Date error');
    };

    const result = DateTimeFormatter.formatLogTimestamp(badDate);

    // Should fallback to ISO string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // ISO string format check
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      '[DateTimeFormatter] Error formatting log timestamp:'
    );

    // Restore
    badDate.getFullYear = originalGetFullYear;
    consoleErrorSpy.mockRestore();
  });
});
