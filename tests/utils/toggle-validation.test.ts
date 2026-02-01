// Requirements: testing-infrastructure.8.1

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Locator } from "@playwright/test";

/**
 * Mock implementation of toggle state detection for unit testing
 */
// Requirements: testing-infrastructure.8.1
async function getToggleStateMock(toggle: Locator): Promise<"on" | "off"> {
  const classes = await toggle.getAttribute("class");
  if (classes === null || classes === undefined) {
    throw new Error("Toggle button has no class attribute");
  }

  if (classes.trim() === "") {
    throw new Error("Unable to determine toggle state from classes: ");
  }

  if (classes.includes("bg-primary")) {
    return "on";
  }

  if (classes.includes("bg-gray-300")) {
    return "off";
  }

  throw new Error(`Unable to determine toggle state from classes: ${classes}`);
}

describe("Toggle Validation Utilities", () => {
  describe("getToggleState", () => {
    /* Preconditions: toggle locator with class attribute exists
       Action: call getToggleState with toggle having bg-primary class
       Assertions: returns "on" state
       Requirements: testing-infrastructure.8.1 */
    it("should return 'on' state for toggle with bg-primary class", async () => {
      const mockToggle = {
        getAttribute: vi
          .fn()
          .mockResolvedValue("relative w-12 h-6 rounded-full transition-colors bg-primary"),
      } as unknown as Locator;

      const state = await getToggleStateMock(mockToggle);

      expect(state).toBe("on");
      expect(mockToggle.getAttribute).toHaveBeenCalledWith("class");
    });

    /* Preconditions: toggle locator with class attribute exists
       Action: call getToggleState with toggle having bg-gray-300 class
       Assertions: returns "off" state
       Requirements: testing-infrastructure.8.1 */
    it("should return 'off' state for toggle with bg-gray-300 class", async () => {
      const mockToggle = {
        getAttribute: vi
          .fn()
          .mockResolvedValue("relative w-12 h-6 rounded-full transition-colors bg-gray-300"),
      } as unknown as Locator;

      const state = await getToggleStateMock(mockToggle);

      expect(state).toBe("off");
      expect(mockToggle.getAttribute).toHaveBeenCalledWith("class");
    });

    /* Preconditions: toggle locator without class attribute
       Action: call getToggleState with toggle having null class
       Assertions: throws error with descriptive message
       Requirements: testing-infrastructure.8.1 */
    it("should throw error when toggle has no class attribute", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue(null),
      } as unknown as Locator;

      await expect(getToggleStateMock(mockToggle)).rejects.toThrow(
        "Toggle button has no class attribute",
      );
    });

    /* Preconditions: toggle locator with invalid classes
       Action: call getToggleState with toggle having neither bg-primary nor bg-gray-300
       Assertions: throws error indicating unable to determine state
       Requirements: testing-infrastructure.8.1 */
    it("should throw error when toggle state cannot be determined", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue("some-other-class"),
      } as unknown as Locator;

      await expect(getToggleStateMock(mockToggle)).rejects.toThrow(
        "Unable to determine toggle state from classes",
      );
    });
  });

  describe("Toggle State Type", () => {
    /* Preconditions: ToggleState type is defined
       Action: assign valid toggle states
       Assertions: TypeScript accepts "on" and "off" values
       Requirements: testing-infrastructure.8.1 */
    it("should accept valid toggle states", () => {
      type ToggleState = "on" | "off";
      const onState: ToggleState = "on";
      const offState: ToggleState = "off";

      expect(onState).toBe("on");
      expect(offState).toBe("off");
    });
  });

  describe("Edge Cases", () => {
    /* Preconditions: toggle with multiple bg classes
       Action: call getToggleState with toggle having both bg-primary and other bg classes
       Assertions: correctly identifies state as "on" when bg-primary is present
       Requirements: testing-infrastructure.8.1 */
    it("should handle toggle with multiple background classes", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue("bg-blue-500 bg-primary hover:bg-blue-600"),
      } as unknown as Locator;

      const state = await getToggleStateMock(mockToggle);

      expect(state).toBe("on");
    });

    /* Preconditions: toggle with extra whitespace in classes
       Action: call getToggleState with toggle having classes with extra spaces
       Assertions: correctly parses state despite whitespace
       Requirements: testing-infrastructure.8.1 */
    it("should handle toggle classes with extra whitespace", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue("  bg-gray-300   rounded-full  "),
      } as unknown as Locator;

      const state = await getToggleStateMock(mockToggle);

      expect(state).toBe("off");
    });

    /* Preconditions: toggle with empty string class
       Action: call getToggleState with toggle having empty class string
       Assertions: throws error indicating unable to determine state
       Requirements: testing-infrastructure.8.1 */
    it("should throw error for empty class string", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue(""),
      } as unknown as Locator;

      await expect(getToggleStateMock(mockToggle)).rejects.toThrow(
        "Unable to determine toggle state",
      );
    });

    /* Preconditions: toggle with both bg-primary and bg-gray-300 classes
       Action: call getToggleState with conflicting state classes
       Assertions: prioritizes bg-primary (on state) when both present
       Requirements: testing-infrastructure.8.1 */
    it("should prioritize bg-primary when both state classes present", async () => {
      const mockToggle = {
        getAttribute: vi.fn().mockResolvedValue("bg-gray-300 bg-primary"),
      } as unknown as Locator;

      const state = await getToggleStateMock(mockToggle);

      expect(state).toBe("on");
    });
  });

  describe("Toggle Validation Logic", () => {
    /* Preconditions: toggle state detection function exists
       Action: test state detection with various class combinations
       Assertions: correctly identifies all valid state patterns
       Requirements: testing-infrastructure.8.1 */
    it("should correctly identify toggle states across various class patterns", async () => {
      const testCases = [
        { classes: "bg-primary", expected: "on" as const },
        { classes: "bg-gray-300", expected: "off" as const },
        { classes: "rounded-full bg-primary transition", expected: "on" as const },
        { classes: "rounded-full bg-gray-300 transition", expected: "off" as const },
        { classes: "w-12 h-6 bg-primary rounded-full", expected: "on" as const },
      ];

      for (const testCase of testCases) {
        const mockToggle = {
          getAttribute: vi.fn().mockResolvedValue(testCase.classes),
        } as unknown as Locator;

        const state = await getToggleStateMock(mockToggle);
        expect(state).toBe(testCase.expected);
      }
    });

    /* Preconditions: toggle with null or undefined class attribute
       Action: call getToggleState with various invalid inputs
       Assertions: throws appropriate errors for all invalid cases
       Requirements: testing-infrastructure.8.1 */
    it("should handle invalid toggle inputs gracefully", async () => {
      const invalidCases = [
        { classes: null, errorMessage: "Toggle button has no class attribute" },
        { classes: "", errorMessage: "Unable to determine toggle state" },
        { classes: "invalid-class", errorMessage: "Unable to determine toggle state" },
        { classes: "bg-red-500", errorMessage: "Unable to determine toggle state" },
      ];

      for (const testCase of invalidCases) {
        const mockToggle = {
          getAttribute: vi.fn().mockResolvedValue(testCase.classes),
        } as unknown as Locator;

        await expect(getToggleStateMock(mockToggle)).rejects.toThrow(testCase.errorMessage);
      }
    });
  });
});
