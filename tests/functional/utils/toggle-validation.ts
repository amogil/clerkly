// Requirements: testing-infrastructure.8.1

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Toggle identifier for settings page
 */
export type ToggleId =
  | "auto-join-meetings"
  | "auto-transcribe"
  | "auto-create-tasks"
  | "email-notifications"
  | "slack-notifications";

/**
 * Toggle state representation
 */
export type ToggleState = "on" | "off";

/**
 * Toggle test data structure
 */
export interface ToggleTestData {
  id: ToggleId;
  label: string;
  initialState: ToggleState;
}

/**
 * Get toggle button by its label text
 */
export async function getToggleByLabel(page: Page, label: string): Promise<Locator> {
  const row = page.getByText(label, { exact: false }).locator("..").locator("..");
  return row.getByRole("button");
}

/**
 * Get current toggle state based on CSS classes
 */
export async function getToggleState(toggle: Locator): Promise<ToggleState> {
  const classes = await toggle.getAttribute("class");
  if (classes === null || classes === undefined) {
    throw new Error("Toggle button has no class attribute");
  }

  if (classes.trim() === "") {
    throw new Error("Unable to determine toggle state from classes: ");
  }

  // Check if toggle is in "on" state (has bg-primary class)
  if (classes.includes("bg-primary")) {
    return "on";
  }

  // Check if toggle is in "off" state (has bg-gray-300 class)
  if (classes.includes("bg-gray-300")) {
    return "off";
  }

  throw new Error(`Unable to determine toggle state from classes: ${classes}`);
}

/**
 * Validate toggle visual state matches expected state
 */
export async function validateToggleState(
  toggle: Locator,
  expectedState: ToggleState,
): Promise<void> {
  if (expectedState === "on") {
    await expect(toggle).toHaveClass(/bg-primary/);
  } else {
    await expect(toggle).toHaveClass(/bg-gray-300/);
  }
}

/**
 * Click toggle and validate state change
 */
export async function clickAndValidateToggle(
  toggle: Locator,
  expectedNewState: ToggleState,
): Promise<void> {
  await toggle.click();
  await validateToggleState(toggle, expectedNewState);
}

/**
 * Validate toggle reactivity by clicking and checking state change
 */
export async function validateToggleReactivity(
  page: Page,
  label: string,
  initialState: ToggleState,
): Promise<void> {
  const toggle = await getToggleByLabel(page, label);

  // Validate initial state
  await validateToggleState(toggle, initialState);

  // Click and validate state changes to opposite
  const expectedNewState = initialState === "on" ? "off" : "on";
  await clickAndValidateToggle(toggle, expectedNewState);

  // Click again and validate it returns to initial state
  await clickAndValidateToggle(toggle, initialState);
}

/**
 * Validate all toggles on settings page
 */
export async function validateAllToggles(page: Page): Promise<void> {
  const toggles: ToggleTestData[] = [
    { id: "auto-join-meetings", label: "Auto-join meetings", initialState: "on" },
    { id: "auto-transcribe", label: "Auto-transcribe", initialState: "on" },
    { id: "auto-create-tasks", label: "Auto-create tasks", initialState: "on" },
    { id: "email-notifications", label: "Email notifications", initialState: "on" },
    { id: "slack-notifications", label: "Slack notifications", initialState: "off" },
  ];

  for (const toggleData of toggles) {
    await validateToggleReactivity(page, toggleData.label, toggleData.initialState);
  }
}

/**
 * Validate rapid toggle clicking (stress test)
 */
export async function validateRapidToggling(
  page: Page,
  label: string,
  clickCount: number,
): Promise<void> {
  const toggle = await getToggleByLabel(page, label);
  const initialState = await getToggleState(toggle);

  // Perform rapid clicks
  for (let i = 0; i < clickCount; i++) {
    await toggle.click();
  }

  // Final state should be opposite of initial if odd number of clicks
  const expectedFinalState =
    clickCount % 2 === 0 ? initialState : initialState === "on" ? "off" : "on";
  await validateToggleState(toggle, expectedFinalState);
}

/**
 * Validate toggle inner circle position matches state
 */
export async function validateToggleCirclePosition(toggle: Locator): Promise<void> {
  const state = await getToggleState(toggle);
  const circle = toggle.locator("div");

  const classes = await circle.getAttribute("class");
  if (!classes) {
    throw new Error("Toggle circle has no class attribute");
  }

  if (state === "on") {
    // When on, circle should be translated to the right
    expect(classes).toContain("translate-x-6");
  } else {
    // When off, circle should not be translated
    expect(classes).not.toContain("translate-x-6");
  }
}
