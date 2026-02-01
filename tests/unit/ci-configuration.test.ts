// Requirements: testing-infrastructure.1.2
import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as yaml from "yaml";
import * as fs from "fs";

describe("CI Configuration", () => {
  let workflowPath: string;
  let workflowContent: string;
  let workflow: any;

  beforeAll(() => {
    workflowPath = path.join(process.cwd(), ".github/workflows/test.yml");
    if (fs.existsSync(workflowPath)) {
      workflowContent = fs.readFileSync(workflowPath, "utf8");
      workflow = yaml.parse(workflowContent);
    }
  });

  /* Preconditions: CI workflow file exists at .github/workflows/test.yml
     Action: read and parse the CI workflow configuration
     Assertions: workflow file exists and is valid YAML
     Requirements: testing-infrastructure.1.2 */
  it("should have valid CI workflow configuration", () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(() => yaml.parse(workflowContent)).not.toThrow();
  });

  /* Preconditions: CI workflow file exists and is valid YAML
     Action: parse workflow and check for required jobs
     Assertions: all required jobs are defined (unit-tests, property-tests, functional-tests, coverage-check, lint-and-format, build-check, test-summary)
     Requirements: testing-infrastructure.1.2 */
  it("should define all required CI jobs", () => {
    const requiredJobs = [
      "unit-tests",
      "property-tests",
      "functional-tests",
      "coverage-check",
      "lint-and-format",
      "build-check",
      "test-summary",
    ];

    expect(workflow.jobs).toBeDefined();
    requiredJobs.forEach((job) => {
      expect(workflow.jobs[job]).toBeDefined();
    });
  });

  /* Preconditions: CI workflow file exists with coverage-check job
     Action: parse workflow and extract coverage threshold value
     Assertions: coverage threshold is set to 85% in the coverage-check job
     Requirements: testing-infrastructure.1.2 */
  it("should enforce 85% coverage threshold in CI", () => {
    // Check that THRESHOLD=85 is set in the coverage check step
    expect(workflowContent).toContain("THRESHOLD=85");
  });

  /* Preconditions: CI workflow file exists with unit-tests job
     Action: parse workflow and check unit-tests job configuration
     Assertions: unit-tests job runs npm run test:unit with coverage
     Requirements: testing-infrastructure.1.2 */
  it("should run unit tests with coverage in CI", () => {
    const unitTestsJob = workflow.jobs["unit-tests"];
    expect(unitTestsJob).toBeDefined();

    // Check that the job runs test:unit command
    const runSteps = unitTestsJob.steps.filter(
      (step: any) => step.run && step.run.includes("test:unit"),
    );
    expect(runSteps.length).toBeGreaterThan(0);
  });

  /* Preconditions: CI workflow file exists with functional-tests job
     Action: parse workflow and check functional-tests job matrix strategy
     Assertions: functional-tests job uses matrix strategy with chromium, firefox, and webkit browsers
     Requirements: testing-infrastructure.1.2 */
  it("should run functional tests on multiple browsers", () => {
    const functionalTestsJob = workflow.jobs["functional-tests"];
    expect(functionalTestsJob).toBeDefined();
    expect(functionalTestsJob.strategy).toBeDefined();
    expect(functionalTestsJob.strategy.matrix).toBeDefined();
    expect(functionalTestsJob.strategy.matrix.browser).toEqual(["chromium", "firefox", "webkit"]);
  });

  /* Preconditions: CI workflow file exists with coverage-check job
     Action: parse workflow and check coverage-check job steps
     Assertions: coverage-check job validates all four coverage metrics (statements, branches, functions, lines)
     Requirements: testing-infrastructure.1.2 */
  it("should validate all coverage metrics in CI", () => {
    // Check that all four metrics are validated
    expect(workflowContent).toContain("STATEMENTS=");
    expect(workflowContent).toContain("BRANCHES=");
    expect(workflowContent).toContain("FUNCTIONS=");
    expect(workflowContent).toContain("LINES=");
  });

  /* Preconditions: CI workflow file exists with test-summary job
     Action: parse workflow and check test-summary job dependencies
     Assertions: test-summary job depends on all other test jobs
     Requirements: testing-infrastructure.1.2 */
  it("should aggregate results in test-summary job", () => {
    const testSummaryJob = workflow.jobs["test-summary"];
    expect(testSummaryJob).toBeDefined();
    expect(testSummaryJob.needs).toBeDefined();

    const expectedDependencies = [
      "unit-tests",
      "property-tests",
      "functional-tests",
      "coverage-check",
      "lint-and-format",
      "build-check",
    ];

    expectedDependencies.forEach((dep) => {
      expect(testSummaryJob.needs).toContain(dep);
    });
  });

  /* Preconditions: CI workflow file exists with trigger configuration
     Action: parse workflow and check trigger events
     Assertions: workflow triggers on push to main/develop and pull requests
     Requirements: testing-infrastructure.1.2 */
  it("should trigger on push and pull request events", () => {
    expect(workflow.on).toBeDefined();
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.push.branches).toContain("main");
    expect(workflow.on.push.branches).toContain("develop");
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.pull_request.branches).toContain("main");
    expect(workflow.on.pull_request.branches).toContain("develop");
  });

  /* Preconditions: CI workflow file exists with artifact upload steps
     Action: parse workflow and check for artifact upload actions
     Assertions: workflow uploads test results and coverage artifacts
     Requirements: testing-infrastructure.1.2 */
  it("should upload test artifacts", () => {
    // Check for artifact upload actions
    expect(workflowContent).toContain("actions/upload-artifact@v4");
    expect(workflowContent).toContain("unit-test-results");
    expect(workflowContent).toContain("property-test-results");
    expect(workflowContent).toContain("functional-test-results");
  });

  /* Preconditions: vitest.config.ts exists with coverage configuration
     Action: read and validate vitest coverage thresholds
     Assertions: vitest config has 85% thresholds for all metrics
     Requirements: testing-infrastructure.1.2 */
  it("should have matching coverage thresholds in vitest config", () => {
    const vitestConfigPath = path.join(process.cwd(), "vitest.config.ts");
    expect(fs.existsSync(vitestConfigPath)).toBe(true);

    const vitestConfigContent = fs.readFileSync(vitestConfigPath, "utf8");

    // Check that all thresholds are set to 85
    expect(vitestConfigContent).toContain("branches: 85");
    expect(vitestConfigContent).toContain("functions: 85");
    expect(vitestConfigContent).toContain("lines: 85");
    expect(vitestConfigContent).toContain("statements: 85");
  });
});

describe("Coverage Check Script", () => {
  let scriptPath: string;

  beforeAll(() => {
    scriptPath = path.join(process.cwd(), "scripts/check-coverage.sh");
  });

  /* Preconditions: coverage check script exists at scripts/check-coverage.sh
     Action: check if script file exists and is executable
     Assertions: script exists and has executable permissions
     Requirements: testing-infrastructure.1.2 */
  it("should have executable coverage check script", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);

    const stats = fs.statSync(scriptPath);
    // Check if file has execute permission (owner, group, or others)
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  /* Preconditions: coverage check script exists
     Action: read script content and check for threshold validation
     Assertions: script validates all four coverage metrics against 85% threshold
     Requirements: testing-infrastructure.1.2 */
  it("should validate coverage thresholds in script", () => {
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    // Check that script validates all metrics
    expect(scriptContent).toContain("STATEMENTS=");
    expect(scriptContent).toContain("BRANCHES=");
    expect(scriptContent).toContain("FUNCTIONS=");
    expect(scriptContent).toContain("LINES=");
    expect(scriptContent).toContain("THRESHOLD=85");
  });

  /* Preconditions: package.json exists with test scripts
     Action: read package.json and check for coverage check script
     Assertions: package.json includes test:coverage:check script
     Requirements: testing-infrastructure.1.2 */
  it("should have coverage check npm script", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.scripts["test:coverage:check"]).toBeDefined();
    expect(packageJson.scripts["test:coverage:check"]).toContain("check-coverage.sh");
  });
});

describe("CI Documentation", () => {
  let docPath: string;

  beforeAll(() => {
    docPath = path.join(process.cwd(), "docs/ci-configuration.md");
  });

  /* Preconditions: CI documentation file should exist
     Action: check if docs/ci-configuration.md exists
     Assertions: documentation file exists
     Requirements: testing-infrastructure.1.2 */
  it("should have CI configuration documentation", () => {
    expect(fs.existsSync(docPath)).toBe(true);
  });

  /* Preconditions: CI documentation exists
     Action: read documentation and check for required sections
     Assertions: documentation includes coverage requirements, workflow description, and troubleshooting
     Requirements: testing-infrastructure.1.2 */
  it("should document coverage requirements and CI workflow", () => {
    const docContent = fs.readFileSync(docPath, "utf8");

    // Check for key sections
    expect(docContent).toContain("Coverage Requirements");
    expect(docContent).toContain("85%");
    expect(docContent).toContain("CI Workflow");
    expect(docContent).toContain("Coverage Check");
    expect(docContent).toContain("Troubleshooting");
  });
});
