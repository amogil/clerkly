import { describe, expect, it } from "vitest";

import { fileExists, readText } from "../utils/fs";

describe("UI reference requirements", () => {
  /* Preconditions: docs folder exists.
     Action: check UI reference path.
     Assertions: UI reference directory exists.
     Requirements: branding-system.1.1 */
  it("retains the UI reference directory", () => {
    expect(fileExists("docs/development/ui_reference")).toBe(true);
  });

  /* Preconditions: auth gate exists.
     Action: inspect auth gate layout.
     Assertions: Logo component is rendered with expected props.
     Requirements: branding-system.1.2 */
  it("renders the auth gate logo from the UI reference", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain('<Logo size="md" showText={true} />');
  });

  /* Preconditions: navigation component exists.
     Action: inspect left navigation layout.
     Assertions: Logo component is rendered with expected props and toggled by collapse state.
     Requirements: sidebar-navigation.1.1 */
  it("renders the sidebar logo from the UI reference", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('<Logo size="md" showText={!collapsed} />');
  });

  /* Preconditions: navigation component exists.
     Action: inspect left navigation tagline.
     Assertions: tagline matches required text and hides when collapsed.
     Requirements: sidebar-navigation.1.2 */
  it("renders the sidebar tagline text", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("Stay on track");
    expect(source).toContain("!collapsed ? <p");
  });

  /* Preconditions: navigation component exists.
     Action: inspect settings placement.
     Assertions: settings item is rendered in the bottom section.
     Requirements: sidebar-navigation.1.3 */
  it("renders settings in the sidebar bottom section", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("const settingsItem");
    expect(source).toContain("border-t");
    expect(source).toContain("onNavigate(settingsItem.id)");
  });

  /* Preconditions: navigation component exists.
     Action: inspect collapse control.
     Assertions: toggle control is present.
     Requirements: sidebar-navigation.1.4 */
  it("includes a sidebar collapse control", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain("onToggleCollapse");
    expect(source).toContain("Expand sidebar");
    expect(source).toContain("Collapse sidebar");
  });

  /* Preconditions: navigation component exists.
     Action: inspect collapsed layout behavior.
     Assertions: width reduces and labels are hidden.
     Requirements: sidebar-navigation.1.5 */
  it("renders a collapsed sidebar layout", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('collapsed ? "w-20" : "w-64"');
    expect(source).toContain("!collapsed ? <span>");
  });

  /* Preconditions: navigation component exists.
     Action: inspect toggle placement layout.
     Assertions: header layout keeps logo and toggle in-row within bounds.
     Requirements: sidebar-navigation.1.6 */
  it("keeps the sidebar toggle within the logo header bounds", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('collapsed ? "pl-2 pr-1 py-3" : "p-6"');
    expect(source).toContain('collapsed ? "gap-1" : "gap-2"');
    expect(source).toContain("shrink-0 p-1");
  });

  /* Preconditions: navigation component exists.
     Action: inspect navigation icon sizing.
     Assertions: icon sizing uses a shared class name regardless of collapse.
     Requirements: sidebar-navigation.1.7 */
  it("keeps navigation icon sizes consistent when collapsed", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    expect(source).toContain('const navIconClassName = "w-5 h-5 shrink-0"');
    expect(source).toContain("className={navIconClassName}");
  });

  /* Preconditions: navigation component exists.
     Action: inspect collapsed layout alignment.
     Assertions: collapsed layout centers icons in the button.
     Requirements: sidebar-navigation.1.8 */
  it("centers collapsed navigation icons", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    // Check for useMemo-wrapped navButtonClassName
    expect(source).toContain("const navButtonClassName = useMemo(");
    expect(source).toContain("(isActive: boolean): string => {");
    expect(source).toContain(
      'const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4"',
    );
  });

  /* Preconditions: navigation component exists.
     Action: inspect ARIA attributes for accessibility.
     Assertions: nav has role and aria-label, buttons have aria-expanded, aria-current, aria-label, icons have aria-hidden.
     Requirements: sidebar-navigation.2.5 */
  it("includes ARIA attributes for accessibility", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    // Nav element has role and aria-label
    expect(source).toContain('role="navigation"');
    expect(source).toContain('aria-label="Main navigation"');
    // Toggle button has aria-expanded
    expect(source).toContain("aria-expanded={!collapsed}");
    // Navigation buttons have aria-label in collapsed mode
    expect(source).toContain("aria-label={collapsed ? item.label : undefined}");
    expect(source).toContain("aria-label={collapsed ? settingsItem.label : undefined}");
    // Active navigation items have aria-current
    expect(source).toContain('aria-current={isActive ? "page" : undefined}');
    // Icons have aria-hidden
    expect(source).toContain('aria-hidden="true"');
  });

  /* Preconditions: navigation component exists.
     Action: inspect tabIndex attributes for keyboard navigation.
     Assertions: all interactive buttons have tabIndex={0} for keyboard accessibility.
     Requirements: sidebar-navigation.2.5 */
  it("includes tabIndex for keyboard navigation", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    // All buttons should have tabIndex={0}
    expect(source).toContain("tabIndex={0}");
  });

  /* Preconditions: navigation component exists.
     Action: inspect keyboard event handlers.
     Assertions: Enter and Space key handlers are implemented for navigation items.
     Requirements: sidebar-navigation.2.5 */
  it("includes keyboard event handlers for Enter and Space keys", () => {
    const source = readText("renderer/src/app/components/navigation.tsx");
    // handleKeyDown function exists with useCallback
    expect(source).toContain("const handleKeyDown = useCallback(");
    expect(source).toContain("(event: React.KeyboardEvent, itemId: string)");
    // Checks for Enter key (Space is handled natively by button elements)
    expect(source).toContain('event.key === "Enter"');
    // Prevents default behavior
    expect(source).toContain("event.preventDefault()");
    // Calls onNavigate
    expect(source).toContain("onNavigate(itemId)");
    // Applied to navigation buttons
    expect(source).toContain("onKeyDown={(e) => handleKeyDown(e, item.id)}");
    expect(source).toContain("onKeyDown={(e) => handleKeyDown(e, settingsItem.id)}");
    // Buttons have onClick for native Space key support
    expect(source).toContain("onClick={() => onNavigate(item.id)}");
    expect(source).toContain("onClick={() => onNavigate(settingsItem.id)}");
  });
});
