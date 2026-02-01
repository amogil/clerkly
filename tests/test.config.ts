// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4, testing-infrastructure.5.1, testing-infrastructure.5.2
/**
 * Unified Testing Configuration
 *
 * This file consolidates all testing configurations for the project:
 * - Unit testing (Vitest)
 * - Functional testing (Playwright)
 * - Property-based testing (fast-check)
 * - Coverage thresholds
 * - CI/CD integration settings
 */

import type { UserConfig as VitestConfig } from "vitest/config";
import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * Unified test configuration interface
 */
export interface UnifiedTestConfig {
  unit: UnitTestConfig;
  functional: FunctionalTestConfig;
  coverage: CoverageConfig;
  reporting: ReportingConfig;
  ci: CIConfig;
}

/**
 * Unit test configuration
 */
export interface UnitTestConfig {
  framework: "vitest";
  testPattern: string[];
  setupFiles: string[];
  mockStrategy: "auto" | "manual";
  propertyBasedTesting: {
    enabled: boolean;
    library: string;
    iterations: number;
    shrinking: boolean;
  };
  timeout: number;
  environment: "node" | "jsdom" | "happy-dom";
}

/**
 * Functional test configuration
 */
export interface FunctionalTestConfig {
  framework: "playwright";
  browsers: string[];
  baseUrl?: string;
  timeout: number;
  retries: number;
  parallelism: number;
  headless: boolean;
  screenshots: "off" | "only-on-failure" | "on";
  video: "off" | "on-first-retry" | "retain-on-failure";
  trace: "off" | "on-first-retry" | "retain-on-failure";
}

/**
 * Coverage configuration
 */
export interface CoverageConfig {
  enabled: boolean;
  provider: "v8" | "istanbul";
  reporter: string[];
  threshold: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  exclude: string[];
  include: string[];
}

/**
 * Reporting configuration
 */
export interface ReportingConfig {
  unit: {
    reporters: string[];
    outputDir: string;
  };
  functional: {
    reporters: Array<string | [string, any]>;
    outputDir: string;
  };
  coverage: {
    outputDir: string;
    formats: string[];
  };
}

/**
 * CI/CD configuration
 */
export interface CIConfig {
  enabled: boolean;
  parallel: boolean;
  maxWorkers: number;
  retries: number;
  failFast: boolean;
  collectCoverage: boolean;
  uploadArtifacts: boolean;
}

/**
 * Default unified test configuration
 */
export const unifiedTestConfig: UnifiedTestConfig = {
  // Unit testing configuration
  unit: {
    framework: "vitest",
    testPattern: [
      "tests/requirements/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/utils/**/*.test.ts",
      "tests/mocks/**/*.test.ts",
      "tests/examples/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    mockStrategy: "auto",
    propertyBasedTesting: {
      enabled: true,
      library: "fast-check",
      iterations: 100,
      shrinking: true,
    },
    timeout: 10000,
    environment: "node",
  },

  // Functional testing configuration
  functional: {
    framework: "playwright",
    browsers: ["chromium", "firefox", "webkit"],
    timeout: 60000,
    retries: 2,
    parallelism: 4,
    headless: true,
    screenshots: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  // Coverage configuration
  coverage: {
    enabled: true,
    provider: "v8",
    reporter: ["text", "json", "html", "lcov"],
    threshold: {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
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
      "renderer/**",
    ],
    include: ["src/**/*.ts", "main.ts", "preload.ts"],
  },

  // Reporting configuration
  reporting: {
    unit: {
      reporters: ["default", "json", "html"],
      outputDir: "test-results/unit",
    },
    functional: {
      reporters: [
        ["list"],
        ["html", { outputFolder: "test-results/functional" }],
        ["json", { outputFile: "test-results/functional/results.json" }],
      ],
      outputDir: "test-results/functional",
    },
    coverage: {
      outputDir: "coverage",
      formats: ["text", "json", "html", "lcov"],
    },
  },

  // CI/CD configuration
  ci: {
    enabled: process.env.CI === "true",
    parallel: true,
    maxWorkers: process.env.CI === "true" ? 2 : 4,
    retries: process.env.CI === "true" ? 3 : 2,
    failFast: false,
    collectCoverage: true,
    uploadArtifacts: true,
  },
};

/**
 * Get Vitest configuration from unified config
 */
export function getVitestConfig(): Partial<VitestConfig> {
  const { unit, coverage, reporting, ci } = unifiedTestConfig;

  return {
    test: {
      environment: unit.environment,
      setupFiles: unit.setupFiles,
      include: unit.testPattern,
      exclude: ["tests/functional/**", "node_modules/**", "dist/**"],
      timeout: unit.timeout,
      coverage: coverage.enabled
        ? {
            provider: coverage.provider,
            reporter: coverage.reporter,
            exclude: coverage.exclude,
            include: coverage.include,
            thresholds: {
              global: {
                branches: coverage.threshold.branches,
                functions: coverage.threshold.functions,
                lines: coverage.threshold.lines,
                statements: coverage.threshold.statements,
              },
            },
          }
        : undefined,
      reporters: reporting.unit.reporters as any,
      outputFile: {
        json: `${reporting.unit.outputDir}/results.json`,
        html: `${reporting.unit.outputDir}/index.html`,
      },
      pool: ci.parallel ? "threads" : undefined,
      poolOptions: ci.parallel
        ? {
            threads: {
              maxThreads: ci.maxWorkers,
              minThreads: 1,
            },
          }
        : undefined,
    },
  };
}

/**
 * Get Playwright configuration from unified config
 */
export function getPlaywrightConfig(): PlaywrightTestConfig {
  const { functional, reporting, ci } = unifiedTestConfig;

  return {
    testDir: "tests/functional",
    timeout: functional.timeout,
    retries: ci.enabled ? ci.retries : functional.retries,
    workers: ci.enabled ? ci.maxWorkers : functional.parallelism,
    reporter: reporting.functional.reporters,
    use: {
      headless: functional.headless,
      screenshot: functional.screenshots,
      video: functional.video,
      trace: functional.trace,
    },
  };
}

/**
 * Validate test configuration
 */
export function validateTestConfig(config: UnifiedTestConfig): boolean {
  // Validate coverage thresholds
  const { threshold } = config.coverage;
  if (
    threshold.statements < 85 ||
    threshold.branches < 85 ||
    threshold.functions < 85 ||
    threshold.lines < 85
  ) {
    throw new Error("Coverage thresholds must be at least 85%");
  }

  // Validate property-based testing iterations
  if (
    config.unit.propertyBasedTesting.enabled &&
    config.unit.propertyBasedTesting.iterations < 100
  ) {
    throw new Error("Property-based testing must have at least 100 iterations");
  }

  // Validate functional test configuration
  if (config.functional.timeout < 30000) {
    throw new Error("Functional test timeout must be at least 30 seconds");
  }

  if (config.functional.browsers.length === 0) {
    throw new Error("At least one browser must be configured for functional tests");
  }

  return true;
}

/**
 * Get test configuration for specific environment
 */
export function getConfigForEnvironment(
  env: "development" | "ci" | "production",
): UnifiedTestConfig {
  const baseConfig = { ...unifiedTestConfig };

  switch (env) {
    case "development":
      return {
        ...baseConfig,
        functional: {
          ...baseConfig.functional,
          headless: false,
          parallelism: 1,
          retries: 0,
        },
        ci: {
          ...baseConfig.ci,
          enabled: false,
        },
      };

    case "ci":
      return {
        ...baseConfig,
        functional: {
          ...baseConfig.functional,
          headless: true,
          parallelism: 2,
          retries: 3,
        },
        ci: {
          ...baseConfig.ci,
          enabled: true,
          maxWorkers: 2,
          retries: 3,
          failFast: false,
        },
      };

    case "production":
      return {
        ...baseConfig,
        functional: {
          ...baseConfig.functional,
          headless: true,
          parallelism: 4,
          retries: 2,
        },
        coverage: {
          ...baseConfig.coverage,
          enabled: true,
        },
      };

    default:
      return baseConfig;
  }
}

// Validate configuration on module load
validateTestConfig(unifiedTestConfig);

// Export default configuration
export default unifiedTestConfig;
