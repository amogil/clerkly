// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3, google-oauth-auth.4.4

import * as fc from 'fast-check';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { DataManager } from '../../../src/main/DataManager';
import { TokenData } from '../../../src/main/auth/OAuthConfig';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TokenStorageManager Property-Based Tests', () => {
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary directory for test database
    testDbPath = path.join(os.tmpdir(), `test-token-storage-pbt-${Date.now()}`);
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();
    tokenStorage = new TokenStorageManager(dataManager);
  });

  afterEach(() => {
    // Clean up
    dataManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  // Generator for token data
  const tokenDataArb = fc.record({
    accessToken: fc.string({ minLength: 20, maxLength: 500 }),
    refreshToken: fc.string({ minLength: 20, maxLength: 500 }),
    expiresAt: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    tokenType: fc.constant('Bearer'),
  });

  /* Feature: google-oauth-auth, Property 9: Token Storage Round Trip
     For any valid token data, saving it to storage and then loading it back
     should return equivalent token data with all fields preserved.
     Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3 */
  it('Property 9: should preserve token data through save/load cycle', async () => {
    await fc.assert(
      fc.asyncProperty(tokenDataArb, async (tokenData: TokenData) => {
        // Save tokens
        await tokenStorage.saveTokens(tokenData);

        // Load tokens
        const loaded = await tokenStorage.loadTokens();

        // Verify all fields are preserved
        expect(loaded).not.toBeNull();
        expect(loaded?.accessToken).toBe(tokenData.accessToken);
        expect(loaded?.refreshToken).toBe(tokenData.refreshToken);
        expect(loaded?.expiresAt).toBe(tokenData.expiresAt);
        expect(loaded?.tokenType).toBe(tokenData.tokenType);

        // Clean up for next iteration
        await tokenStorage.deleteTokens();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property 10: Token Deletion Completeness
     For any stored tokens, after calling delete operation, attempting to load
     tokens should return null or empty result.
     Requirements: google-oauth-auth.4.4 */
  it('Property 10: should completely remove tokens after deletion', async () => {
    await fc.assert(
      fc.asyncProperty(tokenDataArb, async (tokenData: TokenData) => {
        // Save tokens
        await tokenStorage.saveTokens(tokenData);

        // Verify tokens exist
        const beforeDelete = await tokenStorage.loadTokens();
        expect(beforeDelete).not.toBeNull();

        // Delete tokens
        await tokenStorage.deleteTokens();

        // Verify tokens are gone
        const afterDelete = await tokenStorage.loadTokens();
        expect(afterDelete).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Additional Property: Token Overwrite Consistency
     For any two different token data sets, saving the second should completely
     overwrite the first, with no remnants of the first set remaining.
     Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3 */
  it('should completely overwrite previous tokens when saving new ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenDataArb,
        tokenDataArb,
        async (tokens1: TokenData, tokens2: TokenData) => {
          // Save first set of tokens
          await tokenStorage.saveTokens(tokens1);

          // Save second set of tokens
          await tokenStorage.saveTokens(tokens2);

          // Load tokens
          const loaded = await tokenStorage.loadTokens();

          // Verify only second set is present
          expect(loaded).not.toBeNull();
          expect(loaded?.accessToken).toBe(tokens2.accessToken);
          expect(loaded?.refreshToken).toBe(tokens2.refreshToken);
          expect(loaded?.expiresAt).toBe(tokens2.expiresAt);
          expect(loaded?.tokenType).toBe(tokens2.tokenType);

          // Verify no traces of first set
          expect(loaded?.accessToken).not.toBe(tokens1.accessToken);
          expect(loaded?.refreshToken).not.toBe(tokens1.refreshToken);

          // Clean up
          await tokenStorage.deleteTokens();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Additional Property: Idempotent Deletion
     Deleting tokens multiple times should be safe and not cause errors.
     Requirements: google-oauth-auth.4.4 */
  it('should handle multiple deletions without errors', async () => {
    await fc.assert(
      fc.asyncProperty(tokenDataArb, async (tokenData: TokenData) => {
        // Save tokens
        await tokenStorage.saveTokens(tokenData);

        // Delete multiple times
        await tokenStorage.deleteTokens();
        await tokenStorage.deleteTokens();
        await tokenStorage.deleteTokens();

        // Verify tokens are still gone
        const loaded = await tokenStorage.loadTokens();
        expect(loaded).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Additional Property: Valid Token Detection
     For any token data with expiresAt in the future, hasValidTokens should return true.
     For any token data with expiresAt in the past, hasValidTokens should return false.
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3 */
  it('should correctly detect valid vs expired tokens', async () => {
    // Test with future expiration
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accessToken: fc.string({ minLength: 20 }),
          refreshToken: fc.string({ minLength: 20 }),
          expiresAt: fc.integer({
            min: Date.now() + 1000,
            max: Date.now() + 365 * 24 * 60 * 60 * 1000,
          }),
          tokenType: fc.constant('Bearer'),
        }),
        async (tokenData: TokenData) => {
          await tokenStorage.saveTokens(tokenData);
          const hasValid = await tokenStorage.hasValidTokens();
          expect(hasValid).toBe(true);
          await tokenStorage.deleteTokens();
        }
      ),
      { numRuns: 50 }
    );

    // Test with past expiration
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accessToken: fc.string({ minLength: 20 }),
          refreshToken: fc.string({ minLength: 20 }),
          expiresAt: fc.integer({ min: 0, max: Date.now() - 1000 }),
          tokenType: fc.constant('Bearer'),
        }),
        async (tokenData: TokenData) => {
          await tokenStorage.saveTokens(tokenData);
          const hasValid = await tokenStorage.hasValidTokens();
          expect(hasValid).toBe(false);
          await tokenStorage.deleteTokens();
        }
      ),
      { numRuns: 50 }
    );
  });
});
