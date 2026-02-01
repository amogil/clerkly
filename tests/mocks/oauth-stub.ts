// Requirements: testing-infrastructure.6.1

/**
 * User profile information for OAuth authentication
 * Requirements: testing-infrastructure.6.1
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * OAuth authentication error types
 * Requirements: testing-infrastructure.6.1
 */
export interface AuthError {
  code: string;
  message: string;
  description?: string;
}

/**
 * OAuth stub configuration
 * Requirements: testing-infrastructure.6.1
 */
export interface OAuthStubConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  deterministic: boolean;
}

/**
 * OAuth tokens structure matching the application's token format
 * Requirements: testing-infrastructure.6.1
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * OAuth stub mode for controlling authentication behavior
 * Requirements: testing-infrastructure.6.1
 */
export type OAuthStubMode = "success" | "failure" | "cancelled";

/**
 * Interface for OAuth stub operations
 * Provides deterministic OAuth authentication for testing without external network calls
 * Requirements: testing-infrastructure.6.1
 */
export interface OAuthStub {
  configure(config: OAuthStubConfig): void;
  mockSuccessfulAuth(userProfile: UserProfile): void;
  mockFailedAuth(error: AuthError): void;
  mockCancelledAuth(): void;
  getTokens(): OAuthTokens | null;
  getError(): AuthError | null;
  getMode(): OAuthStubMode | null;
  isConfigured(): boolean;
  reset(): void;
}

/**
 * Implementation of OAuthStub for deterministic OAuth testing
 * Ensures no external network calls are made during tests
 * Requirements: testing-infrastructure.6.1
 */
export class OAuthStubImpl implements OAuthStub {
  private config: OAuthStubConfig | null = null;
  private mode: OAuthStubMode | null = null;
  private tokens: OAuthTokens | null = null;
  private error: AuthError | null = null;
  private userProfile: UserProfile | null = null;

  /**
   * Configure OAuth stub with client settings
   * Requirements: testing-infrastructure.6.1
   */
  configure(config: OAuthStubConfig): void {
    this.config = { ...config };
  }

  /**
   * Mock successful authentication with user profile
   * Generates deterministic tokens for testing
   * Requirements: testing-infrastructure.6.1
   */
  mockSuccessfulAuth(userProfile: UserProfile): void {
    if (!this.config) {
      throw new Error("OAuthStub must be configured before mocking authentication");
    }

    this.mode = "success";
    this.userProfile = { ...userProfile };
    this.error = null;

    // Generate deterministic tokens based on user profile
    const baseToken = this.config.deterministic
      ? `test-token-${userProfile.id}`
      : `test-token-${Date.now()}`;

    this.tokens = {
      accessToken: `${baseToken}-access`,
      refreshToken: `${baseToken}-refresh`,
      expiresAt: Date.now() + 3600000, // 1 hour from now
    };
  }

  /**
   * Mock failed authentication with error details
   * Requirements: testing-infrastructure.6.1
   */
  mockFailedAuth(error: AuthError): void {
    if (!this.config) {
      throw new Error("OAuthStub must be configured before mocking authentication");
    }

    this.mode = "failure";
    this.error = { ...error };
    this.tokens = null;
    this.userProfile = null;
  }

  /**
   * Mock cancelled authentication (user cancelled the flow)
   * Requirements: testing-infrastructure.6.1
   */
  mockCancelledAuth(): void {
    if (!this.config) {
      throw new Error("OAuthStub must be configured before mocking authentication");
    }

    this.mode = "cancelled";
    this.error = {
      code: "access_denied",
      message: "User cancelled authentication",
      description: "The user cancelled the OAuth authentication flow",
    };
    this.tokens = null;
    this.userProfile = null;
  }

  /**
   * Get current OAuth tokens
   * Requirements: testing-infrastructure.6.1
   */
  getTokens(): OAuthTokens | null {
    return this.tokens ? { ...this.tokens } : null;
  }

  /**
   * Get current authentication error
   * Requirements: testing-infrastructure.6.1
   */
  getError(): AuthError | null {
    return this.error ? { ...this.error } : null;
  }

  /**
   * Get current OAuth stub mode
   * Requirements: testing-infrastructure.6.1
   */
  getMode(): OAuthStubMode | null {
    return this.mode;
  }

  /**
   * Check if OAuth stub is configured
   * Requirements: testing-infrastructure.6.1
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Reset OAuth stub to initial state
   * Requirements: testing-infrastructure.6.1
   */
  reset(): void {
    this.config = null;
    this.mode = null;
    this.tokens = null;
    this.error = null;
    this.userProfile = null;
  }
}

/**
 * Global OAuth stub instance for testing
 * Requirements: testing-infrastructure.6.1
 */
export const oauthStub = new OAuthStubImpl();
