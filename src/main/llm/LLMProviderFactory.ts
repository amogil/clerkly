// Requirements: settings.3

import { ILLMProvider } from './ILLMProvider';
import { LLMProviderType } from './LLMConfig';
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
  static createProvider(type: LLMProviderType): ILLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      case 'google':
        return new GoogleProvider();
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }
}
