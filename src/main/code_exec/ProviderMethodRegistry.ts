// Requirements: sandbox-web-search.1.6, sandbox-web-search.6.1

import type { LLMProvider } from '../../types';
import { createWebSearchProviderMethodAdapters } from './WebSearchProviderMethodAdapters';
import type {
  ProviderMethod,
  ProviderMethodAdapter,
  ProviderMethodCapabilityMatrix,
} from './ProviderMethodTypes';

const ALL_PROVIDER_METHODS: ProviderMethod[] = ['web_search'];

// Requirements: sandbox-web-search.1.6
const BASE_PROVIDER_METHOD_CAPABILITIES: ProviderMethodCapabilityMatrix = {
  openai: { web_search: true },
  anthropic: { web_search: true },
  google: { web_search: true },
} as const;

const ALL_PROVIDER_METHOD_ADAPTERS = createWebSearchProviderMethodAdapters();

// Requirements: sandbox-web-search.6.1
function makeRegistryKey(provider: LLMProvider, method: ProviderMethod): string {
  return `${provider}:${method}`;
}

const PROVIDER_METHOD_ADAPTERS = new Map<string, ProviderMethodAdapter>(
  ALL_PROVIDER_METHOD_ADAPTERS.map((adapter) => [
    makeRegistryKey(adapter.provider, adapter.method),
    adapter,
  ])
);

// Requirements: sandbox-web-search.1.6
export function isProviderMethodSupported(provider: LLMProvider, method: ProviderMethod): boolean {
  if (!(provider in BASE_PROVIDER_METHOD_CAPABILITIES)) {
    return false;
  }
  if (!BASE_PROVIDER_METHOD_CAPABILITIES[provider][method]) {
    return false;
  }
  return true;
}

// Requirements: sandbox-web-search.1.6
export function getProviderSupportedMethods(provider: LLMProvider): ProviderMethod[] {
  return ALL_PROVIDER_METHODS.filter((method) => isProviderMethodSupported(provider, method));
}

// Requirements: sandbox-web-search.1.6, sandbox-web-search.6.1
export function getProviderMethodAdapter(
  provider: LLMProvider,
  method: ProviderMethod
): ProviderMethodAdapter | null {
  if (!isProviderMethodSupported(provider, method)) {
    return null;
  }
  return PROVIDER_METHOD_ADAPTERS.get(makeRegistryKey(provider, method)) ?? null;
}

// Requirements: sandbox-web-search.6.1
export function validateProviderMethodRegistryConsistency(
  capabilities: ProviderMethodCapabilityMatrix,
  adapters: Iterable<ProviderMethodAdapter>
): void {
  const adapterKeys = new Set<string>();

  for (const adapter of adapters) {
    const key = makeRegistryKey(adapter.provider, adapter.method);
    if (adapterKeys.has(key)) {
      throw new Error(`Duplicate provider method adapter registration for ${key}.`);
    }
    adapterKeys.add(key);
  }

  for (const provider of Object.keys(capabilities) as LLMProvider[]) {
    for (const method of ALL_PROVIDER_METHODS) {
      const key = makeRegistryKey(provider, method);
      const enabled = capabilities[provider][method];
      if (enabled && !adapterKeys.has(key)) {
        throw new Error(`Provider capability ${key} is enabled but adapter is not registered.`);
      }
      if (!enabled && adapterKeys.has(key)) {
        throw new Error(`Provider capability ${key} is disabled but adapter is registered.`);
      }
    }
  }
}

// Requirements: sandbox-web-search.6.1
export function assertProviderMethodRegistryConsistency(): void {
  validateProviderMethodRegistryConsistency(
    BASE_PROVIDER_METHOD_CAPABILITIES,
    ALL_PROVIDER_METHOD_ADAPTERS
  );
}
