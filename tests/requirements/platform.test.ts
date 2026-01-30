import { describe, expect, it } from "vitest";

import { readJson, readText } from "../utils/fs";

type PackageJson = {
  os?: string[];
  scripts?: Record<string, string>;
};

describe("Platform and App Shell requirements", () => {
  /* Preconditions: package.json is present.
     Action: read package.json.
     Assertions: os includes darwin.
     Requirements: E.P.1 */
  it("targets macOS in package metadata", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.os).toContain("darwin");
  });

  /* Preconditions: main.ts exists.
     Action: read main.ts contents.
     Assertions: BrowserWindow is used and renderer index is loaded.
     Requirements: E.P.2 */
  it("has a functioning main process and renderer entry", () => {
    const mainSource = readText("main.ts");
    expect(mainSource).toContain("BrowserWindow");
    expect(mainSource).toContain("renderer");
    expect(mainSource).toContain("index.html");
  });

  /* Preconditions: main.ts exists.
     Action: read main.ts contents.
     Assertions: window is maximized and fullscreen is not enabled.
     Requirements: E.P.3 */
  it("maximizes the window without fullscreen", () => {
    const mainSource = readText("main.ts");
    expect(mainSource).toContain("maximize()");
    expect(mainSource).not.toMatch(/setFullScreen\(\s*true\s*\)/);
    expect(mainSource).not.toMatch(/fullscreen:\s*true/);
  });

  /* Preconditions: package.json is present.
     Action: read npm scripts.
     Assertions: dev script exists.
     Requirements: E.P.4 */
  it("provides a development script", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.scripts?.dev).toBeTruthy();
  });

  /* Preconditions: main.ts exists.
     Action: read main.ts contents.
     Assertions: window title uses Clerkly.
     Requirements: E.P.6 */
  it("sets the application title to Clerkly", () => {
    const mainSource = readText("main.ts");
    expect(mainSource).toMatch(/title:\s*"Clerkly"/);
  });
});
