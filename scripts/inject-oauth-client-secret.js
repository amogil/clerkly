#!/usr/bin/env node
/* Requirements: google-oauth-auth.10.1 */

const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER = '__CLERKLY_OAUTH_CLIENT_SECRET__';
const targetPath = path.resolve(__dirname, '../dist/main/main/auth/OAuthConfig.js');
const dotenvPath = path.resolve(__dirname, '../.env');
const strictMode = process.argv.includes('--strict');

function readEnvValueFromDotEnv(envFilePath, key) {
  if (!fs.existsSync(envFilePath)) {
    return '';
  }
  const content = fs.readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const envKey = line.slice(0, separatorIndex).trim();
    if (envKey !== key) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return '';
}

let clientSecret = process.env.CLERKLY_OAUTH_CLIENT_SECRET || '';
if (!clientSecret) {
  const secretFromDotEnv = readEnvValueFromDotEnv(dotenvPath, 'CLERKLY_OAUTH_CLIENT_SECRET');
  if (secretFromDotEnv) {
    process.env.CLERKLY_OAUTH_CLIENT_SECRET = secretFromDotEnv;
    clientSecret = secretFromDotEnv;
    console.log('[inject-oauth-client-secret] Loaded CLERKLY_OAUTH_CLIENT_SECRET from .env');
  }
}

if (!fs.existsSync(targetPath)) {
  console.warn(`[inject-oauth-client-secret] Skipped: file not found: ${targetPath}`);
  process.exit(0);
}

if (!clientSecret) {
  const missingSecretMessage =
    '[inject-oauth-client-secret] CLERKLY_OAUTH_CLIENT_SECRET is not set in process.env and was not found in .env.';

  if (strictMode) {
    console.error(`${missingSecretMessage} Build cannot continue in strict mode.`);
    process.exit(1);
  }

  // In non-strict mode we intentionally continue silently without injection.
  process.exit(0);
}

const content = fs.readFileSync(targetPath, 'utf8');
const updatedContent = content.split(PLACEHOLDER).join(clientSecret);

if (content === updatedContent) {
  console.warn(
    '[inject-oauth-client-secret] Placeholder not found in OAuthConfig.js. Nothing was injected.'
  );
  process.exit(0);
}

fs.writeFileSync(targetPath, updatedContent, 'utf8');
console.log('[inject-oauth-client-secret] Injected CLERKLY_OAUTH_CLIENT_SECRET into build output.');
