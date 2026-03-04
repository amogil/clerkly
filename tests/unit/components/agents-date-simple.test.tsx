/**
 * @jest-environment jsdom
 */

// Requirements: agents.8.1, settings.2.1
// Simple unit test for date formatting in Agents component

import { DateTimeFormatter } from '../../../src/shared/utils/DateTimeFormatter';

describe('Agents Component - Date Formatting (Simple)', () => {
  /* Preconditions: DateTimeFormatter exists
     Action: Call formatDateTime with ISO timestamp
     Assertions: Returns formatted date string using OS system settings
     Requirements: settings.2.1 */
  it('should format date using DateTimeFormatter', () => {
    const timestamp = new Date('2024-01-16T14:45:00+03:00');
    const formatted = DateTimeFormatter.formatDateTime(timestamp);

    // Should return a formatted string (exact format depends on OS system settings)
    expect(formatted).toBeTruthy();
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  /* Preconditions: Agent has both createdAt and updatedAt
     Action: Verify updatedAt is more recent than createdAt
     Assertions: updatedAt timestamp is later
     Requirements: agents.8.1 */
  it('should use updatedAt which is more recent than createdAt', () => {
    const agent = {
      agentId: 'test-1',
      userId: 'user-1',
      name: 'Test Agent',
      createdAt: '2024-01-15T10:00:00+03:00',
      updatedAt: '2024-01-16T14:45:00+03:00',
    };

    const createdDate = new Date(agent.createdAt);
    const updatedDate = new Date(agent.updatedAt);

    // updatedAt should be more recent
    expect(updatedDate.getTime()).toBeGreaterThan(createdDate.getTime());
  });

  /* Preconditions: DateTimeFormatter.formatDateTime exists
     Action: Format both createdAt and updatedAt
     Assertions: Both return valid formatted strings
     Requirements: settings.2.1 */
  it('should format both createdAt and updatedAt timestamps', () => {
    const createdAt = new Date('2024-01-15T10:00:00+03:00');
    const updatedAt = new Date('2024-01-16T14:45:00+03:00');

    const formattedCreated = DateTimeFormatter.formatDateTime(createdAt);
    const formattedUpdated = DateTimeFormatter.formatDateTime(updatedAt);

    expect(formattedCreated).toBeTruthy();
    expect(formattedUpdated).toBeTruthy();
    expect(typeof formattedCreated).toBe('string');
    expect(typeof formattedUpdated).toBe('string');
  });
});

/* Preconditions: Agent timestamp is ISO string
     Action: Convert string to Date before formatting
     Assertions: Formatted result is not ISO string
     Requirements: agents.8.1, settings.2.1 */
it('should convert ISO string to Date before formatting', () => {
  const isoString = '2024-01-16T14:45:00+03:00';
  const dateObject = new Date(isoString);
  const formatted = DateTimeFormatter.formatDateTime(dateObject);

  // Formatted string should NOT be the same as ISO string
  expect(formatted).not.toBe(isoString);
  // Should be a formatted date string
  expect(formatted).toBeTruthy();
  expect(typeof formatted).toBe('string');
});
