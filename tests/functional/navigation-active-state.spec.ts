// Requirements: testing-infrastructure.7.2
import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";
import {
  validateActiveNavigationItem,
  validateNavigationCorrespondence,
  navigateAndValidate,
  getCurrentActiveItem,
  validateSingleActiveItem,
  type NavigationItem,
} from "./utils/navigation-validation";

test.describe("Navigation active state validation", () => {
  /* Preconditions: authorized app session, on dashboard.
     Action: check initial active state.
     Assertions: dashboard is active, all others inactive.
     Requirements: testing-infrastructure.7.2 */
  test("validates initial active state on dashboard", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Validate that dashboard is active and corresponds to current section
    await validateNavigationCorrespondence(page, "dashboard");

    // Validate that exactly one item is active
    await validateSingleActiveItem(page);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session.
     Action: navigate to each section sequentially.
     Assertions: active item matches current section, only one active at a time.
     Requirements: testing-infrastructure.7.2 */
  test("validates active state for all navigation sections", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const sections: NavigationItem[] = ["calendar", "tasks", "contacts", "settings", "dashboard"];

    for (const section of sections) {
      // Navigate and validate
      await navigateAndValidate(page, section);

      // Ensure exactly one item is active
      await validateSingleActiveItem(page);

      // Verify the current active item matches expected
      const currentActive = await getCurrentActiveItem(page);
      expect(currentActive).toBe(section);
    }

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, on dashboard.
     Action: navigate to calendar, then back to dashboard.
     Assertions: active state updates correctly on each navigation.
     Requirements: testing-infrastructure.7.2 */
  test("validates active state transitions between sections", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Initial state: dashboard active
    await validateActiveNavigationItem(page, "dashboard");

    // Navigate to calendar
    await navigateAndValidate(page, "calendar");

    // Navigate to tasks
    await navigateAndValidate(page, "tasks");

    // Navigate back to dashboard
    await navigateAndValidate(page, "dashboard");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session.
     Action: navigate to settings (bottom section).
     Assertions: settings is active, all main sections inactive.
     Requirements: testing-infrastructure.7.2 */
  test("validates active state for settings section", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Navigate to settings
    await navigateAndValidate(page, "settings");

    // Verify settings is the only active item
    await validateSingleActiveItem(page);

    // Verify main navigation items are all inactive
    const navItems = ["dashboard", "calendar", "tasks", "contacts"] as const;
    for (const item of navItems) {
      const button = page
        .locator("nav")
        .getByRole("button", { name: item.charAt(0).toUpperCase() + item.slice(1), exact: true });
      const className = await button.getAttribute("class");
      expect(className).not.toContain("bg-primary");
    }

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, collapsed sidebar.
     Action: navigate between sections with collapsed sidebar.
     Assertions: active state updates correctly in collapsed mode.
     Requirements: testing-infrastructure.7.2 */
  test("validates active state with collapsed sidebar", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Collapse the sidebar
    const collapseButton = page.locator("nav").getByRole("button", { name: "Collapse sidebar" });
    await collapseButton.click();

    // Navigate to calendar
    await navigateAndValidate(page, "calendar");

    // Navigate to tasks
    await navigateAndValidate(page, "tasks");

    // Verify exactly one item is active
    await validateSingleActiveItem(page);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, on calendar section.
     Action: rapidly click multiple navigation items.
     Assertions: final active state matches last clicked item.
     Requirements: testing-infrastructure.7.2 */
  test("validates active state after rapid navigation", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const nav = page.locator("nav");

    // Rapidly click through sections
    await nav.getByRole("button", { name: "Calendar", exact: true }).click();
    await nav.getByRole("button", { name: "Tasks", exact: true }).click();
    await nav.getByRole("button", { name: "Contacts", exact: true }).click();

    // Wait for final state to settle
    await expect(page.getByRole("heading", { name: "Contacts", level: 1 })).toBeVisible();

    // Validate final active state
    await validateNavigationCorrespondence(page, "contacts");
    await validateSingleActiveItem(page);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
