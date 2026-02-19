// Requirements: navigation.1.1, navigation.1.3, navigation.1.4
import type { Router } from './Router';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * NavigationManager handles navigation and redirects based on authentication status
 * Requirements: navigation.1.1, navigation.1.3, navigation.1.4
 */
export class NavigationManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('NavigationManager');
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
   * Requirements: navigation.1.1
   * @returns Promise<boolean> - true if user is authenticated, false otherwise
   */
  async checkAuthStatus(): Promise<boolean> {
    try {
      const result = await window.api.auth.getStatus();
      return result.authorized;
    } catch (error) {
      Logger.error(
        'NavigationManager',
        `[NavigationManager] Failed to check auth status: ${error}`
      );
      return false;
    }
  }

  /**
   * Redirect to login screen
   * Requirements: navigation.1.1, navigation.1.4
   */
  redirectToLogin(): void {
    this.logger.info('Redirecting to login');
    this.router.navigate('/login');
  }

  /**
   * Redirect to main screen (agents)
   * Requirements: navigation.1.3
   */
  redirectToAgents(): void {
    this.logger.info('Redirecting to agents');
    this.router.navigate('/agents');
  }

  /**
   * Initialize navigation on app startup
   * Checks authentication status and redirects accordingly
   * Requirements: navigation.1.1, navigation.1.3
   */
  async initialize(): Promise<void> {
    const isAuthenticated = await this.checkAuthStatus();

    if (!isAuthenticated) {
      // Requirements: navigation.1.1 - Show login screen when not authenticated
      this.redirectToLogin();
    } else {
      // Requirements: navigation.1.3 - If already on login screen, redirect to dashboard
      if (this.router.currentRoute === '/login') {
        this.redirectToAgents();
      }
    }
  }
}
