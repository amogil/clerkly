// Helper for type-safe test IPC calls in functional tests
import type { Page } from '@playwright/test';
import type { TestIPCHandlers } from '../../../src/types/test-ipc';

/**
 * Type-safe wrapper for test IPC handler invocations
 * 
 * Usage:
 * ```typescript
 * const result = await testIPC(page, 'test:get-profile');
 * // result.profile is typed as User | null
 * ```
 */
export async function testIPC<K extends keyof TestIPCHandlers>(
  page: Page,
  channel: K,
  ...args: Parameters<TestIPCHandlers[K]>
): Promise<Awaited<ReturnType<TestIPCHandlers[K]>>> {
  return await page.evaluate(
    async ({ channel, args }) => {
      return await (window as any).electron.ipcRenderer.invoke(channel, ...args);
    },
    { channel, args }
  );
}
