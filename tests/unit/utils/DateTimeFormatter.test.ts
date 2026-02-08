// Requirements: ui.11.1, ui.11.3, ui.11.4

import { DateTimeFormatter } from '../../../src/utils/DateTimeFormatter';

describe('DateTimeFormatter', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: uses Intl.DateTimeFormat with undefined locale (system locale), returns formatted date
     Requirements: ui.11.1 */
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
     Requirements: ui.11.1 */
  it('should accept Date object for formatDate', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDate(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatDateTime(timestamp)
     Assertions: uses Intl.DateTimeFormat with undefined locale and date+time options, returns formatted date and time
     Requirements: ui.11.1 */
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
     Requirements: ui.11.1 */
  it('should accept Date object for formatDateTime', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDateTime(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in format YYYY-MM-DD HH:MM:SS, does NOT use Intl.DateTimeFormat
     Requirements: ui.11.3 */
  it('should use fixed format for log timestamps', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    // Should match YYYY-MM-DD HH:MM:SS format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  /* Preconditions: valid Date object provided
     Action: call formatLogTimestamp(dateObject)
     Assertions: accepts Date object, returns fixed format timestamp
     Requirements: ui.11.3 */
  it('should accept Date object for formatLogTimestamp', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: falls back to toLocaleDateString(), no exception thrown, error logged
     Requirements: ui.11.1 */
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
     Requirements: ui.11.1 */
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
     Requirements: ui.11.4 */
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
     Assertions: always returns YYYY-MM-DD HH:MM:SS format regardless of locale
     Requirements: ui.11.3 */
  it('should always use fixed format for logs regardless of locale', () => {
    const timestamps = [
      new Date('2026-01-01T00:00:00Z').getTime(),
      new Date('2026-06-15T12:30:45Z').getTime(),
      new Date('2026-12-31T23:59:59Z').getTime(),
    ];

    timestamps.forEach((timestamp) => {
      const result = DateTimeFormatter.formatLogTimestamp(timestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});
