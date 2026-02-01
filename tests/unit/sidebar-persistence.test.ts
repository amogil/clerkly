// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2, sidebar-navigation.4.3
// Unit tests for sidebar persistence functions

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

// Mock better-sqlite3
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

// Import after mocking
const mockedDatabase = Database as unknown as vi.MockedFunction<typeof Database>;

// Type for SqliteDatabase
type SqliteDatabase = InstanceType<typeof Database>;

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

describe("Sidebar Persistence Functions", () => {
  let mockDb: any;
  let mockPrepare: vi.MockedFunction<any>;
  let mockRun: vi.MockedFunction<any>;
  let mockGet: vi.MockedFunction<any>;

  beforeEach(() => {
    vi.clearAllMocks();

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSidebarCollapsed", () => {
    /* Preconditions: database is empty, no sidebar state stored
       Action: call getSidebarCollapsed with mock database
       Assertions: returns false (default expanded state)
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3 */
    it("should return default expanded state when no database record exists", () => {
      // Arrange
      mockGet.mockReturnValue(undefined);

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(false);
      expect(mockPrepare).toHaveBeenCalledWith("SELECT value FROM app_meta WHERE key = ?");
      expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
    });

    /* Preconditions: database contains collapsed=true state (value="1")
       Action: call getSidebarCollapsed with mock database
       Assertions: returns true (collapsed state)
       Requirements: sidebar-navigation.4.1 */
    it("should return true when database contains collapsed state", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "1" });

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(true);
      expect(mockPrepare).toHaveBeenCalledWith("SELECT value FROM app_meta WHERE key = ?");
      expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
    });

    /* Preconditions: database contains collapsed=false state (value="0")
       Action: call getSidebarCollapsed with mock database
       Assertions: returns false (expanded state)
       Requirements: sidebar-navigation.4.1 */
    it("should return false when database contains expanded state", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "0" });

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(false);
      expect(mockPrepare).toHaveBeenCalledWith("SELECT value FROM app_meta WHERE key = ?");
      expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
    });

    /* Preconditions: database returns null row
       Action: call getSidebarCollapsed with mock database
       Assertions: returns false (default expanded state)
       Requirements: sidebar-navigation.4.3 */
    it("should return default expanded state when database returns null", () => {
      // Arrange
      mockGet.mockReturnValue(null);

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(false);
    });

    /* Preconditions: database returns row with empty string value
       Action: call getSidebarCollapsed with mock database
       Assertions: returns false (treats empty string as expanded)
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3 */
    it("should return false when database contains empty string value", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "" });

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(false);
    });

    /* Preconditions: database returns row with invalid value
       Action: call getSidebarCollapsed with mock database
       Assertions: returns false (treats invalid value as expanded)
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3 */
    it("should return false when database contains invalid value", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "invalid" });

      // Act
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("setSidebarCollapsed", () => {
    /* Preconditions: valid collapsed parameter (true) provided
       Action: call setSidebarCollapsed with collapsed=true
       Assertions: database INSERT OR REPLACE executed with key="sidebar_collapsed" and value="1"
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should save collapsed state to database with value 1", () => {
      // Arrange
      const collapsed = true;

      // Act
      setSidebarCollapsed(mockDb, collapsed);

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith(
        "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });

    /* Preconditions: valid collapsed parameter (false) provided
       Action: call setSidebarCollapsed with collapsed=false
       Assertions: database INSERT OR REPLACE executed with key="sidebar_collapsed" and value="0"
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should save expanded state to database with value 0", () => {
      // Arrange
      const collapsed = false;

      // Act
      setSidebarCollapsed(mockDb, collapsed);

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith(
        "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
    });

    /* Preconditions: database already contains sidebar state
       Action: call setSidebarCollapsed with new state
       Assertions: database uses INSERT OR REPLACE to update existing record
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should update existing state in database using INSERT OR REPLACE", () => {
      // Arrange
      const collapsed = true;

      // Act
      setSidebarCollapsed(mockDb, collapsed);

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
      );
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });

    /* Preconditions: multiple calls to setSidebarCollapsed with different values
       Action: call setSidebarCollapsed twice with different collapsed values
       Assertions: database run called twice with correct values
       Requirements: sidebar-navigation.4.2 */
    it("should handle multiple state changes correctly", () => {
      // Arrange & Act
      setSidebarCollapsed(mockDb, true);
      setSidebarCollapsed(mockDb, false);

      // Assert
      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenNthCalledWith(1, "sidebar_collapsed", "1");
      expect(mockRun).toHaveBeenNthCalledWith(2, "sidebar_collapsed", "0");
    });
  });

  describe("Round-trip persistence", () => {
    /* Preconditions: database is empty
       Action: save collapsed=true, then read it back
       Assertions: read value equals saved value (true)
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should persist and restore collapsed state correctly", () => {
      // Arrange
      const collapsedState = true;

      // Act - Save
      setSidebarCollapsed(mockDb, collapsedState);

      // Simulate database storing the value
      mockGet.mockReturnValue({ value: "1" });

      // Act - Load
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(collapsedState);
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });

    /* Preconditions: database is empty
       Action: save collapsed=false, then read it back
       Assertions: read value equals saved value (false)
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should persist and restore expanded state correctly", () => {
      // Arrange
      const collapsedState = false;

      // Act - Save
      setSidebarCollapsed(mockDb, collapsedState);

      // Simulate database storing the value
      mockGet.mockReturnValue({ value: "0" });

      // Act - Load
      const result = getSidebarCollapsed(mockDb);

      // Assert
      expect(result).toBe(collapsedState);
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "0");
    });
  });

  describe("Edge cases", () => {
    /* Preconditions: database prepare throws error
       Action: call getSidebarCollapsed when database is unavailable
       Assertions: error is thrown (not caught by function)
       Requirements: sidebar-navigation.4.1 */
    it("should propagate database errors from getSidebarCollapsed", () => {
      // Arrange
      mockPrepare.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      // Act & Assert
      expect(() => getSidebarCollapsed(mockDb)).toThrow("Database connection failed");
    });

    /* Preconditions: database prepare throws error
       Action: call setSidebarCollapsed when database is unavailable
       Assertions: error is thrown (not caught by function)
       Requirements: sidebar-navigation.4.2 */
    it("should propagate database errors from setSidebarCollapsed", () => {
      // Arrange
      mockPrepare.mockImplementation(() => {
        throw new Error("Database write failed");
      });

      // Act & Assert
      expect(() => setSidebarCollapsed(mockDb, true)).toThrow("Database write failed");
    });

    /* Preconditions: database run throws error
       Action: call setSidebarCollapsed when database run fails
       Assertions: error is thrown
       Requirements: sidebar-navigation.4.2 */
    it("should propagate database run errors from setSidebarCollapsed", () => {
      // Arrange
      mockRun.mockImplementation(() => {
        throw new Error("Database constraint violation");
      });

      // Act & Assert
      expect(() => setSidebarCollapsed(mockDb, true)).toThrow("Database constraint violation");
    });

    /* Preconditions: database get throws error
       Action: call getSidebarCollapsed when database get fails
       Assertions: error is thrown
       Requirements: sidebar-navigation.4.1 */
    it("should propagate database get errors from getSidebarCollapsed", () => {
      // Arrange
      mockGet.mockImplementation(() => {
        throw new Error("Database read failed");
      });

      // Act & Assert
      expect(() => getSidebarCollapsed(mockDb)).toThrow("Database read failed");
    });
  });

  describe("Data integrity", () => {
    /* Preconditions: database contains sidebar state
       Action: verify correct table and key are used
       Assertions: uses app_meta table and sidebar_collapsed key
       Requirements: sidebar-navigation.4.1 */
    it("should use correct table and key for storage", () => {
      // Arrange
      mockGet.mockReturnValue({ value: "1" });

      // Act
      getSidebarCollapsed(mockDb);
      setSidebarCollapsed(mockDb, true);

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith("SELECT value FROM app_meta WHERE key = ?");
      expect(mockGet).toHaveBeenCalledWith("sidebar_collapsed");
      expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
    });

    /* Preconditions: none
       Action: verify boolean to string conversion
       Assertions: true converts to "1", false converts to "0"
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
    it("should correctly convert boolean to string for storage", () => {
      // Act
      setSidebarCollapsed(mockDb, true);
      setSidebarCollapsed(mockDb, false);

      // Assert
      expect(mockRun).toHaveBeenNthCalledWith(1, "sidebar_collapsed", "1");
      expect(mockRun).toHaveBeenNthCalledWith(2, "sidebar_collapsed", "0");
    });

    /* Preconditions: database contains various string values
       Action: verify string to boolean conversion
       Assertions: only "1" converts to true, all others convert to false
       Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3 */
    it("should correctly convert string to boolean when reading", () => {
      // Test "1" -> true
      mockGet.mockReturnValue({ value: "1" });
      expect(getSidebarCollapsed(mockDb)).toBe(true);

      // Test "0" -> false
      mockGet.mockReturnValue({ value: "0" });
      expect(getSidebarCollapsed(mockDb)).toBe(false);

      // Test empty string -> false
      mockGet.mockReturnValue({ value: "" });
      expect(getSidebarCollapsed(mockDb)).toBe(false);

      // Test "true" -> false (only "1" is true)
      mockGet.mockReturnValue({ value: "true" });
      expect(getSidebarCollapsed(mockDb)).toBe(false);

      // Test "false" -> false
      mockGet.mockReturnValue({ value: "false" });
      expect(getSidebarCollapsed(mockDb)).toBe(false);
    });
  });
});
