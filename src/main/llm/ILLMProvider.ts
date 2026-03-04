// Requirements: settings.3, llm-integration.3

/**
 * Result of testing connection to LLM provider
 */
export interface TestConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * A single message in the chat history
 * Requirements: llm-integration.5.1
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Options for a chat request
 * Requirements: llm-integration.5.1
 */
export interface ChatOptions {
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools?: LLMTool[];
}

/**
 * A tool that can be called by the LLM
 * Requirements: llm-integration.5.1
 */
export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * A streaming chunk from the LLM (reasoning only for now)
 * Requirements: llm-integration.5.3
 */
export interface ChatChunk {
  type: 'reasoning';
  delta: string;
  done: boolean;
}

/**
 * Canonical token usage statistics
 * Requirements: llm-integration.5.6, llm-integration.13
 */
export interface LLMUsageCanonical {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

/**
 * Usage envelope with normalized and raw provider usage.
 * Requirements: llm-integration.5.6, llm-integration.13
 */
export interface LLMUsage {
  canonical: LLMUsageCanonical;
  raw: Record<string, unknown>;
}

/**
 * The final action returned by the LLM
 * Requirements: llm-integration.5.4, llm-integration.5.5
 */
export interface LLMAction {
  type: 'text';
  content: string;
}

/**
 * Provider-level chat result envelope:
 * - model structured output (action)
 * - optional provider usage envelope (canonical/raw)
 * Requirements: llm-integration.5.1, llm-integration.5.6
 */
export interface LLMStructuredOutput {
  action: LLMAction;
  usage?: LLMUsage;
}

/**
 * Interface for LLM provider implementations
 * Requirements: settings.3, llm-integration.5
 */
export interface ILLMProvider {
  /**
   * Test connection to LLM provider with given API key
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   */
  testConnection(apiKey: string): Promise<TestConnectionResult>;

  /**
   * Send a chat request with streaming support
   * apiKey is passed to the constructor at provider creation time
   * Requirements: llm-integration.5.1, llm-integration.5.2, llm-integration.5.3, llm-integration.5.4
   *
   * @param messages - Chat history
   * @param options - Model and request options
   * @param onChunk - Callback for streaming reasoning chunks
   * @returns Provider-level chat result envelope
   */
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMStructuredOutput>;

  /**
   * Get the name of this provider
   */
  getProviderName(): string;
}
