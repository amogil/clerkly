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
     Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6, sandbox-web-search.2.7 */
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

  /* Preconditions: OpenAI adapter is initialized
     Action: validate payload where all queries are whitespace-only
     Assertions: adapter returns invalid_input validation error
     Requirements: sandbox-web-search.2.3, sandbox-web-search.2.6, sandbox-web-search.2.7 */
  it('validates OpenAI whitespace-only queries as invalid_input', () => {
    const adapter = getAdapter('openai');
    const result = adapter.validate({ queries: ['   ', '\n'] });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'invalid_input',
        message: expect.stringContaining('non-empty query'),
      },
    });
  });

  /* Preconditions: Google adapter is initialized
     Action: validate payload where all queries are whitespace-only
     Assertions: adapter returns invalid_input validation error
     Requirements: sandbox-web-search.2.5, sandbox-web-search.2.6, sandbox-web-search.2.7 */
  it('validates Google whitespace-only queries as invalid_input', () => {
    const adapter = getAdapter('google');
    const result = adapter.validate({ queries: ['   ', '\t'] });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'invalid_input',
        message: expect.stringContaining('non-empty query'),
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

  /* Preconditions: Google adapter with API key in URL hits timeout during fetch
     Action: timeout-like error is thrown during execute
     Assertions: timeout diagnostic message redacts key=<value> from endpoint URL
     Requirements: sandbox-web-search.4.2 */
  it('redacts Google API key from timeout diagnostic endpoint URL', async () => {
    const previousEndpoint = process.env.CLERKLY_GOOGLE_LLM_API_URL;
    process.env.CLERKLY_GOOGLE_LLM_API_URL =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent';
    fetchMock.mockRejectedValue(new Error('Request timed out at provider'));

    try {
      const adapter = getAdapter('google');
      const validation = adapter.validate({ queries: ['redaction test'] });
      expect(validation.success).toBe(true);
      if (!validation.success) {
        throw new Error('Validation failed unexpectedly');
      }

      await expect(
        adapter.execute(validation.input, {
          provider: 'google',
          apiKey: 'super-secret-google-key',
          timeoutMs: 30_000,
        })
      ).rejects.toMatchObject({
        name: 'TimeoutError',
        message: expect.stringContaining('key=%3Credacted%3E'),
      });

      // Verify the actual key value is NOT in the timeout message
      try {
        await adapter.execute(validation.input, {
          provider: 'google',
          apiKey: 'super-secret-google-key',
          timeoutMs: 30_000,
        });
      } catch (error: unknown) {
        expect((error as Error).message).not.toContain('super-secret-google-key');
      }
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

  /* Preconditions: Anthropic and Google adapters are initialized
     Action: validate non-object payload
     Assertions: adapters return invalid_input validation error for object contract violation
     Requirements: sandbox-web-search.2.4, sandbox-web-search.2.5, sandbox-web-search.2.6 */
  it('returns invalid_input when Anthropic or Google payload is not an object', () => {
    const anthropic = getAdapter('anthropic');
    const google = getAdapter('google');

    expect(anthropic.validate('bad-input')).toMatchObject({
      success: false,
      error: { code: 'invalid_input' },
    });
    expect(google.validate(null)).toMatchObject({
      success: false,
      error: { code: 'invalid_input' },
    });
  });

  /* Preconditions: OpenAI adapter is initialized and provider request fails with timeout-like AbortError
     Action: execute validated input
     Assertions: adapter throws normalized TimeoutError with provider diagnostic fields
     Requirements: sandbox-web-search.3.1, sandbox-web-search.4.2 */
  it('normalizes timeout-like fetch errors for OpenAI adapter', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    const adapter = getAdapter('openai');
    const validation = adapter.validate({ queries: ['timeout test'] });
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
    ).rejects.toMatchObject({
      name: 'TimeoutError',
      message: expect.stringContaining('provider=openai'),
    });
  });

  /* Preconditions: Anthropic adapter is initialized and endpoint is invalid URL string
     Action: execute validated input with timeout-like rejection
     Assertions: diagnostic timeout error keeps raw endpoint when URL sanitization cannot parse it
     Requirements: sandbox-web-search.3.1, sandbox-web-search.4.2 */
  it('keeps raw endpoint in timeout diagnostics when endpoint is not a URL', async () => {
    const previousEndpoint = process.env.CLERKLY_ANTHROPIC_API_URL;
    process.env.CLERKLY_ANTHROPIC_API_URL = '::invalid-endpoint::?token=secret';
    fetchMock.mockRejectedValue(new Error('Request timed out at provider'));

    try {
      const adapter = getAdapter('anthropic');
      const validation = adapter.validate({ query: 'latest status' });
      expect(validation.success).toBe(true);
      if (!validation.success) {
        throw new Error('Validation failed unexpectedly');
      }

      await expect(
        adapter.execute(validation.input, {
          provider: 'anthropic',
          apiKey: 'anthropic-key',
          timeoutMs: 30_000,
        })
      ).rejects.toMatchObject({
        name: 'TimeoutError',
        message: expect.stringContaining('endpoint=::invalid-endpoint::?token=secret'),
      });
    } finally {
      if (previousEndpoint === undefined) {
        delete process.env.CLERKLY_ANTHROPIC_API_URL;
      } else {
        process.env.CLERKLY_ANTHROPIC_API_URL = previousEndpoint;
      }
    }
  });

  /* Preconditions: OpenAI adapter is initialized and fetch rejects with non-timeout error
     Action: execute validated input
     Assertions: adapter propagates original error without TimeoutError conversion
     Requirements: sandbox-web-search.4.2 */
  it('propagates non-timeout fetch errors without wrapping', async () => {
    fetchMock.mockRejectedValue(new Error('socket closed unexpectedly'));
    const adapter = getAdapter('openai');
    const validation = adapter.validate({ queries: ['network error test'] });
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
    ).rejects.toThrow('socket closed unexpectedly');
  });

  /* Preconditions: Google adapter is initialized and provider returns non-OK responses
     Action: execute validated input for fallback and explicit provider message branches
     Assertions: adapter uses fallback when message is absent and provider message when present
     Requirements: sandbox-web-search.4.1 */
  it('handles Google non-OK fallback and explicit provider error messages', async () => {
    const adapter = getAdapter('google');
    const validation = adapter.validate({ queries: ['google error path'] });
    expect(validation.success).toBe(true);
    if (!validation.success) {
      throw new Error('Validation failed unexpectedly');
    }

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await expect(
      adapter.execute(validation.input, {
        provider: 'google',
        apiKey: 'google-key',
        timeoutMs: 30_000,
      })
    ).rejects.toThrow('Google web_search request failed with status 503.');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Google quota exceeded' } }),
    });
    await expect(
      adapter.execute(validation.input, {
        provider: 'google',
        apiKey: 'google-key',
        timeoutMs: 30_000,
      })
    ).rejects.toThrow('Google quota exceeded');
  });

  /* Preconditions: OpenAI adapter receives multi-query input; first query succeeds, second fails
     Action: execute with two queries where server returns OK then 500
     Assertions: error thrown (no partial results), fetch called only twice (third query skipped)
     Requirements: sandbox-web-search.2.8 */
  it('fails fast on second query error for OpenAI multi-query (no partial results)', async () => {
    const adapter = getAdapter('openai');
    const validation = adapter.validate({ queries: ['q1', 'q2', 'q3'] });
    expect(validation.success).toBe(true);
    if (!validation.success) throw new Error('Validation failed');

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output: [{ type: 'web_search_call', status: 'completed' }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

    await expect(
      adapter.execute(validation.input, {
        provider: 'openai',
        apiKey: 'sk-test',
        timeoutMs: 30_000,
      })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /* Preconditions: Google adapter receives multi-query input; first query succeeds, second fails
     Action: execute with two queries where server returns OK then 503
     Assertions: error thrown (no partial results), fetch called only twice (third query skipped)
     Requirements: sandbox-web-search.2.8 */
  it('fails fast on second query error for Google multi-query (no partial results)', async () => {
    const adapter = getAdapter('google');
    const validation = adapter.validate({ queries: ['q1', 'q2', 'q3'] });
    expect(validation.success).toBe(true);
    if (!validation.success) throw new Error('Validation failed');

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ groundingMetadata: { groundingChunks: [] } }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

    await expect(
      adapter.execute(validation.input, {
        provider: 'google',
        apiKey: 'google-key',
        timeoutMs: 30_000,
      })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
