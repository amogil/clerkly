// Requirements: clerkly.1.2, clerkly.1.3
import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import * as path from 'path';

interface WindowOptions {
  width?: number;
  height?: number;
  title?: string;
  resizable?: boolean;
  fullscreen?: boolean;
}

/**
 * Manages the creation and configuration of the application window with native Mac OS X interface
 */
class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  /**
   * Creates window with native Mac OS X interface
   * Requirements: clerkly.1.2, clerkly.1.3
   * @returns {BrowserWindow} The created browser window instance
   * @throws {Error} If window creation fails
   */
  createWindow(): BrowserWindow {
    try {
      // Requirements: clerkly.1.3 - Native Mac OS X interface configuration
      const windowConfig: BrowserWindowConstructorOptions = {
        width: 800,
        height: 600,
        titleBarStyle: 'hiddenInset', // Native Mac OS X title bar style
        vibrancy: 'under-window', // Mac OS X vibrancy effect
        trafficLightPosition: { x: 20, y: 20 }, // Position of Mac OS X window controls
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      };

      this.mainWindow = new BrowserWindow(windowConfig);

      // Load the renderer HTML file
      const htmlPath = path.join(__dirname, '../renderer/index.html');
      this.mainWindow.loadFile(htmlPath).catch((error) => {
        console.error('Failed to load HTML file:', error);
      });

      // Clean up reference when window is closed
      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
      });

      return this.mainWindow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create window:', errorMessage);
      throw new Error(`Window creation failed: ${errorMessage}`);
    }
  }

  /**
   * Configures window parameters
   * Requirements: clerkly.1.3
   * @param {WindowOptions} options - Window configuration options
   */
  configureWindow(options: WindowOptions): void {
    if (!this.mainWindow) {
      console.warn('Cannot configure window: window not created');
      return;
    }

    try {
      // Requirements: clerkly.1.3 - Configure window parameters
      if (options.width !== undefined && options.height !== undefined) {
        this.mainWindow.setSize(options.width, options.height);
      }

      if (options.title !== undefined) {
        this.mainWindow.setTitle(options.title);
      }

      if (options.resizable !== undefined) {
        this.mainWindow.setResizable(options.resizable);
      }

      if (options.fullscreen !== undefined) {
        this.mainWindow.setFullScreen(options.fullscreen);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to configure window:', errorMessage);
    }
  }

  /**
   * Closes window with cleanup
   * Requirements: clerkly.1.3
   */
  closeWindow(): void {
    if (!this.mainWindow) {
      return;
    }

    try {
      // Requirements: clerkly.1.3 - Close window with cleanup of listeners
      this.mainWindow.removeAllListeners();
      this.mainWindow.close();
      this.mainWindow = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to close window:', errorMessage);
      // Ensure reference is cleared even if close fails
      this.mainWindow = null;
    }
  }

  /**
   * Gets current window
   * Requirements: clerkly.1.3
   * @returns {BrowserWindow | null} The current window instance or null if not created
   */
  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Checks if window is created
   * Requirements: clerkly.1.3
   * @returns {boolean} True if window exists, false otherwise
   */
  isWindowCreated(): boolean {
    return this.mainWindow !== null;
  }
}

export default WindowManager;
