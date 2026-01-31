// Requirements: google-oauth-auth.2.1, google-oauth-auth.2.2, platform-foundation.2.1
import crypto from "crypto";
import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { logError } from "../logging/logger";

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

type TokenRecord = {
  encrypted: string;
};

const AUTH_KEY_FILE = "auth.key";

const getKeyPath = (rootDir: string): string => {
  return path.join(rootDir, AUTH_KEY_FILE);
};

const loadEncryptionKey = (rootDir: string): Buffer => {
  const keyPath = getKeyPath(rootDir);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key);
  return key;
};

const encryptPayload = (payload: string, key: Buffer): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decryptPayload = (payload: string, key: Buffer): string => {
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
};

type SqliteDatabase = InstanceType<typeof Database>;

export const readTokens = (db: SqliteDatabase, rootDir: string): OAuthTokens | null => {
  try {
    const row = db
      .prepare("SELECT encrypted FROM auth_tokens WHERE id = 1")
      .get() as TokenRecord | undefined;

    if (!row) {
      return null;
    }

    const key = loadEncryptionKey(rootDir);
    const decrypted = decryptPayload(row.encrypted, key);
    return JSON.parse(decrypted) as OAuthTokens;
  } catch (error) {
    logError(rootDir, "Failed to read auth tokens.", error);
    return null;
  }
};

export const writeTokens = (db: SqliteDatabase, rootDir: string, tokens: OAuthTokens): void => {
  const key = loadEncryptionKey(rootDir);
  const payload = JSON.stringify(tokens);
  const encrypted = encryptPayload(payload, key);

  db.prepare(
    "INSERT INTO auth_tokens (id, encrypted, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET encrypted = excluded.encrypted, updated_at = excluded.updated_at"
  ).run(encrypted, Date.now());
};

export const clearTokens = (db: SqliteDatabase, rootDir: string): void => {
  try {
    db.prepare("DELETE FROM auth_tokens WHERE id = 1").run();
  } catch (error) {
    logError(rootDir, "Failed to clear auth tokens.", error);
  }
};
