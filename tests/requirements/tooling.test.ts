import { describe, expect, it } from "vitest";

import { readJson, fileExists } from "../utils/fs";

type PackageJson = {
  engines?: Record<string, string>;
  packageManager?: string;
  devDependencies?: Record<string, string>;
};

describe("Tooling and Language requirements", () => {
  /* Preconditions: package.json exists.
     Action: read engine and dependency versions.
     Assertions: required toolchain versions match.
     Requirements: E.T.1 */
  it("pins Electron, Node.js, and npm versions", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.devDependencies?.electron).toBe("40.0.0");
    expect(pkg.engines?.node).toBe("25.5.0");
    expect(pkg.engines?.npm).toBe("11.8.0");
    expect(pkg.packageManager).toBe("npm@11.8.0");
  });

  /* Preconditions: TypeScript entrypoints exist.
     Action: check main/preload source files.
     Assertions: TypeScript sources are present.
     Requirements: E.T.4 */
  it("uses TypeScript entrypoints", () => {
    expect(fileExists("main.ts")).toBe(true);
    expect(fileExists("preload.ts")).toBe(true);
  });
});
