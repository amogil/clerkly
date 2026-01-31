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
     Assertions: Logo component is rendered with expected props and toggled by collapse state.
     Requirements: E.U.3 */
  it("renders the sidebar logo from the UI reference", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('<Logo size="md" showText={!collapsed} />');
  });

  /* Preconditions: navigation component exists.
     Action: inspect left navigation tagline.
     Assertions: tagline matches required text and hides when collapsed.
     Requirements: E.U.4 */
  it("renders the sidebar tagline text", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("Stay on track");
    expect(source).toContain("!collapsed ? <p");
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

  /* Preconditions: navigation component exists.
     Action: inspect collapse control.
     Assertions: toggle control is present.
     Requirements: E.U.6 */
  it("includes a sidebar collapse control", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("onToggleCollapse");
    expect(source).toContain("Expand sidebar");
    expect(source).toContain("Collapse sidebar");
  });

  /* Preconditions: navigation component exists.
     Action: inspect collapsed layout behavior.
     Assertions: width reduces and labels are hidden.
     Requirements: E.U.7 */
  it("renders a collapsed sidebar layout", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('collapsed ? "w-20" : "w-64"');
    expect(source).toContain("!collapsed ? <span>");
  });

  /* Preconditions: navigation component exists.
     Action: inspect toggle placement layout.
     Assertions: header layout keeps logo and toggle in-row within bounds.
     Requirements: E.U.8 */
  it("keeps the sidebar toggle within the logo header bounds", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('collapsed ? "pl-2 pr-1 py-3" : "p-6"');
    expect(source).toContain('collapsed ? "gap-1" : "gap-2"');
    expect(source).toContain("shrink-0 p-1");
  });
});
