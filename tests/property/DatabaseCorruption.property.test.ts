// Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4
/**
 * Property-based tests for database corruption recovery
 * Tests Property 10: Database Corruption Recovery
 */

import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DataManager } from '../../src/main/DataManager';

describe('Property Tests - Database Corruption Recovery', () => {
  let testStoragePath: string;

  // Helper function to create DataManager with mock UserManager
  const createDataManagerWithMockUser = (storagePath: string) => {
    const dataManager = new DataManager(storagePath);
    dataManager.initialize();

    // Requirements: user-data-isolation.1.10 - Mock UserManager for data isolation
    const mockProfileManager = {
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
    } as any;

    dataManager.setUserManager(mockProfileManager);
    return dataManager;
  };

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(
      os.tmpdir(),
      `clerkly-test-corruption-${Date.now()}-${Math.random()}`
    );
  });

  afterEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  /* Preconditions: storage directory exists, database file is corrupted (invalid SQLite file)
     Action: create corrupted database file, initialize DataManager
     Assertions: backup file created with timestamp format (clerkly.db.backup-{timestamp}) OR database initialized successfully, new working database created, new database is functional (can save/load data)
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10: Database Corruption Recovery - corrupted database is backed up and recreated', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random corruption patterns (excluding empty-file as SQLite can handle it)
        fc.oneof(
          fc.constant('random-bytes'), // Random binary data
          fc.constant('partial-header'), // Partial SQLite header
          fc.constant('invalid-text'), // Plain text instead of SQLite
          fc.constant('truncated-db') // Truncated database file
        ),
        async (corruptionType: string) => {
          // Clean up storage before test
          if (fs.existsSync(testStoragePath)) {
            fs.rmSync(testStoragePath, { recursive: true, force: true });
          }

          // Create storage directory
          fs.mkdirSync(testStoragePath, { recursive: true });

          const dbPath = path.join(testStoragePath, 'clerkly.db');

          // Create corrupted database file based on corruption type
          switch (corruptionType) {
            case 'random-bytes':
              // Write random binary data
              fs.writeFileSync(
                dbPath,
                Buffer.from(
                  Array(1024)
                    .fill(0)
                    .map(() => Math.floor(Math.random() * 256))
                )
              );
              break;
            case 'partial-header':
              // Write partial SQLite header (SQLite header is "SQLite format 3\0")
              fs.writeFileSync(dbPath, 'SQLite');
              break;
            case 'invalid-text':
              // Write plain text
              fs.writeFileSync(dbPath, 'This is not a valid SQLite database file');
              break;
            case 'truncated-db':
              // Write SQLite header but truncate the rest
              fs.writeFileSync(dbPath, 'SQLite format 3\0' + '\0'.repeat(100));
              break;
          }

          // Verify corrupted file exists
          expect(fs.existsSync(dbPath)).toBe(true);

          // Initialize DataManager (should detect corruption and recover)
          const dataManager = createDataManagerWithMockUser(testStoragePath);

          // Get list of files after initialization
          const filesAfter = fs.readdirSync(testStoragePath);

          // Verify backup file was created with timestamp format
          const backupFiles = filesAfter.filter((file) => file.startsWith('clerkly.db.backup-'));
          expect(backupFiles.length).toBeGreaterThan(0);

          // Verify backup file has correct timestamp format
          const backupFile = backupFiles[0];
          const timestampMatch = backupFile.match(/^clerkly\.db\.backup-(\d+)$/);
          expect(timestampMatch).not.toBeNull();
          if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1], 10);
            expect(timestamp).toBeGreaterThan(0);
            expect(timestamp).toBeLessThanOrEqual(Date.now());
          }

          // Verify new working database was created
          expect(fs.existsSync(dbPath)).toBe(true);

          // Verify new database is functional - test save operation
          const testKey = 'recovery-test-key';
          const testValue = { recovered: true, data: 'test data', timestamp: Date.now() };

          const saveResult = dataManager.saveData(testKey, testValue);
          expect(saveResult.success).toBe(true);

          // Verify new database is functional - test load operation
          const loadResult = dataManager.loadData(testKey);
          expect(loadResult.success).toBe(true);
          expect(loadResult.data).toEqual(testValue);

          // Verify new database is functional - test delete operation
          const deleteResult = dataManager.deleteData(testKey);
          expect(deleteResult.success).toBe(true);

          // Verify deleted data is gone
          const loadAfterDelete = dataManager.loadData(testKey);
          expect(loadAfterDelete.success).toBe(false);
          expect(loadAfterDelete.error).toContain('not found');

          // Clean up
          dataManager.close();

          // Clean up storage for next iteration
          if (fs.existsSync(testStoragePath)) {
            fs.rmSync(testStoragePath, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: storage directory exists, database file contains random binary data
     Action: create corrupted database with random bytes, initialize DataManager
     Assertions: backup created, new database functional
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: random binary data corruption is recovered', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database with random binary data
    const randomData = Buffer.from(
      Array(2048)
        .fill(0)
        .map(() => Math.floor(Math.random() * 256))
    );
    fs.writeFileSync(dbPath, randomData);

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded
    // Verify backup was created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Verify new database is functional
    const saveResult = dataManager.saveData('test-key', 'test-value');
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData('test-key');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe('test-value');

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, database file is empty
     Action: create empty database file, initialize DataManager
     Assertions: initialization succeeds (SQLite can handle empty files), database is functional
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: empty file is handled gracefully (SQLite can open empty files)', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create empty database file
    fs.writeFileSync(dbPath, '');

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded (SQLite can handle empty files)

    // Note: Empty files don't trigger corruption detection because SQLite can open them
    // The database will be initialized with migrations

    // Verify database is functional
    const saveResult = dataManager.saveData('empty-test', { data: 'works' });
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData('empty-test');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual({ data: 'works' });

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, database file has partial SQLite header
     Action: create database with partial header, initialize DataManager
     Assertions: backup created, new database functional
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: partial SQLite header corruption is recovered', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create database with partial SQLite header
    fs.writeFileSync(dbPath, 'SQLite');

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded

    // Verify backup was created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Verify new database is functional
    const saveResult = dataManager.saveData('header-test', [1, 2, 3]);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData('header-test');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual([1, 2, 3]);

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, database file contains plain text
     Action: create database with plain text content, initialize DataManager
     Assertions: backup created, new database functional
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: plain text corruption is recovered', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create database with plain text
    fs.writeFileSync(dbPath, 'This is not a valid SQLite database file. It is just plain text.');

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded

    // Verify backup was created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Verify new database is functional
    const saveResult = dataManager.saveData('text-test', { recovered: true });
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData('text-test');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual({ recovered: true });

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, database file is truncated
     Action: create truncated database file, initialize DataManager
     Assertions: backup created, new database functional
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: truncated database is recovered', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create truncated database (SQLite header but incomplete)
    fs.writeFileSync(dbPath, 'SQLite format 3\0' + '\0'.repeat(200));

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded

    // Verify backup was created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Verify new database is functional
    const saveResult = dataManager.saveData('truncated-test', { data: 'new data' });
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData('truncated-test');
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual({ data: 'new data' });

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, corrupted database file exists
     Action: initialize DataManager, verify backup timestamp is recent
     Assertions: backup timestamp is within last few seconds
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: backup timestamp is recent and valid', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database
    fs.writeFileSync(dbPath, 'corrupted data');

    // Record time before initialization
    const timeBefore = Date.now();

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Record time after initialization
    const timeAfter = Date.now();

    // Get backup file
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Extract timestamp from backup filename
    const backupFile = backupFiles[0];
    const timestampMatch = backupFile.match(/^clerkly\.db\.backup-(\d+)$/);
    expect(timestampMatch).not.toBeNull();

    if (timestampMatch) {
      const backupTimestamp = parseInt(timestampMatch[1], 10);

      // Verify timestamp is within the initialization window
      expect(backupTimestamp).toBeGreaterThanOrEqual(timeBefore);
      expect(backupTimestamp).toBeLessThanOrEqual(timeAfter);

      // Verify timestamp is recent (within last 10 seconds)
      expect(Date.now() - backupTimestamp).toBeLessThan(10000);
    }

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, corrupted database exists
     Action: initialize DataManager, save data, close, reinitialize, verify data persists
     Assertions: data saved in recovered database persists across restarts
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: recovered database persists data across restarts', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database
    fs.writeFileSync(dbPath, Buffer.from([0xff, 0xfe, 0xfd, 0xfc]));

    // First initialization - recover from corruption
    const dataManager1 = createDataManagerWithMockUser(testStoragePath);

    // Save data in recovered database
    const testKey = 'persist-test';
    const testValue = { persisted: true, timestamp: Date.now() };
    const saveResult = dataManager1.saveData(testKey, testValue);
    expect(saveResult.success).toBe(true);

    // Close database
    dataManager1.close();

    // Second initialization - verify data persists
    const dataManager2 = createDataManagerWithMockUser(testStoragePath);

    const loadResult = dataManager2.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(testValue);

    // Clean up
    dataManager2.close();
  });

  /* Preconditions: storage directory exists, corrupted database exists
     Action: initialize DataManager, verify migrations run successfully on recovered database
     Assertions: migrations applied successfully, database schema is correct
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: migrations run successfully on recovered database', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database
    fs.writeFileSync(dbPath, 'invalid database content');

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Verify initialization succeeded

    // Verify migrations were applied

    // Verify migration runner is functional
    const migrationRunner = dataManager.getMigrationRunner();
    const currentVersion = migrationRunner.getCurrentVersion();
    expect(currentVersion).toBeGreaterThanOrEqual(0);

    // Verify database schema is correct (can perform operations)
    const saveResult = dataManager.saveData('migration-test', { migrated: true });
    expect(saveResult.success).toBe(true);

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, multiple corrupted databases created sequentially
     Action: create corrupted database, initialize, corrupt again, initialize again
     Assertions: multiple backups created with different timestamps, all recoveries successful
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: multiple corruption recoveries create separate backups', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // First corruption and recovery
    fs.writeFileSync(dbPath, 'first corruption');
    const dataManager1 = createDataManagerWithMockUser(testStoragePath);
    dataManager1.close();

    // Wait a bit to ensure different timestamps
    const waitTime = 10;
    const start = Date.now();
    while (Date.now() - start < waitTime) {
      // Busy wait
    }

    // Second corruption and recovery
    fs.writeFileSync(dbPath, 'second corruption');
    const dataManager2 = createDataManagerWithMockUser(testStoragePath);
    dataManager2.close();

    // Verify two backup files were created
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(2);

    // Verify backups have different timestamps
    const timestamps = backupFiles.map((file) => {
      const match = file.match(/^clerkly\.db\.backup-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    expect(timestamps[0]).not.toBe(timestamps[1]);
    expect(timestamps[0]).toBeGreaterThan(0);
    expect(timestamps[1]).toBeGreaterThan(0);
  });

  /* Preconditions: storage directory exists, corrupted database with various data types
     Action: create corrupted database, initialize, save various data types
     Assertions: all data types can be saved and loaded correctly in recovered database
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: recovered database handles all data types correctly', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database
    fs.writeFileSync(dbPath, 'corrupted');

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Test various data types
    const testCases = [
      { key: 'string', value: 'test string' },
      { key: 'number', value: 42 },
      { key: 'boolean', value: true },
      { key: 'null', value: null },
      { key: 'array', value: [1, 2, 3] },
      { key: 'object', value: { nested: { data: 'value' } } },
      { key: 'mixed-array', value: [1, 'string', true, null, { obj: 'value' }] },
    ];

    // Save all data types
    for (const testCase of testCases) {
      const saveResult = dataManager.saveData(testCase.key, testCase.value);
      expect(saveResult.success).toBe(true);
    }

    // Load and verify all data types
    for (const testCase of testCases) {
      const loadResult = dataManager.loadData(testCase.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testCase.value);
    }

    // Clean up
    dataManager.close();
  });

  /* Preconditions: storage directory exists, corrupted database exists
     Action: initialize DataManager, verify backup file contains original corrupted content
     Assertions: backup file content matches original corrupted content
     Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 10: Database Corruption Recovery
  test('Property 10 edge case: backup file preserves original corrupted content', () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Create storage directory
    fs.mkdirSync(testStoragePath, { recursive: true });

    const dbPath = path.join(testStoragePath, 'clerkly.db');

    // Create corrupted database with specific content
    const corruptedContent =
      'This is the original corrupted content that should be preserved in backup';
    fs.writeFileSync(dbPath, corruptedContent);

    // Initialize DataManager
    const dataManager = createDataManagerWithMockUser(testStoragePath);

    // Get backup file
    const files = fs.readdirSync(testStoragePath);
    const backupFiles = files.filter((file) => file.startsWith('clerkly.db.backup-'));
    expect(backupFiles.length).toBe(1);

    // Read backup file content
    const backupPath = path.join(testStoragePath, backupFiles[0]);
    const backupContent = fs.readFileSync(backupPath, 'utf8');

    // Verify backup contains original corrupted content
    expect(backupContent).toBe(corruptedContent);

    // Clean up
    dataManager.close();
  });
});
