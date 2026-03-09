// Requirements: settings.3

import { ILLMProvider } from './ILLMProvider';
import type { LLMProvider } from '../../types';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GoogleProvider } from './GoogleProvider';

/**
 * Factory for creating LLM provider instances
 *
 * Provides a centralized way to create provider instances
 * based on provider type.
 */
export class LLMProviderFactory {
  /**
   * Create an LLM provider instance
   *
   * @param type - Provider type
   * @returns Provider instance
   * @throws Error if provider type is unknown
   */
  static createProvider(type: LLMProvider, apiKey: string = ''): ILLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      case 'google':
        return new GoogleProvider(apiKey);
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }
}
