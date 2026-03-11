// Requirements: google-oauth-auth.10.7, google-oauth-auth.10.8, google-oauth-auth.10.9

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('inject-oauth-client-secret script', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/inject-oauth-client-secret.js');
  const targetPath = path.resolve(process.cwd(), 'dist/main/main/auth/OAuthConfig.js');
  const targetDir = path.dirname(targetPath);
  const dotenvPath = path.resolve(process.cwd(), '.env');

  let hadTarget = false;
  let originalTargetContent = '';
  let hadDotEnv = false;
  let originalDotEnvContent = '';
  let originalSecret: string | undefined;

  const runScript = (envOverrides: Record<string, string | undefined> = {}) =>
    spawnSync('node', [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...envOverrides,
      },
      encoding: 'utf8',
    });

  beforeAll(() => {
    originalSecret = process.env.CLERKLY_OAUTH_CLIENT_SECRET;
    hadTarget = fs.existsSync(targetPath);
    if (hadTarget) {
      originalTargetContent = fs.readFileSync(targetPath, 'utf8');
    }
    hadDotEnv = fs.existsSync(dotenvPath);
    if (hadDotEnv) {
      originalDotEnvContent = fs.readFileSync(dotenvPath, 'utf8');
    }
  });

  beforeEach(() => {
    fs.mkdirSync(targetDir, { recursive: true });
    delete process.env.CLERKLY_OAUTH_CLIENT_SECRET;
    if (fs.existsSync(dotenvPath)) {
      fs.unlinkSync(dotenvPath);
    }
  });

  afterAll(() => {
    if (hadTarget) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetPath, originalTargetContent, 'utf8');
    } else if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    if (hadDotEnv) {
      fs.writeFileSync(dotenvPath, originalDotEnvContent, 'utf8');
    } else if (fs.existsSync(dotenvPath)) {
      fs.unlinkSync(dotenvPath);
    }

    if (typeof originalSecret === 'string') {
      process.env.CLERKLY_OAUTH_CLIENT_SECRET = originalSecret;
    } else {
      delete process.env.CLERKLY_OAUTH_CLIENT_SECRET;
    }
  });

  it('injects value from process.env into build output', () => {
    fs.writeFileSync(targetPath, "clientSecret:'__CLERKLY_OAUTH_CLIENT_SECRET__'", 'utf8');

    const result = runScript({ CLERKLY_OAUTH_CLIENT_SECRET: 'env-secret' });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(targetPath, 'utf8')).toContain("clientSecret:'env-secret'");
  });

  it('loads secret from .env when process.env is missing', () => {
    fs.writeFileSync(targetPath, "clientSecret:'__CLERKLY_OAUTH_CLIENT_SECRET__'", 'utf8');
    fs.writeFileSync(dotenvPath, 'CLERKLY_OAUTH_CLIENT_SECRET=dotenv-secret\n', 'utf8');

    const result = runScript({ CLERKLY_OAUTH_CLIENT_SECRET: undefined });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Loaded CLERKLY_OAUTH_CLIENT_SECRET from .env');
    expect(fs.readFileSync(targetPath, 'utf8')).toContain("clientSecret:'dotenv-secret'");
  });

  it('fails with code 1 when secret is missing in process.env and .env', () => {
    fs.writeFileSync(targetPath, "clientSecret:'__CLERKLY_OAUTH_CLIENT_SECRET__'", 'utf8');

    const result = runScript({ CLERKLY_OAUTH_CLIENT_SECRET: undefined });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLERKLY_OAUTH_CLIENT_SECRET is not set');
  });

  it('warns and exits successfully when placeholder is not found', () => {
    fs.writeFileSync(targetPath, "clientSecret:'already-injected'", 'utf8');

    const result = runScript({ CLERKLY_OAUTH_CLIENT_SECRET: 'env-secret' });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Placeholder not found');
    expect(fs.readFileSync(targetPath, 'utf8')).toContain("clientSecret:'already-injected'");
  });
});
