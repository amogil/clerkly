// Requirements: sidebar-navigation.2.5
import { test, expect } from "./fixtures/test-isolation";

// Requirements: sidebar-navigation.2.5
test.describe("Navigation Focus Management", () => {
  /* Preconditions: application started with default state
     Action: use Tab key to navigate through all interactive elements
     Assertions: all buttons are focusable in logical order
     Requirements: sidebar-navigation.2.5 */
  test("should have logical tab navigation order in expanded state", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    // Wait for navigation to be visible
    await page.waitForSelector('nav[role="navigation"]');

    // Focus on the toggle button explicitly to start
    const toggleButton = page.locator('button[aria-label="Collapse sidebar"]');
    await toggleButton.focus();

    // Check focus order: toggle button first
    let focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        ariaLabel: el?.getAttribute("aria-label"),
      };
    });
    expect(focusedElement.ariaLabel).toBe("Collapse sidebar");

    // Tab to Dashboard
    await page.keyboard.press("Tab");
    focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        text: el?.textContent?.trim(),
        ariaCurrent: el?.getAttribute("aria-current"),
      };
    });
    expect(focusedElement.text).toContain("Dashboard");

    // Tab to Calendar
    await page.keyboard.press("Tab");
    focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { text: el?.textContent?.trim() };
    });
    expect(focusedElement.text).toContain("Calendar");

    // Tab to Tasks
    await page.keyboard.press("Tab");
    focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { text: el?.textContent?.trim() };
    });
    expect(focusedElement.text).toContain("Tasks");

    // Tab to Contacts
    await page.keyboard.press("Tab");
    focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { text: el?.textContent?.trim() };
    });
    expect(focusedElement.text).toContain("Contacts");

    // Tab to Settings (last element)
    await page.keyboard.press("Tab");
    focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { text: el?.textContent?.trim() };
    });
    expect(focusedElement.text).toContain("Settings");
  });

  /* Preconditions: application started, sidebar collapsed
     Action: use Tab key to navigate through all interactive elements
     Assertions: tab order remains logical in collapsed state
     Requirements: sidebar-navigation.2.5 */
  test("should maintain logical tab order in collapsed state", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    // Collapse the sidebar first
    await page.click('button[aria-label="Collapse sidebar"]');
    await page.waitForTimeout(500); // Wait for animation

    // Focus on the toggle button explicitly to start
    const toggleButton = page.locator('button[aria-label="Expand sidebar"]');
    await toggleButton.focus();

    // Check focus order: toggle button first (now says "Expand")
    let focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { ariaLabel: el?.getAttribute("aria-label") };
    });
    expect(focusedElement.ariaLabel).toBe("Expand sidebar");

    // Tab through navigation items (they have aria-label in collapsed mode)
    const expectedLabels = ["Dashboard", "Calendar", "Tasks", "Contacts", "Settings"];

    for (const label of expectedLabels) {
      await page.keyboard.press("Tab");
      focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return { ariaLabel: el?.getAttribute("aria-label") };
      });
      expect(focusedElement.ariaLabel).toBe(label);
    }
  });

  /* Preconditions: application started with default state
     Action: focus on toggle button and check computed styles
     Assertions: visible focus indicator with outline is present
     Requirements: sidebar-navigation.2.5 */
  test("should have visible focus indicators on toggle button", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    // Focus on toggle button
    const toggleButton = page.locator('button[aria-label="Collapse sidebar"]');
    await toggleButton.focus();

    // Check that focus-visible classes are present
    const className = await toggleButton.getAttribute("class");
    expect(className).toContain("focus-visible:outline");
    expect(className).toContain("focus-visible:outline-2");
    expect(className).toContain("focus-visible:outline-ring");
    expect(className).toContain("focus-visible:outline-offset-2");

    // Verify the button is actually focused
    const isFocused = await page.evaluate(() => {
      const toggle = document.querySelector('button[aria-label="Collapse sidebar"]');
      return document.activeElement === toggle;
    });
    expect(isFocused).toBe(true);
  });

  /* Preconditions: application started with default state
     Action: focus on each navigation button and check for focus indicators
     Assertions: all navigation buttons have visible focus indicator classes
     Requirements: sidebar-navigation.2.5 */
  test("should have visible focus indicators on all navigation buttons", async ({
    isolatedApp,
  }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    const navItems = ["Dashboard", "Calendar", "Tasks", "Contacts", "Settings"];

    for (const item of navItems) {
      const button = page.locator(`button:has-text("${item}")`);
      await button.focus();

      const className = await button.getAttribute("class");
      expect(className).toContain("focus-visible:outline");
      expect(className).toContain("focus-visible:outline-2");
      expect(className).toContain("focus-visible:outline-ring");
      expect(className).toContain("focus-visible:outline-offset-2");
    }
  });

  /* Preconditions: application started, sidebar collapsed
     Action: focus on navigation buttons in collapsed state
     Assertions: focus indicators remain visible in collapsed mode
     Requirements: sidebar-navigation.2.5 */
  test("should maintain focus indicators in collapsed state", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    // Collapse the sidebar
    await page.click('button[aria-label="Collapse sidebar"]');
    await page.waitForTimeout(500);

    const navItems = ["Dashboard", "Calendar", "Tasks", "Contacts", "Settings"];

    for (const item of navItems) {
      const button = page.locator(`button[aria-label="${item}"]`);
      await button.focus();

      const className = await button.getAttribute("class");
      expect(className).toContain("focus-visible:outline");
      expect(className).toContain("focus-visible:outline-2");
      expect(className).toContain("focus-visible:outline-ring");
      expect(className).toContain("focus-visible:outline-offset-2");
    }
  });

  /* Preconditions: application started with default state
     Action: focus on navigation button and press Enter key
     Assertions: navigation occurs and onNavigate is called
     Requirements: sidebar-navigation.2.5 */
  test("should support keyboard activation with Enter key", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    // Focus on Calendar button
    const calendarButton = page.locator('button:has-text("Calendar")');
    await calendarButton.focus();

    // Press Enter to activate
    await page.keyboard.press("Enter");

    // Wait a moment for navigation
    await page.waitForTimeout(200);

    // Check that Calendar is now active
    const isActive = await page.evaluate(() => {
      const calendarBtn = Array.from(document.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Calendar"),
      );
      return calendarBtn?.getAttribute("aria-current") === "page";
    });
    expect(isActive).toBe(true);
  });

  /* Preconditions: application started with default state
     Action: focus on navigation button and press Space key
     Assertions: navigation occurs and onNavigate is called
     Requirements: sidebar-navigation.2.5 */
  test("should support keyboard activation with Space key", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    
    // Wait for auth to complete and dashboard to be visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });
    
    await page.waitForSelector('nav[role="navigation"]');

    // Focus on Tasks button
    const tasksButton = page.locator('button:has-text("Tasks")');
    await tasksButton.focus();

    // Press Space to activate
    await page.keyboard.press("Space");

    // Wait a moment for navigation
    await page.waitForTimeout(200);

    // Check that Tasks is now active
    const isActive = await page.evaluate(() => {
      const tasksBtn = Array.from(document.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Tasks"),
      );
      return tasksBtn?.getAttribute("aria-current") === "page";
    });
    expect(isActive).toBe(true);
  });

  /* Preconditions: application started with default state
     Action: check all interactive elements for tabIndex attribute
     Assertions: all buttons have tabIndex="0" for keyboard accessibility
     Requirements: sidebar-navigation.2.5 */
  test("should have tabIndex=0 on all interactive elements", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    await page.waitForSelector('nav[role="navigation"]');

    // Get all buttons in the navigation
    const buttons = await page.locator('nav[role="navigation"] button').all();

    // Should have 6 buttons: toggle + 4 nav items + settings
    expect(buttons.length).toBe(6);

    // Check each button has tabIndex="0"
    for (const button of buttons) {
      const tabIndex = await button.getAttribute("tabIndex");
      expect(tabIndex).toBe("0");
    }
  });

  /* Preconditions: application started, different screens active
     Action: navigate to each screen and check focus indicators
     Assertions: focus indicators present on both active and inactive buttons
     Requirements: sidebar-navigation.2.5 */
  test("should have focus indicators on both active and inactive buttons", async ({
    isolatedApp,
  }) => {
    const { page } = isolatedApp;
    await page.waitForSelector('nav[role="navigation"]');

    const screens = ["Dashboard", "Calendar", "Tasks", "Contacts", "Settings"];

    for (const screen of screens) {
      // Navigate to the screen
      await page.click(`button:has-text("${screen}")`);
      await page.waitForTimeout(200);

      // Check all buttons still have focus indicator classes
      const buttons = await page.locator('nav[role="navigation"] button').all();

      for (const button of buttons) {
        const className = await button.getAttribute("class");
        if (className) {
          // Skip toggle button which has different classes
          const ariaLabel = await button.getAttribute("aria-label");
          if (ariaLabel?.includes("sidebar")) {
            expect(className).toContain("focus-visible:outline");
          } else {
            // Navigation buttons
            expect(className).toContain("focus-visible:outline");
            expect(className).toContain("focus-visible:outline-2");
          }
        }
      }
    }
  });

  /* Preconditions: application started with default state
     Action: check nav element for proper ARIA attributes
     Assertions: nav has role="navigation" and aria-label
     Requirements: sidebar-navigation.2.5 */
  test("should have proper ARIA attributes on nav container", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    await page.waitForSelector('nav[role="navigation"]');

    const nav = page.locator('nav[role="navigation"]');

    const role = await nav.getAttribute("role");
    expect(role).toBe("navigation");

    const ariaLabel = await nav.getAttribute("aria-label");
    expect(ariaLabel).toBe("Main navigation");
  });

  /* Preconditions: application started with default state
     Action: check toggle button for explicit type attribute
     Assertions: toggle button has type="button" to prevent form submission
     Requirements: sidebar-navigation.2.5 */
  test("should have explicit button type on toggle button", async ({ isolatedApp }) => {
    const { page } = isolatedApp;
    await page.waitForSelector('nav[role="navigation"]');

    const toggleButton = page.locator('button[aria-label="Collapse sidebar"]');
    const buttonType = await toggleButton.getAttribute("type");

    expect(buttonType).toBe("button");
  });
});
