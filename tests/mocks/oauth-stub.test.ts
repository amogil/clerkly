// Requirements: testing-infrastructure.6.1
import { describe, it, expect, beforeEach } from "vitest";
import {
  OAuthStubImpl,
  type UserProfile,
  type AuthError,
  type OAuthStubConfig,
} from "./oauth-stub";

describe("OAuthStub", () => {
  let oauthStub: OAuthStubImpl;
  let testConfig: OAuthStubConfig;
  let testUserProfile: UserProfile;
  let testError: AuthError;

  beforeEach(() => {
    oauthStub = new OAuthStubImpl();
    testConfig = {
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      scopes: ["openid", "email", "profile"],
      deterministic: true,
    };
    testUserProfile = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    };
    testError = {
      code: "invalid_grant",
      message: "Invalid authorization code",
      description: "The authorization code is invalid or expired",
    };
  });

  describe("Configuration", () => {
    /* Preconditions: OAuth stub is newly created, not configured
       Action: call configure() with valid config
       Assertions: isConfigured() returns true, config is stored
       Requirements: testing-infrastructure.6.1 */
    it("should configure OAuth stub with client settings", () => {
      expect(oauthStub.isConfigured()).toBe(false);

      oauthStub.configure(testConfig);

      expect(oauthStub.isConfigured()).toBe(true);
    });

    /* Preconditions: OAuth stub is not configured
       Action: attempt to mock authentication without configuration
       Assertions: throws error indicating configuration is required
       Requirements: testing-infrastructure.6.1 */
    it("should throw error when mocking auth without configuration", () => {
      expect(() => oauthStub.mockSuccessfulAuth(testUserProfile)).toThrow(
        "OAuthStub must be configured before mocking authentication",
      );
    });

    /* Preconditions: OAuth stub is configured
       Action: call reset() then check configuration
       Assertions: isConfigured() returns false after reset
       Requirements: testing-infrastructure.6.1 */
    it("should reset configuration when reset is called", () => {
      oauthStub.configure(testConfig);
      expect(oauthStub.isConfigured()).toBe(true);

      oauthStub.reset();

      expect(oauthStub.isConfigured()).toBe(false);
    });
  });

  describe("Successful Authentication", () => {
    beforeEach(() => {
      oauthStub.configure(testConfig);
    });

    /* Preconditions: OAuth stub is configured with deterministic mode
       Action: call mockSuccessfulAuth() with user profile
       Assertions: mode is "success", tokens are generated, error is null
       Requirements: testing-infrastructure.6.1 */
    it("should mock successful authentication with deterministic tokens", () => {
      oauthStub.mockSuccessfulAuth(testUserProfile);

      expect(oauthStub.getMode()).toBe("success");
      expect(oauthStub.getError()).toBeNull();

      const tokens = oauthStub.getTokens();
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBe("test-token-user-123-access");
      expect(tokens?.refreshToken).toBe("test-token-user-123-refresh");
      expect(tokens?.expiresAt).toBeGreaterThan(Date.now());
    });

    /* Preconditions: OAuth stub is configured with non-deterministic mode
       Action: call mockSuccessfulAuth() twice with same user profile
       Assertions: tokens are different between calls (non-deterministic)
       Requirements: testing-infrastructure.6.1 */
    it("should generate non-deterministic tokens when configured", () => {
      const nonDeterministicConfig = { ...testConfig, deterministic: false };
      oauthStub.configure(nonDeterministicConfig);

      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens1 = oauthStub.getTokens();

      // Wait a bit to ensure timestamp changes
      const start = Date.now();
      while (Date.now() === start) {
        // Busy wait
      }

      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens2 = oauthStub.getTokens();

      expect(tokens1?.accessToken).not.toBe(tokens2?.accessToken);
      expect(tokens1?.refreshToken).not.toBe(tokens2?.refreshToken);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockSuccessfulAuth() with user profile
       Assertions: tokens have correct structure with all required fields
       Requirements: testing-infrastructure.6.1 */
    it("should generate tokens with correct structure", () => {
      oauthStub.mockSuccessfulAuth(testUserProfile);

      const tokens = oauthStub.getTokens();
      expect(tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresAt: expect.any(Number),
      });
      expect(tokens?.accessToken.length).toBeGreaterThan(0);
      expect(tokens?.refreshToken).toBeDefined();
      expect(tokens?.expiresAt).toBeGreaterThan(Date.now());
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockSuccessfulAuth() with minimal user profile (no picture)
       Assertions: authentication succeeds, tokens are generated
       Requirements: testing-infrastructure.6.1 */
    it("should handle user profile without optional fields", () => {
      const minimalProfile: UserProfile = {
        id: "user-456",
        email: "minimal@example.com",
        name: "Minimal User",
      };

      oauthStub.mockSuccessfulAuth(minimalProfile);

      expect(oauthStub.getMode()).toBe("success");
      const tokens = oauthStub.getTokens();
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toContain("user-456");
    });
  });

  describe("Failed Authentication", () => {
    beforeEach(() => {
      oauthStub.configure(testConfig);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockFailedAuth() with error details
       Assertions: mode is "failure", error is set, tokens are null
       Requirements: testing-infrastructure.6.1 */
    it("should mock failed authentication with error details", () => {
      oauthStub.mockFailedAuth(testError);

      expect(oauthStub.getMode()).toBe("failure");
      expect(oauthStub.getTokens()).toBeNull();

      const error = oauthStub.getError();
      expect(error).toEqual(testError);
    });

    /* Preconditions: OAuth stub has successful authentication
       Action: call mockFailedAuth() to override previous state
       Assertions: previous tokens are cleared, error is set
       Requirements: testing-infrastructure.6.1 */
    it("should clear previous successful auth when mocking failure", () => {
      oauthStub.mockSuccessfulAuth(testUserProfile);
      expect(oauthStub.getTokens()).not.toBeNull();

      oauthStub.mockFailedAuth(testError);

      expect(oauthStub.getMode()).toBe("failure");
      expect(oauthStub.getTokens()).toBeNull();
      expect(oauthStub.getError()).toEqual(testError);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockFailedAuth() with minimal error (no description)
       Assertions: error is stored correctly without optional fields
       Requirements: testing-infrastructure.6.1 */
    it("should handle error without optional description", () => {
      const minimalError: AuthError = {
        code: "server_error",
        message: "Internal server error",
      };

      oauthStub.mockFailedAuth(minimalError);

      const error = oauthStub.getError();
      expect(error).toEqual(minimalError);
      expect(error?.description).toBeUndefined();
    });
  });

  describe("Cancelled Authentication", () => {
    beforeEach(() => {
      oauthStub.configure(testConfig);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockCancelledAuth()
       Assertions: mode is "cancelled", error indicates cancellation, tokens are null
       Requirements: testing-infrastructure.6.1 */
    it("should mock cancelled authentication", () => {
      oauthStub.mockCancelledAuth();

      expect(oauthStub.getMode()).toBe("cancelled");
      expect(oauthStub.getTokens()).toBeNull();

      const error = oauthStub.getError();
      expect(error).toEqual({
        code: "access_denied",
        message: "User cancelled authentication",
        description: "The user cancelled the OAuth authentication flow",
      });
    });

    /* Preconditions: OAuth stub has successful authentication
       Action: call mockCancelledAuth() to override previous state
       Assertions: previous tokens are cleared, cancellation error is set
       Requirements: testing-infrastructure.6.1 */
    it("should clear previous successful auth when mocking cancellation", () => {
      oauthStub.mockSuccessfulAuth(testUserProfile);
      expect(oauthStub.getTokens()).not.toBeNull();

      oauthStub.mockCancelledAuth();

      expect(oauthStub.getMode()).toBe("cancelled");
      expect(oauthStub.getTokens()).toBeNull();
      expect(oauthStub.getError()?.code).toBe("access_denied");
    });
  });

  describe("State Management", () => {
    /* Preconditions: OAuth stub is newly created
       Action: call getters without any setup
       Assertions: all getters return null or false for initial state
       Requirements: testing-infrastructure.6.1 */
    it("should return null/false for initial state", () => {
      const freshStub = new OAuthStubImpl();
      expect(freshStub.isConfigured()).toBe(false);
      expect(freshStub.getMode()).toBeNull();
      expect(freshStub.getTokens()).toBeNull();
      expect(freshStub.getError()).toBeNull();
    });

    /* Preconditions: OAuth stub is configured with successful auth
       Action: call reset()
       Assertions: all state is cleared (mode, tokens, error)
       Requirements: testing-infrastructure.6.1 */
    it("should reset all state when reset is called", () => {
      oauthStub.configure(testConfig);
      oauthStub.mockSuccessfulAuth(testUserProfile);
      expect(oauthStub.getMode()).toBe("success");
      expect(oauthStub.getTokens()).not.toBeNull();

      oauthStub.reset();

      expect(oauthStub.isConfigured()).toBe(false);
      expect(oauthStub.getMode()).toBeNull();
      expect(oauthStub.getTokens()).toBeNull();
      expect(oauthStub.getError()).toBeNull();
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockSuccessfulAuth(), then mockFailedAuth(), then mockCancelledAuth()
       Assertions: each call properly overrides previous state
       Requirements: testing-infrastructure.6.1 */
    it("should properly transition between different auth states", () => {
      oauthStub.configure(testConfig);

      // Success state
      oauthStub.mockSuccessfulAuth(testUserProfile);
      expect(oauthStub.getMode()).toBe("success");
      expect(oauthStub.getTokens()).not.toBeNull();
      expect(oauthStub.getError()).toBeNull();

      // Failure state
      oauthStub.mockFailedAuth(testError);
      expect(oauthStub.getMode()).toBe("failure");
      expect(oauthStub.getTokens()).toBeNull();
      expect(oauthStub.getError()).not.toBeNull();

      // Cancelled state
      oauthStub.mockCancelledAuth();
      expect(oauthStub.getMode()).toBe("cancelled");
      expect(oauthStub.getTokens()).toBeNull();
      expect(oauthStub.getError()?.code).toBe("access_denied");
    });
  });

  describe("Deterministic Behavior", () => {
    /* Preconditions: OAuth stub is configured with deterministic mode
       Action: call mockSuccessfulAuth() multiple times with same user
       Assertions: tokens are identical across calls (deterministic)
       Requirements: testing-infrastructure.6.1 */
    it("should generate identical tokens for same user in deterministic mode", () => {
      oauthStub.configure(testConfig);

      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens1 = oauthStub.getTokens();

      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens2 = oauthStub.getTokens();

      expect(tokens1?.accessToken).toBe(tokens2?.accessToken);
      expect(tokens1?.refreshToken).toBe(tokens2?.refreshToken);
    });

    /* Preconditions: OAuth stub is configured with deterministic mode
       Action: call mockSuccessfulAuth() with different users
       Assertions: tokens are different for different users
       Requirements: testing-infrastructure.6.1 */
    it("should generate different tokens for different users in deterministic mode", () => {
      oauthStub.configure(testConfig);

      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens1 = oauthStub.getTokens();

      const differentUser: UserProfile = {
        id: "user-789",
        email: "different@example.com",
        name: "Different User",
      };
      oauthStub.mockSuccessfulAuth(differentUser);
      const tokens2 = oauthStub.getTokens();

      expect(tokens1?.accessToken).not.toBe(tokens2?.accessToken);
      expect(tokens1?.refreshToken).not.toBe(tokens2?.refreshToken);
    });
  });

  describe("No External Network Calls", () => {
    /* Preconditions: OAuth stub is configured
       Action: perform all OAuth operations (success, failure, cancel)
       Assertions: all operations complete synchronously without network calls
       Requirements: testing-infrastructure.6.1 */
    it("should complete all operations synchronously without network calls", () => {
      oauthStub.configure(testConfig);

      // All operations should complete immediately
      const start = Date.now();

      oauthStub.mockSuccessfulAuth(testUserProfile);
      expect(oauthStub.getTokens()).not.toBeNull();

      oauthStub.mockFailedAuth(testError);
      expect(oauthStub.getError()).not.toBeNull();

      oauthStub.mockCancelledAuth();
      expect(oauthStub.getMode()).toBe("cancelled");

      const duration = Date.now() - start;

      // Should complete in less than 10ms (no network calls)
      expect(duration).toBeLessThan(10);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockSuccessfulAuth() and verify token generation
       Assertions: tokens are generated without any async operations
       Requirements: testing-infrastructure.6.1 */
    it("should generate tokens without async operations", () => {
      oauthStub.configure(testConfig);

      // This should be synchronous
      oauthStub.mockSuccessfulAuth(testUserProfile);
      const tokens = oauthStub.getTokens();

      // Tokens should be immediately available
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBeDefined();
      expect(tokens?.refreshToken).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    /* Preconditions: OAuth stub is configured
       Action: call getTokens() multiple times
       Assertions: returns new object each time (defensive copy)
       Requirements: testing-infrastructure.6.1 */
    it("should return defensive copies of tokens", () => {
      oauthStub.configure(testConfig);
      oauthStub.mockSuccessfulAuth(testUserProfile);

      const tokens1 = oauthStub.getTokens();
      const tokens2 = oauthStub.getTokens();

      expect(tokens1).not.toBe(tokens2); // Different object references
      expect(tokens1).toEqual(tokens2); // But same values
    });

    /* Preconditions: OAuth stub is configured
       Action: call getError() multiple times
       Assertions: returns new object each time (defensive copy)
       Requirements: testing-infrastructure.6.1 */
    it("should return defensive copies of errors", () => {
      oauthStub.configure(testConfig);
      oauthStub.mockFailedAuth(testError);

      const error1 = oauthStub.getError();
      const error2 = oauthStub.getError();

      expect(error1).not.toBe(error2); // Different object references
      expect(error1).toEqual(error2); // But same values
    });

    /* Preconditions: OAuth stub is configured
       Action: configure with empty scopes array
       Assertions: configuration succeeds, scopes are stored
       Requirements: testing-infrastructure.6.1 */
    it("should handle empty scopes array", () => {
      const configWithEmptyScopes = { ...testConfig, scopes: [] };
      oauthStub.configure(configWithEmptyScopes);

      expect(oauthStub.isConfigured()).toBe(true);
    });

    /* Preconditions: OAuth stub is configured
       Action: call mockSuccessfulAuth() with user ID containing special characters
       Assertions: tokens are generated correctly with special characters
       Requirements: testing-infrastructure.6.1 */
    it("should handle user IDs with special characters", () => {
      oauthStub.configure(testConfig);

      const specialUser: UserProfile = {
        id: "user-123-abc_def@example",
        email: "special@example.com",
        name: "Special User",
      };

      oauthStub.mockSuccessfulAuth(specialUser);
      const tokens = oauthStub.getTokens();

      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toContain("user-123-abc_def@example");
    });
  });
});
