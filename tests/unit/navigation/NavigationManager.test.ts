/**
 * @jest-environment node
 */

/* Preconditions: NavigationManager created with mocked Router and window.api.auth
   Action: call checkAuthStatus(), redirectToLogin(), redirectToAgents(), initialize()
   Assertions: correct behavior for each method based on auth status
   Requirements: navigation.1.1, navigation.1.3, navigation.1.4 */

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
       Requirements: navigation.1.1 */
    it('should return true when user is authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });

      const result = await navigationManager.checkAuthStatus();

      expect(result).toBe(true);
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: window.api.auth.getStatus() returns authorized: false
       Action: call checkAuthStatus()
       Assertions: returns false
       Requirements: navigation.1.1 */
    it('should return false when user is not authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: false });

      const result = await navigationManager.checkAuthStatus();

      expect(result).toBe(false);
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: window.api.auth.getStatus() throws error
       Action: call checkAuthStatus()
       Assertions: returns false, error logged
       Requirements: navigation.1.1 */
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
       Assertions: router.navigate() called with '/login'
       Requirements: navigation.1.1, navigation.1.4 */
    it('should navigate to login route', () => {
      navigationManager.redirectToLogin();

      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('redirectToAgents', () => {
    /* Preconditions: NavigationManager created
       Action: call redirectToAgents()
       Assertions: router.navigate() called with '/agents'
       Requirements: navigation.1.3 */
    it('should navigate to agents route', () => {
      navigationManager.redirectToAgents();

      expect(mockRouter.navigate).toHaveBeenCalledWith('/agents');
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('initialize', () => {
    /* Preconditions: user not authorized, current route is '/dashboard'
       Action: call initialize()
       Assertions: redirectToLogin() called
       Requirements: navigation.1.1 */
    it('should redirect to login when user is not authorized', async () => {
      mockGetStatus.mockResolvedValue({ authorized: false });

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
    });

    /* Preconditions: user authorized, current route is '/login'
       Action: call initialize()
       Assertions: redirectToAgents() called
       Requirements: navigation.1.3 */
    it('should redirect to agents when user is authorized and on login screen', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });
      Object.defineProperty(mockRouter, 'currentRoute', {
        get: () => '/login',
        configurable: true,
      });

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).toHaveBeenCalledWith('/agents');
    });

    /* Preconditions: user authorized, current route is '/agents'
       Action: call initialize()
       Assertions: no navigation occurs (stays on agents)
       Requirements: navigation.1.1, navigation.1.3 */
    it('should not redirect when user is authorized and not on login screen', async () => {
      mockGetStatus.mockResolvedValue({ authorized: true });
      Object.defineProperty(mockRouter, 'currentRoute', {
        get: () => '/agents',
        configurable: true,
      });

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    /* Preconditions: user authorized, current route is '/settings'
       Action: call initialize()
       Assertions: no navigation occurs (stays on settings)
       Requirements: navigation.1.1, navigation.1.3 */
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
       Requirements: navigation.1.1 */
    it('should redirect to login when auth check fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockGetStatus.mockRejectedValue(new Error('Auth check failed'));

      await navigationManager.initialize();

      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NavigationManager] Failed to check auth status:')
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith('/login');

      consoleErrorSpy.mockRestore();
    });
  });
});
