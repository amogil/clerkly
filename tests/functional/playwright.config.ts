// Requirements: testing-infrastructure.5.1, testing-infrastructure.5.3
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: __dirname,
  timeout: 60_000,
  retries: 2,
  workers: 4,
  reporter: [["list"], ["html", { outputFolder: "test-results/html", open: "never" }]],

  use: {
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Requirements: testing-infrastructure.5.3
        // Ensure isolated browser contexts for each test
        contextOptions: {
          // Disable shared storage between tests
          storageState: undefined,
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // Requirements: testing-infrastructure.5.3
        contextOptions: {
          storageState: undefined,
        },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        // Requirements: testing-infrastructure.5.3
        contextOptions: {
          storageState: undefined,
        },
      },
    },
  ],
});
