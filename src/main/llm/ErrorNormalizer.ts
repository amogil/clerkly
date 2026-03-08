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

export interface NormalizedLLMError {
  type: NormalizedLLMErrorType;
  message: string;
  retryAfterSeconds?: number;
}

interface ErrorWithStatusCode {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  responseHeaders?: Headers | Record<string, string> | null;
  headers?: Headers | Record<string, string> | null;
}

const TOOL_ERROR_NAMES = new Set([
  'NoSuchToolError',
  'InvalidToolInputError',
  'ToolExecutionError',
  'ToolCallRepairError',
]);

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

// Requirements: llm-integration.3.10
export function normalizeLLMError(error: unknown): NormalizedLLMError {
  if (error instanceof LLMRequestAbortedError) {
    return { type: 'timeout', message: error.message || 'Model response timeout.' };
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
    return { type: 'tool', message: 'Tool execution failed. Please try again.' };
  }
  if (name === 'UIMessageStreamError') {
    return { type: 'protocol', message: 'Response stream error. Please try again.' };
  }
  if (name === 'RetryError') {
    return { type: 'provider', message };
  }

  if (name === 'APICallError') {
    if (statusCode === undefined) {
      return { type: 'network', message };
    }
    if (statusCode === 401 || statusCode === 403) {
      return { type: 'auth', message };
    }
    if (statusCode === 429) {
      const retryAfterFromHeaders =
        parseRetryAfterSecondsFromHeaders(err.responseHeaders) ??
        parseRetryAfterSecondsFromHeaders(err.headers);
      const retryAfterFromMessage = parseRetryAfterSecondsFromText(message);
      return {
        type: 'rate_limit',
        message,
        retryAfterSeconds: retryAfterFromHeaders ?? retryAfterFromMessage,
      };
    }
    if (statusCode >= 500 && statusCode < 600) {
      return { type: 'provider', message };
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return { type: 'auth', message };
  }
  if (
    statusCode === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return {
      type: 'rate_limit',
      message,
      retryAfterSeconds: parseRetryAfterSecondsFromText(message),
    };
  }
  if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) {
    return { type: 'provider', message };
  }

  if (
    lower.includes('invalid api key') ||
    lower.includes('api key is not set') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return { type: 'auth', message };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || name === 'AbortError') {
    return { type: 'timeout', message };
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnreset')) {
    return { type: 'network', message };
  }

  return { type: 'provider', message };
}
