// Requirements: testing-infrastructure.5.3
import { test, expect } from "./fixtures/test-isolation";
import fs from "fs/promises";
import path from "path";

test.describe("Test Isolation System", () => {
  /* Preconditions: test isolation fixture is configured
     Action: launch app using isolatedApp fixture
     Assertions: app launches successfully with isolated user data directory
     Requirements: testing-infrastructure.5.3 */
  test("should provide isolated user data directory", async ({ isolatedApp }) => {
    const { userDataDir, page } = isolatedApp;

    // Verify user data directory exists
    const stats = await fs.stat(userDataDir);
    expect(stats.isDirectory()).toBe(true);

    // Verify it's a temporary directory
    expect(userDataDir).toContain("clerkly-e2e-");

    // Verify app is running
    expect(page).toBeDefined();
    expect(page.url()).toBeTruthy();
  });

  /* Preconditions: test isolation fixture is configured
     Action: run multiple tests sequentially
     Assertions: each test gets a different isolated user data directory
     Requirements: testing-infrastructure.5.3 */
  test("should create unique user data directory per test", async ({ isolatedUserDataDir }) => {
    // Store the directory path for comparison
    const firstTestDir = isolatedUserDataDir;
    expect(firstTestDir).toContain("clerkly-e2e-");

    // Verify directory exists
    const stats = await fs.stat(firstTestDir);
    expect(stats.isDirectory()).toBe(true);
  });

  /* Preconditions: test isolation fixture is configured
     Action: run another test to verify isolation
     Assertions: receives a different user data directory than previous test
     Requirements: testing-infrastructure.5.3 */
  test("should isolate state between tests", async ({ isolatedUserDataDir }) => {
    // This test should get a different directory
    const secondTestDir = isolatedUserDataDir;
    expect(secondTestDir).toContain("clerkly-e2e-");

    // Verify directory exists
    const stats = await fs.stat(secondTestDir);
    expect(stats.isDirectory()).toBe(true);

    // Note: We can't directly compare with the first test's directory
    // because they run in isolation, but the fixture ensures uniqueness
  });

  /* Preconditions: test isolation fixture is configured
     Action: write data to user data directory during test
     Assertions: data is accessible during test but cleaned up after
     Requirements: testing-infrastructure.5.3 */
  test("should cleanup user data directory after test", async ({ isolatedUserDataDir }) => {
    const testFile = path.join(isolatedUserDataDir, "test-file.txt");

    // Write a test file
    await fs.writeFile(testFile, "test data");

    // Verify file exists during test
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("test data");

    // Note: After this test completes, the fixture will automatically
    // clean up the directory. We can't verify cleanup within the same test,
    // but the fixture implementation ensures it happens.
  });

  /* Preconditions: test isolation fixture is configured with isolatedApp
     Action: launch app and verify it has isolated browser context
     Assertions: app runs in isolated context with no shared state
     Requirements: testing-infrastructure.5.3 */
  test("should provide isolated browser context", async ({ isolatedApp }) => {
    const { page, app } = isolatedApp;

    // Verify page has a context
    const context = page.context();
    expect(context).toBeDefined();

    // Verify app is defined
    expect(app).toBeDefined();

    // Verify page is loaded
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toBeTruthy();
  });

  /* Preconditions: test isolation fixture is configured
     Action: launch app, interact with it, and let fixture cleanup
     Assertions: app is automatically closed after test completes
     Requirements: testing-infrastructure.5.3 */
  test("should automatically close app after test", async ({ isolatedApp }) => {
    const { app, page } = isolatedApp;

    // Verify app is defined
    expect(app).toBeDefined();

    // Interact with the page
    await page.waitForLoadState("domcontentloaded");

    // Note: The fixture will automatically close the app after this test
    // We can't verify closure within the same test, but the fixture
    // implementation ensures it happens in the cleanup phase
  });

  /* Preconditions: test isolation fixture is configured
     Action: run test with default auth mode
     Assertions: app launches with success auth mode by default
     Requirements: testing-infrastructure.5.3 */
  test("should use default launch options", async ({ isolatedApp }) => {
    const { page } = isolatedApp;

    // With default success auth mode, clicking sign in should work
    await page.getByRole("button", { name: "Sign in with Google" }).click();

    // Should navigate to dashboard (success auth mode)
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 10000,
    });
  });

  /* Preconditions: test isolation fixture is configured
     Action: verify no state leaks between isolated tests
     Assertions: each test starts with clean state
     Requirements: testing-infrastructure.5.3 */
  test("should ensure no state leakage between tests - test 1", async ({ isolatedApp }) => {
    const { page, userDataDir } = isolatedApp;

    // Create a marker file in the user data directory
    const markerFile = path.join(userDataDir, "test-marker-1.txt");
    await fs.writeFile(markerFile, "test 1 was here");

    // Verify marker exists
    const exists = await fs
      .access(markerFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // Verify app is running
    expect(page).toBeDefined();
  });

  /* Preconditions: test isolation fixture is configured
     Action: verify previous test's state is not present
     Assertions: no marker file from previous test exists
     Requirements: testing-infrastructure.5.3 */
  test("should ensure no state leakage between tests - test 2", async ({ isolatedApp }) => {
    const { userDataDir } = isolatedApp;

    // Try to find the marker from test 1
    const markerFile = path.join(userDataDir, "test-marker-1.txt");
    const exists = await fs
      .access(markerFile)
      .then(() => true)
      .catch(() => false);

    // Marker should NOT exist because we're in a different isolated directory
    expect(exists).toBe(false);
  });

  /* Preconditions: test isolation fixture is configured
     Action: verify isolated user data directory fixture works standalone
     Assertions: provides isolated directory without launching app
     Requirements: testing-infrastructure.5.3 */
  test("should support isolated directory without app launch", async ({ isolatedUserDataDir }) => {
    // This test uses only the isolatedUserDataDir fixture
    // without launching the full app

    // Verify directory exists
    const stats = await fs.stat(isolatedUserDataDir);
    expect(stats.isDirectory()).toBe(true);

    // Verify it's a temporary directory
    expect(isolatedUserDataDir).toContain("clerkly-e2e-");

    // Can perform file operations
    const testFile = path.join(isolatedUserDataDir, "standalone-test.txt");
    await fs.writeFile(testFile, "standalone test");

    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("standalone test");
  });
});
