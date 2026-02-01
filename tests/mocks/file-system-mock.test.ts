// Requirements: testing-infrastructure.2.1
import { describe, it, expect, beforeEach } from "vitest";
import { FileSystemMockImpl } from "./file-system-mock";

describe("FileSystemMock", () => {
  let fsMock: FileSystemMockImpl;

  beforeEach(() => {
    fsMock = new FileSystemMockImpl();
  });

  describe("File Reading Operations", () => {
    /* Preconditions: mock file system is empty
       Action: attempt to read non-existent file with readFile
       Assertions: throws ENOENT error with correct properties
       Requirements: testing-infrastructure.2.1 */
    it("should throw ENOENT error when reading non-existent file", async () => {
      await expect(fsMock.readFile("/non-existent.txt")).rejects.toMatchObject({
        code: "ENOENT",
        errno: -2,
        path: "/non-existent.txt",
      });
    });

    /* Preconditions: mock file system is empty
       Action: attempt to read non-existent file with readFileSync
       Assertions: throws ENOENT error with correct properties
       Requirements: testing-infrastructure.2.1 */
    it("should throw ENOENT error when reading non-existent file synchronously", () => {
      expect(() => fsMock.readFileSync("/non-existent.txt")).toThrowError(
        expect.objectContaining({
          code: "ENOENT",
          errno: -2,
          path: "/non-existent.txt",
        }),
      );
    });

    /* Preconditions: mock file with content "test content" exists at /test.txt
       Action: read file with readFile
       Assertions: returns correct content
       Requirements: testing-infrastructure.2.1 */
    it("should read file content asynchronously", async () => {
      fsMock.setMockData("/test.txt", "test content");

      const content = await fsMock.readFile("/test.txt");
      expect(content).toBe("test content");
    });

    /* Preconditions: mock file with content "sync content" exists at /sync.txt
       Action: read file with readFileSync
       Assertions: returns correct content
       Requirements: testing-infrastructure.2.1 */
    it("should read file content synchronously", () => {
      fsMock.setMockData("/sync.txt", "sync content");

      const content = fsMock.readFileSync("/sync.txt");
      expect(content).toBe("sync content");
    });
  });

  describe("File Writing Operations", () => {
    /* Preconditions: mock file system is empty
       Action: write content to file with writeFile
       Assertions: file exists and contains correct content
       Requirements: testing-infrastructure.2.1 */
    it("should write file content asynchronously", async () => {
      await fsMock.writeFile("/new-file.txt", "new content");

      expect(fsMock.exists("/new-file.txt")).toBe(true);
      expect(fsMock.getMockData("/new-file.txt")).toBe("new content");
    });

    /* Preconditions: mock file system is empty
       Action: write content to file with writeFileSync
       Assertions: file exists and contains correct content
       Requirements: testing-infrastructure.2.1 */
    it("should write file content synchronously", () => {
      fsMock.writeFileSync("/sync-file.txt", "sync content");

      expect(fsMock.exists("/sync-file.txt")).toBe(true);
      expect(fsMock.getMockData("/sync-file.txt")).toBe("sync content");
    });

    /* Preconditions: mock file with content "old content" exists at /existing.txt
       Action: overwrite file with writeFile
       Assertions: file contains new content
       Requirements: testing-infrastructure.2.1 */
    it("should overwrite existing file content", async () => {
      fsMock.setMockData("/existing.txt", "old content");

      await fsMock.writeFile("/existing.txt", "new content");

      expect(fsMock.getMockData("/existing.txt")).toBe("new content");
    });
  });

  describe("File Existence Operations", () => {
    /* Preconditions: mock file system is empty
       Action: check existence of non-existent file
       Assertions: returns false
       Requirements: testing-infrastructure.2.1 */
    it("should return false for non-existent file", () => {
      expect(fsMock.exists("/non-existent.txt")).toBe(false);
      expect(fsMock.existsSync("/non-existent.txt")).toBe(false);
    });

    /* Preconditions: mock file exists at /existing.txt
       Action: check existence of existing file
       Assertions: returns true
       Requirements: testing-infrastructure.2.1 */
    it("should return true for existing file", () => {
      fsMock.setMockData("/existing.txt", "content");

      expect(fsMock.exists("/existing.txt")).toBe(true);
      expect(fsMock.existsSync("/existing.txt")).toBe(true);
    });

    /* Preconditions: mock file system is empty
       Action: set file existence to true without content
       Assertions: file exists but has empty content
       Requirements: testing-infrastructure.2.1 */
    it("should handle file existence without content", () => {
      fsMock.setFileExists("/empty-file.txt", true);

      expect(fsMock.exists("/empty-file.txt")).toBe(true);
      expect(fsMock.getMockData("/empty-file.txt")).toBe("");
    });

    /* Preconditions: mock file exists at /existing.txt
       Action: set file existence to false
       Assertions: file no longer exists
       Requirements: testing-infrastructure.2.1 */
    it("should handle setting file existence to false", () => {
      fsMock.setMockData("/existing.txt", "content");
      fsMock.setFileExists("/existing.txt", false);

      expect(fsMock.exists("/existing.txt")).toBe(false);
    });
  });

  describe("Directory Operations", () => {
    /* Preconditions: mock file system is empty
       Action: create directory with mkdirSync
       Assertions: directory exists in mock system
       Requirements: testing-infrastructure.2.1 */
    it("should create directory synchronously", () => {
      fsMock.mkdirSync("/test-dir", { recursive: true });

      expect(fsMock.exists("/test-dir")).toBe(true);
    });

    /* Preconditions: mock file system is empty
       Action: create directory with mkdir
       Assertions: directory exists in mock system
       Requirements: testing-infrastructure.2.1 */
    it("should create directory asynchronously", async () => {
      await fsMock.mkdir("/async-dir", { recursive: true });

      expect(fsMock.exists("/async-dir")).toBe(true);
    });
  });

  describe("File Removal Operations", () => {
    /* Preconditions: mock file system is empty
       Action: attempt to remove non-existent file with rmSync
       Assertions: throws ENOENT error
       Requirements: testing-infrastructure.2.1 */
    it("should throw error when removing non-existent file", () => {
      expect(() => fsMock.rmSync("/non-existent.txt")).toThrowError(
        expect.objectContaining({
          code: "ENOENT",
          path: "/non-existent.txt",
        }),
      );
    });

    /* Preconditions: mock file system is empty
       Action: attempt to remove non-existent file with rm
       Assertions: throws ENOENT error
       Requirements: testing-infrastructure.2.1 */
    it("should throw error when removing non-existent file asynchronously", async () => {
      await expect(fsMock.rm("/non-existent.txt")).rejects.toMatchObject({
        code: "ENOENT",
        path: "/non-existent.txt",
      });
    });

    /* Preconditions: mock file exists at /to-remove.txt
       Action: remove file with rmSync
       Assertions: file no longer exists
       Requirements: testing-infrastructure.2.1 */
    it("should remove existing file synchronously", () => {
      fsMock.setMockData("/to-remove.txt", "content");

      fsMock.rmSync("/to-remove.txt");

      expect(fsMock.exists("/to-remove.txt")).toBe(false);
    });

    /* Preconditions: mock file exists at /async-remove.txt
       Action: remove file with rm
       Assertions: file no longer exists
       Requirements: testing-infrastructure.2.1 */
    it("should remove existing file asynchronously", async () => {
      fsMock.setMockData("/async-remove.txt", "content");

      await fsMock.rm("/async-remove.txt");

      expect(fsMock.exists("/async-remove.txt")).toBe(false);
    });

    /* Preconditions: mock file system is empty
       Action: attempt to remove non-existent file with force option
       Assertions: no error thrown, operation succeeds
       Requirements: testing-infrastructure.2.1 */
    it("should not throw error when removing non-existent file with force option", () => {
      expect(() => fsMock.rmSync("/non-existent.txt", { force: true })).not.toThrow();
    });

    /* Preconditions: mock file system is empty
       Action: attempt to remove non-existent file asynchronously with force option
       Assertions: no error thrown, operation succeeds
       Requirements: testing-infrastructure.2.1 */
    it("should not throw error when removing non-existent file asynchronously with force option", async () => {
      await expect(fsMock.rm("/non-existent.txt", { force: true })).resolves.toBeUndefined();
    });
  });

  describe("File Access Operations", () => {
    /* Preconditions: mock file system is empty
       Action: check access to non-existent file
       Assertions: throws ENOENT error
       Requirements: testing-infrastructure.2.1 */
    it("should throw error when accessing non-existent file", async () => {
      await expect(fsMock.access("/non-existent.txt")).rejects.toMatchObject({
        code: "ENOENT",
        path: "/non-existent.txt",
      });
    });

    /* Preconditions: mock file exists at /accessible.txt
       Action: check access to existing file
       Assertions: resolves without error
       Requirements: testing-infrastructure.2.1 */
    it("should resolve when accessing existing file", async () => {
      fsMock.setMockData("/accessible.txt", "content");

      await expect(fsMock.access("/accessible.txt")).resolves.toBeUndefined();
    });
  });

  describe("Error Simulation", () => {
    /* Preconditions: mock file system is empty, error simulated for readFile operation
       Action: attempt to read file
       Assertions: throws simulated error
       Requirements: testing-infrastructure.2.1 */
    it("should simulate errors for specific operations", async () => {
      const simulatedError = new Error("Simulated disk error");
      fsMock.simulateError("readFile", "/error-file.txt", simulatedError);

      await expect(fsMock.readFile("/error-file.txt")).rejects.toThrow("Simulated disk error");
    });

    /* Preconditions: mock file system has simulated errors
       Action: clear all errors and attempt operation
       Assertions: operation succeeds without simulated error
       Requirements: testing-infrastructure.2.1 */
    it("should clear simulated errors", async () => {
      const simulatedError = new Error("Simulated error");
      fsMock.simulateError("writeFile", "/test.txt", simulatedError);
      fsMock.clearErrors();

      await expect(fsMock.writeFile("/test.txt", "content")).resolves.toBeUndefined();
    });

    /* Preconditions: mock file system has simulated errors for multiple operations
       Action: simulate different errors for different operations and paths
       Assertions: each operation throws its specific simulated error
       Requirements: testing-infrastructure.2.1 */
    it("should handle multiple simulated errors for different operations", async () => {
      const readError = new Error("Read error");
      const writeError = new Error("Write error");

      fsMock.simulateError("readFile", "/read-error.txt", readError);
      fsMock.simulateError("writeFile", "/write-error.txt", writeError);

      await expect(fsMock.readFile("/read-error.txt")).rejects.toThrow("Read error");
      await expect(fsMock.writeFile("/write-error.txt", "content")).rejects.toThrow("Write error");
    });
  });

  describe("Mock Reset Operations", () => {
    /* Preconditions: mock file system has files and simulated errors
       Action: reset the mock system
       Assertions: all files and errors are cleared
       Requirements: testing-infrastructure.2.1 */
    it("should reset all mock data and errors", async () => {
      // Set up some mock data and errors
      fsMock.setMockData("/test.txt", "content");
      fsMock.simulateError("readFile", "/error.txt", new Error("Test error"));

      // Reset the mock
      fsMock.reset();

      // Verify everything is cleared
      expect(fsMock.exists("/test.txt")).toBe(false);
      expect(fsMock.getMockData("/test.txt")).toBeUndefined();

      // Error should be cleared - this should not throw the simulated error
      await expect(fsMock.readFile("/error.txt")).rejects.toMatchObject({
        code: "ENOENT", // Should throw file not found, not the simulated error
      });
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    /* Preconditions: mock file system is empty
       Action: set mock data with empty string content
       Assertions: file exists and returns empty string
       Requirements: testing-infrastructure.2.1 */
    it("should handle empty file content", async () => {
      fsMock.setMockData("/empty.txt", "");

      expect(fsMock.exists("/empty.txt")).toBe(true);
      expect(await fsMock.readFile("/empty.txt")).toBe("");
    });

    /* Preconditions: mock file system is empty
       Action: set mock data with very long content
       Assertions: file exists and returns full content
       Requirements: testing-infrastructure.2.1 */
    it("should handle large file content", async () => {
      const largeContent = "x".repeat(10000);
      fsMock.setMockData("/large.txt", largeContent);

      expect(await fsMock.readFile("/large.txt")).toBe(largeContent);
    });

    /* Preconditions: mock file system is empty
       Action: perform operations with special characters in paths
       Assertions: operations work correctly with special paths
       Requirements: testing-infrastructure.2.1 */
    it("should handle special characters in file paths", async () => {
      const specialPath = "/special-chars-файл-测试.txt";
      const content = "Special content with unicode: 🚀 ñ ü";

      fsMock.setMockData(specialPath, content);

      expect(fsMock.exists(specialPath)).toBe(true);
      expect(await fsMock.readFile(specialPath)).toBe(content);
    });

    /* Preconditions: mock file system is empty
       Action: perform operations with null and undefined values where applicable
       Assertions: operations handle edge cases gracefully
       Requirements: testing-infrastructure.2.1 */
    it("should handle null and undefined values gracefully", () => {
      // Test with empty path (should be treated as a valid path)
      expect(fsMock.exists("")).toBe(false);

      // Test setting file exists with undefined content
      fsMock.setFileExists("/undefined-content.txt", true);
      expect(fsMock.getMockData("/undefined-content.txt")).toBe("");
    });
  });
});
