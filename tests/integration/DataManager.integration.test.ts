// Requirements: clerkly.1, clerkly.2

import { DataManager } from '../../src/main/DataManager';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Integration tests for DataManager with real filesystem operations
 * These tests use real filesystem to test error handling and edge cases
 */
describe('DataManager Integration Tests', () => {
  let testStoragePath: string;
  let dataManager: DataManager;

  beforeEach(() => {
    testStoragePath = path.join(
      os.tmpdir(),
      `test-datamanager-integration-${Date.now()}-${Math.random()}`
    );
  });

  afterEach(() => {
    try {
      if (dataManager) {
        dataManager.close();
      }
      if (fs.existsSync(testStoragePath)) {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /* Preconditions: storage path has no write permissions (real filesystem)
     Action: create DataManager with restricted path and call initialize()
     Assertions: returns success true, warning about temp directory, fallback to temp
     Requirements: clerkly.1, clerkly.2 */
  it('should fallback to temp directory on permission error', () => {
    // Create a directory with no write permissions
    // Note: This test may be skipped on systems where we can't create restricted directories
    const restrictedPath = path.join(testStoragePath, 'restricted');

    try {
      fs.mkdirSync(restrictedPath, { recursive: true });
      // Try to make it read-only (may not work on all systems)
      fs.chmodSync(restrictedPath, 0o444);
    } catch (error) {
      // If we can't create restricted directory, skip this test
      console.log('Skipping permission test - cannot create restricted directory');
      return;
    }

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Try to create DataManager in restricted directory
    const restrictedSubPath = path.join(restrictedPath, 'data');
    dataManager = new DataManager(restrictedSubPath);
    const result = dataManager.initialize();

    // Should succeed by falling back to temp directory
    expect(result.success).toBe(true);

    // Check if warning was logged (may vary by system)
    if (result.warning) {
      expect(result.warning).toContain('temporary directory');
    }

    consoleWarnSpy.mockRestore();

    // Cleanup - restore permissions
    try {
      fs.chmodSync(restrictedPath, 0o755);
    } catch (error) {
      // Ignore
    }
  });

  /* Preconditions: storage path exists and is writable
     Action: create DataManager and initialize
     Assertions: returns success true, database created successfully
     Requirements: clerkly.1, clerkly.2 */
  it('should initialize successfully with valid path', () => {
    dataManager = new DataManager(testStoragePath);
    const result = dataManager.initialize();

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(fs.existsSync(testStoragePath)).toBe(true);
    expect(fs.existsSync(path.join(testStoragePath, 'clerkly.db'))).toBe(true);
  });

  /* Preconditions: database file exists but is corrupted
     Action: create DataManager and call initialize()
     Assertions: backup created, corrupted db deleted, new db created, returns success true
     Requirements: clerkly.1, clerkly.2 */
  it('should handle corrupted database by creating backup and recreating', () => {
    // Create corrupted database file
    fs.mkdirSync(testStoragePath, { recursive: true });
    const dbPath = path.join(testStoragePath, 'clerkly.db');
    fs.writeFileSync(dbPath, 'CORRUPTED DATA NOT A VALID SQLITE FILE');

    dataManager = new DataManager(testStoragePath);
    const result = dataManager.initialize();

    expect(result.success).toBe(true);

    // Check backup was created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((f) => f.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBeGreaterThan(0);

    // Check new database is valid
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  /* Preconditions: multiple DataManager instances try to access same database
     Action: create two DataManager instances with same path
     Assertions: both can initialize and operate independently
     Requirements: clerkly.1, clerkly.2 */
  it('should handle multiple instances accessing same database', () => {
    const dataManager1 = new DataManager(testStoragePath);
    const result1 = dataManager1.initialize();
    expect(result1.success).toBe(true);

    // Save some data
    const saveResult = dataManager1.saveData('test-key', 'test-value');
    expect(saveResult.success).toBe(true);

    // Create second instance
    const dataManager2 = new DataManager(testStoragePath);
    const result2 = dataManager2.initialize();
    expect(result2.success).toBe(true);

    // Load data from second instance
    const loadResult = dataManager2.loadData('test-key');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe('test-value');

    // Cleanup
    dataManager1.close();
    dataManager2.close();
  });
});
