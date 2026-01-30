import { describe, expect, it } from "vitest";

import { fileExists } from "../utils/fs";

describe("UI reference requirements", () => {
  /* Preconditions: docs folder exists.
     Action: check UI reference path.
     Assertions: UI reference directory exists.
     Requirements: E.U.1 */
  it("retains the UI reference directory", () => {
    expect(fileExists("docs/development/ui_reference")).toBe(true);
  });
});
