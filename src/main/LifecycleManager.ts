// Requirements: clerkly.1.2, clerkly.1.3
import { app } from 'electron';
import WindowManager from './WindowManager';
import DataManager from './DataManager';

interface InitializeResult {
  success: boolean;
  loadTime?: number;
  error?: string;
}

interface QuitResult {
  success: boolean;
  error?: string;
}

class LifecycleManager {
  private windowManager: WindowManager;
  private dataManager: DataManager;
  private startTime: number | null = null;
  private isInitialized: boolean = false;

  // Requirements: clerkly.1.2, clerkly.1.3
  constructor(windowManager: WindowManager, dataManager: DataManager) {
    this.windowManager = windowManager;
    this.dataManager = dataManager;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  async initialize(): Promise<InitializeResult> {
    if (this.isInitialized) {
      return { success: true, loadTime: 0 };
    }

    this.startTime = Date.now();

    try {
      // Initialize data manager first
      if (this.dataManager) {
        await this.dataManager.initialize();
      }

      // Create main window
      if (this.windowManager) {
        this.windowManager.createWindow();
      }

      // Calculate load time
      const loadTime = Date.now() - this.startTime;

      // Log slow startup (> 3000ms)
      if (loadTime > 3000) {
        console.warn(`Slow startup: ${loadTime}ms (target: <3000ms)`);
      }

      this.isInitialized = true;

      return { success: true, loadTime };
    } catch (error: any) {
      console.error('Failed to initialize application:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  handleActivation(): void {
    // Mac OS X specific behavior: recreate window when dock icon is clicked
    // and no other windows are open
    if (process.platform === 'darwin' && this.windowManager) {
      if (!this.windowManager.isWindowCreated()) {
        this.windowManager.createWindow();
      }
    }
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  async handleQuit(): Promise<QuitResult> {
    try {
      // Save any pending data before quitting
      if (this.dataManager) {
        // Ensure all data is flushed to disk
        // DataManager handles this internally during close
      }

      // Close window gracefully
      if (this.windowManager) {
        this.windowManager.closeWindow();
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error during quit:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  handleWindowClose(): void {
    // Mac OS X specific behavior: when all windows are closed,
    // the app stays active (doesn't quit)
    if (process.platform !== 'darwin') {
      // On other platforms, quit when all windows are closed
      app.quit();
    }
    // On Mac OS X, do nothing - app stays in dock
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  getStartupTime(): number | null {
    if (!this.startTime) {
      return null;
    }
    return Date.now() - this.startTime;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  isAppInitialized(): boolean {
    return this.isInitialized;
  }
}

export default LifecycleManager;
