// Requirements: sandbox-web-search.2.3, sandbox-web-search.2.4, sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.4.1

import { LLM_CHAT_MODELS, LLM_PROVIDERS } from '../llm/LLMConfig';
import { isTimeoutLikeError } from './contracts';
import type {
  ProviderMethodAdapter,
  ProviderMethodExecutionContext,
  ProviderMethodValidationResult,
} from './ProviderMethodTypes';

interface OpenAIWebSearchInput {
  queries: string[];
}

interface GoogleWebSearchInput {
  queries: string[];
}

interface AnthropicWebSearchInput {
  query: string;
}

interface ProviderFetchDebugContext {
  provider: 'openai' | 'anthropic' | 'google';
  endpoint: string;
  model: string;
  timeoutMs: number;
  requestLabel: string;
}

// Anthropic web_search requires max_tokens in every request.
// 512 balances cost control with sufficient capacity for tool-use responses
// where the primary payload is in the web_search tool result, not the model text.
// Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1
const ANTHROPIC_WEB_SEARCH_MAX_TOKENS = 512;

// Requirements: sandbox-web-search.4.1
function extractProviderMessageWithFallback(errorData: unknown, fallback: string): string {
  const message = (errorData as { error?: { message?: unknown } }).error?.message;
  return typeof message === 'string' ? message : fallback;
}

// Requirements: sandbox-web-search.4.2
function sanitizeEndpointForLogs(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    const redactedParams = ['key', 'api_key', 'token', 'access_token', 'client_secret'];
    for (const param of redactedParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '<redacted>');
      }
    }
    return parsed.toString();
  } catch {
    return endpoint;
  }
}

// Requirements: sandbox-web-search.4.2
function buildProviderTimeoutMessage(context: ProviderFetchDebugContext): string {
  return [
    'web_search timeout:',
    `provider=${context.provider}`,
    `request=${context.requestLabel}`,
    `timeoutMs=${context.timeoutMs}`,
    `model=${context.model}`,
    `endpoint=${sanitizeEndpointForLogs(context.endpoint)}`,
  ].join(' ');
}

// Requirements: sandbox-web-search.3.1, sandbox-web-search.4.2
async function fetchWithProviderTimeoutDiagnostics(
  context: ProviderFetchDebugContext,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(context.endpoint, {
      ...init,
      signal: AbortSignal.timeout(context.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      const timeoutError = new Error(buildProviderTimeoutMessage(context));
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  }
}

// Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1, sandbox-web-search.4.1
class OpenAIWebSearchAdapter implements ProviderMethodAdapter<OpenAIWebSearchInput> {
  // Requirements: sandbox-web-search.1.6
  readonly method = 'web_search' as const;
  // Requirements: sandbox-web-search.2.3
  readonly provider = 'openai' as const;

  // Requirements: sandbox-web-search.2.3, sandbox-web-search.2.6, sandbox-web-search.2.7
  validate(input: unknown): ProviderMethodValidationResult<OpenAIWebSearchInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'web_search expects an object argument.' },
      };
    }
    const raw = input as { queries?: unknown };
    if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
      return {
        success: false,
        error: {
          code: 'invalid_input',
          message: 'OpenAI web_search requires "queries" as an array of strings.',
        },
      };
    }
    // Requirements: sandbox-web-search.2.6, sandbox-web-search.2.7
    const nonEmpty = raw.queries.filter((q: string) => q.trim().length > 0);
    if (nonEmpty.length === 0) {
      return {
        success: false,
        error: {
          code: 'invalid_input',
          message: 'OpenAI web_search requires at least one non-empty query string.',
        },
      };
    }
    return { success: true, input: { queries: raw.queries } };
  }

  // Requirements: sandbox-web-search.2.3, sandbox-web-search.2.8, sandbox-web-search.3.1, sandbox-web-search.4.1
  async execute(
    input: OpenAIWebSearchInput,
    context: ProviderMethodExecutionContext
  ): Promise<unknown> {
    if (!context.apiKey) {
      throw new Error('OpenAI API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.openai[env].model;
    const endpoint = process.env.CLERKLY_OPENAI_API_URL ?? LLM_PROVIDERS.openai.apiUrl;
    const results: unknown[] = [];

    for (const [index, query] of input.queries.entries()) {
      const response = await fetchWithProviderTimeoutDiagnostics(
        {
          provider: 'openai',
          endpoint,
          model,
          timeoutMs: context.timeoutMs,
          requestLabel: `query[${index + 1}/${input.queries.length}] chars=${query.length}`,
        },
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: query,
            tools: [{ type: 'web_search_preview' }],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fallback = `OpenAI web_search request failed with status ${response.status}.`;
        throw new Error(extractProviderMessageWithFallback(errorData, fallback));
      }

      results.push({
        query,
        response: await response.json(),
      });
    }

    return results;
  }
}

// Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1, sandbox-web-search.4.1
class AnthropicWebSearchAdapter implements ProviderMethodAdapter<AnthropicWebSearchInput> {
  // Requirements: sandbox-web-search.1.6
  readonly method = 'web_search' as const;
  // Requirements: sandbox-web-search.2.4
  readonly provider = 'anthropic' as const;

  // Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6, sandbox-web-search.2.7
  validate(input: unknown): ProviderMethodValidationResult<AnthropicWebSearchInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'web_search expects an object argument.' },
      };
    }
    const raw = input as { query?: unknown };
    if (typeof raw.query !== 'string' || raw.query.trim().length === 0) {
      return {
        success: false,
        error: {
          code: 'invalid_input',
          message: 'Anthropic web_search requires "query" as a non-empty string.',
        },
      };
    }
    return { success: true, input: { query: raw.query } };
  }

  // Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1, sandbox-web-search.4.1
  async execute(
    input: AnthropicWebSearchInput,
    context: ProviderMethodExecutionContext
  ): Promise<unknown> {
    if (!context.apiKey) {
      throw new Error('Anthropic API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.anthropic[env].model;
    const endpoint = process.env.CLERKLY_ANTHROPIC_API_URL ?? LLM_PROVIDERS.anthropic.apiUrl;

    const response = await fetchWithProviderTimeoutDiagnostics(
      {
        provider: 'anthropic',
        endpoint,
        model,
        timeoutMs: context.timeoutMs,
        requestLabel: `query chars=${input.query.length}`,
      },
      {
        method: 'POST',
        headers: {
          'x-api-key': context.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: ANTHROPIC_WEB_SEARCH_MAX_TOKENS,
          messages: [{ role: 'user', content: input.query }],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const fallback = `Anthropic web_search request failed with status ${response.status}.`;
      throw new Error(extractProviderMessageWithFallback(errorData, fallback));
    }

    return await response.json();
  }
}

// Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.4.1
class GoogleWebSearchAdapter implements ProviderMethodAdapter<GoogleWebSearchInput> {
  // Requirements: sandbox-web-search.1.6
  readonly method = 'web_search' as const;
  // Requirements: sandbox-web-search.2.5
  readonly provider = 'google' as const;

  // Requirements: sandbox-web-search.2.5, sandbox-web-search.2.6, sandbox-web-search.2.7
  validate(input: unknown): ProviderMethodValidationResult<GoogleWebSearchInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'web_search expects an object argument.' },
      };
    }
    const raw = input as { queries?: unknown };
    if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
      return {
        success: false,
        error: {
          code: 'invalid_input',
          message: 'Gemini web_search requires "queries" as an array of strings.',
        },
      };
    }
    // Requirements: sandbox-web-search.2.6, sandbox-web-search.2.7
    const nonEmpty = raw.queries.filter((q: string) => q.trim().length > 0);
    if (nonEmpty.length === 0) {
      return {
        success: false,
        error: {
          code: 'invalid_input',
          message: 'Gemini web_search requires at least one non-empty query string.',
        },
      };
    }
    return { success: true, input: { queries: raw.queries } };
  }

  // Requirements: sandbox-web-search.2.5, sandbox-web-search.2.8, sandbox-web-search.3.1, sandbox-web-search.4.1
  async execute(
    input: GoogleWebSearchInput,
    context: ProviderMethodExecutionContext
  ): Promise<unknown> {
    if (!context.apiKey) {
      throw new Error('Google API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.google[env].model;
    const baseEndpoint = process.env.CLERKLY_GOOGLE_LLM_API_URL ?? LLM_PROVIDERS.google.apiUrl;
    const endpoint = baseEndpoint.includes('?')
      ? `${baseEndpoint}&key=${encodeURIComponent(context.apiKey)}`
      : `${baseEndpoint}?key=${encodeURIComponent(context.apiKey)}`;
    const results: unknown[] = [];

    for (const [index, query] of input.queries.entries()) {
      const response = await fetchWithProviderTimeoutDiagnostics(
        {
          provider: 'google',
          endpoint,
          model,
          timeoutMs: context.timeoutMs,
          requestLabel: `query[${index + 1}/${input.queries.length}] chars=${query.length}`,
        },
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            contents: [{ parts: [{ text: query }] }],
            tools: [{ googleSearch: {} }],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fallback = `Google web_search request failed with status ${response.status}.`;
        throw new Error(extractProviderMessageWithFallback(errorData, fallback));
      }

      results.push({
        query,
        response: await response.json(),
      });
    }

    return results;
  }
}

// Requirements: sandbox-web-search.6.1
export function createWebSearchProviderMethodAdapters(): ProviderMethodAdapter[] {
  return [
    new OpenAIWebSearchAdapter(),
    new AnthropicWebSearchAdapter(),
    new GoogleWebSearchAdapter(),
  ];
}
