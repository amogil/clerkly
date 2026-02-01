// Requirements: testing-infrastructure.1.3, testing-infrastructure.4.1, testing-infrastructure.4.2, testing-infrastructure.4.3

// Test file validation utilities
export {
  findTestFiles,
  getCorrespondingSourceFile,
  validateSourceFileExists,
  validateAllTestFiles,
  generateValidationReport,
  type TestFileValidationResult,
  type ValidationSummary,
} from "./test-file-validation";

// Test error handler utilities
export {
  TestErrorHandlerImpl,
  testErrorHandler,
  withAsyncErrorHandling,
  withMockErrorHandling,
  assertWithErrorHandling,
  withTimeout,
  type TestContext,
  type ErrorDetails,
  type TestErrorHandler,
} from "./test-error-handler";

// Edge case generators for boundary testing
export * from "./edge-case-generators";

// File system utilities
export { readText, readJson, fileExists } from "./fs";
