import type { LLMProvider } from '../../../src/types';
import {
  assertProviderMethodRegistryConsistency,
  getProviderMethodAdapter,
  validateProviderMethodRegistryConsistency,
} from '../../../src/main/code_exec/ProviderMethodRegistry';
import type {
  ProviderMethodAdapter,
  ProviderMethodCapabilityMatrix,
} from '../../../src/main/code_exec/ProviderMethodTypes';

describe('ProviderMethodRegistry', () => {
  /* Preconditions: base capabilities and adapter registrations are aligned
     Action: run consistency assertion for provider-method registry
     Assertions: no exception is thrown
     Requirements: sandbox-web-search.6.1 */
  it('passes consistency check for built-in registry', () => {
    expect(() => assertProviderMethodRegistryConsistency()).not.toThrow();
  });

  /* Preconditions: registry is initialized with web_search adapters for all providers
     Action: resolve adapter for each supported provider
     Assertions: adapter exists and exposes validate/execute contract
     Requirements: sandbox-web-search.1.6, sandbox-web-search.6.1 */
  it('returns web_search adapter for each built-in provider', () => {
    const providers: LLMProvider[] = ['openai', 'anthropic', 'google'];
    for (const provider of providers) {
      const adapter = getProviderMethodAdapter(provider, 'web_search');
      expect(adapter).not.toBeNull();
      expect(typeof adapter?.validate).toBe('function');
      expect(typeof adapter?.execute).toBe('function');
    }
  });

  /* Preconditions: capability matrix enables web_search for all providers but one provider has no adapter
     Action: validate custom registry consistency inputs
     Assertions: validation throws missing adapter error
     Requirements: sandbox-web-search.6.1 */
  it('fails consistency check when enabled capability has no adapter', () => {
    const capabilities: ProviderMethodCapabilityMatrix = {
      openai: { web_search: true },
      anthropic: { web_search: true },
      google: { web_search: true },
    };
    const adapters: ProviderMethodAdapter[] = [
      {
        provider: 'openai',
        method: 'web_search',
        validate: () => ({ success: true, input: { queries: [] } }),
        execute: async () => [],
      },
      {
        provider: 'anthropic',
        method: 'web_search',
        validate: () => ({ success: true, input: { query: 'q' } }),
        execute: async () => ({}),
      },
    ];

    expect(() => validateProviderMethodRegistryConsistency(capabilities, adapters)).toThrow(
      'google:web_search'
    );
  });

  /* Preconditions: registry input includes duplicate adapter key for provider+method
     Action: validate custom registry consistency inputs
     Assertions: validation throws duplicate registration error
     Requirements: sandbox-web-search.6.1 */
  it('fails consistency check when adapter registration is duplicated', () => {
    const capabilities: ProviderMethodCapabilityMatrix = {
      openai: { web_search: true },
      anthropic: { web_search: false },
      google: { web_search: false },
    };
    const duplicateAdapters: ProviderMethodAdapter[] = [
      {
        provider: 'openai',
        method: 'web_search',
        validate: () => ({ success: true, input: { queries: [] } }),
        execute: async () => [],
      },
      {
        provider: 'openai',
        method: 'web_search',
        validate: () => ({ success: true, input: { queries: ['q'] } }),
        execute: async () => [],
      },
    ];

    expect(() =>
      validateProviderMethodRegistryConsistency(capabilities, duplicateAdapters)
    ).toThrow('Duplicate provider method adapter registration');
  });
});
