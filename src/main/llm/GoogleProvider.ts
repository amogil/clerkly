// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8

import { ILLMProvider, TestConnectionResult } from './ILLMProvider';
import { LLM_PROVIDERS, ERROR_MESSAGES } from './LLMConfig';

/**
 * Google LLM provider implementation
 *
 * Tests connection to Google Generative AI API using configured model
 */
export class GoogleProvider implements ILLMProvider {
  private config = LLM_PROVIDERS.google;

  getProviderName(): string {
    return this.config.name;
  }

  /**
   * Test connection to Google Generative AI API
   *
   * Requirements: settings.3.5 - Use minimal test request with configured model
   * Requirements: settings.3.6 - Configured timeout
   * Requirements: settings.3.7 - Return success on HTTP 200
   * Requirements: settings.3.8 - Map errors to user-friendly messages
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      // Note: Google API uses API key in URL query parameter
      const response = await fetch(`${this.config.apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
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
  private mapErrorToMessage(status: number, errorData: unknown): string {
    const message = ERROR_MESSAGES[status as keyof typeof ERROR_MESSAGES];
    if (message) {
      return message;
    }
    // Type guard for error data structure
    const errorMessage =
      typeof errorData === 'object' &&
      errorData !== null &&
      'error' in errorData &&
      typeof (errorData as { error?: { message?: string } }).error === 'object' &&
      (errorData as { error?: { message?: string } }).error !== null &&
      'message' in (errorData as { error: { message?: string } }).error
        ? (errorData as { error: { message: string } }).error.message
        : ERROR_MESSAGES.unknown;
    return `Connection failed: ${errorMessage}`;
  }

  /**
   * Map exception to user-friendly error message
   *
   * Requirements: settings.3.8 - Handle timeout and network errors
   */
  private mapExceptionToMessage(error: unknown): string {
    // Type guard for error with name property
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      return ERROR_MESSAGES.timeout;
    }
    return ERROR_MESSAGES.network;
  }
}
