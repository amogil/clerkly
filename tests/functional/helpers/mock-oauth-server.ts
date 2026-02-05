// Requirements: testing.3.9

import * as http from 'http';
import * as url from 'url';

/**
 * Mock OAuth Server
 *
 * Emulates Google OAuth endpoints for testing purposes.
 * Allows functional tests to complete full OAuth flow without real Google credentials.
 *
 * Requirements: testing.3.9 - Mock external services in functional tests
 */

export interface MockOAuthServerConfig {
  port: number;
  clientId: string;
  clientSecret: string;
}

export interface MockTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export class MockOAuthServer {
  private server: http.Server | null = null;
  private config: MockOAuthServerConfig;
  private authCodes: Map<string, { redirectUri: string; state: string }> = new Map();

  constructor(config: MockOAuthServerConfig) {
    this.config = config;
  }

  /**
   * Start the mock OAuth server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, () => {
        console.log(`[MOCK OAUTH] Server started on port ${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the mock OAuth server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[MOCK OAUTH] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the base URL of the mock server
   */
  getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname;

    console.log(`[MOCK OAUTH] ${req.method} ${pathname}`);

    // CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route requests
    if (pathname === '/auth' && req.method === 'GET') {
      this.handleAuthRequest(parsedUrl.query, res);
    } else if (pathname === '/token' && req.method === 'POST') {
      this.handleTokenRequest(req, res);
    } else if (pathname === '/refresh' && req.method === 'POST') {
      this.handleRefreshRequest(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handle authorization request (GET /auth)
   */
  private handleAuthRequest(query: any, res: http.ServerResponse): void {
    const { client_id, redirect_uri, state, response_type, scope } = query;

    // Validate request
    if (client_id !== this.config.clientId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_client' }));
      return;
    }

    if (response_type !== 'code') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unsupported_response_type' }));
      return;
    }

    // Generate authorization code
    const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.authCodes.set(authCode, {
      redirectUri: redirect_uri as string,
      state: state as string,
    });

    // Redirect back to app with authorization code
    const redirectUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();

    console.log(`[MOCK OAUTH] Generated auth code: ${authCode}`);
  }

  /**
   * Handle token exchange request (POST /token)
   */
  private handleTokenRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const grantType = params.get('grant_type');
      const code = params.get('code');
      const clientId = params.get('client_id');
      const clientSecret = params.get('client_secret');
      const redirectUri = params.get('redirect_uri');

      // Validate request
      if (clientId !== this.config.clientId || clientSecret !== this.config.clientSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client' }));
        return;
      }

      if (grantType !== 'authorization_code') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
        return;
      }

      // Validate authorization code
      const authData = this.authCodes.get(code || '');
      if (!authData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }

      if (authData.redirectUri !== redirectUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'redirect_uri_mismatch' }));
        return;
      }

      // Remove used authorization code
      this.authCodes.delete(code || '');

      // Generate tokens
      const tokenResponse: MockTokenResponse = {
        access_token: `test_access_token_${Date.now()}`,
        refresh_token: `test_refresh_token_${Date.now()}`,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tokenResponse));

      console.log('[MOCK OAUTH] Issued tokens');
    });
  }

  /**
   * Handle token refresh request (POST /refresh)
   */
  private handleRefreshRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const grantType = params.get('grant_type');
      const refreshToken = params.get('refresh_token');
      const clientId = params.get('client_id');
      const clientSecret = params.get('client_secret');

      // Validate request
      if (clientId !== this.config.clientId || clientSecret !== this.config.clientSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client' }));
        return;
      }

      if (grantType !== 'refresh_token') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
        return;
      }

      if (!refreshToken || !refreshToken.startsWith('test_refresh_token_')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }

      // Generate new access token
      const tokenResponse: MockTokenResponse = {
        access_token: `test_access_token_refreshed_${Date.now()}`,
        refresh_token: refreshToken, // Keep same refresh token
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tokenResponse));

      console.log('[MOCK OAUTH] Refreshed tokens');
    });
  }
}
