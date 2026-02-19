// Requirements: clerkly.1, clerkly.2, database-refactoring.1
// Tests for permission error handling in DatabaseManager

import * as path from 'path';

// Store original fs functions before mocking
const originalFs = jest.requireActual('fs');

// Track mock state
let shouldThrowEACCES = false;
let shouldThrowEPERM = false;
let mkdirCallCount = 0;

// Mock fs module
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn((p: string) => {
      // For permission test paths, return false to trigger mkdir
      if (p.includes('permission-test') || p.includes('eperm-test')) {
        return false;
      }
      return actual.existsSync(p);
    }),
    mkdirSync: jest.fn((p: string, options?: any) => {
      mkdirCallCount++;
      if (mkdirCallCount === 1 && shouldThrowEACCES) {
        const error: NodeJS.ErrnoException = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      }
      if (mkdirCallCount === 1 && shouldThrowEPERM) {
        const error: NodeJS.ErrnoException = new Error('Operation not permitted');
        error.code = 'EPERM';
        throw error;
      }
      return actual.mkdirSync(p, options);
    }),
  };
});

// Mock electron BrowserWindow for error notifications
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Import after mocking
import * as fs from 'fs';
import { DatabaseManager } from '../../src/main/DatabaseManager';

describe('DatabaseManager Permission Error Handling', () => {
  let dbManager: DatabaseManager | null = null;
  let fallbackPath: string | undefined;

  beforeEach(() => {
    // Reset mock state
    shouldThrowEACCES = false;
    shouldThrowEPERM = false;
    mkdirCallCount = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up DatabaseManager
    if (dbManager) {
      try {
        dbManager.close();
      } catch {
        // Ignore close errors
      }
      dbManager = null;
    }

    // Clean up fallback directory
    if (fallbackPath && originalFs.existsSync(fallbackPath)) {
      try {
        const files = originalFs.readdirSync(fallbackPath);
        files.forEach((file: string) => {
          const filePath = path.join(fallbackPath!, file);
          if (originalFs.statSync(filePath).isFile()) {
            originalFs.unlinkSync(filePath);
          }
        });
        originalFs.rmdirSync(fallbackPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    fallbackPath = undefined;
  });

  /* Preconditions: Storage directory creation fails with EACCES error
     Action: create DatabaseManager and call initialize() with path that triggers permission error
     Assertions: returns success true with warning about temp directory, path points to fallback
     Requirements: clerkly.1, clerkly.2, database-refactoring.1.1 */
  it('should fallback to temp directory on EACCES permission error', () => {
    shouldThrowEACCES = true;

    dbManager = new DatabaseManager();
    const result = dbManager.initialize('/permission-test/eacces-path');
    fallbackPath = result.path;

    expect(result.success).toBe(true);
    expect(result.warning).toBe('Using temporary directory');
    expect(result.path).toContain('clerkly-fallback');
  });

  /* Preconditions: Storage directory creation fails with EPERM error
     Action: create DatabaseManager and call initialize() with path that triggers permission error
     Assertions: returns success true with warning about temp directory
     Requirements: clerkly.1, clerkly.2, database-refactoring.1.1 */
  it('should fallback to temp directory on EPERM permission error', () => {
    shouldThrowEPERM = true;

    dbManager = new DatabaseManager();
    const result = dbManager.initialize('/eperm-test/path');
    fallbackPath = result.path;

    expect(result.success).toBe(true);
    expect(result.warning).toBe('Using temporary directory');
    expect(result.path).toContain('clerkly-fallback');
  });
});

describe('DatabaseManager Non-Permission Error Handling', () => {
  let dbManager: DatabaseManager | null = null;

  beforeEach(() => {
    // Reset mock state
    shouldThrowEACCES = false;
    shouldThrowEPERM = false;
    mkdirCallCount = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (dbManager) {
      try {
        dbManager.close();
      } catch {
        // Ignore close errors
      }
      dbManager = null;
    }
  });

  /* Preconditions: Storage directory creation fails with non-permission error (e.g., ENOENT)
     Action: create DatabaseManager and call initialize() with path that triggers non-permission error
     Assertions: throws error with message about failed initialization
     Requirements: clerkly.1, clerkly.2, database-refactoring.1.1 */
  it('should throw error on non-permission directory creation error', () => {
    // Override the mock to throw a different error
    const mockMkdirSync = fs.mkdirSync as jest.Mock;
    mockMkdirSync.mockImplementationOnce(() => {
      const error: NodeJS.ErrnoException = new Error('No such file or directory');
      error.code = 'ENOENT';
      throw error;
    });

    dbManager = new DatabaseManager();

    expect(() => dbManager!.initialize('/non-permission-error-test/path')).toThrow(
      'Failed to initialize storage'
    );
  });
});
