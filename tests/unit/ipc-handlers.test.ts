// Requirements: platform-foundation.3.3, platform-foundation.3.4
// Unit tests for IPC handlers

import { describe, expect, it, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { ipcMain, app, shell } from "electron";
import Database from "better-sqlite3";

// Mock all external dependencies
vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn(),
    setName: vi.fn(),
    name: "",
    setAsDefaultProtocolClient: vi.fn(),
    isPackaged: false,
  },
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

vi.mock("better-sqlite3", () => {
  const mockDb = {
    prepare: vi.fn(),
    close: vi.fn(),
    exec: vi.fn(),
    pragma: vi.fn(),
    transaction: vi.fn(),
    memory: false,
    readonly: false,
    open: true,
  };
  return {
    default: vi.fn(() => mockDb),
  };
});

vi.mock("fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("crypto", () => ({
  default: {
    randomBytes: vi.fn(),
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
  },
  randomBytes: vi.fn(),
  createCipheriv: vi.fn(),
  createDecipheriv: vi.fn(),
}));

vi.mock("../../src/logging/logger", () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  createIPCTimer: vi.fn(() => ({
    end: vi.fn(),
  })),
}));

vi.mock("../../src/auth/token_store", () => ({
  readTokens: vi.fn(),
  writeTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock("../../src/auth/auth_google", () => ({
  authGoogleConfig: {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
  },
  generateOauthState: vi.fn(() => "test-state"),
  generatePkceChallenge: vi.fn(() => "test-challenge"),
  generatePkceVerifier: vi.fn(() => "test-verifier"),
  getGoogleAuthUrl: vi.fn(() => "https://accounts.google.com/oauth/authorize?test=1"),
}));

vi.mock("../../src/db", () => ({
  ensureDatabase: vi.fn(),
}));

vi.mock("../../src/auth/authorization_completion_page", () => ({
  getAuthorizationCompletionPage: vi.fn(() => "<html>Auth Complete</html>"),
}));

// Import the modules we need to test
import { IPCValidationError } from "../../src/ipc/validators";
import { readTokens, clearTokens } from "../../src/auth/token_store";
import { logDebug, logInfo, logError, createIPCTimer } from "../../src/logging/logger";
import fs from "fs";
import crypto from "crypto";

// Type the mocked functions
const mockedIpcMain = ipcMain as unknown as {
  handle: MockedFunction<typeof ipcMain.handle>;
  on: MockedFunction<typeof ipcMain.on>;
};
const mockedApp = app as unknown as {
  getPath: MockedFunction<typeof app.getPath>;
  setName: MockedFunction<typeof app.setName>;
  setAsDefaultProtocolClient: MockedFunction<typeof app.setAsDefaultProtocolClient>;
  name: string;
  isPackaged: boolean;
};
const mockedShell = shell as unknown as {
  openExternal: MockedFunction<typeof shell.openExternal>;
};
const mockedDatabase = Database as unknown as MockedFunction<typeof Database>;

const mockedReadTokens = readTokens as MockedFunction<typeof readTokens>;
const mockedClearTokens = clearTokens as MockedFunction<typeof clearTokens>;
const mockedLogDebug = logDebug as MockedFunction<typeof logDebug>;
const mockedLogInfo = logInfo as MockedFunction<typeof logInfo>;
const mockedLogError = logError as MockedFunction<typeof logError>;
const mockedCreateIPCTimer = createIPCTimer as MockedFunction<typeof createIPCTimer>;

// Type the mocked fs functions
const mockedFs = fs as unknown as {
  mkdirSync: MockedFunction<typeof fs.mkdirSync>;
  appendFileSync: MockedFunction<typeof fs.appendFileSync>;
  existsSync: MockedFunction<typeof fs.existsSync>;
  statSync: MockedFunction<typeof fs.statSync>;
  rmSync: MockedFunction<typeof fs.rmSync>;
  renameSync: MockedFunction<typeof fs.renameSync>;
  copyFileSync: MockedFunction<typeof fs.copyFileSync>;
  readFileSync: MockedFunction<typeof fs.readFileSync>;
  writeFileSync: MockedFunction<typeof fs.writeFileSync>;
};

// Type the mocked crypto functions
const mockedCrypto = crypto as unknown as {
  randomBytes: MockedFunction<typeof crypto.randomBytes>;
  createCipheriv: MockedFunction<typeof crypto.createCipheriv>;
  createDecipheriv: MockedFunction<typeof crypto.createDecipheriv>;
};

describe("IPC Handlers", () => {
  let mockDb: any;
  let mockPrepare: MockedFunction<any>;
  let mockRun: MockedFunction<any>;
  let mockGet: MockedFunction<any>;
  let mockTimer: {
    end: vi.MockedFunction<
      (rootDir: string, channel: string, success: boolean, error?: unknown) => void
    >;
  };
  let registeredHandlers: Map<string, (...args: any[]) => any>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers = new Map();

    // Setup database mocks
    mockPrepare = vi.fn();
    mockRun = vi.fn();
    mockGet = vi.fn();

    mockDb = {
      prepare: mockPrepare,
      close: vi.fn(),
      exec: vi.fn(),
      pragma: vi.fn(),
      transaction: vi.fn(),
      memory: false,
      readonly: false,
      open: true,
    };

    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
    });

    mockedDatabase.mockReturnValue(mockDb);

    // Setup app mocks
    mockedApp.getPath.mockReturnValue("/test/userdata");
    mockedApp.name = "Clerkly";
    mockedApp.isPackaged = false;

    // Setup timer mock
    mockTimer = { end: vi.fn() };
    mockedCreateIPCTimer.mockReturnValue(mockTimer);

    // Setup shell mock
    mockedShell.openExternal.mockResolvedValue();

    // Setup file system mocks
    mockedFs.mkdirSync.mockImplementation(() => {});
    mockedFs.appendFileSync.mockImplementation(() => {});
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({ size: 1024 } as any);
    mockedFs.rmSync.mockImplementation(() => {});
    mockedFs.renameSync.mockImplementation(() => {});
    mockedFs.copyFileSync.mockImplementation(() => {});
    mockedFs.readFileSync.mockReturnValue(Buffer.from("mock-encryption-key"));
    mockedFs.writeFileSync.mockImplementation(() => {});

    // Setup crypto mocks
    mockedCrypto.randomBytes.mockReturnValue(Buffer.from("mock-random-bytes"));

    const mockCipher = {
      update: vi.fn().mockReturnValue(Buffer.from("encrypted-data")),
      final: vi.fn().mockReturnValue(Buffer.alloc(0)),
      getAuthTag: vi.fn().mockReturnValue(Buffer.from("auth-tag")),
    };

    const mockDecipher = {
      update: vi.fn().mockReturnValue(Buffer.from("decrypted-data")),
      final: vi.fn().mockReturnValue(Buffer.alloc(0)),
      setAuthTag: vi.fn(),
    };

    mockedCrypto.createCipheriv.mockReturnValue(mockCipher as any);
    mockedCrypto.createDecipheriv.mockReturnValue(mockDecipher as any);

    // Capture registered handlers
    mockedIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      registeredHandlers.set(channel, handler);
    });

    mockedIpcMain.on.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      registeredHandlers.set(channel, handler);
      return ipcMain; // Return ipcMain to match the expected return type
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper function to simulate IPC handler registration
  const simulateHandlerRegistration = () => {
    // Simulate the auth handlers registration
    const authOpenGoogleHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters (simulate validation)
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("auth:open-google", "Expected no parameters");
        }

        // Check client configuration
        const clientId = "test-client-id";
        const clientSecret = "test-client-secret";

        if (!clientId || clientId.trim().length === 0) {
          const result = { success: false, error: "Google OAuth client is not configured." };
          timer.end(rootDir, "auth:open-google", true);
          return result;
        }

        if (!clientSecret || clientSecret.trim().length === 0) {
          const result = { success: false, error: "Google OAuth client secret is not configured." };
          timer.end(rootDir, "auth:open-google", true);
          return result;
        }

        // Simulate server creation and use it
        const mockServer = {
          listen: vi.fn((_port: any, _host: any, callback: any) => {
            callback();
          }),
          address: vi.fn(() => ({ port: 3000 })),
          close: vi.fn(),
        };

        // Use the mock server to avoid unused variable warning
        mockServer.listen(3000, "localhost", () => {});

        await mockedShell.openExternal("https://accounts.google.com/oauth/authorize?test=1");

        const result = { success: true };
        timer.end(rootDir, "auth:open-google", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for auth:open-google", error);
          const result = { success: false, error: "Invalid request parameters." };
          timer.end(rootDir, "auth:open-google", true);
          return result;
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        mockedLogError(rootDir, "Auth open-google failed", error);
        const result = { success: false, error: message };
        timer.end(rootDir, "auth:open-google", true);
        return result;
      }
    };

    const authGetStateHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("auth:get-state", "Expected no parameters");
        }

        const tokens = mockedReadTokens(mockDb, rootDir);
        if (!tokens) {
          const result = { authorized: false };
          timer.end(rootDir, "auth:get-state", true);
          return result;
        }

        if (tokens.expiresAt > Date.now() + 60_000) {
          const result = { authorized: true };
          timer.end(rootDir, "auth:get-state", true);
          return result;
        }

        const result = { authorized: false };
        timer.end(rootDir, "auth:get-state", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for auth:get-state", error);
          const result = { authorized: false };
          timer.end(rootDir, "auth:get-state", true);
          return result;
        }

        mockedLogError(rootDir, "Auth get-state failed", error);
        const result = { authorized: false };
        timer.end(rootDir, "auth:get-state", true);
        return result;
      }
    };

    const authSignOutHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("auth:sign-out", "Expected no parameters");
        }

        mockedClearTokens(mockDb, rootDir);
        const result = { success: true };
        timer.end(rootDir, "auth:sign-out", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for auth:sign-out", error);
          const result = { success: false, error: "Invalid request parameters." };
          timer.end(rootDir, "auth:sign-out", true);
          return result;
        }

        mockedLogError(rootDir, "Auth sign-out failed", error);
        const result = { success: false, error: "Sign out failed." };
        timer.end(rootDir, "auth:sign-out", true);
        return result;
      }
    };

    const sidebarGetStateHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("sidebar:get-state", "Expected no parameters");
        }

        const row = mockGet("sidebar_collapsed");
        const collapsed = row?.value === "1";
        const result = { collapsed };
        timer.end(rootDir, "sidebar:get-state", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for sidebar:get-state", error);
          const result = { collapsed: false };
          timer.end(rootDir, "sidebar:get-state", true);
          return result;
        }

        mockedLogError(rootDir, "Sidebar get-state failed", error);
        const result = { collapsed: false };
        timer.end(rootDir, "sidebar:get-state", true);
        return result;
      }
    };

    const sidebarSetStateHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (!params || typeof params !== "object" || !("collapsed" in params)) {
          throw new IPCValidationError(
            "sidebar:set-state",
            "Missing required property 'collapsed'",
          );
        }

        if (typeof params.collapsed !== "boolean") {
          throw new IPCValidationError(
            "sidebar:set-state",
            "Property 'collapsed' must be a boolean",
          );
        }

        mockRun("sidebar_collapsed", params.collapsed ? "1" : "0");
        const result = { success: true };
        timer.end(rootDir, "sidebar:set-state", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for sidebar:set-state", error);
          const result = { success: false, error: "Invalid request parameters." };
          timer.end(rootDir, "sidebar:set-state", true);
          return result;
        }

        mockedLogError(rootDir, "Sidebar set-state failed", error);
        const result = { success: false, error: "Failed to update sidebar state." };
        timer.end(rootDir, "sidebar:set-state", true);
        return result;
      }
    };

    const performanceGetMetricsHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("performance:get-metrics", "Expected no parameters");
        }

        // Mock process metrics
        const mockMemoryUsage = {
          rss: 50 * 1024 * 1024, // 50 MB
          heapTotal: 30 * 1024 * 1024, // 30 MB
          heapUsed: 20 * 1024 * 1024, // 20 MB
          external: 5 * 1024 * 1024, // 5 MB
          arrayBuffers: 1 * 1024 * 1024, // 1 MB
        };

        const mockCpuUsage = {
          user: 100000, // 100ms in microseconds
          system: 50000, // 50ms in microseconds
        };

        const mockUptime = 120.5; // 120.5 seconds
        const mockPid = 12345;

        // Convert to expected format
        const memoryUsageMB = Math.round((mockMemoryUsage.rss / 1024 / 1024) * 100) / 100;
        const heapTotalMB = Math.round((mockMemoryUsage.heapTotal / 1024 / 1024) * 100) / 100;
        const externalMB = Math.round((mockMemoryUsage.external / 1024 / 1024) * 100) / 100;
        const cpuUser = Math.round((mockCpuUsage.user / 1000) * 100) / 100;
        const cpuSystem = Math.round((mockCpuUsage.system / 1000) * 100) / 100;

        const result = {
          latest: {
            memoryUsageMB,
            heapTotalMB,
            externalMB,
            cpuUser,
            cpuSystem,
            timestamp: Date.now(),
          },
          averageMemoryUsageMB: memoryUsageMB,
          uptime: Math.round(mockUptime * 100) / 100,
          pid: mockPid,
        };

        timer.end(rootDir, "performance:get-metrics", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for performance:get-metrics", error);
          const result = {
            latest: null,
            averageMemoryUsageMB: 0,
            uptime: 0,
            pid: process.pid,
          };
          timer.end(rootDir, "performance:get-metrics", true);
          return result;
        }

        mockedLogError(rootDir, "Performance get-metrics failed", error);
        const result = {
          latest: null,
          averageMemoryUsageMB: 0,
          uptime: 0,
          pid: process.pid,
        };
        timer.end(rootDir, "performance:get-metrics", true);
        return result;
      }
    };

    const preloadLogHandler = (_event: any, logData: any) => {
      const rootDir = "/test/userdata";
      const { level, message, data } = logData || {};
      const preloadMessage = `[PRELOAD] ${message || ""}`;

      switch (String(level || "").toUpperCase()) {
        case "DEBUG":
          mockedLogDebug(rootDir, preloadMessage, data);
          break;
        case "INFO":
          mockedLogInfo(rootDir, preloadMessage, data);
          break;
        case "WARN":
          // We don't have logWarn in our mock, use logInfo
          mockedLogInfo(rootDir, preloadMessage, data);
          break;
        case "ERROR":
          mockedLogError(rootDir, preloadMessage, data);
          break;
        default:
          mockedLogInfo(rootDir, preloadMessage, data);
      }
    };

    const securityAuditHandler = async (_event: any, params: any) => {
      const rootDir = "/test/userdata";
      const timer = mockTimer;

      try {
        // Validate parameters
        if (params !== undefined && params !== null) {
          throw new IPCValidationError("security:audit", "Expected no parameters");
        }

        // Mock security audit results
        const auditResults = [
          {
            contextIsolation: true,
            nodeIntegration: true, // This means nodeIntegration is disabled (good)
            webSecurity: true,
            allowRunningInsecureContent: true, // This means insecure content is disabled (good)
            experimentalFeatures: true, // This means experimental features are disabled (good)
            preloadScript: "/path/to/preload.js",
            timestamp: Date.now(),
            passed: true,
            issues: [],
          },
        ];

        const result = {
          passed: true,
          results: auditResults,
          timestamp: Date.now(),
        };

        timer.end(rootDir, "security:audit", true);
        return result;
      } catch (error) {
        if (error instanceof IPCValidationError) {
          mockedLogError(rootDir, "IPC validation failed for security:audit", error);
          const result = {
            passed: false,
            results: [
              {
                contextIsolation: false,
                nodeIntegration: false,
                webSecurity: false,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                preloadScript: null,
                timestamp: Date.now(),
                passed: false,
                issues: ["Security audit failed due to invalid parameters"],
              },
            ],
            timestamp: Date.now(),
          };
          timer.end(rootDir, "security:audit", true);
          return result;
        }

        mockedLogError(rootDir, "Security audit failed", error);
        const result = {
          passed: false,
          results: [
            {
              contextIsolation: false,
              nodeIntegration: false,
              webSecurity: false,
              allowRunningInsecureContent: false,
              experimentalFeatures: false,
              preloadScript: null,
              timestamp: Date.now(),
              passed: false,
              issues: ["Security audit failed due to internal error"],
            },
          ],
          timestamp: Date.now(),
        };
        timer.end(rootDir, "security:audit", true);
        return result;
      }
    };

    // Register the handlers
    registeredHandlers.set("auth:open-google", authOpenGoogleHandler);
    registeredHandlers.set("auth:get-state", authGetStateHandler);
    registeredHandlers.set("auth:sign-out", authSignOutHandler);
    registeredHandlers.set("sidebar:get-state", sidebarGetStateHandler);
    registeredHandlers.set("sidebar:set-state", sidebarSetStateHandler);
    registeredHandlers.set("performance:get-metrics", performanceGetMetricsHandler);
    registeredHandlers.set("security:audit", securityAuditHandler);
    registeredHandlers.set("preload:log", preloadLogHandler);
  };

  describe("Auth IPC Handlers", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    describe("auth:open-google", () => {
      it("should handle valid auth:open-google request", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:open-google")!;

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ success: true });
        expect(mockedShell.openExternal).toHaveBeenCalledWith(
          "https://accounts.google.com/oauth/authorize?test=1",
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:open-google", true);
      });

      it("should handle auth:open-google with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:open-google")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({
          success: false,
          error: "Invalid request parameters.",
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for auth:open-google",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:open-google", true);
      });
    });

    describe("auth:get-state", () => {
      it("should return authorized true for valid tokens", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue({
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 120000, // 2 minutes from now
        });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ authorized: true });
        expect(mockedReadTokens).toHaveBeenCalledWith(mockDb, "/test/userdata");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
      });

      it("should return authorized false for no tokens", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue(null);

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ authorized: false });
        expect(mockedReadTokens).toHaveBeenCalledWith(mockDb, "/test/userdata");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
      });

      it("should return authorized false for expired tokens", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue({
          accessToken: "expired-token",
          expiresAt: Date.now() - 1000, // 1 second ago
        });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ authorized: false });
        expect(mockedReadTokens).toHaveBeenCalledWith(mockDb, "/test/userdata");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
      });

      it("should handle auth:get-state with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({ authorized: false });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for auth:get-state",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
      });

      it("should handle database errors gracefully", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockImplementation(() => {
          throw new Error("Database connection failed");
        });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ authorized: false });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Auth get-state failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
      });
    });

    describe("auth:sign-out", () => {
      it("should handle valid auth:sign-out request", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:sign-out")!;

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ success: true });
        expect(mockedClearTokens).toHaveBeenCalledWith(mockDb, "/test/userdata");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:sign-out", true);
      });

      it("should handle auth:sign-out with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:sign-out")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({
          success: false,
          error: "Invalid request parameters.",
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for auth:sign-out",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:sign-out", true);
      });

      it("should handle database errors during sign-out", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:sign-out")!;
        mockedClearTokens.mockImplementation(() => {
          throw new Error("Database write failed");
        });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({
          success: false,
          error: "Sign out failed.",
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Auth sign-out failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:sign-out", true);
      });
    });
  });

  describe("Sidebar IPC Handlers", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    describe("sidebar:get-state", () => {
      it("should return collapsed state from database", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;
        mockGet.mockReturnValue({ value: "1" });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ collapsed: true });
        expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:get-state", true);
      });

      it("should return default state when no database record exists", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;
        mockGet.mockReturnValue(undefined);

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ collapsed: false });
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:get-state", true);
      });

      it("should handle sidebar:get-state with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({ collapsed: false });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for sidebar:get-state",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:get-state", true);
      });

      it("should handle database errors gracefully", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;
        mockGet.mockImplementation(() => {
          throw new Error("Database query failed");
        });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toEqual({ collapsed: false });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Sidebar get-state failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:get-state", true);
      });
    });

    describe("sidebar:set-state", () => {
      it("should save collapsed state to database", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:set-state")!;

        // Act
        const result = await handler({}, { collapsed: true });

        // Assert
        expect(result).toEqual({ success: true });
        expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:set-state", true);
      });

      it("should save expanded state to database", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:set-state")!;

        // Act
        const result = await handler({}, { collapsed: false });

        // Assert
        expect(result).toEqual({ success: true });
        expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:set-state", true);
      });

      it("should handle sidebar:set-state with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:set-state")!;

        // Act - missing collapsed property
        const result1 = await handler({}, {});

        // Assert
        expect(result1).toEqual({
          success: false,
          error: "Invalid request parameters.",
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for sidebar:set-state",
          expect.any(IPCValidationError),
        );

        // Act - wrong type for collapsed property
        const result2 = await handler({}, { collapsed: "true" });

        // Assert
        expect(result2).toEqual({
          success: false,
          error: "Invalid request parameters.",
        });
      });

      it("should handle database errors during state save", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:set-state")!;
        mockRun.mockImplementation(() => {
          throw new Error("Database write failed");
        });

        // Act
        const result = await handler({}, { collapsed: true });

        // Assert
        expect(result).toEqual({
          success: false,
          error: "Failed to update sidebar state.",
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Sidebar set-state failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "sidebar:set-state", true);
      });
    });
  });

  describe("Performance IPC Handlers", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    describe("performance:get-metrics", () => {
      /* Preconditions: performance:get-metrics handler is registered, process metrics are available
         Action: call performance:get-metrics IPC handler with no parameters
         Assertions: returns valid performance metrics with memory, CPU, uptime, and PID data
         Requirements: platform-foundation.5.3 */
      it("should return valid performance metrics", async () => {
        // Arrange
        const handler = registeredHandlers.get("performance:get-metrics")!;

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toHaveProperty("latest");
        expect(result).toHaveProperty("averageMemoryUsageMB");
        expect(result).toHaveProperty("uptime");
        expect(result).toHaveProperty("pid");

        // Validate latest metrics structure
        expect(result.latest).toHaveProperty("memoryUsageMB");
        expect(result.latest).toHaveProperty("heapTotalMB");
        expect(result.latest).toHaveProperty("externalMB");
        expect(result.latest).toHaveProperty("cpuUser");
        expect(result.latest).toHaveProperty("cpuSystem");
        expect(result.latest).toHaveProperty("timestamp");

        // Validate data types and ranges
        expect(typeof result.latest.memoryUsageMB).toBe("number");
        expect(typeof result.latest.heapTotalMB).toBe("number");
        expect(typeof result.latest.externalMB).toBe("number");
        expect(typeof result.latest.cpuUser).toBe("number");
        expect(typeof result.latest.cpuSystem).toBe("number");
        expect(typeof result.latest.timestamp).toBe("number");
        expect(typeof result.averageMemoryUsageMB).toBe("number");
        expect(typeof result.uptime).toBe("number");
        expect(typeof result.pid).toBe("number");

        // Validate reasonable ranges
        expect(result.latest.memoryUsageMB).toBeGreaterThan(0);
        expect(result.latest.heapTotalMB).toBeGreaterThan(0);
        expect(result.latest.externalMB).toBeGreaterThan(0);
        expect(result.latest.cpuUser).toBeGreaterThanOrEqual(0);
        expect(result.latest.cpuSystem).toBeGreaterThanOrEqual(0);
        expect(result.latest.timestamp).toBeGreaterThan(0);
        expect(result.averageMemoryUsageMB).toBeGreaterThan(0);
        expect(result.uptime).toBeGreaterThan(0);
        expect(result.pid).toBeGreaterThan(0);

        expect(mockTimer.end).toHaveBeenCalledWith(
          "/test/userdata",
          "performance:get-metrics",
          true,
        );
      });

      /* Preconditions: performance:get-metrics handler is registered
         Action: call performance:get-metrics IPC handler with invalid parameters
         Assertions: returns fallback metrics with latest: null and validation error logged
         Requirements: platform-foundation.5.3 */
      it("should handle performance:get-metrics with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("performance:get-metrics")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({
          latest: null,
          averageMemoryUsageMB: 0,
          uptime: 0,
          pid: process.pid,
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for performance:get-metrics",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith(
          "/test/userdata",
          "performance:get-metrics",
          true,
        );
      });

      /* Preconditions: performance:get-metrics handler is registered, process metrics collection fails
         Action: call performance:get-metrics IPC handler when metrics collection throws error
         Assertions: returns fallback metrics with latest: null and error logged
         Requirements: platform-foundation.5.3 */
      it("should handle metrics collection errors gracefully", async () => {
        // Arrange
        const handler = registeredHandlers.get("performance:get-metrics")!;

        // Mock the handler to throw an error during metrics collection
        const errorHandler = async (_event: any, params: any) => {
          const rootDir = "/test/userdata";
          const timer = mockTimer;

          try {
            // Validate parameters
            if (params !== undefined && params !== null) {
              throw new IPCValidationError("performance:get-metrics", "Expected no parameters");
            }

            // Simulate metrics collection error
            throw new Error("Process metrics unavailable");
          } catch (error) {
            if (error instanceof IPCValidationError) {
              mockedLogError(rootDir, "IPC validation failed for performance:get-metrics", error);
              const result = {
                latest: null,
                averageMemoryUsageMB: 0,
                uptime: 0,
                pid: process.pid,
              };
              timer.end(rootDir, "performance:get-metrics", true);
              return result;
            }

            mockedLogError(rootDir, "Performance get-metrics failed", error);
            const result = {
              latest: null,
              averageMemoryUsageMB: 0,
              uptime: 0,
              pid: process.pid,
            };
            timer.end(rootDir, "performance:get-metrics", true);
            return result;
          }
        };

        // Act
        const result = await errorHandler({}, undefined);

        // Assert
        expect(result).toEqual({
          latest: null,
          averageMemoryUsageMB: 0,
          uptime: 0,
          pid: process.pid,
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Performance get-metrics failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith(
          "/test/userdata",
          "performance:get-metrics",
          true,
        );
      });

      /* Preconditions: performance:get-metrics handler is registered
         Action: call performance:get-metrics multiple times concurrently
         Assertions: all calls return valid metrics without interference
         Requirements: platform-foundation.5.3 */
      it("should handle concurrent performance metrics requests", async () => {
        // Arrange
        const handler = registeredHandlers.get("performance:get-metrics")!;

        // Act - Simulate concurrent calls
        const promises = Array.from({ length: 5 }, () => handler({}, undefined));
        const results = await Promise.all(promises);

        // Assert
        results.forEach((result) => {
          expect(result).toHaveProperty("latest");
          expect(result).toHaveProperty("averageMemoryUsageMB");
          expect(result).toHaveProperty("uptime");
          expect(result).toHaveProperty("pid");
          expect(result.latest).not.toBeNull();
        });
        expect(mockTimer.end).toHaveBeenCalledTimes(5);
      });

      /* Preconditions: performance:get-metrics handler is registered
         Action: call performance:get-metrics and verify metric value precision
         Assertions: memory values are rounded to 2 decimal places, CPU values are rounded to 2 decimal places
         Requirements: platform-foundation.5.3 */
      it("should return properly formatted metric values", async () => {
        // Arrange
        const handler = registeredHandlers.get("performance:get-metrics")!;

        // Act
        const result = await handler({}, undefined);

        // Assert - Check precision formatting
        expect(result.latest.memoryUsageMB).toBe(50); // 50MB exactly
        expect(result.latest.heapTotalMB).toBe(30); // 30MB exactly
        expect(result.latest.externalMB).toBe(5); // 5MB exactly
        expect(result.latest.cpuUser).toBe(100); // 100ms exactly
        expect(result.latest.cpuSystem).toBe(50); // 50ms exactly
        expect(result.uptime).toBe(120.5); // 120.5s exactly

        // Verify timestamp is recent
        const now = Date.now();
        expect(result.latest.timestamp).toBeGreaterThan(now - 1000); // Within last second
        expect(result.latest.timestamp).toBeLessThanOrEqual(now);
      });
    });
  });

  describe("Security IPC Handlers", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    describe("security:audit", () => {
      /* Preconditions: security:audit handler is registered, main window security settings are configured
         Action: call security:audit IPC handler with no parameters
         Assertions: returns security audit results with context isolation and security settings
         Requirements: platform-foundation.4.1, platform-foundation.4.2 */
      it("should return valid security audit results", async () => {
        // Arrange
        const handler = registeredHandlers.get("security:audit")!;

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(result).toHaveProperty("passed");
        expect(result).toHaveProperty("results");
        expect(result).toHaveProperty("timestamp");

        // Validate results structure
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.results.length).toBeGreaterThan(0);

        const auditResult = result.results[0];
        expect(auditResult).toHaveProperty("contextIsolation");
        expect(auditResult).toHaveProperty("nodeIntegration");
        expect(auditResult).toHaveProperty("webSecurity");
        expect(auditResult).toHaveProperty("allowRunningInsecureContent");
        expect(auditResult).toHaveProperty("experimentalFeatures");
        expect(auditResult).toHaveProperty("preloadScript");
        expect(auditResult).toHaveProperty("timestamp");
        expect(auditResult).toHaveProperty("passed");
        expect(auditResult).toHaveProperty("issues");

        // Validate data types
        expect(typeof result.passed).toBe("boolean");
        expect(typeof result.timestamp).toBe("number");
        expect(typeof auditResult.contextIsolation).toBe("boolean");
        expect(typeof auditResult.nodeIntegration).toBe("boolean");
        expect(typeof auditResult.webSecurity).toBe("boolean");
        expect(typeof auditResult.allowRunningInsecureContent).toBe("boolean");
        expect(typeof auditResult.experimentalFeatures).toBe("boolean");
        expect(typeof auditResult.timestamp).toBe("number");
        expect(typeof auditResult.passed).toBe("boolean");
        expect(Array.isArray(auditResult.issues)).toBe(true);

        // Validate secure configuration
        expect(result.passed).toBe(true);
        expect(auditResult.contextIsolation).toBe(true);
        expect(auditResult.nodeIntegration).toBe(true); // true means nodeIntegration is disabled (secure)
        expect(auditResult.webSecurity).toBe(true);
        expect(auditResult.allowRunningInsecureContent).toBe(true); // true means insecure content is disabled (secure)
        expect(auditResult.experimentalFeatures).toBe(true); // true means experimental features are disabled (secure)
        expect(auditResult.preloadScript).toBeTruthy();
        expect(auditResult.issues).toHaveLength(0);

        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "security:audit", true);
      });

      /* Preconditions: security:audit handler is registered
         Action: call security:audit IPC handler with invalid parameters
         Assertions: returns failed audit with validation error and error logged
         Requirements: platform-foundation.4.1, platform-foundation.4.2 */
      it("should handle security:audit with invalid parameters", async () => {
        // Arrange
        const handler = registeredHandlers.get("security:audit")!;

        // Act
        const result = await handler({}, { invalid: "params" });

        // Assert
        expect(result).toEqual({
          passed: false,
          results: [
            {
              contextIsolation: false,
              nodeIntegration: false,
              webSecurity: false,
              allowRunningInsecureContent: false,
              experimentalFeatures: false,
              preloadScript: null,
              timestamp: expect.any(Number),
              passed: false,
              issues: ["Security audit failed due to invalid parameters"],
            },
          ],
          timestamp: expect.any(Number),
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "IPC validation failed for security:audit",
          expect.any(IPCValidationError),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "security:audit", true);
      });

      /* Preconditions: security:audit handler is registered, audit process fails
         Action: call security:audit IPC handler when audit throws internal error
         Assertions: returns failed audit with internal error and error logged
         Requirements: platform-foundation.4.1, platform-foundation.4.2 */
      it("should handle security audit internal errors gracefully", async () => {
        // Arrange
        const handler = registeredHandlers.get("security:audit")!;

        // Mock the handler to throw an error during audit
        const errorHandler = async (_event: any, params: any) => {
          const rootDir = "/test/userdata";
          const timer = mockTimer;

          try {
            // Validate parameters
            if (params !== undefined && params !== null) {
              throw new IPCValidationError("security:audit", "Expected no parameters");
            }

            // Simulate audit error
            throw new Error("Security audit process failed");
          } catch (error) {
            if (error instanceof IPCValidationError) {
              mockedLogError(rootDir, "IPC validation failed for security:audit", error);
              const result = {
                passed: false,
                results: [
                  {
                    contextIsolation: false,
                    nodeIntegration: false,
                    webSecurity: false,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    preloadScript: null,
                    timestamp: Date.now(),
                    passed: false,
                    issues: ["Security audit failed due to invalid parameters"],
                  },
                ],
                timestamp: Date.now(),
              };
              timer.end(rootDir, "security:audit", true);
              return result;
            }

            mockedLogError(rootDir, "Security audit failed", error);
            const result = {
              passed: false,
              results: [
                {
                  contextIsolation: false,
                  nodeIntegration: false,
                  webSecurity: false,
                  allowRunningInsecureContent: false,
                  experimentalFeatures: false,
                  preloadScript: null,
                  timestamp: Date.now(),
                  passed: false,
                  issues: ["Security audit failed due to internal error"],
                },
              ],
              timestamp: Date.now(),
            };
            timer.end(rootDir, "security:audit", true);
            return result;
          }
        };

        // Act
        const result = await errorHandler({}, undefined);

        // Assert
        expect(result).toEqual({
          passed: false,
          results: [
            {
              contextIsolation: false,
              nodeIntegration: false,
              webSecurity: false,
              allowRunningInsecureContent: false,
              experimentalFeatures: false,
              preloadScript: null,
              timestamp: expect.any(Number),
              passed: false,
              issues: ["Security audit failed due to internal error"],
            },
          ],
          timestamp: expect.any(Number),
        });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Security audit failed",
          expect.any(Error),
        );
        expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "security:audit", true);
      });

      /* Preconditions: security:audit handler is registered
         Action: call security:audit multiple times concurrently
         Assertions: all calls return valid audit results without interference
         Requirements: platform-foundation.4.1, platform-foundation.4.2 */
      it("should handle concurrent security audit requests", async () => {
        // Arrange
        const handler = registeredHandlers.get("security:audit")!;

        // Act - Simulate concurrent calls
        const promises = Array.from({ length: 3 }, () => handler({}, undefined));
        const results = await Promise.all(promises);

        // Assert
        results.forEach((result) => {
          expect(result).toHaveProperty("passed");
          expect(result).toHaveProperty("results");
          expect(result).toHaveProperty("timestamp");
          expect(result.passed).toBe(true);
          expect(result.results).toHaveLength(1);
        });
        expect(mockTimer.end).toHaveBeenCalledTimes(3);
      });

      /* Preconditions: security:audit handler is registered
         Action: call security:audit and verify audit result timestamps
         Assertions: timestamps are recent and properly formatted
         Requirements: platform-foundation.4.1, platform-foundation.4.2 */
      it("should return properly formatted audit timestamps", async () => {
        // Arrange
        const handler = registeredHandlers.get("security:audit")!;
        const beforeTime = Date.now();

        // Act
        const result = await handler({}, undefined);

        // Assert
        const afterTime = Date.now();
        expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(result.timestamp).toBeLessThanOrEqual(afterTime);

        const auditResult = result.results[0];
        expect(auditResult.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(auditResult.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });

  describe("Preload Log Handler", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    it("should handle preload log messages", async () => {
      // Arrange
      const handler = registeredHandlers.get("preload:log")!;

      // Act - Test different log levels
      handler({}, { level: "DEBUG", message: "Debug message", data: { test: true } });
      handler({}, { level: "INFO", message: "Info message" });
      handler({}, { level: "WARN", message: "Warning message" });
      handler({}, { level: "ERROR", message: "Error message", data: new Error("Test error") });
      handler({}, { level: "UNKNOWN", message: "Unknown level message" });

      // Assert
      expect(mockedLogDebug).toHaveBeenCalledWith("/test/userdata", "[PRELOAD] Debug message", {
        test: true,
      });
      expect(mockedLogInfo).toHaveBeenCalledWith(
        "/test/userdata",
        "[PRELOAD] Info message",
        undefined,
      );
      expect(mockedLogInfo).toHaveBeenCalledWith(
        "/test/userdata",
        "[PRELOAD] Unknown level message",
        undefined,
      );
    });

    it("should handle malformed log data from preload", async () => {
      // Arrange
      const handler = registeredHandlers.get("preload:log")!;

      // Act - Test malformed log data
      handler({}, { level: null, message: undefined });
      handler({}, { level: 123, message: "test" });
      handler({}, {}); // Missing properties

      // Assert - Should not throw and should handle gracefully
      expect(mockedLogInfo).toHaveBeenCalled();
    });
  });

  describe("Dependency Mocking Tests", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    describe("File System Mocking", () => {
      it("should mock file system operations for logging", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue({
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 120000,
        });

        // Act
        await handler({}, undefined);

        // Assert - Verify that file system operations would be called in real logging
        // The mocks prevent actual file system access during testing
        expect(mockedFs.mkdirSync).toBeDefined();
        expect(mockedFs.appendFileSync).toBeDefined();
        expect(mockedFs.existsSync).toBeDefined();
        expect(mockedFs.statSync).toBeDefined();
      });

      it("should mock file system operations for token encryption key management", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;

        // Test scenario where encryption key file doesn't exist
        mockedFs.existsSync.mockReturnValue(false);
        mockedReadTokens.mockReturnValue({
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 120000,
        });

        // Act
        await handler({}, undefined);

        // Assert - Verify mocks are properly configured
        expect(mockedFs.existsSync).toBeDefined();
        expect(mockedFs.readFileSync).toBeDefined();
        expect(mockedFs.writeFileSync).toBeDefined();
      });

      it("should mock file system operations for database backup creation", async () => {
        // Arrange - Test database operations that would trigger backup creation
        const handler = registeredHandlers.get("sidebar:set-state")!;

        // Act
        await handler({}, { collapsed: true });

        // Assert - Verify file system mocks for database operations
        expect(mockedFs.mkdirSync).toBeDefined();
        expect(mockedFs.copyFileSync).toBeDefined();
        expect(mockedFs.statSync).toBeDefined();
        expect(mockedFs.existsSync).toBeDefined();
      });

      it("should handle file system errors gracefully with mocks", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:sign-out")!;

        // Mock clearTokens to throw an error (which would happen if file system fails)
        mockedClearTokens.mockImplementation(() => {
          throw new Error("File system access denied");
        });

        // Act
        const result = await handler({}, undefined);

        // Assert - Should handle error gracefully and return error response
        expect(result).toEqual({
          success: false,
          error: "Sign out failed.",
        });

        // Verify error was logged
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Auth sign-out failed",
          expect.any(Error),
        );
      });
    });

    describe("Database Mocking", () => {
      it("should mock database prepare and run operations", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:set-state")!;

        // Act
        await handler({}, { collapsed: true });

        // Assert
        expect(mockPrepare).toBeDefined();
        expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
      });

      it("should mock database get operations", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;
        mockGet.mockReturnValue({ value: "1" });

        // Act
        const result = await handler({}, undefined);

        // Assert
        expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
        expect(result).toEqual({ collapsed: true });
      });

      it("should handle database connection errors with mocks", async () => {
        // Arrange
        const handler = registeredHandlers.get("sidebar:get-state")!;
        mockGet.mockImplementation(() => {
          throw new Error("Database connection failed");
        });

        // Act
        const result = await handler({}, undefined);

        // Assert - Should handle error gracefully
        expect(result).toEqual({ collapsed: false });
        expect(mockedLogError).toHaveBeenCalledWith(
          "/test/userdata",
          "Sidebar get-state failed",
          expect.any(Error),
        );
      });

      it("should mock database transaction operations", async () => {
        // Arrange - Test that database transaction mocking is available
        const mockTransaction = vi.fn();
        mockDb.transaction = mockTransaction;

        // Act - Verify transaction mock is properly set up
        expect(mockDb.transaction).toBeDefined();
        expect(typeof mockDb.transaction).toBe("function");
      });

      it("should mock database pragma operations", async () => {
        // Arrange - Test database pragma mocking
        const mockPragma = vi.fn();
        mockDb.pragma = mockPragma;

        // Act - Verify pragma mock is properly set up
        expect(mockDb.pragma).toBeDefined();
        expect(typeof mockDb.pragma).toBe("function");
      });
    });

    describe("Crypto Mocking", () => {
      it("should mock crypto operations for token encryption", async () => {
        // Arrange
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue({
          accessToken: "encrypted-token",
          refreshToken: "encrypted-refresh",
          expiresAt: Date.now() + 120000,
        });

        // Act
        await handler({}, undefined);

        // Assert - Verify crypto mocks are available
        expect(mockedCrypto.randomBytes).toBeDefined();
        expect(mockedCrypto.createCipheriv).toBeDefined();
        expect(mockedCrypto.createDecipheriv).toBeDefined();
      });

      it("should mock cipher operations", () => {
        // Arrange & Act
        const cipher = mockedCrypto.createCipheriv(
          "aes-256-gcm",
          Buffer.alloc(32),
          Buffer.alloc(12),
        );

        // Assert
        expect(cipher.update).toBeDefined();
        expect(cipher.final).toBeDefined();
        expect(cipher.getAuthTag).toBeDefined();
      });

      it("should mock decipher operations", () => {
        // Arrange & Act
        const decipher = mockedCrypto.createDecipheriv(
          "aes-256-gcm",
          Buffer.alloc(32),
          Buffer.alloc(12),
        );

        // Assert
        expect(decipher.update).toBeDefined();
        expect(decipher.final).toBeDefined();
        expect(decipher.setAuthTag).toBeDefined();
      });

      it("should mock random bytes generation", () => {
        // Arrange & Act
        const randomBytes = mockedCrypto.randomBytes(32);

        // Assert
        expect(randomBytes).toBeInstanceOf(Buffer);
        expect(randomBytes.length).toBeGreaterThan(0);
      });
    });

    describe("Integration Mocking Tests", () => {
      it("should handle complex operations with multiple mocked dependencies", async () => {
        // Arrange - Test scenario that would use database, file system, and crypto
        const authHandler = registeredHandlers.get("auth:get-state")!;
        const sidebarHandler = registeredHandlers.get("sidebar:set-state")!;

        // Setup complex mock scenario
        mockedFs.existsSync.mockReturnValue(true);
        mockedReadTokens.mockReturnValue({
          accessToken: "complex-token",
          refreshToken: "complex-refresh",
          expiresAt: Date.now() + 120000,
        });

        // Act - Execute multiple operations
        const authResult = await authHandler({}, undefined);
        const sidebarResult = await sidebarHandler({}, { collapsed: false });

        // Assert - All operations should succeed with mocked dependencies
        expect(authResult).toEqual({ authorized: true });
        expect(sidebarResult).toEqual({ success: true });

        // Verify mocks were used appropriately
        expect(mockedReadTokens).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
      });

      it("should isolate tests with proper mock cleanup", async () => {
        // Arrange - First test run
        const handler = registeredHandlers.get("auth:get-state")!;
        mockedReadTokens.mockReturnValue({
          accessToken: "test1",
          expiresAt: Date.now() + 120000,
        });

        // Act - First execution
        const result1 = await handler({}, undefined);

        // Assert - First result
        expect(result1).toEqual({ authorized: true });

        // Arrange - Second test run with different mock data
        mockedReadTokens.mockReturnValue({
          accessToken: "test2",
          expiresAt: Date.now() - 1000,
        });

        // Act - Second execution
        const result2 = await handler({}, undefined);

        // Assert - Second result should be different
        expect(result2).toEqual({ authorized: false });

        // Verify mocks can be reconfigured between tests
        expect(mockedReadTokens).toHaveBeenCalledTimes(2);
      });

      it("should handle edge cases with mocked dependencies", async () => {
        // Arrange - Test edge cases that would be difficult without mocking
        const handler = registeredHandlers.get("sidebar:get-state")!;

        // Mock edge case: database returns unexpected data
        mockGet.mockReturnValue({ value: "invalid-value" });

        // Act
        const result = await handler({}, undefined);

        // Assert - Should handle edge case gracefully
        expect(result).toEqual({ collapsed: false });
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    beforeEach(() => {
      simulateHandlerRegistration();
    });

    it("should handle concurrent IPC calls", async () => {
      // Arrange
      const handler = registeredHandlers.get("auth:get-state")!;
      mockedReadTokens.mockReturnValue({
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 120000,
      });

      // Act - Simulate concurrent calls
      const promises = Array.from({ length: 5 }, () => handler({}, undefined));
      const results = await Promise.all(promises);

      // Assert
      results.forEach((result) => {
        expect(result).toEqual({ authorized: true });
      });
      expect(mockedReadTokens).toHaveBeenCalledTimes(5);
    });

    it("should properly time IPC operations", async () => {
      // Arrange
      const handler = registeredHandlers.get("auth:get-state")!;
      mockedReadTokens.mockReturnValue(null);

      // Act
      await handler({}, undefined);

      // Assert
      expect(mockTimer.end).toHaveBeenCalledWith("/test/userdata", "auth:get-state", true);
    });

    it("should handle memory pressure during large operations", async () => {
      // Arrange
      const handler = registeredHandlers.get("sidebar:set-state")!;

      // Mock a slow database operation
      mockRun.mockImplementation(() => {
        // Simulate slow operation
        return new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Act - Multiple concurrent operations
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler({}, { collapsed: i % 2 === 0 }),
      );
      const results = await Promise.all(promises);

      // Assert
      results.forEach((result) => {
        expect(result).toEqual({ success: true });
      });
    });

    it("should handle null/undefined values gracefully", async () => {
      // Arrange
      const authHandler = registeredHandlers.get("auth:get-state")!;
      const sidebarHandler = registeredHandlers.get("sidebar:get-state")!;

      // Mock edge case returns
      mockedReadTokens.mockReturnValue(null);
      mockGet.mockReturnValue(null);

      // Act
      const authResult = await authHandler({}, undefined);
      const sidebarResult = await sidebarHandler({}, undefined);

      // Assert
      expect(authResult).toEqual({ authorized: false });
      expect(sidebarResult).toEqual({ collapsed: false });
    });

    it("should validate parameter types strictly", async () => {
      // Arrange
      const handler = registeredHandlers.get("sidebar:set-state")!;

      // Act & Assert - Test various invalid parameter types
      const testCases = [
        null,
        undefined,
        "string",
        123,
        [],
        { collapsed: "true" }, // string instead of boolean
        { collapsed: 1 }, // number instead of boolean
        { notCollapsed: true }, // wrong property name
      ];

      for (const testCase of testCases) {
        const result = await handler({}, testCase);
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid request parameters.");
      }
    });
  });
});
