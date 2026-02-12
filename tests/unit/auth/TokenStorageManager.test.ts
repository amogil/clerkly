// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.4.5

import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { DataManager } from '../../../src/main/DataManager';
import { TokenData } from '../../../src/main/auth/OAuthConfig';
import type { UserProfileManager } from '../../../src/main/auth/UserProfileManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TokenStorageManager', () => {
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let testDbPath: string;
  let mockProfileManager: jest.Mocked<UserProfileManager>;

  beforeEach(() => {
    // Create a temporary directory for test database
    testDbPath = path.join(os.tmpdir(), `test-token-storage-${Date.now()}`);

    // Ensure migrations directory exists for tests
    const migrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    // Requirements: user-data-isolation.1.10 - Mock UserProfileManager for data isolation
    mockProfileManager = {
      getCurrentEmail: jest.fn().mockReturnValue('test@example.com'),
    } as unknown as jest.Mocked<UserProfileManager>;

    dataManager = new DataManager(testDbPath);
    dataManager.initialize();
    dataManager.setUserProfileManager(mockProfileManager);
    tokenStorage = new TokenStorageManager(dataManager);
  });

  afterEach(() => {
    // Clean up
    dataManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /* Preconditions: DataManager initialized, valid token data provided
     Action: Call saveTokens with token data
     Assertions: Tokens are saved successfully, no errors thrown
     Requirements: google-oauth-auth.4.1 */
  it('should save tokens to database', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000, // 1 hour from now
      tokenType: 'Bearer',
    };

    await expect(tokenStorage.saveTokens(tokens)).resolves.not.toThrow();
  });

  /* Preconditions: Tokens saved in database
     Action: Call loadTokens
     Assertions: Returns saved tokens with all fields intact
     Requirements: google-oauth-auth.4.3 */
  it('should load tokens from database', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    const loaded = await tokenStorage.loadTokens();

    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe(tokens.accessToken);
    expect(loaded?.refreshToken).toBe(tokens.refreshToken);
    expect(loaded?.expiresAt).toBe(tokens.expiresAt);
    expect(loaded?.tokenType).toBe(tokens.tokenType);
  });

  /* Preconditions: Tokens saved in database
     Action: Call deleteTokens
     Assertions: All tokens are removed, loadTokens returns null
     Requirements: google-oauth-auth.4.4 */
  it('should delete tokens from database', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    await tokenStorage.deleteTokens();
    const loaded = await tokenStorage.loadTokens();

    expect(loaded).toBeNull();
  });

  /* Preconditions: Valid non-expired tokens saved in database
     Action: Call hasValidTokens
     Assertions: Returns true
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3 */
  it('should return true for valid non-expired tokens', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000, // 1 hour from now
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    const hasValid = await tokenStorage.hasValidTokens();

    expect(hasValid).toBe(true);
  });

  /* Preconditions: Expired tokens saved in database
     Action: Call hasValidTokens
     Assertions: Returns false
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3 */
  it('should return false for expired tokens', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    const hasValid = await tokenStorage.hasValidTokens();

    expect(hasValid).toBe(false);
  });

  /* Preconditions: No tokens in database
     Action: Call loadTokens
     Assertions: Returns null
     Requirements: google-oauth-auth.4.3 */
  it('should return null when no tokens exist', async () => {
    const loaded = await tokenStorage.loadTokens();
    expect(loaded).toBeNull();
  });

  /* Preconditions: No tokens in database
     Action: Call hasValidTokens
     Assertions: Returns false
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2 */
  it('should return false when no tokens exist', async () => {
    const hasValid = await tokenStorage.hasValidTokens();
    expect(hasValid).toBe(false);
  });

  /* Preconditions: DataManager closed (simulating database error)
     Action: Call saveTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.5 */
  it('should handle database errors when saving', async () => {
    dataManager.close();

    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    await expect(tokenStorage.saveTokens(tokens)).rejects.toThrow('Failed to save tokens');
  });

  /* Preconditions: DataManager closed (simulating database error)
     Action: Call loadTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.5 */
  it('should handle database errors when loading', async () => {
    dataManager.close();

    await expect(tokenStorage.loadTokens()).rejects.toThrow('Failed to load tokens');
  });

  /* Preconditions: Tokens saved, then updated with new values
     Action: Save tokens twice with different values
     Assertions: Second save overwrites first, loadTokens returns latest values
     Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3 */
  it('should update existing tokens when saving again', async () => {
    const tokens1: TokenData = {
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: Date.now() + 1800000,
      tokenType: 'Bearer',
    };

    const tokens2: TokenData = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 7200000,
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens1);
    await tokenStorage.saveTokens(tokens2);
    const loaded = await tokenStorage.loadTokens();

    expect(loaded?.accessToken).toBe(tokens2.accessToken);
    expect(loaded?.refreshToken).toBe(tokens2.refreshToken);
    expect(loaded?.expiresAt).toBe(tokens2.expiresAt);
  });

  /* Preconditions: Tokens with special characters in values
     Action: Save and load tokens with special characters
     Assertions: Special characters are preserved correctly
     Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3 */
  it('should handle tokens with special characters', async () => {
    const tokens: TokenData = {
      accessToken: 'token-with-special-chars-!@#$%^&*()',
      refreshToken: 'refresh-with-unicode-\u00E9\u00F1\u00FC',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    const loaded = await tokenStorage.loadTokens();

    expect(loaded?.accessToken).toBe(tokens.accessToken);
    expect(loaded?.refreshToken).toBe(tokens.refreshToken);
  });

  /* Preconditions: Tokens with very long values
     Action: Save and load tokens with long strings
     Assertions: Long values are preserved correctly
     Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3 */
  it('should handle tokens with long values', async () => {
    const longToken = 'a'.repeat(5000);
    const tokens: TokenData = {
      accessToken: longToken,
      refreshToken: longToken,
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    await tokenStorage.saveTokens(tokens);
    const loaded = await tokenStorage.loadTokens();

    expect(loaded?.accessToken).toBe(longToken);
    expect(loaded?.refreshToken).toBe(longToken);
  });

  /* Preconditions: DataManager.saveData fails for access token
     Action: Call saveTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.1 */
  it('should throw error when access token save fails', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    // Mock saveData to fail for access token
    jest.spyOn(dataManager, 'saveData').mockReturnValueOnce({
      success: false,
      error: 'Database error',
    });

    await expect(tokenStorage.saveTokens(tokens)).rejects.toThrow(
      'Failed to save tokens: Failed to save access token: Database error'
    );
  });

  /* Preconditions: DataManager.saveData fails for refresh token
     Action: Call saveTokens with refresh token
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.1 */
  it('should throw error when refresh token save fails', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    // Mock saveData to succeed for access token, fail for refresh token
    jest
      .spyOn(dataManager, 'saveData')
      .mockReturnValueOnce({ success: true })
      .mockReturnValueOnce({
        success: false,
        error: 'Database locked',
      });

    await expect(tokenStorage.saveTokens(tokens)).rejects.toThrow(
      'Failed to save tokens: Failed to save refresh token: Database locked'
    );
  });

  /* Preconditions: DataManager.saveData fails for expires_at
     Action: Call saveTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.1 */
  it('should throw error when expires_at save fails', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    // Mock saveData to succeed for access token, fail for expires_at
    jest
      .spyOn(dataManager, 'saveData')
      .mockReturnValueOnce({ success: true })
      .mockReturnValueOnce({
        success: false,
        error: 'Disk full',
      });

    await expect(tokenStorage.saveTokens(tokens)).rejects.toThrow(
      'Failed to save tokens: Failed to save expires_at: Disk full'
    );
  });

  /* Preconditions: DataManager.saveData fails for token_type
     Action: Call saveTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.1 */
  it('should throw error when token_type save fails', async () => {
    const tokens: TokenData = {
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer',
    };

    // Mock saveData to succeed for access token and expires_at, fail for token_type
    jest
      .spyOn(dataManager, 'saveData')
      .mockReturnValueOnce({ success: true })
      .mockReturnValueOnce({ success: true })
      .mockReturnValueOnce({
        success: false,
        error: 'Permission denied',
      });

    await expect(tokenStorage.saveTokens(tokens)).rejects.toThrow(
      'Failed to save tokens: Failed to save token type: Permission denied'
    );
  });

  /* Preconditions: DataManager.loadData returns database error (not "Key not found")
     Action: Call loadTokens
     Assertions: Throws error with database error message
     Requirements: google-oauth-auth.4.3 */
  it('should throw error when loadData returns database error', async () => {
    // Mock loadData to return database error
    jest.spyOn(dataManager, 'loadData').mockReturnValueOnce({
      success: false,
      error: 'Database corrupted',
    });

    await expect(tokenStorage.loadTokens()).rejects.toThrow(
      'Failed to load tokens: Database corrupted'
    );
  });

  /* Preconditions: DataManager.loadData returns "Key not found" for all keys
     Action: Call loadTokens
     Assertions: Returns null (not an error)
     Requirements: google-oauth-auth.4.3 */
  it('should return null when all keys not found (not an error)', async () => {
    // Mock loadData to return "Key not found" for all keys
    jest.spyOn(dataManager, 'loadData').mockReturnValue({
      success: false,
      error: 'Key not found',
    });

    const loaded = await tokenStorage.loadTokens();

    expect(loaded).toBeNull();
  });

  /* Preconditions: DataManager.deleteData throws error
     Action: Call deleteTokens
     Assertions: Throws error with descriptive message
     Requirements: google-oauth-auth.4.4 */
  it('should throw error when deleteData fails', async () => {
    // Mock deleteData to throw error
    jest.spyOn(dataManager, 'deleteData').mockImplementation(() => {
      throw new Error('Database locked');
    });

    await expect(tokenStorage.deleteTokens()).rejects.toThrow(
      'Failed to delete tokens: Database locked'
    );
  });

  /* Preconditions: loadTokens throws error
     Action: Call hasValidTokens
     Assertions: Returns false (treats error as invalid tokens)
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2 */
  it('should return false when loadTokens throws error', async () => {
    // Mock loadTokens to throw error
    jest.spyOn(tokenStorage, 'loadTokens').mockRejectedValue(new Error('Database error'));

    const hasValid = await tokenStorage.hasValidTokens();

    expect(hasValid).toBe(false);
  });
});
