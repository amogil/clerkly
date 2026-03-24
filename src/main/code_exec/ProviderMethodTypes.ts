// Requirements: sandbox-web-search.1.6, sandbox-web-search.2.1, sandbox-web-search.6.1

import type { LLMProvider } from '../../types';

// Requirements: sandbox-web-search.1.6
export type ProviderMethod = 'web_search';

// Requirements: sandbox-web-search.2.1, sandbox-web-search.4.2
export type ProviderMethodValidationErrorCode = 'invalid_input' | 'internal_error';

// Requirements: sandbox-web-search.2.1, sandbox-web-search.4.2
export interface ProviderMethodValidationError {
  code: ProviderMethodValidationErrorCode;
  message: string;
}

// Requirements: sandbox-web-search.2.1
export type ProviderMethodValidationResult<TInput> =
  | { success: true; input: TInput }
  | { success: false; error: ProviderMethodValidationError };

// Requirements: sandbox-web-search.3.1, sandbox-web-search.4.4
export interface ProviderMethodExecutionContext {
  provider: LLMProvider;
  apiKey: string;
  timeoutMs: number;
}

// Requirements: sandbox-web-search.2.1, sandbox-web-search.3.1, sandbox-web-search.4.1
export interface ProviderMethodAdapter<TInput = unknown, TOutput = unknown> {
  method: ProviderMethod;
  provider: LLMProvider;
  validate(input: unknown): ProviderMethodValidationResult<TInput>;
  execute(input: TInput, context: ProviderMethodExecutionContext): Promise<TOutput>;
}

// Requirements: sandbox-web-search.1.6
export type ProviderMethodCapabilityMatrix = Readonly<
  Record<LLMProvider, Readonly<Record<ProviderMethod, boolean>>>
>;
