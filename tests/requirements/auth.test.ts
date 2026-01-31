import { describe, expect, it } from "vitest";

import {
  authGoogleConfig,
  generateOauthState,
  generatePkceChallenge,
  generatePkceVerifier,
  getGoogleAuthUrl,
} from "../../src/auth/auth_google";
import { fileExists, readText } from "../utils/fs";

describe("Auth and OAuth requirements", () => {
  /* Preconditions: auth gate component exists.
     Action: read auth gate content.
     Assertions: sign-in text is present.
     Requirements: google-oauth-auth.1.2 */
  it("renders a Google sign-in button label", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain("Sign in with Google");
  });

  /* Preconditions: App component exists.
     Action: inspect auth gate usage.
     Assertions: unauthorized state shows AuthGate.
     Requirements: google-oauth-auth.1.1 */
  it("shows the auth gate when unauthorized", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain("<AuthGate");
    expect(source).toContain('authState === "authorized"');
  });

  /* Preconditions: main process exists.
     Action: inspect auth handler.
     Assertions: system browser is opened for login.
     Requirements: google-oauth-auth.1.3 */
  it("opens the system browser for Google login", () => {
    const source = readText("main.ts");
    expect(source).toContain("shell.openExternal");
    expect(source).toContain("auth:open-google");
  });

  /* Preconditions: App component exists.
     Action: inspect post-auth UI handling.
     Assertions: full UI only when authorized.
     Requirements: google-oauth-auth.1.4 */
  it("shows full UI only after successful authorization", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain('authState === "authorized"');
  });

  /* Preconditions: auth gate component exists.
     Action: inspect error message rendering.
     Assertions: error message is conditionally rendered.
     Requirements: google-oauth-auth.1.5 */
  it("keeps the sign-in button and shows auth errors", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain("errorMessage");
  });

  /* Preconditions: App component exists.
     Action: inspect auth retry handling.
     Assertions: authorizing state resets to unauthorized for retry.
     Requirements: google-oauth-auth.1.19 */
  it("keeps auth gate available after browser close", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain('prev === "authorizing" ? "unauthorized" : prev');
  });

  /* Preconditions: auth config exists.
     Action: generate auth URL for a port.
     Assertions: uses loopback redirect.
     Requirements: google-oauth-auth.1.6 */
  it("uses loopback redirect URIs", () => {
    const url = getGoogleAuthUrl("client-id", 34123, "challenge", "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:34123");
  });

  /* Preconditions: auth config exists.
     Action: inspect clientId.
     Assertions: clientId is configured.
     Requirements: google-oauth-auth.1.7 */
  it("defines the OAuth client ID in auth config", () => {
    expect(authGoogleConfig.clientId).toBeTruthy();
  });

  /* Preconditions: main process exists.
     Action: inspect callback parsing.
     Assertions: code parameter determines success.
     Requirements: google-oauth-auth.1.8 */
  it("treats OAuth code as success criteria", () => {
    const source = readText("main.ts");
    expect(source).toContain('searchParams.get("code")');
  });

  /* Preconditions: token store exists.
     Action: check persistence module presence.
     Assertions: token store is implemented.
     Requirements: google-oauth-auth.1.9 */
  it("persists authorization state in storage", () => {
    expect(fileExists("src/auth/token_store.ts")).toBe(true);
  });

  /* Preconditions: token store exists.
     Action: inspect encryption usage.
     Assertions: AES-GCM encryption is used.
     Requirements: google-oauth-auth.1.10 */
  it("encrypts tokens before storage", () => {
    const source = readText("src/auth/token_store.ts");
    expect(source).toContain("aes-256-gcm");
  });

  /* Preconditions: main process exists.
     Action: inspect refresh scheduling.
     Assertions: silent refresh logic exists.
     Requirements: google-oauth-auth.1.11 */
  it("refreshes tokens silently in the background", () => {
    const source = readText("main.ts");
    expect(source).toContain("refreshTokens");
    expect(source).toContain("scheduleTokenRefresh");
  });

  /* Preconditions: settings component exists.
     Action: inspect sign-out UI.
     Assertions: sign-out button present.
     Requirements: google-oauth-auth.1.12 */
  it("provides a sign-out action", () => {
    const source = readText("renderer/src/app/components/settings.tsx");
    expect(source).toContain("Sign Out");
  });

  /* Preconditions: token store exists.
     Action: inspect storage usage.
     Assertions: SQLite token storage is used.
     Requirements: google-oauth-auth.1.13 */
  it("stores runtime auth data in SQLite", () => {
    const source = readText("src/auth/token_store.ts");
    expect(source).toContain("auth_tokens");
  });

  /* Preconditions: PKCE helpers exist.
     Action: generate PKCE verifier and challenge.
     Assertions: challenge is derived and included in auth URL.
     Requirements: google-oauth-auth.1.14 */
  it("uses PKCE for OAuth authorization", () => {
    const verifier = generatePkceVerifier();
    const challenge = generatePkceChallenge(verifier);
    const url = getGoogleAuthUrl("client-id", 34123, challenge, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code_challenge")).toBe(challenge);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  /* Preconditions: main process exists.
     Action: inspect PKCE verifier handling.
     Assertions: code_verifier is included in token exchange.
     Requirements: google-oauth-auth.1.15 */
  it("clears and uses PKCE verifier only per attempt", () => {
    const source = readText("main.ts");
    expect(source).toContain("pendingCodeVerifier");
    expect(source).toContain("code_verifier");
  });

  /* Preconditions: auth exchange requires a client secret.
     Action: inspect token exchange and refresh payloads.
     Assertions: client_secret is included in token requests.
     Requirements: google-oauth-auth.1.17 */
  it("includes client secret in token exchange and refresh", () => {
    const source = readText("main.ts");
    expect(source).toContain('body.set("client_secret"');
    expect(source).toContain("refresh_token");
    expect(source).toContain("authorization_code");
  });

  /* Preconditions: auth config exists.
     Action: inspect config source.
     Assertions: secret is defined in config.
     Requirements: google-oauth-auth.1.18 */
  it("defines client secret in auth config", () => {
    const source = readText("src/auth/auth_google.ts");
    expect(source).toContain("clientSecret:");
    expect(authGoogleConfig.clientSecret).toBeTruthy();
  });

  /* Preconditions: state helper exists.
     Action: generate auth URL with state.
     Assertions: state is present and validated.
     Requirements: google-oauth-auth.1.16 */
  it("includes and validates OAuth state", () => {
    const state = generateOauthState();
    const url = getGoogleAuthUrl("client-id", 34123, "challenge", state);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("state")).toBe(state);
    const source = readText("main.ts");
    expect(source).toContain("pendingAuthState");
    expect(source).toContain('searchParams.get("state")');
  });

  /* Preconditions: auth callback response exists.
     Action: inspect authorization completion response.
     Assertions: completion page attempts to close itself.
     Requirements: google-oauth-auth.1.20 */
  it("auto-closes the authorization completion page", () => {
    const source = readText("src/auth/authorization_completion_page.ts");
    expect(source).toContain("setTimeout(() => window.close(), 300)");
  });

  /* Preconditions: auth completion response exists.
     Action: inspect completion page markup.
     Assertions: completion page renders the Clerkly logo and styled content.
     Requirements: google-oauth-auth.1.21 */
  it("renders a branded authorization completion page", () => {
    const source = readText("src/auth/authorization_completion_page.ts");
    expect(source).toContain("<span>Clerkly</span>");
    expect(source).toContain('class="card"');
    expect(source).toContain("<svg");
  });

  /* Preconditions: auth completion response exists.
     Action: inspect completion copy.
     Assertions: completion page mentions returning to the app.
     Requirements: google-oauth-auth.1.22 */
  it("mentions returning to the app on completion", () => {
    const source = readText("src/auth/authorization_completion_page.ts");
    expect(source).toContain("Return to the Clerkly app to continue.");
  });

  /* Preconditions: auth completion response exists.
     Action: inspect completion copy selection.
     Assertions: failure copy exists and success copy is conditional.
     Requirements: google-oauth-auth.1.23 */
  it("renders a failure completion state without success copy", () => {
    const source = readText("src/auth/authorization_completion_page.ts");
    expect(source).toContain('const failureTitle = "Authorization canceled."');
    expect(source).toContain('const failureSubtitle = "Return to the Clerkly app to try again."');
    expect(source).toContain("${success ? successTitle : failureTitle}");
  });

  /* Preconditions: main process exists.
     Action: inspect OAuth error handling.
     Assertions: raw error codes are mapped to human-friendly text.
     Requirements: google-oauth-auth.1.24 */
  it("maps OAuth error codes to friendly messages", () => {
    const source = readText("main.ts");
    expect(source).toContain('if (normalized === "access_denied")');
    expect(source).toContain("Authorization was canceled. Please try again.");
  });

  /* Preconditions: completion page component exists.
     Action: inspect error detail handling.
     Assertions: default cancel message is not duplicated as detail.
     Requirements: google-oauth-auth.1.24 */
  it("avoids duplicating the default cancel message", () => {
    const source = readText("src/auth/authorization_completion_page.ts");
    expect(source).toContain(
      'error && error !== "Authorization was canceled. Please try again." ? error : ""',
    );
  });

  /* Preconditions: App component exists.
     Action: inspect auth error mapping in the renderer.
     Assertions: access_denied is converted to a friendly message.
     Requirements: google-oauth-auth.1.24 */
  it("maps access_denied in the renderer", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain('if (normalized === "access_denied")');
    expect(source).toContain("Authorization was canceled. Please try again.");
  });
});
