import path from "path";
import { pathToFileURL } from "url";
import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";

test.describe("Auth completion copy", () => {
  /* Preconditions: auth completion page component exists.
     Action: render success completion HTML.
     Assertions: success copy is shown.
     Requirements: E.TE.14 */
  test("shows success completion copy", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    const moduleUrl = pathToFileURL(
      path.join(process.cwd(), "dist", "src", "auth", "authorization_completion_page.js"),
    ).href;
    const { getAuthorizationCompletionPage } = await import(moduleUrl);
    const html = getAuthorizationCompletionPage({ success: true });

    expect(html).toContain("You're all set.");
    expect(html).toContain("Return to the Clerkly app to continue.");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: auth completion page component exists.
     Action: render failure completion HTML.
     Assertions: failure copy is shown.
     Requirements: E.TE.14 */
  test("shows failure completion copy", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "failure" });

    const moduleUrl = pathToFileURL(
      path.join(process.cwd(), "dist", "src", "auth", "authorization_completion_page.js"),
    ).href;
    const { getAuthorizationCompletionPage } = await import(moduleUrl);
    const html = getAuthorizationCompletionPage({ success: false, error: "access_denied" });

    expect(html).toContain("Authorization canceled.");
    expect(html).toContain("Return to the Clerkly app to try again.");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
