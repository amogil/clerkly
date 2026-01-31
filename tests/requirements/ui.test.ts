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

  /* Preconditions: navigation component exists.
     Action: inspect left navigation layout.
     Assertions: Logo component is rendered with expected props.
     Requirements: E.U.3 */
  it("renders the sidebar logo from the UI reference", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('<Logo size="md" showText={true} />');
  });

  /* Preconditions: navigation component exists.
     Action: inspect left navigation tagline.
     Assertions: tagline matches required text.
     Requirements: E.U.4 */
  it("renders the sidebar tagline text", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("Stay on track");
  });

  /* Preconditions: navigation component exists.
     Action: inspect settings placement.
     Assertions: settings item is rendered in the bottom section.
     Requirements: E.U.5 */
  it("renders settings in the sidebar bottom section", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("const settingsItem");
    expect(source).toContain("border-t");
    expect(source).toContain("onNavigate(settingsItem.id)");
  });
});
