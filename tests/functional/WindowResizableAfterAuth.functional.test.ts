// Requirements: ui.1.3, google-oauth-auth.14.3
/**
 * Functional tests for window resizable property after authentication
 * Tests that the main window is resizable after successful authentication
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';
import { AuthWindowManager } from '../../src/main/auth/AuthWindowManager';
import { OAuthClientManager } from '../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../src/main/auth/TokenStorageManager';
import { getOAuthConfig } from '../../src/main/auth/OAuthConfig';

// Mock Electron app and BrowserWindow
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
    whenReady: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    show: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    isFullScreen: jest.fn().mockReturnValue(false),
    isResizable: jest.fn().mockReturnValue(true),
    setResizable: jest.fn(),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
    setBounds: jest.fn(),
    setSize: jest.fn(),
    getTitle: jest.fn().mockReturnValue(''),
    setTitle: jest.fn(),
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      on: jest.fn(),
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
    },
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  screen: {
    getPrimaryDisplay: jest.fn().mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    }),
    getAllDisplays: jest.fn().mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Window Resizable After Auth Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;
  let authWindowManager: AuthWindowManager;
  let oauthClient: OAuthClientManager;
  let tokenStorage: TokenStorageManager;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(
      os.tmpdir(),
      `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Ensure directory exists before initializing DataManager
    fs.mkdirSync(testStoragePath, { recursive: true });

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize components
    dataManager = new DataManager(testStoragePath);
    const initResult = dataManager.initialize();
    if (!initResult.success) {
      throw new Error(`Failed to initialize DataManager: ${initResult.warning || 'Unknown error'}`);
    }

    tokenStorage = new TokenStorageManager(dataManager);
    const oauthConfig = getOAuthConfig();
    oauthClient = new OAuthClientManager(oauthConfig, tokenStorage);
    windowManager = new WindowManager(dataManager);
    authWindowManager = new AuthWindowManager(windowManager, oauthClient);
  });

  afterEach(() => {
    // Clean up test storage
    try {
      if (dataManager) {
        dataManager.close();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('Main Window After Authentication', () => {
    /* Preconditions: user is authenticated, main window is shown
       Action: check window resizable property
       Assertions: window is resizable (resizable: true)
       Requirements: ui.1.3, google-oauth-auth.14.3 */
    it('should create resizable main window after authentication', async () => {
      // Mock authenticated state
      jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({
        authorized: true,
      });

      // Initialize app (should show main window)
      await authWindowManager.initializeApp();

      // Verify BrowserWindow was created with resizable: true
      const browserWindowCalls = (BrowserWindow as unknown as jest.Mock).mock.calls;
      const lastCall = browserWindowCalls[browserWindowCalls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({
          resizable: true,
        })
      );
    });

    /* Preconditions: user completes login flow
       Action: transition from login window to main window
       Assertions: main window is resizable
       Requirements: ui.1.3, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4 */
    it('should create resizable window when transitioning from login to main', async () => {
      // Mock unauthenticated state initially
      jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({
        authorized: false,
      });

      // Initialize app (should show login window)
      await authWindowManager.initializeApp();

      // Verify login window was created
      const browserWindowCalls = (BrowserWindow as unknown as jest.Mock).mock.calls;
      expect(browserWindowCalls).toHaveLength(1);

      // Get the login window mock
      const loginWindow = (BrowserWindow as unknown as jest.Mock).mock.results[0].value;

      // Verify window was created with resizable: true in options (ui.1.3)
      // setResizable is not called explicitly because window is created with resizable: true
      const windowOptions = browserWindowCalls[0][0];
      expect(windowOptions.resizable).toBe(true);

      // Clear mocks to track window operations after auth
      jest.clearAllMocks();

      // Mock successful authentication
      jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({
        authorized: true,
      });

      // Simulate auth success
      await authWindowManager.onAuthSuccess();

      // Check if new window was created or existing window was reused
      const newBrowserWindowCalls = (BrowserWindow as unknown as jest.Mock).mock.calls;

      if (newBrowserWindowCalls.length > 0) {
        // New window was created - verify it's resizable (ui.1.3)
        const mainWindowOptions = newBrowserWindowCalls[0][0];
        expect(mainWindowOptions.resizable).toBe(true);
      } else {
        // Existing window was reused - verify it remains resizable (ui.1.3)
        expect(loginWindow.isResizable()).toBe(true);
      }
    });

    /* Preconditions: main window is shown after authentication
       Action: attempt to resize window
       Assertions: window can be resized
       Requirements: ui.1.3, google-oauth-auth.14.3 */
    it('should allow resizing main window after authentication', async () => {
      // Mock authenticated state
      jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({
        authorized: true,
      });

      // Initialize app (should show main window)
      await authWindowManager.initializeApp();

      // Get the created window
      const window = windowManager.getWindow();
      expect(window).not.toBeNull();

      // Verify window is resizable
      expect(window!.isResizable()).toBe(true);

      // Attempt to resize window
      expect(() => {
        window!.setBounds({ x: 100, y: 100, width: 1400, height: 900 });
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: window was previously configured as non-resizable
       Action: create new main window
       Assertions: new window is resizable
       Requirements: ui.1.3 */
    it('should reset resizable property when creating new window', async () => {
      // Create window and make it non-resizable
      windowManager.createWindow();
      windowManager.configureWindow({ resizable: false });

      // Close window
      windowManager.closeWindow();

      // Clear mocks
      jest.clearAllMocks();

      // Mock authenticated state
      jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({
        authorized: true,
      });

      // Initialize app (should show main window)
      await authWindowManager.initializeApp();

      // Verify new window is resizable
      const browserWindowCalls = (BrowserWindow as unknown as jest.Mock).mock.calls;
      const lastCall = browserWindowCalls[browserWindowCalls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({
          resizable: true,
        })
      );
    });
  });
});
