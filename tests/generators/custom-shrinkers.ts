// Requirements: testing-infrastructure.3.3
/**
 * Custom shrinking strategies for domain-specific objects
 *
 * Fast-check provides automatic shrinking, but for complex domain objects,
 * custom shrinking strategies can provide better minimal counterexamples.
 */

import { fc } from "@fast-check/vitest";

/**
 * Custom arbitrary with enhanced shrinking for user profiles
 * Shrinks to minimal valid user profile when property fails
 */
export const userProfileWithShrinking = () => {
  return fc
    .record({
      id: fc.uuid(),
      email: fc.emailAddress(),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      picture: fc.option(fc.webUrl()),
    })
    .map(
      (profile) => profile,
      (profile) => {
        // Custom shrinking: try simpler values first
        return [
          // Shrink to minimal valid profile
          {
            id: "00000000-0000-0000-0000-000000000000",
            email: "a@b.c",
            name: "A",
            picture: undefined,
          },
          // Shrink name to single character
          { ...profile, name: "A" },
          // Remove optional picture
          { ...profile, picture: undefined },
          // Shrink email to minimal
          { ...profile, email: "a@b.c" },
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for auth tokens
 * Shrinks to minimal token structure when property fails
 */
export const authTokensWithShrinking = () => {
  return fc
    .record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.option(fc.string({ minLength: 32, maxLength: 128 })),
      expiresAt: fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
      tokenType: fc.constantFrom("Bearer", "bearer"),
    })
    .map(
      (tokens) => tokens,
      (tokens) => {
        // Custom shrinking: try simpler token structures
        return [
          // Shrink to minimal valid tokens
          {
            accessToken: "a".repeat(32),
            refreshToken: undefined,
            expiresAt: 0,
            tokenType: "Bearer" as const,
          },
          // Remove optional refresh token
          { ...tokens, refreshToken: undefined },
          // Shrink to minimal expiration
          { ...tokens, expiresAt: 0 },
          // Shrink access token to minimum length
          { ...tokens, accessToken: "a".repeat(32) },
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for coverage configuration
 * Shrinks to minimal valid coverage thresholds (85%)
 */
export const coverageConfigWithShrinking = () => {
  return fc
    .record({
      branches: fc.integer({ min: 85, max: 100 }),
      functions: fc.integer({ min: 85, max: 100 }),
      lines: fc.integer({ min: 85, max: 100 }),
      statements: fc.integer({ min: 85, max: 100 }),
    })
    .map(
      (config) => config,
      (config) => {
        // Custom shrinking: try minimal valid thresholds
        return [
          // Shrink all to minimum (85%)
          { branches: 85, functions: 85, lines: 85, statements: 85 },
          // Shrink individual thresholds
          { ...config, branches: 85 },
          { ...config, functions: 85 },
          { ...config, lines: 85 },
          { ...config, statements: 85 },
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for IPC parameters
 * Shrinks to simplest valid parameter structure
 */
export const ipcParamsWithShrinking = () => {
  return fc
    .oneof(
      fc.constant(undefined),
      fc.record({ collapsed: fc.boolean() }),
      fc.record({
        key: fc.string({ minLength: 1, maxLength: 50 }),
        value: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      fc.record({ key: fc.string({ minLength: 1, maxLength: 50 }) }),
    )
    .map(
      (params) => params,
      (params) => {
        // Custom shrinking: try simpler parameter structures
        if (params === undefined) return [undefined];

        const shrunk: any[] = [undefined]; // Always try undefined first

        if ("collapsed" in params) {
          shrunk.push({ collapsed: false }); // Shrink to false
        }

        if ("key" in params && "value" in params) {
          shrunk.push({ key: "a", value: "b" }); // Minimal key-value
          shrunk.push({ key: params.key }); // Remove value
        }

        if ("key" in params && !("value" in params)) {
          shrunk.push({ key: "a" }); // Minimal key
        }

        return shrunk;
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for network errors
 * Shrinks to simplest error structure
 */
export const networkErrorWithShrinking = () => {
  return fc
    .record({
      code: fc.constantFrom("ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"),
      message: fc.string({ minLength: 1, maxLength: 200 }),
      status: fc.option(fc.integer({ min: 400, max: 599 })),
    })
    .map(
      (error) => error,
      (error) => {
        // Custom shrinking: try simpler error structures
        return [
          // Minimal error
          { code: "ECONNREFUSED" as const, message: "E", status: undefined },
          // Remove optional status
          { ...error, status: undefined },
          // Shrink message to single character
          { ...error, message: "E" },
          // Shrink status to minimum
          error.status ? { ...error, status: 400 } : error,
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for test file paths
 * Shrinks to simplest valid file path
 */
export const testFilePathWithShrinking = () => {
  return fc
    .record({
      directory: fc.constantFrom(
        "src",
        "src/components",
        "src/services",
        "src/utils",
        "tests/unit",
        "tests/functional",
      ),
      filename: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
      extension: fc.constantFrom(".ts", ".test.ts", ".spec.ts"),
    })
    .map(
      ({ directory, filename, extension }) => `${directory}/${filename}${extension}`,
      (filePath) => {
        // Custom shrinking: try simpler file paths
        const parts = filePath.split("/");
        const filename = parts[parts.length - 1];

        return [
          // Minimal path
          "src/a.ts",
          // Shrink to root directory
          `src/${filename}`,
          // Shrink filename to single character
          `${parts.slice(0, -1).join("/")}/a.ts`,
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for sidebar state
 * Shrinks to default state
 */
export const sidebarStateWithShrinking = () => {
  return fc
    .record({
      collapsed: fc.boolean(),
      activeSection: fc.option(
        fc.constantFrom("dashboard", "settings", "profile", "help", "about"),
      ),
    })
    .map(
      (state) => state,
      (state) => {
        // Custom shrinking: try default state
        return [
          // Default state
          { collapsed: false, activeSection: undefined },
          // Shrink to no active section
          { ...state, activeSection: undefined },
          // Shrink to not collapsed
          { ...state, collapsed: false },
        ];
      },
    );
};

/**
 * Custom arbitrary with enhanced shrinking for mock responses
 * Shrinks to minimal valid response
 */
export const mockResponseWithShrinking = () => {
  return fc
    .record({
      status: fc.integer({ min: 200, max: 599 }),
      data: fc.oneof(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.object(),
        fc.array(fc.anything()),
      ),
      headers: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }),
      ),
    })
    .map(
      (response) => response,
      (response) => {
        // Custom shrinking: try simpler responses
        return [
          // Minimal response
          { status: 200, data: "", headers: {} },
          // Shrink to success status
          { ...response, status: 200 },
          // Shrink data to empty
          { ...response, data: "" },
          // Shrink headers to empty
          { ...response, headers: {} },
        ];
      },
    );
};

/**
 * Utility function to create custom shrinking strategy
 * Allows defining custom shrinking logic for any arbitrary
 */
export const withCustomShrinking = <T>(
  arbitrary: fc.Arbitrary<T>,
  shrinkFn: (value: T) => T[],
): fc.Arbitrary<T> => {
  return arbitrary.map(
    (value) => value,
    (value) => shrinkFn(value),
  );
};

/**
 * Example shrinking strategies for common patterns
 */
export const shrinkingStrategies = {
  // Shrink to empty/minimal values
  toMinimal: <T extends object>(value: T, minimalValue: T): T[] => {
    return [minimalValue, value];
  },

  // Shrink by removing optional fields
  removeOptionals: <T extends object>(value: T): Partial<T>[] => {
    const keys = Object.keys(value) as (keyof T)[];
    return keys.map((key) => {
      const copy = { ...value };
      delete copy[key];
      return copy;
    });
  },

  // Shrink numeric values towards zero
  towardsZero: (value: number): number[] => {
    if (value === 0) return [0];
    const half = Math.floor(value / 2);
    return [0, half, value];
  },

  // Shrink strings to shorter versions
  shorterStrings: (value: string): string[] => {
    if (value.length <= 1) return [value];
    const half = value.substring(0, Math.floor(value.length / 2));
    return ["", half, value];
  },

  // Shrink arrays to smaller sizes
  smallerArrays: <T>(value: T[]): T[][] => {
    if (value.length === 0) return [[]];
    const half = value.slice(0, Math.floor(value.length / 2));
    return [[], half, value];
  },
};
