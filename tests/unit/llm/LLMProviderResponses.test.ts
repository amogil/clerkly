// Requirements: settings.2.8

import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';
import { GoogleProvider } from '../../../src/main/llm/GoogleProvider';
import { OpenAIProvider } from '../../../src/main/llm/OpenAIProvider';

global.fetch = jest.fn();

describe('LLM Provider Responses', () => {
  const providers = [new OpenAIProvider(), new AnthropicProvider(), new GoogleProvider()];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: Unknown HTTP status with error message payload
     Action: Call testConnection
     Assertions: Returns Connection failed with error message
     Requirements: settings.2.8 */
  it('should return custom error for unknown status codes', async () => {
    for (const provider of providers) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 418,
        json: async () => ({ error: { message: 'Teapot error' } }),
      });

      const result = await provider.testConnection('test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed: Teapot error');
    }
  });

  /* Preconditions: Unknown HTTP status with missing error message
     Action: Call testConnection
     Assertions: Returns Connection failed with Unknown error fallback
     Requirements: settings.2.8 */
  it('should fall back to Unknown error when error payload is missing', async () => {
    for (const provider of providers) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 418,
        json: async () => ({}),
      });

      const result = await provider.testConnection('test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed: Unknown error');
    }
  });

  /* Preconditions: HTTP error status, response.json throws
     Action: Call testConnection
     Assertions: Returns Connection failed with status-based fallback
     Requirements: settings.2.8 */
  it('should handle JSON parsing errors gracefully', async () => {
    for (const provider of providers) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await provider.testConnection('test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider service unavailable. Please try again later.');
    }
  });
});
