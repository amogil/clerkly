// Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
import { vi } from "vitest";

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
  const filesToMock = ["vitest.config.ts", "package.json", "tsconfig.json"];

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
