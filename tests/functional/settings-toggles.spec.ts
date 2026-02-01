// Requirements: testing-infrastructure.8.1

import { test, expect } from "@playwright/test";

import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";
import {
  getToggleByLabel,
  validateToggleState,
  validateToggleReactivity,
  validateAllToggles,
  validateRapidToggling,
  validateToggleCirclePosition,
} from "./utils/toggle-validation";

test.describe("Settings Toggles - State Changes", () => {
  /* Preconditions: authorized app session, settings page loaded
     Action: click auto-join meetings toggle once
     Assertions: toggle state changes from on to off, visual classes update
     Requirements: testing-infrastructure.8.1 */
  test("should toggle auto-join meetings state on click", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Auto-join meetings");

    // Validate initial state is "on"
    await validateToggleState(toggle, "on");

    // Click and validate state changes to "off"
    await toggle.click();
    await validateToggleState(toggle, "off");

    // Click again and validate state returns to "on"
    await toggle.click();
    await validateToggleState(toggle, "on");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click auto-transcribe toggle once
     Assertions: toggle state changes from on to off, visual classes update
     Requirements: testing-infrastructure.8.1 */
  test("should toggle auto-transcribe state on click", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Auto-transcribe");

    // Validate initial state is "on"
    await validateToggleState(toggle, "on");

    // Click and validate state changes to "off"
    await toggle.click();
    await validateToggleState(toggle, "off");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click auto-create tasks toggle once
     Assertions: toggle state changes from on to off, visual classes update
     Requirements: testing-infrastructure.8.1 */
  test("should toggle auto-create tasks state on click", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Auto-create tasks");

    // Validate initial state is "on"
    await validateToggleState(toggle, "on");

    // Click and validate state changes to "off"
    await toggle.click();
    await validateToggleState(toggle, "off");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click email notifications toggle once
     Assertions: toggle state changes from on to off, visual classes update
     Requirements: testing-infrastructure.8.1 */
  test("should toggle email notifications state on click", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Email notifications");

    // Validate initial state is "on"
    await validateToggleState(toggle, "on");

    // Click and validate state changes to "off"
    await toggle.click();
    await validateToggleState(toggle, "off");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click slack notifications toggle once
     Assertions: toggle state changes from off to on, visual classes update
     Requirements: testing-infrastructure.8.1 */
  test("should toggle slack notifications state on click", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Slack notifications");

    // Validate initial state is "off"
    await validateToggleState(toggle, "off");

    // Click and validate state changes to "on"
    await toggle.click();
    await validateToggleState(toggle, "on");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});

test.describe("Settings Toggles - UI Reactivity", () => {
  /* Preconditions: authorized app session, settings page loaded
     Action: validate reactivity of all toggles by clicking twice each
     Assertions: each toggle changes state correctly and returns to initial state
     Requirements: testing-infrastructure.8.1 */
  test("should validate reactivity of all settings toggles", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Validate all toggles are reactive
    await validateAllToggles(page);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: rapidly click auto-join meetings toggle 5 times
     Assertions: final state is opposite of initial state (odd number of clicks)
     Requirements: testing-infrastructure.8.1 */
  test("should handle rapid toggle clicking correctly", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Test rapid clicking with odd number of clicks
    await validateRapidToggling(page, "Auto-join meetings", 5);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: rapidly click email notifications toggle 4 times
     Assertions: final state equals initial state (even number of clicks)
     Requirements: testing-infrastructure.8.1 */
  test("should return to initial state after even number of rapid clicks", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Test rapid clicking with even number of clicks
    await validateRapidToggling(page, "Email notifications", 4);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click toggle and validate inner circle position
     Assertions: circle translates right when on, no translation when off
     Requirements: testing-infrastructure.8.1 */
  test("should update toggle circle position based on state", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const toggle = await getToggleByLabel(page, "Auto-transcribe");

    // Validate circle position for "on" state
    await validateToggleState(toggle, "on");
    await validateToggleCirclePosition(toggle);

    // Click to turn off and validate circle position
    await toggle.click();
    await validateToggleState(toggle, "off");
    await validateToggleCirclePosition(toggle);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});

test.describe("Settings Toggles - Edge Cases", () => {
  /* Preconditions: authorized app session, settings page loaded
     Action: toggle multiple settings in sequence
     Assertions: each toggle maintains independent state
     Requirements: testing-infrastructure.8.1 */
  test("should maintain independent state for multiple toggles", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Turn off auto-join meetings
    const autoJoinToggle = await getToggleByLabel(page, "Auto-join meetings");
    await autoJoinToggle.click();
    await validateToggleState(autoJoinToggle, "off");

    // Turn off auto-transcribe
    const autoTranscribeToggle = await getToggleByLabel(page, "Auto-transcribe");
    await autoTranscribeToggle.click();
    await validateToggleState(autoTranscribeToggle, "off");

    // Verify auto-join is still off (independent state)
    await validateToggleState(autoJoinToggle, "off");

    // Turn on slack notifications
    const slackToggle = await getToggleByLabel(page, "Slack notifications");
    await slackToggle.click();
    await validateToggleState(slackToggle, "on");

    // Verify other toggles maintained their states
    await validateToggleState(autoJoinToggle, "off");
    await validateToggleState(autoTranscribeToggle, "off");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: navigate away from settings and back
     Assertions: toggle states are not persisted (reset to defaults)
     Requirements: testing-infrastructure.8.1 */
  test("should reset toggle states when navigating away and back", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Change toggle state
    const toggle = await getToggleByLabel(page, "Auto-join meetings");
    await toggle.click();
    await validateToggleState(toggle, "off");

    // Navigate away to dashboard
    await page.locator("nav").getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Navigate back to settings
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Verify toggle reset to default state (on)
    const toggleAfterNav = await getToggleByLabel(page, "Auto-join meetings");
    await validateToggleState(toggleAfterNav, "on");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: authorized app session, settings page loaded
     Action: click toggle that starts in off state (slack notifications)
     Assertions: toggle correctly changes from off to on
     Requirements: testing-infrastructure.8.1 */
  test("should handle toggle starting in off state", async () => {
    const userDataDir = await createUserDataDir();
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.locator("nav").getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Slack notifications starts as off
    const toggle = await getToggleByLabel(page, "Slack notifications");
    await validateToggleState(toggle, "off");

    // Turn it on
    await toggle.click();
    await validateToggleState(toggle, "on");

    // Turn it back off
    await toggle.click();
    await validateToggleState(toggle, "off");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
