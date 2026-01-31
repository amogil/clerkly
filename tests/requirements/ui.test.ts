import { describe, expect, it } from "vitest";

import { fileExists, readText } from "../utils/fs";

describe("UI reference requirements", () => {
  /* Preconditions: docs folder exists.
     Action: check UI reference path.
     Assertions: UI reference directory exists.
     Requirements: E.U.1 */
  it("retains the UI reference directory", () => {
    expect(fileExists("docs/development/ui_reference")).toBe(true);
  });

  /* Preconditions: auth gate exists.
     Action: inspect auth gate layout.
     Assertions: Logo component is rendered with expected props.
     Requirements: E.U.2 */
  it("renders the auth gate logo from the UI reference", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain('<Logo size="md" showText={true} />');
  });
});
