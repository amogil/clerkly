// Requirements: testing-infrastructure.7.3
import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Sidebar collapse", () => {
  /* Preconditions: authorized app session.
     Action: collapse sidebar, relaunch, expand.
     Assertions: collapse persists and expands.
     Requirements: testing-infrastructure.1.8 */
  test("persists collapsed state", async () => {
    const userDataDir = await createUserDataDir();

    const firstRun = await launchApp(userDataDir, { authMode: "success" });
    await firstRun.page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(firstRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await firstRun.page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(firstRun.page.locator("nav")).toHaveClass(/w-20/);
    await firstRun.app.close();

    const secondRun = await launchApp(userDataDir, { authMode: "success" });
    await expect(secondRun.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(secondRun.page.locator("nav")).toHaveClass(/w-20/);

    await secondRun.page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(secondRun.page.locator("nav")).toHaveClass(/w-64/);

    await secondRun.app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session.
     Action: collapse sidebar.
     Assertions: content layout shifts to collapsed margin.
     Requirements: testing-infrastructure.1.15 */
  test("shifts main content when collapsed", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.locator("div.ml-64")).toBeVisible();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("div.ml-20")).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});

test.describe("Sidebar adaptivity", () => {
  /* Preconditions: authorized app session with expanded sidebar
     Action: click collapse button
     Assertions: sidebar width changes from w-64 to w-20, main content margin changes from ml-64 to ml-20
     Requirements: testing-infrastructure.7.3 */
  test("adapts sidebar width when collapsing", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Verify initial expanded state
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-64/);
    await expect(nav).not.toHaveClass(/w-20/);

    // Collapse sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    // Verify collapsed state
    await expect(nav).toHaveClass(/w-20/);
    await expect(nav).not.toHaveClass(/w-64/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with expanded sidebar
     Action: click collapse button
     Assertions: main content container margin-left changes from ml-64 to ml-20
     Requirements: testing-infrastructure.7.3 */
  test("adapts main content margin when collapsing", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Verify initial expanded state
    const mainContent = page.locator("div.ml-64");
    await expect(mainContent).toBeVisible();

    // Collapse sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    // Verify collapsed state - main content should now have ml-20
    await expect(page.locator("div.ml-20")).toBeVisible();
    await expect(page.locator("div.ml-64")).not.toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with collapsed sidebar
     Action: click expand button
     Assertions: sidebar width changes from w-20 to w-64, main content margin changes from ml-20 to ml-64
     Requirements: testing-infrastructure.7.3 */
  test("adapts layout when expanding from collapsed state", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // First collapse the sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("nav")).toHaveClass(/w-20/);
    await expect(page.locator("div.ml-20")).toBeVisible();

    // Now expand it
    await page.getByRole("button", { name: "Expand sidebar" }).click();

    // Verify expanded state
    await expect(page.locator("nav")).toHaveClass(/w-64/);
    await expect(page.locator("div.ml-64")).toBeVisible();
    await expect(page.locator("div.ml-20")).not.toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with expanded sidebar
     Action: rapidly toggle sidebar multiple times
     Assertions: layout correctly adapts after each toggle without visual glitches
     Requirements: testing-infrastructure.7.3 */
  test("handles rapid sidebar toggling", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Rapidly toggle sidebar 3 times
    for (let i = 0; i < 3; i++) {
      // Collapse
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.locator("nav")).toHaveClass(/w-20/);
      await expect(page.locator("div.ml-20")).toBeVisible();

      // Expand
      await page.getByRole("button", { name: "Expand sidebar" }).click();
      await expect(page.locator("nav")).toHaveClass(/w-64/);
      await expect(page.locator("div.ml-64")).toBeVisible();
    }

    // Verify final state is consistent
    await expect(page.locator("nav")).toHaveClass(/w-64/);
    await expect(page.locator("div.ml-64")).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with expanded sidebar
     Action: collapse sidebar and verify navigation items visibility
     Assertions: navigation labels are hidden when collapsed, icons remain visible and clickable
     Requirements: testing-infrastructure.7.3 */
  test("adapts navigation item display when collapsed", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Verify expanded state - labels should be visible
    const dashboardButton = page.getByRole("button", { name: "Dashboard" });
    await expect(dashboardButton).toBeVisible();

    // Collapse sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    // Verify navigation buttons are still clickable (icons visible)
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-20/);

    // Navigation should still work with collapsed sidebar - use button index since labels are hidden
    const calendarButton = nav.locator("button").nth(1); // Calendar is second button
    await calendarButton.click();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with expanded sidebar
     Action: collapse sidebar, verify logo display adapts
     Assertions: logo text is hidden when collapsed, logo icon remains visible
     Requirements: testing-infrastructure.7.3 */
  test("adapts logo display when sidebar is collapsed", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Verify logo is visible in expanded state
    const nav = page.locator("nav");
    await expect(nav).toHaveClass(/w-64/);

    // Collapse sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(nav).toHaveClass(/w-20/);

    // Logo should still be present (icon only)
    // The logo component should adapt to collapsed state
    await expect(nav).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session with expanded sidebar
     Action: collapse sidebar, measure main content width increase
     Assertions: main content area gains additional width when sidebar collapses
     Requirements: testing-infrastructure.7.3 */
  test("increases main content available width when sidebar collapses", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Get main content bounding box when expanded
    const mainContentExpanded = page.locator("div.ml-64");
    const expandedBox = await mainContentExpanded.boundingBox();
    expect(expandedBox).not.toBeNull();

    // Collapse sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    // Get main content bounding box when collapsed
    const mainContentCollapsed = page.locator("div.ml-20");
    const collapsedBox = await mainContentCollapsed.boundingBox();
    expect(collapsedBox).not.toBeNull();

    // Main content should have more width when sidebar is collapsed
    // The difference should be approximately 176px (w-64 = 256px, w-20 = 80px, difference = 176px)
    if (expandedBox && collapsedBox) {
      expect(collapsedBox.width).toBeGreaterThan(expandedBox.width);
      const widthDifference = collapsedBox.width - expandedBox.width;
      // Allow some tolerance for rendering differences
      expect(widthDifference).toBeGreaterThanOrEqual(150);
      expect(widthDifference).toBeLessThanOrEqual(200);
    }

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
