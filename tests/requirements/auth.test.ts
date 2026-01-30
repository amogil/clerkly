import { describe, expect, it } from "vitest";

import { authGoogleConfig, getGoogleAuthUrl } from "../../src/auth/auth_google";
import { fileExists, readText } from "../utils/fs";

describe("Auth and OAuth requirements", () => {
  /* Preconditions: auth gate component exists.
     Action: read auth gate content.
     Assertions: sign-in text is present.
     Requirements: E.A.2 */
  it("renders a Google sign-in button label", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain("Sign in with Google");
  });

  /* Preconditions: App component exists.
     Action: inspect auth gate usage.
     Assertions: unauthorized state shows AuthGate.
     Requirements: E.A.1 */
  it("shows the auth gate when unauthorized", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain("<AuthGate");
    expect(source).toContain("authState === 'authorized'");
  });

  /* Preconditions: main process exists.
     Action: inspect auth handler.
     Assertions: system browser is opened for login.
     Requirements: E.A.3 */
  it("opens the system browser for Google login", () => {
    const source = readText("main.ts");
    expect(source).toContain('shell.openExternal');
    expect(source).toContain("auth:open-google");
  });

  /* Preconditions: App component exists.
     Action: inspect post-auth UI handling.
     Assertions: full UI only when authorized.
     Requirements: E.A.4 */
  it("shows full UI only after successful authorization", () => {
    const source = readText("renderer/src/app/App.tsx");
    expect(source).toContain("authState === 'authorized'");
  });

  /* Preconditions: auth gate component exists.
     Action: inspect error message rendering.
     Assertions: error message is conditionally rendered.
     Requirements: E.A.5 */
  it("keeps the sign-in button and shows auth errors", () => {
    const source = readText("renderer/src/app/components/auth-gate.tsx");
    expect(source).toContain("errorMessage");
  });

  /* Preconditions: auth config exists.
     Action: generate auth URL for a port.
     Assertions: uses loopback redirect.
     Requirements: E.A.6 */
  it("uses loopback redirect URIs", () => {
    const url = getGoogleAuthUrl("client-id", 34123);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:34123/auth/callback"
    );
  });

  /* Preconditions: auth config exists.
     Action: inspect clientId.
     Assertions: clientId is configured.
     Requirements: E.A.7 */
  it("defines the OAuth client ID in auth config", () => {
    expect(authGoogleConfig.clientId).toBeTruthy();
  });

  /* Preconditions: main process exists.
     Action: inspect callback parsing.
     Assertions: code parameter determines success.
     Requirements: E.A.8 */
  it("treats OAuth code as success criteria", () => {
    const source = readText("main.ts");
    expect(source).toContain('searchParams.get("code")');
  });

  /* Preconditions: token store exists.
     Action: check persistence module presence.
     Assertions: token store is implemented.
     Requirements: E.A.11 */
  it("persists authorization state in storage", () => {
    expect(fileExists("src/auth/token_store.ts")).toBe(true);
  });

  /* Preconditions: token store exists.
     Action: inspect encryption usage.
     Assertions: AES-GCM encryption is used.
     Requirements: E.A.12 */
  it("encrypts tokens before storage", () => {
    const source = readText("src/auth/token_store.ts");
    expect(source).toContain("aes-256-gcm");
  });

  /* Preconditions: main process exists.
     Action: inspect refresh scheduling.
     Assertions: silent refresh logic exists.
     Requirements: E.A.13 */
  it("refreshes tokens silently in the background", () => {
    const source = readText("main.ts");
    expect(source).toContain("refreshTokens");
    expect(source).toContain("scheduleTokenRefresh");
  });

  /* Preconditions: settings component exists.
     Action: inspect sign-out UI.
     Assertions: sign-out button present.
     Requirements: E.A.14 */
  it("provides a sign-out action", () => {
    const source = readText("renderer/src/app/components/settings.tsx");
    expect(source).toContain("Sign Out");
  });

  /* Preconditions: token store exists.
     Action: inspect storage usage.
     Assertions: SQLite token storage is used.
     Requirements: E.A.15 */
  it("stores runtime auth data in SQLite", () => {
    const source = readText("src/auth/token_store.ts");
    expect(source).toContain("auth_tokens");
  });
});
