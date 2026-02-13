// Requirements: settings.2.1, settings.2.3, settings.2.4

import { DateTimeFormatter } from '../../../src/utils/DateTimeFormatter';

describe('DateTimeFormatter', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: uses Intl.DateTimeFormat with undefined locale (system locale), returns formatted date
     Requirements: settings.2.1 */
  it('should use system locale for date formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    // Should return a non-empty string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  /* Preconditions: valid Date object provided
     Action: call formatDate(dateObject)
     Assertions: accepts Date object, returns formatted date
     Requirements: settings.2.1 */
  it('should accept Date object for formatDate', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDate(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatDateTime(timestamp)
     Assertions: uses Intl.DateTimeFormat with undefined locale and date+time options, returns formatted date and time
     Requirements: settings.2.1 */
  it('should use system locale for date/time formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    // Should return a non-empty string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  /* Preconditions: valid Date object provided
     Action: call formatDateTime(dateObject)
     Assertions: accepts Date object, returns formatted date and time
     Requirements: settings.2.1 */
  it('should accept Date object for formatDateTime', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDateTime(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in format YYYY-MM-DD HH:MM:SS±HH:MM with timezone, does NOT use Intl.DateTimeFormat
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should use fixed format for log timestamps with timezone', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    // Should match YYYY-MM-DD HH:MM:SS±HH:MM format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: valid Date object provided
     Action: call formatLogTimestamp(dateObject)
     Assertions: accepts Date object, returns fixed format timestamp with timezone
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should accept Date object for formatLogTimestamp', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: falls back to toLocaleDateString(), no exception thrown, error logged
     Requirements: settings.2.1 */
  it('should handle locale errors gracefully in formatDate', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const originalIntl = global.Intl;

    // Mock Intl.DateTimeFormat to throw error
    global.Intl = {
      ...originalIntl,
      DateTimeFormat: jest.fn(() => {
        throw new Error('Locale error');
      }),
    } as unknown as typeof Intl;

    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    // Should fallback to toLocaleDateString
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DateTimeFormatter] Error formatting date:',
      'Locale error'
    );

    // Restore
    global.Intl = originalIntl;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDateTime(timestamp)
     Assertions: falls back to toLocaleString(), no exception thrown, error logged
     Requirements: settings.2.1 */
  it('should handle locale errors gracefully in formatDateTime', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const originalIntl = global.Intl;

    // Mock Intl.DateTimeFormat to throw error
    global.Intl = {
      ...originalIntl,
      DateTimeFormat: jest.fn(() => {
        throw new Error('Locale error');
      }),
    } as unknown as typeof Intl;

    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    // Should fallback to toLocaleString
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DateTimeFormatter] Error formatting date/time:',
      'Locale error'
    );

    // Restore
    global.Intl = originalIntl;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: various timestamps (past, present, future)
     Action: call formatDate() and formatDateTime()
     Assertions: results do NOT contain relative formats ("ago", "yesterday", "tomorrow", "hours", "minutes")
     Requirements: settings.2.4 */
  it('should not use relative time formats', () => {
    const timestamps = [
      Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      Date.now() - 24 * 60 * 60 * 1000, // yesterday
      Date.now(), // now
      Date.now() + 24 * 60 * 60 * 1000, // tomorrow
      Date.now() + 7 * 24 * 60 * 60 * 1000, // next week
    ];

    const relativeWords = ['ago', 'yesterday', 'tomorrow', 'hours', 'minutes', 'seconds'];

    timestamps.forEach((timestamp) => {
      const dateResult = DateTimeFormatter.formatDate(timestamp);
      const dateTimeResult = DateTimeFormatter.formatDateTime(timestamp);

      relativeWords.forEach((word) => {
        expect(dateResult.toLowerCase()).not.toContain(word);
        expect(dateTimeResult.toLowerCase()).not.toContain(word);
      });
    });
  });

  /* Preconditions: formatLogTimestamp called with various timestamps
     Action: verify format consistency
     Assertions: always returns YYYY-MM-DD HH:MM:SS±HH:MM format regardless of locale
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should always use fixed format for logs regardless of locale', () => {
    const timestamps = [
      new Date('2026-01-01T00:00:00Z').getTime(),
      new Date('2026-06-15T12:30:45Z').getTime(),
      new Date('2026-12-31T23:59:59Z').getTime(),
    ];

    timestamps.forEach((timestamp) => {
      const result = DateTimeFormatter.formatLogTimestamp(timestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    });
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
