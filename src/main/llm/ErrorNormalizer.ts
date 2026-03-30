// Requirements: llm-integration.3.5, llm-integration.3.10, error-notifications.1.4

import { LLMRequestAbortedError } from './LLMErrors';

export type NormalizedLLMErrorType =
  | 'auth'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'timeout'
  | 'tool'
  | 'protocol';

// Requirements: llm-integration.3.11
export interface NormalizedLLMError {
  type: NormalizedLLMErrorType;
  message: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}

interface ErrorWithStatusCode {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  responseHeaders?: Headers | Record<string, string> | null;
  headers?: Headers | Record<string, string> | null;
  cause?: unknown;
}

const TOOL_ERROR_NAMES = new Set([
  'NoSuchToolError',
  'InvalidToolInputError',
  'ToolExecutionError',
  'ToolCallRepairError',
]);

const STANDARD_MESSAGES = {
  auth: 'Invalid API key. Please check your key and try again.',
  network: 'Network error. Please check your internet connection.',
  rateLimit: 'Rate limit exceeded. Please try again later.',
  provider: 'Provider service unavailable. Please try again later.',
  timeout: 'Model response timeout. The provider took too long to respond. Please try again later.',
  tool: 'Tool execution failed. Please try again later.',
  protocol: 'Response stream error. Please try again later.',
};

// Requirements: llm-integration.3.7.6
export function parseRetryAfterSecondsFromText(message: string): number | undefined {
  const inSecondsMatch = message.match(/in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (inSecondsMatch && inSecondsMatch[1]) {
    return Math.ceil(parseFloat(inSecondsMatch[1]));
  }

  const retryAfterMatch = message.match(/retry\s+after\s+(\d+)/i);
  if (retryAfterMatch && retryAfterMatch[1]) {
    return parseInt(retryAfterMatch[1], 10);
  }

  return undefined;
}

function parseRetryAfterSecondsFromHeaders(
  headers: Headers | Record<string, string> | null | undefined
): number | undefined {
  if (!headers) return undefined;

  let retryAfterValue: string | null = null;
  if (typeof (headers as Headers).get === 'function') {
    retryAfterValue = (headers as Headers).get('retry-after');
  } else {
    const candidate = (headers as Record<string, string>)['retry-after'];
    retryAfterValue = typeof candidate === 'string' ? candidate : null;
  }

  if (!retryAfterValue) return undefined;
  const seconds = Number(retryAfterValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.ceil(seconds);
}

function unwrapCauseChain(error: unknown, maxDepth = 6): ErrorWithStatusCode[] {
  const chain: ErrorWithStatusCode[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && typeof current === 'object' && depth < maxDepth) {
    const typed = current as ErrorWithStatusCode;
    chain.push(typed);
    current = typed.cause;
    depth += 1;
  }

  return chain;
}

// Requirements: llm-integration.3.10, llm-integration.3.11
export function normalizeLLMError(error: unknown): NormalizedLLMError {
  if (error instanceof LLMRequestAbortedError) {
    return { type: 'timeout', message: STANDARD_MESSAGES.timeout };
  }

  const err = error as ErrorWithStatusCode;
  const name = err?.name ?? '';
  const message = err?.message ?? String(error ?? 'Unknown LLM error');
  const lower = message.toLowerCase();
  const statusCode =
    typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.status === 'number'
        ? err.status
        : undefined;

  if (TOOL_ERROR_NAMES.has(name)) {
    return { type: 'tool', message: STANDARD_MESSAGES.tool };
  }
  if (name === 'UIMessageStreamError') {
    return { type: 'protocol', message: STANDARD_MESSAGES.protocol };
  }
  if (lower.includes('modelmessage[] schema') || lower.includes('invalid prompt')) {
    return { type: 'protocol', message: STANDARD_MESSAGES.protocol };
  }

  if (name === 'APICallError') {
    if (statusCode === undefined) {
      return { type: 'network', message: STANDARD_MESSAGES.network };
    }
    if (statusCode === 401 || statusCode === 403) {
      return { type: 'auth', message: STANDARD_MESSAGES.auth, statusCode };
    }
    if (statusCode === 429) {
      const retryAfterFromHeaders =
        parseRetryAfterSecondsFromHeaders(err.responseHeaders) ??
        parseRetryAfterSecondsFromHeaders(err.headers);
      const retryAfterFromMessage = parseRetryAfterSecondsFromText(message);
      return {
        type: 'rate_limit',
        message: STANDARD_MESSAGES.rateLimit,
        statusCode,
        retryAfterSeconds: retryAfterFromHeaders ?? retryAfterFromMessage,
      };
    }
    if (statusCode >= 500 && statusCode < 600) {
      return { type: 'provider', message: STANDARD_MESSAGES.provider, statusCode };
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return { type: 'auth', message: STANDARD_MESSAGES.auth, statusCode };
  }
  if (
    statusCode === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return {
      type: 'rate_limit',
      message: STANDARD_MESSAGES.rateLimit,
      ...(statusCode !== undefined ? { statusCode } : {}),
      retryAfterSeconds: parseRetryAfterSecondsFromText(message),
    };
  }
  if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) {
    return { type: 'provider', message: STANDARD_MESSAGES.provider, statusCode };
  }

  if (
    lower.includes('invalid api key') ||
    lower.includes('api key is not set') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return { type: 'auth', message: STANDARD_MESSAGES.auth };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || name === 'AbortError') {
    return { type: 'timeout', message: STANDARD_MESSAGES.timeout };
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnreset')) {
    return { type: 'network', message: STANDARD_MESSAGES.network };
  }

  if (name === 'RetryError') {
    const chain = unwrapCauseChain(error);

    // Requirements: llm-integration.3.11
    // Extract statusCode from the most relevant cause in the chain for RetryError
    const extractCauseStatusCode = (cause: ErrorWithStatusCode): number | undefined => {
      const s =
        typeof cause.statusCode === 'number'
          ? cause.statusCode
          : typeof cause.status === 'number'
            ? cause.status
            : undefined;
      return s;
    };

    const authCause = chain.find((item) => {
      const itemStatus = extractCauseStatusCode(item);
      const itemMessage = (item.message ?? '').toLowerCase();
      return (
        itemStatus === 401 ||
        itemStatus === 403 ||
        itemMessage.includes('invalid api key') ||
        itemMessage.includes('api key is not set') ||
        itemMessage.includes('unauthorized') ||
        itemMessage.includes('forbidden')
      );
    });
    if (authCause) {
      const causeStatus = extractCauseStatusCode(authCause);
      return {
        type: 'auth',
        message: STANDARD_MESSAGES.auth,
        ...(causeStatus !== undefined ? { statusCode: causeStatus } : {}),
      };
    }

    const rateLimitCause = chain.find((item) => {
      const itemStatus = extractCauseStatusCode(item);
      const itemMessage = (item.message ?? '').toLowerCase();
      return (
        itemStatus === 429 ||
        itemMessage.includes('rate limit') ||
        itemMessage.includes('too many requests') ||
        itemMessage.includes('429')
      );
    });

    if (rateLimitCause) {
      const causeStatus = extractCauseStatusCode(rateLimitCause);
      const retryAfterSeconds =
        parseRetryAfterSecondsFromHeaders(rateLimitCause.responseHeaders) ??
        parseRetryAfterSecondsFromHeaders(rateLimitCause.headers) ??
        parseRetryAfterSecondsFromText(rateLimitCause.message ?? message) ??
        parseRetryAfterSecondsFromText(message);

      return {
        type: 'rate_limit',
        message: STANDARD_MESSAGES.rateLimit,
        ...(causeStatus !== undefined ? { statusCode: causeStatus } : {}),
        retryAfterSeconds,
      };
    }

    // For generic RetryError fallback, find any statusCode in the cause chain
    const causeWithStatus = chain.find(
      (item) => extractCauseStatusCode(item) !== undefined && item !== chain[0]
    );
    const fallbackStatus = causeWithStatus ? extractCauseStatusCode(causeWithStatus) : statusCode;

    return {
      type: 'provider',
      message: STANDARD_MESSAGES.provider,
      ...(fallbackStatus !== undefined ? { statusCode: fallbackStatus } : {}),
    };
  }

  return {
    type: 'provider',
    message: STANDARD_MESSAGES.provider,
    ...(statusCode !== undefined ? { statusCode } : {}),
  };
}
