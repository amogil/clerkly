// Requirements: clerkly.1, clerkly.2
// Tests for permission error handling in DataManager

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
import { DataManager } from '../../src/main/DataManager';

describe('DataManager Permission Error Handling', () => {
  let dataManager: DataManager | null = null;
  let fallbackPath: string | undefined;

  beforeEach(() => {
    // Reset mock state
    shouldThrowEACCES = false;
    shouldThrowEPERM = false;
    mkdirCallCount = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up DataManager
    if (dataManager) {
      try {
        dataManager.close();
      } catch {
        // Ignore close errors
      }
      dataManager = null;
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
     Action: create DataManager with path that triggers permission error, call initialize()
     Assertions: returns success true with warning about temp directory, path points to fallback
     Requirements: clerkly.1, clerkly.2 */
  it('should fallback to temp directory on EACCES permission error', () => {
    shouldThrowEACCES = true;

    const dm = new DataManager('/permission-test/eacces-path');
    const result = dm.initialize();
    dataManager = dm;
    fallbackPath = result.path;

    expect(result.success).toBe(true);
    expect(result.warning).toBe('Using temporary directory');
    expect(result.path).toContain('clerkly-fallback');
  });

  /* Preconditions: Storage directory creation fails with EPERM error
     Action: create DataManager with path that triggers permission error, call initialize()
     Assertions: returns success true with warning about temp directory
     Requirements: clerkly.1, clerkly.2 */
  it('should fallback to temp directory on EPERM permission error', () => {
    shouldThrowEPERM = true;

    const dm = new DataManager('/eperm-test/path');
    const result = dm.initialize();
    dataManager = dm;
    fallbackPath = result.path;

    expect(result.success).toBe(true);
    expect(result.warning).toBe('Using temporary directory');
    expect(result.path).toContain('clerkly-fallback');
  });
});

describe('DataManager Non-Permission Error Handling', () => {
  let dataManager: DataManager | null = null;

  beforeEach(() => {
    // Reset mock state
    shouldThrowEACCES = false;
    shouldThrowEPERM = false;
    mkdirCallCount = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (dataManager) {
      try {
        dataManager.close();
      } catch {
        // Ignore close errors
      }
      dataManager = null;
    }
  });

  /* Preconditions: Storage directory creation fails with non-permission error (e.g., ENOENT)
     Action: create DataManager with path that triggers non-permission error, call initialize()
     Assertions: throws error with message about failed initialization
     Requirements: clerkly.1, clerkly.2 */
  it('should throw error on non-permission directory creation error', () => {
    // Override the mock to throw a different error
    const mockMkdirSync = fs.mkdirSync as jest.Mock;
    mockMkdirSync.mockImplementationOnce(() => {
      const error: NodeJS.ErrnoException = new Error('No such file or directory');
      error.code = 'ENOENT';
      throw error;
    });

    const dm = new DataManager('/non-permission-error-test/path');

    expect(() => dm.initialize()).toThrow('Failed to initialize storage');
  });
});
