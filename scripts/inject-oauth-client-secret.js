#!/usr/bin/env node
/* Requirements: google-oauth-auth.10.1 */

const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER = '__CLERKLY_OAUTH_CLIENT_SECRET__';
const targetPath = path.resolve(__dirname, '../dist/main/main/auth/OAuthConfig.js');
const clientSecret = process.env.CLERKLY_OAUTH_CLIENT_SECRET;

if (!fs.existsSync(targetPath)) {
  console.warn(`[inject-oauth-client-secret] Skipped: file not found: ${targetPath}`);
  process.exit(0);
}

if (!clientSecret) {
  console.warn(
    '[inject-oauth-client-secret] CLERKLY_OAUTH_CLIENT_SECRET is not set. Placeholder was left in build output.'
  );
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
