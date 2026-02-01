// Requirements: testing-infrastructure.5.3
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable no-empty-pattern */
import { test as base, type Page, type ElectronApplication } from "@playwright/test";
import { createUserDataDir, cleanupUserDataDir, launchApp, type LaunchOptions } from "../utils/app";

/**
 * Test isolation fixture that provides automatic state cleanup between tests.
 * Each test gets a fresh isolated environment with its own user data directory
 * and browser context.
 */
export type TestFixtures = {
  /**
   * Isolated user data directory that is automatically cleaned up after each test.
   * This ensures no state persists between tests.
   */
  isolatedUserDataDir: string;

  /**
   * Launches the Electron app with isolated state and automatic cleanup.
   * The app and page are automatically closed after the test completes.
   */
  isolatedApp: {
    app: ElectronApplication;
    page: Page;
    userDataDir: string;
  };
};

/**
 * Extended test fixture with test isolation capabilities.
 * Use this instead of the default Playwright test to ensure proper isolation.
 *
 * @example
 * ```typescript
 * import { test, expect } from './fixtures/test-isolation';
 *
 * test('my isolated test', async ({ isolatedApp }) => {
 *   const { page } = isolatedApp;
 *   await page.goto('/');
 *   // Test runs in complete isolation
 * });
 * ```
 */
export const test = base.extend<TestFixtures>({
  /**
   * Provides an isolated user data directory for each test.
   * Automatically creates a temporary directory before the test
   * and cleans it up after the test completes.
   */
  isolatedUserDataDir: async ({}, use) => {
    const userDataDir = await createUserDataDir();
    await use(userDataDir);
    await cleanupUserDataDir(userDataDir);
  },

  /**
   * Provides an isolated Electron app instance with automatic cleanup.
   * The app is launched with a fresh user data directory and closed
   * automatically after the test completes.
   *
   * Default launch options can be overridden by setting test.use() in your test file.
   */
  isolatedApp: async ({ isolatedUserDataDir }, use, testInfo) => {
    // Extract launch options from test annotations or use defaults
    const launchOptions: LaunchOptions = (testInfo.annotations.find(
      (a) => a.type === "launchOptions",
    )?.description as LaunchOptions) || {
      authMode: "success",
    };

    const { app, page } = await launchApp(isolatedUserDataDir, launchOptions);

    // Provide the app, page, and userDataDir to the test
    await use({
      app,
      page,
      userDataDir: isolatedUserDataDir,
    });

    // Automatic cleanup: close the app after the test
    await app.close();
  },
});

/**
 * Re-export expect from Playwright for convenience
 */
export { expect } from "@playwright/test";

/**
 * Helper to set launch options for a specific test.
 * Use this to customize how the app is launched for a particular test.
 *
 * @example
 * ```typescript
 * test('test with custom auth', async ({ isolatedApp }) => {
 *   test.use({ launchOptions: { authMode: 'failure' } });
 *   // Test runs with failure auth mode
 * });
 * ```
 */
export const setLaunchOptions = (options: LaunchOptions) => {
  test.use({
    isolatedApp: async ({ isolatedUserDataDir }, use) => {
      const { app, page } = await launchApp(isolatedUserDataDir, options);
      await use({ app, page, userDataDir: isolatedUserDataDir });
      await app.close();
    },
  });
};
