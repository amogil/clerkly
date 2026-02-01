// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2
import { fc } from "@fast-check/vitest";
import {
  nonEmptyString,
  positiveInteger,
  percentage,
  timestamp,
  email,
  url,
} from "./basic-generators";

/**
 * Domain-specific generators for application entities and business objects
 */

// User and authentication generators
export const userId = () => fc.uuid();
export const accessToken = () => fc.string({ minLength: 32, maxLength: 128 });
export const refreshToken = () => fc.string({ minLength: 32, maxLength: 128 });

export const userProfile = () =>
  fc.record({
    id: userId(),
    email: email(),
    name: nonEmptyString(),
    picture: fc.option(url()),
  });

export const authTokens = () =>
  fc.record({
    accessToken: accessToken(),
    refreshToken: fc.option(refreshToken()),
    expiresAt: timestamp(),
    tokenType: fc.constantFrom("Bearer", "bearer"),
  });

export const oauthState = () => fc.string({ minLength: 32, maxLength: 64 });

// IPC and communication generators
export const ipcChannel = () =>
  fc.constantFrom(
    "auth:open-google",
    "auth:get-state",
    "auth:sign-out",
    "sidebar:get-state",
    "sidebar:set-state",
    "storage:get",
    "storage:set",
    "storage:delete",
  );

export const ipcParams = () =>
  fc.oneof(
    fc.constant(undefined),
    fc.record({ collapsed: fc.boolean() }),
    fc.record({ key: nonEmptyString(), value: nonEmptyString() }),
    fc.record({ key: nonEmptyString() }),
  );

// Database and storage generators
export const databaseKey = () => nonEmptyString();
export const databaseValue = () =>
  fc.oneof(nonEmptyString(), positiveInteger(), fc.boolean(), fc.constant(null));

export const storageEntry = () =>
  fc.record({
    key: databaseKey(),
    value: databaseValue(),
  });

// UI and navigation generators
export const navigationSection = () =>
  fc.constantFrom("dashboard", "settings", "profile", "help", "about");

export const sidebarState = () =>
  fc.record({
    collapsed: fc.boolean(),
    activeSection: fc.option(navigationSection()),
  });

// Configuration generators
export const coverageThreshold = () => fc.integer({ min: 85, max: 100 });

export const coverageConfig = () =>
  fc.record({
    branches: coverageThreshold(),
    functions: coverageThreshold(),
    lines: coverageThreshold(),
    statements: coverageThreshold(),
  });

export const testConfig = () =>
  fc.record({
    timeout: fc.integer({ min: 1000, max: 30000 }),
    retries: fc.integer({ min: 0, max: 3 }),
    coverage: coverageConfig(),
  });

// File system and path generators
export const testFilePath = () =>
  fc
    .record({
      directory: fc.constantFrom(
        "src",
        "src/components",
        "src/services",
        "src/utils",
        "src/auth",
        "tests/unit",
        "tests/functional",
      ),
      filename: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
      extension: fc.constantFrom(".ts", ".test.ts", ".spec.ts"),
    })
    .map(({ directory, filename, extension }) => `${directory}/${filename}${extension}`);

// Error and exception generators
export const networkError = () =>
  fc.record({
    code: fc.constantFrom("ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"),
    message: nonEmptyString(),
    status: fc.option(fc.integer({ min: 400, max: 599 })),
  });

export const validationError = () =>
  fc.record({
    field: nonEmptyString(),
    message: nonEmptyString(),
    code: fc.constantFrom("REQUIRED", "INVALID_FORMAT", "OUT_OF_RANGE", "DUPLICATE"),
  });

// Mock data generators
export const mockResponse = () =>
  fc.record({
    status: fc.integer({ min: 200, max: 599 }),
    data: fc.oneof(nonEmptyString(), fc.object(), fc.array(fc.anything())),
    headers: fc.dictionary(nonEmptyString(), nonEmptyString()),
  });

export const mockRequest = () =>
  fc.record({
    method: fc.constantFrom("GET", "POST", "PUT", "DELETE", "PATCH"),
    url: url(),
    headers: fc.option(fc.dictionary(nonEmptyString(), nonEmptyString())),
    body: fc.option(fc.oneof(nonEmptyString(), fc.object())),
  });

// Property-based test configuration
export const pbtConfig = () =>
  fc.record({
    numRuns: fc.integer({ min: 100, max: 1000 }),
    timeout: fc.integer({ min: 5000, max: 30000 }),
    seed: fc.option(positiveInteger()),
    path: fc.option(nonEmptyString()),
    examples: fc.option(fc.array(fc.anything(), { maxLength: 10 })),
  });
