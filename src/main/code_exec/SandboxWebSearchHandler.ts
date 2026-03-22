// Requirements: sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
import { LLMProvider } from '../../types';
import { SandboxWebSearchErrorCode } from './contracts';
import { LLM_CHAT_MODELS, LLM_PROVIDERS } from '../llm/LLMConfig';

export interface SandboxWebSearchError {
  error: {
    code: SandboxWebSearchErrorCode;
    message: string;
  };
}

export interface SandboxWebSearchSuccess {
  provider: LLMProvider;
  output: unknown;
  meta?: unknown;
}

export type SandboxWebSearchResult = SandboxWebSearchSuccess | SandboxWebSearchError;

const WEB_SEARCH_TIMEOUT_MS = 30_000;

/**
 * Handler for web_search tool in sandbox runtime.
 * Provides provider-native contract for OpenAI, Anthropic, and Gemini.
 *
 * Requirements: sandbox-web-search.1, sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
 */
export class SandboxWebSearchHandler {
  constructor(
    private readonly provider: LLMProvider,
    private readonly apiKey: string = ''
  ) {}

  /**
   * Execute web search with provider-native input/output.
   * Requirements: sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
   */
  async execute(args: unknown): Promise<SandboxWebSearchResult> {
    const result = this.validateInput(args);
    if ('error' in result) {
      return result;
    }

    try {
      // Requirements: sandbox-web-search.3.1, sandbox-web-search.3.2
      const output = await this.performSearch(result.input);
      return {
        provider: this.provider,
        output,
      };
    } catch (error) {
      const errorCode = this.isTimeoutError(error) ? 'timeout' : 'provider_error';
      // Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2
      return {
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Validate input based on active provider's native contract.
   * Requirements: sandbox-web-search.2.1, sandbox-web-search.2.2, sandbox-web-search.2.6
   */
  private validateInput(
    args: unknown
  ): { success: true; input: Record<string, unknown> } | SandboxWebSearchError {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.error('invalid_input', 'web_search expects an object argument.');
    }

    const raw = args as Record<string, unknown>;

    switch (this.provider) {
      case 'openai':
        // OpenAI-native contract: { queries: string[] }
        if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
          return this.error(
            'invalid_input',
            'OpenAI web_search requires "queries" as an array of strings.'
          );
        }
        return { success: true, input: { queries: raw.queries } };

      case 'google':
        // Gemini-native contract (grounding style): { queries: string[] }
        if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
          return this.error(
            'invalid_input',
            'Gemini web_search requires "queries" as an array of strings.'
          );
        }
        return { success: true, input: { queries: raw.queries } };

      case 'anthropic':
        // Anthropic-native contract (standard search): { query: string }
        if (typeof raw.query !== 'string') {
          return this.error('invalid_input', 'Anthropic web_search requires "query" as a string.');
        }
        return { success: true, input: { query: raw.query } };

      default:
        return this.error(
          'internal_error',
          `Provider ${this.provider} not supported for web_search.`
        );
    }
  }

  /**
   * Perform search and return provider-native payload.
   * In current version, returns simulated provider-native data.
   * Requirements: sandbox-web-search.3.1
   */
  private async performSearch(_input: unknown): Promise<unknown> {
    if (this.shouldSimulateProviderError(_input)) {
      throw new Error('Simulated provider web_search failure.');
    }

    // Requirements: sandbox-web-search.2.3, sandbox-web-search.2.4, sandbox-web-search.2.5
    switch (this.provider) {
      case 'openai':
        return await this.performOpenAIWebSearch(_input);
      case 'google':
        return await this.performGoogleWebSearch(_input);
      case 'anthropic':
        return await this.performAnthropicWebSearch(_input);
      default:
        throw new Error('Unsupported provider');
    }
  }

  private error(code: SandboxWebSearchErrorCode, message: string): SandboxWebSearchError {
    return { error: { code, message } };
  }

  // Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2
  private shouldSimulateProviderError(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }
    const raw = input as { queries?: unknown; query?: unknown };
    if (Array.isArray(raw.queries) && raw.queries.some((query) => query === '__provider_error__')) {
      return true;
    }
    if (raw.query === '__provider_error__') {
      return true;
    }
    return false;
  }

  // Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1, sandbox-web-search.4.1
  private async performOpenAIWebSearch(input: unknown): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not set for sandbox web_search.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('OpenAI web_search input must be an object.');
    }
    const raw = input as { queries?: unknown };
    if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
      throw new Error('OpenAI web_search requires "queries" as an array of strings.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.openai[env].model;
    const endpoint = process.env.CLERKLY_OPENAI_API_URL ?? LLM_PROVIDERS.openai.apiUrl;
    const queries = raw.queries.filter((query) => query.trim().length > 0);

    const results: unknown[] = [];
    for (const query of queries) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: query,
          tools: [{ type: 'web_search_preview' }],
        }),
        signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const providerMessage =
          typeof (errorData as { error?: { message?: unknown } }).error?.message === 'string'
            ? String((errorData as { error?: { message?: string } }).error?.message)
            : `OpenAI web_search request failed with status ${response.status}.`;
        throw new Error(providerMessage);
      }

      const responsePayload = await response.json();
      results.push({
        query,
        response: responsePayload,
      });
    }

    return results;
  }

  // Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1, sandbox-web-search.4.1
  private async performAnthropicWebSearch(input: unknown): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not set for sandbox web_search.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Anthropic web_search input must be an object.');
    }
    const raw = input as { query?: unknown };
    if (typeof raw.query !== 'string' || raw.query.trim().length === 0) {
      throw new Error('Anthropic web_search requires "query" as a non-empty string.');
    }

    const env = process.env.NODE_ENV === 'test' ? 'test' : 'prod';
    const model = LLM_CHAT_MODELS.anthropic[env].model;
    const endpoint = process.env.CLERKLY_ANTHROPIC_API_URL ?? LLM_PROVIDERS.anthropic.apiUrl;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: 'user', content: raw.query }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
      signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const providerMessage =
        typeof (errorData as { error?: { message?: unknown } }).error?.message === 'string'
          ? String((errorData as { error?: { message?: string } }).error?.message)
          : `Anthropic web_search request failed with status ${response.status}.`;
      throw new Error(providerMessage);
    }

    return await response.json();
  }

  // Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1, sandbox-web-search.4.1
  private async performGoogleWebSearch(input: unknown): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error('Google API key is not set for sandbox web_search.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Gemini web_search input must be an object.');
    }
    const raw = input as { queries?: unknown };
    if (!Array.isArray(raw.queries) || !raw.queries.every((q) => typeof q === 'string')) {
      throw new Error('Gemini web_search requires "queries" as an array of strings.');
    }

    const endpoint = process.env.CLERKLY_GOOGLE_LLM_API_URL ?? LLM_PROVIDERS.google.apiUrl;
    const separator = endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${endpoint}${separator}key=${encodeURIComponent(this.apiKey)}`;
    const queries = raw.queries.filter((query) => query.trim().length > 0);
    const results: unknown[] = [];

    for (const query of queries) {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          tools: [{ googleSearch: {} }],
        }),
        signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const providerMessage =
          typeof (errorData as { error?: { message?: unknown } }).error?.message === 'string'
            ? String((errorData as { error?: { message?: string } }).error?.message)
            : `Google web_search request failed with status ${response.status}.`;
        throw new Error(providerMessage);
      }

      const responsePayload = await response.json();
      results.push({
        query,
        response: responsePayload,
      });
    }

    return results;
  }

  // Requirements: sandbox-web-search.4.2
  private isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    return (
      name.includes('timeout') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      (name === 'aborterror' && message.includes('signal'))
    );
  }
}
