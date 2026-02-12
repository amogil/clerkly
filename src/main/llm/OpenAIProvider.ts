// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8

import { ILLMProvider, TestConnectionResult } from './ILLMProvider';
import { LLM_PROVIDERS, ERROR_MESSAGES } from './LLMConfig';

/**
 * OpenAI LLM provider implementation
 * 
 * Tests connection to OpenAI API using configured model
 */
export class OpenAIProvider implements ILLMProvider {
  private config = LLM_PROVIDERS.openai;

  getProviderName(): string {
    return this.config.name;
  }

  /**
   * Test connection to OpenAI API
   * 
   * Requirements: settings.3.5 - Use minimal test request with configured model
   * Requirements: settings.3.6 - Configured timeout
   * Requirements: settings.3.7 - Return success on HTTP 200
   * Requirements: settings.3.8 - Map errors to user-friendly messages
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.testModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: this.config.maxTokens,
        }),
        signal: AbortSignal.timeout(this.config.timeout), // Requirements: settings.3.6 - Configured timeout
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
    const message = ERROR_MESSAGES[status as keyof typeof ERROR_MESSAGES];
    if (message) {
      return message;
    }
    return `Connection failed: ${errorData.error?.message || ERROR_MESSAGES.unknown}`;
  }

  /**
   * Map exception to user-friendly error message
   * 
   * Requirements: settings.3.8 - Handle timeout and network errors
   */
  private mapExceptionToMessage(error: any): string {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return ERROR_MESSAGES.timeout;
    }
    return ERROR_MESSAGES.network;
  }
}
