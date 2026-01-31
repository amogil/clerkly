// Requirements: platform-foundation.2.2, google-oauth-auth.1.7, google-oauth-auth.1.8, google-oauth-auth.3.1, google-oauth-auth.3.3
import crypto from "crypto";

export const authGoogleConfig = {
  clientId:
    "100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com",
  clientSecret: "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",
  scopes: ["openid", "email", "profile"],
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const base64UrlEncode = (input: Buffer): string => {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const generatePkceVerifier = (): string => {
  return base64UrlEncode(crypto.randomBytes(32));
};

export const generatePkceChallenge = (verifier: string): string => {
  const hash = crypto.createHash("sha256").update(verifier, "ascii").digest();
  return base64UrlEncode(hash);
};

export const generateOauthState = (): string => {
  return base64UrlEncode(crypto.randomBytes(32));
};

export const getGoogleAuthUrl = (
  clientId: string,
  port: number,
  codeChallenge: string,
  state: string
): string => {
  const redirectUri = `http://127.0.0.1:${port}`;
  const url = new URL(authGoogleConfig.authEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", authGoogleConfig.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
};
