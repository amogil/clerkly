import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Core navigation", () => {
  /* Preconditions: authorized app session.
     Action: navigate across main sections.
     Assertions: each section heading is visible.
     Requirements: testing-infrastructure.7.1 */
  test("navigates between main sections", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const nav = page.locator("nav");

    await nav.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();

    await nav.getByRole("button", { name: "Tasks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();

    await nav.getByRole("button", { name: "Contacts", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Contacts", level: 1 })).toBeVisible();

    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session.
     Action: click navigation items.
     Assertions: active item styling updates.
     Requirements: testing-infrastructure.7.2 */
  test("highlights the active navigation item", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const nav = page.locator("nav");
    const calendarButton = nav.getByRole("button", { name: "Calendar", exact: true });
    await calendarButton.click();
    await expect(calendarButton).toHaveClass(/bg-primary/);

    const tasksButton = nav.getByRole("button", { name: "Tasks", exact: true });
    await tasksButton.click();
    await expect(tasksButton).toHaveClass(/bg-primary/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
