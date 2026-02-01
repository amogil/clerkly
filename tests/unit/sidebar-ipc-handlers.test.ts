// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2, sidebar-navigation.4.2
// Unit tests for sidebar IPC handlers

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";

// Type for SqliteDatabase
type SqliteDatabase = InstanceType<typeof Database>;

// Mock the IPC validators module
vi.mock("../../src/ipc/validators", () => ({
  validateIPCParams: vi.fn(),
  IPCValidationError: class IPCValidationError extends Error {
    constructor(channel: string, message: string) {
      super(`IPC validation error for channel "${channel}": ${message}`);
      this.name = "IPCValidationError";
    }
  },
}));

// Mock the logger module
vi.mock("../../src/logging/logger", () => ({
  logError: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  createIPCTimer: vi.fn(() => ({
    end: vi.fn(),
  })),
}));

// Import after mocking
import { validateIPCParams, IPCValidationError } from "../../src/ipc/validators";
import { logError, logDebug } from "../../src/logging/logger";

// Requirements: sidebar-navigation.4.1
const SIDEBAR_STATE_KEY = "sidebar_collapsed";

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3
const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY) as
    | { value: string }
    | undefined;
  return row?.value === "1";
};

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2
const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(SIDEBAR_STATE_KEY, collapsed ? "1" : "0");
};

// Simulate the IPC handler implementations
// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2
const createSidebarGetStateHandler = (db: SqliteDatabase, rootDir: string) => {
  return (_event: unknown, params: unknown) => {
    logDebug(rootDir, "IPC call: sidebar:get-state", { params });

    try {
      // Validate IPC parameters
      validateIPCParams("sidebar:get-state", params);

      const result = { collapsed: getSidebarCollapsed(db) };
      logDebug(rootDir, "IPC response: sidebar:get-state", { result });
      return result;
    } catch (error) {
      if (error instanceof IPCValidationError) {
        logError(rootDir, "IPC validation failed for sidebar:get-state", error);
        const result = { collapsed: false }; // Return default state on validation error
        logDebug(rootDir, "IPC response: sidebar:get-state", { result });
        return result;
      }

      // Log unexpected errors but still return a valid response
      logError(rootDir, "Sidebar get-state failed", error);
      const result = { collapsed: false };
      logDebug(rootDir, "IPC response: sidebar:get-state", { result });
      return result;
    }
  };
};

// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2, sidebar-navigation.4.2
const createSidebarSetStateHandler = (db: SqliteDatabase, rootDir: string) => {
  return (_event: unknown, params: unknown) => {
    logDebug(rootDir, "IPC call: sidebar:set-state", { params });

    try {
      // Validate IPC parameters
      validateIPCParams("sidebar:set-state", params);

      setSidebarCollapsed(db, (params as { collapsed: boolean }).collapsed);
      const result = { success: true };
      logDebug(rootDir, "IPC response: sidebar:set-state", { result });
      return result;
    } catch (error) {
      if (error instanceof IPCValidationError) {
        logError(rootDir, "IPC validation failed for sidebar:set-state", error);
        const result = { success: false, error: "Invalid request parameters." };
        logDebug(rootDir, "IPC response: sidebar:set-state", { result });
        return result;
      }

      // Log unexpected errors
      logError(rootDir, "Sidebar set-state failed", error);
      const result = { success: false, error: "Failed to update sidebar state." };
      logDebug(rootDir, "IPC response: sidebar:set-state", { result });
      return result;
    }
  };
};

describe("Sidebar IPC Handlers", () => {
  let mockDb: any;
  let mockPrepare: vi.MockedFunction<any>;
  let mockRun: vi.MockedFunction<any>;
  let mockGet: vi.MockedFunction<any>;
  const rootDir = "/test/user/data";

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset validateIPCParams to do nothing by default (validation passes)
    vi.mocked(validateIPCParams).mockImplementation(() => {
      // Validation passes by default
    });

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sidebar:get-state handler", () => {
    /* Preconditions: database is empty, no sidebar state stored
       Action: call sidebar:get-state IPC handler
       Assertions: returns collapsed false (default state)
       Requirements: sidebar-navigation.4.3, sidebar-navigation.5.1 */
    it("should return default expanded state when no database record exists", () => {
      // Arrange
      mockGet.mockReturnValue(undefined);
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, undefined);

      // Assert
      expect(result).toEqual({ collapsed: false });
      expect(validateIPCParams).toHaveBeenCalledWith("sidebar:get-state", undefined);
      expect(logDebug).toHaveBeenCalledWith(rootDir, "IPC call: sidebar:get-state", {
        params: undefined,
      });
      expect(logDebug).toHaveBeenCalledWith(rootDir, "IPC response: sidebar:get-state", {
        result: { collapsed: false },
      });
    });

    /* Preconditions: database contains collapsed=true state
       Action: call sidebar:get-state IPC handler
       Assertions: returns collapsed true
       Requirements: sidebar-navigation.4.1, sidebar-navigation.5.1 */
    it("should return stored collapsed state from database", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "1" });
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, undefined);

      // Assert
      expect(result).toEqual({ collapsed: true });
      expect(validateIPCParams).toHaveBeenCalledWith("sidebar:get-state", undefined);
      expect(mockPrepare).toHaveBeenCalledWith("SELECT value FROM app_meta WHERE key = ?");
      expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
    });

    /* Preconditions: database contains collapsed=false state
       Action: call sidebar:get-state IPC handler
       Assertions: returns collapsed false
       Requirements: sidebar-navigation.4.1, sidebar-navigation.5.1 */
    it("should return stored expanded state from database", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "0" });
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, undefined);

      // Assert
      expect(result).toEqual({ collapsed: false });
      expect(validateIPCParams).toHaveBeenCalledWith("sidebar:get-state", undefined);
    });

    /* Preconditions: IPC validation fails
       Action: call sidebar:get-state with invalid parameters
       Assertions: returns default state, logs validation error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return default state when validation fails", () => {
      // Arrange
      const validationError = new IPCValidationError("sidebar:get-state", "Expected no parameters");
      vi.mocked(validateIPCParams).mockImplementation(() => {
        throw validationError;
      });
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, { unexpected: "param" });

      // Assert
      expect(result).toEqual({ collapsed: false });
      expect(logError).toHaveBeenCalledWith(
        rootDir,
        "IPC validation failed for sidebar:get-state",
        validationError,
      );
    });

    /* Preconditions: database throws error
       Action: call sidebar:get-state when database fails
       Assertions: returns default state, logs error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return default state when database fails", () => {
      // Arrange
      const dbError = new Error("Database connection failed");
      mockPrepare.mockImplementation(() => {
        throw dbError;
      });
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, undefined);

      // Assert
      expect(result).toEqual({ collapsed: false });
      expect(logError).toHaveBeenCalledWith(rootDir, "Sidebar get-state failed", dbError);
    });

    /* Preconditions: database get throws error
       Action: call sidebar:get-state when database get fails
       Assertions: returns default state, logs error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return default state when database get fails", () => {
      // Arrange
      const getError = new Error("Database read failed");
      mockGet.mockImplementation(() => {
        throw getError;
      });
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, undefined);

      // Assert
      expect(result).toEqual({ collapsed: false });
      expect(logError).toHaveBeenCalledWith(rootDir, "Sidebar get-state failed", getError);
    });
  });

  describe("sidebar:set-state handler", () => {
    /* Preconditions: valid collapsed parameter provided
       Action: call sidebar:set-state with collapsed: true
       Assertions: database updated with "1", returns success true
       Requirements: sidebar-navigation.4.2, sidebar-navigation.5.1 */
    it("should save collapsed state to database", () => {
      // Arrange
      const handler = createSidebarSetStateHandler(mockDb, rootDir);
      const params = { collapsed: true };

      // Act
      const result = handler({}, params);

      // Assert
      expect(result).toEqual({ success: true });
      expect(validateIPCParams).toHaveBeenCalledWith("sidebar:set-state", params);
      expect(mockPrepare).toHaveBeenCalledWith(
        "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
      expect(logDebug).toHaveBeenCalledWith(rootDir, "IPC call: sidebar:set-state", { params });
      expect(logDebug).toHaveBeenCalledWith(rootDir, "IPC response: sidebar:set-state", {
        result: { success: true },
      });
    });

    /* Preconditions: valid collapsed parameter provided
       Action: call sidebar:set-state with collapsed: false
       Assertions: database updated with "0", returns success true
       Requirements: sidebar-navigation.4.2, sidebar-navigation.5.1 */
    it("should save expanded state to database", () => {
      // Arrange
      const handler = createSidebarSetStateHandler(mockDb, rootDir);
      const params = { collapsed: false };

      // Act
      const result = handler({}, params);

      // Assert
      expect(result).toEqual({ success: true });
      expect(validateIPCParams).toHaveBeenCalledWith("sidebar:set-state", params);
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
    });

    /* Preconditions: IPC validation fails
       Action: call sidebar:set-state with invalid parameters
       Assertions: returns success false with error message, logs validation error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return error when validation fails", () => {
      // Arrange
      const validationError = new IPCValidationError(
        "sidebar:set-state",
        "Missing required property 'collapsed'",
      );
      vi.mocked(validateIPCParams).mockImplementation(() => {
        throw validationError;
      });
      const handler = createSidebarSetStateHandler(mockDb, rootDir);

      // Act
      const result = handler({}, {});

      // Assert
      expect(result).toEqual({ success: false, error: "Invalid request parameters." });
      expect(logError).toHaveBeenCalledWith(
        rootDir,
        "IPC validation failed for sidebar:set-state",
        validationError,
      );
    });

    /* Preconditions: database throws error
       Action: call sidebar:set-state when database fails
       Assertions: returns success false with error message, logs error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return error when database fails", () => {
      // Arrange
      const dbError = new Error("Database write failed");
      mockPrepare.mockImplementation(() => {
        throw dbError;
      });
      const handler = createSidebarSetStateHandler(mockDb, rootDir);
      const params = { collapsed: true };

      // Act
      const result = handler({}, params);

      // Assert
      expect(result).toEqual({ success: false, error: "Failed to update sidebar state." });
      expect(logError).toHaveBeenCalledWith(rootDir, "Sidebar set-state failed", dbError);
    });

    /* Preconditions: database run throws error
       Action: call sidebar:set-state when database run fails
       Assertions: returns success false with error message, logs error
       Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2 */
    it("should return error when database run fails", () => {
      // Arrange
      const runError = new Error("Database constraint violation");
      mockRun.mockImplementation(() => {
        throw runError;
      });
      const handler = createSidebarSetStateHandler(mockDb, rootDir);
      const params = { collapsed: true };

      // Act
      const result = handler({}, params);

      // Assert
      expect(result).toEqual({ success: false, error: "Failed to update sidebar state." });
      expect(logError).toHaveBeenCalledWith(rootDir, "Sidebar set-state failed", runError);
    });

    /* Preconditions: multiple calls to sidebar:set-state
       Action: call sidebar:set-state twice with different values
       Assertions: both calls succeed, database updated twice
       Requirements: sidebar-navigation.4.2, sidebar-navigation.5.2 */
    it("should handle multiple state changes correctly", () => {
      // Arrange
      const handler = createSidebarSetStateHandler(mockDb, rootDir);

      // Act
      const result1 = handler({}, { collapsed: true });
      const result2 = handler({}, { collapsed: false });

      // Assert
      expect(result1).toEqual({ success: true });
      expect(result2).toEqual({ success: true });
      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenNthCalledWith(1, "sidebar_collapsed", "1");
      expect(mockRun).toHaveBeenNthCalledWith(2, "sidebar_collapsed", "0");
    });
  });

  describe("IPC handler integration", () => {
    /* Preconditions: database is empty
       Action: call sidebar:set-state to save, then sidebar:get-state to load
       Assertions: loaded value equals saved value
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2, sidebar-navigation.5.2 */
    it("should persist and restore state through IPC handlers", () => {
      // Arrange
      const getHandler = createSidebarGetStateHandler(mockDb, rootDir);
      const setHandler = createSidebarSetStateHandler(mockDb, rootDir);

      // Act - Save collapsed state
      const setResult = setHandler({}, { collapsed: true });

      // Simulate database storing the value
      mockGet.mockReturnValue({ value: "1" });

      // Act - Load state
      const getResult = getHandler({}, undefined);

      // Assert
      expect(setResult).toEqual({ success: true });
      expect(getResult).toEqual({ collapsed: true });
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });

    /* Preconditions: database contains state
       Action: call sidebar:set-state to update, then sidebar:get-state to verify
       Assertions: state is updated correctly
       Requirements: sidebar-navigation.4.2, sidebar-navigation.5.2 */
    it("should update existing state through IPC handlers", () => {
      // Arrange
      const getHandler = createSidebarGetStateHandler(mockDb, rootDir);
      const setHandler = createSidebarSetStateHandler(mockDb, rootDir);

      // Initial state: collapsed
      mockGet.mockReturnValue({ value: "1" });
      const initialResult = getHandler({}, undefined);
      expect(initialResult).toEqual({ collapsed: true });

      // Act - Update to expanded
      const setResult = setHandler({}, { collapsed: false });

      // Simulate database updating the value
      mockGet.mockReturnValue({ value: "0" });

      // Act - Verify update
      const updatedResult = getHandler({}, undefined);

      // Assert
      expect(setResult).toEqual({ success: true });
      expect(updatedResult).toEqual({ collapsed: false });
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
    });
  });

  describe("Error recovery", () => {
    /* Preconditions: database fails on first call, succeeds on second
       Action: call sidebar:get-state twice
       Assertions: first call returns default, second call returns actual state
       Requirements: sidebar-navigation.5.2 */
    it("should recover from transient database errors", () => {
      // Arrange
      const handler = createSidebarGetStateHandler(mockDb, rootDir);

      // First call fails
      mockPrepare.mockImplementationOnce(() => {
        throw new Error("Transient database error");
      });

      // Act - First call
      const result1 = handler({}, undefined);

      // Assert - Returns default state
      expect(result1).toEqual({ collapsed: false });
      expect(logError).toHaveBeenCalledWith(rootDir, "Sidebar get-state failed", expect.any(Error));

      // Arrange - Second call succeeds
      mockPrepare.mockReturnValue({
        run: mockRun,
        get: mockGet,
      });
      mockGet.mockReturnValue({ value: "1" });

      // Act - Second call
      const result2 = handler({}, undefined);

      // Assert - Returns actual state
      expect(result2).toEqual({ collapsed: true });
    });

    /* Preconditions: validation fails on first call, succeeds on second
       Action: call sidebar:set-state twice
       Assertions: first call returns error, second call succeeds
       Requirements: sidebar-navigation.5.2 */
    it("should handle validation errors gracefully", () => {
      // Arrange
      const handler = createSidebarSetStateHandler(mockDb, rootDir);

      // First call - validation fails
      vi.mocked(validateIPCParams).mockImplementationOnce(() => {
        throw new IPCValidationError("sidebar:set-state", "Invalid parameters");
      });

      // Act - First call
      const result1 = handler({}, { invalid: "params" });

      // Assert - Returns error
      expect(result1).toEqual({ success: false, error: "Invalid request parameters." });

      // Arrange - Second call succeeds
      vi.mocked(validateIPCParams).mockImplementation(() => {
        // Validation passes
      });

      // Act - Second call
      const result2 = handler({}, { collapsed: true });

      // Assert - Succeeds
      expect(result2).toEqual({ success: true });
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });
  });
});
