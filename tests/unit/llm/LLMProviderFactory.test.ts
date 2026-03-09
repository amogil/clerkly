// Requirements: settings.3

import { LLMProviderFactory } from '../../../src/main/llm/LLMProviderFactory';
import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';
import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';

describe('LLMProviderFactory', () => {
  /* Preconditions: Factory called with 'openai' type
     Action: call createProvider('openai')
     Assertions: returns OpenAIProvider instance
     Requirements: settings.3 */
  it('should create OpenAI provider', () => {
    const provider = LLMProviderFactory.createProvider('openai', 'openai-key');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.getProviderName()).toBe('OpenAI');
  });

  /* Preconditions: Factory called with 'anthropic' type
     Action: call createProvider('anthropic')
     Assertions: returns AnthropicProvider instance
     Requirements: settings.3 */
  it('should create Anthropic provider', () => {
    const provider = LLMProviderFactory.createProvider('anthropic', 'anthropic-key');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.getProviderName()).toBe('Anthropic');
  });

  /* Preconditions: Factory called with 'google' type
     Action: call createProvider('google')
     Assertions: returns GoogleProvider instance
     Requirements: settings.3 */
  it('should create Google provider', () => {
    const provider = LLMProviderFactory.createProvider('google', 'google-key');
    expect(provider).toBeInstanceOf(GoogleProvider);
    expect(provider.getProviderName()).toBe('Google');
  });

  /* Preconditions: Factory called with API key
     Action: call createProvider('openai', 'key')
     Assertions: provider instance stores passed API key
     Requirements: settings.3 */
  it('should pass apiKey into provider constructor', () => {
    const provider = LLMProviderFactory.createProvider('openai', 'factory-key');
    expect((provider as unknown as { apiKey?: string }).apiKey).toBe('factory-key');
  });

  /* Preconditions: Factory called with unknown provider type
     Action: call createProvider() with invalid type
     Assertions: throws error with appropriate message
     Requirements: settings.3 */
  it('should throw error for unknown provider', () => {
    expect(() => {
      LLMProviderFactory.createProvider('unknown' as any);
    }).toThrow('Unknown provider: unknown');
  });
});
