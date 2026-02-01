# Continuous Integration Configuration

## Overview

This document describes the continuous integration (CI) system configured for the project. The CI system automatically runs tests, checks code coverage, and validates code quality on every push and pull request.

## CI Workflow

The CI workflow is defined in `.github/workflows/test.yml` and consists of the following jobs:

### 1. Unit Tests

**Purpose**: Run all unit tests with code coverage collection

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Run unit tests with coverage (`npm run test:unit`)
- Upload coverage reports to Codecov
- Upload test results as artifacts

**Coverage Requirements**:

- Statements: ≥ 85%
- Branches: ≥ 85%
- Functions: ≥ 85%
- Lines: ≥ 85%

### 2. Property-Based Tests

**Purpose**: Run property-based tests to verify system properties across generated inputs

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Run property-based tests (`npm test -- tests/requirements/**/*-pbt.test.ts`)
- Upload test results as artifacts

**Configuration**:

- Minimum iterations: 100 per property test
- Shrinking enabled for minimal counterexamples
- Uses fast-check library

### 3. Functional Tests

**Purpose**: Run end-to-end functional tests across multiple browsers

**Strategy**: Matrix strategy testing on Chromium, Firefox, and WebKit

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Install Playwright browsers
- Build application
- Run functional tests for specific browser
- Upload test results, screenshots (on failure), and videos (on failure)

**Configuration**:

- Browsers: Chromium, Firefox, WebKit
- Retries: 2 (in CI environment)
- Parallel execution: Enabled
- Headless mode: Enabled

### 4. Coverage Check

**Purpose**: Enforce code coverage thresholds

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Run unit tests with coverage
- Parse coverage summary JSON
- Validate each metric against 85% threshold
- Generate coverage badge
- Upload coverage badge as artifact

**Threshold Enforcement**:
The job fails if ANY of the following metrics fall below 85%:

- Statements coverage
- Branches coverage
- Functions coverage
- Lines coverage

### 5. Lint and Format Check

**Purpose**: Ensure code quality and consistent formatting

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Run ESLint (`npm run lint`)
- Run Prettier check (`npm run format:check`)

### 6. Build Check

**Purpose**: Verify that the application builds successfully

**Steps**:

- Checkout code
- Setup Node.js environment
- Install dependencies
- Build application (`npm run build`)
- Verify build artifacts exist in `dist/` directory

### 7. Test Summary

**Purpose**: Aggregate results from all jobs and provide final status

**Steps**:

- Download coverage badge (if available)
- Display summary of all job results
- Display coverage percentage
- Fail if any job failed
- Display success message if all jobs passed

**Dependencies**: Runs after all other jobs complete (always runs)

## Triggering CI

The CI workflow is triggered on:

1. **Push events** to `main` or `develop` branches
2. **Pull request events** targeting `main` or `develop` branches
3. **Manual trigger** via GitHub Actions UI (`workflow_dispatch`)

## Coverage Reporting

### Codecov Integration

Coverage reports are automatically uploaded to Codecov after unit tests complete. This provides:

- Historical coverage trends
- Coverage diff on pull requests
- Detailed file-by-file coverage analysis

### Local Coverage Reports

Coverage reports are also generated locally in the `coverage/` directory:

- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format for tooling integration
- `coverage/coverage-summary.json` - JSON summary for programmatic access

## Artifacts

The CI system uploads the following artifacts:

1. **unit-test-results**: Results from unit test execution
2. **property-test-results**: Results from property-based test execution
3. **functional-test-results-{browser}**: Results from functional tests per browser
4. **screenshots-{browser}**: Screenshots from failed functional tests
5. **videos-{browser}**: Videos from failed functional tests
6. **coverage-badge**: Text file with coverage percentage

Artifacts are retained for 90 days and can be downloaded from the GitHub Actions UI.

## Environment Configuration

### CI Environment Variables

- `CI=true`: Indicates running in CI environment
- Affects test configuration (retries, parallelism, etc.)

### Node.js Version

- Version: 25.5.0
- Package manager: npm 11.8.0
- Caching: Enabled for faster builds

### Operating System

- Platform: macOS (latest)
- Required for Electron application testing

## Failure Handling

### Automatic Retries

- Functional tests: 2 retries in CI (configurable)
- Property-based tests: No retries (deterministic)
- Unit tests: No retries (should be deterministic)

### Failure Artifacts

On test failure, the following are automatically captured:

- Screenshots of failed functional tests
- Videos of failed functional test sessions
- Test result JSON files
- Error logs and stack traces

### Debugging Failed Tests

1. Check the test summary in the workflow run
2. Download relevant artifacts (screenshots, videos, logs)
3. Review the detailed logs for each failed job
4. Run tests locally to reproduce: `npm run test:all`

## Performance Optimization

### Parallel Execution

- Unit tests: Run in parallel using Vitest threads
- Functional tests: Matrix strategy runs browsers in parallel
- Maximum workers in CI: 2 (to avoid resource contention)

### Caching

- npm dependencies cached by GitHub Actions
- Playwright browsers cached between runs
- Build artifacts cached where applicable

### Selective Test Execution

For faster feedback during development:

- `npm run test:unit` - Run only unit tests
- `npm run test:functional:chromium` - Run functional tests on one browser
- `npm run test:property` - Run only property-based tests

## Maintenance

### Updating Coverage Thresholds

To update coverage thresholds:

1. Edit `vitest.config.ts`:

   ```typescript
   thresholds: {
     global: {
       branches: 85,  // Update here
       functions: 85,
       lines: 85,
       statements: 85,
     },
   }
   ```

2. Update `.github/workflows/test.yml`:

   ```bash
   THRESHOLD=85  # Update here
   ```

3. Update `tests/test.config.ts`:
   ```typescript
   threshold: {
     statements: 85,  // Update here
     branches: 85,
     functions: 85,
     lines: 85,
   }
   ```

### Adding New Test Jobs

To add a new test job to the CI workflow:

1. Add job definition in `.github/workflows/test.yml`
2. Add job to `test-summary` dependencies
3. Update failure condition in `test-summary`
4. Document the new job in this file

### Updating Browser Versions

Playwright browsers are automatically updated when the `@playwright/test` package is updated. To update:

```bash
npm update @playwright/test
npx playwright install
```

## Best Practices

### Writing CI-Friendly Tests

1. **Deterministic**: Tests should produce the same result every time
2. **Isolated**: Tests should not depend on external services
3. **Fast**: Keep test execution time reasonable
4. **Clear**: Test failures should provide clear error messages

### Coverage Guidelines

1. **Focus on critical paths**: Prioritize coverage of core business logic
2. **Test error handling**: Ensure error paths are covered
3. **Edge cases**: Include boundary conditions and edge cases
4. **Property-based tests**: Use for complex logic with many input combinations

### CI Workflow Optimization

1. **Fail fast**: Run quick checks (lint, format) before expensive tests
2. **Parallel execution**: Use matrix strategy for independent test suites
3. **Artifact management**: Only upload necessary artifacts
4. **Cache dependencies**: Use GitHub Actions caching effectively

## Troubleshooting

### Common Issues

**Issue**: Coverage check fails but tests pass

- **Solution**: Check if new code is missing tests. Add tests to cover new functionality.

**Issue**: Functional tests timeout in CI

- **Solution**: Increase timeout in `tests/functional/playwright.config.ts` or optimize test execution.

**Issue**: Browser installation fails

- **Solution**: Ensure Playwright version is compatible with the OS. Update Playwright if needed.

**Issue**: Build fails in CI but works locally

- **Solution**: Check for environment-specific dependencies or configuration. Ensure `package.json` scripts work in CI environment.

### Getting Help

1. Review workflow logs in GitHub Actions UI
2. Check this documentation for configuration details
3. Review test configuration in `tests/test.config.ts`
4. Consult Vitest and Playwright documentation

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Codecov Documentation](https://docs.codecov.com/)
- [fast-check Documentation](https://fast-check.dev/)

## Requirements Validation

This CI configuration validates the following requirements:

- **testing-infrastructure.1.2**: Achieves minimum 85% code coverage for main, preload, and renderer processes
- Automatic test execution on push and pull requests
- Coverage threshold enforcement with detailed reporting
- Automatic checks for code quality (lint, format, build)
- Comprehensive test suite execution (unit, property-based, functional)
