// Requirements: testing.3.1, testing.3.2, testing.3.6

import { defineConfig, devices } from '@playwright/test';

// Load .env file so OPENAI_API_KEY and other secrets are available in tests
// Requirements: llm-integration.8
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

/**
 * Playwright configuration for Electron functional tests
 *
 * These tests launch the real Electron application and interact with it
 * through Playwright's Electron API.
 *
 * Requirements: testing.3.1 - Use real Electron through Playwright
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 * Requirements: testing.3.9 - Use Playwright for Electron
 */
export default defineConfig({
  testDir: './tests/functional',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Run tests in files in parallel
  fullyParallel: false, // Electron tests should run sequentially

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: 1, // Electron tests must run one at a time

  // Reporter to use
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    // Base URL for the application (not used for Electron)
    // baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for different test types
  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
        // Electron-specific settings will be in test files
      },
    },
  ],
});
