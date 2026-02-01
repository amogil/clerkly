// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/requirements/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/utils/**/*.test.ts",
      "tests/mocks/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    exclude: ["tests/functional/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/**",
        "*.config.*",
        "**/*.d.ts",
        "coverage/**",
        "test-results/**",
        ".vscode/**",
        ".idea/**",
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },
  },
});
