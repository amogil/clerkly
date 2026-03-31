// Requirements: llm-integration.16.8, llm-integration.16.8.3, llm-integration.16.9

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

  /* Preconditions: Title contains a single unpaired ASCII double quote in the middle
     Action: Normalize candidate title
     Assertions: The unpaired quote is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired ASCII double quote in the middle', () => {
    const result = normalizeAgentTitleCandidate('Some "title');

    expect(result).toBe('Some title');
  });

  /* Preconditions: Title contains paired ASCII double quotes around a word
     Action: Normalize candidate title
     Assertions: The paired quotes are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired ASCII double quotes', () => {
    const result = normalizeAgentTitleCandidate('The "Plan" overview');

    expect(result).toBe('The "Plan" overview');
  });

  /* Preconditions: Title contains an unpaired typographic left double quote
     Action: Normalize candidate title
     Assertions: The unpaired typographic quote is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired typographic double quote', () => {
    const result = normalizeAgentTitleCandidate('Some \u201Ctitle');

    expect(result).toBe('Some title');
  });

  /* Preconditions: Title contains paired typographic double quotes
     Action: Normalize candidate title
     Assertions: The paired typographic quotes are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired typographic double quotes', () => {
    const result = normalizeAgentTitleCandidate('The \u201CPlan\u201D overview');

    expect(result).toBe('The \u201CPlan\u201D overview');
  });

  /* Preconditions: Title contains an unpaired typographic left single quote
     Action: Normalize candidate title
     Assertions: The unpaired typographic single quote is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired typographic single quote', () => {
    const result = normalizeAgentTitleCandidate('Some \u2018title');

    expect(result).toBe('Some title');
  });

  /* Preconditions: Title contains paired typographic single quotes
     Action: Normalize candidate title
     Assertions: The paired typographic single quotes are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired typographic single quotes', () => {
    const result = normalizeAgentTitleCandidate('The \u2018Plan\u2019 overview');

    expect(result).toBe('The \u2018Plan\u2019 overview');
  });

  /* Preconditions: Title contains an unpaired opening parenthesis
     Action: Normalize candidate title
     Assertions: The unpaired parenthesis is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired parenthesis', () => {
    const result = normalizeAgentTitleCandidate('Plan for (Q3');

    expect(result).toBe('Plan for Q3');
  });

  /* Preconditions: Title contains paired parentheses
     Action: Normalize candidate title
     Assertions: The paired parentheses are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired parentheses', () => {
    const result = normalizeAgentTitleCandidate('Project (Alpha) review');

    expect(result).toBe('Project (Alpha) review');
  });

  /* Preconditions: Title contains an unpaired opening square bracket
     Action: Normalize candidate title
     Assertions: The unpaired bracket is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired square bracket', () => {
    const result = normalizeAgentTitleCandidate('Code [review');

    expect(result).toBe('Code review');
  });

  /* Preconditions: Title contains paired square brackets
     Action: Normalize candidate title
     Assertions: The paired square brackets are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired square brackets', () => {
    const result = normalizeAgentTitleCandidate('Task [WIP] update');

    expect(result).toBe('Task [WIP] update');
  });

  /* Preconditions: Title contains an unpaired opening curly brace
     Action: Normalize candidate title
     Assertions: The unpaired brace is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired curly brace', () => {
    const result = normalizeAgentTitleCandidate('Data {model');

    expect(result).toBe('Data model');
  });

  /* Preconditions: Title contains paired curly braces
     Action: Normalize candidate title
     Assertions: The paired curly braces are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired curly braces', () => {
    const result = normalizeAgentTitleCandidate('Config {json} format');

    expect(result).toBe('Config {json} format');
  });

  /* Preconditions: Title contains an unpaired backtick
     Action: Normalize candidate title
     Assertions: The unpaired backtick is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired backtick', () => {
    const result = normalizeAgentTitleCandidate('Deploy `fix');

    expect(result).toBe('Deploy fix');
  });

  /* Preconditions: Title contains paired backticks
     Action: Normalize candidate title
     Assertions: The paired backticks are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired backticks', () => {
    const result = normalizeAgentTitleCandidate('Run `test` suite');

    expect(result).toBe('Run `test` suite');
  });

  /* Preconditions: Title contains an unpaired opening angle bracket
     Action: Normalize candidate title
     Assertions: The unpaired angle bracket is stripped
     Requirements: llm-integration.16.8.3 */
  it('strips unpaired angle bracket', () => {
    const result = normalizeAgentTitleCandidate('Compare <values');

    expect(result).toBe('Compare values');
  });

  /* Preconditions: Title contains paired angle brackets
     Action: Normalize candidate title
     Assertions: The paired angle brackets are preserved
     Requirements: llm-integration.16.8.3 */
  it('preserves paired angle brackets', () => {
    const result = normalizeAgentTitleCandidate('Type <string> check');

    expect(result).toBe('Type <string> check');
  });

  /* Preconditions: Title contains an ASCII apostrophe (contraction)
     Action: Normalize candidate title
     Assertions: The apostrophe is NOT modified
     Requirements: llm-integration.16.8.3 */
  it('does not modify ASCII apostrophes', () => {
    const result = normalizeAgentTitleCandidate("it's a plan");

    expect(result).toBe("it's a plan");
  });

  /* Preconditions: Title contains mixed unpaired punctuation from different types
     Action: Normalize candidate title
     Assertions: All unpaired punctuation types are stripped independently
     Requirements: llm-integration.16.8.3 */
  it('strips mixed unpaired punctuation from different types', () => {
    const result = normalizeAgentTitleCandidate('"word(test');

    expect(result).toBe('wordtest');
  });

  /* Preconditions: Title has edge-only quotes that are handled by edge stripping
     Action: Normalize candidate title
     Assertions: Edge stripping handles them, unpaired logic does not interfere
     Requirements: llm-integration.16.8, llm-integration.16.8.3 */
  it('handles edge-only quotes without interference from unpaired logic', () => {
    const result = normalizeAgentTitleCandidate('"Roadmap update"');

    expect(result).toBe('Roadmap update');
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
