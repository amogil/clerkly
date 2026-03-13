// Requirements: llm-integration.16.8, llm-integration.16.9

import {
  AGENT_TITLE_MAX_LENGTH,
  normalizeAgentTitleCandidate,
} from '../../../src/main/agents/AgentTitleRuntime';

describe('normalizeAgentTitleCandidate', () => {
  /* Preconditions: Title contains leading/trailing spaces and repeated spaces/newlines
     Action: Normalize candidate title
     Assertions: Result is single-line, trimmed, and spaces are collapsed
     Requirements: llm-integration.16.8 */
  it('normalizes whitespace and line breaks', () => {
    const result = normalizeAgentTitleCandidate('  Project\n\tstatus   summary  ');

    expect(result).toBe('Project status summary');
  });

  /* Preconditions: Title is wrapped in punctuation symbols
     Action: Normalize candidate title
     Assertions: Edge punctuation is removed
     Requirements: llm-integration.16.8 */
  it('removes edge punctuation', () => {
    const result = normalizeAgentTitleCandidate('... "Roadmap update" !!!');

    expect(result).toBe('Roadmap update');
  });

  /* Preconditions: Candidate becomes empty after normalization
     Action: Normalize candidate title
     Assertions: Result is null
     Requirements: llm-integration.16.9 */
  it('returns null for empty normalized title', () => {
    const result = normalizeAgentTitleCandidate('  ... ---   ');

    expect(result).toBeNull();
  });

  /* Preconditions: Candidate length is exactly maximum allowed
     Action: Normalize candidate title
     Assertions: Candidate is accepted
     Requirements: llm-integration.16.8 */
  it('accepts candidate with length exactly 200', () => {
    const title = 'a'.repeat(AGENT_TITLE_MAX_LENGTH);

    const result = normalizeAgentTitleCandidate(title);

    expect(result).toBe(title);
  });

  /* Preconditions: Candidate length exceeds maximum allowed
     Action: Normalize candidate title
     Assertions: Candidate is rejected
     Requirements: llm-integration.16.9 */
  it('rejects candidate longer than 200 characters', () => {
    const title = 'a'.repeat(AGENT_TITLE_MAX_LENGTH + 1);

    const result = normalizeAgentTitleCandidate(title);

    expect(result).toBeNull();
  });
});
