// Requirements: clerkly.1, clerkly.nfr.1, clerkly.nfr.2, account-profile.1.5, clerkly.3.8, database-refactoring.3.5

import WindowManager from './WindowManager';
import { DatabaseManager } from './DatabaseManager';
import { OAuthClientManager } from './auth/OAuthClientManager';
import { UserManager } from './auth/UserManager';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Initialize result
 */
export interface InitializeResult {
  success: boolean;
  loadTime: number;
}

/**
 * Manages application lifecycle including startup, activation, and shutdown
 * Requirements: clerkly.1, clerkly.nfr.1, clerkly.nfr.2, account-profile.1.5, database-refactoring.3.5
 */
export class LifecycleManager {
  private windowManager: WindowManager;
  private dbManager: DatabaseManager;
  private oauthClient: OAuthClientManager;
  private userManager: UserManager;
  private startTime: number | null = null;
  private initialized: boolean = false;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('LifecycleManager');

  /**
   * Constructor
   * Requirements: database-refactoring.3.5 - Use DatabaseManager for DB lifecycle
   */
  constructor(
    windowManager: WindowManager,
    dbManager: DatabaseManager,
    oauthClient: OAuthClientManager,
    userManager: UserManager
  ) {
    this.windowManager = windowManager;
    this.dbManager = dbManager;
    this.oauthClient = oauthClient;
    // Requirements: account-profile.1.5 - Use provided UserManager
    this.userManager = userManager;
  }

  /**
   * Initializes the application
   * Ensures startup in less than 3 seconds
   * Requirements: clerkly.1, clerkly.nfr.1, account-profile.1.5, database-refactoring.3.5
   * @returns {Promise<InitializeResult>}
   */
  async initialize(): Promise<InitializeResult> {
    const startTime = Date.now();
    this.startTime = startTime;

    try {
      // Database is already initialized by DatabaseManager before LifecycleManager is created
      // Requirements: database-refactoring.3.5 - DatabaseManager handles DB initialization

      // Create application window
      this.windowManager.createWindow();

      // Requirements: account-profile.1.5 - Fetch profile on startup if authenticated
      const authStatus = await this.oauthClient.getAuthStatus();
      if (authStatus.authorized) {
        this.logger.info('User authenticated, fetching profile');
        await this.userManager.fetchProfile();
      } else {
        this.logger.info('User not authenticated, skipping profile fetch');
      }

      this.initialized = true;

      const loadTime = Date.now() - startTime;

      // Warn about slow startup (> 3 seconds)
      if (loadTime > 3000) {
        this.logger.warn(`Slow startup: ${loadTime}ms (target: <3000ms)`);
      }

      return {
        success: true,
        loadTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize application: ${errorMessage}`);
      throw new Error(`Application initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Handles application activation (Mac OS X specific)
   * Recreates window when dock icon is clicked
   * Requirements: clerkly.1, clerkly.nfr.3   */
  handleActivation(): void {
    try {
      // Mac OS X specific: recreate window on activation if closed
      if (!this.windowManager.isWindowCreated()) {
        this.windowManager.createWindow();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle activation: ${errorMessage}`);
    }
  }

  /**
   * Gracefully shuts down the application
   * Saves all data before exit
   * Requirements: clerkly.1, clerkly.nfr.2   * @returns {Promise<void>}
   */
  async handleQuit(): Promise<void> {
    try {
      // 5 second timeout for graceful shutdown
      const shutdownPromise = this.performShutdown();

      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Shutdown timeout exceeded')), 5000);
        timeoutId.unref();
      });

      try {
        await Promise.race([shutdownPromise, timeoutPromise]);
      } finally {
        // Clear timer if shutdown completed first
        clearTimeout(timeoutId!);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error during shutdown: ${errorMessage}`);
      // Continue shutdown even on errors
    }
  }

  /**
   * Performs application shutdown procedure
   * Requirements: clerkly.nfr.2, database-refactoring.3.5
   * @private
   */
  private async performShutdown(): Promise<void> {
    // Close window
    if (this.windowManager.isWindowCreated()) {
      this.windowManager.closeWindow();
    }

    // Close database connection via DatabaseManager
    // Requirements: database-refactoring.3.5 - DatabaseManager handles DB lifecycle
    this.dbManager.close();

    this.initialized = false;
  }

  /**
   * Handles closing of all windows
   * Mac OS X: application remains active
   * Requirements: clerkly.1, clerkly.nfr.3   */
  handleWindowClose(): void {
    // Mac OS X specific: application remains active when window is closed
    // Don't quit the app, only clear window reference
    // Window will be recreated on activation via handleActivation()
  }

  /**
   * Returns startup time
   * Requirements: clerkly.nfr.1   * @returns {number | null}
   */
  getStartupTime(): number | null {
    return this.startTime;
  }

  /**
   * Checks if application is initialized
   * Requirements: clerkly.1   * @returns {boolean}
   */
  isAppInitialized(): boolean {
    return this.initialized;
  }
}
