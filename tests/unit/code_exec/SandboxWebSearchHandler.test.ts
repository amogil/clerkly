import { SandboxWebSearchHandler } from '../../../src/main/code_exec/SandboxWebSearchHandler';
import { LLMProvider } from '../../../src/types';

describe('SandboxWebSearchHandler', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  describe('OpenAI routing', () => {
    it('should succeed with valid queries', async () => {
      /* Preconditions: OpenAI handler initialized
         Action: call execute with valid queries
         Assertions: returns success with openai provider and provider-native payload from OpenAI responses API
         Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1 */
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'resp_123', output: [{ type: 'web_search_call' }] }),
      });
      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        provider: 'openai',
        output: expect.any(Array),
      });
      const output = (result as { output: Array<{ query: string; response: { id: string } }> })
        .output;
      expect(output).toHaveLength(1);
      expect(output[0].query).toBe('test query');
      expect(output[0].response.id).toBe('resp_123');
    });

    it('should return invalid_input for missing queries', async () => {
      /* Preconditions: OpenAI handler initialized
         Action: call execute with missing queries
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ query: 'wrong field' });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('OpenAI web_search requires "queries"'),
        },
      });
    });

    it('should return provider_error with provider message on OpenAI non-OK response', async () => {
      /* Preconditions: OpenAI handler initialized with api key
         Action: execute web_search when provider returns non-OK with error.message
         Assertions: returns provider_error and propagates provider message
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit from provider' } }),
      });
      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: 'Rate limit from provider',
        },
      });
    });

    it('should return provider_error with fallback message on OpenAI non-JSON error payload', async () => {
      /* Preconditions: OpenAI handler initialized with api key
         Action: execute web_search when provider returns non-OK without parseable JSON
         Assertions: returns provider_error with status-based fallback message
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('invalid json');
        },
      });
      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('status 500'),
        },
      });
    });

    it('should ignore empty queries and return empty OpenAI output list', async () => {
      /* Preconditions: OpenAI handler initialized with api key
         Action: execute web_search with whitespace-only queries
         Assertions: returns success with empty output and performs no provider calls
         Requirements: sandbox-web-search.3.1 */
      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ queries: ['   ', '\n'] });
      expect(result).toMatchObject({
        provider: 'openai',
        output: [],
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Gemini (Google) routing', () => {
    it('should succeed with valid queries', async () => {
      /* Preconditions: Gemini handler initialized
         Action: call execute with valid queries
         Assertions: returns success with google provider and provider-native payload for each query
         Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1 */
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ groundingMetadata: { source: 'google-search' } }] }),
      });
      const handler = new SandboxWebSearchHandler('google', 'google-key');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        provider: 'google',
        output: expect.any(Array),
      });
      const output = (
        result as { output: Array<{ query: string; response: { candidates: unknown[] } }> }
      ).output;
      expect(output).toHaveLength(1);
      expect(output[0].query).toBe('test query');
      expect(Array.isArray(output[0].response.candidates)).toBe(true);
    });

    it('should return invalid_input for invalid queries array', async () => {
      /* Preconditions: Gemini handler initialized
         Action: call execute with invalid queries (not strings)
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const handler = new SandboxWebSearchHandler('google');
      const result = await handler.execute({ queries: [123] });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('Gemini web_search requires "queries"'),
        },
      });
    });

    it('should append key using "&" when Google endpoint already has query string', async () => {
      /* Preconditions: Google handler initialized and CLERKLY_GOOGLE_LLM_API_URL includes query string
         Action: execute web_search with valid query
         Assertions: request URL appends key via "&"
         Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1 */
      const originalUrl = process.env.CLERKLY_GOOGLE_LLM_API_URL;
      process.env.CLERKLY_GOOGLE_LLM_API_URL =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?alt=sse';
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [] } }] }),
      });

      try {
        const handler = new SandboxWebSearchHandler('google', 'google-key');
        await handler.execute({ queries: ['test query'] });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const firstCallUrl = fetchMock.mock.calls[0][0];
        expect(String(firstCallUrl)).toContain('?alt=sse&key=');
      } finally {
        if (originalUrl === undefined) {
          delete process.env.CLERKLY_GOOGLE_LLM_API_URL;
        } else {
          process.env.CLERKLY_GOOGLE_LLM_API_URL = originalUrl;
        }
      }
    });
  });

  describe('Anthropic routing', () => {
    it('should succeed with valid query', async () => {
      /* Preconditions: Anthropic handler initialized
         Action: call execute with valid query
         Assertions: returns success with anthropic provider and provider-native payload from Anthropic API
         Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1 */
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'msg_123', content: [{ type: 'text', text: 'done' }] }),
      });
      const handler = new SandboxWebSearchHandler('anthropic', 'anthropic-key');
      const result = await handler.execute({ query: 'test query' });
      expect(result).toMatchObject({
        provider: 'anthropic',
        output: { id: 'msg_123' },
      });
    });

    it('should return invalid_input for missing query string', async () => {
      /* Preconditions: Anthropic handler initialized
         Action: call execute with missing query
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const handler = new SandboxWebSearchHandler('anthropic');
      const result = await handler.execute({ queries: ['wrong format'] });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('Anthropic web_search requires "query"'),
        },
      });
    });

    it('should return invalid_input for whitespace-only query string', async () => {
      /* Preconditions: Anthropic handler initialized
         Action: call execute with whitespace-only query
         Assertions: returns invalid_input error and does not call provider
         Requirements: sandbox-web-search.2.4, sandbox-web-search.2.6 */
      const handler = new SandboxWebSearchHandler('anthropic');
      const result = await handler.execute({ query: '   ' });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('non-empty string'),
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should return provider_error on Anthropic non-OK response without message', async () => {
      /* Preconditions: Anthropic handler initialized with api key
         Action: execute web_search when provider returns non-OK without error.message
         Assertions: returns provider_error with status-based fallback message
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      });
      const handler = new SandboxWebSearchHandler('anthropic', 'anthropic-key');
      const result = await handler.execute({ query: 'test query' });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('status 403'),
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should return internal_error for unsupported provider', async () => {
      /* Preconditions: handler initialized with unknown provider
         Action: call execute
         Assertions: returns internal_error
         Requirements: sandbox-web-search.4.2 */
      const handler = new SandboxWebSearchHandler('unknown' as LLMProvider);
      const result = await handler.execute({ query: 'test' });
      expect(result).toMatchObject({
        error: {
          code: 'internal_error',
        },
      });
    });

    it('should return provider_error when OpenAI API key is missing', async () => {
      /* Preconditions: OpenAI handler is initialized without API key
         Action: call execute with valid queries
         Assertions: returns provider_error for missing API key
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      const handler = new SandboxWebSearchHandler('openai', '');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('API key is not set'),
        },
      });
    });

    it('should return provider_error when Anthropic API key is missing', async () => {
      /* Preconditions: Anthropic handler is initialized without API key
         Action: call execute with valid query
         Assertions: returns provider_error for missing API key
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      const handler = new SandboxWebSearchHandler('anthropic', '');
      const result = await handler.execute({ query: 'test query' });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('API key is not set'),
        },
      });
    });

    it('should return provider_error when Google API key is missing', async () => {
      /* Preconditions: Google handler is initialized without API key
         Action: call execute with valid queries
         Assertions: returns provider_error for missing API key
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      const handler = new SandboxWebSearchHandler('google', '');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('API key is not set'),
        },
      });
    });

    it('should return invalid_input for non-object args', async () => {
      /* Preconditions: handler initialized
         Action: call execute with string instead of object
         Assertions: returns invalid_input
         Requirements: sandbox-web-search.2.6 */
      const handler = new SandboxWebSearchHandler('openai');
      const result = await handler.execute('not an object');
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
        },
      });
    });

    it('should map timeout-like provider errors to timeout code', async () => {
      /* Preconditions: OpenAI handler initialized with api key
         Action: provider fetch rejects with timeout-like error
         Assertions: returns structured timeout code with provider diagnostics
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      fetchMock.mockRejectedValue(timeoutError);

      const handler = new SandboxWebSearchHandler('openai', 'sk-test');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'timeout',
          message: expect.stringContaining('provider=openai'),
        },
      });
      expect((result as { error?: { message?: string } }).error?.message ?? '').toContain(
        'timeoutMs=120000'
      );
    });

    it('should return provider_error on Google non-OK response without message', async () => {
      /* Preconditions: Google handler initialized with api key
         Action: execute web_search when provider returns non-OK without error.message
         Assertions: returns provider_error with status-based fallback message
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: {} }),
      });
      const handler = new SandboxWebSearchHandler('google', 'google-key');
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
          message: expect.stringContaining('status 400'),
        },
      });
    });
  });
});
