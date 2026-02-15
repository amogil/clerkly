/* Preconditions: Agent status utility functions exist
   Action: Test all status checking and formatting functions
   Assertions: All functions return correct values for each status
   Requirements: agents.6, agents.9 */

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

describe('Agent Status Utilities', () => {
  describe('Status Checking Functions', () => {
    const statuses: AgentStatus[] = ['new', 'in-progress', 'awaiting-user', 'error', 'completed'];

    describe('isNew', () => {
      it('should return true only for new status', () => {
        expect(isNew('new')).toBe(true);
        expect(isNew('in-progress')).toBe(false);
        expect(isNew('awaiting-user')).toBe(false);
        expect(isNew('error')).toBe(false);
        expect(isNew('completed')).toBe(false);
      });
    });

    describe('isInProgress', () => {
      it('should return true only for in-progress status', () => {
        expect(isInProgress('new')).toBe(false);
        expect(isInProgress('in-progress')).toBe(true);
        expect(isInProgress('awaiting-user')).toBe(false);
        expect(isInProgress('error')).toBe(false);
        expect(isInProgress('completed')).toBe(false);
      });
    });

    describe('isAwaitingUser', () => {
      it('should return true only for awaiting-user status', () => {
        expect(isAwaitingUser('new')).toBe(false);
        expect(isAwaitingUser('in-progress')).toBe(false);
        expect(isAwaitingUser('awaiting-user')).toBe(true);
        expect(isAwaitingUser('error')).toBe(false);
        expect(isAwaitingUser('completed')).toBe(false);
      });
    });

    describe('hasError', () => {
      it('should return true only for error status', () => {
        expect(hasError('new')).toBe(false);
        expect(hasError('in-progress')).toBe(false);
        expect(hasError('awaiting-user')).toBe(false);
        expect(hasError('error')).toBe(true);
        expect(hasError('completed')).toBe(false);
      });
    });

    describe('isCompleted', () => {
      it('should return true only for completed status', () => {
        expect(isCompleted('new')).toBe(false);
        expect(isCompleted('in-progress')).toBe(false);
        expect(isCompleted('awaiting-user')).toBe(false);
        expect(isCompleted('error')).toBe(false);
        expect(isCompleted('completed')).toBe(true);
      });
    });

    it('should have exactly one true result for each status', () => {
      statuses.forEach((status) => {
        const results = [
          isNew(status),
          isInProgress(status),
          isAwaitingUser(status),
          hasError(status),
          isCompleted(status),
        ];
        const trueCount = results.filter((r) => r).length;
        expect(trueCount).toBe(1);
      });
    });
  });

  describe('getStatusText', () => {
    it('should return correct text for new status', () => {
      expect(getStatusText('new')).toBe('New');
    });

    it('should return correct text for in-progress status', () => {
      expect(getStatusText('in-progress')).toBe('In progress');
    });

    it('should return correct text for awaiting-user status', () => {
      expect(getStatusText('awaiting-user')).toBe('Awaiting response');
    });

    it('should return correct text for error status', () => {
      expect(getStatusText('error')).toBe('Error');
    });

    it('should return correct text for completed status', () => {
      expect(getStatusText('completed')).toBe('Completed');
    });
  });

  describe('getStatusStyles', () => {
    it('should return correct styles for new status', () => {
      const styles = getStatusStyles('new');
      expect(styles).toEqual({
        bg: 'bg-sky-400',
        ring: 'ring-sky-400/30',
        text: 'text-sky-600',
      });
    });

    it('should return correct styles for in-progress status', () => {
      const styles = getStatusStyles('in-progress');
      expect(styles).toEqual({
        bg: 'bg-blue-500',
        ring: 'ring-blue-500/30',
        text: 'text-blue-600',
      });
    });

    it('should return correct styles for awaiting-user status', () => {
      const styles = getStatusStyles('awaiting-user');
      expect(styles).toEqual({
        bg: 'bg-amber-500',
        ring: 'ring-amber-500/30',
        text: 'text-amber-600',
      });
    });

    it('should return correct styles for error status', () => {
      const styles = getStatusStyles('error');
      expect(styles).toEqual({
        bg: 'bg-red-500',
        ring: 'ring-red-500/30',
        text: 'text-red-600',
      });
    });

    it('should return correct styles for completed status', () => {
      const styles = getStatusStyles('completed');
      expect(styles).toEqual({
        bg: 'bg-green-500',
        ring: 'ring-green-500/30',
        text: 'text-green-600',
      });
    });

    it('should return object with bg, ring, and text properties for all statuses', () => {
      const statuses: AgentStatus[] = ['new', 'in-progress', 'awaiting-user', 'error', 'completed'];

      statuses.forEach((status) => {
        const styles = getStatusStyles(status);
        expect(styles).toHaveProperty('bg');
        expect(styles).toHaveProperty('ring');
        expect(styles).toHaveProperty('text');
        expect(typeof styles.bg).toBe('string');
        expect(typeof styles.ring).toBe('string');
        expect(typeof styles.text).toBe('string');
      });
    });
  });
});
