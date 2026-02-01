// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2, testing-infrastructure.5.1
/**
 * Reporting System Integration Tests
 *
 * These tests verify the unified reporting system correctly aggregates
 * results from different test types and generates comprehensive reports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { TestReporter } from "../reporting/test-reporter";
import type { TestResult, CoverageResult, UnifiedTestReport } from "../reporting/test-reporter";

describe("Reporting System Integration", () => {
  let testReporter: TestReporter;
  const testOutputDir = "test-results/reporting-integration-test";

  beforeEach(() => {
    testReporter = new TestReporter(testOutputDir);
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  /* Preconditions: test results from multiple test types exist
     Action: load and parse Vitest results
     Assertions: Vitest results are correctly parsed into TestResult format
     Requirements: testing-infrastructure.1.1 */
  it("should parse Vitest unit test results correctly", async () => {
    // Requirements: testing-infrastructure.1.1

    const mockVitestData = {
      numTotalTests: 50,
      numPassedTests: 45,
      numFailedTests: 3,
      numPendingTests: 2,
      testResults: [
        {
          name: "tests/unit/example.test.ts",
          perfStats: { runtime: 1500 },
          assertionResults: [
            {
              fullName: "Example test that passed",
              status: "passed",
            },
            {
              fullName: "Example test that failed",
              status: "failed",
              failureMessages: ["Expected true to be false"],
            },
          ],
        },
      ],
    };

    // Create mock results file
    const unitDir = path.join(testOutputDir, "unit");
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, "results.json"), JSON.stringify(mockVitestData));

    const results = await testReporter.loadUnitTestResults();

    expect(results.type).toBe("unit");
    expect(results.total).toBe(50);
    expect(results.passed).toBe(45);
    expect(results.failed).toBe(3);
    expect(results.skipped).toBe(2);
    expect(results.duration).toBe(1500);
    expect(results.failures).toBeDefined();
    expect(results.failures!.length).toBeGreaterThan(0);
  });

  /* Preconditions: Playwright test results exist
     Action: load and parse Playwright results
     Assertions: Playwright results are correctly parsed into TestResult format
     Requirements: testing-infrastructure.5.1 */
  it("should parse Playwright functional test results correctly", async () => {
    // Requirements: testing-infrastructure.5.1

    const mockPlaywrightData = {
      suites: [
        {
          title: "Auth Flow",
          file: "tests/functional/auth-flow.spec.ts",
          specs: [
            {
              title: "should login successfully",
              file: "tests/functional/auth-flow.spec.ts",
              tests: [
                {
                  results: [
                    {
                      status: "passed",
                      duration: 2500,
                    },
                  ],
                },
              ],
            },
            {
              title: "should handle login failure",
              file: "tests/functional/auth-flow.spec.ts",
              tests: [
                {
                  results: [
                    {
                      status: "failed",
                      duration: 1800,
                      error: {
                        message: "Element not found: #login-button",
                        stack: "Error: Element not found\n    at spec.ts:42",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Create mock results file
    const functionalDir = path.join(testOutputDir, "functional");
    fs.mkdirSync(functionalDir, { recursive: true });
    fs.writeFileSync(
      path.join(functionalDir, "results.json"),
      JSON.stringify(mockPlaywrightData),
    );

    const results = await testReporter.loadFunctionalTestResults();

    expect(results.type).toBe("functional");
    expect(results.total).toBe(2);
    expect(results.passed).toBe(1);
    expect(results.failed).toBe(1);
    expect(results.duration).toBe(4300); // 2500 + 1800
    expect(results.failures).toBeDefined();
    expect(results.failures!.length).toBe(1);
    expect(results.failures![0].error).toContain("Element not found");
  });

  /* Preconditions: coverage summary exists
     Action: load and parse coverage results
     Assertions: coverage results are correctly parsed with threshold validation
     Requirements: testing-infrastructure.1.2 */
  it("should parse coverage results with threshold validation", async () => {
    // Requirements: testing-infrastructure.1.2

    const mockCoverageData = {
      total: {
        statements: { pct: 88.5 },
        branches: { pct: 86.2 },
        functions: { pct: 90.1 },
        lines: { pct: 87.8 },
      },
    };

    // Create mock coverage file
    const coverageDir = "coverage";
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify(mockCoverageData),
    );

    const coverage = await testReporter.loadCoverageResults();

    expect(coverage.statements).toBe(88.5);
    expect(coverage.branches).toBe(86.2);
    expect(coverage.functions).toBe(90.1);
    expect(coverage.lines).toBe(87.8);
    expect(coverage.threshold.statements).toBe(85);
    expect(coverage.threshold.branches).toBe(85);
    expect(coverage.threshold.functions).toBe(85);
    expect(coverage.threshold.lines).toBe(85);
    expect(coverage.passed).toBe(true);

    // Clean up
    fs.rmSync(coverageDir, { recursive: true, force: true });
  });

  /* Preconditions: coverage is below threshold
     Action: parse coverage results that don't meet threshold
     Assertions: coverage.passed is false when any metric is below threshold
     Requirements: testing-infrastructure.1.2 */
  it("should detect when coverage is below threshold", async () => {
    // Requirements: testing-infrastructure.1.2

    const mockCoverageData = {
      total: {
        statements: { pct: 82.0 }, // Below 85%
        branches: { pct: 83.5 }, // Below 85%
        functions: { pct: 90.0 },
        lines: { pct: 84.0 }, // Below 85%
      },
    };

    const coverageDir = "coverage";
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify(mockCoverageData),
    );

    const coverage = await testReporter.loadCoverageResults();

    expect(coverage.passed).toBe(false);
    expect(coverage.statements).toBeLessThan(85);
    expect(coverage.branches).toBeLessThan(85);
    expect(coverage.lines).toBeLessThan(85);

    // Clean up
    fs.rmSync(coverageDir, { recursive: true, force: true });
  });

  /* Preconditions: multiple test result files exist
     Action: generate unified report from all sources
     Assertions: report correctly aggregates all test types and calculates summary
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should generate unified report from multiple test sources", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    const mockUnitResults: TestResult = {
      type: "unit",
      passed: 48,
      failed: 2,
      skipped: 0,
      total: 50,
      duration: 5000,
      failures: [
        {
          testName: "Unit test failure 1",
          error: "Assertion failed",
          file: "tests/unit/test1.test.ts",
        },
        {
          testName: "Unit test failure 2",
          error: "Expected value mismatch",
          file: "tests/unit/test2.test.ts",
        },
      ],
    };

    const mockFunctionalResults: TestResult = {
      type: "functional",
      passed: 14,
      failed: 1,
      skipped: 0,
      total: 15,
      duration: 12000,
      failures: [
        {
          testName: "Functional test failure",
          error: "Timeout waiting for element",
          file: "tests/functional/test.spec.ts",
        },
      ],
    };

    const mockPropertyResults: TestResult = {
      type: "property",
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
      duration: 3000,
      failures: [],
    };

    const mockCoverage: CoverageResult = {
      statements: 89.5,
      branches: 87.2,
      functions: 91.0,
      lines: 88.8,
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: true,
    };

    vi.spyOn(testReporter, "loadUnitTestResults").mockResolvedValue(mockUnitResults);
    vi.spyOn(testReporter, "loadFunctionalTestResults").mockResolvedValue(mockFunctionalResults);
    vi.spyOn(testReporter, "loadPropertyTestResults").mockResolvedValue(mockPropertyResults);
    vi.spyOn(testReporter, "loadCoverageResults").mockResolvedValue(mockCoverage);

    const report = await testReporter.generateUnifiedReport();

    // Verify aggregation
    expect(report.summary.totalTests).toBe(75); // 50 + 15 + 10
    expect(report.summary.totalPassed).toBe(72); // 48 + 14 + 10
    expect(report.summary.totalFailed).toBe(3); // 2 + 1 + 0
    expect(report.summary.totalSkipped).toBe(0);
    expect(report.summary.totalDuration).toBe(20000); // 5000 + 12000 + 3000
    expect(report.summary.successRate).toBeCloseTo(96.0, 1); // 72/75 * 100

    // Verify status
    expect(report.status).toBe("failed"); // Has failures
    expect(report.coverage.passed).toBe(true);

    // Verify all failure details are included
    const allFailures = [
      ...(report.results.unit.failures || []),
      ...(report.results.functional.failures || []),
      ...(report.results.property.failures || []),
    ];
    expect(allFailures.length).toBe(3);
  });

  /* Preconditions: unified report is generated
     Action: save report in JSON format and verify structure
     Assertions: JSON file contains all required fields and is valid JSON
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should save complete unified report in JSON format", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    // Ensure output directory exists
    fs.mkdirSync(testOutputDir, { recursive: true });

    const mockReport: UnifiedTestReport = {
      timestamp: "2024-01-01T00:00:00.000Z",
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

    // Verify all required fields
    expect(savedReport.timestamp).toBeDefined();
    expect(savedReport.environment).toBeDefined();
    expect(savedReport.results).toBeDefined();
    expect(savedReport.results.unit).toBeDefined();
    expect(savedReport.results.functional).toBeDefined();
    expect(savedReport.results.property).toBeDefined();
    expect(savedReport.summary).toBeDefined();
    expect(savedReport.coverage).toBeDefined();
    expect(savedReport.status).toBeDefined();
  });

  /* Preconditions: unified report with failures is generated
     Action: save report in Markdown format
     Assertions: Markdown contains formatted failure information
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should format failures correctly in Markdown report", async () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

    // Ensure output directory exists
    fs.mkdirSync(testOutputDir, { recursive: true });

    const mockReport: UnifiedTestReport = {
      timestamp: new Date().toISOString(),
      environment: "test",
      results: {
        unit: {
          type: "unit",
          passed: 8,
          failed: 2,
          skipped: 0,
          total: 10,
          duration: 1000,
          failures: [
            {
              testName: "should validate input",
              error: "Expected 'valid' but received 'invalid'",
              stack: "Error: Expected 'valid' but received 'invalid'\n    at test.ts:42:10",
              file: "tests/unit/validation.test.ts",
              line: 42,
            },
            {
              testName: "should handle edge case",
              error: "Unexpected null value",
              file: "tests/unit/edge-cases.test.ts",
              line: 15,
            },
          ],
        },
        functional: {
          type: "functional",
          passed: 4,
          failed: 1,
          skipped: 0,
          total: 5,
          duration: 2000,
          failures: [
            {
              testName: "should navigate to dashboard",
              error: "Timeout: Element #dashboard not found",
              stack: "TimeoutError: Waiting for selector #dashboard\n    at page.ts:100",
              file: "tests/functional/navigation.spec.ts",
            },
          ],
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
        totalPassed: 15,
        totalFailed: 3,
        totalSkipped: 0,
        totalDuration: 3500,
        successRate: 83.33,
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

    // Verify failure formatting
    expect(markdown).toContain("## Failures");
    expect(markdown).toContain("should validate input");
    expect(markdown).toContain("Expected 'valid' but received 'invalid'");
    expect(markdown).toContain("tests/unit/validation.test.ts:42");
    expect(markdown).toContain("should handle edge case");
    expect(markdown).toContain("should navigate to dashboard");
    expect(markdown).toContain("Timeout: Element #dashboard not found");

    // Verify stack traces are included
    expect(markdown).toContain("```");
    expect(markdown).toContain("Error: Expected 'valid' but received 'invalid'");
  });

  /* Preconditions: report has no failures
     Action: generate Markdown report with all passing tests
     Assertions: Markdown shows success message instead of failure list
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should show success message when no failures exist", async () => {
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

    await testReporter.saveMarkdownReport(mockReport);

    const mdPath = path.join(testOutputDir, "unified-report.md");
    const markdown = fs.readFileSync(mdPath, "utf-8");

    expect(markdown).toContain("No failures detected. All tests passed! 🎉");
    expect(markdown).toContain("✅ **Status**: PASSED");
  });

  /* Preconditions: report contains coverage information
     Action: format coverage table in Markdown
     Assertions: coverage table shows all metrics with pass/fail indicators
     Requirements: testing-infrastructure.1.2 */
  it("should format coverage table with pass/fail indicators", async () => {
    // Requirements: testing-infrastructure.1.2

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
        statements: 90.5,
        branches: 83.2, // Below threshold
        functions: 92.1,
        lines: 89.8,
        threshold: {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        passed: false, // Failed due to branches
      },
      status: "failed",
    };

    await testReporter.saveMarkdownReport(mockReport);

    const mdPath = path.join(testOutputDir, "unified-report.md");
    const markdown = fs.readFileSync(mdPath, "utf-8");

    // Verify coverage table
    expect(markdown).toContain("## Coverage");
    expect(markdown).toContain("| Metric | Coverage | Threshold | Status |");
    expect(markdown).toContain("| Statements | 90.50% | 85% | ✅ |");
    expect(markdown).toContain("| Branches | 83.20% | 85% | ❌ |");
    expect(markdown).toContain("| Functions | 92.10% | 85% | ✅ |");
    expect(markdown).toContain("| Lines | 89.80% | 85% | ✅ |");
  });

  /* Preconditions: reporter can print to console
     Action: print unified report to console
     Assertions: console output contains summary and coverage information
     Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1 */
  it("should print unified report to console", () => {
    // Requirements: testing-infrastructure.1.1, testing-infrastructure.5.1

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

    const consoleSpy = vi.spyOn(console, "log");

    testReporter.printReport(mockReport);

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(output).toContain("UNIFIED TEST REPORT");
    expect(output).toContain("Status: ✅ PASSED");
    expect(output).toContain("Total Tests: 18");
    expect(output).toContain("Passed: 18");
    expect(output).toContain("Coverage:");

    consoleSpy.mockRestore();
  });
});
