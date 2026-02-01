// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2
import { fc } from "@fast-check/vitest";

/**
 * Configuration generators for fast-check property-based testing
 *
 * Provides standardized configuration objects with minimum 100 iterations
 * and proper shrinking strategies for comprehensive test coverage.
 */

// Default fast-check configuration with minimum 100 iterations
export const defaultPBTConfig = {
  numRuns: 100,
  timeout: 10000,
  seed: undefined,
  path: undefined,
  examples: undefined,
  endOnFailure: false,
  skipAllAfterTimeLimit: undefined,
  interruptAfterTimeLimit: undefined,
  markInterruptAsFailure: false,
  skipEqualValues: false,
  ignoreEqualValues: false,
  verbose: false,
} as const;

// Enhanced configuration for critical business logic (more iterations)
export const criticalPBTConfig = {
  ...defaultPBTConfig,
  numRuns: 500,
  timeout: 30000,
  verbose: true,
} as const;

// Fast configuration for quick feedback during development
export const quickPBTConfig = {
  ...defaultPBTConfig,
  numRuns: 50,
  timeout: 5000,
} as const;

// Configuration for edge case testing
export const edgeCasePBTConfig = {
  ...defaultPBTConfig,
  numRuns: 200,
  timeout: 15000,
  skipEqualValues: true,
} as const;

// Configuration generator for dynamic test scenarios
export const pbtConfigGenerator = () =>
  fc.record({
    numRuns: fc.integer({ min: 100, max: 1000 }),
    timeout: fc.integer({ min: 5000, max: 30000 }),
    seed: fc.option(fc.integer({ min: 1, max: 2147483647 })),
    endOnFailure: fc.boolean(),
    skipEqualValues: fc.boolean(),
    verbose: fc.boolean(),
  });

// Shrinking configuration for complex objects
export const shrinkingConfig = {
  // Enable shrinking for better counterexample minimization
  shrinkingEnabled: true,
  // Maximum shrinking attempts
  maxShrinkingAttempts: 1000,
  // Shrinking timeout
  shrinkingTimeout: 10000,
} as const;

// Test environment configuration generator
export const testEnvironmentConfig = () =>
  fc.record({
    nodeEnv: fc.constantFrom("test", "development", "production"),
    logLevel: fc.constantFrom("error", "warn", "info", "debug", "trace"),
    mockExternalServices: fc.boolean(),
    enableCoverage: fc.boolean(),
    parallelTests: fc.boolean(),
    testTimeout: fc.integer({ min: 1000, max: 60000 }),
  });

// Coverage configuration generator
export const coverageConfigGenerator = () =>
  fc.record({
    provider: fc.constantFrom("v8", "istanbul"),
    reporter: fc.array(fc.constantFrom("text", "json", "html", "lcov"), {
      minLength: 1,
      maxLength: 4,
    }),
    threshold: fc.record({
      global: fc.record({
        branches: fc.integer({ min: 85, max: 100 }),
        functions: fc.integer({ min: 85, max: 100 }),
        lines: fc.integer({ min: 85, max: 100 }),
        statements: fc.integer({ min: 85, max: 100 }),
      }),
    }),
    exclude: fc.array(fc.string(), { maxLength: 10 }),
    include: fc.array(fc.string(), { maxLength: 10 }),
  });

// Mock configuration generator
export const mockConfigGenerator = () =>
  fc.record({
    filesystem: fc.record({
      enabled: fc.boolean(),
      mockRealFiles: fc.boolean(),
      allowRealFileAccess: fc.boolean(),
    }),
    network: fc.record({
      enabled: fc.boolean(),
      blockExternalRequests: fc.boolean(),
      allowedDomains: fc.array(fc.string(), { maxLength: 5 }),
    }),
    database: fc.record({
      enabled: fc.boolean(),
      useInMemoryDb: fc.boolean(),
      seedData: fc.boolean(),
    }),
    ipc: fc.record({
      enabled: fc.boolean(),
      mockAllChannels: fc.boolean(),
      allowedChannels: fc.array(fc.string(), { maxLength: 10 }),
    }),
  });

// Utility function to create property test with default configuration
export const createPropertyTest = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  config: Partial<typeof defaultPBTConfig> = {},
) => {
  return fc.property(generator, predicate);
};

// Utility function to assert property with default configuration
export const assertProperty = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  config: Partial<typeof defaultPBTConfig> = {},
) => {
  const finalConfig = { ...defaultPBTConfig, ...config };
  return fc.assert(fc.property(generator, predicate), finalConfig);
};

// Configuration for specific test types
export const authTestConfig = {
  ...defaultPBTConfig,
  numRuns: 200, // More iterations for security-critical auth logic
  timeout: 15000,
} as const;

export const uiTestConfig = {
  ...defaultPBTConfig,
  numRuns: 150, // Moderate iterations for UI behavior
  timeout: 12000,
} as const;

export const dataTestConfig = {
  ...defaultPBTConfig,
  numRuns: 300, // High iterations for data integrity
  timeout: 20000,
} as const;

export const integrationTestConfig = {
  ...defaultPBTConfig,
  numRuns: 100, // Standard iterations for integration tests
  timeout: 25000, // Longer timeout for complex interactions
} as const;
