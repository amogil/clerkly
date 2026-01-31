import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Settings toggles", () => {
  /* Preconditions: authorized app session.
     Action: toggle meeting settings switches.
     Assertions: toggle button classes change.
     Requirements: E.TE.18 */
  test("toggles meeting settings", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const autoJoinRow = page.getByText("Auto-join meetings").locator("..").locator("..");
    const autoJoinToggle = autoJoinRow.getByRole("button");
    await expect(autoJoinToggle).toHaveClass(/bg-primary/);
    await autoJoinToggle.click();
    await expect(autoJoinToggle).toHaveClass(/bg-gray-300/);

    const autoTranscribeRow = page.getByText("Auto-transcribe").locator("..").locator("..");
    const autoTranscribeToggle = autoTranscribeRow.getByRole("button");
    await expect(autoTranscribeToggle).toHaveClass(/bg-primary/);
    await autoTranscribeToggle.click();
    await expect(autoTranscribeToggle).toHaveClass(/bg-gray-300/);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
