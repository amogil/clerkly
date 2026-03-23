// Requirements: sandbox-web-search.2, sandbox-web-search.3, sandbox-web-search.4
import { LLMProvider } from '../../types';
import { isTimeoutLikeError, SandboxWebSearchErrorCode } from './contracts';
import { getProviderMethodAdapter } from './ProviderMethodRegistry';

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

const WEB_SEARCH_TIMEOUT_MS = 120_000;

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
    const adapter = getProviderMethodAdapter(this.provider, 'web_search');
    if (!adapter) {
      return this.error(
        'internal_error',
        `Provider ${this.provider} does not expose web_search method capability.`
      );
    }

    const validationResult = adapter.validate(args);
    if (!validationResult.success) {
      return this.error(validationResult.error.code, validationResult.error.message);
    }

    try {
      // Requirements: sandbox-web-search.3.1, sandbox-web-search.3.2
      const output = await adapter.execute(validationResult.input, {
        provider: this.provider,
        apiKey: this.apiKey,
        timeoutMs: WEB_SEARCH_TIMEOUT_MS,
      });
      return {
        provider: this.provider,
        output,
      };
    } catch (error) {
      const errorCode = isTimeoutLikeError(error) ? 'timeout' : 'provider_error';
      // Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2
      return {
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private error(code: SandboxWebSearchErrorCode, message: string): SandboxWebSearchError {
    return { error: { code, message } };
  }
}
