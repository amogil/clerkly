# Clerkly Testing Documentation

This directory contains all tests for the Clerkly application, including unit tests, property-based tests, and functional tests.

## Requirements

This testing infrastructure satisfies the following requirements:
- **clerkly.2.1** - Модульные тесты для всех компонентов бизнес-логики
- **clerkly.2.2** - Функциональные тесты для проверки основных пользовательских сценариев
- **clerkly.2.3** - Модульные тесты покрывают edge cases и граничные условия
- **clerkly.2.4** - Функциональные тесты проверяют интеграцию между компонентами
- **clerkly.2.5** - Все тесты автоматизированы и запускаются через npm test

## Directory Structure

```
tests/
├── README.md                 # This file
├── setup.js                  # Jest setup file (runs before each test suite)
├── config.test.js           # Configuration verification tests
├── mocks/                   # Mock implementations
│   ├── README.md           # Mock documentation
│   ├── electron.js         # Electron API mocks
│   └── better-sqlite3.js   # SQLite database mocks
├── unit/                    # Unit tests (to be created)
├── property/                # Property-based tests (to be created)
└── functional/              # Functional/integration tests (to be created)
```

## Test Types

### Unit Tests
Unit tests verify individual components in isolation. They test specific examples, edge cases, and error conditions.

**Location:** `tests/unit/`

**Naming:** `*.test.js`

**Example:**
```javascript
/* Preconditions: DataManager is initialized with valid storage path
   Action: call saveData with valid key and value
   Assertions: returns success true, data is stored
   Requirements: clerkly.1.4 */
test('should save data successfully', async () => {
  const result = await dataManager.saveData('key', 'value');
  expect(result.success).toBe(true);
});
```

### Property-Based Tests
Property-based tests verify universal properties across many generated inputs. They use fast-check to generate test data.

**Location:** `tests/property/`

**Naming:** `*.test.js`

**Example:**
```javascript
const fc = require('fast-check');

/* Feature: clerkly, Property 1: Data Storage Round-Trip
   Preconditions: DataManager is initialized
   Action: save and load random data
   Assertions: loaded data equals saved data
   Requirements: clerkly.1.4 */
test('Property 1: saving then loading returns equivalent value', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),
      fc.anything(),
      async (key, value) => {
        await dataManager.saveData(key, value);
        const result = await dataManager.loadData(key);
        expect(result.data).toEqual(value);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Functional Tests
Functional tests verify integration between components and end-to-end workflows.

**Location:** `tests/functional/`

**Naming:** `*.test.js`

**Example:**
```javascript
/* Preconditions: Application is started
   Action: save data, restart app, load data
   Assertions: data persists across restarts
   Requirements: clerkly.1.4, clerkly.2.4 */
test('should persist data across restarts', async () => {
  const app = await startTestApp();
  await app.saveData('key', 'value');
  await app.restart();
  const result = await app.loadData('key');
  expect(result.data).toBe('value');
});
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Property-Based Tests Only
```bash
npm run test:property
```

### Functional Tests Only
```bash
npm run test:functional
```

### With Coverage Report
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI tools
- `coverage/coverage-summary.json` - JSON summary

## Test Configuration

### Jest Configuration (`jest.config.js`)

Key settings:
- **testEnvironment:** `node` - Node.js environment for Electron main process
- **setupFilesAfterEnv:** Runs `tests/setup.js` before each test suite
- **moduleNameMapper:** Maps `electron` and `better-sqlite3` to mocks
- **coverageThreshold:** 80% minimum coverage for all metrics
- **testTimeout:** 10 seconds per test
- **clearMocks/resetMocks/restoreMocks:** Automatic mock cleanup

### Test Setup (`tests/setup.js`)

Provides:
- Automatic mock reset before each test
- Mac OS X platform configuration (`process.platform = 'darwin'`)
- Test environment configuration (`process.env.NODE_ENV = 'test'`)
- Custom matchers (`toBeValidTimestamp`, `toBeValidPath`)
- Global test utilities (`waitFor`, `createMockEvent`, `sleep`)

## Writing Tests

### Test Structure

All tests MUST follow this structure:

```javascript
/* Preconditions: describe initial state
   Action: describe what action is performed
   Assertions: describe expected results
   Requirements: list requirement IDs */
test('descriptive test name', async () => {
  // Test implementation
});
```

### Test Naming

- Use descriptive names that explain what is being tested
- Start with "should" for behavior tests
- Include the condition being tested

**Good:**
```javascript
test('should save data successfully with valid key')
test('should reject empty key')
test('should handle missing data gracefully')
```

**Bad:**
```javascript
test('test 1')
test('save')
test('works')
```

### Using Mocks

#### Electron Mocks

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');

test('window creation', () => {
  const win = new BrowserWindow({ width: 800, height: 600 });
  expect(win.options.width).toBe(800);
});

test('IPC handler', async () => {
  ipcMain.handle('test', (event, data) => ({ success: true, data }));
  const mockEvent = global.testUtils.createMockEvent();
  const result = await ipcMain._invokeHandler('test', mockEvent, 'data');
  expect(result.success).toBe(true);
});
```

#### Database Mocks

```javascript
const Database = require('better-sqlite3');

let db;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

test('database operations', () => {
  const stmt = db.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
  const result = stmt.run('key', 'value');
  expect(result.changes).toBe(1);
});
```

### Custom Matchers

```javascript
// Check if value is a valid timestamp
expect(Date.now()).toBeValidTimestamp();

// Check if value is a valid path
expect('/some/path').toBeValidPath();
```

### Test Utilities

```javascript
// Wait for async condition
await global.testUtils.waitFor(() => condition, 5000, 100);

// Create mock IPC event
const event = global.testUtils.createMockEvent();

// Sleep for specified time
await global.testUtils.sleep(100);
```

## Coverage Requirements

### Minimum Coverage Thresholds
- **Branches:** 80%
- **Functions:** 80%
- **Lines:** 80%
- **Statements:** 80%

### Critical Components
The following components require 100% coverage:
- DataManager
- LifecycleManager
- WindowManager
- IPC handlers

### Coverage Reports

Coverage reports include:
- **Text:** Console output showing coverage summary
- **LCOV:** Machine-readable format for CI/CD integration
- **HTML:** Interactive browser-based report
- **JSON:** Programmatic access to coverage data

View HTML report:
```bash
npm run test:coverage
open coverage/index.html
```

## Best Practices

### 1. Test Isolation
Each test should be independent and not rely on other tests:

```javascript
let dataManager;

beforeEach(() => {
  dataManager = new DataManager('/tmp/test');
  dataManager.initialize();
});

afterEach(() => {
  dataManager.close();
});
```

### 2. Mock External Dependencies
Always mock external dependencies (Electron, database, file system):

```javascript
const { app } = require('electron'); // Automatically mocked
```

### 3. Test Edge Cases
Include tests for edge cases and error conditions:

```javascript
test('should reject empty key', async () => {
  const result = await dataManager.saveData('', 'value');
  expect(result.success).toBe(false);
});

test('should handle missing key', async () => {
  const result = await dataManager.loadData('nonexistent');
  expect(result.success).toBe(false);
});
```

### 4. Use Descriptive Assertions
Make assertions clear and specific:

```javascript
// Good
expect(result.success).toBe(true);
expect(result.data).toEqual({ key: 'value' });

// Bad
expect(result).toBeTruthy();
```

### 5. Test Async Code Properly
Always use async/await or return promises:

```javascript
// Good
test('async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});

// Bad
test('async operation', () => {
  asyncFunction().then(result => {
    expect(result).toBe('expected'); // May not run!
  });
});
```

### 6. Keep Tests Fast
- Use in-memory databases
- Mock slow operations
- Avoid unnecessary delays
- Target: < 100ms per test

### 7. Write Maintainable Tests
- Keep tests simple and focused
- One assertion per test (when possible)
- Use helper functions for common setup
- Document complex test logic

## Troubleshooting

### Tests Failing Intermittently
- Check for race conditions in async code
- Ensure proper cleanup in `afterEach`
- Verify mocks are reset between tests

### Coverage Not Updating
- Delete `coverage/` directory and re-run
- Check that files are in `collectCoverageFrom` paths
- Verify files are not in ignore patterns

### Mocks Not Working
- Check `moduleNameMapper` in `jest.config.js`
- Verify import/require statements
- Ensure mock files exist in `tests/mocks/`

### Slow Tests
- Use in-memory databases instead of file-based
- Mock slow operations (network, file I/O)
- Check for unnecessary `setTimeout` calls
- Profile with `jest --verbose`

## Continuous Integration

### Running in CI
Tests are designed to run in CI environments:

```bash
# Run all tests with coverage
npm run test:coverage

# Check coverage thresholds
# Jest will exit with error if thresholds not met
```

### CI Configuration Example
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Mock Documentation](./mocks/README.md)

## Support

For questions or issues with testing:
1. Check this documentation
2. Review mock documentation in `tests/mocks/README.md`
3. Look at existing test examples
4. Check Jest and fast-check documentation
