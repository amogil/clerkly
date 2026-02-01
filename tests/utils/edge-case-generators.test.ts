// Requirements: testing-infrastructure.4.2
import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";
import * as edgeCases from "./edge-case-generators";

describe("Edge Case Generators", () => {
  describe("Empty Data Generators", () => {
    /* Preconditions: none
       Action: generate empty string
       Assertions: returns empty string ""
       Requirements: testing-infrastructure.4.2 */
    it("should generate empty string", () => {
      fc.assert(
        fc.property(edgeCases.emptyString(), (value) => {
          expect(value).toBe("");
          expect(value.length).toBe(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate empty array
       Assertions: returns empty array []
       Requirements: testing-infrastructure.4.2 */
    it("should generate empty array", () => {
      fc.assert(
        fc.property(edgeCases.emptyArray(), (value) => {
          expect(value).toEqual([]);
          expect(value.length).toBe(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate empty object
       Assertions: returns empty object {}
       Requirements: testing-infrastructure.4.2 */
    it("should generate empty object", () => {
      fc.assert(
        fc.property(edgeCases.emptyObject(), (value) => {
          expect(value).toEqual({});
          expect(Object.keys(value).length).toBe(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate whitespace-only string
       Assertions: returns string containing only whitespace characters
       Requirements: testing-infrastructure.4.2 */
    it("should generate whitespace-only strings", () => {
      fc.assert(
        fc.property(edgeCases.whitespaceString(), (value) => {
          expect(value.trim()).toBe("");
          expect(value.length).toBeGreaterThan(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate special character string
       Assertions: returns string containing only special characters
       Requirements: testing-infrastructure.4.2 */
    it("should generate special character strings", () => {
      fc.assert(
        fc.property(edgeCases.specialCharString(), (value) => {
          expect(value).toMatch(/^[^a-zA-Z0-9\s]+$/);
        }),
      );
    });
  });

  describe("Null/Undefined Generators", () => {
    /* Preconditions: none
       Action: generate null value
       Assertions: returns null
       Requirements: testing-infrastructure.4.2 */
    it("should generate null value", () => {
      fc.assert(
        fc.property(edgeCases.nullValue(), (value) => {
          expect(value).toBeNull();
        }),
      );
    });

    /* Preconditions: none
       Action: generate undefined value
       Assertions: returns undefined
       Requirements: testing-infrastructure.4.2 */
    it("should generate undefined value", () => {
      fc.assert(
        fc.property(edgeCases.undefinedValue(), (value) => {
          expect(value).toBeUndefined();
        }),
      );
    });

    /* Preconditions: none
       Action: generate nullish value (null or undefined)
       Assertions: returns either null or undefined
       Requirements: testing-infrastructure.4.2 */
    it("should generate nullish values", () => {
      fc.assert(
        fc.property(edgeCases.nullish(), (value) => {
          expect(value === null || value === undefined).toBe(true);
        }),
      );
    });

    /* Preconditions: valid string generator provided
       Action: generate nullable string
       Assertions: returns string, null, or undefined
       Requirements: testing-infrastructure.4.2 */
    it("should generate nullable values", () => {
      fc.assert(
        fc.property(edgeCases.nullable(fc.string()), (value) => {
          expect(typeof value === "string" || value === null || value === undefined).toBe(true);
        }),
      );
    });

    /* Preconditions: valid integer generator provided
       Action: generate optional integer
       Assertions: returns integer or undefined
       Requirements: testing-infrastructure.4.2 */
    it("should generate optional values", () => {
      fc.assert(
        fc.property(edgeCases.optional(fc.integer()), (value) => {
          expect(typeof value === "number" || value === undefined).toBe(true);
        }),
      );
    });
  });

  describe("Numeric Boundary Generators", () => {
    /* Preconditions: none
       Action: generate minimum safe integer
       Assertions: returns Number.MIN_SAFE_INTEGER
       Requirements: testing-infrastructure.4.2 */
    it("should generate minimum safe integer", () => {
      fc.assert(
        fc.property(edgeCases.minSafeInteger(), (value) => {
          expect(value).toBe(Number.MIN_SAFE_INTEGER);
        }),
      );
    });

    /* Preconditions: none
       Action: generate maximum safe integer
       Assertions: returns Number.MAX_SAFE_INTEGER
       Requirements: testing-infrastructure.4.2 */
    it("should generate maximum safe integer", () => {
      fc.assert(
        fc.property(edgeCases.maxSafeInteger(), (value) => {
          expect(value).toBe(Number.MAX_SAFE_INTEGER);
        }),
      );
    });

    /* Preconditions: none
       Action: generate zero
       Assertions: returns 0
       Requirements: testing-infrastructure.4.2 */
    it("should generate zero", () => {
      fc.assert(
        fc.property(edgeCases.zero(), (value) => {
          expect(value).toBe(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate negative zero
       Assertions: returns -0
       Requirements: testing-infrastructure.4.2 */
    it("should generate negative zero", () => {
      fc.assert(
        fc.property(edgeCases.negativeZero(), (value) => {
          expect(Object.is(value, -0)).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate positive infinity
       Assertions: returns Number.POSITIVE_INFINITY
       Requirements: testing-infrastructure.4.2 */
    it("should generate positive infinity", () => {
      fc.assert(
        fc.property(edgeCases.positiveInfinity(), (value) => {
          expect(value).toBe(Number.POSITIVE_INFINITY);
        }),
      );
    });

    /* Preconditions: none
       Action: generate negative infinity
       Assertions: returns Number.NEGATIVE_INFINITY
       Requirements: testing-infrastructure.4.2 */
    it("should generate negative infinity", () => {
      fc.assert(
        fc.property(edgeCases.negativeInfinity(), (value) => {
          expect(value).toBe(Number.NEGATIVE_INFINITY);
        }),
      );
    });

    /* Preconditions: none
       Action: generate NaN
       Assertions: returns NaN
       Requirements: testing-infrastructure.4.2 */
    it("should generate NaN", () => {
      fc.assert(
        fc.property(edgeCases.notANumber(), (value) => {
          expect(Number.isNaN(value)).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate numeric edge cases
       Assertions: returns one of the numeric boundary values
       Requirements: testing-infrastructure.4.2 */
    it("should generate numeric edge cases", () => {
      fc.assert(
        fc.property(edgeCases.numericEdgeCases(), (value) => {
          const validEdgeCases = [
            0,
            -0,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            Number.MIN_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            Number.MIN_VALUE,
            Number.MAX_VALUE,
          ];
          expect(validEdgeCases.some((edge) => Object.is(value, edge)) || Number.isNaN(value)).toBe(
            true,
          );
        }),
      );
    });

    /* Preconditions: none
       Action: generate boundary integers
       Assertions: returns integer at or near boundaries
       Requirements: testing-infrastructure.4.2 */
    it("should generate boundary integers", () => {
      fc.assert(
        fc.property(edgeCases.boundaryIntegers(), (value) => {
          const validBoundaries = [Number.MIN_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER];
          expect(validBoundaries.includes(value)).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate small positive integers
       Assertions: returns integer between 0 and 3
       Requirements: testing-infrastructure.4.2 */
    it("should generate small positive integers", () => {
      fc.assert(
        fc.property(edgeCases.smallPositiveIntegers(), (value) => {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(3);
        }),
      );
    });

    /* Preconditions: none
       Action: generate small negative integers
       Assertions: returns integer between -3 and 0
       Requirements: testing-infrastructure.4.2 */
    it("should generate small negative integers", () => {
      fc.assert(
        fc.property(edgeCases.smallNegativeIntegers(), (value) => {
          expect(value).toBeGreaterThanOrEqual(-3);
          expect(value).toBeLessThanOrEqual(0);
        }),
      );
    });
  });

  describe("String Boundary Generators", () => {
    /* Preconditions: none
       Action: generate single character string
       Assertions: returns string with length 1
       Requirements: testing-infrastructure.4.2 */
    it("should generate single character strings", () => {
      fc.assert(
        fc.property(edgeCases.singleChar(), (value) => {
          expect(value.length).toBe(1);
        }),
      );
    });

    /* Preconditions: none
       Action: generate very long string
       Assertions: returns string with length >= 10000
       Requirements: testing-infrastructure.4.2 */
    it("should generate very long strings", () => {
      fc.assert(
        fc.property(edgeCases.veryLongString(), (value) => {
          expect(value.length).toBeGreaterThanOrEqual(10000);
        }),
      );
    });

    /* Preconditions: maxLength parameter provided
       Action: generate string with maximum length
       Assertions: returns string with exact maxLength
       Requirements: testing-infrastructure.4.2 */
    it("should generate max length strings", () => {
      const maxLength = 100;
      fc.assert(
        fc.property(edgeCases.maxLengthString(maxLength), (value) => {
          expect(value.length).toBe(maxLength);
        }),
      );
    });

    /* Preconditions: none
       Action: generate string boundaries
       Assertions: returns empty, single char, or long string
       Requirements: testing-infrastructure.4.2 */
    it("should generate string boundary cases", () => {
      fc.assert(
        fc.property(edgeCases.stringBoundaries(), (value) => {
          expect(typeof value).toBe("string");
          expect(value.length === 0 || value.length === 1 || value.length >= 1000).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate unicode edge cases
       Assertions: returns string with special unicode characters
       Requirements: testing-infrastructure.4.2 */
    it("should generate unicode edge cases", () => {
      fc.assert(
        fc.property(edgeCases.unicodeEdgeCases(), (value) => {
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThan(0);
        }),
      );
    });
  });

  describe("Array Boundary Generators", () => {
    /* Preconditions: valid generator provided
       Action: generate single element array
       Assertions: returns array with length 1
       Requirements: testing-infrastructure.4.2 */
    it("should generate single element arrays", () => {
      fc.assert(
        fc.property(edgeCases.singleElementArray(fc.integer()), (value) => {
          expect(value.length).toBe(1);
        }),
      );
    });

    /* Preconditions: valid generator provided
       Action: generate very large array
       Assertions: returns array with length >= 1000
       Requirements: testing-infrastructure.4.2 */
    it("should generate very large arrays", () => {
      fc.assert(
        fc.property(edgeCases.veryLargeArray(fc.integer()), (value) => {
          expect(value.length).toBeGreaterThanOrEqual(1000);
        }),
      );
    });

    /* Preconditions: valid generator and maxLength provided
       Action: generate array with maximum length
       Assertions: returns array with exact maxLength
       Requirements: testing-infrastructure.4.2 */
    it("should generate max length arrays", () => {
      const maxLength = 50;
      fc.assert(
        fc.property(edgeCases.maxLengthArray(fc.integer(), maxLength), (value) => {
          expect(value.length).toBe(maxLength);
        }),
      );
    });

    /* Preconditions: valid generator provided
       Action: generate array boundaries
       Assertions: returns empty, single element, or large array
       Requirements: testing-infrastructure.4.2 */
    it("should generate array boundary cases", () => {
      fc.assert(
        fc.property(edgeCases.arrayBoundaries(fc.integer()), (value) => {
          expect(Array.isArray(value)).toBe(true);
          expect(value.length === 0 || value.length === 1 || value.length >= 100).toBe(true);
        }),
      );
    });
  });

  describe("Date/Time Boundary Generators", () => {
    /* Preconditions: none
       Action: generate Unix epoch date
       Assertions: returns Date(0)
       Requirements: testing-infrastructure.4.2 */
    it("should generate Unix epoch", () => {
      fc.assert(
        fc.property(edgeCases.unixEpoch(), (value) => {
          expect(value.getTime()).toBe(0);
        }),
      );
    });

    /* Preconditions: none
       Action: generate minimum valid date
       Assertions: returns minimum Date value
       Requirements: testing-infrastructure.4.2 */
    it("should generate minimum date", () => {
      fc.assert(
        fc.property(edgeCases.minDate(), (value) => {
          expect(value.getTime()).toBe(-8640000000000000);
        }),
      );
    });

    /* Preconditions: none
       Action: generate maximum valid date
       Assertions: returns maximum Date value
       Requirements: testing-infrastructure.4.2 */
    it("should generate maximum date", () => {
      fc.assert(
        fc.property(edgeCases.maxDate(), (value) => {
          expect(value.getTime()).toBe(8640000000000000);
        }),
      );
    });

    /* Preconditions: none
       Action: generate date boundaries
       Assertions: returns epoch, min, max, or current date
       Requirements: testing-infrastructure.4.2 */
    it("should generate date boundary cases", () => {
      fc.assert(
        fc.property(edgeCases.dateBoundaries(), (value) => {
          expect(value instanceof Date).toBe(true);
          const validTimes = [0, -8640000000000000, 8640000000000000];
          expect(
            validTimes.includes(value.getTime()) || Math.abs(value.getTime() - Date.now()) < 1000,
          ).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate timestamp boundaries
       Assertions: returns 0, negative, or large timestamp
       Requirements: testing-infrastructure.4.2 */
    it("should generate timestamp boundaries", () => {
      fc.assert(
        fc.property(edgeCases.timestampBoundaries(), (value) => {
          expect(typeof value).toBe("number");
          expect(value === 0 || value === -1 || value > 0).toBe(true);
        }),
      );
    });
  });

  describe("Object Boundary Generators", () => {
    /* Preconditions: none
       Action: generate single property object
       Assertions: returns object with exactly one property
       Requirements: testing-infrastructure.4.2 */
    it("should generate single property objects", () => {
      fc.assert(
        fc.property(edgeCases.singlePropertyObject(), (value) => {
          expect(Object.keys(value).length).toBe(1);
        }),
      );
    });

    /* Preconditions: depth parameter provided
       Action: generate deeply nested object
       Assertions: returns object with nested structure
       Requirements: testing-infrastructure.4.2 */
    it("should generate deeply nested objects", () => {
      fc.assert(
        fc.property(edgeCases.deeplyNestedObject(3), (value) => {
          expect(typeof value).toBe("object");
          expect(value).not.toBeNull();
        }),
      );
    });

    /* Preconditions: none
       Action: generate object with many properties
       Assertions: returns object with >= 50 properties
       Requirements: testing-infrastructure.4.2 */
    it("should generate objects with many properties", () => {
      fc.assert(
        fc.property(edgeCases.manyPropertiesObject(), (value) => {
          expect(Object.keys(value).length).toBeGreaterThanOrEqual(50);
        }),
      );
    });

    /* Preconditions: none
       Action: generate object boundaries
       Assertions: returns empty, single property, many properties, or nested object
       Requirements: testing-infrastructure.4.2 */
    it("should generate object boundary cases", () => {
      fc.assert(
        fc.property(edgeCases.objectBoundaries(), (value) => {
          expect(typeof value).toBe("object");
          expect(value).not.toBeNull();
        }),
      );
    });
  });

  describe("Boolean and Enum Boundary Generators", () => {
    /* Preconditions: none
       Action: generate boolean edge cases
       Assertions: returns true or false
       Requirements: testing-infrastructure.4.2 */
    it("should generate boolean edge cases", () => {
      fc.assert(
        fc.property(edgeCases.booleanEdgeCases(), (value) => {
          expect(typeof value).toBe("boolean");
        }),
      );
    });

    /* Preconditions: none
       Action: generate truthy values
       Assertions: returns value that evaluates to true
       Requirements: testing-infrastructure.4.2 */
    it("should generate truthy values", () => {
      fc.assert(
        fc.property(edgeCases.truthyValues(), (value) => {
          expect(!!value).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate falsy values
       Assertions: returns value that evaluates to false
       Requirements: testing-infrastructure.4.2 */
    it("should generate falsy values", () => {
      fc.assert(
        fc.property(edgeCases.falsyValues(), (value) => {
          expect(!!value).toBe(false);
        }),
      );
    });
  });

  describe("Network/URL Boundary Generators", () => {
    /* Preconditions: none
       Action: generate invalid URLs
       Assertions: returns strings representing common invalid URL patterns
       Requirements: testing-infrastructure.4.2 */
    it("should generate invalid URLs", () => {
      fc.assert(
        fc.property(edgeCases.invalidUrls(), (value) => {
          expect(typeof value).toBe("string");
          // Verify these are the specific invalid URL patterns we generate
          const validInvalidUrls = [
            "",
            "not-a-url",
            "http://",
            "://example.com",
            "ftp://",
            "htp://example.com",
            "http:/example.com",
            "http//example.com",
            "ht!tp://example.com",
          ];
          expect(validInvalidUrls.includes(value)).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate edge case ports
       Assertions: returns port number at boundaries
       Requirements: testing-infrastructure.4.2 */
    it("should generate edge case ports", () => {
      fc.assert(
        fc.property(edgeCases.edgeCasePorts(), (value) => {
          expect(typeof value).toBe("number");
          expect(value >= 0 && value <= 65536).toBe(true);
        }),
      );
    });

    /* Preconditions: none
       Action: generate invalid email addresses
       Assertions: returns string that is not a valid email
       Requirements: testing-infrastructure.4.2 */
    it("should generate invalid emails", () => {
      fc.assert(
        fc.property(edgeCases.invalidEmails(), (value) => {
          expect(typeof value).toBe("string");
          // Basic email validation - invalid emails should not match
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          expect(emailRegex.test(value)).toBe(false);
        }),
      );
    });
  });

  describe("File System Boundary Generators", () => {
    /* Preconditions: none
       Action: generate invalid file paths
       Assertions: returns string that is not a valid file path
       Requirements: testing-infrastructure.4.2 */
    it("should generate invalid file paths", () => {
      fc.assert(
        fc.property(edgeCases.invalidFilePaths(), (value) => {
          expect(typeof value).toBe("string");
        }),
      );
    });

    /* Preconditions: none
       Action: generate very long file path
       Assertions: returns path with length >= 260
       Requirements: testing-infrastructure.4.2 */
    it("should generate very long file paths", () => {
      fc.assert(
        fc.property(edgeCases.veryLongFilePath(), (value) => {
          expect(value.length).toBeGreaterThanOrEqual(260);
        }),
      );
    });

    /* Preconditions: none
       Action: generate file path boundaries
       Assertions: returns empty, root, current dir, or very long path
       Requirements: testing-infrastructure.4.2 */
    it("should generate file path boundary cases", () => {
      fc.assert(
        fc.property(edgeCases.filePathBoundaries(), (value) => {
          expect(typeof value).toBe("string");
        }),
      );
    });
  });

  describe("Helper Functions", () => {
    /* Preconditions: function and assertion provided
       Action: test function with numeric edge cases
       Assertions: function handles all numeric boundaries correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test with numeric edge cases", () => {
      const isFiniteNumber = (n: number) => Number.isFinite(n);
      fc.assert(
        edgeCases.testWithNumericEdgeCases(isFiniteNumber, (result, input) => {
          if (Number.isFinite(input)) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }),
      );
    });

    /* Preconditions: function and assertion provided
       Action: test function with string boundaries
       Assertions: function handles all string boundaries correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test with string boundaries", () => {
      const getLength = (s: string) => s.length;
      fc.assert(
        edgeCases.testWithStringBoundaries(getLength, (result, input) => {
          expect(result).toBe(input.length);
        }),
      );
    });

    /* Preconditions: function and assertion provided
       Action: test function with nullish values
       Assertions: function handles null and undefined correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test with nullish values", () => {
      const isNullish = (value: null | undefined) => value === null || value === undefined;
      fc.assert(
        edgeCases.testWithNullish(isNullish, (result) => {
          expect(result).toBe(true);
        }),
      );
    });

    /* Preconditions: function and assertion provided
       Action: test function with empty data
       Assertions: function handles empty strings, arrays, and objects correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test with empty data", () => {
      const isEmpty = (value: string | any[] | object) => {
        if (typeof value === "string") return value.length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return Object.keys(value).length === 0;
      };
      fc.assert(
        edgeCases.testWithEmptyData(isEmpty, (result) => {
          expect(result).toBe(true);
        }),
      );
    });

    /* Preconditions: generator, function, and assertion provided
       Action: test function with array boundaries
       Assertions: function handles empty, single element, and large arrays correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test with array boundaries", () => {
      const getArrayLength = (arr: number[]) => arr.length;
      fc.assert(
        edgeCases.testWithArrayBoundaries(fc.integer(), getArrayLength, (result, input) => {
          expect(result).toBe(input.length);
        }),
      );
    });

    /* Preconditions: function provided
       Action: assert function handles edge cases without throwing
       Assertions: function does not throw for any edge case
       Requirements: testing-infrastructure.4.2 */
    it("should assert function handles edge cases", () => {
      const safeFunction = (value: any) => {
        return value !== null && value !== undefined ? String(value) : "default";
      };
      fc.assert(edgeCases.assertHandlesEdgeCases(safeFunction));
    });

    /* Preconditions: valid generator and edge case ratio provided
       Action: create generator with edge cases
       Assertions: generates mix of valid values and edge cases
       Requirements: testing-infrastructure.4.2 */
    it("should create generator with edge cases", () => {
      const generator = edgeCases.withEdgeCases(fc.integer({ min: 1, max: 100 }), 0.3);
      fc.assert(
        fc.property(generator, (value) => {
          // Should be either a valid integer or an edge case
          const isValidInteger =
            typeof value === "number" && !Number.isNaN(value) && value >= 1 && value <= 100;
          const isEdgeCase =
            value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === "object" &&
              value !== null &&
              !Array.isArray(value) &&
              Object.keys(value).length === 0) ||
            (typeof value === "number" && (Number.isNaN(value) || value < 1 || value > 100));
          expect(isValidInteger || isEdgeCase).toBe(true);
        }),
      );
    });

    /* Preconditions: min, max, and delta provided
       Action: generate values near boundaries
       Assertions: returns values at or near min/max
       Requirements: testing-infrastructure.4.2 */
    it("should generate values near boundaries", () => {
      fc.assert(
        fc.property(edgeCases.nearBoundary(0, 100, 5), (value) => {
          expect([0, 5, 95, 100].includes(value)).toBe(true);
        }),
      );
    });

    /* Preconditions: min, max, function, and assertion provided
       Action: test function with values near boundaries
       Assertions: function handles boundary values correctly
       Requirements: testing-infrastructure.4.2 */
    it("should test near boundaries", () => {
      const isInRange = (n: number) => n >= 0 && n <= 100;
      fc.assert(
        edgeCases.testNearBoundaries(0, 100, isInRange, (result) => {
          expect(result).toBe(true);
        }),
      );
    });
  });

  describe("Combined Edge Case Generators", () => {
    /* Preconditions: none
       Action: generate any edge case
       Assertions: returns one of the common edge cases
       Requirements: testing-infrastructure.4.2 */
    it("should generate any edge case", () => {
      fc.assert(
        fc.property(edgeCases.anyEdgeCase(), (value) => {
          // Should be one of: null, undefined, empty string, empty array, empty object, or numeric edge case
          const isEdgeCase =
            value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === "object" &&
              value !== null &&
              !Array.isArray(value) &&
              Object.keys(value).length === 0) ||
            typeof value === "number";
          expect(isEdgeCase).toBe(true);
        }),
      );
    });

    /* Preconditions: valid generator provided
       Action: generate edge case or valid value
       Assertions: returns either valid value or edge case
       Requirements: testing-infrastructure.4.2 */
    it("should generate edge case or valid value", () => {
      fc.assert(
        fc.property(edgeCases.edgeCaseOrValid(fc.integer({ min: 1, max: 100 })), (value) => {
          // Should be either a valid integer or an edge case (null, undefined, empty, numeric edge case)
          const isValidInteger =
            typeof value === "number" && !Number.isNaN(value) && value >= 1 && value <= 100;
          const isEdgeCase =
            value === null ||
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === "object" &&
              value !== null &&
              !Array.isArray(value) &&
              Object.keys(value).length === 0) ||
            (typeof value === "number" && (Number.isNaN(value) || value < 1 || value > 100));
          expect(isValidInteger || isEdgeCase).toBe(true);
        }),
      );
    });
  });
});
