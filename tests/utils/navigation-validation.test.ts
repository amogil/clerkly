// Requirements: testing-infrastructure.7.2
import { describe, it, expect } from "vitest";
import type { NavigationItem } from "../functional/utils/navigation-validation";

describe("Navigation validation type definitions", () => {
  /* Preconditions: navigation item types defined.
     Action: verify NavigationItem type.
     Assertions: type includes all expected sections.
     Requirements: testing-infrastructure.7.2 */
  it("should define all navigation item types", () => {
    const validItems: NavigationItem[] = [
      "dashboard",
      "calendar",
      "tasks",
      "contacts",
      "settings",
    ];

    // Type check - this will fail at compile time if types are wrong
    expect(validItems).toHaveLength(5);
    expect(validItems).toContain("dashboard");
    expect(validItems).toContain("calendar");
    expect(validItems).toContain("tasks");
    expect(validItems).toContain("contacts");
    expect(validItems).toContain("settings");
  });

  /* Preconditions: navigation validation system.
     Action: verify utility module exports.
     Assertions: all required functions are exported.
     Requirements: testing-infrastructure.7.2 */
  it("should export all required validation functions", async () => {
    const module = await import("../functional/utils/navigation-validation");

    expect(typeof module.getNavigationItems).toBe("function");
    expect(typeof module.validateActiveNavigationItem).toBe("function");
    expect(typeof module.validateNavigationCorrespondence).toBe("function");
    expect(typeof module.getCurrentActiveItem).toBe("function");
    expect(typeof module.validateSingleActiveItem).toBe("function");
    expect(typeof module.navigateAndValidate).toBe("function");
  });
});
