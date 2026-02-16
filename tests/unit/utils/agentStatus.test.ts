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

describe('agentStatus utilities', () => {
  describe('isInProgress', () => {
    /* Preconditions: Status is 'in-progress'
       Action: Call isInProgress
       Assertions: Returns true
       Requirements: agents.6 */
    it('should return true for in-progress status', () => {
      expect(isInProgress('in-progress')).toBe(true);
    });

    /* Preconditions: Status is not 'in-progress'
       Action: Call isInProgress with other statuses
       Assertions: Returns false
       Requirements: agents.6 */
    it('should return false for other statuses', () => {
      expect(isInProgress('new')).toBe(false);
      expect(isInProgress('awaiting-response')).toBe(false);
      expect(isInProgress('error')).toBe(false);
      expect(isInProgress('completed')).toBe(false);
    });
  });

  describe('isAwaitingUser', () => {
    /* Preconditions: Status is 'awaiting-response'
       Action: Call isAwaitingUser
       Assertions: Returns true
       Requirements: agents.6 */
    it('should return true for awaiting-user status', () => {
      expect(isAwaitingUser('awaiting-response')).toBe(true);
    });

    /* Preconditions: Status is not 'awaiting-response'
       Action: Call isAwaitingUser with other statuses
       Assertions: Returns false
       Requirements: agents.6 */
    it('should return false for other statuses', () => {
      expect(isAwaitingUser('new')).toBe(false);
      expect(isAwaitingUser('in-progress')).toBe(false);
      expect(isAwaitingUser('error')).toBe(false);
      expect(isAwaitingUser('completed')).toBe(false);
    });
  });

  describe('hasError', () => {
    /* Preconditions: Status is 'error'
       Action: Call hasError
       Assertions: Returns true
       Requirements: agents.6 */
    it('should return true for error status', () => {
      expect(hasError('error')).toBe(true);
    });

    /* Preconditions: Status is not 'error'
       Action: Call hasError with other statuses
       Assertions: Returns false
       Requirements: agents.6 */
    it('should return false for other statuses', () => {
      expect(hasError('new')).toBe(false);
      expect(hasError('in-progress')).toBe(false);
      expect(hasError('awaiting-response')).toBe(false);
      expect(hasError('completed')).toBe(false);
    });
  });

  describe('isCompleted', () => {
    /* Preconditions: Status is 'completed'
       Action: Call isCompleted
       Assertions: Returns true
       Requirements: agents.6 */
    it('should return true for completed status', () => {
      expect(isCompleted('completed')).toBe(true);
    });

    /* Preconditions: Status is not 'completed'
       Action: Call isCompleted with other statuses
       Assertions: Returns false
       Requirements: agents.6 */
    it('should return false for other statuses', () => {
      expect(isCompleted('new')).toBe(false);
      expect(isCompleted('in-progress')).toBe(false);
      expect(isCompleted('awaiting-response')).toBe(false);
      expect(isCompleted('error')).toBe(false);
    });
  });

  describe('isNew', () => {
    /* Preconditions: Status is 'new'
       Action: Call isNew
       Assertions: Returns true
       Requirements: agents.6 */
    it('should return true for new status', () => {
      expect(isNew('new')).toBe(true);
    });

    /* Preconditions: Status is not 'new'
       Action: Call isNew with other statuses
       Assertions: Returns false
       Requirements: agents.6 */
    it('should return false for other statuses', () => {
      expect(isNew('in-progress')).toBe(false);
      expect(isNew('awaiting-response')).toBe(false);
      expect(isNew('error')).toBe(false);
      expect(isNew('completed')).toBe(false);
    });
  });

  describe('getStatusText', () => {
    /* Preconditions: Status is 'new'
       Action: Call getStatusText
       Assertions: Returns 'New'
       Requirements: agents.6.1 */
    it('should return "New" for new status', () => {
      expect(getStatusText('new')).toBe('New');
    });

    /* Preconditions: Status is 'in-progress'
       Action: Call getStatusText
       Assertions: Returns 'In progress'
       Requirements: agents.6.2 */
    it('should return "In progress" for in-progress status', () => {
      expect(getStatusText('in-progress')).toBe('In progress');
    });

    /* Preconditions: Status is 'awaiting-response'
       Action: Call getStatusText
       Assertions: Returns 'Awaiting response'
       Requirements: agents.6.3 */
    it('should return "Awaiting response" for awaiting-user status', () => {
      expect(getStatusText('awaiting-response')).toBe('Awaiting response');
    });

    /* Preconditions: Status is 'error'
       Action: Call getStatusText
       Assertions: Returns 'Error'
       Requirements: agents.6.4 */
    it('should return "Error" for error status', () => {
      expect(getStatusText('error')).toBe('Error');
    });

    /* Preconditions: Status is 'completed'
       Action: Call getStatusText
       Assertions: Returns 'Completed'
       Requirements: agents.6.5 */
    it('should return "Completed" for completed status', () => {
      expect(getStatusText('completed')).toBe('Completed');
    });
  });

  describe('getStatusStyles', () => {
    /* Preconditions: Status is 'new'
       Action: Call getStatusStyles
       Assertions: Returns correct styles for new status
       Requirements: agents.6.1, agents.8.1, agents.5.3 */
    it('should return correct styles for new status', () => {
      const styles = getStatusStyles('new');

      expect(styles).toEqual({
        bg: 'bg-sky-400',
        ring: 'ring-sky-400/30',
        text: 'text-sky-600',
      });
    });

    /* Preconditions: Status is 'in-progress'
       Action: Call getStatusStyles
       Assertions: Returns correct styles for in-progress status
       Requirements: agents.6.2, agents.8.1, agents.5.3 */
    it('should return correct styles for in-progress status', () => {
      const styles = getStatusStyles('in-progress');

      expect(styles).toEqual({
        bg: 'bg-blue-500',
        ring: 'ring-blue-500/30',
        text: 'text-blue-600',
      });
    });

    /* Preconditions: Status is 'awaiting-response'
       Action: Call getStatusStyles
       Assertions: Returns correct styles for awaiting-user status
       Requirements: agents.6.3, agents.8.1, agents.5.3 */
    it('should return correct styles for awaiting-user status', () => {
      const styles = getStatusStyles('awaiting-response');

      expect(styles).toEqual({
        bg: 'bg-amber-500',
        ring: 'ring-amber-500/30',
        text: 'text-amber-600',
      });
    });

    /* Preconditions: Status is 'error'
       Action: Call getStatusStyles
       Assertions: Returns correct styles for error status
       Requirements: agents.6.4, agents.8.1, agents.5.3 */
    it('should return correct styles for error status', () => {
      const styles = getStatusStyles('error');

      expect(styles).toEqual({
        bg: 'bg-red-500',
        ring: 'ring-red-500/30',
        text: 'text-red-600',
      });
    });

    /* Preconditions: Status is 'completed'
       Action: Call getStatusStyles
       Assertions: Returns correct styles for completed status
       Requirements: agents.6.5, agents.8.1, agents.5.3 */
    it('should return correct styles for completed status', () => {
      const styles = getStatusStyles('completed');

      expect(styles).toEqual({
        bg: 'bg-green-500',
        ring: 'ring-green-500/30',
        text: 'text-green-600',
      });
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: Each status has unique background color
       Requirements: agents.6 */
    it('should return unique background colors for each status', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];
      const bgColors = statuses.map((status) => getStatusStyles(status).bg);

      // Check all colors are unique
      const uniqueColors = new Set(bgColors);
      expect(uniqueColors.size).toBe(statuses.length);
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: Each status has unique text color
       Requirements: agents.6, agents.8.1, agents.5.3 */
    it('should return unique text colors for each status', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];
      const textColors = statuses.map((status) => getStatusStyles(status).text);

      // Check all colors are unique
      const uniqueColors = new Set(textColors);
      expect(uniqueColors.size).toBe(statuses.length);
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: Ring color matches background color with /30 opacity
       Requirements: agents.6 */
    it('should have ring color matching background color with /30 opacity', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];

      statuses.forEach((status) => {
        const styles = getStatusStyles(status);
        const bgColorBase = styles.bg.replace('bg-', '');
        const expectedRing = `ring-${bgColorBase}/30`;

        expect(styles.ring).toBe(expectedRing);
      });
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: Text color uses same base color as background but with -600 shade
       Requirements: agents.6, agents.8.1, agents.5.3 */
    it('should have text color using same base color as background', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];

      statuses.forEach((status) => {
        const styles = getStatusStyles(status);
        const bgColorBase = styles.bg.replace('bg-', '').replace('-400', '').replace('-500', '');
        const textColorBase = styles.text.replace('text-', '').replace('-600', '');

        expect(textColorBase).toBe(bgColorBase);
      });
    });

    /* Preconditions: Function is called multiple times with same status
       Action: Call getStatusStyles multiple times
       Assertions: Returns same object structure each time (deterministic)
       Requirements: agents.6 */
    it('should be deterministic (pure function)', () => {
      const result1 = getStatusStyles('in-progress');
      const result2 = getStatusStyles('in-progress');
      const result3 = getStatusStyles('in-progress');

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: Returns object with exactly 3 properties (bg, ring, text)
       Requirements: agents.6 */
    it('should return object with exactly 3 properties', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];

      statuses.forEach((status) => {
        const styles = getStatusStyles(status);
        const keys = Object.keys(styles);

        expect(keys).toHaveLength(3);
        expect(keys).toContain('bg');
        expect(keys).toContain('ring');
        expect(keys).toContain('text');
      });
    });

    /* Preconditions: All statuses
       Action: Call getStatusStyles for each status
       Assertions: All style values are non-empty strings
       Requirements: agents.6 */
    it('should return non-empty string values for all properties', () => {
      const statuses: AgentStatus[] = [
        'new',
        'in-progress',
        'awaiting-response',
        'error',
        'completed',
      ];

      statuses.forEach((status) => {
        const styles = getStatusStyles(status);

        expect(styles.bg).toBeTruthy();
        expect(styles.ring).toBeTruthy();
        expect(styles.text).toBeTruthy();

        expect(typeof styles.bg).toBe('string');
        expect(typeof styles.ring).toBe('string');
        expect(typeof styles.text).toBe('string');
      });
    });
  });
});
