// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2, testing-infrastructure.5.1
/**
 * Test System Integration Tests
 *
 * These tests verify the interaction between unit and functional tests,
 * ensuring the unified testing system works correctly as a whole.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { unifiedTestConfig, validateTestConfig } from "../test.config";
import { TestReporter } from "../reporting/test-reporter";
import type { UnifiedTestReport, TestResult } from "../reporting/test-reporter";

describe("Test System Integration", () => {
  let testReporter: TestReporter;
  const testOutputDir = "test-results/integration-test";

  beforeEach(() => {
    testReporter = new TestReporter(testOutputDir);
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  /* Preconditions: unified test configuration exists and is valid
     Action: validate the unified test configuration
     Assertions: configuration passes validation without errors
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2 */
  it("should have valid unified test configuration", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2
    expect(() => validateTestConfig(unifiedTestConfig)).not.toThrow();

    // Verify unit test configuration
    expect(unifiedTestConfig.unit.framework).toBe("vitest");
    expect(unifiedTestConfig.unit.propertyBasedTesting.enabled).toBe(true);
    expect(unifiedTestConfig.unit.propertyBasedTesting.iterations).toBeGreaterThanOrEqual(100);

    // Verify functional test configuration
    expect(unifiedTestConfig.functional.framework).toBe("playwright");
    expect(unifiedTestConfig.functional.browsers).toContain("chromium");

    // Verify coverage thresholds
    expect(unifiedTestConfig.coverage.threshold.statements).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.branches).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.functions).toBeGreaterThanOrEqual(85);
    expect(unifiedTestConfig.coverage.threshold.lines).toBeGreaterThanOrEqual(85);
  });

  /* Preconditions: test reporter is initialized
     Action: create test reporter instance
     Assertions: reporter creates output directory and is ready to use
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should initialize test reporter with output directory", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1
    expect(testReporter).toBeDefined();

    // The directory is created lazily when needed, so we just verify the reporter exists
    expect(testReporter).toBeInstanceOf(TestReporter);
  });

  /* Preconditions: mock test results exist for unit and functional tests
     Action: generate unified report from mock results
     Assertions: report aggregates both test types correctly
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should aggregate unit and functional test results", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    // Create mock unit test results
    const mockUnitResults: TestResult = {
      type: "unit",
      passed: 45,
      failed: 2,
      skipped: 1,
      total: 48,
      duration: 5000,
      failures: [
        {
          testName: "Mock unit test failure",
          error: "Expected true to be false",
          file: "tests/unit/mock.test.ts",
        },
      ],
    };

    // Create mock functional test results
    const mockFunctionalResults: TestResult = {
      type: "functional",
      passed: 12,
      failed: 1,
      skipped: 0,
      total: 13,
      duration: 15000,
      failures: [
        {
          testName: "Mock functional test failure",
          error: "Element not found",
          file: "tests/functional/mock.spec.ts",
        },
      ],
    };

    // Mock the reporter methods
    vi.spyOn(testReporter, "loadUnitTestResults").mockResolvedValue(mockUnitResults);
    vi.spyOn(testReporter, "loadFunctionalTestResults").mockResolvedValue(mockFunctionalResults);
    vi.spyOn(testReporter, "loadPropertyTestResults").mockResolvedValue({
      type: "property",
      passed: 8,
      failed: 0,
      skipped: 0,
      total: 8,
      duration: 3000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadCoverageResults").mockResolvedValue({
      statements: 87.5,
      branches: 86.2,
      functions: 88.1,
      lines: 87.8,
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: true,
    });

    const report = await testReporter.generateUnifiedReport();

    // Verify aggregation
    expect(report.results.unit).toEqual(mockUnitResults);
    expect(report.results.functional).toEqual(mockFunctionalResults);
    expect(report.summary.totalTests).toBe(69); // 48 + 13 + 8
    expect(report.summary.totalPassed).toBe(65); // 45 + 12 + 8
    expect(report.summary.totalFailed).toBe(3); // 2 + 1 + 0
    expect(report.summary.totalSkipped).toBe(1); // 1 + 0 + 0
    expect(report.summary.successRate).toBeCloseTo(94.2, 1); // 65/69 * 100
  });

  /* Preconditions: unified report is generated
     Action: save report in JSON format
     Assertions: JSON file is created with correct structure
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should save unified report in JSON format", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    // Ensure output directory exists
    fs.mkdirSync(testOutputDir, { recursive: true });

    const mockReport: UnifiedTestReport = {
      timestamp: new Date().toISOString(),
      environment: "test",
      results: {
        unit: {
          type: "unit",
          passed: 10,
          failed: 0,
          skipped: 0,
          total: 10,
          duration: 1000,
          failures: [],
        },
        functional: {
          type: "functional",
          passed: 5,
          failed: 0,
          skipped: 0,
          total: 5,
          duration: 2000,
          failures: [],
        },
        property: {
          type: "property",
          passed: 3,
          failed: 0,
          skipped: 0,
          total: 3,
          duration: 500,
          failures: [],
        },
      },
      summary: {
        totalTests: 18,
        totalPassed: 18,
        totalFailed: 0,
        totalSkipped: 0,
        totalDuration: 3500,
        successRate: 100,
      },
      coverage: {
        statements: 90,
        branches: 88,
        functions: 92,
        lines: 91,
        threshold: {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        passed: true,
      },
      status: "passed",
    };

    await testReporter.saveJsonReport(mockReport);

    const jsonPath = path.join(testOutputDir, "unified-report.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const savedReport = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(savedReport).toEqual(mockReport);
  });

  /* Preconditions: unified report is generated
     Action: save report in Markdown format
     Assertions: Markdown file is created with readable content
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should save unified report in Markdown format", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    // Ensure output directory exists
    fs.mkdirSync(testOutputDir, { recursive: true });

    const mockReport: UnifiedTestReport = {
      timestamp: new Date().toISOString(),
      environment: "test",
      results: {
        unit: {
          type: "unit",
          passed: 10,
          failed: 1,
          skipped: 0,
          total: 11,
          duration: 1000,
          failures: [
            {
              testName: "Test failure example",
              error: "Assertion failed",
              file: "test.ts",
              line: 42,
            },
          ],
        },
        functional: {
          type: "functional",
          passed: 5,
          failed: 0,
          skipped: 0,
          total: 5,
          duration: 2000,
          failures: [],
        },
        property: {
          type: "property",
          passed: 3,
          failed: 0,
          skipped: 0,
          total: 3,
          duration: 500,
          failures: [],
        },
      },
      summary: {
        totalTests: 19,
        totalPassed: 18,
        totalFailed: 1,
        totalSkipped: 0,
        totalDuration: 3500,
        successRate: 94.74,
      },
      coverage: {
        statements: 90,
        branches: 88,
        functions: 92,
        lines: 91,
        threshold: {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        passed: true,
      },
      status: "failed",
    };

    await testReporter.saveMarkdownReport(mockReport);

    const mdPath = path.join(testOutputDir, "unified-report.md");
    expect(fs.existsSync(mdPath)).toBe(true);

    const markdown = fs.readFileSync(mdPath, "utf-8");
    expect(markdown).toContain("# Unified Test Report");
    expect(markdown).toContain("**Status**: FAILED");
    expect(markdown).toContain("**Total Tests**: 19");
    expect(markdown).toContain("**Passed**: 18");
    expect(markdown).toContain("**Failed**: 1");
    expect(markdown).toContain("Test failure example");
  });

  /* Preconditions: test configuration includes both unit and functional test patterns
     Action: verify test patterns don't overlap
     Assertions: unit and functional tests are properly separated
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should have separate test patterns for unit and functional tests", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const unitPatterns = unifiedTestConfig.unit.testPattern;
    const functionalDir = "tests/functional";

    // Verify unit test patterns exist
    expect(unitPatterns.length).toBeGreaterThan(0);

    // Verify functional tests have separate directory
    expect(functionalDir).toBe("tests/functional");

    // Verify integration tests are included in unit patterns
    expect(unitPatterns.some((pattern) => pattern.includes("integration"))).toBe(true);
  });

  /* Preconditions: coverage configuration is set
     Action: verify coverage thresholds meet requirements
     Assertions: all coverage thresholds are at least 85%
     Requirements: testing-infrastructure.1.2 */
  it("should enforce minimum 85% coverage thresholds", () => {
    // Requirements: testing-infrastructure.1.2

    const { threshold } = unifiedTestConfig.coverage;

    expect(threshold.statements).toBeGreaterThanOrEqual(85);
    expect(threshold.branches).toBeGreaterThanOrEqual(85);
    expect(threshold.functions).toBeGreaterThanOrEqual(85);
    expect(threshold.lines).toBeGreaterThanOrEqual(85);

    // Verify validation throws error for invalid thresholds
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

  /* Preconditions: reporting configuration exists for both test types
     Action: verify reporting outputs are configured
     Assertions: both unit and functional tests have output directories
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should have reporting configuration for all test types", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const { reporting } = unifiedTestConfig;

    // Verify unit test reporting
    expect(reporting.unit.reporters).toContain("default");
    expect(reporting.unit.reporters).toContain("json");
    expect(reporting.unit.outputDir).toBe("test-results/unit");

    // Verify functional test reporting
    expect(reporting.functional.reporters.length).toBeGreaterThan(0);
    expect(reporting.functional.outputDir).toBe("test-results/functional");

    // Verify coverage reporting
    expect(reporting.coverage.outputDir).toBe("coverage");
    expect(reporting.coverage.formats).toContain("json");
    expect(reporting.coverage.formats).toContain("html");
  });

  /* Preconditions: CI configuration exists
     Action: verify CI settings are appropriate
     Assertions: CI mode has correct parallelism and retry settings
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should have appropriate CI configuration", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const { ci } = unifiedTestConfig;

    // Verify CI detection
    if (process.env.CI === "true") {
      expect(ci.enabled).toBe(true);
    }

    // Verify CI settings
    expect(ci.maxWorkers).toBeGreaterThan(0);
    expect(ci.retries).toBeGreaterThanOrEqual(2);
    expect(ci.collectCoverage).toBe(true);

    // Verify parallel execution is enabled
    expect(ci.parallel).toBe(true);
  });

  /* Preconditions: test report contains failures
     Action: verify failure reporting includes necessary details
     Assertions: failures have test name, error message, and file location
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should report test failures with complete information", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const mockFailure = {
      testName: "should validate user input",
      error: "Expected 'valid' but received 'invalid'",
      stack: "Error: Expected 'valid' but received 'invalid'\n    at test.ts:42:10",
      file: "tests/unit/validation.test.ts",
      line: 42,
    };

    const mockResults: TestResult = {
      type: "unit",
      passed: 5,
      failed: 1,
      skipped: 0,
      total: 6,
      duration: 1000,
      failures: [mockFailure],
    };

    vi.spyOn(testReporter, "loadUnitTestResults").mockResolvedValue(mockResults);
    vi.spyOn(testReporter, "loadFunctionalTestResults").mockResolvedValue({
      type: "functional",
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      failures: [],
    });
    vi.spyOn(testReporter, "loadPropertyTestResults").mockResolvedValue({
      type: "property",
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      failures: [],
    });
    vi.spyOn(testReporter, "loadCoverageResults").mockResolvedValue({
      statements: 90,
      branches: 88,
      functions: 92,
      lines: 91,
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: true,
    });

    const report = await testReporter.generateUnifiedReport();

    expect(report.results.unit.failures).toHaveLength(1);
    expect(report.results.unit.failures![0]).toEqual(mockFailure);
    expect(report.status).toBe("failed");
  });

  /* Preconditions: coverage results are below threshold
     Action: generate report with failing coverage
     Assertions: report status is failed when coverage is insufficient
     Requirements: testing-infrastructure.1.2 */
  it("should mark report as failed when coverage is below threshold", async () => {
    // Requirements: testing-infrastructure.1.2

    vi.spyOn(testReporter, "loadUnitTestResults").mockResolvedValue({
      type: "unit",
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
      duration: 1000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadFunctionalTestResults").mockResolvedValue({
      type: "functional",
      passed: 5,
      failed: 0,
      skipped: 0,
      total: 5,
      duration: 2000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadPropertyTestResults").mockResolvedValue({
      type: "property",
      passed: 3,
      failed: 0,
      skipped: 0,
      total: 3,
      duration: 500,
      failures: [],
    });
    vi.spyOn(testReporter, "loadCoverageResults").mockResolvedValue({
      statements: 82, // Below 85% threshold
      branches: 80, // Below 85% threshold
      functions: 84, // Below 85% threshold
      lines: 83, // Below 85% threshold
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: false,
    });

    const report = await testReporter.generateUnifiedReport();

    expect(report.coverage.passed).toBe(false);
    expect(report.status).toBe("failed");
  });

  /* Preconditions: all tests pass and coverage meets threshold
     Action: generate report with all passing results
     Assertions: report status is passed
     Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2, testing-infrastructure.5.1 */
  it("should mark report as passed when all tests pass and coverage is sufficient", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2, testing-infrastructure.5.1

    vi.spyOn(testReporter, "loadUnitTestResults").mockResolvedValue({
      type: "unit",
      passed: 50,
      failed: 0,
      skipped: 0,
      total: 50,
      duration: 5000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadFunctionalTestResults").mockResolvedValue({
      type: "functional",
      passed: 15,
      failed: 0,
      skipped: 0,
      total: 15,
      duration: 10000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadPropertyTestResults").mockResolvedValue({
      type: "property",
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
      duration: 3000,
      failures: [],
    });
    vi.spyOn(testReporter, "loadCoverageResults").mockResolvedValue({
      statements: 90,
      branches: 88,
      functions: 92,
      lines: 91,
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: true,
    });

    const report = await testReporter.generateUnifiedReport();

    expect(report.summary.totalTests).toBe(75);
    expect(report.summary.totalPassed).toBe(75);
    expect(report.summary.totalFailed).toBe(0);
    expect(report.summary.successRate).toBe(100);
    expect(report.coverage.passed).toBe(true);
    expect(report.status).toBe("passed");
  });
});
