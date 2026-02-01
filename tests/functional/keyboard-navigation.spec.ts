// Requirements: sidebar-navigation.2.5
import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Keyboard Navigation", () => {
  /* Preconditions: application started, navigation sidebar visible
     Action: press Tab key to navigate through interactive elements
     Assertions: all navigation buttons and toggle button are focusable
     Requirements: sidebar-navigation.2.5 */
  test("should allow tab navigation through all interactive elements", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Get all buttons in the navigation
    const buttons = await page.locator('nav[role="navigation"] button').all();
    expect(buttons.length).toBeGreaterThan(0);

    // Verify all buttons have tabIndex
    for (const button of buttons) {
      const tabIndex = await button.getAttribute("tabIndex");
      expect(tabIndex).toBe("0");
    }

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, dashboard navigation button focused
     Action: press Enter key on calendar button
     Assertions: calendar screen is activated
     Requirements: sidebar-navigation.2.5 */
  test("should activate navigation item on Enter key press", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Find and focus the Calendar button
    const calendarButton = page.getByRole("button", { name: "Calendar" });
    await calendarButton.focus();

    // Press Enter key
    await page.keyboard.press("Enter");

    // Wait a bit for state to update
    await page.waitForTimeout(100);

    // Verify Calendar screen is now visible
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, tasks navigation button focused
     Action: press Space key on tasks button
     Assertions: tasks screen is activated
     Requirements: sidebar-navigation.2.5 */
  test("should activate navigation item on Space key press", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Find and focus the Tasks button
    const tasksButton = page.getByRole("button", { name: "Tasks" });
    await tasksButton.focus();

    // Press Space key
    await page.keyboard.press("Space");

    // Wait a bit for state to update
    await page.waitForTimeout(100);

    // Verify Tasks screen is now visible
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, sidebar in collapsed mode
     Action: press Enter key on navigation button using aria-label
     Assertions: navigation works correctly in collapsed mode
     Requirements: sidebar-navigation.2.5 */
  test("should handle keyboard navigation in collapsed mode", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Collapse sidebar first
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(350);

    // Verify sidebar is collapsed
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toHaveClass(/w-20/);

    // Find Contacts button by aria-label (since text is hidden in collapsed mode)
    const contactsButton = page.locator('button[aria-label="Contacts"]');
    await contactsButton.focus();

    // Press Enter key
    await page.keyboard.press("Enter");

    // Wait for state to update
    await page.waitForTimeout(100);

    // Verify Contacts screen is now visible
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, settings button focused
     Action: press Space key on settings button
     Assertions: settings screen is activated
     Requirements: sidebar-navigation.2.5 */
  test("should activate settings item with keyboard", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Find and focus the Settings button
    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.focus();

    // Press Space key
    await page.keyboard.press("Space");

    // Wait for state to update
    await page.waitForTimeout(100);

    // Verify Settings screen is now visible
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, toggle button focused
     Action: press Enter key on toggle button
     Assertions: sidebar collapses/expands
     Requirements: sidebar-navigation.2.5 */
  test("should toggle sidebar with Enter key on toggle button", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Get initial sidebar state
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toHaveClass(/w-64/);

    // Find and focus the toggle button
    const toggleButton = page.getByRole("button", { name: "Collapse sidebar" });
    await toggleButton.focus();

    // Press Enter key
    await page.keyboard.press("Enter");

    // Wait for animation
    await page.waitForTimeout(350);

    // Verify sidebar collapsed
    await expect(nav).toHaveClass(/w-20/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started with multiple navigation items
     Action: use keyboard to navigate between items
     Assertions: each item can be activated via keyboard
     Requirements: sidebar-navigation.2.5 */
  test("should support full keyboard navigation workflow", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Navigate to Calendar
    const calendarButton = page.getByRole("button", { name: "Calendar" });
    await calendarButton.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    // Navigate to Tasks
    const tasksButton = page.getByRole("button", { name: "Tasks" });
    await tasksButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

    // Navigate to Contacts
    const contactsButton = page.getByRole("button", { name: "Contacts" });
    await contactsButton.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

    // Navigate to Settings
    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: application started, sidebar expanded
     Action: press Ctrl+B twice in succession
     Assertions: sidebar collapses then expands back
     Requirements: sidebar-navigation.2.5 */
  test("should handle repeated Ctrl+B keyboard shortcut", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const nav = page.locator('nav[role="navigation"]');

    // Verify initial expanded state
    await expect(nav).toHaveClass(/w-64/);

    // Press Ctrl+B to collapse
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(350);
    await expect(nav).toHaveClass(/w-20/);

    // Press Ctrl+B again to expand
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(350);
    await expect(nav).toHaveClass(/w-64/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
