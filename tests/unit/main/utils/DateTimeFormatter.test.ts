// Requirements: ui.11.1, ui.11.3, ui.11.4

import { DateTimeFormatter } from '../../../../src/main/utils/DateTimeFormatter';

describe('DateTimeFormatter (Main Process)', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: ui.11.1 */
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
     Requirements: ui.11.1 */
  it('should use system locale for date/time formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    // Should return a non-empty string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in YYYY-MM-DD HH:MM:SS format
     Requirements: ui.11.3 */
  it('should use fixed format for log timestamps', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    // Should match YYYY-MM-DD HH:MM:SS format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  /* Preconditions: Date object provided
     Action: call formatDate(date)
     Assertions: returns formatted string
     Requirements: ui.11.1 */
  it('should accept Date object for formatDate', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDate(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided
     Action: call formatDateTime(date)
     Assertions: returns formatted string
     Requirements: ui.11.1 */
  it('should accept Date object for formatDateTime', () => {
    const date = new Date('2026-02-07T10:30:00Z');
    const result = DateTimeFormatter.formatDateTime(date);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: Date object provided
     Action: call formatLogTimestamp(date)
     Assertions: returns string in fixed format
     Requirements: ui.11.3 */
  it('should accept Date object for formatLogTimestamp', () => {
    const date = new Date('2026-02-07T10:30:45Z');
    const result = DateTimeFormatter.formatLogTimestamp(date);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: falls back to toLocaleDateString, logs error
     Requirements: ui.11.1 */
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
      '[DateTimeFormatter] Error formatting date:',
      'Locale error'
    );

    // Restore
    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDateTime(timestamp)
     Assertions: falls back to toLocaleString, logs error
     Requirements: ui.11.1 */
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
      '[DateTimeFormatter] Error formatting date/time:',
      'Locale error'
    );

    // Restore
    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: various timestamps (past, present, future)
     Action: call formatDate() and formatDateTime()
     Assertions: results do NOT contain relative time words
     Requirements: ui.11.4 */
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
     Assertions: all results match YYYY-MM-DD HH:MM:SS format
     Requirements: ui.11.3 */
  it('should always use fixed format for logs', () => {
    const timestamps = [
      Date.now() - 2 * 60 * 60 * 1000,
      Date.now(),
      Date.now() + 24 * 60 * 60 * 1000,
    ];

    timestamps.forEach((timestamp) => {
      const result = DateTimeFormatter.formatLogTimestamp(timestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});
