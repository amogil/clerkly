import { createWebSearchProviderMethodAdapters } from '../../../src/main/code_exec/WebSearchProviderMethodAdapters';
import type { ProviderMethodAdapter } from '../../../src/main/code_exec/ProviderMethodTypes';

function getAdapter(provider: 'openai' | 'anthropic' | 'google'): ProviderMethodAdapter {
  const adapter = createWebSearchProviderMethodAdapters().find(
    (item) => item.provider === provider
  );
  if (!adapter) {
    throw new Error(`Adapter for ${provider} is not registered`);
  }
  return adapter;
}

describe('WebSearchProviderMethodAdapters', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  /* Preconditions: OpenAI adapter is initialized
     Action: validate payload with missing "queries" array
     Assertions: adapter returns invalid_input validation error
     Requirements: sandbox-web-search.2.3, sandbox-web-search.2.6 */
  it('validates OpenAI input contract', () => {
    const adapter = getAdapter('openai');
    const result = adapter.validate({ query: 'wrong field' });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'invalid_input',
      },
    });
  });

  /* Preconditions: Anthropic adapter is initialized
     Action: validate payload with missing "query" string
     Assertions: adapter returns invalid_input validation error
     Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6 */
  it('validates Anthropic input contract', () => {
    const adapter = getAdapter('anthropic');
    const result = adapter.validate({ queries: ['wrong field'] });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'invalid_input',
      },
    });
  });

  /* Preconditions: Anthropic adapter is initialized
     Action: validate payload with whitespace-only "query"
     Assertions: adapter returns invalid_input validation error
     Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6 */
  it('validates Anthropic whitespace-only query as invalid_input', () => {
    const adapter = getAdapter('anthropic');
    const result = adapter.validate({ query: '   ' });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'invalid_input',
        message: expect.stringContaining('non-empty string'),
      },
    });
  });

  /* Preconditions: Google adapter is initialized with endpoint containing query string
     Action: execute validated input
     Assertions: request URL appends key using "&" and returns provider-native payload list
     Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1 */
  it('executes Google adapter and appends key with ampersand when endpoint already has query params', async () => {
    const previousEndpoint = process.env.CLERKLY_GOOGLE_LLM_API_URL;
    process.env.CLERKLY_GOOGLE_LLM_API_URL =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?alt=sse';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ groundingMetadata: { source: 'google-search' } }] }),
    });

    try {
      const adapter = getAdapter('google');
      const validation = adapter.validate({ queries: ['latest news'] });
      expect(validation.success).toBe(true);
      if (!validation.success) {
        throw new Error('Validation failed unexpectedly');
      }

      const output = (await adapter.execute(validation.input, {
        provider: 'google',
        apiKey: 'google-key',
        timeoutMs: 30_000,
      })) as Array<{ query?: string; response?: { candidates?: unknown[] } }>;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('?alt=sse&key=');
      expect(output).toHaveLength(1);
      expect(output[0].query).toBe('latest news');
      expect(Array.isArray(output[0].response?.candidates)).toBe(true);
    } finally {
      if (previousEndpoint === undefined) {
        delete process.env.CLERKLY_GOOGLE_LLM_API_URL;
      } else {
        process.env.CLERKLY_GOOGLE_LLM_API_URL = previousEndpoint;
      }
    }
  });

  /* Preconditions: OpenAI adapter executes provider request and provider returns non-OK response with message
     Action: execute validated input
     Assertions: adapter throws provider message for upper layer mapping
     Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
  it('throws provider message on OpenAI non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit from provider' } }),
    });

    const adapter = getAdapter('openai');
    const validation = adapter.validate({ queries: ['rate limit test'] });
    expect(validation.success).toBe(true);
    if (!validation.success) {
      throw new Error('Validation failed unexpectedly');
    }

    await expect(
      adapter.execute(validation.input, {
        provider: 'openai',
        apiKey: 'sk-test',
        timeoutMs: 30_000,
      })
    ).rejects.toThrow('Rate limit from provider');
  });
});
