// Requirements: llm-integration.16

export const TITLE_COMMENT_PREFIX = '<!-- clerkly:title:';
export const TITLE_COMMENT_CLOSE = '-->';
export const TITLE_COMMENT_PAYLOAD_MAX_LENGTH = 200;
export const AGENT_TITLE_MAX_LENGTH = 200;
export const TITLE_RENAME_MIN_USER_TURN_GAP = 5;
export const TITLE_JACCARD_THRESHOLD = 0.7;

type ParserMode = 'search' | 'capture';

/**
 * Incremental parser for title metadata comment in markdown output stream.
 * Requirements: llm-integration.16.3, llm-integration.16.4, llm-integration.16.5, llm-integration.16.6, llm-integration.16.7
 */
export class AgentTitleCommentParser {
  private mode: ParserMode = 'search';
  private searchTail = '';
  private captureBuffer = '';
  private candidate: string | null = null;
  private extractionCompleted = false;

  // Requirements: llm-integration.16.3, llm-integration.16.4
  ingest(delta: string): void {
    if (!delta || this.extractionCompleted) {
      return;
    }

    let cursor = delta;
    while (cursor.length > 0 && !this.extractionCompleted) {
      if (this.mode === 'search') {
        cursor = this.consumeSearch(cursor);
      } else {
        cursor = this.consumeCapture(cursor);
      }
    }
  }

  // Requirements: llm-integration.16.5
  finalize(): void {
    if (this.extractionCompleted) {
      return;
    }
    if (this.mode === 'capture') {
      this.captureBuffer = '';
      this.mode = 'search';
    }
  }

  // Requirements: llm-integration.16.6
  getCandidate(): string | null {
    return this.candidate;
  }

  // Requirements: llm-integration.16.3
  private consumeSearch(input: string): string {
    const merged = this.searchTail + input;
    const matchIndex = merged.indexOf(TITLE_COMMENT_PREFIX);

    if (matchIndex === -1) {
      const keep = Math.max(TITLE_COMMENT_PREFIX.length - 1, 0);
      this.searchTail = keep > 0 ? merged.slice(-keep) : '';
      return '';
    }

    const afterPrefixIndex = matchIndex + TITLE_COMMENT_PREFIX.length;
    this.mode = 'capture';
    this.captureBuffer = '';
    this.searchTail = '';
    return merged.slice(afterPrefixIndex);
  }

  // Requirements: llm-integration.16.4, llm-integration.16.5, llm-integration.16.6
  private consumeCapture(input: string): string {
    if (input.length === 0) {
      return '';
    }

    const closeIndex = input.indexOf(TITLE_COMMENT_CLOSE);
    if (closeIndex >= 0) {
      const payloadPart = input.slice(0, closeIndex);
      const remainingCapacity = TITLE_COMMENT_PAYLOAD_MAX_LENGTH - this.captureBuffer.length;

      if (remainingCapacity <= 0 || payloadPart.length > remainingCapacity) {
        const consumed = Math.max(remainingCapacity, 0);
        this.resetAfterInvalidCapture();
        return input.slice(consumed);
      }

      this.captureBuffer += payloadPart;
      this.candidate = this.captureBuffer;
      this.extractionCompleted = true;
      this.mode = 'search';
      this.captureBuffer = '';
      return '';
    }

    const remainingCapacity = TITLE_COMMENT_PAYLOAD_MAX_LENGTH - this.captureBuffer.length;
    if (remainingCapacity <= 0) {
      this.resetAfterInvalidCapture();
      return input;
    }

    const consumeLength = Math.min(input.length, remainingCapacity);
    this.captureBuffer += input.slice(0, consumeLength);
    const rest = input.slice(consumeLength);

    if (this.captureBuffer.length >= TITLE_COMMENT_PAYLOAD_MAX_LENGTH) {
      this.resetAfterInvalidCapture();
      return rest;
    }

    return '';
  }

  // Requirements: llm-integration.16.5
  private resetAfterInvalidCapture(): void {
    this.mode = 'search';
    this.captureBuffer = '';
    this.searchTail = '';
  }
}

/**
 * Normalize user-visible agent title candidate and validate limits.
 * Requirements: llm-integration.16.8, llm-integration.16.9
 */
export function normalizeAgentTitleCandidate(title: string): string | null {
  const collapsed = title
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutEdgePunctuation = collapsed.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
  if (!withoutEdgePunctuation) {
    return null;
  }
  if (withoutEdgePunctuation.length > AGENT_TITLE_MAX_LENGTH) {
    return null;
  }
  return withoutEdgePunctuation;
}

/**
 * Compute Jaccard similarity over normalized lowercase token sets.
 * Requirements: llm-integration.16.10
 */
export function jaccardSimilarity(leftTitle: string, rightTitle: string): number {
  const left = tokenizeForSimilarity(leftTitle);
  const right = tokenizeForSimilarity(rightTitle);

  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  const intersectionSize = [...left].filter((token) => right.has(token)).length;
  const unionSize = new Set([...left, ...right]).size;
  if (unionSize === 0) {
    return 0;
  }

  return intersectionSize / unionSize;
}

export type AgentTitleGuardDecisionReason =
  | 'allow'
  | 'exact_match'
  | 'semantically_similar'
  | 'cooldown';

/**
 * Evaluate anti-flapping guards for auto-title rename.
 * Requirements: llm-integration.16.10
 */
export function evaluateAgentTitleGuards(input: {
  currentTitle: string;
  nextTitle: string;
  currentUserTurn: number;
  lastRenameUserTurn: number | null;
}): { allow: boolean; reason: AgentTitleGuardDecisionReason; similarity: number } {
  const current = normalizeAgentTitleCandidate(input.currentTitle);
  const next = normalizeAgentTitleCandidate(input.nextTitle);

  if (!current || !next) {
    return { allow: false, reason: 'exact_match', similarity: 1 };
  }

  const currentForCompare = current.toLocaleLowerCase();
  const nextForCompare = next.toLocaleLowerCase();

  if (currentForCompare === nextForCompare) {
    return { allow: false, reason: 'exact_match', similarity: 1 };
  }

  const similarity = jaccardSimilarity(currentForCompare, nextForCompare);
  if (similarity >= TITLE_JACCARD_THRESHOLD) {
    return { allow: false, reason: 'semantically_similar', similarity };
  }

  if (
    input.lastRenameUserTurn !== null &&
    input.currentUserTurn - input.lastRenameUserTurn < TITLE_RENAME_MIN_USER_TURN_GAP
  ) {
    return { allow: false, reason: 'cooldown', similarity };
  }

  return { allow: true, reason: 'allow', similarity };
}

// Requirements: llm-integration.16.10
function tokenizeForSimilarity(title: string): Set<string> {
  const tokens = title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens);
}
