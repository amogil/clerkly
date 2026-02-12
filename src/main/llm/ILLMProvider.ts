// Requirements: settings.3

/**
 * Result of testing connection to LLM provider
 */
export interface TestConnectionResult {
  /**
   * Whether the connection test was successful
   */
  success: boolean;

  /**
   * Error message if connection failed
   */
  error?: string;
}

/**
 * Interface for LLM provider implementations
 * 
 * Each provider must implement methods to test connection
 * and identify itself.
 */
export interface ILLMProvider {
  /**
   * Test connection to LLM provider with given API key
   * 
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   * 
   * @param apiKey - API key to test
   * @returns Promise resolving to test result
   */
  testConnection(apiKey: string): Promise<TestConnectionResult>;

  /**
   * Get the name of this provider
   * 
   * @returns Provider name (e.g., "OpenAI", "Anthropic", "Google")
   */
  getProviderName(): string;
}
