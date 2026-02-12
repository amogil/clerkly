// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8

import { ILLMProvider, TestConnectionResult } from './ILLMProvider';

/**
 * Anthropic LLM provider implementation
 * 
 * Tests connection to Anthropic API using claude-haiku-4-5 model
 */
export class AnthropicProvider implements ILLMProvider {
  getProviderName(): string {
    return 'Anthropic';
  }

  /**
   * Test connection to Anthropic API
   * 
   * Requirements: settings.3.5 - Use minimal test request with claude-haiku-4-5
   * Requirements: settings.3.6 - 10 second timeout
   * Requirements: settings.3.7 - Return success on HTTP 200
   * Requirements: settings.3.8 - Map errors to user-friendly messages
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000), // Requirements: settings.3.6 - 10 second timeout
      });

      // Requirements: settings.3.7 - Success on HTTP 200
      if (response.ok) {
        return { success: true };
      }

      // Requirements: settings.3.8 - Map error to message
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: this.mapErrorToMessage(response.status, errorData),
      };
    } catch (error) {
      // Requirements: settings.3.8 - Handle network errors and timeout
      return {
        success: false,
        error: this.mapExceptionToMessage(error),
      };
    }
  }

  /**
   * Map HTTP status code to user-friendly error message
   * 
   * Requirements: settings.3.8 - Error messages for different HTTP statuses
   */
  private mapErrorToMessage(status: number, errorData: any): string {
    switch (status) {
      case 401:
        return 'Invalid API key. Please check your key and try again.';
      case 403:
        return 'Access forbidden. Please check your API key permissions.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      case 500:
      case 502:
      case 503:
        return 'Provider service unavailable. Please try again later.';
      default:
        return `Connection failed: ${errorData.error?.message || 'Unknown error'}`;
    }
  }

  /**
   * Map exception to user-friendly error message
   * 
   * Requirements: settings.3.8 - Handle timeout and network errors
   */
  private mapExceptionToMessage(error: any): string {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return 'Connection timeout. Please check your internet connection.';
    }
    return 'Network error. Please check your internet connection.';
  }
}
