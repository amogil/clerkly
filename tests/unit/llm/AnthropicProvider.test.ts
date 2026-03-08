// Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8

import { AnthropicProvider } from '../../../src/main/llm/AnthropicProvider';

// Mock global fetch
global.fetch = jest.fn();

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider();
    jest.clearAllMocks();
  });

  /* Preconditions: AnthropicProvider instance created
     Action: call getProviderName()
     Assertions: returns 'Anthropic'
     Requirements: settings.3 */
  it('should return provider name', () => {
    expect(provider.getProviderName()).toBe('Anthropic');
  });

  /* Preconditions: fetch returns HTTP 200 response
     Action: call testConnection() with valid API key
     Assertions: returns success: true
     Requirements: settings.3.7 */
  it('should return success on valid API key (HTTP 200)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await provider.testConnection('test-api-key');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      })
    );
  });

  /* Preconditions: fetch returns HTTP 401 response
     Action: call testConnection() with invalid API key
     Assertions: returns success: false with appropriate error message
     Requirements: settings.3.8 */
  it('should return error on invalid API key (HTTP 401)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const result = await provider.testConnection('invalid-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API key. Please check your key and try again.');
  });

  /* Preconditions: fetch returns HTTP 403 response
     Action: call testConnection()
     Assertions: returns success: false with forbidden error message
     Requirements: settings.3.8 */
  it('should return error on forbidden (HTTP 403)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Access forbidden. Please check your API key permissions.');
  });

  /* Preconditions: fetch returns HTTP 429 response
     Action: call testConnection()
     Assertions: returns success: false with rate limit error message
     Requirements: settings.3.8 */
  it('should return error on rate limit (HTTP 429)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limit exceeded. Please try again later.');
  });

  /* Preconditions: fetch returns HTTP 500 response
     Action: call testConnection()
     Assertions: returns success: false with service unavailable error message
     Requirements: settings.3.8 */
  it('should return error on server error (HTTP 500)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Provider service unavailable. Please try again later.');
  });

  /* Preconditions: fetch throws AbortError (timeout)
     Action: call testConnection()
     Assertions: returns success: false with timeout error message
     Requirements: settings.3.6, settings.3.8 */
  it('should return error on network timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Model response timeout. The provider took too long to respond. Please try again later.'
    );
  });

  /* Preconditions: fetch throws network error
     Action: call testConnection()
     Assertions: returns success: false with network error message
     Requirements: settings.3.8 */
  it('should return error on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error. Please check your internet connection.');
  });

  /* Preconditions: fetch returns error with custom message
     Action: call testConnection()
     Assertions: returns success: false with custom error message
     Requirements: settings.3.8 */
  it('should return custom error message from API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Custom error message' } }),
    });

    const result = await provider.testConnection('test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection failed: Custom error message');
  });

  /* Preconditions: fetch configured with correct parameters
     Action: call testConnection()
     Assertions: fetch called with correct model, timeout, and headers
     Requirements: settings.3.5, settings.3.6 */
  it('should use correct API endpoint and parameters', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    await provider.testConnection('test-key');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-6',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5,
        }),
      })
    );
  });

  /* Preconditions: testConnection is called
     Action: call testConnection()
     Assertions: AbortSignal.timeout called with 10000ms timeout
     Requirements: settings.3.6 */
  it('should use 10 second timeout for testConnection', async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    await provider.testConnection('test-key');

    expect(timeoutSpy).toHaveBeenCalledWith(10000);
    timeoutSpy.mockRestore();
  });
});
