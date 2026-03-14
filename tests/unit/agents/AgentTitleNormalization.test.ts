// Requirements: llm-integration.16.8, llm-integration.16.9

import {
  AGENT_TITLE_MAX_LENGTH,
  normalizeAgentTitleCandidate,
  parseAgentTitleMetadataPayload,
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

  /* Preconditions: Candidate uses surrogate-pair Unicode symbols
     Action: Normalize candidate title with code-point boundary length
     Assertions: Length is evaluated by Unicode code points, not bytes/code units
     Requirements: llm-integration.16.8.2 */
  it('counts title length by Unicode code points', () => {
    const allowed = '𐐷'.repeat(AGENT_TITLE_MAX_LENGTH);
    const overflow = '𐐷'.repeat(AGENT_TITLE_MAX_LENGTH + 1);

    expect(normalizeAgentTitleCandidate(allowed)).toBe(allowed);
    expect(normalizeAgentTitleCandidate(overflow)).toBeNull();
  });
});

describe('parseAgentTitleMetadataPayload', () => {
  /* Preconditions: Metadata comment payload contains valid JSON fields
     Action: Parse metadata payload
     Assertions: Parsed title and score are returned
     Requirements: llm-integration.16.1.3 */
  it('parses valid metadata payload', () => {
    const result = parseAgentTitleMetadataPayload(
      '{"title":"Incident response checklist","rename_need_score":92}'
    );

    expect(result).toEqual({
      title: 'Incident response checklist',
      renameNeedScore: 92,
    });
  });

  /* Preconditions: Metadata payload contains invalid score
     Action: Parse metadata payload
     Assertions: Invalid payload is rejected
     Requirements: llm-integration.16.10.1 */
  it('rejects payload with invalid score', () => {
    const result = parseAgentTitleMetadataPayload(
      '{"title":"Incident response checklist","rename_need_score":101}'
    );

    expect(result).toBeNull();
  });
});
