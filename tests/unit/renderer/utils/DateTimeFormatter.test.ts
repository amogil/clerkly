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
     Assertions: returns string in YYYY-MM-DD HH:MM:SS format
     Requirements: ui.11.3 */
  it('should use fixed format for log timestamps', () => {
    const timestamp = new Date('2026-02-07T10:30:45Z').getTime();
    const result = DateTimeFormatter.formatLogTimestamp(timestamp);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
