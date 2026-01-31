import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Auth flow", () => {
  /* Preconditions: app launched with auth stub success.
     Action: click Sign in with Google.
     Assertions: dashboard becomes visible.
     Requirements: testing-infrastructure.1.7 */
  test("completes successful authorization", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app launched with auth stub failure.
     Action: click Sign in with Google.
     Assertions: friendly error shown and auth gate remains.
     Requirements: testing-infrastructure.1.7 */
  test("shows friendly error on canceled authorization", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "failure" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByText("Authorization was canceled. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: app launched with auth sequence failure then success.
     Action: click Sign in, then click again.
     Assertions: error appears then dashboard loads on retry.
     Requirements: testing-infrastructure.1.13 */
  test("retries authorization after cancel", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, {
      authMode: "failure",
      authSequence: ["failure", "success"],
    });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByText("Authorization was canceled. Please try again.")).toBeVisible();

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
