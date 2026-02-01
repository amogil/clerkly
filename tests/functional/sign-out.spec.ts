import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Sign out", () => {
  /* Preconditions: authorized app session.
     Action: sign out from Settings.
     Assertions: auth gate is shown again.
     Requirements: testing-infrastructure.6.1, testing-infrastructure.6.2 */
  test("returns to the auth gate", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: signed-out session.
     Action: relaunch app with same userData.
     Assertions: app stays on auth gate.
     Requirements: testing-infrastructure.6.1, testing-infrastructure.6.5 */
  test("persists signed-out state after relaunch", async () => {
    const userDataDir = await createUserDataDir();
    const firstRun = await launchApp(userDataDir, { authMode: "success" });

    await firstRun.page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(firstRun.page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await firstRun.page
      .locator("nav")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(firstRun.page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await firstRun.page.getByRole("button", { name: "Sign Out" }).click();
    await expect(firstRun.page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await firstRun.app.close();

    const secondRun = await launchApp(userDataDir, { authMode: "success" });
    await expect(secondRun.page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await secondRun.app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
