/* Preconditions: Mock fetch, TokenStorageManager, and BrowserWindow
   Action: Test handleAPIRequest with various scenarios
   Assertions: Correct behavior for success, 401 errors, and race conditions
   Requirements: ui.9.3, ui.9.4, ui.9.5 */

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
     Requirements: ui.9.4 */
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
     Assertions: clearTokens called, auth:error event emitted, error thrown
     Requirements: ui.9.3, ui.9.4 */
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
    ).rejects.toThrow('Authorization failed: Session expired (HTTP 401)');

    expect(mockTokenStorage.deleteTokens).toHaveBeenCalledTimes(1);
    expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith('auth:error', {
      error: 'Session expired',
      errorCode: 'invalid_grant',
    });
  });

  /* Preconditions: fetch returns HTTP 401
     Action: call handleAPIRequest
     Assertions: error logged with context (URL, timestamp)
     Requirements: ui.9.5 */
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
     Requirements: ui.9.4 */
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
     Requirements: ui.9.4 */
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

    // auth:error event should be emitted only once
    expect(mockBrowserWindow.webContents.send).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: fetch throws network error
     Action: call handleAPIRequest
     Assertions: error logged and re-thrown
     Requirements: ui.9.5 */
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
     Requirements: ui.9.5 */
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
});
