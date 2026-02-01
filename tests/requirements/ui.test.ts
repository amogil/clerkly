import { describe, expect, it } from "vitest";

import { fileExists } from "../utils/fs";

describe("UI reference requirements", () => {
  /* Preconditions: docs folder exists.
     Action: check UI reference path.
     Assertions: UI reference directory exists.
     Requirements: branding-system.1.1 */
  it("retains the UI reference directory", () => {
    expect(fileExists("docs/development/ui_reference")).toBe(true);
  });

  /* Preconditions: auth gate component exists.
     Action: check auth gate file exists.
     Assertions: auth-gate.tsx file is present.
     Requirements: ui-cleanup.2.10, ui-cleanup.7.1 */
  it("retains the auth gate component", () => {
    expect(fileExists("renderer/src/app/components/auth-gate.tsx")).toBe(true);
  });
});
