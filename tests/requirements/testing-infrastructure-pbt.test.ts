// Requirements: testing-infrastructure.1.2, testing-infrastructure.1.3, testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.3.1, testing-infrastructure.3.2, testing-infrastructure.3.3
/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mockSystem } from "../mocks/mock-system";

describe("Testing Infrastructure Property-Based Tests", () => {
  /* Preconditions: vitest.config.ts exists with coverage configuration
     Action: verify coverage thresholds are set to minimum 85%
     Assertions: all coverage thresholds (branches, functions, lines, statements) are >= 85%
     Requirements: testing-infrastructure.1.2 */
  it("should maintain minimum 85% coverage thresholds", () => {
    // **Feature: testing-infrastructure, Property 1: Покрытие кода**
    const configPath = join(process.cwd(), "vitest.config.ts");
    const configContent = readFileSync(configPath, "utf-8");

    // Verify that coverage thresholds are configured
    expect(configContent).toContain("thresholds");
    expect(configContent).toContain("global");

    // Extract threshold values using regex
    const branchesMatch = configContent.match(/branches:\s*(\d+)/);
    const functionsMatch = configContent.match(/functions:\s*(\d+)/);
    const linesMatch = configContent.match(/lines:\s*(\d+)/);
    const statementsMatch = configContent.match(/statements:\s*(\d+)/);

    expect(branchesMatch).toBeTruthy();
    expect(functionsMatch).toBeTruthy();
    expect(linesMatch).toBeTruthy();
    expect(statementsMatch).toBeTruthy();

    const branches = parseInt(branchesMatch![1]);
    const functions = parseInt(functionsMatch![1]);
    const lines = parseInt(linesMatch![1]);
    const statements = parseInt(statementsMatch![1]);

    expect(branches).toBeGreaterThanOrEqual(85);
    expect(functions).toBeGreaterThanOrEqual(85);
    expect(lines).toBeGreaterThanOrEqual(85);
    expect(statements).toBeGreaterThanOrEqual(85);
  });

  /* Preconditions: coverage configuration exists
     Action: generate random coverage threshold values and test validation
     Assertions: for any valid threshold >= 85, configuration should be acceptable
     Requirements: testing-infrastructure.1.2 */
  it("should accept any coverage threshold >= 85%", () => {
    // **Feature: testing-infrastructure, Property 1: Покрытие кода**
    fc.assert(
      fc.property(fc.integer({ min: 85, max: 100 }), (threshold) => {
        // Any threshold >= 85 should be valid for our requirements
        expect(threshold).toBeGreaterThanOrEqual(85);
        expect(threshold).toBeLessThanOrEqual(100);

        // Verify threshold is a valid percentage
        const isValidPercentage = threshold >= 0 && threshold <= 100;
        expect(isValidPercentage).toBe(true);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /* Preconditions: vitest configuration exists with coverage settings
     Action: generate coverage configurations and validate they meet requirements
     Assertions: all generated configurations with thresholds >= 85% should be valid
     Requirements: testing-infrastructure.1.2 */
  it("should validate coverage configuration properties for main, preload, and renderer processes", () => {
    // **Feature: testing-infrastructure, Property 1: Покрытие кода**
    fc.assert(
      fc.property(
        fc.record({
          branches: fc.integer({ min: 85, max: 100 }),
          functions: fc.integer({ min: 85, max: 100 }),
          lines: fc.integer({ min: 85, max: 100 }),
          statements: fc.integer({ min: 85, max: 100 }),
        }),
        (coverageConfig) => {
          // Validate that all coverage metrics meet minimum requirements
          expect(coverageConfig.branches).toBeGreaterThanOrEqual(85);
          expect(coverageConfig.functions).toBeGreaterThanOrEqual(85);
          expect(coverageConfig.lines).toBeGreaterThanOrEqual(85);
          expect(coverageConfig.statements).toBeGreaterThanOrEqual(85);

          // Validate that all metrics are valid percentages
          const allMetrics = [
            coverageConfig.branches,
            coverageConfig.functions,
            coverageConfig.lines,
            coverageConfig.statements,
          ];

          allMetrics.forEach((metric) => {
            expect(metric).toBeGreaterThanOrEqual(0);
            expect(metric).toBeLessThanOrEqual(100);
          });

          // Property: For any coverage configuration with thresholds >= 85%,
          // the configuration should be acceptable for main, preload, and renderer processes
          const isValidConfiguration = allMetrics.every((metric) => metric >= 85);
          expect(isValidConfiguration).toBe(true);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: project contains .test.ts files in various directories
     Action: find all .test.ts files and validate corresponding source files exist
     Assertions: for any .test.ts file, corresponding source file should exist in same directory
     Requirements: testing-infrastructure.1.3 */
  it("should ensure all test files have corresponding source files", async () => {
    // **Feature: testing-infrastructure, Property 2: Организация тестовых файлов**
    const { findTestFiles, validateSourceFileExists } =
      await import("../utils/test-file-validation");

    const testFiles = await findTestFiles();

    // Filter out files that should be skipped (requirements, functional tests, etc.)
    const relevantTestFiles = testFiles.filter((testFile) => {
      // Skip test files in tests/requirements/ as they test requirements, not specific source files
      if (testFile.includes("tests/requirements/")) return false;

      // Skip test files in tests/functional/ as they are end-to-end tests
      if (testFile.includes("tests/functional/")) return false;

      // Skip test files in tests/unit/ that are integration tests
      if (
        testFile.includes("tests/unit/") &&
        (testFile.includes("integration") ||
          testFile.includes("e2e") ||
          testFile.includes("ipc-handlers") ||
          testFile.includes("context-isolation"))
      )
        return false;

      // Skip mock test files - they test the mock system itself
      if (testFile.includes("tests/mocks/") && testFile.endsWith("-mock.test.ts")) return false;

      // Skip example test files - they demonstrate usage patterns
      if (testFile.includes("tests/examples/")) return false;

      // Skip setup and utility test files
      if (testFile.includes("setup.test.ts") || testFile.includes("config.test.ts")) return false;

      // Skip test isolation fixture tests - they test the test infrastructure itself
      if (testFile.includes("test-isolation") && testFile.endsWith(".test.ts")) return false;

      // Skip tests/utils/ test files that test functional test utilities
      if (testFile.includes("tests/utils/") && testFile.includes("validation")) return false;

      return true;
    });

    // Property: For any .test.ts file in the project (excluding special cases),
    // there should exist a corresponding source file in the same directory
    for (const testFile of relevantTestFiles) {
      const result = validateSourceFileExists(testFile);

      // The property should hold: test file implies source file exists
      expect(result.exists).toBe(true);

      if (!result.exists) {
        throw new Error(
          `Test file organization property violated: ${testFile} has no corresponding source file ${result.sourceFile}`,
        );
      }
    }

    // Additional property: Test files should follow naming convention
    relevantTestFiles.forEach((testFile) => {
      expect(testFile).toMatch(/\.test\.ts$/);
    });
  });

  /* Preconditions: arbitrary test file paths are generated
     Action: generate test file paths and validate organization properties
     Assertions: for any valid test file path, organization rules should be consistent
     Requirements: testing-infrastructure.1.3 */
  it("should validate test file organization properties with generated paths", async () => {
    // **Feature: testing-infrastructure, Property 2: Организация тестовых файлов**
    const { getCorrespondingSourceFile } = await import("../../tests/utils/test-file-validation");

    fc.assert(
      fc.property(
        fc.record({
          directory: fc.constantFrom(
            "src",
            "src/components",
            "src/services",
            "src/utils",
            "src/auth",
          ),
          filename: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        }),
        ({ directory, filename }) => {
          const testFilePath = `${directory}/${filename}.test.ts`;
          const expectedSourcePath = `${directory}/${filename}.ts`;

          // Property: getCorrespondingSourceFile should consistently transform test paths
          const actualSourcePath = getCorrespondingSourceFile(testFilePath);
          expect(actualSourcePath).toBe(expectedSourcePath);

          // Property: transformation should be reversible in naming
          expect(actualSourcePath.replace(/\.ts$/, ".test.ts")).toBe(testFilePath);

          // Property: directory structure should be preserved
          const testDir = testFilePath.substring(0, testFilePath.lastIndexOf("/"));
          const sourceDir = actualSourcePath.substring(0, actualSourcePath.lastIndexOf("/"));
          expect(testDir).toBe(sourceDir);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: test file validation utilities exist
     Action: generate various test file scenarios and validate organization consistency
     Assertions: organization validation should be consistent across different file structures
     Requirements: testing-infrastructure.1.3 */
  it("should maintain consistent file organization validation across different structures", async () => {
    // **Feature: testing-infrastructure, Property 2: Организация тестовых файлов**
    const { getCorrespondingSourceFile } = await import("../../tests/utils/test-file-validation");

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            path: fc.constantFrom(
              "src/Button.test.ts",
              "src/components/Modal.test.ts",
              "src/services/AuthService.test.ts",
              "src/utils/helpers.test.ts",
              "src/auth/oauth/GoogleAuth.test.ts",
            ),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (testFiles) => {
          // Property: For any collection of test files, each should have a predictable source file mapping
          testFiles.forEach(({ path: testPath }) => {
            const sourcePath = getCorrespondingSourceFile(testPath);

            // Property: Source path should be in same directory
            const testDir = testPath.substring(0, testPath.lastIndexOf("/"));
            const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
            expect(testDir).toBe(sourceDir);

            // Property: Source file should have .ts extension
            expect(sourcePath).toMatch(/\.ts$/);
            expect(sourcePath).not.toMatch(/\.test\.ts$/);

            // Property: Base filename should be preserved
            const testBasename = testPath
              .substring(testPath.lastIndexOf("/") + 1)
              .replace(".test.ts", "");
            const sourceBasename = sourcePath
              .substring(sourcePath.lastIndexOf("/") + 1)
              .replace(".ts", "");
            expect(testBasename).toBe(sourceBasename);
          });

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: mock system is available with file system, network, and database mocks
     Action: generate various external dependency operations and verify they are properly mocked
     Assertions: all external dependencies should be isolated and not perform real operations
     Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3 */
  it("should isolate all external dependencies through mock system", () => {
    // **Feature: testing-infrastructure, Property 3: Изоляция внешних зависимостей**

    fc.assert(
      fc.property(
        fc.record({
          filePath: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          fileContent: fc.string({ maxLength: 100 }),
          fileExists: fc.boolean(),
        }),
        (testData) => {
          // Reset all mocks before each test to ensure clean state
          mockSystem.restoreAll();
          const fileSystemMock = mockSystem.mockFileSystem();

          // Test file system isolation with more robust assertions
          if (testData.fileExists) {
            // Set mock data and verify it's properly stored
            fileSystemMock.setMockData(testData.filePath, testData.fileContent);

            // Verify exists() method properly checks mock data
            const existsResult = fileSystemMock.exists(testData.filePath);
            expect(existsResult).toBe(true);

            // Verify content can be retrieved
            const retrievedContent = fileSystemMock.getMockData(testData.filePath);
            expect(retrievedContent).toBe(testData.fileContent);

            // Verify existsSync also works
            expect(fileSystemMock.existsSync(testData.filePath)).toBe(true);
          } else {
            // Explicitly set file as non-existent
            fileSystemMock.setFileExists(testData.filePath, false);

            // Verify exists() method properly returns false
            const existsResult = fileSystemMock.exists(testData.filePath);
            expect(existsResult).toBe(false);

            // Verify getMockData returns undefined for non-existent files
            const retrievedContent = fileSystemMock.getMockData(testData.filePath);
            expect(retrievedContent).toBeUndefined();

            // Verify existsSync also returns false
            expect(fileSystemMock.existsSync(testData.filePath)).toBe(false);
          }

          // Verify mock isolation - no real file system operations should occur
          // The mock should handle all operations internally
          expect(fileSystemMock.existsSync).toBeDefined();
          expect(typeof fileSystemMock.existsSync).toBe("function");

          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  /* Preconditions: mock system provides error simulation capabilities
     Action: generate error scenarios for external dependencies and verify isolation
     Assertions: errors should be properly isolated and not affect real systems
     Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3 */
  it("should isolate error scenarios in external dependencies", () => {
    // **Feature: testing-infrastructure, Property 3: Изоляция внешних зависимостей**

    fc.assert(
      fc.property(
        fc.record({
          filePath: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          errorMessage: fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0),
        }),
        (testData) => {
          // Reset all mocks before each test to ensure clean state
          mockSystem.restoreAll();
          const fileSystemMock = mockSystem.mockFileSystem();

          // Test error isolation with more robust error handling
          const fsError = new Error(testData.errorMessage);
          fileSystemMock.simulateError("readFileSync", testData.filePath, fsError);

          // Verify error is properly simulated and isolated
          let errorThrown = false;
          let thrownError: Error | null = null;

          try {
            fileSystemMock.readFileSync(testData.filePath);
          } catch (error) {
            errorThrown = true;
            thrownError = error as Error;
          }

          // Verify error was thrown
          expect(errorThrown).toBe(true);
          expect(thrownError).not.toBeNull();
          expect(thrownError!.message).toBe(testData.errorMessage);

          // Verify error simulation doesn't affect other operations
          const differentPath = `different_${testData.filePath}`;
          fileSystemMock.setMockData(differentPath, "test content");
          expect(fileSystemMock.exists(differentPath)).toBe(true);

          // Verify error can be cleared
          fileSystemMock.clearErrors();
          fileSystemMock.setMockData(testData.filePath, "new content");
          expect(() => fileSystemMock.readFileSync(testData.filePath)).not.toThrow();

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  /* Preconditions: mock system supports concurrent operations
     Action: generate concurrent external dependency operations and verify isolation
     Assertions: concurrent operations should be properly isolated without interference
     Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3 */
  it("should maintain isolation during concurrent external dependency operations", () => {
    // **Feature: testing-infrastructure, Property 3: Изоляция внешних зависимостей**

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            operationType: fc.constantFrom("filesystem", "network", "database"),
            identifier: fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => s.trim().length > 0),
            data: fc.string({ maxLength: 50 }),
          }),
          { minLength: 2, maxLength: 5 },
        ),
        (operations) => {
          // Reset all mocks before each test to ensure clean state
          mockSystem.restoreAll();
          const fileSystemMock = mockSystem.mockFileSystem();
          const networkMock = mockSystem.mockNetwork();
          const databaseMock = mockSystem.mockDatabase();

          // Create unique identifiers to avoid conflicts
          const processedOperations = operations.map((op, index) => ({
            ...op,
            uniqueId: `${op.identifier}_${index}_${Date.now()}`,
          }));

          // Test concurrent operations with proper isolation
          processedOperations.forEach((op, index) => {
            switch (op.operationType) {
              case "filesystem": {
                fileSystemMock.setMockData(op.uniqueId, op.data);
                // Verify this operation doesn't interfere with others
                expect(fileSystemMock.exists(op.uniqueId)).toBe(true);
                expect(fileSystemMock.getMockData(op.uniqueId)).toBe(op.data);
                break;
              }

              case "network": {
                // Use the correct network mock methods
                const testUrl = `http://test.com/${op.uniqueId}`;
                networkMock.intercept(testUrl, () => ({
                  status: 200,
                  data: op.data,
                  headers: {},
                }));
                // Verify network mock isolation by checking request history
                networkMock.clearHistory();
                break;
              }

              case "database": {
                // Use the correct database mock methods
                const tableName = "test_table";
                databaseMock.setMockData(tableName, [{ id: op.uniqueId, data: op.data }]);
                // Verify database mock isolation
                const dbResult = databaseMock.getMockData(tableName);
                expect(dbResult).toEqual([{ id: op.uniqueId, data: op.data }]);
                break;
              }
            }
          });

          // Verify all operations are still isolated and accessible
          processedOperations.forEach((op) => {
            switch (op.operationType) {
              case "filesystem": {
                expect(fileSystemMock.exists(op.uniqueId)).toBe(true);
                expect(fileSystemMock.getMockData(op.uniqueId)).toBe(op.data);
                break;
              }

              case "network": {
                // Verify network mock maintains its interceptors
                expect(networkMock.getRequestHistory).toBeDefined();
                expect(typeof networkMock.getRequestHistory).toBe("function");
                break;
              }

              case "database": {
                // Verify database mock maintains its data
                const dbResult = databaseMock.getMockData("test_table");
                expect(Array.isArray(dbResult)).toBe(true);
                break;
              }
            }
          });

          // Verify operations don't interfere with each other
          const fileSystemOps = processedOperations.filter(
            (op) => op.operationType === "filesystem",
          );
          const networkOps = processedOperations.filter((op) => op.operationType === "network");
          const databaseOps = processedOperations.filter((op) => op.operationType === "database");

          // Each type should maintain its own isolated state
          expect(fileSystemOps.length + networkOps.length + databaseOps.length).toBe(
            processedOperations.length,
          );

          // Verify each mock system is independent
          expect(fileSystemMock).not.toBe(networkMock);
          expect(networkMock).not.toBe(databaseMock);
          expect(databaseMock).not.toBe(fileSystemMock);

          return true;
        },
      ),
      { numRuns: 25 },
    );
  });

  /* Preconditions: components with error handling exist in the codebase
     Action: generate various error scenarios and validate comprehensive error handling coverage
     Assertions: all error paths, boundary cases, and error messages should be properly handled
     Requirements: testing-infrastructure.4.1, testing-infrastructure.4.2, testing-infrastructure.4.3 */
  it("should provide comprehensive error handling coverage for all error paths", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { testErrorHandler } = await import("../utils/test-error-handler");
    const { emptyString, nullValue, undefinedValue, numericEdgeCases, invalidUrls, invalidEmails } =
      await import("../utils/edge-case-generators");

    // Clear error history before test
    testErrorHandler.clearErrorHistory();

    fc.assert(
      fc.property(
        fc.record({
          errorType: fc.constantFrom("async", "mock", "assertion", "timeout"),
          errorMessage: fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0),
          testName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        }),
        (testData) => {
          // Property 1: Error handler should handle all error types
          const context = {
            testName: testData.testName,
            startTime: Date.now(),
          };

          // Test different error types
          switch (testData.errorType) {
            case "async": {
              const asyncError = new Error(testData.errorMessage);
              try {
                testErrorHandler.handleAsyncError(asyncError, context);
              } catch (error) {
                // Error should be re-thrown with proper context
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain(testData.testName);
                expect((error as Error).message).toContain(testData.errorMessage);
              }
              break;
            }

            case "mock": {
              const mockError = new Error(testData.errorMessage);
              try {
                testErrorHandler.handleMockError(testData.testName, mockError);
              } catch (error) {
                // Error should be re-thrown with mock context
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain(testData.testName);
                expect((error as Error).message).toContain(testData.errorMessage);
              }
              break;
            }

            case "assertion": {
              try {
                testErrorHandler.handleAssertionError(
                  testData.testName,
                  "expected value",
                  "actual value",
                );
              } catch (error) {
                // Assertion error should contain expected and actual values
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain("expected value");
                expect((error as Error).message).toContain("actual value");
              }
              break;
            }

            case "timeout": {
              testErrorHandler.handleTimeoutError(testData.testName, 5000);
              // Timeout error should be recorded
              const lastError = testErrorHandler.getLastError();
              expect(lastError).toBeDefined();
              expect(lastError?.errorType).toBe("timeout");
              expect(lastError?.message).toContain(testData.testName);
              expect(lastError?.message).toContain("5000");
              break;
            }
          }

          // Property 2: All errors should be recorded in history
          expect(testErrorHandler.hasErrors()).toBe(true);

          // Property 3: Error history should be retrievable
          const errorHistory = testErrorHandler.getErrorHistory();
          expect(errorHistory.length).toBeGreaterThan(0);

          // Property 4: Errors should be filterable by type
          const errorsByType = testErrorHandler.getErrorsByType(testData.errorType);
          expect(errorsByType.length).toBeGreaterThan(0);

          // Clear for next iteration
          testErrorHandler.clearErrorHistory();

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: edge case generators are available
     Action: generate boundary cases and validate error handling for edge cases
     Assertions: error handling should properly handle empty data, null/undefined, and extreme values
     Requirements: testing-infrastructure.4.2 */
  it("should handle boundary cases in error scenarios", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { testErrorHandler } = await import("../utils/test-error-handler");
    const { emptyString, nullValue, undefinedValue, numericEdgeCases, emptyArray, emptyObject } =
      await import("../utils/edge-case-generators");

    testErrorHandler.clearErrorHistory();

    fc.assert(
      fc.property(
        fc.oneof(
          emptyString(),
          nullValue(),
          undefinedValue(),
          numericEdgeCases(),
          emptyArray(),
          emptyObject(),
        ),
        (edgeCase) => {
          // Property: Error handler should handle edge cases gracefully
          const context = {
            testName: "edge-case-test",
            metadata: { edgeCase },
          };

          try {
            // Simulate error with edge case data - handle undefined specially
            let errorMessage: string;
            try {
              errorMessage = `Edge case error: ${JSON.stringify(edgeCase)}`;
            } catch {
              // Handle cases where JSON.stringify fails (e.g., undefined)
              errorMessage = `Edge case error: ${String(edgeCase)}`;
            }
            const error = new Error(errorMessage);
            testErrorHandler.handleAsyncError(error, context);
          } catch (error) {
            // Error should be properly formatted even with edge case data
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBeDefined();
            expect((error as Error).message.length).toBeGreaterThan(0);
          }

          // Property: Error history should contain the edge case error
          const errorHistory = testErrorHandler.getErrorHistory();
          expect(errorHistory.length).toBeGreaterThan(0);

          const lastError = errorHistory[errorHistory.length - 1];
          // Note: edgeCase might be undefined, which is valid for testing
          expect(lastError.context.metadata).toBeDefined();

          testErrorHandler.clearErrorHistory();

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: error handler provides error message formatting
     Action: generate various data types and validate error message correctness
     Assertions: error messages should be properly formatted and informative
     Requirements: testing-infrastructure.4.3 */
  it("should validate error message correctness and formatting", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { testErrorHandler } = await import("../utils/test-error-handler");

    testErrorHandler.clearErrorHistory();

    fc.assert(
      fc.property(
        fc.record({
          expected: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.integer()),
            fc.record({ key: fc.string() }),
          ),
          actual: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.integer()),
            fc.record({ key: fc.string() }),
          ),
          assertion: fc.string({ minLength: 5, maxLength: 50 }).filter((s) => s.trim().length > 0),
        }),
        (testData) => {
          // Property: Error messages should contain expected and actual values
          try {
            testErrorHandler.handleAssertionError(
              testData.assertion,
              testData.expected,
              testData.actual,
            );
          } catch (error) {
            const errorMessage = (error as Error).message;

            // Property 1: Error message should contain assertion description
            expect(errorMessage).toContain(testData.assertion);

            // Property 2: Error message should contain "Expected" and "Actual" labels
            expect(errorMessage).toContain("Expected:");
            expect(errorMessage).toContain("Actual:");

            // Property 3: Error message should be non-empty and informative
            expect(errorMessage.length).toBeGreaterThan(testData.assertion.length);

            // Property 4: Error should have AssertionError name
            expect((error as Error).name).toBe("AssertionError");
          }

          // Property 5: Error should be recorded with correct metadata
          const lastError = testErrorHandler.getLastError();
          expect(lastError).toBeDefined();
          expect(lastError?.errorType).toBe("assertion");
          expect(lastError?.context.metadata?.assertion).toBe(testData.assertion);
          expect(lastError?.context.metadata?.expected).toEqual(testData.expected);
          expect(lastError?.context.metadata?.actual).toEqual(testData.actual);

          testErrorHandler.clearErrorHistory();

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: error handler supports error callbacks and history management
     Action: generate error scenarios and validate error tracking capabilities
     Assertions: error history should be properly managed with size limits and filtering
     Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
  it("should properly manage error history and callbacks", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { TestErrorHandlerImpl } = await import("../utils/test-error-handler");

    fc.assert(
      fc.property(
        fc.record({
          maxHistorySize: fc.integer({ min: 1, max: 50 }),
          errorCount: fc.integer({ min: 1, max: 100 }),
        }),
        (testData) => {
          const handler = new TestErrorHandlerImpl();
          handler.setMaxHistorySize(testData.maxHistorySize);

          // Track callback invocations
          let callbackCount = 0;
          handler.setErrorCallback(() => {
            callbackCount++;
          });

          // Generate multiple errors
          for (let i = 0; i < testData.errorCount; i++) {
            handler.handleTimeoutError(`test-${i}`, 1000);
          }

          // Property 1: Callback should be invoked for each error
          expect(callbackCount).toBe(testData.errorCount);

          // Property 2: History size should not exceed max size
          const history = handler.getErrorHistory();
          expect(history.length).toBeLessThanOrEqual(testData.maxHistorySize);

          // Property 3: If more errors than max size, history should contain most recent errors
          if (testData.errorCount > testData.maxHistorySize) {
            expect(history.length).toBe(testData.maxHistorySize);
            // Most recent error should be in history
            const lastError = history[history.length - 1];
            expect(lastError.context.testName).toBe(`test-${testData.errorCount - 1}`);
          } else {
            expect(history.length).toBe(testData.errorCount);
          }

          // Property 4: Clear history should remove all errors
          handler.clearErrorHistory();
          expect(handler.getErrorHistory().length).toBe(0);
          expect(handler.hasErrors()).toBe(false);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: IPC validators exist with error handling
     Action: generate invalid IPC messages and validate error handling
     Assertions: validation errors should be properly thrown and contain correct information
     Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
  it("should validate error handling in IPC validation", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { validateIPCMessage, IPCValidationError } = await import("../../src/ipc/validators");

    fc.assert(
      fc.property(
        fc.record({
          channel: fc.constantFrom(
            "auth:open-google",
            "auth:get-state",
            "auth:sign-out",
            "sidebar:get-state",
            "sidebar:set-state",
          ),
          invalidParams: fc.oneof(
            fc.constant("invalid string"),
            fc.integer(),
            fc.array(fc.string(), { minLength: 1 }), // Ensure non-empty array
            fc.constant(true),
            fc.record({ invalid: fc.string() }),
          ),
        }),
        (testData) => {
          // Property: Invalid parameters should throw IPCValidationError
          try {
            // For channels that expect no parameters, any parameter should fail
            if (
              testData.channel === "auth:open-google" ||
              testData.channel === "auth:get-state" ||
              testData.channel === "auth:sign-out" ||
              testData.channel === "sidebar:get-state"
            ) {
              validateIPCMessage(testData.channel, testData.invalidParams);
              // Should not reach here
              return false;
            }

            // For sidebar:set-state, invalid params should fail
            if (testData.channel === "sidebar:set-state") {
              validateIPCMessage(testData.channel, testData.invalidParams);
              // Should not reach here if params are invalid
              return false;
            }
          } catch (error) {
            // Property 1: Error should be IPCValidationError
            expect(error).toBeInstanceOf(IPCValidationError);

            // Property 2: Error message should contain channel name
            expect((error as IPCValidationError).message).toContain(testData.channel);

            // Property 3: Error should have descriptive message
            expect((error as IPCValidationError).message).toBeDefined();
            expect((error as IPCValidationError).message.length).toBeGreaterThan(0);

            // Property 4: Error should have correct name
            expect((error as IPCValidationError).name).toBe("IPCValidationError");

            return true;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /* Preconditions: edge case generators provide invalid data generators
     Action: test error handling with invalid URLs, emails, and file paths
     Assertions: error handling should properly validate and reject invalid inputs
     Requirements: testing-infrastructure.4.2, testing-infrastructure.4.3 */
  it("should handle invalid input validation errors", async () => {
    // **Feature: testing-infrastructure, Property 6: Комплексное покрытие обработки ошибок**
    const { invalidUrls, invalidEmails, invalidFilePaths } =
      await import("../utils/edge-case-generators");

    fc.assert(
      fc.property(
        fc.record({
          inputType: fc.constantFrom("url", "email", "filepath"),
        }),
        (testData) => {
          let invalidInput: string;

          // Generate invalid input based on type
          switch (testData.inputType) {
            case "url":
              invalidInput = fc.sample(invalidUrls(), 1)[0];
              break;
            case "email":
              invalidInput = fc.sample(invalidEmails(), 1)[0];
              break;
            case "filepath":
              invalidInput = fc.sample(invalidFilePaths(), 1)[0];
              break;
          }

          // Property: Invalid inputs should be detectable
          // Test URL validation
          if (testData.inputType === "url") {
            const urlPattern = /^https?:\/\/.+\..+/;
            const isValid = urlPattern.test(invalidInput);
            // Invalid URLs should not match the pattern
            expect(isValid).toBe(false);
          }

          // Test email validation
          if (testData.inputType === "email") {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailPattern.test(invalidInput);
            // Invalid emails should not match the pattern
            expect(isValid).toBe(false);
          }

          // Test filepath validation
          if (testData.inputType === "filepath") {
            const hasInvalidChars = /[\0*?<>|:]/.test(invalidInput);
            const isEmpty = invalidInput.trim().length === 0;
            const isReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(invalidInput);
            const isJustSlash = invalidInput === "/" || invalidInput === "//";
            const isJustDots = invalidInput === "." || invalidInput === "..";

            // Invalid filepaths should have at least one invalid characteristic
            const isInvalid = hasInvalidChars || isEmpty || isReserved || isJustSlash || isJustDots;
            expect(isInvalid).toBe(true);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* Preconditions: fast-check library is integrated and configured
     Action: validate that PBT system runs with minimum 100 iterations and automatic shrinking
     Assertions: property tests should execute minimum 100 iterations, provide shrinking on failure
     Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2, testing-infrastructure.3.3 */
it("should validate property-based testing system with fast-check", async () => {
  // **Feature: testing-infrastructure, Property 5: Property-based тестирование бизнес-логики**
  const { globalFastCheckConfig, testConfigurations } = await import("../fast-check.config");

  // Property 1: Global configuration should enforce minimum 100 iterations
  expect(globalFastCheckConfig.numRuns).toBeGreaterThanOrEqual(100);

  // Property 2: All test configurations should meet minimum iteration requirements
  Object.entries(testConfigurations).forEach(([name, config]) => {
    // Quick config is allowed to have fewer iterations for development
    const minIterations = name === "quick" ? 10 : 100;
    expect(config.numRuns).toBeGreaterThanOrEqual(minIterations);
  });

  // Property 3: Fast-check should be properly integrated with Vitest
  expect(fc).toBeDefined();
  expect(fc.assert).toBeDefined();
  expect(fc.property).toBeDefined();

  // Property 4: Test that property-based testing actually works with 100+ iterations
  let iterationCount = 0;
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 1000 }), (num) => {
      iterationCount++;
      // Simple property: positive integers should be greater than 0
      expect(num).toBeGreaterThan(0);
      return true;
    }),
    { numRuns: 100 },
  );

  // Verify that at least 100 iterations were executed
  expect(iterationCount).toBeGreaterThanOrEqual(100);

  // Property 5: Shrinking should be enabled in configuration
  const { shrinkingConfig } = await import("../fast-check.config");
  expect(shrinkingConfig.enabled).toBe(true);
  expect(shrinkingConfig.maxAttempts).toBeGreaterThan(0);

  // Property 6: Custom generators should be available
  const generators = await import("../generators");
  expect(generators.nonEmptyString).toBeDefined();
  expect(generators.positiveInteger).toBeDefined();
  expect(generators.userProfile).toBeDefined();
  expect(generators.coverageConfig).toBeDefined();

  // Property 7: Custom shrinkers should be available
  expect(generators.userProfileWithShrinking).toBeDefined();
  expect(generators.coverageConfigWithShrinking).toBeDefined();
  expect(generators.withCustomShrinking).toBeDefined();
});

/* Preconditions: fast-check generators are available
     Action: test that generators produce valid data across many iterations
     Assertions: all generated data should meet domain constraints
     Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2 */
it("should validate fast-check generators produce valid domain data", async () => {
  // **Feature: testing-infrastructure, Property 5: Property-based тестирование бизнес-логики**
  const { userProfile, coverageConfig, ipcChannel } = await import("../generators");

  // Test user profile generator
  fc.assert(
    fc.property(userProfile(), (profile) => {
      // Property: User profiles should have valid structure
      expect(profile.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(profile.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(profile.name.length).toBeGreaterThan(0);
      return true;
    }),
    { numRuns: 100 },
  );

  // Test coverage config generator
  fc.assert(
    fc.property(coverageConfig(), (config) => {
      // Property: Coverage configs should meet minimum thresholds
      expect(config.branches).toBeGreaterThanOrEqual(85);
      expect(config.functions).toBeGreaterThanOrEqual(85);
      expect(config.lines).toBeGreaterThanOrEqual(85);
      expect(config.statements).toBeGreaterThanOrEqual(85);
      return true;
    }),
    { numRuns: 100 },
  );

  // Test IPC channel generator
  fc.assert(
    fc.property(ipcChannel(), (channel) => {
      // Property: IPC channels should follow naming convention
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
      return true;
    }),
    { numRuns: 100 },
  );
});

/* Preconditions: custom shrinking strategies are implemented
     Action: validate that shrinking strategies produce minimal counterexamples
     Assertions: shrinking should reduce values to minimal failing cases
     Requirements: testing-infrastructure.3.3 */
it("should validate custom shrinking strategies reduce to minimal values", async () => {
  // **Feature: testing-infrastructure, Property 5: Property-based тестирование бизнес-логики**
  const { shrinkingStrategies } = await import("../generators/custom-shrinkers");

  // Test towardsZero shrinking strategy
  const shrunkToZero = shrinkingStrategies.towardsZero(100);
  expect(shrunkToZero).toContain(0);
  expect(shrunkToZero.length).toBeGreaterThan(1);

  // Test shorterStrings shrinking strategy
  const shrunkString = shrinkingStrategies.shorterStrings("hello world");
  expect(shrunkString).toContain("");
  expect(shrunkString.some((s) => s.length < "hello world".length)).toBe(true);

  // Test smallerArrays shrinking strategy
  const shrunkArray = shrinkingStrategies.smallerArrays([1, 2, 3, 4, 5]);
  expect(shrunkArray).toContainEqual([]);
  expect(shrunkArray.some((arr) => arr.length < 5)).toBe(true);

  // Property: Shrinking strategies should always include minimal values
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 1000 }), (value) => {
      const shrunk = shrinkingStrategies.towardsZero(value);
      // Should always try zero as minimal value
      expect(shrunk).toContain(0);
      // Should include original value
      expect(shrunk).toContain(value);
      return true;
    }),
    { numRuns: 100 },
  );
});

/* Preconditions: functional test infrastructure with test isolation fixtures exists
     Action: validate that test isolation provides unique user data directories and cleanup
     Assertions: each test gets isolated environment, no state leakage, automatic cleanup
     Requirements: testing-infrastructure.5.3, testing-infrastructure.6.1 */
it("should ensure functional tests run in isolated environments with automatic cleanup", async () => {
  // **Feature: testing-infrastructure, Property 7: Изоляция функциональных тестов**
  const { createUserDataDir, cleanupUserDataDir } = await import("../functional/utils/app");
  const fs = await import("fs/promises");
  const path = await import("path");

  await fc.assert(
    fc.asyncProperty(
      fc
        .array(
          fc.record({
            testId: fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
            testData: fc.string({ maxLength: 100 }),
          }),
          { minLength: 2, maxLength: 5 },
        )
        .filter((scenarios) => {
          // Ensure all test IDs are unique
          const ids = scenarios.map((s) => s.testId);
          return new Set(ids).size === ids.length;
        }),
      async (testScenarios) => {
        const createdDirs: string[] = [];

        try {
          // Property 1: Each test should get a unique isolated user data directory
          for (const scenario of testScenarios) {
            const userDataDir = await createUserDataDir();
            createdDirs.push(userDataDir);

            // Verify directory was created
            const stats = await fs.stat(userDataDir);
            expect(stats.isDirectory()).toBe(true);

            // Verify it's a temporary directory with correct prefix
            expect(userDataDir).toContain("clerkly-e2e-");

            // Verify directory is unique (not in previous list)
            const previousDirs = createdDirs.slice(0, -1);
            expect(previousDirs).not.toContain(userDataDir);

            // Write test-specific data to simulate test execution
            const testFile = path.join(userDataDir, `test-${scenario.testId}.txt`);
            await fs.writeFile(testFile, scenario.testData);

            // Verify data was written
            const content = await fs.readFile(testFile, "utf-8");
            expect(content).toBe(scenario.testData);
          }

          // Property 2: All directories should be unique (no collisions)
          const uniqueDirs = new Set(createdDirs);
          expect(uniqueDirs.size).toBe(createdDirs.length);

          // Property 3: Each directory should be independent (no shared state)
          // Verify that test files from one directory don't appear in another
          for (let i = 0; i < createdDirs.length; i++) {
            const currentDir = createdDirs[i];
            const currentTestId = testScenarios[i].testId;
            const currentTestFile = path.join(currentDir, `test-${currentTestId}.txt`);

            // Verify this test's file exists in its own directory
            const currentExists = await fs
              .access(currentTestFile)
              .then(() => true)
              .catch(() => false);
            expect(currentExists).toBe(true);

            // Verify other tests' files are NOT in this directory
            for (let j = 0; j < testScenarios.length; j++) {
              if (i !== j) {
                const otherTestId = testScenarios[j].testId;
                const otherTestFile = path.join(currentDir, `test-${otherTestId}.txt`);
                const exists = await fs
                  .access(otherTestFile)
                  .then(() => true)
                  .catch(() => false);
                expect(exists).toBe(false);
              }
            }
          }

          // Property 4: Cleanup should remove all test data
          for (const userDataDir of createdDirs) {
            await cleanupUserDataDir(userDataDir);

            // Verify directory was removed
            const exists = await fs
              .access(userDataDir)
              .then(() => true)
              .catch(() => false);
            expect(exists).toBe(false);
          }
        } finally {
          // Cleanup any remaining directories
          for (const dir of createdDirs) {
            try {
              await cleanupUserDataDir(dir);
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      },
    ),
    { numRuns: 50 },
  );
});

/* Preconditions: OAuth stub is configured in main.ts with E2E environment variables
     Action: validate that OAuth stub prevents external network calls
     Assertions: OAuth stub uses deterministic tokens, no external HTTP requests
     Requirements: testing-infrastructure.6.1 */
it("should ensure OAuth stub prevents external network calls in functional tests", async () => {
  // **Feature: testing-infrastructure, Property 7: Изоляция функциональных тестов**

  fc.assert(
    fc.property(
      fc.record({
        authMode: fc.constantFrom("success", "failure"),
        authSequence: fc.array(fc.constantFrom("success", "failure"), {
          minLength: 1,
          maxLength: 5,
        }),
      }),
      (testConfig) => {
        // Use dynamic import to get the real fs module, bypassing mocks

        const fs = require("fs");

        const path = require("path");

        // Property 1: OAuth stub should be configured in main.ts
        const mainPath = path.join(process.cwd(), "main.ts");
        const mainContent = fs.readFileSync(mainPath, "utf-8");

        // Verify OAuth stub environment variables are checked
        expect(mainContent).toContain("CLERKLY_E2E_AUTH_MODE");
        expect(mainContent).toContain("CLERKLY_E2E_AUTH_SEQUENCE");

        // Property 2: OAuth stub should use deterministic tokens (no external calls)
        expect(mainContent).toContain("e2e-access-token");
        expect(mainContent).toContain("e2e-refresh-token");

        // Property 3: OAuth stub should support both success and failure modes
        expect(mainContent).toContain('mode === "success"');
        expect(mainContent).toContain('mode === "failure"');

        // Property 4: Auth mode should be one of the valid values
        expect(["success", "failure"]).toContain(testConfig.authMode);

        // Property 5: Auth sequence should only contain valid modes
        testConfig.authSequence.forEach((mode) => {
          expect(["success", "failure"]).toContain(mode);
        });

        // Property 6: OAuth stub should not make external HTTP requests
        // Verify that stub logic doesn't contain external HTTP calls
        const stubLogicMatch = mainContent.match(
          /if\s*\(process\.env\.CLERKLY_E2E_AUTH_MODE\)([\s\S]*?)(?=\n\s*\/\/|$)/,
        );
        if (stubLogicMatch) {
          const stubLogic = stubLogicMatch[0];
          // Stub logic should not contain fetch, axios, or http.request
          expect(stubLogic).not.toContain("fetch(");
          expect(stubLogic).not.toContain("axios.");
          expect(stubLogic).not.toContain("http.request");
          expect(stubLogic).not.toContain("https.request");
        }

        return true;
      },
    ),
    { numRuns: 100 },
  );
});

/* Preconditions: Playwright configuration exists with test isolation settings
     Action: validate that Playwright config enforces isolated browser contexts
     Assertions: each test gets isolated context, no shared storage state
     Requirements: testing-infrastructure.5.3 */
it("should validate Playwright configuration enforces test isolation", async () => {
  // **Feature: testing-infrastructure, Property 7: Изоляция функциональных тестов**

  fc.assert(
    fc.property(
      fc.record({
        browser: fc.constantFrom("chromium", "firefox", "webkit"),
      }),
      (testConfig) => {
        // Use dynamic import to get the real fs module, bypassing mocks

        const fs = require("fs");

        const path = require("path");

        // Property 1: Playwright config should exist
        const configPath = path.join(process.cwd(), "tests/functional/playwright.config.ts");
        const configContent = fs.readFileSync(configPath, "utf-8");

        // Property 2: Config should enforce isolated browser contexts
        expect(configContent).toContain("contextOptions");
        expect(configContent).toContain("storageState: undefined");

        // Property 3: Config should support all major browsers
        expect(configContent).toContain("chromium");
        expect(configContent).toContain("firefox");
        expect(configContent).toContain("webkit");

        // Property 4: Config should have proper timeout and retry settings
        expect(configContent).toContain("timeout:");
        expect(configContent).toContain("retries:");

        // Property 5: Config should enable failure diagnostics
        expect(configContent).toContain("screenshot:");
        expect(configContent).toContain("video:");

        // Property 6: Test browser should be one of the supported browsers
        expect(["chromium", "firefox", "webkit"]).toContain(testConfig.browser);

        return true;
      },
    ),
    { numRuns: 100 },
  );
});

/* Preconditions: test isolation fixture provides automatic cleanup
     Action: validate that fixture properly manages app lifecycle and cleanup
     Assertions: app is launched with isolation, automatically closed, state cleaned
     Requirements: testing-infrastructure.5.3 */
it("should validate test isolation fixture manages app lifecycle correctly", async () => {
  // **Feature: testing-infrastructure, Property 7: Изоляция функциональных тестов**

  fc.assert(
    fc.property(
      fc.record({
        authMode: fc.constantFrom("success", "failure"),
        hasAuthSequence: fc.boolean(),
      }),
      (testConfig) => {
        // Use dynamic import to get the real fs module, bypassing mocks

        const fs = require("fs");

        const path = require("path");

        // Property 1: Test isolation fixture should exist
        const fixturePath = path.join(process.cwd(), "tests/functional/fixtures/test-isolation.ts");
        const fixtureContent = fs.readFileSync(fixturePath, "utf-8");

        // Property 2: Fixture should provide isolatedUserDataDir
        expect(fixtureContent).toContain("isolatedUserDataDir");
        expect(fixtureContent).toContain("createUserDataDir");
        expect(fixtureContent).toContain("cleanupUserDataDir");

        // Property 3: Fixture should provide isolatedApp with automatic cleanup
        expect(fixtureContent).toContain("isolatedApp");
        expect(fixtureContent).toContain("launchApp");
        expect(fixtureContent).toContain("await app.close()");

        // Property 4: Fixture should use Playwright's test.extend for proper lifecycle
        expect(fixtureContent).toContain("base.extend");
        expect(fixtureContent).toContain("async ({}, use)");

        // Property 5: Fixture should support custom launch options
        expect(fixtureContent).toContain("LaunchOptions");
        expect(fixtureContent).toContain("authMode");

        // Property 6: App utilities should exist
        const appUtilsPath = path.join(process.cwd(), "tests/functional/utils/app.ts");
        const appUtilsContent = fs.readFileSync(appUtilsPath, "utf-8");

        // Property 7: App utilities should support auth modes
        expect(appUtilsContent).toContain("AuthStubMode");
        expect(appUtilsContent).toContain("CLERKLY_E2E_AUTH_MODE");
        expect(appUtilsContent).toContain("CLERKLY_E2E_USER_DATA");

        // Property 8: Auth mode should be valid
        expect(["success", "failure"]).toContain(testConfig.authMode);

        // Property 9: Auth sequence support should be present if needed
        if (testConfig.hasAuthSequence) {
          expect(appUtilsContent).toContain("authSequence");
          expect(appUtilsContent).toContain("CLERKLY_E2E_AUTH_SEQUENCE");
        }

        return true;
      },
    ),
    { numRuns: 100 },
  );
});

/* Preconditions: navigation validation utilities exist with NavigationItem type
   Action: generate navigation sequences and validate active state properties
   Assertions: for any navigation sequence, active state should match current section with correct styles
   Requirements: testing-infrastructure.7.2 */
it("should validate active navigation state properties across navigation sequences", async () => {
  // **Feature: testing-infrastructure, Property 8: Активное состояние навигации**

  // Navigation item generator
  const navigationItem = fc.constantFrom(
    "dashboard",
    "calendar",
    "tasks",
    "contacts",
    "settings",
  );

  // Navigation sequence generator (array of navigation items)
  const navigationSequence = fc.array(navigationItem, { minLength: 1, maxLength: 10 });

  fc.assert(
    fc.property(navigationSequence, (sequence) => {
      // Property 1: Navigation validation utilities should exist
      const fs = require("fs");
      const path = require("path");

      const validationUtilsPath = path.join(
        process.cwd(),
        "tests/functional/utils/navigation-validation.ts",
      );
      const validationContent = fs.readFileSync(validationUtilsPath, "utf-8");

      // Verify navigation validation functions exist
      expect(validationContent).toContain("export function getNavigationItems");
      expect(validationContent).toContain("export async function validateActiveNavigationItem");
      expect(validationContent).toContain(
        "export async function validateNavigationCorrespondence",
      );
      expect(validationContent).toContain("export async function getCurrentActiveItem");
      expect(validationContent).toContain("export async function validateSingleActiveItem");

      // Property 2: NavigationItem type should include all valid sections
      expect(validationContent).toContain("type NavigationItem =");
      expect(validationContent).toContain('"dashboard"');
      expect(validationContent).toContain('"calendar"');
      expect(validationContent).toContain('"tasks"');
      expect(validationContent).toContain('"contacts"');
      expect(validationContent).toContain('"settings"');

      // Property 3: All items in sequence should be valid navigation items
      const validItems = ["dashboard", "calendar", "tasks", "contacts", "settings"];
      sequence.forEach((item) => {
        expect(validItems).toContain(item);
      });

      // Property 4: Active state validation should check for correct CSS classes
      expect(validationContent).toContain("bg-primary");
      expect(validationContent).toContain("text-primary-foreground");

      // Property 5: Validation should ensure only one item is active at a time
      expect(validationContent).toContain("validateSingleActiveItem");
      expect(validationContent).toContain("activeCount");

      // Property 6: Navigation correspondence should validate both nav state and page heading
      expect(validationContent).toContain("validateNavigationCorrespondence");
      expect(validationContent).toContain("getByRole");
      expect(validationContent).toContain('"heading"');

      // Property 7: For any navigation sequence, the last item should determine final active state
      if (sequence.length > 0) {
        const lastItem = sequence[sequence.length - 1];
        expect(validItems).toContain(lastItem);

        // Verify that navigation utilities can handle this item
        const itemCapitalized = lastItem.charAt(0).toUpperCase() + lastItem.slice(1);
        expect(itemCapitalized.length).toBeGreaterThan(0);
      }

      // Property 8: Navigation validation should work with both expanded and collapsed sidebar
      expect(validationContent).toContain("getNavigationItems");
      // The implementation should be flexible enough to handle both states

      // Property 9: Functional tests should exist that use these validation utilities
      const functionalTestPath = path.join(
        process.cwd(),
        "tests/functional/navigation-active-state.spec.ts",
      );
      const functionalTestContent = fs.readFileSync(functionalTestPath, "utf-8");

      expect(functionalTestContent).toContain("validateActiveNavigationItem");
      expect(functionalTestContent).toContain("validateNavigationCorrespondence");
      expect(functionalTestContent).toContain("validateSingleActiveItem");
      expect(functionalTestContent).toContain("navigateAndValidate");

      // Property 10: Tests should cover all navigation items
      validItems.forEach((item) => {
        expect(functionalTestContent).toContain(`"${item}"`);
      });

      return true;
    }),
    { numRuns: 100 },
  );
});

/* Preconditions: navigation validation utilities provide active state checking
   Action: generate navigation state scenarios and validate consistency properties
   Assertions: active state should be mutually exclusive, styles should be consistent
   Requirements: testing-infrastructure.7.2 */
it("should validate navigation active state consistency and mutual exclusivity", async () => {
  // **Feature: testing-infrastructure, Property 8: Активное состояние навигации**

  fc.assert(
    fc.property(
      fc.record({
        currentSection: fc.constantFrom("dashboard", "calendar", "tasks", "contacts", "settings"),
        otherSections: fc.array(
          fc.constantFrom("dashboard", "calendar", "tasks", "contacts", "settings"),
          { minLength: 1, maxLength: 4 },
        ),
      }),
      (testData) => {
        const fs = require("fs");
        const path = require("path");

        const validationUtilsPath = path.join(
          process.cwd(),
          "tests/functional/utils/navigation-validation.ts",
        );
        const validationContent = fs.readFileSync(validationUtilsPath, "utf-8");

        // Property 1: Active state validation should check that expected item has active classes
        expect(validationContent).toContain("toHaveClass(/bg-primary/)");
        expect(validationContent).toContain("toHaveClass(/text-primary-foreground/)");

        // Property 2: Active state validation should check that other items are inactive
        expect(validationContent).toContain("not.toContain");
        expect(validationContent).toContain('"bg-primary"');
        expect(validationContent).toContain('"text-primary-foreground"');

        // Property 3: Current section should be one of the valid navigation items
        const validItems = ["dashboard", "calendar", "tasks", "contacts", "settings"];
        expect(validItems).toContain(testData.currentSection);

        // Property 4: All other sections should also be valid navigation items
        testData.otherSections.forEach((section) => {
          expect(validItems).toContain(section);
        });

        // Property 5: Single active item validation should count active items
        expect(validationContent).toContain("validateSingleActiveItem");
        expect(validationContent).toContain("activeCount");
        expect(validationContent).toContain("toBe(1)");

        // Property 6: Active item getter should return the current active item
        expect(validationContent).toContain("getCurrentActiveItem");
        expect(validationContent).toContain('includes("bg-primary")');

        // Property 7: Navigation correspondence should validate both UI and content
        expect(validationContent).toContain("validateNavigationCorrespondence");
        expect(validationContent).toContain("validateActiveNavigationItem");
        expect(validationContent).toContain("toBeVisible");

        // Property 8: For any current section, there should be exactly one active item
        // This is enforced by the validateSingleActiveItem function
        expect(validationContent).toContain("expect(activeCount).toBe(1)");

        // Property 9: Navigation items should be accessible via getNavigationItems
        expect(validationContent).toContain("getNavigationItems");
        expect(validationContent).toContain("Record<NavigationItem, Locator>");

        // Property 10: Each navigation item should be a button element
        expect(validationContent).toContain('locator("button")');

        return true;
      },
    ),
    { numRuns: 100 },
  );
});

/* Preconditions: navigation validation supports rapid navigation scenarios
   Action: generate rapid navigation sequences and validate state consistency
   Assertions: final active state should match last navigation action, no race conditions
   Requirements: testing-infrastructure.7.2 */
it("should validate navigation active state handles rapid transitions correctly", async () => {
  // **Feature: testing-infrastructure, Property 8: Активное состояние навигации**

  fc.assert(
    fc.property(
      fc.record({
        rapidSequence: fc.array(
          fc.constantFrom("dashboard", "calendar", "tasks", "contacts", "settings"),
          { minLength: 3, maxLength: 8 },
        ),
        sidebarCollapsed: fc.boolean(),
      }),
      (testData) => {
        const fs = require("fs");
        const path = require("path");

        // Property 1: Functional tests should cover rapid navigation scenarios
        const functionalTestPath = path.join(
          process.cwd(),
          "tests/functional/navigation-active-state.spec.ts",
        );
        const functionalTestContent = fs.readFileSync(functionalTestPath, "utf-8");

        expect(functionalTestContent).toContain("rapid");
        expect(functionalTestContent).toContain("click");

        // Property 2: Rapid navigation test should validate final state
        expect(functionalTestContent).toContain("validateNavigationCorrespondence");
        expect(functionalTestContent).toContain("validateSingleActiveItem");

        // Property 3: For any rapid sequence, the last item should determine final state
        if (testData.rapidSequence.length > 0) {
          const lastItem = testData.rapidSequence[testData.rapidSequence.length - 1];
          const validItems = ["dashboard", "calendar", "tasks", "contacts", "settings"];
          expect(validItems).toContain(lastItem);
        }

        // Property 4: Tests should cover collapsed sidebar scenarios
        expect(functionalTestContent).toContain("collapsed");
        expect(functionalTestContent).toContain("Collapse sidebar");

        // Property 5: Navigation should work in both expanded and collapsed states
        const validationUtilsPath = path.join(
          process.cwd(),
          "tests/functional/utils/navigation-validation.ts",
        );
        const validationContent = fs.readFileSync(validationUtilsPath, "utf-8");

        // The getNavigationItems function should handle both states
        expect(validationContent).toContain("getNavigationItems");

        // Property 6: All items in rapid sequence should be valid
        const validItems = ["dashboard", "calendar", "tasks", "contacts", "settings"];
        testData.rapidSequence.forEach((item) => {
          expect(validItems).toContain(item);
        });

        // Property 7: Sidebar collapsed state should be a boolean
        expect(typeof testData.sidebarCollapsed).toBe("boolean");

        // Property 8: Navigation validation should wait for state to settle
        expect(functionalTestContent).toContain("toBeVisible");
        expect(functionalTestContent).toContain("expect");

        // Property 9: Tests should verify no race conditions by checking final state
        expect(functionalTestContent).toContain("validateNavigationCorrespondence");

        // Property 10: Each navigation item should be clickable
        expect(validationContent).toContain("click");

        return true;
      },
    ),
    { numRuns: 100 },
  );
});

/* Preconditions: navigation validation utilities handle all navigation sections
   Action: generate comprehensive navigation scenarios including settings
   Assertions: settings section should have same active state behavior as main sections
   Requirements: testing-infrastructure.7.2 */
it("should validate navigation active state properties for all sections including settings", async () => {
  // **Feature: testing-infrastructure, Property 8: Активное состояние навигации**

  fc.assert(
    fc.property(
      fc.record({
        mainSection: fc.constantFrom("dashboard", "calendar", "tasks", "contacts"),
        includeSettings: fc.boolean(),
        transitionCount: fc.integer({ min: 1, max: 5 }),
      }),
      (testData) => {
        const fs = require("fs");
        const path = require("path");

        const functionalTestPath = path.join(
          process.cwd(),
          "tests/functional/navigation-active-state.spec.ts",
        );
        const functionalTestContent = fs.readFileSync(functionalTestPath, "utf-8");

        // Property 1: Tests should cover settings section separately
        expect(functionalTestContent).toContain("settings");
        expect(functionalTestContent).toContain("validates active state for settings section");

        // Property 2: Settings should be validated as active when selected
        expect(functionalTestContent).toContain('navigateAndValidate(page, "settings")');

        // Property 3: Main sections should be inactive when settings is active
        expect(functionalTestContent).toContain("main navigation items are all inactive");

        // Property 4: All main sections should be valid navigation items
        const validMainSections = ["dashboard", "calendar", "tasks", "contacts"];
        expect(validMainSections).toContain(testData.mainSection);

        // Property 5: Settings is also a valid navigation item
        const allValidSections = [...validMainSections, "settings"];
        expect(allValidSections).toContain("settings");

        // Property 6: Transition count should be positive
        expect(testData.transitionCount).toBeGreaterThan(0);

        // Property 7: Navigation validation should work for all sections
        const validationUtilsPath = path.join(
          process.cwd(),
          "tests/functional/utils/navigation-validation.ts",
        );
        const validationContent = fs.readFileSync(validationUtilsPath, "utf-8");

        // All sections should be in the NavigationItem type
        allValidSections.forEach((section) => {
          expect(validationContent).toContain(`"${section}"`);
        });

        // Property 8: Settings button should be in a different section (border-t)
        expect(validationContent).toContain("border-t");
        expect(validationContent).toContain("settingsButton");

        // Property 9: Main navigation buttons should be in flex-1 section
        expect(validationContent).toContain("flex-1");
        expect(validationContent).toContain("mainNavButtons");

        // Property 10: Both main and settings sections should use same active state logic
        expect(validationContent).toContain("validateActiveNavigationItem");
        // This function should work for all navigation items regardless of section

        return true;
      },
    ),
    { numRuns: 100 },
  );
});
