// Requirements: llm-integration.16.10

import {
  evaluateAgentTitleGuards,
  jaccardSimilarity,
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
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('exact_match');
  });

  /* Preconditions: Titles are semantically close by token overlap
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by semantic guard
     Requirements: llm-integration.16.10 */
  it('skips rename when Jaccard similarity is above threshold', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'release planning sprint tasks',
      nextTitle: 'sprint release planning tasks',
      currentUserTurn: 10,
      lastRenameUserTurn: null,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('semantically_similar');
    expect(decision.similarity).toBeGreaterThanOrEqual(0.7);
  });

  /* Preconditions: Titles are different, but cooldown period has not elapsed
     Action: Evaluate anti-flapping guards
     Assertions: Rename is skipped by cooldown guard
     Requirements: llm-integration.16.10 */
  it('skips rename within 5-turn cooldown', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Sprint bug triage',
      nextTitle: 'Backend migration blockers',
      currentUserTurn: 8,
      lastRenameUserTurn: 6,
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('cooldown');
  });

  /* Preconditions: Titles are different and cooldown has elapsed
     Action: Evaluate anti-flapping guards
     Assertions: Rename is allowed
     Requirements: llm-integration.16.10 */
  it('allows rename for semantically different title after cooldown', () => {
    const decision = evaluateAgentTitleGuards({
      currentTitle: 'Sprint bug triage',
      nextTitle: 'Quarterly roadmap review',
      currentUserTurn: 12,
      lastRenameUserTurn: 6,
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe('allow');
  });
});

describe('jaccardSimilarity', () => {
  /* Preconditions: Two token sets partially overlap
     Action: Calculate Jaccard similarity
     Assertions: Intersection/union ratio is returned
     Requirements: llm-integration.16.10 */
  it('calculates set overlap ratio', () => {
    const similarity = jaccardSimilarity('a b c', 'b c d');

    expect(similarity).toBeCloseTo(0.5, 6);
  });
});
