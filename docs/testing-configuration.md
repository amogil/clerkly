# Testing Configuration Guide

This document provides comprehensive information about the unified testing configuration system for the Clerky application.

## Overview

The unified testing configuration consolidates all testing-related settings into a single, maintainable system that supports:

- Unit testing with Vitest
- Functional testing with Playwright
- Property-based testing with fast-check
- Code coverage tracking
- CI/CD integration
- Comprehensive reporting

## Configuration Files

### Primary Configuration Files

| File                                    | Purpose                              | Requirements                              |
| --------------------------------------- | ------------------------------------ | ----------------------------------------- |
| `tests/test.config.ts`                  | Unified test configuration           | testing-infrastructure.1.1, 1.4, 5.1, 5.2 |
| `vitest.config.ts`                      | Vitest-specific configuration        | testing-infrastructure.1.1                |
| `tests/functional/playwright.config.ts` | Playwright-specific configuration    | testing-infrastructure.5.1                |
| `tests/fast-check.config.ts`            | Property-based testing configuration | testing-infrastructure.3.1, 3.2           |
| `tests/setup.ts`                        | Global test setup and mocks          | testing-infrastructure.2.1-2.4            |

### Supporting Files

| File                               | Purpose                               |
| ---------------------------------- | ------------------------------------- |
| `scripts/test-runner.ts`           | Unified test execution script         |
| `tests/reporting/test-reporter.ts` | Test result aggregation and reporting |
| `.github/workflows/test.yml`       | CI/CD workflow configuration          |

## Unified Configuration Structure

### Configuration Interface

```typescript
interface UnifiedTestConfig {
  unit: UnitTestConfig; // Unit test settings
  functional: FunctionalTestConfig; // Functional test settings
  coverage: CoverageConfig; // Coverage requirements
  reporting: ReportingConfig; // Report generation settings
  ci: CIConfig; // CI/CD specific settings
}
```

### Unit Test Configuration

```typescript
{
  framework: "vitest",
  testPattern: [
    "tests/requirements/**/*.test.ts",
    "tests/unit/**/*.test.ts",
    "tests/utils/**/*.test.ts",
    "tests/mocks/**/*.test.ts",
    "tests/examples/**/*.test.ts",
    "src/**/*.test.ts"
  ],
  setupFiles: ["./tests/setup.ts"],
  mockStrategy: "auto",
  propertyBasedTesting: {
    enabled: true,
    library: "fast-check",
    iterations: 100,
    shrinking: true
  },
  timeout: 10000,
  environment: "node"
}
```

**Key Features:**

- Automatic discovery of test files
- Global setup for mocks and configuration
- Property-based testing integration
- Node environment for Electron main/preload process testing

### Functional Test Configuration

```typescript
{
  framework: "playwright",
  browsers: ["chromium", "firefox", "webkit"],
  timeout: 60000,
  retries: 2,
  parallelism: 4,
  headless: true,
  screenshots: "only-on-failure",
  video: "retain-on-failure",
  trace: "retain-on-failure"
}
```

**Key Features:**

- Multi-browser testing support
- Automatic retry on failure
- Parallel test execution
- Failure artifacts (screenshots, videos, traces)

### Coverage Configuration

```typescript
{
  enabled: true,
  provider: "v8",
  reporter: ["text", "json", "html", "lcov"],
  threshold: {
    statements: 85,
    branches: 85,
    functions: 85,
    lines: 85
  },
  exclude: [
    "node_modules/**",
    "dist/**",
    "tests/**",
    "*.config.*",
    "**/*.d.ts",
    "coverage/**",
    "test-results/**"
  ],
  include: [
    "src/**/*.ts",
    "main.ts",
    "preload.ts"
  ]
}
```

**Key Features:**

- 85% minimum coverage threshold (per requirements)
- Multiple report formats
- Intelligent exclusions
- Focus on application code

### Reporting Configuration

```typescript
{
  unit: {
    reporters: ["default", "json", "html"],
    outputDir: "test-results/unit"
  },
  functional: {
    reporters: [
      ["list"],
      ["html", { outputFolder: "test-results/functional" }],
      ["json", { outputFile: "test-results/functional/results.json" }]
    ],
    outputDir: "test-results/functional"
  },
  coverage: {
    outputDir: "coverage",
    formats: ["text", "json", "html", "lcov"]
  }
}
```

**Key Features:**

- Separate output directories for each test type
- Multiple report formats for different consumers
- Machine-readable JSON for CI integration
- Human-readable HTML for local development

### CI/CD Configuration

```typescript
{
  enabled: process.env.CI === "true",
  parallel: true,
  maxWorkers: process.env.CI === "true" ? 2 : 4,
  retries: process.env.CI === "true" ? 3 : 2,
  failFast: false,
  collectCoverage: true,
  uploadArtifacts: true
}
```

**Key Features:**

- Environment-aware configuration
- Reduced parallelism in CI for stability
- Increased retries in CI for flaky test handling
- Automatic artifact collection

## Environment-Specific Configurations

### Development Environment

```typescript
const devConfig = getConfigForEnvironment("development");
```

**Characteristics:**

- Headed browser mode (visible UI)
- Serial test execution (1 worker)
- No retries (fail fast for quick feedback)
- CI features disabled

**Use Case:** Local development and debugging

### CI Environment

```typescript
const ciConfig = getConfigForEnvironment("ci");
```

**Characteristics:**

- Headless browser mode
- Limited parallelism (2 workers)
- Increased retries (3 attempts)
- All CI features enabled

**Use Case:** Continuous integration pipelines

### Production Environment

```typescript
const prodConfig = getConfigForEnvironment("production");
```

**Characteristics:**

- Headless browser mode
- Full parallelism (4 workers)
- Standard retries (2 attempts)
- Coverage collection enabled

**Use Case:** Release validation and quality gates

## Using the Configuration

### Accessing Configuration

```typescript
import { unifiedTestConfig } from "./tests/test.config";

// Access specific configurations
const unitConfig = unifiedTestConfig.unit;
const functionalConfig = unifiedTestConfig.functional;
const coverageConfig = unifiedTestConfig.coverage;
```

### Validating Configuration

```typescript
import { validateTestConfig } from "./tests/test.config";

try {
  validateTestConfig(unifiedTestConfig);
  console.log("Configuration is valid");
} catch (error) {
  console.error("Configuration error:", error.message);
}
```

### Converting to Framework-Specific Configs

```typescript
import { getVitestConfig, getPlaywrightConfig } from "./tests/test.config";

// Get Vitest configuration
const vitestConfig = getVitestConfig();

// Get Playwright configuration
const playwrightConfig = getPlaywrightConfig();
```

## NPM Scripts

### Test Execution Scripts

| Script                           | Description                        | Use Case               |
| -------------------------------- | ---------------------------------- | ---------------------- |
| `npm test`                       | Run all unit tests                 | Quick validation       |
| `npm run test:unit`              | Run unit tests with coverage       | Development            |
| `npm run test:unit:watch`        | Run unit tests in watch mode       | Active development     |
| `npm run test:property`          | Run property-based tests           | Property validation    |
| `npm run test:functional`        | Run functional tests               | E2E validation         |
| `npm run test:functional:headed` | Run functional tests with UI       | Debugging              |
| `npm run test:functional:debug`  | Run functional tests in debug mode | Step-through debugging |
| `npm run test:all`               | Run all test types                 | Complete validation    |
| `npm run test:all:coverage`      | Run all tests with reporting       | Pre-commit check       |

### Browser-Specific Scripts

| Script                             | Description                |
| ---------------------------------- | -------------------------- |
| `npm run test:functional:chromium` | Run tests in Chromium only |
| `npm run test:functional:firefox`  | Run tests in Firefox only  |
| `npm run test:functional:webkit`   | Run tests in WebKit only   |

### Execution Mode Scripts

| Script                             | Description        |
| ---------------------------------- | ------------------ |
| `npm run test:functional:parallel` | Run with 4 workers |
| `npm run test:functional:serial`   | Run with 1 worker  |

### Reporting Scripts

| Script                | Description                     |
| --------------------- | ------------------------------- |
| `npm run test:report` | Generate unified test report    |
| `npm run test:ci`     | Run all tests with CI reporting |

### Validation Scripts

| Script                 | Description                   |
| ---------------------- | ----------------------------- |
| `npm run validate`     | Run complete validation suite |
| `npm run lint`         | Run ESLint                    |
| `npm run format:check` | Check Prettier formatting     |

## Configuration Validation Rules

The configuration system enforces the following rules:

### Coverage Thresholds

- All coverage metrics (statements, branches, functions, lines) must be ≥ 85%
- Enforced at: Configuration load time and test execution

### Property-Based Testing

- Minimum 100 iterations per property test
- Shrinking must be enabled
- Enforced at: Configuration load time

### Functional Testing

- Minimum timeout of 30 seconds
- At least one browser must be configured
- Enforced at: Configuration load time

### Test Patterns

- Unit test files must match configured patterns
- Functional tests must be in `tests/functional/`
- Enforced at: Test discovery time

## Extending the Configuration

### Adding New Test Types

1. Define interface in `tests/test.config.ts`:

```typescript
export interface NewTestConfig {
  // Configuration properties
}
```

2. Add to unified configuration:

```typescript
export interface UnifiedTestConfig {
  // ... existing configs
  newTest: NewTestConfig;
}
```

3. Implement validation:

```typescript
export function validateTestConfig(config: UnifiedTestConfig): boolean {
  // ... existing validations
  // Add new validation logic
}
```

### Adding Environment Configurations

```typescript
export function getConfigForEnvironment(
  env: "development" | "ci" | "production" | "staging",
): UnifiedTestConfig {
  const baseConfig = { ...unifiedTestConfig };

  switch (env) {
    case "staging":
      return {
        ...baseConfig,
        // Staging-specific overrides
      };
    // ... other cases
  }
}
```

### Customizing Coverage Rules

```typescript
const customConfig = {
  ...unifiedTestConfig,
  coverage: {
    ...unifiedTestConfig.coverage,
    threshold: {
      statements: 90, // Increase threshold
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};
```

## Troubleshooting

### Configuration Not Loading

**Problem:** Configuration file not found or invalid

**Solution:**

```bash
# Verify file exists
ls -la tests/test.config.ts

# Check for syntax errors
npm run build
```

### Coverage Threshold Failures

**Problem:** Tests pass but coverage check fails

**Solution:**

```bash
# Generate detailed coverage report
npm run test:unit

# Open HTML report
open coverage/index.html

# Identify uncovered code and add tests
```

### Functional Tests Timing Out

**Problem:** Tests exceed timeout limit

**Solution:**

```typescript
// Increase timeout in configuration
const customConfig = {
  ...unifiedTestConfig,
  functional: {
    ...unifiedTestConfig.functional,
    timeout: 120000, // 2 minutes
  },
};
```

### CI Configuration Not Applied

**Problem:** CI-specific settings not being used

**Solution:**

```bash
# Verify CI environment variable
echo $CI

# Set CI variable
export CI=true

# Run tests
npm run test:ci
```

## Best Practices

### Configuration Management

1. **Single Source of Truth**: Always use `unifiedTestConfig` as the base
2. **Environment Awareness**: Use `getConfigForEnvironment()` for environment-specific needs
3. **Validation First**: Always validate configuration before use
4. **Immutability**: Create new config objects instead of mutating existing ones

### Test Organization

1. **Follow Patterns**: Place tests according to configured patterns
2. **Use Setup Files**: Leverage global setup for common initialization
3. **Mock Consistently**: Use the mock system defined in setup
4. **Report Properly**: Ensure tests output to configured directories

### Performance Optimization

1. **Parallel Execution**: Use configured parallelism settings
2. **Selective Testing**: Run only necessary test types during development
3. **Watch Mode**: Use watch mode for active development
4. **CI Optimization**: Use CI-specific configuration for stability

## References

- [Testing Infrastructure Requirements](../.kiro/specs/testing-infrastructure/requirements.md)
- [Testing Infrastructure Design](../.kiro/specs/testing-infrastructure/design.md)
- [Testing README](../tests/README.md)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [fast-check Documentation](https://fast-check.dev/)
