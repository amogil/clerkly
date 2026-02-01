# Test Isolation Migration Guide

## Overview

The test isolation system provides automatic state cleanup and isolated browser contexts for functional tests. This guide explains how to migrate existing tests to use the new isolation fixtures.

## Requirements

**Validates**: testing-infrastructure.5.3

## Benefits of Test Isolation

1. **Automatic Cleanup**: No need to manually create and cleanup user data directories
2. **Isolated Contexts**: Each test runs in a completely isolated environment
3. **Reduced Boilerplate**: Less code to write and maintain
4. **Consistent Patterns**: Standardized approach across all functional tests
5. **Parallel Safety**: Tests can run in parallel without interfering with each other

## Migration Steps

### Before: Manual State Management

```typescript
import { test, expect } from "@playwright/test";
import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test("my test", async () => {
  const userDataDir = await createUserDataDir();
  const { app, page } = await launchApp(userDataDir, { authMode: "success" });

  // Test code here
  await page.getByRole("button", { name: "Sign in" }).click();

  await app.close();
  await cleanupUserDataDir(userDataDir);
});
```

### After: Automatic Isolation

```typescript
import { test, expect } from "./fixtures/test-isolation";

test("my test", async ({ isolatedApp }) => {
  const { page } = isolatedApp;

  // Test code here - cleanup is automatic!
  await page.getByRole("button", { name: "Sign in" }).click();
});
```

## Usage Examples

### Basic Test with Default Auth Mode

```typescript
import { test, expect } from "./fixtures/test-isolation";

test("successful login", async ({ isolatedApp }) => {
  const { page } = isolatedApp;

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

### Test with Custom Auth Mode

For tests that need custom launch options, you can still use the manual approach or extend the fixture:

```typescript
import { test, expect } from "@playwright/test";
import { createUserDataDir, cleanupUserDataDir, launchApp } from "./utils/app";

test("failed auth", async () => {
  const userDataDir = await createUserDataDir();
  const { app, page } = await launchApp(userDataDir, { authMode: "failure" });

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByText("Authorization was canceled")).toBeVisible();

  await app.close();
  await cleanupUserDataDir(userDataDir);
});
```

### Test with Auth Sequence

```typescript
import { test, expect } from "@playwright/test";
import { createUserDataDir, cleanupUserDataDir, launchApp } from "./utils/app";

test("retry after failure", async () => {
  const userDataDir = await createUserDataDir();
  const { app, page } = await launchApp(userDataDir, {
    authMode: "failure",
    authSequence: ["failure", "success"],
  });

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByText("Authorization was canceled")).toBeVisible();

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await app.close();
  await cleanupUserDataDir(userDataDir);
});
```

### Using Only Isolated Directory (Without App)

If you need just an isolated directory without launching the app:

```typescript
import { test, expect } from "./fixtures/test-isolation";
import fs from "fs/promises";
import path from "path";

test("database setup", async ({ isolatedUserDataDir }) => {
  // Use the isolated directory for file operations
  const dbPath = path.join(isolatedUserDataDir, "app.db");
  await fs.writeFile(dbPath, "");

  // Directory is automatically cleaned up after test
});
```

## Advanced Usage

### Accessing User Data Directory

If you need access to the user data directory path:

```typescript
test("check database", async ({ isolatedApp }) => {
  const { page, userDataDir } = isolatedApp;

  // Use userDataDir for file operations
  const dbPath = path.join(userDataDir, "app.db");
  // ...
});
```

### Accessing Electron App Instance

If you need direct access to the Electron app:

```typescript
test("check app state", async ({ isolatedApp }) => {
  const { app, page } = isolatedApp;

  // Access Electron app APIs
  expect(app.isConnected()).toBe(true);

  // Evaluate in main process
  const result = await app.evaluate(async ({ app }) => {
    return app.getPath("userData");
  });
});
```

## Migration Checklist

When migrating a test file:

- [ ] Change import from `@playwright/test` to `./fixtures/test-isolation`
- [ ] Replace `test()` callback parameter with `{ isolatedApp }`
- [ ] Remove manual `createUserDataDir()` calls
- [ ] Remove manual `cleanupUserDataDir()` calls
- [ ] Remove manual `app.close()` calls
- [ ] Extract `page` from `isolatedApp` fixture
- [ ] Update test comments to reference testing-infrastructure.5.3
- [ ] Run tests to verify isolation works correctly

## Testing the Migration

After migrating tests, verify:

1. Tests still pass with the same behavior
2. No manual cleanup code remains
3. Tests can run in parallel without conflicts
4. Each test gets a fresh isolated environment
5. No state leaks between tests

## Common Pitfalls

### Don't Mix Manual and Automatic Cleanup

❌ **Wrong**:

```typescript
test("bad example", async ({ isolatedApp }) => {
  const { page, userDataDir } = isolatedApp;
  // ...
  await cleanupUserDataDir(userDataDir); // Don't do this!
});
```

✅ **Correct**:

```typescript
test("good example", async ({ isolatedApp }) => {
  const { page } = isolatedApp;
  // Cleanup happens automatically
});
```

### Don't Create Additional User Data Directories

❌ **Wrong**:

```typescript
test("bad example", async ({ isolatedApp }) => {
  const anotherDir = await createUserDataDir(); // Don't do this!
  // ...
});
```

✅ **Correct**:

```typescript
test("good example", async ({ isolatedApp }) => {
  const { userDataDir } = isolatedApp; // Use the provided directory
  // ...
});
```

## Performance Considerations

The isolation system is designed to be efficient:

- User data directories are created in the OS temp directory
- Cleanup is asynchronous and doesn't block test execution
- Parallel test execution is fully supported
- No performance overhead compared to manual management

## Troubleshooting

### Tests Fail with "Directory Not Found"

Make sure you're using the `isolatedApp` or `isolatedUserDataDir` fixture and not trying to access directories manually.

### State Persists Between Tests

Verify you're importing from `./fixtures/test-isolation` and not from `@playwright/test`.

### Cleanup Errors

If you see cleanup errors, ensure you're not manually closing the app or cleaning up directories when using the fixtures.

## Support

For questions or issues with test isolation:

1. Check this migration guide
2. Review the test-isolation-validation.spec.ts examples
3. Consult the test isolation fixture implementation
4. Refer to testing-infrastructure.5.3 requirements
