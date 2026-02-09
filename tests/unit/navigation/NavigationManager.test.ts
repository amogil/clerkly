/* Preconditions: NavigationManager created with mocked Router and window.api.auth
   Action: call checkAuthStatus(), redirectToLogin(), redirectToDashboard(), initialize()
   Assertions: correct behavior for each method based on auth status
   Requirements: ui.8.1, ui.8.3, ui.8.4 */

import { NavigationManager } from '../../../src/renderer/navigation/NavigationManager';
import type { Router } from '../../../src/renderer/navigation/Router';

// Mock window.api.auth
const mockGetStatus = jest.fn();
global.window = {
  api: {
    auth: {
      getStatus: mockGetStatus,
    },
  },
} as any;

describe('NavigationManager', () => {
  let mockRouter: jest.Mocked<Router>;
  let navigationManager: NavigationManager;

  beforeEach(() => {
    // Create mock router
    mockRouter = {
      navigate: jest.fn(),
      currentRoute: '/dashboard',
    } as any;

    navigationManager = new NavigationManager(mockRouter);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('checkAuthStatus', () => {
    /* Preconditions: window.api.auth.getStatus() returns authorized: true
       Action: call checkAuthStatus()
       Assertions: returns true
       Requirements: ui.8.1 */
    it('should return true when user is authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });

      const result = await navigationManager.checkAuthStatus();

      expect(result).toBe(true);
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: window.api.auth.getStatus() returns authorized: false
       Action: call checkAuthStatus()
       Assertions: returns false
       Requirements: ui.8.1 */
    it('should return false when user is not authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: false });

      const result = await navigationManager.checkAuthStatus();

      expect(result).toBe(false);
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: window.api.auth.getStatus() throws error
       Action: call checkAuthStatus()
       Assertions: returns false, error logged
       Requirements: ui.8.1 */
    it('should return false and log error when getStatus fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockGetStatus.mockRejectedValue(new Error('Auth check failed'));

      const result = await navigationManager.checkAuthStatus();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Failed to check auth status:')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('redirectToLogin', () => {
    /* Preconditions: NavigationManager created
       Action: call redirectToLogin()
       Assertions: router.navigate() called with '/login', message logged
       Requirements: ui.8.1, ui.8.4 */
    it('should navigate to login route', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      navigationManager.redirectToLogin();

      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Redirecting to login')
      );

      consoleInfoSpy.mockRestore();
    });
  });

  describe('redirectToDashboard', () => {
    /* Preconditions: NavigationManager created
       Action: call redirectToDashboard()
       Assertions: router.navigate() called with '/dashboard', message logged
       Requirements: ui.8.3 */
    it('should navigate to dashboard route', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      navigationManager.redirectToDashboard();

      expect(mockRouter.navigate).toHaveBeenCalledWith('/dashboard');
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Redirecting to dashboard')
      );

      consoleInfoSpy.mockRestore();
    });
  });

  describe('initialize', () => {
    /* Preconditions: user not authorized, current route is '/dashboard'
       Action: call initialize()
       Assertions: redirectToLogin() called
       Requirements: ui.8.1 */
    it('should redirect to login when user is not authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: false });
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Redirecting to login')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: user authorized, current route is '/login'
       Action: call initialize()
       Assertions: redirectToDashboard() called
       Requirements: ui.8.3 */
    it('should redirect to dashboard when user is authorized and on login screen', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });
      Object.defineProperty(mockRouter, 'currentRoute', {
        get: () => '/login',
        configurable: true,
      });
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).toHaveBeenCalledWith('/dashboard');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Redirecting to dashboard')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: user authorized, current route is '/dashboard'
       Action: call initialize()
       Assertions: no navigation occurs (stays on dashboard)
       Requirements: ui.8.1, ui.8.3 */
    it('should not redirect when user is authorized and not on login screen', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });
      Object.defineProperty(mockRouter, 'currentRoute', {
        get: () => '/dashboard',
        configurable: true,
      });

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    /* Preconditions: user authorized, current route is '/settings'
       Action: call initialize()
       Assertions: no navigation occurs (stays on settings)
       Requirements: ui.8.1, ui.8.3 */
    it('should not redirect when user is authorized and on other protected route', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });
      Object.defineProperty(mockRouter, 'currentRoute', {
        get: () => '/settings',
        configurable: true,
      });

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    /* Preconditions: auth check fails (throws error)
       Action: call initialize()
       Assertions: redirectToLogin() called (treats as not authorized)
       Requirements: ui.8.1 */
    it('should redirect to login when auth check fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      mockGetStatus.mockRejectedValue(new Error('Auth check failed'));

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Failed to check auth status:')
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Redirecting to login')
      );

      consoleErrorSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });
  });
});
