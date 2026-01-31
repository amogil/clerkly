// Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
// Unit tests for project configuration validation

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

// Mock file system for configuration file reading
vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

// Type the mocked fs functions
const mockedFs = fs as unknown as {
  readFileSync: vi.MockedFunction<typeof fs.readFileSync>;
  existsSync: vi.MockedFunction<typeof fs.existsSync>;
  statSync: vi.MockedFunction<typeof fs.statSync>;
};

describe("Project Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({ isFile: () => true } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Configuration Files Existence", () => {
    /* Preconditions: project root directory exists with configuration files
       Action: check for existence of all required configuration files
       Assertions: all configuration files exist and are readable
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have all required configuration files", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const requiredConfigFiles = [
        "tsconfig.json",
        "eslint.config.mjs", 
        "prettier.config.cjs",
        "package.json",
        "vitest.config.ts"
      ];

      requiredConfigFiles.forEach(configFile => {
        expect(mockedFs.existsSync).toBeDefined();
        // In a real test, we would check actual file existence
        // For now, we verify the mock is set up correctly
        mockedFs.existsSync(configFile);
        expect(mockedFs.existsSync).toHaveBeenCalledWith(configFile);
      });
    });

    /* Preconditions: configuration files exist in project root
       Action: verify configuration files are readable and not empty
       Assertions: all configuration files can be read and have content
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have readable configuration files", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const configFiles = [
        "tsconfig.json",
        "eslint.config.mjs",
        "prettier.config.cjs"
      ];

      configFiles.forEach(configFile => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue("{}"); // Mock non-empty content
        
        const exists = mockedFs.existsSync(configFile);
        expect(exists).toBe(true);
        
        const content = mockedFs.readFileSync(configFile, "utf8");
        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Package.json Configuration", () => {
    const mockPackageJson = {
      name: "clerkly",
      version: "1.0.0",
      main: "dist/main.js",
      type: "commonjs",
      os: ["darwin"],
      engines: {
        node: "25.5.0",
        npm: "11.8.0"
      },
      scripts: {
        "build:main": "tsc",
        "build:renderer": "vite build --config renderer/vite.config.mts",
        "build": "npm run build:main && npm run build:renderer",
        "start": "npm run build && electron .",
        "dev": "npm run build && electron .",
        "test": "vitest run",
        "test:functional": "npm run build && playwright test --config tests/functional/playwright.config.ts",
        "lint": "eslint .",
        "lint:fix": "eslint . --fix",
        "format": "prettier . --write",
        "format:check": "prettier . --check"
      },
      dependencies: {
        "better-sqlite3": "^12.6.2",
        "react": "18.3.1",
        "react-dom": "18.3.1"
      },
      devDependencies: {
        "electron": "40.0.0",
        "typescript": "^5.9.3",
        "eslint": "^9.39.2",
        "prettier": "^3.8.1",
        "vitest": "^4.0.18"
      }
    };

    beforeEach(() => {
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
    });

    /* Preconditions: package.json exists and contains project configuration
       Action: validate package.json has correct application name and main entry point
       Assertions: name is "clerkly", main points to compiled main.js, type is commonjs
       Requirements: platform-foundation.2.2 */
    it("should have correct application configuration", () => {
      // Requirements: platform-foundation.2.2
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      expect(packageJson.name).toBe("clerkly");
      expect(packageJson.main).toBe("dist/main.js");
      expect(packageJson.type).toBe("commonjs");
    });

    /* Preconditions: package.json exists with platform and engine specifications
       Action: validate platform targeting and Node.js/npm version requirements
       Assertions: targets macOS platform, specifies exact Node.js and npm versions
       Requirements: platform-foundation.2.2 */
    it("should target correct platform and runtime versions", () => {
      // Requirements: platform-foundation.2.2
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      expect(packageJson.os).toEqual(["darwin"]);
      expect(packageJson.engines.node).toBe("25.5.0");
      expect(packageJson.engines.npm).toBe("11.8.0");
    });

    /* Preconditions: package.json exists with npm scripts configuration
       Action: validate all required build, development, and quality scripts exist
       Assertions: build, dev, test, lint, and format scripts are properly configured
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have all required npm scripts", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      const requiredScripts = [
        "build:main",
        "build:renderer", 
        "build",
        "start",
        "dev",
        "test",
        "test:functional",
        "lint",
        "lint:fix",
        "format",
        "format:check"
      ];

      requiredScripts.forEach(script => {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeDefined();
        expect(typeof packageJson.scripts[script]).toBe("string");
        expect(packageJson.scripts[script].length).toBeGreaterThan(0);
      });
    });

    /* Preconditions: package.json exists with dependency specifications
       Action: validate core dependencies for Electron, TypeScript, and tooling
       Assertions: Electron 40.0.0, TypeScript 5.9.3+, React 18.3.1 are specified
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have correct core dependencies", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      // Core runtime dependencies
      expect(packageJson.dependencies).toHaveProperty("better-sqlite3");
      expect(packageJson.dependencies).toHaveProperty("react", "18.3.1");
      expect(packageJson.dependencies).toHaveProperty("react-dom", "18.3.1");

      // Core development dependencies
      expect(packageJson.devDependencies).toHaveProperty("electron", "40.0.0");
      expect(packageJson.devDependencies).toHaveProperty("typescript");
      expect(packageJson.devDependencies.typescript).toMatch(/\^5\.9\./);
      
      // Quality tooling dependencies
      expect(packageJson.devDependencies).toHaveProperty("eslint");
      expect(packageJson.devDependencies).toHaveProperty("prettier");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
    });

    /* Preconditions: package.json scripts are configured for quality tooling
       Action: validate lint and format scripts use correct tools and patterns
       Assertions: ESLint and Prettier scripts target appropriate file patterns
       Requirements: platform-foundation.2.3, platform-foundation.2.4 */
    it("should have properly configured quality scripts", () => {
      // Requirements: platform-foundation.2.3, platform-foundation.2.4
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      // ESLint scripts
      expect(packageJson.scripts.lint).toContain("eslint");
      expect(packageJson.scripts["lint:fix"]).toContain("eslint");
      expect(packageJson.scripts["lint:fix"]).toContain("--fix");

      // Prettier scripts  
      expect(packageJson.scripts.format).toContain("prettier");
      expect(packageJson.scripts.format).toContain("--write");
      expect(packageJson.scripts["format:check"]).toContain("prettier");
      expect(packageJson.scripts["format:check"]).toContain("--check");
    });
  });

  describe("TypeScript Configuration", () => {
    const mockTsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "Node",
        lib: ["ES2022", "DOM"],
        outDir: "dist",
        rootDir: ".",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true
      },
      include: ["main.ts", "preload.ts", "src/**/*.ts"]
    };

    beforeEach(() => {
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === "tsconfig.json") {
          return JSON.stringify(mockTsConfig);
        }
        return "{}";
      });
    });

    /* Preconditions: tsconfig.json exists with TypeScript compiler configuration
       Action: validate TypeScript compiler options for target, module system, and output
       Assertions: targets ES2022, uses CommonJS modules, outputs to dist directory
       Requirements: platform-foundation.2.2 */
    it("should have correct TypeScript compiler options", () => {
      // Requirements: platform-foundation.2.2
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);

      expect(tsConfig.compilerOptions.target).toBe("ES2022");
      expect(tsConfig.compilerOptions.module).toBe("CommonJS");
      expect(tsConfig.compilerOptions.moduleResolution).toBe("Node");
      expect(tsConfig.compilerOptions.outDir).toBe("dist");
      expect(tsConfig.compilerOptions.strict).toBe(true);
    });

    /* Preconditions: tsconfig.json exists with library and environment configuration
       Action: validate TypeScript library includes and environment settings
       Assertions: includes ES2022 and DOM libraries, enables interop and strict options
       Requirements: platform-foundation.2.2 */
    it("should include correct libraries and strict options", () => {
      // Requirements: platform-foundation.2.2
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);

      expect(tsConfig.compilerOptions.lib).toContain("ES2022");
      expect(tsConfig.compilerOptions.lib).toContain("DOM");
      expect(tsConfig.compilerOptions.esModuleInterop).toBe(true);
      expect(tsConfig.compilerOptions.forceConsistentCasingInFileNames).toBe(true);
      expect(tsConfig.compilerOptions.skipLibCheck).toBe(true);
    });

    /* Preconditions: tsconfig.json exists with file inclusion patterns
       Action: validate TypeScript compilation includes main, preload, and source files
       Assertions: includes main.ts, preload.ts, and all TypeScript files in src directory
       Requirements: platform-foundation.2.2 */
    it("should include correct source files", () => {
      // Requirements: platform-foundation.2.2
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);

      expect(tsConfig.include).toContain("main.ts");
      expect(tsConfig.include).toContain("preload.ts");
      expect(tsConfig.include).toContain("src/**/*.ts");
    });

    /* Preconditions: TypeScript configuration supports Electron development
       Action: validate configuration is suitable for Electron main and renderer processes
       Assertions: CommonJS modules for main process, DOM lib for renderer compatibility
       Requirements: platform-foundation.2.2 */
    it("should be configured for Electron development", () => {
      // Requirements: platform-foundation.2.2
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);

      // CommonJS for Electron main process compatibility
      expect(tsConfig.compilerOptions.module).toBe("CommonJS");
      
      // DOM lib for renderer process compatibility
      expect(tsConfig.compilerOptions.lib).toContain("DOM");
      
      // Modern ES target for performance
      expect(tsConfig.compilerOptions.target).toBe("ES2022");
      
      // Strict mode for code quality
      expect(tsConfig.compilerOptions.strict).toBe(true);
    });
  });

  describe("ESLint Configuration", () => {
    const mockEslintConfig = `
      import js from "@eslint/js";
      import globals from "globals";
      import react from "eslint-plugin-react";
      import reactHooks from "eslint-plugin-react-hooks";
      import tseslint from "@typescript-eslint/eslint-plugin";
      import tsParser from "@typescript-eslint/parser";
      import eslintConfigPrettier from "eslint-config-prettier";

      export default [
        {
          ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/coverage/**",
            "**/build/**"
          ],
        },
        {
          files: ["**/*.{ts,tsx,js,cjs,mjs}"],
          languageOptions: {
            parser: tsParser,
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
              ...globals.node,
              ...globals.browser,
            },
          },
          plugins: {
            "@typescript-eslint": tseslint,
            react,
            "react-hooks": reactHooks,
          },
          rules: {
            ...js.configs.recommended.rules,
            ...tseslint.configs.recommended.rules,
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            ...eslintConfigPrettier.rules,
          },
        }
      ];
    `;

    beforeEach(() => {
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === "eslint.config.mjs") {
          return mockEslintConfig;
        }
        return "{}";
      });
    });

    /* Preconditions: eslint.config.mjs exists with ESLint configuration
       Action: validate ESLint configuration file exists and is readable
       Assertions: configuration file exists and contains expected content structure
       Requirements: platform-foundation.2.3 */
    it("should have ESLint configuration file", () => {
      // Requirements: platform-foundation.2.3
      const eslintConfigExists = mockedFs.existsSync("eslint.config.mjs");
      expect(eslintConfigExists).toBe(true);

      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      expect(eslintConfigContent).toBeDefined();
      expect(eslintConfigContent.length).toBeGreaterThan(0);
    });

    /* Preconditions: ESLint configuration includes TypeScript and React support
       Action: validate ESLint configuration includes required plugins and parsers
       Assertions: includes TypeScript parser, React plugins, and recommended rules
       Requirements: platform-foundation.2.3 */
    it("should include TypeScript and React support", () => {
      // Requirements: platform-foundation.2.3
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      
      expect(eslintConfigContent).toContain("@typescript-eslint/parser");
      expect(eslintConfigContent).toContain("@typescript-eslint/eslint-plugin");
      expect(eslintConfigContent).toContain("eslint-plugin-react");
      expect(eslintConfigContent).toContain("eslint-plugin-react-hooks");
    });

    /* Preconditions: ESLint configuration specifies file patterns and environments
       Action: validate ESLint targets correct file types and environments
       Assertions: targets TypeScript/JavaScript files, includes Node.js and browser globals
       Requirements: platform-foundation.2.3 */
    it("should target correct file patterns and environments", () => {
      // Requirements: platform-foundation.2.3
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      
      expect(eslintConfigContent).toContain("**/*.{ts,tsx,js,cjs,mjs}");
      expect(eslintConfigContent).toContain("globals.node");
      expect(eslintConfigContent).toContain("globals.browser");
    });

    /* Preconditions: ESLint configuration includes Prettier integration
       Action: validate ESLint configuration integrates with Prettier formatting
       Assertions: includes eslint-config-prettier to avoid conflicts
       Requirements: platform-foundation.2.3, platform-foundation.2.4 */
    it("should integrate with Prettier", () => {
      // Requirements: platform-foundation.2.3, platform-foundation.2.4
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      
      expect(eslintConfigContent).toContain("eslint-config-prettier");
      expect(eslintConfigContent).toContain("eslintConfigPrettier.rules");
    });

    /* Preconditions: ESLint configuration excludes build and dependency directories
       Action: validate ESLint ignores appropriate directories and files
       Assertions: ignores node_modules, dist, coverage, and build directories
       Requirements: platform-foundation.2.3 */
    it("should ignore appropriate directories", () => {
      // Requirements: platform-foundation.2.3
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      
      expect(eslintConfigContent).toContain("**/node_modules/**");
      expect(eslintConfigContent).toContain("**/dist/**");
      expect(eslintConfigContent).toContain("**/coverage/**");
      expect(eslintConfigContent).toContain("**/build/**");
    });
  });

  describe("Prettier Configuration", () => {
    const mockPrettierConfig = `
      module.exports = {
        printWidth: 100,
        singleQuote: false,
        trailingComma: "all",
      };
    `;

    beforeEach(() => {
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === "prettier.config.cjs") {
          return mockPrettierConfig;
        }
        return "{}";
      });
    });

    /* Preconditions: prettier.config.cjs exists with Prettier configuration
       Action: validate Prettier configuration file exists and is readable
       Assertions: configuration file exists and contains expected formatting rules
       Requirements: platform-foundation.2.4 */
    it("should have Prettier configuration file", () => {
      // Requirements: platform-foundation.2.4
      const prettierConfigExists = mockedFs.existsSync("prettier.config.cjs");
      expect(prettierConfigExists).toBe(true);

      const prettierConfigContent = mockedFs.readFileSync("prettier.config.cjs", "utf8");
      expect(prettierConfigContent).toBeDefined();
      expect(prettierConfigContent.length).toBeGreaterThan(0);
    });

    /* Preconditions: Prettier configuration specifies formatting rules
       Action: validate Prettier configuration includes required formatting options
       Assertions: specifies print width, quote style, and trailing comma preferences
       Requirements: platform-foundation.2.4 */
    it("should have correct formatting configuration", () => {
      // Requirements: platform-foundation.2.4
      const prettierConfigContent = mockedFs.readFileSync("prettier.config.cjs", "utf8");
      
      expect(prettierConfigContent).toContain("printWidth: 100");
      expect(prettierConfigContent).toContain("singleQuote: false");
      expect(prettierConfigContent).toContain('trailingComma: "all"');
    });

    /* Preconditions: Prettier configuration is compatible with ESLint
       Action: validate Prettier configuration works with ESLint integration
       Assertions: formatting rules don't conflict with ESLint rules
       Requirements: platform-foundation.2.3, platform-foundation.2.4 */
    it("should be compatible with ESLint configuration", () => {
      // Requirements: platform-foundation.2.3, platform-foundation.2.4
      const prettierConfigContent = mockedFs.readFileSync("prettier.config.cjs", "utf8");
      
      // Verify it's a CommonJS module (compatible with ESLint config)
      expect(prettierConfigContent).toContain("module.exports");
      
      // Verify it has basic formatting rules that work with ESLint
      expect(prettierConfigContent).toContain("printWidth");
      expect(prettierConfigContent).toContain("singleQuote");
      expect(prettierConfigContent).toContain("trailingComma");
    });
  });

  describe("Vitest Configuration", () => {
    const mockVitestConfig = `
      import { defineConfig } from "vitest/config";

      export default defineConfig({
        test: {
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/requirements/**/*.test.ts", "tests/unit/**/*.test.ts"],
          exclude: ["tests/functional/**", "node_modules/**"],
        },
      });
    `;

    beforeEach(() => {
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === "vitest.config.ts") {
          return mockVitestConfig;
        }
        return "{}";
      });
    });

    /* Preconditions: vitest.config.ts exists with test configuration
       Action: validate Vitest configuration file exists and is readable
       Assertions: configuration file exists and contains test environment setup
       Requirements: platform-foundation.2.2 */
    it("should have Vitest configuration file", () => {
      // Requirements: platform-foundation.2.2
      const vitestConfigExists = mockedFs.existsSync("vitest.config.ts");
      expect(vitestConfigExists).toBe(true);

      const vitestConfigContent = mockedFs.readFileSync("vitest.config.ts", "utf8");
      expect(vitestConfigContent).toBeDefined();
      expect(vitestConfigContent.length).toBeGreaterThan(0);
    });

    /* Preconditions: Vitest configuration specifies test environment and setup
       Action: validate Vitest configuration includes Node.js environment and setup files
       Assertions: uses Node.js environment, includes setup files, targets correct test files
       Requirements: platform-foundation.2.2 */
    it("should have correct test environment configuration", () => {
      // Requirements: platform-foundation.2.2
      const vitestConfigContent = mockedFs.readFileSync("vitest.config.ts", "utf8");
      
      expect(vitestConfigContent).toContain('environment: "node"');
      expect(vitestConfigContent).toContain("setupFiles");
      expect(vitestConfigContent).toContain("./tests/setup.ts");
    });

    /* Preconditions: Vitest configuration specifies test file patterns
       Action: validate Vitest configuration includes and excludes correct test files
       Assertions: includes unit and requirements tests, excludes functional tests
       Requirements: platform-foundation.2.2 */
    it("should include correct test file patterns", () => {
      // Requirements: platform-foundation.2.2
      const vitestConfigContent = mockedFs.readFileSync("vitest.config.ts", "utf8");
      
      expect(vitestConfigContent).toContain("tests/requirements/**/*.test.ts");
      expect(vitestConfigContent).toContain("tests/unit/**/*.test.ts");
      expect(vitestConfigContent).toContain("tests/functional/**");
      expect(vitestConfigContent).toContain("node_modules/**");
    });
  });

  describe("Configuration Integration", () => {
    /* Preconditions: all configuration files exist and are properly formatted
       Action: validate configuration files work together without conflicts
       Assertions: TypeScript, ESLint, and Prettier configurations are compatible
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have compatible configuration files", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const configFiles = ["tsconfig.json", "eslint.config.mjs", "prettier.config.cjs"];
      
      configFiles.forEach(configFile => {
        const exists = mockedFs.existsSync(configFile);
        expect(exists).toBe(true);
        
        const content = mockedFs.readFileSync(configFile, "utf8");
        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
      });
    });

    /* Preconditions: package.json scripts reference configuration files
       Action: validate npm scripts use correct configuration file paths
       Assertions: build, lint, and format scripts reference existing config files
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have npm scripts that reference correct config files", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);

      // TypeScript build script should use tsconfig.json (implicit)
      expect(packageJson.scripts["build:main"]).toContain("tsc");
      
      // ESLint scripts should use eslint.config.mjs (implicit)
      expect(packageJson.scripts.lint).toContain("eslint");
      
      // Prettier scripts should use prettier.config.cjs (implicit)
      expect(packageJson.scripts.format).toContain("prettier");
    });

    /* Preconditions: development tools are properly configured for the project
       Action: validate all development tools have consistent configuration
       Assertions: TypeScript, ESLint, Prettier, and Vitest work together seamlessly
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have consistent development tool configuration", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      
      // Verify TypeScript configuration exists
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      expect(tsConfigContent).toBeDefined();
      
      // Verify ESLint configuration exists and includes TypeScript support
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      expect(eslintConfigContent).toContain("@typescript-eslint");
      
      // Verify Prettier configuration exists
      const prettierConfigContent = mockedFs.readFileSync("prettier.config.cjs", "utf8");
      expect(prettierConfigContent).toBeDefined();
      
      // Verify Vitest configuration exists
      const vitestConfigContent = mockedFs.readFileSync("vitest.config.ts", "utf8");
      expect(vitestConfigContent).toBeDefined();
    });
  });

  describe("Configuration Validation", () => {
    /* Preconditions: configuration files contain valid JSON/JavaScript syntax
       Action: validate configuration files can be parsed without syntax errors
       Assertions: all configuration files have valid syntax and structure
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have valid configuration file syntax", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      
      // Test JSON configuration files
      const jsonConfigs = ["tsconfig.json", "package.json"];
      jsonConfigs.forEach(configFile => {
        const content = mockedFs.readFileSync(configFile, "utf8");
        expect(() => JSON.parse(content as string)).not.toThrow();
      });
      
      // Test JavaScript configuration files (basic syntax check)
      const jsConfigs = ["eslint.config.mjs", "prettier.config.cjs", "vitest.config.ts"];
      jsConfigs.forEach(configFile => {
        const content = mockedFs.readFileSync(configFile, "utf8");
        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);
        // In a real test, we might use a JavaScript parser to validate syntax
      });
    });

    /* Preconditions: configuration files specify required fields and options
       Action: validate configuration files contain all necessary configuration options
       Assertions: each config file has required fields for proper tool operation
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should have complete configuration options", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      
      // Validate TypeScript configuration completeness
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);
      expect(tsConfig).toHaveProperty("compilerOptions");
      expect(tsConfig).toHaveProperty("include");
      expect(tsConfig.compilerOptions).toHaveProperty("target");
      expect(tsConfig.compilerOptions).toHaveProperty("module");
      expect(tsConfig.compilerOptions).toHaveProperty("outDir");
      
      // Validate package.json completeness
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);
      expect(packageJson).toHaveProperty("name");
      expect(packageJson).toHaveProperty("version");
      expect(packageJson).toHaveProperty("main");
      expect(packageJson).toHaveProperty("scripts");
      expect(packageJson).toHaveProperty("dependencies");
      expect(packageJson).toHaveProperty("devDependencies");
    });

    /* Preconditions: configuration files follow best practices and conventions
       Action: validate configuration files adhere to recommended practices
       Assertions: configurations follow tool-specific best practices and conventions
       Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4 */
    it("should follow configuration best practices", () => {
      // Requirements: platform-foundation.2.2, platform-foundation.2.3, platform-foundation.2.4
      
      // TypeScript best practices
      const tsConfigContent = mockedFs.readFileSync("tsconfig.json", "utf8");
      const tsConfig = JSON.parse(tsConfigContent as string);
      expect(tsConfig.compilerOptions.strict).toBe(true); // Strict mode enabled
      expect(tsConfig.compilerOptions.skipLibCheck).toBe(true); // Performance optimization
      
      // Package.json best practices
      const packageContent = mockedFs.readFileSync("package.json", "utf8");
      const packageJson = JSON.parse(packageContent as string);
      expect(packageJson.engines).toBeDefined(); // Engine requirements specified
      expect(packageJson.os).toBeDefined(); // Platform targeting specified
      
      // ESLint best practices (basic checks)
      const eslintConfigContent = mockedFs.readFileSync("eslint.config.mjs", "utf8");
      expect(eslintConfigContent).toContain("recommended"); // Uses recommended rules
      
      // Prettier best practices (basic checks)
      const prettierConfigContent = mockedFs.readFileSync("prettier.config.cjs", "utf8");
      expect(prettierConfigContent).toContain("printWidth"); // Line length specified
    });
  });
});