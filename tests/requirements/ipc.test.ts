import { describe, expect, it } from "vitest";

import { readText } from "../utils/fs";

describe("IPC and architecture requirements", () => {
  /* Preconditions: renderer sources exist.
     Action: inspect renderer for electron imports.
     Assertions: renderer does not import electron directly.
     Requirements: E.I.1 */
  it("keeps renderer free of direct Electron imports", () => {
    const rendererMain = readText("renderer/src/main.tsx");
    const app = readText("renderer/src/app/App.tsx");
    expect(rendererMain).not.toContain('from "electron"');
    expect(app).not.toContain('from "electron"');
  });

  /* Preconditions: main/preload exist.
     Action: inspect IPC channel usage.
     Assertions: auth IPC channels are present.
     Requirements: E.I.2 */
  it("uses stable auth IPC channels", () => {
    const mainSource = readText("main.ts");
    const preloadSource = readText("preload.ts");
    expect(mainSource).toContain("auth:open-google");
    expect(preloadSource).toContain("auth:open-google");
    expect(preloadSource).toContain("auth:result");
  });
});
