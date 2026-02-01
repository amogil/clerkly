// Requirements: testing-infrastructure.1.3
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  findTestFiles,
  getCorrespondingSourceFile,
  validateSourceFileExists,
  validateAllTestFiles,
  generateValidationReport,
  type TestFileValidationResult,
  type ValidationSummary,
} from "./test-file-validation";

describe("Test File Validation Utilities", () => {
  const testDir = path.join(process.cwd(), "test-temp");

  beforeEach(() => {
    // Create temporary test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create src directory with test and source files
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // Create tests directory
    const testsDir = path.join(testDir, "tests");
    fs.mkdirSync(testsDir, { recursive: true });

    // Create some test files and corresponding source files
    fs.writeFileSync(path.join(srcDir, "example.ts"), "export const example = 'test';");
    fs.writeFileSync(path.join(srcDir, "example.test.ts"), "import { example } from './example';");

    fs.writeFileSync(path.join(srcDir, "utils.ts"), "export const utils = 'test';");
    fs.writeFileSync(path.join(srcDir, "utils.test.ts"), "import { utils } from './utils';");

    // Create a test file without corresponding source file
    fs.writeFileSync(path.join(srcDir, "orphan.test.ts"), "// Orphan test file");

    // Create requirement tests (should be skipped)
    const reqDir = path.join(testsDir, "requirements");
    fs.mkdirSync(reqDir, { recursive: true });
    fs.writeFileSync(path.join(reqDir, "auth.test.ts"), "// Requirement test");

    // Create functional tests (should be skipped)
    const funcDir = path.join(testsDir, "functional");
    fs.mkdirSync(funcDir, { recursive: true });
    fs.writeFileSync(path.join(funcDir, "login.spec.ts"), "// Functional test");
  });

  afterEach(() => {
    // Clean up temporary test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("findTestFiles", () => {
    /* Preconditions: temporary test directory with various .test.ts files in src/ and tests/ directories
       Action: call findTestFiles with test directory path
       Assertions: returns array of all .test.ts files found, sorted alphabetically
       Requirements: testing-infrastructure.1.3 */
    it("should find all .test.ts files in src and tests directories", async () => {
      const testFiles = await findTestFiles(testDir);

      expect(testFiles).toContain("src/example.test.ts");
      expect(testFiles).toContain("src/utils.test.ts");
      expect(testFiles).toContain("src/orphan.test.ts");
      expect(testFiles).toContain("tests/requirements/auth.test.ts");
      expect(testFiles.length).toBeGreaterThan(0);

      // Should be sorted
      const sortedFiles = [...testFiles].sort();
      expect(testFiles).toEqual(sortedFiles);
    });

    /* Preconditions: empty directory or directory without .test.ts files
       Action: call findTestFiles with empty directory path
       Assertions: returns empty array
       Requirements: testing-infrastructure.1.3 */
    it("should return empty array when no test files found", async () => {
      const emptyDir = path.join(testDir, "empty");
      fs.mkdirSync(emptyDir, { recursive: true });

      const testFiles = await findTestFiles(emptyDir);
      expect(testFiles).toEqual([]);
    });

    /* Preconditions: invalid directory path provided
       Action: call findTestFiles with non-existent directory
       Assertions: throws error with descriptive message
       Requirements: testing-infrastructure.1.3 */
    it("should handle errors gracefully", async () => {
      const invalidDir = path.join(testDir, "non-existent");

      const testFiles = await findTestFiles(invalidDir);
      // Should not throw, but return empty array for non-existent directory
      expect(testFiles).toEqual([]);
    });
  });

  describe("getCorrespondingSourceFile", () => {
    /* Preconditions: test file path with .test.ts extension
       Action: call getCorrespondingSourceFile with test file path
       Assertions: returns path with .test.ts replaced by .ts
       Requirements: testing-infrastructure.1.3 */
    it("should convert test file path to source file path", () => {
      const testFile = "src/components/Button.test.ts";
      const sourceFile = getCorrespondingSourceFile(testFile);

      expect(sourceFile).toBe("src/components/Button.ts");
    });

    /* Preconditions: test file path in nested directory structure
       Action: call getCorrespondingSourceFile with nested path
       Assertions: preserves directory structure, only changes extension
       Requirements: testing-infrastructure.1.3 */
    it("should handle nested directory paths", () => {
      const testFile = "src/auth/services/AuthService.test.ts";
      const sourceFile = getCorrespondingSourceFile(testFile);

      expect(sourceFile).toBe("src/auth/services/AuthService.ts");
    });

    /* Preconditions: file path without .test.ts extension
       Action: call getCorrespondingSourceFile with regular .ts file
       Assertions: returns original path unchanged
       Requirements: testing-infrastructure.1.3 */
    it("should handle files without .test.ts extension", () => {
      const regularFile = "src/utils/helpers.ts";
      const result = getCorrespondingSourceFile(regularFile);

      expect(result).toBe("src/utils/helpers.ts");
    });
  });

  describe("validateSourceFileExists", () => {
    /* Preconditions: test file with existing corresponding source file
       Action: call validateSourceFileExists with valid test file path
       Assertions: returns result with exists: true, no error
       Requirements: testing-infrastructure.1.3 */
    it("should validate existing source file", () => {
      const testFile = "src/example.test.ts";
      const result = validateSourceFileExists(testFile, testDir);

      expect(result.testFile).toBe(testFile);
      expect(result.sourceFile).toBe("src/example.ts");
      expect(result.exists).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: test file without corresponding source file
       Action: call validateSourceFileExists with orphan test file path
       Assertions: returns result with exists: false, descriptive error message
       Requirements: testing-infrastructure.1.3 */
    it("should detect missing source file", () => {
      const testFile = "src/orphan.test.ts";
      const result = validateSourceFileExists(testFile, testDir);

      expect(result.testFile).toBe(testFile);
      expect(result.sourceFile).toBe("src/orphan.ts");
      expect(result.exists).toBe(false);
      expect(result.error).toContain("Source file does not exist");
    });

    /* Preconditions: invalid root directory path
       Action: call validateSourceFileExists with non-existent root directory
       Assertions: returns result with exists: false, may have error message
       Requirements: testing-infrastructure.1.3 */
    it("should handle invalid root directory", () => {
      const testFile = "src/example.test.ts";
      const invalidRoot = "/non/existent/path";
      const result = validateSourceFileExists(testFile, invalidRoot);

      expect(result.exists).toBe(false);
      // When root directory doesn't exist, the source file won't exist either
      expect(result.error).toContain("Source file does not exist");
    });
  });

  describe("validateAllTestFiles", () => {
    /* Preconditions: test directory with mix of valid and invalid test files, some skippable files
       Action: call validateAllTestFiles with test directory
       Assertions: returns summary with correct counts, skips requirement and functional tests
       Requirements: testing-infrastructure.1.3 */
    it("should validate all test files and provide summary", async () => {
      const summary = await validateAllTestFiles(testDir);

      expect(summary.totalTestFiles).toBeGreaterThan(0);
      expect(summary.validTestFiles).toBeGreaterThan(0);
      expect(summary.invalidTestFiles).toBeGreaterThan(0);
      expect(summary.results).toHaveLength(summary.totalTestFiles);

      // Should have valid files (example.test.ts, utils.test.ts)
      const validResults = summary.results.filter((r) => r.exists);
      expect(validResults.length).toBeGreaterThan(0);

      // Should have invalid files (orphan.test.ts)
      const invalidResults = summary.results.filter((r) => !r.exists);
      expect(invalidResults.length).toBeGreaterThan(0);

      // Should not include skipped files (requirements/, functional/)
      const hasRequirementTests = summary.results.some((r) => r.testFile.includes("requirements/"));
      const hasFunctionalTests = summary.results.some((r) => r.testFile.includes("functional/"));
      expect(hasRequirementTests).toBe(false);
      expect(hasFunctionalTests).toBe(false);
    });

    /* Preconditions: directory with only valid test files
       Action: call validateAllTestFiles with directory containing only valid test-source pairs
       Assertions: returns summary with invalidTestFiles: 0, all files marked as valid
       Requirements: testing-infrastructure.1.3 */
    it("should handle directory with all valid test files", async () => {
      // Create a clean directory with only valid test files
      const cleanDir = path.join(testDir, "clean");
      const srcDir = path.join(cleanDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, "valid.ts"), "export const valid = true;");
      fs.writeFileSync(path.join(srcDir, "valid.test.ts"), "import { valid } from './valid';");

      const summary = await validateAllTestFiles(cleanDir);

      expect(summary.invalidTestFiles).toBe(0);
      expect(summary.validTestFiles).toBe(1);
      expect(summary.totalTestFiles).toBe(1);
    });

    /* Preconditions: empty directory or directory without test files
       Action: call validateAllTestFiles with empty directory
       Assertions: returns summary with all counts as 0, empty results array
       Requirements: testing-infrastructure.1.3 */
    it("should handle empty directory", async () => {
      const emptyDir = path.join(testDir, "empty");
      fs.mkdirSync(emptyDir, { recursive: true });

      const summary = await validateAllTestFiles(emptyDir);

      expect(summary.totalTestFiles).toBe(0);
      expect(summary.validTestFiles).toBe(0);
      expect(summary.invalidTestFiles).toBe(0);
      expect(summary.results).toEqual([]);
    });
  });

  describe("generateValidationReport", () => {
    /* Preconditions: validation summary with mix of valid and invalid test files
       Action: call generateValidationReport with summary object
       Assertions: returns formatted string report with counts and file listings
       Requirements: testing-infrastructure.1.3 */
    it("should generate comprehensive validation report", () => {
      const summary: ValidationSummary = {
        totalTestFiles: 3,
        validTestFiles: 2,
        invalidTestFiles: 1,
        results: [
          {
            testFile: "src/valid1.test.ts",
            sourceFile: "src/valid1.ts",
            exists: true,
          },
          {
            testFile: "src/valid2.test.ts",
            sourceFile: "src/valid2.ts",
            exists: true,
          },
          {
            testFile: "src/invalid.test.ts",
            sourceFile: "src/invalid.ts",
            exists: false,
            error: "Source file does not exist: src/invalid.ts",
          },
        ],
      };

      const report = generateValidationReport(summary);

      expect(report).toContain("=== Test File Validation Report ===");
      expect(report).toContain("Total test files checked: 3");
      expect(report).toContain("Valid test files: 2");
      expect(report).toContain("Invalid test files: 1");
      expect(report).toContain("❌ src/invalid.test.ts -> src/invalid.ts");
      expect(report).toContain("✅ src/valid1.test.ts -> src/valid1.ts");
      expect(report).toContain("✅ src/valid2.test.ts -> src/valid2.ts");
      expect(report).toContain("Error: Source file does not exist: src/invalid.ts");
    });

    /* Preconditions: validation summary with only valid test files
       Action: call generateValidationReport with all-valid summary
       Assertions: returns report showing no invalid files section
       Requirements: testing-infrastructure.1.3 */
    it("should handle summary with no invalid files", () => {
      const summary: ValidationSummary = {
        totalTestFiles: 2,
        validTestFiles: 2,
        invalidTestFiles: 0,
        results: [
          {
            testFile: "src/valid1.test.ts",
            sourceFile: "src/valid1.ts",
            exists: true,
          },
          {
            testFile: "src/valid2.test.ts",
            sourceFile: "src/valid2.ts",
            exists: true,
          },
        ],
      };

      const report = generateValidationReport(summary);

      expect(report).toContain("Invalid test files: 0");
      expect(report).not.toContain("Invalid test files (missing source files):");
      expect(report).toContain("Valid test files:");
    });

    /* Preconditions: empty validation summary
       Action: call generateValidationReport with empty summary
       Assertions: returns report with zero counts and no file listings
       Requirements: testing-infrastructure.1.3 */
    it("should handle empty summary", () => {
      const summary: ValidationSummary = {
        totalTestFiles: 0,
        validTestFiles: 0,
        invalidTestFiles: 0,
        results: [],
      };

      const report = generateValidationReport(summary);

      expect(report).toContain("Total test files checked: 0");
      expect(report).toContain("Valid test files: 0");
      expect(report).toContain("Invalid test files: 0");
    });
  });
});
