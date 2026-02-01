// Requirements: testing-infrastructure.4.2
import { fc } from "@fast-check/vitest";

/**
 * Edge case generators for testing boundary conditions
 *
 * Provides utilities for generating edge cases including:
 * - Empty data (empty strings, arrays, objects)
 * - Null/undefined values
 * - Maximum and minimum values
 * - Boundary conditions for common data types
 */

// ============================================================================
// Empty Data Generators
// ============================================================================

/**
 * Generates empty string edge case
 */
export const emptyString = () => fc.constant("");

/**
 * Generates empty array edge case
 */
export const emptyArray = <T>() => fc.constant([] as T[]);

/**
 * Generates empty object edge case
 */
export const emptyObject = () => fc.constant({});

/**
 * Generates whitespace-only strings (edge case for string validation)
 */
export const whitespaceString = () => fc.constantFrom(" ", "  ", "\t", "\n", "\r\n", "   \t\n   ");

/**
 * Generates strings with only special characters
 */
export const specialCharString = () =>
  fc.constantFrom("!", "@#$%", "***", "...", "---", "___", "()[]{}");

// ============================================================================
// Null/Undefined Generators
// ============================================================================

/**
 * Generates null value
 */
export const nullValue = () => fc.constant(null);

/**
 * Generates undefined value
 */
export const undefinedValue = () => fc.constant(undefined);

/**
 * Generates either null or undefined
 */
export const nullish = () => fc.constantFrom(null, undefined);

/**
 * Generates a value that can be valid data, null, or undefined
 */
export const nullable = <T>(generator: fc.Arbitrary<T>) =>
  fc.oneof(generator, nullValue(), undefinedValue());

/**
 * Generates optional value (value or undefined)
 */
export const optional = <T>(generator: fc.Arbitrary<T>) => fc.option(generator, { nil: undefined });

// ============================================================================
// Numeric Boundary Generators
// ============================================================================

/**
 * Generates minimum safe integer
 */
export const minSafeInteger = () => fc.constant(Number.MIN_SAFE_INTEGER);

/**
 * Generates maximum safe integer
 */
export const maxSafeInteger = () => fc.constant(Number.MAX_SAFE_INTEGER);

/**
 * Generates zero
 */
export const zero = () => fc.constant(0);

/**
 * Generates negative zero
 */
export const negativeZero = () => fc.constant(-0);

/**
 * Generates positive infinity
 */
export const positiveInfinity = () => fc.constant(Number.POSITIVE_INFINITY);

/**
 * Generates negative infinity
 */
export const negativeInfinity = () => fc.constant(Number.NEGATIVE_INFINITY);

/**
 * Generates NaN
 */
export const notANumber = () => fc.constant(Number.NaN);

/**
 * Generates minimum positive value
 */
export const minPositiveValue = () => fc.constant(Number.MIN_VALUE);

/**
 * Generates maximum value
 */
export const maxValue = () => fc.constant(Number.MAX_VALUE);

/**
 * Generates numeric edge cases (0, -0, Infinity, -Infinity, NaN, MIN, MAX)
 */
export const numericEdgeCases = () =>
  fc.constantFrom(
    0,
    -0,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  );

/**
 * Generates boundary integers (min, -1, 0, 1, max)
 */
export const boundaryIntegers = () =>
  fc.constantFrom(Number.MIN_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER);

/**
 * Generates small positive integers near zero (0, 1, 2, 3)
 */
export const smallPositiveIntegers = () => fc.constantFrom(0, 1, 2, 3);

/**
 * Generates small negative integers near zero (-3, -2, -1, 0)
 */
export const smallNegativeIntegers = () => fc.constantFrom(-3, -2, -1, 0);

// ============================================================================
// String Boundary Generators
// ============================================================================

/**
 * Generates single character string
 */
export const singleChar = () => fc.string({ minLength: 1, maxLength: 1 });

/**
 * Generates very long string (near maximum practical length)
 */
export const veryLongString = () => fc.string({ minLength: 10000, maxLength: 100000 });

/**
 * Generates string with maximum length for typical use cases
 */
export const maxLengthString = (maxLength: number) =>
  fc.string({ minLength: maxLength, maxLength });

/**
 * Generates string boundary cases (empty, single char, very long)
 */
export const stringBoundaries = () =>
  fc.oneof(
    emptyString(),
    singleChar().map((c) => c),
    fc.string({ minLength: 1000, maxLength: 5000 }),
  );

/**
 * Generates strings with unicode edge cases
 */
export const unicodeEdgeCases = () =>
  fc.constantFrom(
    "\u0000", // Null character
    "\uFFFD", // Replacement character
    "\uD800", // High surrogate
    "\uDFFF", // Low surrogate
    "🔥", // Emoji
    "你好", // Chinese characters
    "مرحبا", // Arabic
    "🏴󠁧󠁢󠁥󠁮󠁧󠁿", // Flag emoji
  );

// ============================================================================
// Array Boundary Generators
// ============================================================================

/**
 * Generates single element array
 */
export const singleElementArray = <T>(generator: fc.Arbitrary<T>) =>
  generator.map((value) => [value]);

/**
 * Generates very large array
 */
export const veryLargeArray = <T>(generator: fc.Arbitrary<T>) =>
  fc.array(generator, { minLength: 1000, maxLength: 10000 });

/**
 * Generates array with maximum length
 */
export const maxLengthArray = <T>(generator: fc.Arbitrary<T>, maxLength: number) =>
  fc.array(generator, { minLength: maxLength, maxLength });

/**
 * Generates array boundary cases (empty, single element, large)
 */
export const arrayBoundaries = <T>(generator: fc.Arbitrary<T>) =>
  fc.oneof(
    emptyArray<T>(),
    singleElementArray(generator),
    fc.array(generator, { minLength: 100, maxLength: 1000 }),
  );

// ============================================================================
// Date/Time Boundary Generators
// ============================================================================

/**
 * Generates Unix epoch (January 1, 1970)
 */
export const unixEpoch = () => fc.constant(new Date(0));

/**
 * Generates minimum valid date
 */
export const minDate = () => fc.constant(new Date(-8640000000000000));

/**
 * Generates maximum valid date
 */
export const maxDate = () => fc.constant(new Date(8640000000000000));

/**
 * Generates date boundary cases (epoch, min, max, now)
 */
export const dateBoundaries = () =>
  fc.constantFrom(new Date(0), new Date(-8640000000000000), new Date(8640000000000000), new Date());

/**
 * Generates timestamp boundaries (0, negative, very large)
 */
export const timestampBoundaries = () =>
  fc.constantFrom(0, -1, Date.now(), Date.now() + 365 * 24 * 60 * 60 * 1000);

// ============================================================================
// Object Boundary Generators
// ============================================================================

/**
 * Generates object with single property
 */
export const singlePropertyObject = () =>
  fc.record({
    key: fc.string(),
  });

/**
 * Generates deeply nested object
 */
export const deeplyNestedObject = (depth: number = 10): fc.Arbitrary<any> => {
  if (depth === 0) {
    return fc.oneof(fc.string(), fc.integer(), fc.boolean());
  }
  return fc.record({
    nested: deeplyNestedObject(depth - 1),
  });
};

/**
 * Generates object with many properties
 */
export const manyPropertiesObject = () =>
  fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string(), {
    minKeys: 50,
    maxKeys: 100,
  });

/**
 * Generates object boundary cases (empty, single property, many properties, deeply nested)
 */
export const objectBoundaries = () =>
  fc.oneof(emptyObject(), singlePropertyObject(), manyPropertiesObject(), deeplyNestedObject(5));

// ============================================================================
// Boolean and Enum Boundary Generators
// ============================================================================

/**
 * Generates boolean edge cases (true, false)
 */
export const booleanEdgeCases = () => fc.boolean();

/**
 * Generates truthy values
 */
export const truthyValues = () => fc.constantFrom(true, 1, "true", "yes", "1", {}, []);

/**
 * Generates falsy values
 */
export const falsyValues = () => fc.constantFrom(false, 0, "", null, undefined, NaN);

// ============================================================================
// Network/URL Boundary Generators
// ============================================================================

/**
 * Generates invalid URLs
 */
export const invalidUrls = () =>
  fc.constantFrom(
    "",
    "not-a-url",
    "http://",
    "://example.com",
    "ftp://",
    "htp://example.com",
    "http:/example.com",
    "http//example.com",
    "ht!tp://example.com",
  );

/**
 * Generates edge case ports (0, 1, 65535, 65536)
 */
export const edgeCasePorts = () => fc.constantFrom(0, 1, 80, 443, 8080, 65535, 65536);

/**
 * Generates invalid email addresses
 */
export const invalidEmails = () =>
  fc.constantFrom(
    "",
    "@",
    "user@",
    "@domain.com",
    "user domain@example.com",
    "user@domain",
    "user@@domain.com",
  );

// ============================================================================
// File System Boundary Generators
// ============================================================================

/**
 * Generates invalid file paths
 */
export const invalidFilePaths = () =>
  fc.constantFrom(
    "",
    "/",
    "//",
    ".",
    "..",
    "con", // Windows reserved
    "prn", // Windows reserved
    "aux", // Windows reserved
    "nul", // Windows reserved
    "file\0name", // Null character
    "file:name", // Invalid character
    "file*name", // Invalid character
  );

/**
 * Generates very long file paths
 */
export const veryLongFilePath = () => fc.string({ minLength: 260, maxLength: 1000 });

/**
 * Generates file path boundary cases
 */
export const filePathBoundaries = () =>
  fc.oneof(emptyString(), fc.constant("/"), fc.constant("."), veryLongFilePath());

// ============================================================================
// Combined Edge Case Generators
// ============================================================================

/**
 * Generates any edge case value (null, undefined, empty, boundaries)
 */
export const anyEdgeCase = () =>
  fc.oneof(
    nullValue(),
    undefinedValue(),
    emptyString(),
    emptyArray(),
    emptyObject(),
    numericEdgeCases(),
  );

/**
 * Generates edge case or valid value
 */
export const edgeCaseOrValid = <T>(validGenerator: fc.Arbitrary<T>) =>
  fc.oneof(validGenerator, anyEdgeCase() as fc.Arbitrary<T>);

// ============================================================================
// Helper Functions for Testing Boundary Conditions
// ============================================================================

/**
 * Tests a function with all numeric edge cases
 */
export const testWithNumericEdgeCases = <T>(
  fn: (value: number) => T,
  assertion: (result: T, input: number) => boolean | void,
) => {
  return fc.property(numericEdgeCases(), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};

/**
 * Tests a function with all string boundary cases
 */
export const testWithStringBoundaries = <T>(
  fn: (value: string) => T,
  assertion: (result: T, input: string) => boolean | void,
) => {
  return fc.property(stringBoundaries(), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};

/**
 * Tests a function with null/undefined values
 */
export const testWithNullish = <T>(
  fn: (value: null | undefined) => T,
  assertion: (result: T, input: null | undefined) => boolean | void,
) => {
  return fc.property(nullish(), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};

/**
 * Tests a function with empty data
 */
export const testWithEmptyData = <T>(
  fn: (value: string | any[] | object) => T,
  assertion: (result: T, input: string | any[] | object) => boolean | void,
) => {
  return fc.property(fc.oneof(emptyString(), emptyArray(), emptyObject()), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};

/**
 * Tests a function with array boundary cases
 */
export const testWithArrayBoundaries = <T, R>(
  generator: fc.Arbitrary<T>,
  fn: (value: T[]) => R,
  assertion: (result: R, input: T[]) => boolean | void,
) => {
  return fc.property(arrayBoundaries(generator), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};

/**
 * Asserts that a function handles edge cases without throwing
 */
export const assertHandlesEdgeCases = <T>(fn: (value: any) => T) => {
  return fc.property(anyEdgeCase(), (value) => {
    try {
      fn(value);
      return true;
    } catch (error) {
      // Function should handle edge cases gracefully
      return false;
    }
  });
};

/**
 * Asserts that a function throws for invalid edge cases
 */
export const assertThrowsForInvalidEdgeCases = <T>(
  fn: (value: any) => T,
  invalidGenerator: fc.Arbitrary<any>,
) => {
  return fc.property(invalidGenerator, (value) => {
    try {
      fn(value);
      return false; // Should have thrown
    } catch (error) {
      return true; // Expected to throw
    }
  });
};

/**
 * Creates a generator that combines valid values with edge cases
 */
export const withEdgeCases = <T>(
  validGenerator: fc.Arbitrary<T>,
  edgeCaseRatio: number = 0.2,
): fc.Arbitrary<T> => {
  // Use weighted oneof instead of frequency
  const validWeight = Math.max(1, Math.floor((1 - edgeCaseRatio) * 10));
  const edgeWeight = Math.max(1, Math.floor(edgeCaseRatio * 10));

  const generators: fc.Arbitrary<T>[] = [];
  for (let i = 0; i < validWeight; i++) {
    generators.push(validGenerator);
  }
  for (let i = 0; i < edgeWeight; i++) {
    generators.push(anyEdgeCase() as fc.Arbitrary<T>);
  }

  return fc.oneof(...generators);
};

/**
 * Generates a value that is at or near a boundary
 */
export const nearBoundary = (min: number, max: number, delta: number = 1) => {
  return fc.constantFrom(min, min + delta, max - delta, max);
};

/**
 * Tests a function with values near boundaries
 */
export const testNearBoundaries = <T>(
  min: number,
  max: number,
  fn: (value: number) => T,
  assertion: (result: T, input: number) => boolean | void,
) => {
  return fc.property(nearBoundary(min, max), (value) => {
    const result = fn(value);
    return assertion(result, value);
  });
};
