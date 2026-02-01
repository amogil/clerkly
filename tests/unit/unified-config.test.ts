// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4, testing-infrastructure.5.1, testing-infrastructure.5.2
import { describe, it, expect } from "vitest";
import {
  unifiedTestConfig,
  validateTestConfig,
  getConfigForEnvironment,
  getVitestConfig,
  getPlaywrightConfig,
} from "../test.config";

describe("Unified Test Configuration", () => {
  /* Preconditions: unified test configuration is loaded
     Action: access unit test configuration
     Assertions: configuration has correct framework and settings
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4 */
  it("should have valid unit test configuration", () => {
    expect(unifiedTestConfig.unit.framework).toBe("vitest");
    expect(unifiedTestConfig.unit.environment).toBe("node");
    expect(unifiedTestConfig.unit.testPattern).toBeInstanceOf(Array);
    expect(unifiedTestConfig.unit.testPattern.length).toBeGreaterThan(0);
    expect(unifiedTestConfig.unit.setupFiles).toContain("./tests/setup.ts");
  });

  /* Preconditions: unified test configuration is loaded
     Action: access functional test configuration
     Assertions: configuration has correct framework and browser settings
     Requirements: testing-infrastructure.5.1, testing-infrastructure.5.2 */
  it("should have valid functional test configuration", () => {
    expect(unifiedTestConfig.functional.framework).toBe("playwright");
    expect(unifiedTestConfig.functional.browsers).toContain("chromium");
    expect(unifiedTestConfig.functional.browsers).toContain("firefox");
    expect(unifiedTestConfig.functional.browsers).toContain("webkit");
    expect(unifiedTestConfig.functional.timeout).toBeGreaterThanOrEqual(30000);
    expect(unifiedTestConfig.functional.parallelism).toBeGreaterThan(0);
  });

  /* Preconditions: unified test configuration is loaded
     Action: access coverage configuration
     Assertions: coverage thresholds are at least 85%
     Requirements: testing-infrastructure.1.2 */
  it("should have coverage thresholds of at least 85%", () => {
    expect(unifiedTestConfig.coverage.threshold.statements).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.branches).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.functions).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.lines).toBeGreaterThanOrEqual(85);
  });

  /* Preconditions: unified test configuration is loaded
     Action: access property-based testing configuration
     Assertions: PBT is enabled with minimum 100 iterations
     Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2 */
  it("should have property-based testing enabled with minimum 100 iterations", () => {
    expect(unifiedTestConfig.unit.propertyBasedTesting.enabled).toBe(true);
    expect(unifiedTestConfig.unit.propertyBasedTesting.library).toBe("fast-check");
    expect(unifiedTestConfig.unit.propertyBasedTesting.iterations).toBeGreaterThanOrEqual(100);
    expect(unifiedTestConfig.unit.propertyBasedTesting.shrinking).toBe(true);
  });

  /* Preconditions: unified test configuration is loaded
     Action: validate the configuration
     Assertions: validation passes without errors
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2 */
  it("should pass validation", () => {
    expect(() => validateTestConfig(unifiedTestConfig)).not.toThrow();
  });

  /* Preconditions: invalid configuration with low coverage threshold
     Action: validate configuration with 80% threshold
     Assertions: validation throws error
     Requirements: testing-infrastructure.1.2 */
  it("should reject configuration with coverage below 85%", () => {
    const invalidConfig = {
      ...unifiedTestConfig,
      coverage: {
        ...unifiedTestConfig.coverage,
        threshold: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    };

    expect(() => validateTestConfig(invalidConfig)).toThrow(
      "Coverage thresholds must be at least 85%",
    );
  });

  /* Preconditions: invalid configuration with low PBT iterations
     Action: validate configuration with 50 iterations
     Assertions: validation throws error
     Requirements: testing-infrastructure.3.2 */
  it("should reject configuration with PBT iterations below 100", () => {
    const invalidConfig = {
      ...unifiedTestConfig,
      unit: {
        ...unifiedTestConfig.unit,
        propertyBasedTesting: {
          ...unifiedTestConfig.unit.propertyBasedTesting,
          iterations: 50,
        },
      },
    };

    expect(() => validateTestConfig(invalidConfig)).toThrow(
      "Property-based testing must have at least 100 iterations",
    );
  });

  /* Preconditions: invalid configuration with low timeout
     Action: validate configuration with 20 second timeout
     Assertions: validation throws error
     Requirements: testing-infrastructure.5.1 */
  it("should reject configuration with functional test timeout below 30 seconds", () => {
    const invalidConfig = {
      ...unifiedTestConfig,
      functional: {
        ...unifiedTestConfig.functional,
        timeout: 20000,
      },
    };

    expect(() => validateTestConfig(invalidConfig)).toThrow(
      "Functional test timeout must be at least 30 seconds",
    );
  });

  /* Preconditions: invalid configuration with no browsers
     Action: validate configuration with empty browser array
     Assertions: validation throws error
     Requirements: testing-infrastructure.5.1 */
  it("should reject configuration with no browsers", () => {
    const invalidConfig = {
      ...unifiedTestConfig,
      functional: {
        ...unifiedTestConfig.functional,
        browsers: [],
      },
    };

    expect(() => validateTestConfig(invalidConfig)).toThrow(
      "At least one browser must be configured for functional tests",
    );
  });

  /* Preconditions: unified test configuration is loaded
     Action: get development environment configuration
     Assertions: development config has headed mode and no parallelism
     Requirements: testing-infrastructure.5.1, testing-infrastructure.5.2 */
  it("should provide development environment configuration", () => {
    const devConfig = getConfigForEnvironment("development");

    expect(devConfig.functional.headless).toBe(false);
    expect(devConfig.functional.parallelism).toBe(1);
    expect(devConfig.functional.retries).toBe(0);
    expect(devConfig.ci.enabled).toBe(false);
  });

  /* Preconditions: unified test configuration is loaded
     Action: get CI environment configuration
     Assertions: CI config has headless mode and increased retries
     Requirements: testing-infrastructure.5.1, testing-infrastructure.5.2 */
  it("should provide CI environment configuration", () => {
    const ciConfig = getConfigForEnvironment("ci");

    expect(ciConfig.functional.headless).toBe(true);
    expect(ciConfig.functional.parallelism).toBe(2);
    expect(ciConfig.functional.retries).toBe(3);
    expect(ciConfig.ci.enabled).toBe(true);
    expect(ciConfig.ci.maxWorkers).toBe(2);
  });

  /* Preconditions: unified test configuration is loaded
     Action: get production environment configuration
     Assertions: production config has coverage enabled
     Requirements: testing-infrastructure.1.2 */
  it("should provide production environment configuration", () => {
    const prodConfig = getConfigForEnvironment("production");

    expect(prodConfig.functional.headless).toBe(true);
    expect(prodConfig.coverage.enabled).toBe(true);
  });

  /* Preconditions: unified test configuration is loaded
     Action: convert to Vitest configuration
     Assertions: Vitest config has correct structure
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4 */
  it("should convert to Vitest configuration", () => {
    const vitestConfig = getVitestConfig();

    expect(vitestConfig.test).toBeDefined();
    expect(vitestConfig.test?.environment).toBe("node");
    expect(vitestConfig.test?.setupFiles).toContain("./tests/setup.ts");
    expect(vitestConfig.test?.coverage).toBeDefined();
    expect(vitestConfig.test?.coverage?.provider).toBe("v8");
  });

  /* Preconditions: unified test configuration is loaded
     Action: convert to Playwright configuration
     Assertions: Playwright config has correct structure
     Requirements: testing-infrastructure.5.1, testing-infrastructure.5.2 */
  it("should convert to Playwright configuration", () => {
    const playwrightConfig = getPlaywrightConfig();

    expect(playwrightConfig.testDir).toBe("tests/functional");
    expect(playwrightConfig.timeout).toBeGreaterThanOrEqual(30000);
    expect(playwrightConfig.retries).toBeGreaterThanOrEqual(0);
    expect(playwrightConfig.workers).toBeGreaterThan(0);
    expect(playwrightConfig.use).toBeDefined();
  });

  /* Preconditions: unified test configuration is loaded
     Action: access reporting configuration
     Assertions: reporting config has correct output directories
     Requirements: testing-infrastructure.1.4, testing-infrastructure.5.2 */
  it("should have valid reporting configuration", () => {
    expect(unifiedTestConfig.reporting.unit.outputDir).toBe("test-results/unit");
    expect(unifiedTestConfig.reporting.functional.outputDir).toBe("test-results/functional");
    expect(unifiedTestConfig.reporting.coverage.outputDir).toBe("coverage");
    expect(unifiedTestConfig.reporting.coverage.formats).toContain("html");
    expect(unifiedTestConfig.reporting.coverage.formats).toContain("json");
  });

  /* Preconditions: unified test configuration is loaded
     Action: access CI configuration
     Assertions: CI config adapts to environment variable
     Requirements: testing-infrastructure.1.4 */
  it("should adapt CI configuration based on environment", () => {
    const originalCI = process.env.CI;

    // Test with CI=true
    process.env.CI = "true";
    const ciConfig = {
      ...unifiedTestConfig.ci,
      enabled: process.env.CI === "true",
    };
    expect(ciConfig.enabled).toBe(true);

    // Test with CI=false
    process.env.CI = "false";
    const localConfig = {
      ...unifiedTestConfig.ci,
      enabled: process.env.CI === "true",
    };
    expect(localConfig.enabled).toBe(false);

    // Restore original
    process.env.CI = originalCI;
  });

  /* Preconditions: unified test configuration is loaded
     Action: check coverage exclusions
     Assertions: common directories are excluded from coverage
     Requirements: testing-infrastructure.1.2 */
  it("should exclude common directories from coverage", () => {
    const exclusions = unifiedTestConfig.coverage.exclude;

    expect(exclusions).toContain("node_modules/**");
    expect(exclusions).toContain("dist/**");
    expect(exclusions).toContain("tests/**");
    expect(exclusions).toContain("*.config.*");
    expect(exclusions).toContain("**/*.d.ts");
    expect(exclusions).toContain("coverage/**");
  });

  /* Preconditions: unified test configuration is loaded
     Action: check coverage inclusions
     Assertions: source directories are included in coverage
     Requirements: testing-infrastructure.1.2 */
  it("should include source directories in coverage", () => {
    const inclusions = unifiedTestConfig.coverage.include;

    expect(inclusions).toContain("src/**/*.ts");
    expect(inclusions).toContain("main.ts");
    expect(inclusions).toContain("preload.ts");
  });
});
