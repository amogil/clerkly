// Requirements: settings.3.1, settings.3.3, settings.3.4

import { DateTimeFormatter } from '../../../src/shared/utils/DateTimeFormatter';

describe('DateTimeFormatter (Shared Re-export)', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: settings.3.1 */
  it('should use system locale for date formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatDateTime(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: settings.3.1 */
  it('should use system locale for date/time formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDateTime(timestamp);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
     Requirements: settings.3.3, clerkly.3.2, clerkly.3.3 */
  it('should use fixed format for log timestamps with timezone', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: falls back to toLocaleDateString, logs error
     Requirements: settings.3.1 */
  it('should fallback to toLocaleDateString on Intl error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const originalDateTimeFormat = Intl.DateTimeFormat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = jest.fn(() => {
      throw new Error('Locale error');
    });

    const result = DateTimeFormatter.formatDate(new Date('2026-02-07T10:30:00Z').getTime());
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DateTimeFormatter] Error formatting date:')
    );

    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDateTime(timestamp)
     Assertions: falls back to toLocaleString, logs error
     Requirements: settings.3.1 */
  it('should fallback to toLocaleString on Intl error', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const originalDateTimeFormat = Intl.DateTimeFormat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = jest.fn(() => {
      throw new Error('Locale error');
    });

    const result = DateTimeFormatter.formatDateTime(new Date('2026-02-07T10:30:00Z').getTime());
    expect(typeof result).toBe('string');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DateTimeFormatter] Error formatting date/time:')
    );

    Intl.DateTimeFormat = originalDateTimeFormat;
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: various timestamps
     Action: call formatDate() and formatDateTime()
     Assertions: results do NOT contain relative formats
     Requirements: settings.3.4 */
  it('should not use relative time formats', () => {
    const relativeWords = ['ago', 'yesterday', 'tomorrow', 'hours', 'minutes', 'days'];
    const timestamps = [
      Date.now() - 2 * 60 * 60 * 1000,
      Date.now() - 24 * 60 * 60 * 1000,
      Date.now(),
      Date.now() + 24 * 60 * 60 * 1000,
      Date.now() + 7 * 24 * 60 * 60 * 1000,
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
});
