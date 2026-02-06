// Requirements: ui.8.1, ui.8.2, ui.8.3, ui.8.4

/**
 * Router interface for navigation management
 * Provides abstraction over the navigation mechanism
 */
export interface Router {
  /**
   * Navigate to a specific route
   * @param route - The route path to navigate to (e.g., '/login', '/dashboard')
   */
  navigate(route: string): void;

  /**
   * Get the current route
   * @returns The current route path
   */
  readonly currentRoute: string;
}

/**
 * Simple router implementation using state-based navigation
 * Requirements: ui.8.1, ui.8.2, ui.8.3, ui.8.4
 */
export class SimpleRouter implements Router {
  private _currentRoute: string;
  private onNavigateCallback: (route: string) => void;

  /**
   * Create a new SimpleRouter
   * @param initialRoute - The initial route to start with
   * @param onNavigate - Callback function to handle navigation changes
   */
  constructor(initialRoute: string, onNavigate: (route: string) => void) {
    this._currentRoute = initialRoute;
    this.onNavigateCallback = onNavigate;
  }

  /**
   * Navigate to a specific route
   * Requirements: ui.8.1, ui.8.3, ui.8.4
   */
  navigate(route: string): void {
    this._currentRoute = route;
    this.onNavigateCallback(route);
  }

  /**
   * Get the current route
   * Requirements: ui.8.1, ui.8.2
   */
  get currentRoute(): string {
    return this._currentRoute;
  }

  /**
   * Update the current route without triggering navigation
   * Used when route changes externally
   */
  updateCurrentRoute(route: string): void {
    this._currentRoute = route;
  }
}
