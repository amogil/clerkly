// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.4, testing-infrastructure.5.1, testing-infrastructure.5.2
/**
 * Unified Test Runner
 *
 * This script provides a unified interface for running all types of tests:
 * - Unit tests with coverage
 * - Functional tests across browsers
 * - Property-based tests
 * - Combined test suites
 */

import { spawn } from "child_process";
import { unifiedTestConfig } from "../tests/test.config";

interface TestRunnerOptions {
  type: "unit" | "functional" | "all" | "property";
  coverage?: boolean;
  watch?: boolean;
  browser?: string;
  headed?: boolean;
  parallel?: boolean;
  workers?: number;
  verbose?: boolean;
}

/**
 * Run unit tests
 */
async function runUnitTests(options: TestRunnerOptions): Promise<number> {
  console.log("🧪 Running unit tests...\n");

  const args = ["run"];

  if (options.watch) {
    args.push("--watch");
  }

  if (options.coverage) {
    args.push("--coverage");
  }

  if (options.verbose) {
    args.push("--reporter=verbose");
  }

  return runCommand("vitest", args);
}

/**
 * Run functional tests
 */
async function runFunctionalTests(options: TestRunnerOptions): Promise<number> {
  console.log("🌐 Running functional tests...\n");

  // Build the application first
  console.log("📦 Building application...\n");
  const buildResult = await runCommand("npm", ["run", "build"]);
  if (buildResult !== 0) {
    console.error("❌ Build failed, cannot run functional tests");
    return buildResult;
  }

  const args = ["test", "--config", "tests/functional/playwright.config.ts"];

  if (options.browser) {
    args.push("--project", options.browser);
  }

  if (options.headed) {
    args.push("--headed");
  }

  if (options.parallel && options.workers) {
    args.push("--workers", options.workers.toString());
  }

  if (options.verbose) {
    args.push("--reporter=list");
  }

  return runCommand("playwright", args);
}

/**
 * Run property-based tests
 */
async function runPropertyTests(options: TestRunnerOptions): Promise<number> {
  console.log("🔍 Running property-based tests...\n");

  const args = ["run", "--", "tests/requirements/**/*-pbt.test.ts"];

  if (options.coverage) {
    args.splice(1, 0, "--coverage");
  }

  if (options.verbose) {
    args.push("--reporter=verbose");
  }

  return runCommand("vitest", args);
}

/**
 * Run all tests
 */
async function runAllTests(options: TestRunnerOptions): Promise<number> {
  console.log("🚀 Running all tests...\n");

  // Run unit tests
  console.log("\n" + "=".repeat(60));
  console.log("UNIT TESTS");
  console.log("=".repeat(60) + "\n");

  const unitResult = await runUnitTests({ ...options, type: "unit" });
  if (unitResult !== 0) {
    console.error("\n❌ Unit tests failed");
    return unitResult;
  }

  console.log("\n✅ Unit tests passed\n");

  // Run functional tests
  console.log("\n" + "=".repeat(60));
  console.log("FUNCTIONAL TESTS");
  console.log("=".repeat(60) + "\n");

  const functionalResult = await runFunctionalTests({ ...options, type: "functional" });
  if (functionalResult !== 0) {
    console.error("\n❌ Functional tests failed");
    return functionalResult;
  }

  console.log("\n✅ Functional tests passed\n");

  return 0;
}

/**
 * Run a command and return exit code
 */
function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      resolve(code || 0);
    });

    child.on("error", (error) => {
      console.error(`Error running ${command}:`, error);
      resolve(1);
    });
  });
}

/**
 * Print test configuration summary
 */
function printConfigSummary() {
  console.log("\n📋 Test Configuration Summary\n");
  console.log("Unit Tests:");
  console.log(`  Framework: ${unifiedTestConfig.unit.framework}`);
  console.log(`  Environment: ${unifiedTestConfig.unit.environment}`);
  console.log(
    `  Property Testing: ${unifiedTestConfig.unit.propertyBasedTesting.enabled ? "Enabled" : "Disabled"}`,
  );
  console.log(`  Iterations: ${unifiedTestConfig.unit.propertyBasedTesting.iterations}`);

  console.log("\nFunctional Tests:");
  console.log(`  Framework: ${unifiedTestConfig.functional.framework}`);
  console.log(`  Browsers: ${unifiedTestConfig.functional.browsers.join(", ")}`);
  console.log(`  Parallelism: ${unifiedTestConfig.functional.parallelism} workers`);
  console.log(`  Retries: ${unifiedTestConfig.functional.retries}`);

  console.log("\nCoverage:");
  console.log(`  Enabled: ${unifiedTestConfig.coverage.enabled ? "Yes" : "No"}`);
  console.log(`  Provider: ${unifiedTestConfig.coverage.provider}`);
  console.log(
    `  Thresholds: ${unifiedTestConfig.coverage.threshold.lines}% lines, ${unifiedTestConfig.coverage.threshold.branches}% branches`,
  );

  console.log("\nCI/CD:");
  console.log(`  Enabled: ${unifiedTestConfig.ci.enabled ? "Yes" : "No"}`);
  console.log(`  Max Workers: ${unifiedTestConfig.ci.maxWorkers}`);
  console.log(`  Retries: ${unifiedTestConfig.ci.retries}`);
  console.log("");
}

/**
 * Parse command line arguments
 */
function parseArgs(): TestRunnerOptions {
  const args = process.argv.slice(2);

  const options: TestRunnerOptions = {
    type: "all",
    coverage: false,
    watch: false,
    headed: false,
    parallel: true,
    workers: unifiedTestConfig.functional.parallelism,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--unit":
        options.type = "unit";
        break;
      case "--functional":
        options.type = "functional";
        break;
      case "--property":
        options.type = "property";
        break;
      case "--all":
        options.type = "all";
        break;
      case "--coverage":
        options.coverage = true;
        break;
      case "--watch":
        options.watch = true;
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--browser":
        options.browser = args[++i];
        break;
      case "--workers":
        options.workers = parseInt(args[++i], 10);
        break;
      case "--serial":
        options.parallel = false;
        options.workers = 1;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Unified Test Runner

Usage: npm run test:runner [options]

Options:
  --unit              Run only unit tests
  --functional        Run only functional tests
  --property          Run only property-based tests
  --all               Run all tests (default)
  --coverage          Collect code coverage
  --watch             Run tests in watch mode (unit tests only)
  --headed            Run functional tests in headed mode
  --browser <name>    Run functional tests in specific browser (chromium, firefox, webkit)
  --workers <n>       Number of parallel workers
  --serial            Run tests serially (1 worker)
  --verbose           Verbose output
  --help              Show this help message

Examples:
  npm run test:runner --unit --coverage
  npm run test:runner --functional --browser chromium --headed
  npm run test:runner --all --coverage
  npm run test:runner --property
  `);
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  printConfigSummary();

  let exitCode = 0;

  switch (options.type) {
    case "unit":
      exitCode = await runUnitTests(options);
      break;
    case "functional":
      exitCode = await runFunctionalTests(options);
      break;
    case "property":
      exitCode = await runPropertyTests(options);
      break;
    case "all":
      exitCode = await runAllTests(options);
      break;
  }

  if (exitCode === 0) {
    console.log("\n✅ All tests completed successfully!\n");
  } else {
    console.error("\n❌ Tests failed with exit code:", exitCode, "\n");
  }

  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { runUnitTests, runFunctionalTests, runPropertyTests, runAllTests };
