// Requirements: sandbox-web-search.2.3, sandbox-web-search.2.4, sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.4.1

import { LLM_CHAT_MODELS, LLM_PROVIDERS } from '../llm/LLMConfig';
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

// Requirements: sandbox-web-search.4.1, sandbox-web-search.4.4
function shouldSimulateProviderError(input: unknown): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const raw = input as { queries?: unknown; query?: unknown };
  if (Array.isArray(raw.queries) && raw.queries.some((query) => query === '__provider_error__')) {
    return true;
  }
  return raw.query === '__provider_error__';
}

// Requirements: sandbox-web-search.4.1
function extractProviderMessageWithFallback(
  errorData: unknown,
  fallback: string,
  path: 'openai' | 'anthropic' | 'google'
): string {
  if (path === 'google') {
    const message = (errorData as { error?: { message?: unknown } }).error?.message;
    return typeof message === 'string' ? message : fallback;
  }
  const message = (errorData as { error?: { message?: unknown } }).error?.message;
  return typeof message === 'string' ? message : fallback;
}

// Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1, sandbox-web-search.4.1
class OpenAIWebSearchAdapter implements ProviderMethodAdapter<OpenAIWebSearchInput> {
  // Requirements: sandbox-web-search.1.6
  readonly method = 'web_search' as const;
  // Requirements: sandbox-web-search.2.3
  readonly provider = 'openai' as const;

  // Requirements: sandbox-web-search.2.3, sandbox-web-search.2.6
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
    return { success: true, input: { queries: raw.queries } };
  }

  // Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1, sandbox-web-search.4.1
  async execute(
    input: OpenAIWebSearchInput,
    context: ProviderMethodExecutionContext
  ): Promise<unknown> {
    if (shouldSimulateProviderError(input)) {
      throw new Error('Simulated provider web_search failure.');
    }
    if (!context.apiKey) {
      throw new Error('OpenAI API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.openai[env].model;
    const endpoint = process.env.CLERKLY_OPENAI_API_URL ?? LLM_PROVIDERS.openai.apiUrl;
    const queries = input.queries.filter((query) => query.trim().length > 0);
    const results: unknown[] = [];

    for (const query of queries) {
      const response = await fetch(endpoint, {
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
        signal: AbortSignal.timeout(context.timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fallback = `OpenAI web_search request failed with status ${response.status}.`;
        throw new Error(extractProviderMessageWithFallback(errorData, fallback, 'openai'));
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

  // Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6
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
    if (shouldSimulateProviderError(input)) {
      throw new Error('Simulated provider web_search failure.');
    }
    if (!context.apiKey) {
      throw new Error('Anthropic API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.anthropic[env].model;
    const endpoint = process.env.CLERKLY_ANTHROPIC_API_URL ?? LLM_PROVIDERS.anthropic.apiUrl;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': context.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: 'user', content: input.query }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
      signal: AbortSignal.timeout(context.timeoutMs),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const fallback = `Anthropic web_search request failed with status ${response.status}.`;
      throw new Error(extractProviderMessageWithFallback(errorData, fallback, 'anthropic'));
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

  // Requirements: sandbox-web-search.2.5, sandbox-web-search.2.6
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
    return { success: true, input: { queries: raw.queries } };
  }

  // Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.4.1
  async execute(
    input: GoogleWebSearchInput,
    context: ProviderMethodExecutionContext
  ): Promise<unknown> {
    if (shouldSimulateProviderError(input)) {
      throw new Error('Simulated provider web_search failure.');
    }
    if (!context.apiKey) {
      throw new Error('Google API key is not set for sandbox web_search.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.google[env].model;
    const baseEndpoint = process.env.CLERKLY_GOOGLE_LLM_API_URL ?? LLM_PROVIDERS.google.apiUrl;
    const endpoint = baseEndpoint.includes('?')
      ? `${baseEndpoint}&key=${encodeURIComponent(context.apiKey)}`
      : `${baseEndpoint}?key=${encodeURIComponent(context.apiKey)}`;
    const queries = input.queries.filter((query) => query.trim().length > 0);
    const results: unknown[] = [];

    for (const query of queries) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          contents: [{ parts: [{ text: query }] }],
          tools: [{ googleSearch: {} }],
        }),
        signal: AbortSignal.timeout(context.timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fallback = `Google web_search request failed with status ${response.status}.`;
        throw new Error(extractProviderMessageWithFallback(errorData, fallback, 'google'));
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
