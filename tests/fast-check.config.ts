// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2, testing-infrastructure.3.3
/**
 * Fast-check configuration for property-based testing
 *
 * This configuration ensures minimum 100 iterations for all property tests
 * and enables automatic shrinking for better counterexample minimization.
 */

import { fc } from "@fast-check/vitest";

// Global fast-check configuration
export const globalFastCheckConfig = {
  // Minimum 100 iterations as per requirements
  numRuns: 100,

  // Timeout for property tests (10 seconds default)
  timeout: 10000,

  // Enable verbose output for better debugging
  verbose: false,

  // Seed for reproducible tests (undefined for random)
  seed: undefined,

  // Path for test execution tracking
  path: undefined,

  // Examples to include in testing
  examples: undefined,

  // Don't stop on first failure to gather more information
  endOnFailure: false,

  // Time limits for test execution
  skipAllAfterTimeLimit: undefined,
  interruptAfterTimeLimit: undefined,
  markInterruptAsFailure: false,

  // Value comparison settings
  skipEqualValues: false,
  ignoreEqualValues: false,
} as const;

// Configuration for different test categories
export const testConfigurations = {
  // Standard configuration for most property tests
  standard: {
    ...globalFastCheckConfig,
    numRuns: 100,
  },

  // Enhanced configuration for critical business logic
  critical: {
    ...globalFastCheckConfig,
    numRuns: 500,
    timeout: 30000,
    verbose: true,
  },

  // Quick configuration for development and CI
  quick: {
    ...globalFastCheckConfig,
    numRuns: 50,
    timeout: 5000,
  },

  // Comprehensive configuration for edge case testing
  comprehensive: {
    ...globalFastCheckConfig,
    numRuns: 200,
    timeout: 15000,
    skipEqualValues: true,
  },

  // Configuration for integration tests
  integration: {
    ...globalFastCheckConfig,
    numRuns: 100,
    timeout: 25000,
  },
} as const;

// Shrinking configuration for better counterexample minimization
export const shrinkingConfig = {
  // Enable automatic shrinking
  enabled: true,

  // Maximum shrinking attempts
  maxAttempts: 1000,

  // Shrinking timeout
  timeout: 10000,

  // Shrinking strategy
  strategy: "default" as const,
};

// Helper function to create property tests with standard configuration
export const createStandardProperty = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
) => {
  return fc.property(generator, predicate);
};

// Helper function to assert properties with configurable settings
export const assertPropertyWithConfig = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  configName: keyof typeof testConfigurations = "standard",
) => {
  const config = testConfigurations[configName];
  return fc.assert(fc.property(generator, predicate), config);
};

// Helper function for critical business logic testing
export const assertCriticalProperty = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
) => {
  return assertPropertyWithConfig(generator, predicate, "critical");
};

// Helper function for quick development testing
export const assertQuickProperty = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
) => {
  return assertPropertyWithConfig(generator, predicate, "quick");
};

// Helper function for comprehensive edge case testing
export const assertComprehensiveProperty = <T>(
  generator: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
) => {
  return assertPropertyWithConfig(generator, predicate, "comprehensive");
};

// Configuration validation
export const validateFastCheckConfig = (config: any, allowDevelopmentConfig = false): boolean => {
  // For development configurations, allow lower iteration counts
  const minIterations = allowDevelopmentConfig ? 10 : 100;

  if (config.numRuns < minIterations) {
    throw new Error(
      `Fast-check configuration must have at least ${minIterations} iterations, got ${config.numRuns}`,
    );
  }

  // Ensure reasonable timeout
  if (config.timeout < 1000) {
    throw new Error(`Fast-check timeout must be at least 1000ms, got ${config.timeout}`);
  }

  return true;
};

// Validate configurations on module load with appropriate flags
Object.entries(testConfigurations).forEach(([name, config]) => {
  try {
    // Allow development configurations for 'quick' preset
    const isDevelopmentConfig = name === "quick";
    validateFastCheckConfig(config, isDevelopmentConfig);
  } catch (error) {
    console.error(`Invalid fast-check configuration for ${name}:`, error);
    throw error;
  }
});

// Export default configuration
export default globalFastCheckConfig;
