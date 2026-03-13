/* Preconditions: AuthGuard created with mocked NavigationManager
   Action: call canActivate() with various routes
   Assertions: correct access control based on auth status and route type
   Requirements: navigation.1.2 */

import { AuthGuard } from '../../../src/renderer/navigation/AuthGuard';
import { NavigationManager } from '../../../src/renderer/navigation/NavigationManager';

describe('AuthGuard', () => {
  let mockNavigationManager: jest.Mocked<NavigationManager>;
  let authGuard: AuthGuard;

  beforeEach(() => {
    // Create mock NavigationManager
    mockNavigationManager = {
      checkAuthStatus: jest.fn(),
      redirectToLogin: jest.fn(),
      redirectToAgents: jest.fn(),
      initialize: jest.fn(),
    } as any;

    authGuard = new AuthGuard(mockNavigationManager);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    /* Preconditions: public route '/login'
       Action: call canActivate('/login')
       Assertions: returns true without checking auth
       Requirements: navigation.1.1 */
    it('should allow access to public routes without auth check', async () => {
      const result = await authGuard.canActivate('/login');

      expect(result).toBe(true);
      expect(mockNavigationManager.checkAuthStatus).not.toHaveBeenCalled();
      expect(mockNavigationManager.redirectToLogin).not.toHaveBeenCalled();
    });

    /* Preconditions: protected route '/dashboard', user not authorized
       Action: call canActivate('/dashboard')
       Assertions: returns false, redirects to login
       Requirements: navigation.1.2 */
    it('should block access to protected routes when not authorized', async () => {
      mockNavigationManager.checkAuthStatus.mockResolvedValue(false);

      const result = await authGuard.canActivate('/dashboard');

      expect(result).toBe(false);
      expect(mockNavigationManager.checkAuthStatus).toHaveBeenCalledTimes(1);
      expect(mockNavigationManager.redirectToLogin).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: protected route '/dashboard', user authorized
       Action: call canActivate('/dashboard')
       Assertions: returns true, no redirect
       Requirements: navigation.1.2 */
    it('should allow access to protected routes when authorized', async () => {
      mockNavigationManager.checkAuthStatus.mockResolvedValue(true);

      const result = await authGuard.canActivate('/dashboard');

      expect(result).toBe(true);
      expect(mockNavigationManager.checkAuthStatus).toHaveBeenCalledTimes(1);
      expect(mockNavigationManager.redirectToLogin).not.toHaveBeenCalled();
    });

    /* Preconditions: various protected routes
       Action: call canActivate() for each route
       Assertions: all protected routes are correctly identified
       Requirements: navigation.1.2 */
    it('should correctly identify all protected routes', async () => {
      mockNavigationManager.checkAuthStatus.mockResolvedValue(true);

      const protectedRoutes = ['/dashboard', '/settings', '/tasks', '/calendar', '/contacts'];

      for (const route of protectedRoutes) {
        await authGuard.canActivate(route);
      }

      // Should check auth for all protected routes
      expect(mockNavigationManager.checkAuthStatus).toHaveBeenCalledTimes(protectedRoutes.length);
    });

    /* Preconditions: route with protected prefix
       Action: call canActivate('/dashboard/sub-route')
       Assertions: treated as protected route
       Requirements: navigation.1.2 */
    it('should treat routes starting with protected prefix as protected', async () => {
      mockNavigationManager.checkAuthStatus.mockResolvedValue(false);

      const result = await authGuard.canActivate('/dashboard/sub-route');

      expect(result).toBe(false);
      expect(mockNavigationManager.checkAuthStatus).toHaveBeenCalledTimes(1);
      expect(mockNavigationManager.redirectToLogin).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: non-protected route
       Action: call canActivate('/unknown')
       Assertions: treated as public route
       Requirements: navigation.1.1 */
    it('should treat unknown routes as public', async () => {
      const result = await authGuard.canActivate('/unknown');

      expect(result).toBe(true);
      expect(mockNavigationManager.checkAuthStatus).not.toHaveBeenCalled();
    });
  });
});
