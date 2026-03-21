// Requirements: sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
import { LLMProvider } from '../../types';
import { SandboxWebSearchErrorCode } from './contracts';

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

/**
 * Handler for web_search tool in sandbox runtime.
 * Provides provider-native contract for OpenAI, Anthropic, and Gemini.
 *
 * Requirements: sandbox-web-search.1, sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
 */
export class SandboxWebSearchHandler {
  constructor(private readonly provider: LLMProvider) {}

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
      // Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2
      return {
        error: {
          code: 'provider_error',
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
        return [
          { title: 'Search Result 1', url: 'https://example.com/1', content: 'Content 1' },
          { title: 'Search Result 2', url: 'https://example.com/2', content: 'Content 2' },
        ];
      case 'google':
        return {
          groundingMetadata: {
            searchEntryPoints: [{ renderedContent: 'Search Result' }],
            groundingChunks: [{ web: { title: 'Chunk 1', uri: 'https://google.com/1' } }],
          },
        };
      case 'anthropic':
        return {
          results: [{ title: 'Anthropic Result', snippet: 'Result from Anthropic search' }],
        };
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
}
