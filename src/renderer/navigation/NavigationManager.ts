// Requirements: ui.8.1, ui.8.3, ui.8.4
import type { Router } from './Router';

/**
 * NavigationManager handles navigation and redirects based on authentication status
 * Requirements: ui.8.1, ui.8.3, ui.8.4
 */
export class NavigationManager {
  private router: Router;

  /**
   * Create a new NavigationManager
   * @param router - The router instance to use for navigation
   */
  constructor(router: Router) {
    this.router = router;
  }

  /**
   * Check authentication status
   * Requirements: ui.8.1
   * @returns Promise<boolean> - true if user is authenticated, false otherwise
   */
  async checkAuthStatus(): Promise<boolean> {
    try {
      const result = await window.api.auth.getStatus();
      return result.authorized;
    } catch (error) {
      console.error('[NavigationManager] Failed to check auth status:', error);
      return false;
    }
  }

  /**
   * Redirect to login screen
   * Requirements: ui.8.1, ui.8.4
   */
  redirectToLogin(): void {
    console.log('[NavigationManager] Redirecting to login');
    this.router.navigate('/login');
  }

  /**
   * Redirect to dashboard
   * Requirements: ui.8.3
   */
  redirectToDashboard(): void {
    console.log('[NavigationManager] Redirecting to dashboard');
    this.router.navigate('/dashboard');
  }

  /**
   * Initialize navigation on app startup
   * Checks authentication status and redirects accordingly
   * Requirements: ui.8.1, ui.8.3
   */
  async initialize(): Promise<void> {
    const isAuthenticated = await this.checkAuthStatus();

    if (!isAuthenticated) {
      // Requirements: ui.8.1 - Show login screen when not authenticated
      this.redirectToLogin();
    } else {
      // Requirements: ui.8.3 - If already on login screen, redirect to dashboard
      if (this.router.currentRoute === '/login') {
        this.redirectToDashboard();
      }
    }
  }
}
