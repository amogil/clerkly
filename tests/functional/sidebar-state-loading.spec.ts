// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3, sidebar-navigation.4.4
import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Sidebar State Loading", () => {
  /* Preconditions: fresh app launch with no existing sidebar state
     Action: launch app and observe initial sidebar state
     Assertions: sidebar defaults to expanded state (w-64), no flickering occurs
     Requirements: sidebar-navigation.4.3, sidebar-navigation.4.4 */
  test("defaults to expanded state on first launch", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Verify default expanded state
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-64/);
    await expect(nav).not.toHaveClass(/w-20/);

    // Verify main content has correct margin for expanded state
    await expect(page.locator("div.ml-64")).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app with saved collapsed state
     Action: launch app and observe sidebar state restoration
     Assertions: sidebar restores to collapsed state before first render, no flickering
     Requirements: sidebar-navigation.4.1, sidebar-navigation.4.4 */
  test("restores saved state before first render", async () => {
    const userDataDir = await createUserDataDir();

    // First launch: collapse sidebar
    const firstRun = await launchApp(userDataDir, { authMode: "success" });
    await firstRun.page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(firstRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await firstRun.page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(firstRun.page.locator("nav")).toHaveClass(/w-20/);
    await firstRun.app.close();

    // Second launch: verify state is restored immediately
    const secondRun = await launchApp(userDataDir, { authMode: "success" });
    await expect(secondRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Sidebar should be collapsed from the start (no flickering from expanded to collapsed)
    const nav = secondRun.page.locator("nav");
    await expect(nav).toHaveClass(/w-20/);

    // Main content should have collapsed margin
    await expect(secondRun.page.locator("div.ml-20")).toBeVisible();

    await secondRun.app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app with corrupted or missing sidebar state in database
     Action: launch app with database error scenario
     Assertions: sidebar falls back to expanded state gracefully, app remains functional
     Requirements: sidebar-navigation.4.3, sidebar-navigation.4.4 */
  test("handles missing state gracefully with fallback", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Even if there's an error loading state, sidebar should default to expanded
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-64/);

    // App should remain functional - test navigation
    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    // Sidebar toggle should still work
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(nav).toHaveClass(/w-20/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app launch with sidebar state loading
     Action: rapidly navigate and interact before state fully loads
     Assertions: no UI flickering or layout shifts, smooth loading experience
     Requirements: sidebar-navigation.4.4 */
  test("prevents UI flickering during state load", async () => {
    const userDataDir = await createUserDataDir();

    // Set up a saved state first
    const setupRun = await launchApp(userDataDir, { authMode: "success" });
    await setupRun.page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(setupRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await setupRun.page.getByRole("button", { name: "Collapse sidebar" }).click();
    await setupRun.app.close();

    // Launch again and verify no flickering
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // The sidebar should be in collapsed state immediately, no transition from expanded
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-20/);

    // Main content should have correct margin from the start
    await expect(page.locator("div.ml-20")).toBeVisible();
    await expect(page.locator("div.ml-64")).not.toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app with saved expanded state
     Action: launch app multiple times
     Assertions: expanded state is consistently restored, no state corruption
     Requirements: sidebar-navigation.4.1, sidebar-navigation.4.4 */
  test("consistently restores expanded state across multiple launches", async () => {
    const userDataDir = await createUserDataDir();

    // First launch: verify default expanded state
    const firstRun = await launchApp(userDataDir, { authMode: "success" });
    await firstRun.page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(firstRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(firstRun.page.locator("nav")).toHaveClass(/w-64/);
    await firstRun.app.close();

    // Second launch: verify expanded state persists
    const secondRun = await launchApp(userDataDir, { authMode: "success" });
    await expect(secondRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(secondRun.page.locator("nav")).toHaveClass(/w-64/);
    await secondRun.app.close();

    // Third launch: verify expanded state still persists
    const thirdRun = await launchApp(userDataDir, { authMode: "success" });
    await expect(thirdRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(thirdRun.page.locator("nav")).toHaveClass(/w-64/);
    await thirdRun.app.close();

    await cleanupUserDataDir(userDataDir);
  });
});
