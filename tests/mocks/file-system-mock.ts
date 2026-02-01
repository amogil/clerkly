// Requirements: testing-infrastructure.2.1
import { vi, type MockedFunction } from "vitest";

/**
 * Interface for file system mock operations
 * Requirements: testing-infrastructure.2.1
 */
export interface FileSystemMock {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
  readFileSync(path: string): string;
  writeFileSync(path: string, content: string): void;
  existsSync(path: string): boolean;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  access(path: string): Promise<void>;
  reset(): void;
  setMockData(path: string, content: string): void;
  getMockData(path: string): string | undefined;
  setFileExists(path: string, exists: boolean): void;
  simulateError(operation: string, path: string, error: Error): void;
  clearErrors(): void;
}

/**
 * Mock data storage for file system operations
 * Requirements: testing-infrastructure.2.1
 */
interface MockFileData {
  content: string;
  exists: boolean;
}

/**
 * Error simulation configuration
 * Requirements: testing-infrastructure.2.1
 */
interface MockError {
  operation: string;
  path: string;
  error: Error;
}

/**
 * Implementation of FileSystemMock for unit test isolation
 * Requirements: testing-infrastructure.2.1
 */
export class FileSystemMockImpl implements FileSystemMock {
  private mockFiles: Map<string, MockFileData> = new Map();
  private mockErrors: MockError[] = [];

  // Mock functions for fs operations
  public readFile: MockedFunction<(path: string) => Promise<string>>;
  public writeFile: MockedFunction<(path: string, content: string) => Promise<void>>;
  public readFileSync: MockedFunction<(path: string) => string>;
  public writeFileSync: MockedFunction<(path: string, content: string) => void>;
  public existsSync: MockedFunction<(path: string) => boolean>;
  public mkdirSync: MockedFunction<(path: string, options?: { recursive?: boolean }) => void>;
  public rmSync: MockedFunction<
    (path: string, options?: { recursive?: boolean; force?: boolean }) => void
  >;
  public mkdir: MockedFunction<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
  public rm: MockedFunction<
    (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>
  >;
  public access: MockedFunction<(path: string) => Promise<void>>;

  constructor() {
    // Initialize mock functions with default implementations
    this.readFile = vi.fn(this.mockReadFile.bind(this));
    this.writeFile = vi.fn(this.mockWriteFile.bind(this));
    this.readFileSync = vi.fn(this.mockReadFileSync.bind(this));
    this.writeFileSync = vi.fn(this.mockWriteFileSync.bind(this));
    this.existsSync = vi.fn(this.mockExistsSync.bind(this));
    this.mkdirSync = vi.fn(this.mockMkdirSync.bind(this));
    this.rmSync = vi.fn(this.mockRmSync.bind(this));
    this.mkdir = vi.fn(this.mockMkdir.bind(this));
    this.rm = vi.fn(this.mockRm.bind(this));
    this.access = vi.fn(this.mockAccess.bind(this));
  }

  /**
   * Check if file exists in mock storage
   * Requirements: testing-infrastructure.2.1
   */
  exists(path: string): boolean {
    return this.existsSync(path);
  }

  /**
   * Set mock file data
   * Requirements: testing-infrastructure.2.1
   */
  setMockData(path: string, content: string): void {
    this.mockFiles.set(path, { content, exists: true });
  }

  /**
   * Get mock file data
   * Requirements: testing-infrastructure.2.1
   */
  getMockData(path: string): string | undefined {
    const fileData = this.mockFiles.get(path);
    return fileData?.exists ? fileData.content : undefined;
  }

  /**
   * Set file existence status
   * Requirements: testing-infrastructure.2.1
   */
  setFileExists(path: string, exists: boolean): void {
    const existing = this.mockFiles.get(path);
    if (existing) {
      existing.exists = exists;
    } else {
      this.mockFiles.set(path, { content: "", exists });
    }
  }

  /**
   * Simulate error for specific operation and path
   * Requirements: testing-infrastructure.2.1
   */
  simulateError(operation: string, path: string, error: Error): void {
    this.mockErrors.push({ operation, path, error });
  }

  /**
   * Clear all simulated errors
   * Requirements: testing-infrastructure.2.1
   */
  clearErrors(): void {
    this.mockErrors = [];
  }

  /**
   * Reset all mock data and errors
   * Requirements: testing-infrastructure.2.1
   */
  reset(): void {
    this.mockFiles.clear();
    this.mockErrors = [];
    vi.clearAllMocks();
  }

  /**
   * Check for simulated errors
   * Requirements: testing-infrastructure.2.1
   */
  private checkForError(operation: string, path: string): void {
    const error = this.mockErrors.find((e) => e.operation === operation && e.path === path);
    if (error) {
      throw error.error;
    }
  }

  /**
   * Mock implementation of fs.promises.readFile
   * Requirements: testing-infrastructure.2.1
   */
  private async mockReadFile(path: string): Promise<string> {
    this.checkForError("readFile", path);

    const fileData = this.mockFiles.get(path);
    if (!fileData || !fileData.exists) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as any).code = "ENOENT";
      (error as any).errno = -2;
      (error as any).path = path;
      throw error;
    }

    return fileData.content;
  }

  /**
   * Mock implementation of fs.promises.writeFile
   * Requirements: testing-infrastructure.2.1
   */
  private async mockWriteFile(path: string, content: string): Promise<void> {
    this.checkForError("writeFile", path);
    this.mockFiles.set(path, { content, exists: true });
  }

  /**
   * Mock implementation of fs.readFileSync
   * Requirements: testing-infrastructure.2.1
   */
  private mockReadFileSync(path: string): string {
    this.checkForError("readFileSync", path);

    const fileData = this.mockFiles.get(path);
    if (!fileData || !fileData.exists) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as any).code = "ENOENT";
      (error as any).errno = -2;
      (error as any).path = path;
      throw error;
    }

    return fileData.content;
  }

  /**
   * Mock implementation of fs.writeFileSync
   * Requirements: testing-infrastructure.2.1
   */
  private mockWriteFileSync(path: string, content: string): void {
    this.checkForError("writeFileSync", path);
    this.mockFiles.set(path, { content, exists: true });
  }

  /**
   * Mock implementation of fs.existsSync
   * Requirements: testing-infrastructure.2.1
   */
  private mockExistsSync(path: string): boolean {
    this.checkForError("existsSync", path);
    const fileData = this.mockFiles.get(path);
    return fileData?.exists ?? false;
  }

  /**
   * Mock implementation of fs.mkdirSync
   * Requirements: testing-infrastructure.2.1
   */
  private mockMkdirSync(path: string, options?: { recursive?: boolean }): void {
    this.checkForError("mkdirSync", path);
    // For directories, we just mark them as existing
    this.mockFiles.set(path, { content: "", exists: true });
  }

  /**
   * Mock implementation of fs.rmSync
   * Requirements: testing-infrastructure.2.1
   */
  private mockRmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    this.checkForError("rmSync", path);

    if (!options?.force) {
      const fileData = this.mockFiles.get(path);
      if (!fileData || !fileData.exists) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        (error as any).code = "ENOENT";
        (error as any).errno = -2;
        (error as any).path = path;
        throw error;
      }
    }

    this.mockFiles.delete(path);
  }

  /**
   * Mock implementation of fs.promises.mkdir
   * Requirements: testing-infrastructure.2.1
   */
  private async mockMkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.checkForError("mkdir", path);
    // For directories, we just mark them as existing
    this.mockFiles.set(path, { content: "", exists: true });
  }

  /**
   * Mock implementation of fs.promises.rm
   * Requirements: testing-infrastructure.2.1
   */
  private async mockRm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void> {
    this.checkForError("rm", path);

    if (!options?.force) {
      const fileData = this.mockFiles.get(path);
      if (!fileData || !fileData.exists) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        (error as any).code = "ENOENT";
        (error as any).errno = -2;
        (error as any).path = path;
        throw error;
      }
    }

    this.mockFiles.delete(path);
  }

  /**
   * Mock implementation of fs.promises.access
   * Requirements: testing-infrastructure.2.1
   */
  private async mockAccess(path: string): Promise<void> {
    this.checkForError("access", path);

    const fileData = this.mockFiles.get(path);
    if (!fileData || !fileData.exists) {
      const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
      (error as any).code = "ENOENT";
      (error as any).errno = -2;
      (error as any).path = path;
      throw error;
    }
  }
}

/**
 * Global file system mock instance
 * Requirements: testing-infrastructure.2.1
 */
export const fileSystemMock = new FileSystemMockImpl();
