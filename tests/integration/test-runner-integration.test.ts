// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2, testing-infrastructure.5.1
/**
 * Test Runner Integration Tests
 *
 * These tests verify the test runner can execute different types of tests
 * and properly coordinate between unit and functional test execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { unifiedTestConfig, getVitestConfig, getPlaywrightConfig } from "../test.config";

describe("Test Runner Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* Preconditions: unified configuration exists
     Action: extract Vitest configuration from unified config
     Assertions: Vitest config has correct test patterns and coverage settings
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2 */
  it("should generate valid Vitest configuration from unified config", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2

    const vitestConfig = getVitestConfig();

    expect(vitestConfig.test).toBeDefined();
    expect(vitestConfig.test?.environment).toBe("node");
    expect(vitestConfig.test?.include).toEqual(unifiedTestConfig.unit.testPattern);
    expect(vitestConfig.test?.exclude).toContain("tests/functional/**");

    // Verify coverage configuration
    expect(vitestConfig.test?.coverage).toBeDefined();
    expect(vitestConfig.test?.coverage?.provider).toBe("v8");
    expect(vitestConfig.test?.coverage?.thresholds?.global?.statements).toBe(85);
    expect(vitestConfig.test?.coverage?.thresholds?.global?.branches).toBe(85);
    expect(vitestConfig.test?.coverage?.thresholds?.global?.functions).toBe(85);
    expect(vitestConfig.test?.coverage?.thresholds?.global?.lines).toBe(85);
  });

  /* Preconditions: unified configuration exists
     Action: extract Playwright configuration from unified config
     Assertions: Playwright config has correct browser and timeout settings
     Requirements: testing-infrastructure.5.1 */
  it("should generate valid Playwright configuration from unified config", () => {
    // Requirements: testing-infrastructure.5.1

    const playwrightConfig = getPlaywrightConfig();

    expect(playwrightConfig.testDir).toBe("tests/functional");
    expect(playwrightConfig.timeout).toBe(60000);
    expect(playwrightConfig.use?.headless).toBe(true);
    expect(playwrightConfig.use?.screenshot).toBe("only-on-failure");
    expect(playwrightConfig.use?.video).toBe("retain-on-failure");
  });

  /* Preconditions: test patterns are configured
     Action: verify unit test patterns include all necessary directories
     Assertions: patterns cover requirements, unit, utils, mocks, and examples
     Requirements: testing-infrastructure.1.1 */
  it("should include all unit test directories in test patterns", () => {
    // Requirements: testing-infrastructure.1.1

    const patterns = unifiedTestConfig.unit.testPattern;

    expect(patterns).toContain("tests/requirements/**/*.test.ts");
    expect(patterns).toContain("tests/unit/**/*.test.ts");
    expect(patterns).toContain("tests/utils/**/*.test.ts");
    expect(patterns).toContain("tests/mocks/**/*.test.ts");
    expect(patterns).toContain("tests/examples/**/*.test.ts");
    expect(patterns).toContain("src/**/*.test.ts");
  });

  /* Preconditions: functional test configuration exists
     Action: verify functional test browsers are configured
     Assertions: all major browsers are included
     Requirements: testing-infrastructure.5.1 */
  it("should configure all major browsers for functional tests", () => {
    // Requirements: testing-infrastructure.5.1

    const browsers = unifiedTestConfig.functional.browsers;

    expect(browsers).toContain("chromium");
    expect(browsers).toContain("firefox");
    expect(browsers).toContain("webkit");
    expect(browsers.length).toBe(3);
  });

  /* Preconditions: property-based testing is enabled
     Action: verify PBT configuration
     Assertions: fast-check is configured with minimum 100 iterations
     Requirements: testing-infrastructure.1.1 */
  it("should configure property-based testing with fast-check", () => {
    // Requirements: testing-infrastructure.1.1

    const pbtConfig = unifiedTestConfig.unit.propertyBasedTesting;

    expect(pbtConfig.enabled).toBe(true);
    expect(pbtConfig.library).toBe("fast-check");
    expect(pbtConfig.iterations).toBeGreaterThanOrEqual(100);
    expect(pbtConfig.shrinking).toBe(true);
  });

  /* Preconditions: coverage configuration exists
     Action: verify coverage includes and excludes
     Assertions: source files are included, test files are excluded
     Requirements: testing-infrastructure.1.2 */
  it("should configure coverage to include source and exclude tests", () => {
    // Requirements: testing-infrastructure.1.2

    const coverage = unifiedTestConfig.coverage;

    // Verify includes
    expect(coverage.include).toContain("src/**/*.ts");
    expect(coverage.include).toContain("main.ts");
    expect(coverage.include).toContain("preload.ts");

    // Verify excludes
    expect(coverage.exclude).toContain("node_modules/**");
    expect(coverage.exclude).toContain("dist/**");
    expect(coverage.exclude).toContain("tests/**");
    expect(coverage.exclude).toContain("coverage/**");
    expect(coverage.exclude).toContain("test-results/**");
  });

  /* Preconditions: reporting configuration exists
     Action: verify reporting outputs for all test types
     Assertions: separate output directories for unit and functional tests
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should configure separate reporting for unit and functional tests", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const reporting = unifiedTestConfig.reporting;

    // Unit test reporting
    expect(reporting.unit.outputDir).toBe("test-results/unit");
    expect(reporting.unit.reporters).toContain("default");
    expect(reporting.unit.reporters).toContain("json");
    expect(reporting.unit.reporters).toContain("html");

    // Functional test reporting
    expect(reporting.functional.outputDir).toBe("test-results/functional");
    expect(reporting.functional.reporters.length).toBeGreaterThan(0);

    // Coverage reporting
    expect(reporting.coverage.outputDir).toBe("coverage");
    expect(reporting.coverage.formats).toContain("text");
    expect(reporting.coverage.formats).toContain("json");
    expect(reporting.coverage.formats).toContain("html");
    expect(reporting.coverage.formats).toContain("lcov");
  });

  /* Preconditions: CI configuration exists
     Action: verify CI mode adjusts test execution parameters
     Assertions: CI mode has appropriate workers and retries
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should adjust configuration for CI environment", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const ci = unifiedTestConfig.ci;

    if (process.env.CI === "true") {
      expect(ci.enabled).toBe(true);
      expect(ci.maxWorkers).toBe(2);
      expect(ci.retries).toBe(3);
    } else {
      expect(ci.maxWorkers).toBe(4);
      expect(ci.retries).toBeGreaterThanOrEqual(2);
    }

    expect(ci.parallel).toBe(true);
    expect(ci.collectCoverage).toBe(true);
  });

  /* Preconditions: test timeout is configured
     Action: verify timeout settings for different test types
     Assertions: unit tests have shorter timeout than functional tests
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should configure appropriate timeouts for different test types", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const unitTimeout = unifiedTestConfig.unit.timeout;
    const functionalTimeout = unifiedTestConfig.functional.timeout;

    expect(unitTimeout).toBe(10000); // 10 seconds for unit tests
    expect(functionalTimeout).toBe(60000); // 60 seconds for functional tests
    expect(functionalTimeout).toBeGreaterThan(unitTimeout);
  });

  /* Preconditions: retry configuration exists
     Action: verify retry settings for functional tests
     Assertions: functional tests have retries configured
     Requirements: testing-infrastructure.5.1 */
  it("should configure retries for functional tests", () => {
    // Requirements: testing-infrastructure.5.1

    const retries = unifiedTestConfig.functional.retries;

    expect(retries).toBeGreaterThanOrEqual(2);
    expect(retries).toBeLessThanOrEqual(3);
  });

  /* Preconditions: parallelism is configured
     Action: verify parallel execution settings
     Assertions: functional tests can run in parallel
     Requirements: testing-infrastructure.5.1 */
  it("should configure parallel execution for functional tests", () => {
    // Requirements: testing-infrastructure.5.1

    const parallelism = unifiedTestConfig.functional.parallelism;

    expect(parallelism).toBeGreaterThan(0);
    expect(parallelism).toBeLessThanOrEqual(4);
  });

  /* Preconditions: screenshot and video settings exist
     Action: verify artifact capture configuration
     Assertions: screenshots and videos are captured on failure
     Requirements: testing-infrastructure.5.1 */
  it("should configure artifact capture for functional test failures", () => {
    // Requirements: testing-infrastructure.5.1

    const functional = unifiedTestConfig.functional;

    expect(functional.screenshots).toBe("only-on-failure");
    expect(functional.video).toBe("retain-on-failure");
    expect(functional.trace).toBe("retain-on-failure");
  });

  /* Preconditions: mock strategy is configured
     Action: verify mock strategy for unit tests
     Assertions: auto mocking is enabled
     Requirements: testing-infrastructure.1.1 */
  it("should configure mock strategy for unit tests", () => {
    // Requirements: testing-infrastructure.1.1

    const mockStrategy = unifiedTestConfig.unit.mockStrategy;

    expect(mockStrategy).toBe("auto");
  });

  /* Preconditions: setup files are configured
     Action: verify setup files are included
     Assertions: setup.ts is in setup files list
     Requirements: testing-infrastructure.1.1 */
  it("should configure setup files for test initialization", () => {
    // Requirements: testing-infrastructure.1.1

    const setupFiles = unifiedTestConfig.unit.setupFiles;

    expect(setupFiles).toContain("./tests/setup.ts");
    expect(setupFiles.length).toBeGreaterThan(0);
  });

  /* Preconditions: coverage provider is configured
     Action: verify coverage provider selection
     Assertions: v8 provider is used for better performance
     Requirements: testing-infrastructure.1.2 */
  it("should use v8 coverage provider for better performance", () => {
    // Requirements: testing-infrastructure.1.2

    const provider = unifiedTestConfig.coverage.provider;

    expect(provider).toBe("v8");
  });

  /* Preconditions: coverage reporters are configured
     Action: verify multiple coverage report formats
     Assertions: text, json, html, and lcov formats are enabled
     Requirements: testing-infrastructure.1.2 */
  it("should generate coverage reports in multiple formats", () => {
    // Requirements: testing-infrastructure.1.2

    const reporters = unifiedTestConfig.coverage.reporter;

    expect(reporters).toContain("text");
    expect(reporters).toContain("json");
    expect(reporters).toContain("html");
    expect(reporters).toContain("lcov");
    expect(reporters.length).toBe(4);
  });

  /* Preconditions: test environment is configured
     Action: verify test environment for unit tests
     Assertions: node environment is used for unit tests
     Requirements: testing-infrastructure.1.1 */
  it("should use node environment for unit tests", () => {
    // Requirements: testing-infrastructure.1.1

    const environment = unifiedTestConfig.unit.environment;

    expect(environment).toBe("node");
  });

  /* Preconditions: headless mode is configured
     Action: verify headless browser mode
     Assertions: functional tests run in headless mode by default
     Requirements: testing-infrastructure.5.1 */
  it("should run functional tests in headless mode by default", () => {
    // Requirements: testing-infrastructure.5.1

    const headless = unifiedTestConfig.functional.headless;

    expect(headless).toBe(true);
  });

  /* Preconditions: test frameworks are configured
     Action: verify correct test frameworks are selected
     Assertions: Vitest for unit tests, Playwright for functional tests
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should use correct test frameworks for each test type", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    expect(unifiedTestConfig.unit.framework).toBe("vitest");
    expect(unifiedTestConfig.functional.framework).toBe("playwright");
  });
});
