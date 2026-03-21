import { SandboxWebSearchHandler } from '../../../src/main/code_exec/SandboxWebSearchHandler';
import { LLMProvider } from '../../../src/types';

describe('SandboxWebSearchHandler', () => {
  describe('OpenAI routing', () => {
    const handler = new SandboxWebSearchHandler('openai');

    it('should succeed with valid queries', async () => {
      /* Preconditions: OpenAI handler initialized
         Action: call execute with valid queries
         Assertions: returns success with openai provider and array output
         Requirements: sandbox-web-search.2.3, sandbox-web-search.3.1 */
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        provider: 'openai',
        output: expect.any(Array),
      });
    });

    it('should return invalid_input for missing queries', async () => {
      /* Preconditions: OpenAI handler initialized
         Action: call execute with missing queries
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const result = await handler.execute({ query: 'wrong field' });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('OpenAI web_search requires "queries"'),
        },
      });
    });
  });

  describe('Gemini (Google) routing', () => {
    const handler = new SandboxWebSearchHandler('google');

    it('should succeed with valid queries', async () => {
      /* Preconditions: Gemini handler initialized
         Action: call execute with valid queries
         Assertions: returns success with google provider and groundingMetadata output
         Requirements: sandbox-web-search.2.5, sandbox-web-search.3.1 */
      const result = await handler.execute({ queries: ['test query'] });
      expect(result).toMatchObject({
        provider: 'google',
        output: {
          groundingMetadata: expect.any(Object),
        },
      });
    });

    it('should return invalid_input for invalid queries array', async () => {
      /* Preconditions: Gemini handler initialized
         Action: call execute with invalid queries (not strings)
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const result = await handler.execute({ queries: [123] });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('Gemini web_search requires "queries"'),
        },
      });
    });
  });

  describe('Anthropic routing', () => {
    const handler = new SandboxWebSearchHandler('anthropic');

    it('should succeed with valid query', async () => {
      /* Preconditions: Anthropic handler initialized
         Action: call execute with valid query
         Assertions: returns success with anthropic provider and results output
         Requirements: sandbox-web-search.2.4, sandbox-web-search.3.1 */
      const result = await handler.execute({ query: 'test query' });
      expect(result).toMatchObject({
        provider: 'anthropic',
        output: {
          results: expect.any(Array),
        },
      });
    });

    it('should return invalid_input for missing query string', async () => {
      /* Preconditions: Anthropic handler initialized
         Action: call execute with missing query
         Assertions: returns invalid_input error
         Requirements: sandbox-web-search.2.6 */
      const result = await handler.execute({ queries: ['wrong format'] });
      expect(result).toMatchObject({
        error: {
          code: 'invalid_input',
          message: expect.stringContaining('Anthropic web_search requires "query"'),
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should return provider_error for simulated provider runtime failure', async () => {
      /* Preconditions: handler initialized for openai provider
         Action: call execute with provider-error simulation marker query
         Assertions: returns structured provider_error without throwing
         Requirements: sandbox-web-search.4.1, sandbox-web-search.4.2 */
      const handler = new SandboxWebSearchHandler('openai');
      const result = await handler.execute({ queries: ['__provider_error__'] });
      expect(result).toMatchObject({
        error: {
          code: 'provider_error',
        },
      });
    });

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
  });
});
