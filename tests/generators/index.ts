// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2, testing-infrastructure.3.3
/**
 * Fast-check generators for property-based testing
 *
 * This module provides reusable generators for common data types used throughout
 * the application, configured with minimum 100 iterations for comprehensive testing.
 * Includes custom shrinking strategies for better counterexample minimization.
 */

export * from "./basic-generators";
export * from "./domain-generators";
export * from "./config-generators";
export * from "./custom-shrinkers";
