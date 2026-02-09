// Requirements: ui.11.1, ui.11.3, ui.11.4

import { DateTimeFormatter } from '../../../../src/renderer/utils/DateTimeFormatter';

describe('DateTimeFormatter (Renderer Process)', () => {
  /* Preconditions: valid timestamp provided
     Action: call formatDate(timestamp)
     Assertions: returns non-empty string formatted with system locale
     Requirements: ui.11.1 */
  it('should use system locale for date formatting', () => {
    const timestamp = new Date('2026-02-07T10:30:00Z').getTime();
    const result = DateTimeFormatter.formatDate(timestamp);

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

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns string in YYYY-MM-DD HH:MM:SS±HH:MM format with timezone
     Requirements: ui.11.3, clerkly.3.2, clerkly.3.3 */
  it('should use fixed format for log timestamps with timezone', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  /* Preconditions: valid timestamp provided
     Action: call formatLogTimestamp(timestamp) multiple times
     Assertions: format is independent of system locale, always YYYY-MM-DD HH:MM:SS±HH:MM
     Requirements: clerkly.3.2, clerkly.3.3, ui.11.3 */
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
