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
