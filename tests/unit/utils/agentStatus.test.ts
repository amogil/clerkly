// Requirements: agents.6, agents.8.1, agents.5.3
// Unit tests for agent status utility functions

import {
  isInProgress,
  isAwaitingUser,
  hasError,
  isCompleted,
  isNew,
  getStatusText,
  getStatusStyles,
  type AgentStatus,
} from '../../../src/shared/utils/agentStatus';

const ALL_STATUSES: AgentStatus[] = [
  'new',
  'in-progress',
  'awaiting-response',
  'error',
  'completed',
];

describe('agentStatus utilities', () => {
  /* Preconditions: All current statuses
     Action: Check predicates for each status
     Assertions: Exactly one matching predicate is true for each status
     Requirements: agents.6 */
  it('should keep predicate checks consistent for all statuses', () => {
    for (const status of ALL_STATUSES) {
      const flags = [
        isNew(status),
        isInProgress(status),
        isAwaitingUser(status),
        hasError(status),
        isCompleted(status),
      ];
      expect(flags.filter(Boolean)).toHaveLength(1);
    }
  });

  /* Preconditions: Each status value
     Action: Get status text
     Assertions: Returns stable user-facing labels
     Requirements: agents.6.1, agents.6.2, agents.6.3, agents.6.4 */
  it('should return correct status text', () => {
    expect(getStatusText('new')).toBe('New');
    expect(getStatusText('in-progress')).toBe('In progress');
    expect(getStatusText('awaiting-response')).toBe('Awaiting response');
    expect(getStatusText('error')).toBe('Error');
    expect(getStatusText('completed')).toBe('Completed');
  });

  /* Preconditions: Each status value
     Action: Get status styles
     Assertions: Returns non-empty strings and expected palette mapping
     Requirements: agents.8.1, agents.5.3 */
  it('should return expected styles for each status', () => {
    expect(getStatusStyles('new')).toEqual({
      bg: 'bg-sky-400',
      ring: 'ring-sky-400/30',
      text: 'text-sky-600',
    });
    expect(getStatusStyles('in-progress')).toEqual({
      bg: 'bg-blue-500',
      ring: 'ring-blue-500/30',
      text: 'text-blue-600',
    });
    expect(getStatusStyles('awaiting-response')).toEqual({
      bg: 'bg-amber-500',
      ring: 'ring-amber-500/30',
      text: 'text-amber-600',
    });
    expect(getStatusStyles('error')).toEqual({
      bg: 'bg-red-500',
      ring: 'ring-red-500/30',
      text: 'text-red-600',
    });
    expect(getStatusStyles('completed')).toEqual({
      bg: 'bg-green-500',
      ring: 'ring-green-500/30',
      text: 'text-green-600',
    });
  });

  /* Preconditions: Each status value
     Action: Get status styles repeatedly
     Assertions: Function is deterministic
     Requirements: agents.6 */
  it('should be deterministic for repeated calls', () => {
    for (const status of ALL_STATUSES) {
      expect(getStatusStyles(status)).toEqual(getStatusStyles(status));
    }
  });
});
