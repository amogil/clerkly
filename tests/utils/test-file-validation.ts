// Requirements: testing-infrastructure.1.3
import fs from "fs";
import path from "path";
import { glob } from "glob";

/**
 * Interface for test file validation results
 */
export interface TestFileValidationResult {
  testFile: string;
  sourceFile: string;
  exists: boolean;
  error?: string;
}

/**
 * Interface for validation summary
 */
export interface ValidationSummary {
  totalTestFiles: number;
  validTestFiles: number;
  invalidTestFiles: number;
  results: TestFileValidationResult[];
}

/**
 * Find all .test.ts files in the project
 * Requirements: testing-infrastructure.1.3
 */
export async function findTestFiles(rootDir: string = process.cwd()): Promise<string[]> {
  try {
    // Search for .test.ts files in src/ and tests/ directories
    const patterns = ["src/**/*.test.ts", "tests/**/*.test.ts"];

    const testFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: rootDir,
        absolute: false,
        ignore: ["node_modules/**", "dist/**", "coverage/**"],
      });
      testFiles.push(...files);
    }

    return testFiles.sort();
  } catch (error) {
    throw new Error(
      `Failed to find test files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the corresponding source file path for a test file
 * Requirements: testing-infrastructure.1.3
 */
export function getCorrespondingSourceFile(testFilePath: string): string {
  // Remove .test.ts extension and add .ts extension
  const sourceFile = testFilePath.replace(/\.test\.ts$/, ".ts");
  return sourceFile;
}

/**
 * Check if a source file exists for the given test file
 * Requirements: testing-infrastructure.1.3
 */
export function validateSourceFileExists(
  testFilePath: string,
  rootDir: string = process.cwd(),
): TestFileValidationResult {
  const sourceFile = getCorrespondingSourceFile(testFilePath);
  const fullSourcePath = path.resolve(rootDir, sourceFile);

  const result: TestFileValidationResult = {
    testFile: testFilePath,
    sourceFile: sourceFile,
    exists: false,
  };

  try {
    result.exists = fs.existsSync(fullSourcePath);

    if (!result.exists) {
      result.error = `Source file does not exist: ${sourceFile}`;
    }
  } catch (error) {
    result.error = `Error checking source file: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * Validate all test files have corresponding source files
 * Requirements: testing-infrastructure.1.3
 */
export async function validateAllTestFiles(
  rootDir: string = process.cwd(),
): Promise<ValidationSummary> {
  try {
    const testFiles = await findTestFiles(rootDir);
    const results: TestFileValidationResult[] = [];

    for (const testFile of testFiles) {
      // Skip certain test files that don't need corresponding source files
      if (shouldSkipTestFile(testFile)) {
        continue;
      }

      const result = validateSourceFileExists(testFile, rootDir);
      results.push(result);
    }

    const validTestFiles = results.filter((r) => r.exists).length;
    const invalidTestFiles = results.filter((r) => !r.exists).length;

    return {
      totalTestFiles: results.length,
      validTestFiles,
      invalidTestFiles,
      results,
    };
  } catch (error) {
    throw new Error(
      `Failed to validate test files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Check if a test file should be skipped from validation
 * Some test files don't need corresponding source files (e.g., integration tests, requirement tests)
 * Requirements: testing-infrastructure.1.3
 */
function shouldSkipTestFile(testFilePath: string): boolean {
  // Skip test files in tests/requirements/ as they test requirements, not specific source files
  if (testFilePath.includes("tests/requirements/")) {
    return true;
  }

  // Skip test files in tests/functional/ as they are end-to-end tests
  if (testFilePath.includes("tests/functional/")) {
    return true;
  }

  // Skip test files in tests/examples/ as they demonstrate usage patterns
  if (testFilePath.includes("tests/examples/")) {
    return true;
  }

  // Skip test files in tests/unit/ that are integration tests or test handlers
  if (
    testFilePath.includes("tests/unit/") &&
    (testFilePath.includes("integration") ||
      testFilePath.includes("e2e") ||
      testFilePath.includes("ipc-handlers") ||
      testFilePath.includes("context-isolation"))
  ) {
    return true;
  }

  // Skip setup and utility test files
  if (testFilePath.includes("setup.test.ts") || testFilePath.includes("config.test.ts")) {
    return true;
  }

  return false;
}

/**
 * Generate a report of test file validation results
 * Requirements: testing-infrastructure.1.3
 */
export function generateValidationReport(summary: ValidationSummary): string {
  const lines: string[] = [];

  lines.push("=== Test File Validation Report ===");
  lines.push(`Total test files checked: ${summary.totalTestFiles}`);
  lines.push(`Valid test files: ${summary.validTestFiles}`);
  lines.push(`Invalid test files: ${summary.invalidTestFiles}`);
  lines.push("");

  if (summary.invalidTestFiles > 0) {
    lines.push("Invalid test files (missing source files):");
    for (const result of summary.results) {
      if (!result.exists) {
        lines.push(`  ❌ ${result.testFile} -> ${result.sourceFile}`);
        if (result.error) {
          lines.push(`     Error: ${result.error}`);
        }
      }
    }
    lines.push("");
  }

  if (summary.validTestFiles > 0) {
    lines.push("Valid test files:");
    for (const result of summary.results) {
      if (result.exists) {
        lines.push(`  ✅ ${result.testFile} -> ${result.sourceFile}`);
      }
    }
  }

  return lines.join("\n");
}
