// Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4, testing-infrastructure.3.1, testing-infrastructure.3.2
import { vi } from "vitest";
import { globalFastCheckConfig } from "./fast-check.config";

// Mock network operations to prevent external calls during unit tests
const blockNetwork = () => {
  throw new Error("Network access is blocked in unit tests.");
};

if (typeof fetch !== "undefined") {
  vi.stubGlobal("fetch", blockNetwork);
}

// Mock file system operations for unit test isolation using FileSystemMock
import { fileSystemMock } from "./mocks";
import fs from "fs";
import path from "path";

// Initialize mock with real files that tests expect to exist
const initializeMockWithRealFiles = () => {
  const filesToMock = [
    "vitest.config.ts",
    "package.json",
    "tsconfig.json",
    ".github/workflows/test.yml",
    "scripts/check-coverage.sh",
    "docs/ci-configuration.md",
  ];

  filesToMock.forEach((filePath) => {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        fileSystemMock.setMockData(fullPath, content);
        // Also set it with relative path for compatibility
        fileSystemMock.setMockData(filePath, content);
      }
    } catch (error) {
      // Ignore errors for files that don't exist
    }
  });
};

// Initialize the mock with real files
initializeMockWithRealFiles();

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: fileSystemMock.readFileSync,
    writeFileSync: fileSystemMock.writeFileSync,
    existsSync: fileSystemMock.existsSync,
    mkdirSync: fileSystemMock.mkdirSync,
    rmSync: fileSystemMock.rmSync,
    statSync: vi.fn((path: string) => {
      // For CI configuration files, return actual stats
      if (
        path.includes(".github/workflows") ||
        path.includes("scripts/check-coverage.sh") ||
        path.includes("docs/ci-configuration.md")
      ) {
        return fs.statSync(path);
      }
      // For other files, return mock stats
      return { mode: 0o755, size: 1024 } as any;
    }),
  };
});

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: fileSystemMock.readFile,
    writeFile: fileSystemMock.writeFile,
    access: fileSystemMock.access,
    mkdir: fileSystemMock.mkdir,
    rm: fileSystemMock.rm,
  };
});

// Mock database operations for unit test isolation
vi.mock("better-sqlite3", () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    })),
    close: vi.fn(),
    exec: vi.fn(),
  };
  return {
    default: vi.fn(() => mockDb),
  };
});

// Mock Electron IPC for unit test isolation
vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => "/mock/path"),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(() => ({
    loadFile: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
    on: vi.fn(),
    close: vi.fn(),
  })),
}));
// Configure fast-check global settings for property-based testing
// Requirements: testing-infrastructure.3.1, testing-infrastructure.3.2
import { fc } from "@fast-check/vitest";

// Apply global fast-check configuration
fc.configureGlobal({
  ...globalFastCheckConfig,
  // Ensure minimum 100 iterations for all property tests
  numRuns: Math.max(globalFastCheckConfig.numRuns, 100),
});

// Validate fast-check configuration on setup
console.log(`Fast-check configured with ${globalFastCheckConfig.numRuns} iterations minimum`);
