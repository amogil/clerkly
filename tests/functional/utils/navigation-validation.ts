// Requirements: testing-infrastructure.7.2
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Navigation item identifier
 */
export type NavigationItem = "dashboard" | "calendar" | "tasks" | "contacts" | "settings";

/**
 * Interface for navigation active state validation
 */
export interface NavigationActiveState {
  activeItem: NavigationItem;
  inactiveItems: NavigationItem[];
}

/**
 * Get all navigation items as locators
 * Uses a strategy that works with both expanded and collapsed sidebar states
 * by finding buttons by their position and icon presence
 */
export function getNavigationItems(page: Page): Record<NavigationItem, Locator> {
  const nav = page.locator("nav");

  // Get all navigation buttons in the main section (not settings)
  const mainNavButtons = nav.locator("div.flex-1").locator("button");

  // Settings button is in the bottom section
  const settingsButton = nav.locator("div.border-t").locator("button");

  return {
    dashboard: mainNavButtons.nth(0),
    calendar: mainNavButtons.nth(1),
    tasks: mainNavButtons.nth(2),
    contacts: mainNavButtons.nth(3),
    settings: settingsButton,
  };
}

/**
 * Validate that the specified navigation item is active
 * and all other items are inactive
 */
export async function validateActiveNavigationItem(
  page: Page,
  expectedActiveItem: NavigationItem,
): Promise<void> {
  const navItems = getNavigationItems(page);
  const allItems: NavigationItem[] = ["dashboard", "calendar", "tasks", "contacts", "settings"];

  // Check that the expected item is active
  const activeItem = navItems[expectedActiveItem];
  await expect(activeItem).toHaveClass(/bg-primary/);
  await expect(activeItem).toHaveClass(/text-primary-foreground/);

  // Check that all other items are inactive
  for (const itemName of allItems) {
    if (itemName !== expectedActiveItem) {
      const inactiveItem = navItems[itemName];
      const className = await inactiveItem.getAttribute("class");
      expect(className).not.toContain("bg-primary");
      expect(className).not.toContain("text-primary-foreground");
    }
  }
}

/**
 * Validate that the active navigation item corresponds to the current section
 * by checking both the navigation state and the page heading
 */
export async function validateNavigationCorrespondence(
  page: Page,
  section: NavigationItem,
): Promise<void> {
  // Validate active navigation item
  await validateActiveNavigationItem(page, section);

  // Validate corresponding page heading is visible
  const headingText = section.charAt(0).toUpperCase() + section.slice(1);
  await expect(page.getByRole("heading", { name: headingText, level: 1 })).toBeVisible();
}

/**
 * Navigate to a section and validate the active state
 */
export async function navigateAndValidate(page: Page, section: NavigationItem): Promise<void> {
  const navItems = getNavigationItems(page);
  const targetItem = navItems[section];

  // Navigate to the section
  await targetItem.click();

  // Validate the navigation correspondence
  await validateNavigationCorrespondence(page, section);
}

/**
 * Get the current active navigation item
 */
export async function getCurrentActiveItem(page: Page): Promise<NavigationItem | null> {
  const navItems = getNavigationItems(page);
  const allItems: NavigationItem[] = ["dashboard", "calendar", "tasks", "contacts", "settings"];

  for (const itemName of allItems) {
    const item = navItems[itemName];
    const className = await item.getAttribute("class");
    if (className?.includes("bg-primary")) {
      return itemName;
    }
  }

  return null;
}

/**
 * Validate that exactly one navigation item is active
 */
export async function validateSingleActiveItem(page: Page): Promise<void> {
  const navItems = getNavigationItems(page);
  const allItems: NavigationItem[] = ["dashboard", "calendar", "tasks", "contacts", "settings"];

  let activeCount = 0;
  let activeItemName: NavigationItem | null = null;

  for (const itemName of allItems) {
    const item = navItems[itemName];
    const className = await item.getAttribute("class");
    if (className?.includes("bg-primary")) {
      activeCount++;
      activeItemName = itemName;
    }
  }

  expect(activeCount).toBe(1);
  expect(activeItemName).not.toBeNull();
}
