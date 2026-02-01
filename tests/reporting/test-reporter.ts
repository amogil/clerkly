// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4, testing-infrastructure.5.1, testing-infrastructure.5.2
/**
 * Unified Test Reporter
 *
 * This module provides comprehensive test reporting functionality:
 * - Aggregates results from unit and functional tests
 * - Generates unified coverage reports
 * - Produces summary statistics
 * - Exports results in multiple formats (JSON, HTML, Markdown)
 */

import fs from "fs";
import path from "path";

/**
 * Test result interface
 */
export interface TestResult {
  type: "unit" | "functional" | "property";
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  coverage?: CoverageResult;
  failures?: TestFailure[];
}

/**
 * Coverage result interface
 */
export interface CoverageResult {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  threshold: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  passed: boolean;
}

/**
 * Test failure interface
 */
export interface TestFailure {
  testName: string;
  error: string;
  stack?: string;
  file?: string;
  line?: number;
}

/**
 * Unified test report interface
 */
export interface UnifiedTestReport {
  timestamp: string;
  environment: string;
  results: {
    unit: TestResult;
    functional: TestResult;
    property: TestResult;
  };
  summary: {
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    totalDuration: number;
    successRate: number;
  };
  coverage: CoverageResult;
  status: "passed" | "failed";
}

/**
 * Test Reporter class
 */
export class TestReporter {
  private outputDir: string;

  constructor(outputDir: string = "test-results") {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Load unit test results
   */
  async loadUnitTestResults(): Promise<TestResult> {
    const resultsPath = path.join(this.outputDir, "unit", "results.json");

    if (!fs.existsSync(resultsPath)) {
      return this.createEmptyResult("unit");
    }

    try {
      const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
      return this.parseVitestResults(data);
    } catch (error) {
      console.error("Error loading unit test results:", error);
      return this.createEmptyResult("unit");
    }
  }

  /**
   * Load functional test results
   */
  async loadFunctionalTestResults(): Promise<TestResult> {
    const resultsPath = path.join(this.outputDir, "functional", "results.json");

    if (!fs.existsSync(resultsPath)) {
      return this.createEmptyResult("functional");
    }

    try {
      const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
      return this.parsePlaywrightResults(data);
    } catch (error) {
      console.error("Error loading functional test results:", error);
      return this.createEmptyResult("functional");
    }
  }

  /**
   * Load property test results
   */
  async loadPropertyTestResults(): Promise<TestResult> {
    // Property tests are part of unit tests, extract them separately
    return this.createEmptyResult("property");
  }

  /**
   * Load coverage results
   */
  async loadCoverageResults(): Promise<CoverageResult> {
    const coveragePath = path.join("coverage", "coverage-summary.json");

    if (!fs.existsSync(coveragePath)) {
      return this.createEmptyCoverage();
    }

    try {
      const data = JSON.parse(fs.readFileSync(coveragePath, "utf-8"));
      return this.parseCoverageResults(data);
    } catch (error) {
      console.error("Error loading coverage results:", error);
      return this.createEmptyCoverage();
    }
  }

  /**
   * Generate unified report
   */
  async generateUnifiedReport(): Promise<UnifiedTestReport> {
    const unitResults = await this.loadUnitTestResults();
    const functionalResults = await this.loadFunctionalTestResults();
    const propertyResults = await this.loadPropertyTestResults();
    const coverage = await this.loadCoverageResults();

    const totalTests = unitResults.total + functionalResults.total + propertyResults.total;
    const totalPassed = unitResults.passed + functionalResults.passed + propertyResults.passed;
    const totalFailed = unitResults.failed + functionalResults.failed + propertyResults.failed;
    const totalSkipped = unitResults.skipped + functionalResults.skipped + propertyResults.skipped;
    const totalDuration =
      unitResults.duration + functionalResults.duration + propertyResults.duration;

    const report: UnifiedTestReport = {
      timestamp: new Date().toISOString(),
      environment: process.env.CI === "true" ? "ci" : "local",
      results: {
        unit: unitResults,
        functional: functionalResults,
        property: propertyResults,
      },
      summary: {
        totalTests,
        totalPassed,
        totalFailed,
        totalSkipped,
        totalDuration,
        successRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
      },
      coverage,
      status: totalFailed === 0 && coverage.passed ? "passed" : "failed",
    };

    return report;
  }

  /**
   * Save report in JSON format
   */
  async saveJsonReport(report: UnifiedTestReport): Promise<void> {
    const outputPath = path.join(this.outputDir, "unified-report.json");
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`JSON report saved to: ${outputPath}`);
  }

  /**
   * Save report in Markdown format
   */
  async saveMarkdownReport(report: UnifiedTestReport): Promise<void> {
    const markdown = this.generateMarkdownReport(report);
    const outputPath = path.join(this.outputDir, "unified-report.md");
    fs.writeFileSync(outputPath, markdown);
    console.log(`Markdown report saved to: ${outputPath}`);
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(report: UnifiedTestReport): string {
    const { summary, results, coverage, status } = report;

    const statusEmoji = status === "passed" ? "✅" : "❌";
    const coverageEmoji = coverage.passed ? "✅" : "❌";

    return `# Unified Test Report

${statusEmoji} **Status**: ${status.toUpperCase()}
**Generated**: ${new Date(report.timestamp).toLocaleString()}
**Environment**: ${report.environment}

## Summary

- **Total Tests**: ${summary.totalTests}
- **Passed**: ${summary.totalPassed} (${summary.successRate.toFixed(2)}%)
- **Failed**: ${summary.totalFailed}
- **Skipped**: ${summary.totalSkipped}
- **Duration**: ${(summary.totalDuration / 1000).toFixed(2)}s

## Test Results by Type

### Unit Tests
- **Total**: ${results.unit.total}
- **Passed**: ${results.unit.passed}
- **Failed**: ${results.unit.failed}
- **Skipped**: ${results.unit.skipped}
- **Duration**: ${(results.unit.duration / 1000).toFixed(2)}s

### Functional Tests
- **Total**: ${results.functional.total}
- **Passed**: ${results.functional.passed}
- **Failed**: ${results.functional.failed}
- **Skipped**: ${results.functional.skipped}
- **Duration**: ${(results.functional.duration / 1000).toFixed(2)}s

### Property-Based Tests
- **Total**: ${results.property.total}
- **Passed**: ${results.property.passed}
- **Failed**: ${results.property.failed}
- **Skipped**: ${results.property.skipped}
- **Duration**: ${(results.property.duration / 1000).toFixed(2)}s

## Coverage ${coverageEmoji}

| Metric | Coverage | Threshold | Status |
|--------|----------|-----------|--------|
| Statements | ${coverage.statements.toFixed(2)}% | ${coverage.threshold.statements}% | ${coverage.statements >= coverage.threshold.statements ? "✅" : "❌"} |
| Branches | ${coverage.branches.toFixed(2)}% | ${coverage.threshold.branches}% | ${coverage.branches >= coverage.threshold.branches ? "✅" : "❌"} |
| Functions | ${coverage.functions.toFixed(2)}% | ${coverage.threshold.functions}% | ${coverage.functions >= coverage.threshold.functions ? "✅" : "❌"} |
| Lines | ${coverage.lines.toFixed(2)}% | ${coverage.threshold.lines}% | ${coverage.lines >= coverage.threshold.lines ? "✅" : "❌"} |

## Failures

${this.generateFailuresSection(results)}

---
*Report generated by Unified Test Reporter*
`;
  }

  /**
   * Generate failures section
   */
  private generateFailuresSection(results: UnifiedTestReport["results"]): string {
    const allFailures = [
      ...(results.unit.failures || []),
      ...(results.functional.failures || []),
      ...(results.property.failures || []),
    ];

    if (allFailures.length === 0) {
      return "No failures detected. All tests passed! 🎉";
    }

    return allFailures
      .map(
        (failure, index) => `
### Failure ${index + 1}: ${failure.testName}

**Error**: ${failure.error}

${failure.file ? `**File**: ${failure.file}${failure.line ? `:${failure.line}` : ""}` : ""}

${failure.stack ? `\`\`\`\n${failure.stack}\n\`\`\`` : ""}
`,
      )
      .join("\n");
  }

  /**
   * Parse Vitest results
   */
  private parseVitestResults(data: any): TestResult {
    return {
      type: "unit",
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      skipped: data.numPendingTests || 0,
      total: data.numTotalTests || 0,
      duration:
        data.testResults?.reduce((sum: number, r: any) => sum + (r.perfStats?.runtime || 0), 0) ||
        0,
      failures: data.testResults
        ?.flatMap((suite: any) =>
          suite.assertionResults
            ?.filter((test: any) => test.status === "failed")
            .map((test: any) => ({
              testName: test.fullName || test.title,
              error: test.failureMessages?.[0] || "Unknown error",
              file: suite.name,
            })),
        )
        .filter(Boolean),
    };
  }

  /**
   * Parse Playwright results
   */
  private parsePlaywrightResults(data: any): TestResult {
    const suites = data.suites || [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let total = 0;
    let duration = 0;

    const failures: TestFailure[] = [];

    const processSuite = (suite: any) => {
      suite.specs?.forEach((spec: any) => {
        spec.tests?.forEach((test: any) => {
          total++;
          duration += test.results?.[0]?.duration || 0;

          if (test.results?.[0]?.status === "passed") {
            passed++;
          } else if (test.results?.[0]?.status === "failed") {
            failed++;
            failures.push({
              testName: spec.title,
              error: test.results?.[0]?.error?.message || "Unknown error",
              stack: test.results?.[0]?.error?.stack,
              file: spec.file,
            });
          } else if (test.results?.[0]?.status === "skipped") {
            skipped++;
          }
        });
      });

      suite.suites?.forEach(processSuite);
    };

    suites.forEach(processSuite);

    return {
      type: "functional",
      passed,
      failed,
      skipped,
      total,
      duration,
      failures,
    };
  }

  /**
   * Parse coverage results
   */
  private parseCoverageResults(data: any): CoverageResult {
    const total = data.total || {};

    const statements = total.statements?.pct || 0;
    const branches = total.branches?.pct || 0;
    const functions = total.functions?.pct || 0;
    const lines = total.lines?.pct || 0;

    const threshold = {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    };

    return {
      statements,
      branches,
      functions,
      lines,
      threshold,
      passed:
        statements >= threshold.statements &&
        branches >= threshold.branches &&
        functions >= threshold.functions &&
        lines >= threshold.lines,
    };
  }

  /**
   * Create empty result
   */
  private createEmptyResult(type: "unit" | "functional" | "property"): TestResult {
    return {
      type,
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      failures: [],
    };
  }

  /**
   * Create empty coverage
   */
  private createEmptyCoverage(): CoverageResult {
    return {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
      threshold: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
      passed: false,
    };
  }

  /**
   * Print report to console
   */
  printReport(report: UnifiedTestReport): void {
    console.log("\n" + "=".repeat(60));
    console.log("UNIFIED TEST REPORT");
    console.log("=".repeat(60) + "\n");

    console.log(`Status: ${report.status === "passed" ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`Environment: ${report.environment}`);
    console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}\n`);

    console.log("Summary:");
    console.log(`  Total Tests: ${report.summary.totalTests}`);
    console.log(
      `  Passed: ${report.summary.totalPassed} (${report.summary.successRate.toFixed(2)}%)`,
    );
    console.log(`  Failed: ${report.summary.totalFailed}`);
    console.log(`  Skipped: ${report.summary.totalSkipped}`);
    console.log(`  Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s\n`);

    console.log("Coverage:");
    console.log(
      `  Statements: ${report.coverage.statements.toFixed(2)}% (threshold: ${report.coverage.threshold.statements}%)`,
    );
    console.log(
      `  Branches: ${report.coverage.branches.toFixed(2)}% (threshold: ${report.coverage.threshold.branches}%)`,
    );
    console.log(
      `  Functions: ${report.coverage.functions.toFixed(2)}% (threshold: ${report.coverage.threshold.functions}%)`,
    );
    console.log(
      `  Lines: ${report.coverage.lines.toFixed(2)}% (threshold: ${report.coverage.threshold.lines}%)\n`,
    );

    console.log("=".repeat(60) + "\n");
  }
}

/**
 * Generate unified report (CLI entry point)
 */
export async function generateReport(): Promise<void> {
  const reporter = new TestReporter();
  const report = await reporter.generateUnifiedReport();

  reporter.printReport(report);
  await reporter.saveJsonReport(report);
  await reporter.saveMarkdownReport(report);

  if (report.status === "failed") {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  generateReport().catch((error) => {
    console.error("Error generating report:", error);
    process.exit(1);
  });
}
