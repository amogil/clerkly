// Requirements: llm-integration.16

export const TITLE_META_COMMENT_PREFIX = '<!-- clerkly:title-meta:';
export const TITLE_META_COMMENT_CLOSE = '-->';
export const TITLE_META_PAYLOAD_MAX_LENGTH = 260;
export const AGENT_TITLE_MAX_LENGTH = 200;
export const TITLE_RENAME_MIN_USER_TURN_GAP = 5;
export const TITLE_RENAME_NEED_SCORE_THRESHOLD = 80;
export const TITLE_RENAME_NEED_SCORE_THRESHOLD_DEFAULT_TITLE = 50;
export const DEFAULT_AGENT_TITLE = 'New Agent';

type ParserMode = 'search' | 'capture';

export type AgentTitleMetadata = {
  title: string;
  renameNeedScore: number;
};

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
    const matchIndex = merged.indexOf(TITLE_META_COMMENT_PREFIX);

    if (matchIndex === -1) {
      const keep = Math.max(TITLE_META_COMMENT_PREFIX.length - 1, 0);
      this.searchTail = keep > 0 ? merged.slice(-keep) : '';
      return '';
    }

    const afterPrefixIndex = matchIndex + TITLE_META_COMMENT_PREFIX.length;
    this.mode = 'capture';
    this.captureBuffer = '';
    this.searchTail = '';
    return merged.slice(afterPrefixIndex);
  }

  // Requirements: llm-integration.16.4, llm-integration.16.4.1, llm-integration.16.5, llm-integration.16.6
  private consumeCapture(input: string): string {
    if (input.length === 0) {
      return '';
    }

    const closeIndex = input.indexOf(TITLE_META_COMMENT_CLOSE);
    if (closeIndex >= 0) {
      const payloadPart = input.slice(0, closeIndex);
      const payloadLength = codePointLength(this.captureBuffer) + codePointLength(payloadPart);
      if (payloadLength > TITLE_META_PAYLOAD_MAX_LENGTH) {
        this.resetAfterInvalidCapture();
        return input.slice(closeIndex + TITLE_META_COMMENT_CLOSE.length);
      }

      this.captureBuffer += payloadPart;
      this.candidate = this.captureBuffer;
      this.extractionCompleted = true;
      this.mode = 'search';
      this.captureBuffer = '';
      return '';
    }

    const remainingCapacity = TITLE_META_PAYLOAD_MAX_LENGTH - codePointLength(this.captureBuffer);
    if (remainingCapacity <= 0) {
      this.resetAfterInvalidCapture();
      return input;
    }

    const { head, tail } = takeByCodePoints(input, remainingCapacity);
    this.captureBuffer += head;
    if (tail.length > 0) {
      this.resetAfterInvalidCapture();
      return tail;
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
 * Parse and validate title metadata payload.
 * Requirements: llm-integration.16.1.2, llm-integration.16.1.3, llm-integration.16.10.1
 */
export function parseAgentTitleMetadataPayload(payload: string | null): AgentTitleMetadata | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload.trim()) as {
      title?: unknown;
      rename_need_score?: unknown;
    };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    if (typeof parsed.title !== 'string') {
      return null;
    }
    if (!isValidRenameNeedScore(parsed.rename_need_score)) {
      return null;
    }

    return { title: parsed.title, renameNeedScore: parsed.rename_need_score };
  } catch {
    return null;
  }
}

/**
 * Normalize user-visible agent title candidate and validate limits.
 * Requirements: llm-integration.16.8, llm-integration.16.8.2, llm-integration.16.9
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
  if (codePointLength(withoutEdgePunctuation) > AGENT_TITLE_MAX_LENGTH) {
    return null;
  }
  return withoutEdgePunctuation;
}

export type AgentTitleGuardDecisionReason =
  | 'allow'
  | 'exact_match'
  | 'score_below_threshold'
  | 'invalid_score'
  | 'cooldown';

/**
 * Evaluate anti-flapping guards for auto-title rename.
 * Requirements: llm-integration.16.10, llm-integration.16.10.1
 */
export function evaluateAgentTitleGuards(input: {
  currentTitle: string;
  nextTitle: string;
  renameNeedScore: number;
  currentUserTurn: number;
  lastRenameUserTurn: number | null;
}): { allow: boolean; reason: AgentTitleGuardDecisionReason } {
  if (!isValidRenameNeedScore(input.renameNeedScore)) {
    return { allow: false, reason: 'invalid_score' };
  }

  const current = normalizeAgentTitleCandidate(input.currentTitle);
  const next = normalizeAgentTitleCandidate(input.nextTitle);

  if (!current || !next) {
    return { allow: false, reason: 'exact_match' };
  }

  if (current.toLocaleLowerCase() === next.toLocaleLowerCase()) {
    return { allow: false, reason: 'exact_match' };
  }

  const scorePassesThreshold = passesRenameNeedScoreThreshold(input.renameNeedScore, current);
  if (!scorePassesThreshold) {
    return { allow: false, reason: 'score_below_threshold' };
  }

  if (
    input.lastRenameUserTurn !== null &&
    input.currentUserTurn - input.lastRenameUserTurn < TITLE_RENAME_MIN_USER_TURN_GAP
  ) {
    return { allow: false, reason: 'cooldown' };
  }

  return { allow: true, reason: 'allow' };
}

// Requirements: llm-integration.16.10.1
export function isValidRenameNeedScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

// Requirements: llm-integration.16.10
function passesRenameNeedScoreThreshold(renameNeedScore: number, currentTitle: string): boolean {
  if (currentTitle.toLocaleLowerCase() === DEFAULT_AGENT_TITLE.toLocaleLowerCase()) {
    return renameNeedScore > TITLE_RENAME_NEED_SCORE_THRESHOLD_DEFAULT_TITLE;
  }
  return renameNeedScore >= TITLE_RENAME_NEED_SCORE_THRESHOLD;
}

// Requirements: llm-integration.16.4.1, llm-integration.16.8.2
function codePointLength(value: string): number {
  return Array.from(value).length;
}

// Requirements: llm-integration.16.4.1
function takeByCodePoints(value: string, maxPoints: number): { head: string; tail: string } {
  if (maxPoints <= 0 || value.length === 0) {
    return { head: '', tail: value };
  }

  let consumedUnits = 0;
  let consumedPoints = 0;
  while (consumedUnits < value.length && consumedPoints < maxPoints) {
    const codePoint = value.codePointAt(consumedUnits);
    if (codePoint === undefined) {
      break;
    }
    consumedUnits += codePoint > 0xffff ? 2 : 1;
    consumedPoints += 1;
  }

  return {
    head: value.slice(0, consumedUnits),
    tail: value.slice(consumedUnits),
  };
}
