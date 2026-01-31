import { describe, expect, it } from "vitest";

import { readJson, readText, fileExists } from "../utils/fs";

type PackageJson = {
  engines?: Record<string, string>;
  packageManager?: string;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("Tooling and Language requirements", () => {
  /* Preconditions: package.json exists.
     Action: read engine and dependency versions.
     Assertions: required toolchain versions match.
     Requirements: platform-foundation.2.1 */
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
     Requirements: platform-foundation.2.2 */
  it("uses TypeScript entrypoints", () => {
    expect(fileExists("main.ts")).toBe(true);
    expect(fileExists("preload.ts")).toBe(true);
  });

  /* Preconditions: linting tooling is configured.
     Action: check lint dependencies and config file.
     Assertions: ESLint tooling exists for TS/TSX.
     Requirements: platform-foundation.2.3 */
  it("configures ESLint for TypeScript and React", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.devDependencies?.eslint).toBeDefined();
    expect(pkg.devDependencies?.["@typescript-eslint/parser"]).toBeDefined();
    expect(pkg.devDependencies?.["@typescript-eslint/eslint-plugin"]).toBeDefined();
    expect(pkg.devDependencies?.["eslint-plugin-react"]).toBeDefined();
    expect(pkg.devDependencies?.["eslint-plugin-react-hooks"]).toBeDefined();
    expect(fileExists("eslint.config.mjs")).toBe(true);
  });

  /* Preconditions: formatting tooling is configured.
     Action: check Prettier dependency and config file.
     Assertions: Prettier config exists in repo.
     Requirements: platform-foundation.2.4 */
  it("configures Prettier formatting", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.devDependencies?.prettier).toBeDefined();
    expect(pkg.devDependencies?.["eslint-config-prettier"]).toBeDefined();
    expect(fileExists("prettier.config.cjs")).toBe(true);
  });

  /* Preconditions: lint and format scripts are required.
     Action: read package scripts.
     Assertions: lint and format scripts are present.
     Requirements: platform-foundation.2.5 */
  it("defines lint and format scripts", () => {
    const pkg = readJson<PackageJson>("package.json");
    expect(pkg.scripts?.lint).toBeDefined();
    expect(pkg.scripts?.["lint:fix"]).toBeDefined();
    expect(pkg.scripts?.format).toBeDefined();
    expect(pkg.scripts?.["format:check"]).toBeDefined();
  });

  /* Preconditions: linting scope includes tracked config and tests.
     Action: check lint/format configuration files exist.
     Assertions: config and test paths are present in repo.
     Requirements: platform-foundation.2.6 */
  it("covers source, config, and test files in linting scope", () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    expect(fileExists("prettier.config.cjs")).toBe(true);
    expect(fileExists("vitest.config.ts")).toBe(true);
    expect(fileExists("tests/requirements/tooling.test.ts")).toBe(true);

    const eslintConfig = readText("eslint.config.mjs");
    expect(eslintConfig).toContain("tests/**/*");
    expect(eslintConfig).toContain("**/*.config");
  });
});
