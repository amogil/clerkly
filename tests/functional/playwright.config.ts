import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: __dirname,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
});
