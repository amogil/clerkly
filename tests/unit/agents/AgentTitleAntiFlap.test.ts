// Requirements: llm-integration.16.10, llm-integration.16.10.1

import {
  evaluateAgentTitleGuards,
  isValidRenameNeedScore,
} from '../../../src/main/agents/AgentTitleRuntime';

describe('evaluateAgentTitleGuards', () => {
  /* Preconditions: Current and next titles are identical after normalization
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by exact-match guard
     Requirements: llm-integration.16.10 */
  it('skips rename for exact match', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Project Kickoff',
      nextTitle: '  project kickoff  ',
      renameNeedScore: 100,
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('exact_match');
  });

  /* Preconditions: Current title is default and score equals default threshold boundary
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by score guard
     Requirements: llm-integration.16.10 */
  it('skips rename for default title when score is 50', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'New Agent',
      nextTitle: 'Quarterly roadmap review',
      renameNeedScore: 50,
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('score_below_threshold');
  });

  /* Preconditions: Current title is default and score is above default threshold boundary
     Action: Evaluate anti-flapping guards
     Assertions: Rename is allowed
     Requirements: llm-integration.16.10 */
  it('allows rename for default title when score is 51', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'New Agent',
      nextTitle: 'Quarterly roadmap review',
      renameNeedScore: 51,
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe('allow');
  });

  /* Preconditions: Current title is non-default and score is below non-default threshold
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by score guard
     Requirements: llm-integration.16.10 */
  it('skips rename for non-default title when score is 79', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Sprint bug triage',
      nextTitle: 'Quarterly roadmap review',
      renameNeedScore: 79,
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('score_below_threshold');
  });

  /* Preconditions: Titles are different, but cooldown period has not elapsed
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by cooldown guard
     Requirements: llm-integration.16.10 */
  it('skips rename within 5-turn cooldown', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Sprint bug triage',
      nextTitle: 'Backend migration blockers',
      renameNeedScore: 95,
      currentUserTurn: 8,
      lastRenameUserTurn: 6,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('cooldown');
  });

  /* Preconditions: Titles are different, score passes, and cooldown has elapsed
     Action: Evaluate anti-flapping guards
     Assertions: Rename is allowed
     Requirements: llm-integration.16.10 */
  it('allows rename when score is high and cooldown elapsed', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Sprint bug triage',
      nextTitle: 'Quarterly roadmap review',
      renameNeedScore: 92,
      currentUserTurn: 12,
      lastRenameUserTurn: 6,
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe('allow');
  });
});

describe('isValidRenameNeedScore', () => {
  /* Preconditions: Mixed score values
     Action: Validate score values
     Assertions: Only integer 0..100 values are accepted
     Requirements: llm-integration.16.10.1 */
  it('validates integer score range', () => {
    expect(isValidRenameNeedScore(0)).toBe(true);
    expect(isValidRenameNeedScore(80)).toBe(true);
    expect(isValidRenameNeedScore(100)).toBe(true);
    expect(isValidRenameNeedScore(-1)).toBe(false);
    expect(isValidRenameNeedScore(101)).toBe(false);
    expect(isValidRenameNeedScore(79.5)).toBe(false);
    expect(isValidRenameNeedScore('90')).toBe(false);
    expect(isValidRenameNeedScore(null)).toBe(false);
  });
});
