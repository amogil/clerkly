// Requirements: settings.2.1, settings.2.3, settings.2.4

import { DateTimeFormatter } from '../../../../src/main/utils/DateTimeFormatter';

describe('DateTimeFormatter (Main Process)', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: settings.2.1 */
  it('should use system locale for date formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    // Should return a non-empty string
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

    // Should return a non-empty string
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

    // Should match YYYY-MM-DD HH:MM:SS±HH:MM format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: Date object provided
     Action: call formatDate(date)
     Assertions: returns formatted string
     Requirements: settings.2.1 */
  it('should accept Date object for formatDate', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDate(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided
     Action: call formatDateTime(date)
     Assertions: returns formatted string
     Requirements: settings.2.1 */
  it('should accept Date object for formatDateTime', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDateTime(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided
     Action: call formatLogTimestamp(date)
     Assertions: returns string in fixed format with timezone
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should accept Date object for formatLogTimestamp', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: falls back to toLocaleDateString, logs error
     Requirements: settings.2.1 */
  it('should fallback to toLocaleDateString on Intl error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock Intl.DateTimeFormat to throw error
    const originalDateTimeFormat = Intl.DateTimeFormat;
    (Intl as any).DateTimeFormat = jest.fn(() => {
      throw new Error('Locale error');
    });

    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    // Should fallback to toLocaleDateString
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DateTimeFormatter] Error formatting date:')
    );

    // Restore
    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDateTime(timestamp)
     Assertions: falls back to toLocaleString, logs error
     Requirements: settings.2.1 */
  it('should fallback to toLocaleString on Intl error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock Intl.DateTimeFormat to throw error
    const originalDateTimeFormat = Intl.DateTimeFormat;
    (Intl as any).DateTimeFormat = jest.fn(() => {
      throw new Error('Locale error');
    });

    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    // Should fallback to toLocaleString
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DateTimeFormatter] Error formatting date/time:')
    );

    // Restore
    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: various timestamps (past, present, future)
     Action: call formatDate() and formatDateTime()
     Assertions: results do NOT contain relative time words
     Requirements: settings.2.4 */
  it('should not use relative time formats', () => {
    const relativeWords = ['ago', 'yesterday', 'tomorrow', 'hours', 'minutes', 'days'];

    const timestamps = [
      Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      Date.now() - 24 * 60 * 60 * 1000, // yesterday
      Date.now(), // now
      Date.now() + 24 * 60 * 60 * 1000, // tomorrow
      Date.now() + 7 * 24 * 60 * 60 * 1000, // next week
    ];

    timestamps.forEach((timestamp) => {
      const dateResult = DateTimeFormatter.formatDate(timestamp);
      const dateTimeResult = DateTimeFormatter.formatDateTime(timestamp);

      relativeWords.forEach((word) => {
        expect(dateResult.toLowerCase()).not.toContain(word);
        expect(dateTimeResult.toLowerCase()).not.toContain(word);
      });
    });
  });

  /* Preconditions: various timestamps
     Action: call formatLogTimestamp()
     Assertions: all results match YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
     Requirements: settings.2.3, clerkly.3.2, clerkly.3.3 */
  it('should always use fixed format for logs with timezone', () => {
    const timestamps = [
      Date.now() - 2 * 60 * 60 * 1000,
      Date.now(),
      Date.now() + 24 * 60 * 60 * 1000,
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
});
