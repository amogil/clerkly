// Requirements: llm-integration.16.3, llm-integration.16.4, llm-integration.16.5, llm-integration.16.6

import {
  AgentTitleCommentParser,
  TITLE_META_PAYLOAD_MAX_LENGTH,
} from '../../../src/main/agents/AgentTitleRuntime';

describe('AgentTitleCommentParser', () => {
  /* Preconditions: Prefix and closing marker are fully present in one chunk
     Action: Feed chunk into parser
     Assertions: Candidate title is extracted
     Requirements: llm-integration.16.3, llm-integration.16.4 */
  it('extracts metadata payload when comment is fully contained in one chunk', () => {
    const parser = new AgentTitleCommentParser();

    parser.ingest(
      'hello <!-- clerkly:title-meta: {"title":"Sprint Plan","rename_need_score":90} --> world'
    );
    parser.finalize();

    expect(parser.getCandidate()).toBe(' {"title":"Sprint Plan","rename_need_score":90} ');
  });

  /* Preconditions: Prefix and payload are split across chunks
     Action: Feed chunks sequentially
     Assertions: Candidate title is extracted from split stream
     Requirements: llm-integration.16.3, llm-integration.16.4 */
  it('extracts metadata payload when prefix is split across chunks', () => {
    const parser = new AgentTitleCommentParser();

    parser.ingest('before <!-- cle');
    parser.ingest('rkly:title-meta: {"title":"Roadmap');
    parser.ingest(' update","rename_need_score":95} --> after');
    parser.finalize();

    expect(parser.getCandidate()).toBe(' {"title":"Roadmap update","rename_need_score":95} ');
  });

  /* Preconditions: First comment is invalid due to overflow without closing, second is valid
     Action: Feed stream containing both comments
     Assertions: Parser skips invalid comment and extracts next valid candidate
     Requirements: llm-integration.16.5, llm-integration.16.6 */
  it('skips overflowed comment and captures next valid one', () => {
    const parser = new AgentTitleCommentParser();
    const overflow = 'x'.repeat(TITLE_META_PAYLOAD_MAX_LENGTH + 1);

    parser.ingest(`<!-- clerkly:title-meta:${overflow}`);
    parser.ingest('-->');
    parser.ingest(
      ' text <!-- clerkly:title-meta: {"title":"New title","rename_need_score":90} --> end'
    );
    parser.finalize();

    expect(parser.getCandidate()).toBe(' {"title":"New title","rename_need_score":90} ');
  });

  /* Preconditions: Capture reaches payload limit without closing marker
     Action: Feed unterminated comment and finalize stream
     Assertions: Candidate is not extracted
     Requirements: llm-integration.16.5 */
  it('rejects unterminated capture that reaches payload limit', () => {
    const parser = new AgentTitleCommentParser();

    parser.ingest(`<!-- clerkly:title-meta:${'a'.repeat(TITLE_META_PAYLOAD_MAX_LENGTH)}`);
    parser.finalize();

    expect(parser.getCandidate()).toBeNull();
  });

  /* Preconditions: Stream ends while parser is in capture mode
     Action: Finalize parser without closing marker
     Assertions: Candidate is not extracted
     Requirements: llm-integration.16.5 */
  it('rejects unfinished capture on stream end', () => {
    const parser = new AgentTitleCommentParser();

    parser.ingest('Text <!-- clerkly:title-meta: {"title":"Half done"');
    parser.finalize();

    expect(parser.getCandidate()).toBeNull();
  });

  /* Preconditions: Stream contains multiple valid comments
     Action: Feed full stream
     Assertions: Only first valid candidate is used
     Requirements: llm-integration.16.6 */
  it('uses only first valid candidate per turn', () => {
    const parser = new AgentTitleCommentParser();

    parser.ingest(
      '<!-- clerkly:title-meta: {"title":"First","rename_need_score":90} --> and <!-- clerkly:title-meta: {"title":"Second","rename_need_score":90} -->'
    );
    parser.finalize();

    expect(parser.getCandidate()).toBe(' {"title":"First","rename_need_score":90} ');
  });
});
