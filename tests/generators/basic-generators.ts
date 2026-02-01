// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2
import { fc } from "@fast-check/vitest";

/**
 * Basic generators for common data types used in property-based testing
 */

// String generators
export const nonEmptyString = () => fc.string({ minLength: 1, maxLength: 100 });
export const alphanumericString = () =>
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s));
export const filename = () =>
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s));
export const filepath = () =>
  fc.array(filename(), { minLength: 1, maxLength: 5 }).map((parts) => parts.join("/"));

// Number generators
export const positiveInteger = () => fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER });
export const percentage = () => fc.integer({ min: 0, max: 100 });
export const port = () => fc.integer({ min: 1024, max: 65535 });
export const timestamp = () => fc.integer({ min: 0, max: Date.now() + 365 * 24 * 60 * 60 * 1000 });

// Boolean and option generators
export const optionalString = () => fc.option(nonEmptyString());
export const optionalNumber = () => fc.option(positiveInteger());

// Array generators
export const stringArray = () => fc.array(nonEmptyString(), { minLength: 0, maxLength: 10 });
export const numberArray = () => fc.array(positiveInteger(), { minLength: 0, maxLength: 10 });

// Object generators
export const keyValuePair = () =>
  fc.record({
    key: nonEmptyString(),
    value: fc.oneof(nonEmptyString(), positiveInteger(), fc.boolean()),
  });

export const simpleObject = () =>
  fc.dictionary(alphanumericString(), fc.oneof(nonEmptyString(), positiveInteger(), fc.boolean()));

// Error generators
export const errorMessage = () => fc.string({ minLength: 1, maxLength: 200 });
export const httpStatusCode = () => fc.constantFrom(200, 201, 400, 401, 403, 404, 500, 502, 503);

// Date and time generators
export const futureDate = () =>
  fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) });
export const pastDate = () =>
  fc.date({ min: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), max: new Date() });
export const anyDate = () => fc.date();

// URL and network generators
export const url = () => fc.webUrl();
export const email = () => fc.emailAddress();
export const ipAddress = () => fc.ipV4();

// File system generators
export const fileExtension = () => fc.constantFrom(".ts", ".js", ".json", ".md", ".txt", ".log");
export const fileWithExtension = () =>
  fc
    .record({
      name: filename(),
      extension: fileExtension(),
    })
    .map(({ name, extension }) => `${name}${extension}`);

// Configuration value generators
export const configValue = () =>
  fc.oneof(nonEmptyString(), positiveInteger(), fc.boolean(), stringArray(), simpleObject());
