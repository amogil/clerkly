# Testing Infrastructure

Comprehensive testing infrastructure for the Clerky application, providing unit tests, functional tests, and property-based tests with unified configuration and reporting.

## Overview

This testing infrastructure implements:

- **Unit Testing**: Vitest-based unit tests with 85%+ code coverage
- **Functional Testing**: Playwright-based end-to-end tests across multiple browsers
- **Property-Based Testing**: fast-check integration for testing universal properties
- **Mock System**: Comprehensive mocking for external dependencies
- **Unified Configuration**: Single source of truth for all test configurations
- **Comprehensive Reporting**: Aggregated test results and coverage reports

## Requirements

- Node.js 25.5.0
- npm 11.8.0
- macOS (for Electron testing)

## Quick Start

```bash
# Run all tests
npm run test:all

# Run unit tests with coverage
npm run test:unit

# Run functional tests
npm run test:functional

# Run property-based tests
npm run test:property

# Generate unified test report
npm run test:report

# Run complete CI validation
npm run validate
```

## Directory Structure

```
tests/
├── examples/              # Example tests demonstrating patterns
├── functional/            # Playwright functional tests
│   ├── fixtures/         # Test fixtures and helpers
│   ├── utils/            # Functional test utilities
│   └── playwright.config.ts
├── generators/            # fast-check generators for property tests
├── mocks/                # Mock implementations for external dependencies
├── reporting/            # Test reporting system
├── requirements/         # Requirement-based tests
├── unit/                 # Unit tests
├── utils/                # Test utilities and helpers
├── fast-check.config.ts  # Property-based testing configuration
├── setup.ts              # Global test setup
└── test.config.ts        # Unified test configuration
```

## Test Types

### Unit Tests

Unit tests verify individual components in isolation using Vitest.

**Location**: `tests/unit/`, `src/**/*.test.ts`

**Run**: `npm run test:unit`

**Features**:

- Automatic mocking of external dependencies
- 85%+ code coverage requirement
- Fast execution (< 5 seconds)
- Parallel execution enabled

**Example**:

```typescript
/* Preconditions: mock database is empty
   Action: call function with valid input
   Assertions: returns expected result
   Requirements: testing-infrastructure.1.1 */
it("should process valid input", () => {
  const result = processInput("valid");
  expect(result).toBe("processed");
});
```

### Functional Tests

Functional tests verify user workflows through the UI using Playwright.

**Location**: `tests/functional/`

**Run**: `npm run test:functional`

**Features**:

- Multi-browser support (Chromium, Firefox, WebKit)
- Automatic screenshots on failure
- Video recording for failed tests
- Test isolation with automatic cleanup

**Example**:

```typescript
test("user can navigate to settings", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-testid="settings-link"]');
  await expect(page).toHaveURL("/settings");
});
```

### Property-Based Tests

Property-based tests verify universal properties across many generated inputs using fast-check.

**Location**: `tests/requirements/*-pbt.test.ts`

**Run**: `npm run test:property`

**Features**:

- Minimum 100 iterations per property
- Automatic shrinking of counterexamples
- Custom generators for domain objects
- Configurable test strategies

**Example**:

```typescript
/* Feature: testing-infrastructure, Property 5: Property-based testing
   Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2 */
it("should maintain invariant for all inputs", () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const result = transform(input);
      return result.length >= input.length;
    }),
    { numRuns: 100 },
  );
});
```

## Configuration

### Unified Configuration

All test configurations are centralized in `tests/test.config.ts`:

```typescript
import { unifiedTestConfig } from "./tests/test.config";

// Access configuration
const unitConfig = unifiedTestConfig.unit;
const functionalConfig = unifiedTestConfig.functional;
const coverageConfig = unifiedTestConfig.coverage;
```

### Environment-Specific Configuration

```typescript
import { getConfigForEnvironment } from "./tests/test.config";

// Get configuration for specific environment
const devConfig = getConfigForEnvironment("development");
const ciConfig = getConfigForEnvironment("ci");
const prodConfig = getConfigForEnvironment("production");
```

## Coverage Requirements

All code must meet minimum coverage thresholds:

- **Statements**: 85%
- **Branches**: 85%
- **Functions**: 85%
- **Lines**: 85%

Coverage reports are generated in:

- `coverage/` - HTML and JSON reports
- `test-results/` - Test execution results

## Mock System

The mock system provides isolated testing of external dependencies:

### File System Mock

```typescript
import { fileSystemMock } from "./tests/mocks";

fileSystemMock.setMockData("/path/to/file", "content");
const content = fileSystemMock.readFileSync("/path/to/file");
```

### Network Mock

```typescript
import { networkMock } from "./tests/mocks";

networkMock.mockResponse("https://api.example.com", { data: "test" });
```

### Database Mock

```typescript
import { databaseMock } from "./tests/mocks";

databaseMock.mockQuery("SELECT * FROM users", [{ id: 1, name: "Test" }]);
```

### IPC Mock

```typescript
import { ipcMock } from "./tests/mocks";

ipcMock.mockHandler("channel-name", async (data) => ({ success: true }));
```

## Test Reporting

### Generate Unified Report

```bash
npm run test:report
```

This generates:

- `test-results/unified-report.json` - Machine-readable JSON report
- `test-results/unified-report.md` - Human-readable Markdown report

### Report Contents

- Test execution summary (passed/failed/skipped)
- Coverage metrics with threshold comparison
- Detailed failure information
- Performance metrics (duration)
- Environment information

## CI/CD Integration

### GitHub Actions

The project includes a comprehensive CI workflow (`.github/workflows/test.yml`) that:

1. Runs unit tests with coverage
2. Runs property-based tests
3. Runs functional tests across all browsers
4. Checks coverage thresholds
5. Validates code quality (ESLint, Prettier)
6. Verifies build success
7. Uploads test artifacts and coverage reports

### Running CI Locally

```bash
# Run complete validation (same as CI)
npm run validate

# Run all tests with reporting
npm run test:ci
```

## Best Practices

### Writing Unit Tests

1. **Use descriptive test names**: Clearly describe what is being tested
2. **Follow the AAA pattern**: Arrange, Act, Assert
3. **Test one thing per test**: Keep tests focused and simple
4. **Use proper test structure**: Include Preconditions, Action, Assertions, Requirements
5. **Mock external dependencies**: Ensure tests are isolated and fast

### Writing Functional Tests

1. **Use data-testid attributes**: Make selectors stable and maintainable
2. **Test user workflows**: Focus on real user scenarios
3. **Handle async operations**: Use proper waits and assertions
4. **Clean up after tests**: Ensure test isolation
5. **Use page objects**: Encapsulate page interactions

### Writing Property Tests

1. **Define clear properties**: State what should always be true
2. **Use appropriate generators**: Match input types to domain
3. **Set sufficient iterations**: Minimum 100, more for critical logic
4. **Handle shrinking**: Ensure counterexamples are minimal
5. **Document properties**: Link to design document properties

## Troubleshooting

### Tests Failing Locally

```bash
# Clean and rebuild
npm run build

# Clear test cache
rm -rf node_modules/.vitest
rm -rf test-results

# Run tests with verbose output
npm run test:unit -- --reporter=verbose
npm run test:functional -- --reporter=list
```

### Coverage Not Meeting Thresholds

```bash
# Generate detailed coverage report
npm run test:unit

# Open HTML coverage report
open coverage/index.html
```

### Functional Tests Timing Out

```bash
# Run in headed mode to see what's happening
npm run test:functional:headed

# Run with debug mode
npm run test:functional:debug

# Increase timeout in playwright.config.ts
```

## Contributing

When adding new tests:

1. Follow the test structure guidelines in AGENTS.md
2. Include requirement references in comments
3. Ensure tests are isolated and repeatable
4. Add appropriate mocks for external dependencies
5. Update this README if adding new test patterns
6. Run `npm run validate` before committing

## References

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [fast-check Documentation](https://fast-check.dev/)
- [Testing Infrastructure Design](../.kiro/specs/testing-infrastructure/design.md)
- [Testing Infrastructure Requirements](../.kiro/specs/testing-infrastructure/requirements.md)
