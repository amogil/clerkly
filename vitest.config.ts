import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/requirements/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/functional/**", "node_modules/**"],
  },
});
