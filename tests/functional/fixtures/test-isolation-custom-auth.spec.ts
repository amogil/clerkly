// Requirements: testing-infrastructure.5.3
import { test, expect } from "@playwright/test";
import { createUserDataDir, cleanupUserDataDir, launchApp, type LaunchOptions } from "../utils/app";

/**
 * Example tests demonstrating how to use test isolation with custom auth modes.
 * These tests show the pattern for tests that need non-default launch options.
 */

test.describe("Test Isolation with Custom Auth Modes", () => {
  /* Preconditions: test isolation with failure auth mode
     Action: launch app with failure auth mode and attempt sign in
     Assertions: error message is displayed, auth gate remains visible
     Requirements: testing-infrastructure.5.3 */
  test("should support failure auth mode with manual isolation", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "failure" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByText("Authorization was canceled. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: test isolation with auth sequence
     Action: launch app with failure then success sequence, attempt sign in twice
     Assertions: first attempt shows error, second attempt succeeds
     Requirements: testing-infrastructure.5.3 */
  test("should support auth sequence with manual isolation", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, {
      authMode: "failure",
      authSequence: ["failure", "success"],
    });

    // First attempt - should fail
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByText("Authorization was canceled. Please try again.")).toBeVisible();

    // Second attempt - should succeed
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: test isolation with success auth mode
     Action: launch app with success auth mode and sign in
     Assertions: dashboard is displayed after sign in
     Requirements: testing-infrastructure.5.3 */
  test("should support success auth mode with manual isolation", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: multiple tests with different auth modes
     Action: run tests sequentially with different auth configurations
     Assertions: each test is isolated and doesn't affect others
     Requirements: testing-infrastructure.5.3 */
  test("should isolate tests with different auth modes - test 1", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: previous test completed with success auth mode
     Action: run test with failure auth mode
     Assertions: test runs independently with failure mode, no state from previous test
     Requirements: testing-infrastructure.5.3 */
  test("should isolate tests with different auth modes - test 2", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "failure" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByText("Authorization was canceled. Please try again.")).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
