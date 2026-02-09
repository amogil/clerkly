// Requirements: ui.8.2
import type { NavigationManager } from './NavigationManager';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * AuthGuard protects routes from unauthorized access
 * Requirements: ui.8.2
 */
export class AuthGuard {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('AuthGuard');
  private navigationManager: NavigationManager;
  private protectedRoutes: string[] = [
    '/dashboard',
    '/settings',
    '/tasks',
    '/calendar',
    '/contacts',
  ];

  /**
   * Create a new AuthGuard
   * @param navigationManager - The NavigationManager instance for auth checks and redirects
   */
  constructor(navigationManager: NavigationManager) {
    this.navigationManager = navigationManager;
  }

  /**
   * Check if route can be activated
   * Requirements: ui.8.2
   * @param route - The route path to check (e.g., '/dashboard', '/login')
   * @returns Promise<boolean> - true if route can be accessed, false otherwise
   */
  async canActivate(route: string): Promise<boolean> {
    // Public routes are always accessible
    if (!this.isProtectedRoute(route)) {
      return true;
    }

    // Check authentication for protected routes
    const isAuthenticated = await this.navigationManager.checkAuthStatus();

    if (!isAuthenticated) {
      this.logger.info(`Access denied to protected route: ${route}`);
      this.navigationManager.redirectToLogin();
      return false;
    }

    return true;
  }

  /**
   * Check if route is protected
   * @param route - The route path to check
   * @returns boolean - true if route is protected, false otherwise
   */
  private isProtectedRoute(route: string): boolean {
    return this.protectedRoutes.some((protectedRoute) => route.startsWith(protectedRoute));
  }
}
