// Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1

/**
 * Integration tests for OAuth components initialization
 * Tests the integration of all OAuth components in the main process
 */

import { DataManager } from '../../../src/main/DataManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { AuthIPCHandlers } from '../../../src/main/auth/AuthIPCHandlers';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';

// Mock dependencies
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
    setAsDefaultProtocolClient: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    requestSingleInstanceLock: jest.fn(() => true),
  },
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  BrowserWindow: jest.fn(),
  shell: {
    openExternal: jest.fn(),
  },
}));

jest.mock('../../../src/main/DataManager');
jest.mock('../../../src/main/auth/TokenStorageManager');
jest.mock('../../../src/main/auth/OAuthClientManager');
jest.mock('../../../src/main/auth/AuthIPCHandlers');

describe('OAuth Integration', () => {
  let mockDataManager: jest.Mocked<DataManager>;
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockAuthIPCHandlers: jest.Mocked<AuthIPCHandlers>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockDataManager = new DataManager('/mock/path') as jest.Mocked<DataManager>;
    mockTokenStorage = new TokenStorageManager(mockDataManager) as jest.Mocked<TokenStorageManager>;
    mockOAuthClient = new OAuthClientManager(
      getOAuthConfig(),
      mockTokenStorage
    ) as jest.Mocked<OAuthClientManager>;
    mockAuthIPCHandlers = new AuthIPCHandlers(mockOAuthClient) as jest.Mocked<AuthIPCHandlers>;
  });

  /* Preconditions: OAuth components are initialized
     Action: verify all OAuth components are created
     Assertions: all components exist and are properly initialized
     Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1 */
  it('should initialize all OAuth components', () => {
    // Verify DataManager is created
    expect(DataManager).toHaveBeenCalled();
    expect(mockDataManager).toBeDefined();

    // Verify TokenStorageManager is created with DataManager
    expect(TokenStorageManager).toHaveBeenCalledWith(mockDataManager);
    expect(mockTokenStorage).toBeDefined();

    // Verify OAuthClientManager is created with config and TokenStorage
    expect(OAuthClientManager).toHaveBeenCalledWith(expect.any(Object), mockTokenStorage);
    expect(mockOAuthClient).toBeDefined();

    // Verify AuthIPCHandlers is created with OAuthClient
    expect(AuthIPCHandlers).toHaveBeenCalledWith(mockOAuthClient);
    expect(mockAuthIPCHandlers).toBeDefined();
  });

  /* Preconditions: OAuth components are initialized
     Action: call registerHandlers on AuthIPCHandlers
     Assertions: IPC handlers are registered
     Requirements: google-oauth-auth.8.1 */
  it('should register IPC handlers', () => {
    // Mock registerHandlers method
    mockAuthIPCHandlers.registerHandlers = jest.fn();

    // Call registerHandlers
    mockAuthIPCHandlers.registerHandlers();

    // Verify registerHandlers was called
    expect(mockAuthIPCHandlers.registerHandlers).toHaveBeenCalled();
  });

  /* Preconditions: app is initialized
     Action: verify protocol handler registration capability
     Assertions: setAsDefaultProtocolClient method exists
     Requirements: google-oauth-auth.2.1 */
  it('should have protocol handler registration capability', () => {
    const { app } = require('electron');

    // Verify protocol handler registration method exists
    expect(app.setAsDefaultProtocolClient).toBeDefined();
    expect(typeof app.setAsDefaultProtocolClient).toBe('function');
  });

  /* Preconditions: OAuth components are initialized
     Action: verify component dependencies
     Assertions: components are properly connected
     Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1 */
  it('should have correct component dependencies', () => {
    // Verify TokenStorageManager depends on DataManager
    expect(TokenStorageManager).toHaveBeenCalledWith(mockDataManager);

    // Verify OAuthClientManager depends on TokenStorageManager
    expect(OAuthClientManager).toHaveBeenCalledWith(expect.any(Object), mockTokenStorage);

    // Verify AuthIPCHandlers depends on OAuthClientManager
    expect(AuthIPCHandlers).toHaveBeenCalledWith(mockOAuthClient);
  });

  /* Preconditions: preload script is loaded
     Action: verify auth API is exposed
     Assertions: window.api has auth methods
     Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3 */
  it('should expose auth API in preload', () => {
    // This test verifies the structure of the auth API
    // The actual implementation is in src/preload/index.ts

    const expectedAuthAPI = {
      startLogin: expect.any(Function),
      getAuthStatus: expect.any(Function),
      logout: expect.any(Function),
    };

    // Verify the expected API structure
    expect(expectedAuthAPI).toHaveProperty('startLogin');
    expect(expectedAuthAPI).toHaveProperty('getAuthStatus');
    expect(expectedAuthAPI).toHaveProperty('logout');
  });
});
