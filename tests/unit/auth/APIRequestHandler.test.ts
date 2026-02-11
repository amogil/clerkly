/* Preconditions: Mock fetch, TokenStorageManager, and BrowserWindow
   Action: Test handleAPIRequest with various scenarios
   Assertions: Correct behavior for success, 401 errors, and race conditions
   Requirements: token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5 */

import { handleAPIRequest, resetClearingFlag } from '../../../src/main/auth/APIRequestHandler';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';

// Mock electron
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(),
  },
}));

// Mock TokenStorageManager
jest.mock('../../../src/main/auth/TokenStorageManager');

describe('APIRequestHandler', () => {
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;
  let mockFetch: jest.SpyInstance;
  let mockBrowserWindow: any;

  beforeEach(() => {
    // Reset the clearing flag before each test
    resetClearingFlag();

    // Create mock token storage
    mockTokenStorage = {
      deleteTokens: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock fetch
    mockFetch = jest.spyOn(global, 'fetch');

    // Mock BrowserWindow
    mockBrowserWindow = {
      webContents: {
        send: jest.fn(),
      },
    };
    const { BrowserWindow } = require('electron');
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockBrowserWindow]);

    // Mock process.type
    Object.defineProperty(process, 'type', {
      value: 'browser',
      writable: true,
      configurable: true,
    });

    // Clear console mocks
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetClearingFlag();
  });

  /* Preconditions: fetch returns successful response (200)
     Action: call handleAPIRequest
     Assertions: returns response, clearTokens NOT called
     Requirements: token-management-ui.1.4 */
  it('should return response for successful API request', async () => {
    const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    mockFetch.mockResolvedValue(mockResponse);

    const result = await handleAPIRequest(
      'https://api.example.com/data',
      { method: 'GET' },
      mockTokenStorage,
      'Test API'
    );

    expect(result).toBe(mockResponse);
    expect(mockTokenStorage.deleteTokens).not.toHaveBeenCalled();
    expect(mockBrowserWindow.webContents.send).not.toHaveBeenCalled();
  });

  /* Preconditions: fetch returns HTTP 401
     Action: call handleAPIRequest
     Assertions: clearTokens called, auth:error event emitted, error thrown with user-friendly message
     Requirements: token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.6 */
  it('should clear tokens and emit error on HTTP 401', async () => {
    const mockResponse = new Response(null, { status: 401 });
    mockFetch.mockResolvedValue(mockResponse);

    await expect(
      handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET' },
        mockTokenStorage,
        'Test API'
      )
    ).rejects.toThrow('Your session has expired. Please sign in again.');

    expect(mockTokenStorage.deleteTokens).toHaveBeenCalledTimes(1);
    expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith('auth:error', {
      error: 'Session expired',
      errorCode: 'invalid_grant',
    });
  });

  /* Preconditions: fetch returns HTTP 401
     Action: call handleAPIRequest
     Assertions: error logged with context (URL, timestamp)
     Requirements: token-management-ui.1.5 */
  it('should log authorization error with context', async () => {
    const mockResponse = new Response(null, { status: 401 });
    mockFetch.mockResolvedValue(mockResponse);

    const consoleErrorSpy = jest.spyOn(console, 'error');

    await expect(
      handleAPIRequest(
        'https://api.example.com/userinfo',
        { method: 'GET' },
        mockTokenStorage,
        'UserInfo API'
      )
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[APIRequestHandler] Authorization error (401) from UserInfo API')
    );
  });

  /* Preconditions: fetch returns HTTP 500
     Action: call handleAPIRequest
     Assertions: clearTokens NOT called, error thrown
     Requirements: token-management-ui.1.4 */
  it('should not clear tokens for other HTTP errors', async () => {
    const mockResponse = new Response(null, { status: 500 });
    mockFetch.mockResolvedValue(mockResponse);

    const result = await handleAPIRequest(
      'https://api.example.com/data',
      { method: 'GET' },
      mockTokenStorage,
      'Test API'
    );

    expect(result.status).toBe(500);
    expect(mockTokenStorage.deleteTokens).not.toHaveBeenCalled();
    expect(mockBrowserWindow.webContents.send).not.toHaveBeenCalled();
  });

  /* Preconditions: multiple simultaneous requests return HTTP 401
     Action: call handleAPIRequest multiple times concurrently
     Assertions: clearTokens called only once, no race conditions
     Requirements: token-management-ui.1.4 */
  it('should handle multiple simultaneous 401 errors without race conditions', async () => {
    const mockResponse = new Response(null, { status: 401 });
    mockFetch.mockResolvedValue(mockResponse);

    // Make 5 simultaneous requests
    const requests = Array(5)
      .fill(null)
      .map(() =>
        handleAPIRequest(
          'https://api.example.com/data',
          { method: 'GET' },
          mockTokenStorage,
          'Test API'
        ).catch(() => {
          /* ignore errors */
        })
      );

    await Promise.all(requests);

    // Wait for the timeout to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    // clearTokens should be called only once despite multiple 401 errors
    expect(mockTokenStorage.deleteTokens).toHaveBeenCalledTimes(1);

    // auth:error event should be emitted only once (check specifically for auth:error, not all send calls)
    const authErrorCalls = (mockBrowserWindow.webContents.send as jest.Mock).mock.calls.filter(
      (call) => call[0] === 'auth:error'
    );
    expect(authErrorCalls.length).toBe(1);
  });

  /* Preconditions: fetch throws network error
     Action: call handleAPIRequest
     Assertions: error logged and re-thrown
     Requirements: token-management-ui.1.5 */
  it('should log and re-throw network errors', async () => {
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    const consoleErrorSpy = jest.spyOn(console, 'error');

    await expect(
      handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET' },
        mockTokenStorage,
        'Test API'
      )
    ).rejects.toThrow('Network error');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[APIRequestHandler] Request failed for Test API:')
    );
  });

  /* Preconditions: no context provided
     Action: call handleAPIRequest without context parameter
     Assertions: uses default context "API Request" in logs
     Requirements: token-management-ui.1.5 */
  it('should use default context when not provided', async () => {
    const mockResponse = new Response(null, { status: 401 });
    mockFetch.mockResolvedValue(mockResponse);

    const consoleErrorSpy = jest.spyOn(console, 'error');

    await expect(
      handleAPIRequest('https://api.example.com/data', { method: 'GET' }, mockTokenStorage)
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[APIRequestHandler] Authorization error (401) from API Request')
    );
  });

  describe('Automatic Token Refresh', () => {
    let mockOAuthClient: any;

    beforeEach(() => {
      // Import and mock setOAuthClientManager
      const { setOAuthClientManager } = require('../../../src/main/auth/APIRequestHandler');

      mockOAuthClient = {
        refreshAccessToken: jest.fn(),
      };

      setOAuthClientManager(mockOAuthClient);
    });

    /* Preconditions: token is expired, oauthClientManager is set
       Action: call handleAPIRequest
       Assertions: refreshAccessToken called, Authorization header updated
       Requirements: token-management-ui.1.1, token-management-ui.1.2 */
    it('should automatically refresh expired token before request', async () => {
      const expiredTokens = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      const newTokens = {
        accessToken: 'new_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStorage.loadTokens = jest
        .fn()
        .mockResolvedValueOnce(expiredTokens)
        .mockResolvedValueOnce(newTokens);

      mockOAuthClient.refreshAccessToken.mockResolvedValue(true);

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const headers = { Authorization: 'Bearer old_token' };
      await handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET', headers },
        mockTokenStorage,
        'Test API'
      );

      expect(mockOAuthClient.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(headers.Authorization).toBe('Bearer new_token');
    });

    /* Preconditions: token is expired, refresh fails
       Action: call handleAPIRequest
       Assertions: continues with expired token
       Requirements: token-management-ui.1.1, token-management-ui.1.2 */
    it('should continue with expired token if refresh fails', async () => {
      const expiredTokens = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 1000,
      };

      mockTokenStorage.loadTokens = jest.fn().mockResolvedValue(expiredTokens);
      mockOAuthClient.refreshAccessToken.mockResolvedValue(false);

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET', headers: { Authorization: 'Bearer old_token' } },
        mockTokenStorage,
        'Test API'
      );

      expect(mockOAuthClient.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(200);
    });

    /* Preconditions: token is not expired
       Action: call handleAPIRequest
       Assertions: refreshAccessToken NOT called
       Requirements: token-management-ui.1.1, token-management-ui.1.2 */
    it('should not refresh token if not expired', async () => {
      const validTokens = {
        accessToken: 'valid_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000, // Expires in 1 hour
      };

      mockTokenStorage.loadTokens = jest.fn().mockResolvedValue(validTokens);

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET', headers: { Authorization: 'Bearer valid_token' } },
        mockTokenStorage,
        'Test API'
      );

      expect(mockOAuthClient.refreshAccessToken).not.toHaveBeenCalled();
    });

    /* Preconditions: no tokens available
       Action: call handleAPIRequest
       Assertions: refreshAccessToken NOT called, request proceeds
       Requirements: token-management-ui.1.1, token-management-ui.1.2 */
    it('should not refresh if no tokens available', async () => {
      mockTokenStorage.loadTokens = jest.fn().mockResolvedValue(null);

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET' },
        mockTokenStorage,
        'Test API'
      );

      expect(mockOAuthClient.refreshAccessToken).not.toHaveBeenCalled();
    });

    /* Preconditions: token expired, headers is Headers instance
       Action: call handleAPIRequest
       Assertions: Headers instance updated correctly
       Requirements: token-management-ui.1.1, token-management-ui.1.2 */
    it('should update Headers instance with new token', async () => {
      const expiredTokens = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 1000,
      };

      const newTokens = {
        accessToken: 'new_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStorage.loadTokens = jest
        .fn()
        .mockResolvedValueOnce(expiredTokens)
        .mockResolvedValueOnce(newTokens);

      mockOAuthClient.refreshAccessToken.mockResolvedValue(true);

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const headers = new Headers({ Authorization: 'Bearer old_token' });
      await handleAPIRequest(
        'https://api.example.com/data',
        { method: 'GET', headers },
        mockTokenStorage,
        'Test API'
      );

      expect(headers.get('Authorization')).toBe('Bearer new_token');
    });
  });
});
