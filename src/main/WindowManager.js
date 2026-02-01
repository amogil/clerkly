const { BrowserWindow } = require('electron');
const path = require('path');

// Requirements: clerkly.1.2, clerkly.1.3
class WindowManager {
  // Requirements: clerkly.1.2, clerkly.1.3
  constructor() {
    this.mainWindow = null;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  createWindow() {
    // Create the browser window with native Mac OS X interface
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      // Mac OS X native appearance
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 10, y: 10 },
      vibrancy: 'under-window',
      visualEffectState: 'active',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../renderer/preload.js')
      }
    });

    // Load the index.html of the app
    this.mainWindow.loadFile('index.html');

    // Handle window close event
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  configureWindow(options) {
    if (!this.mainWindow) {
      throw new Error('Window not created. Call createWindow() first.');
    }

    // Apply configuration options
    if (options.width !== undefined || options.height !== undefined) {
      const currentSize = this.mainWindow.getSize();
      const newWidth = options.width !== undefined ? options.width : currentSize[0];
      const newHeight = options.height !== undefined ? options.height : currentSize[1];
      this.mainWindow.setSize(newWidth, newHeight);
    }

    if (options.minWidth !== undefined || options.minHeight !== undefined) {
      const currentMinSize = this.mainWindow.getMinimumSize();
      const newMinWidth = options.minWidth !== undefined ? options.minWidth : currentMinSize[0];
      const newMinHeight = options.minHeight !== undefined ? options.minHeight : currentMinSize[1];
      this.mainWindow.setMinimumSize(newMinWidth, newMinHeight);
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

    return this.mainWindow;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  closeWindow() {
    if (this.mainWindow) {
      // Remove all listeners to prevent memory leaks
      this.mainWindow.removeAllListeners();
      
      // Close the window
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.close();
      }
      
      // Clear the reference
      this.mainWindow = null;
    }
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  getWindow() {
    return this.mainWindow;
  }

  // Requirements: clerkly.1.2, clerkly.1.3
  isWindowCreated() {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed();
  }
}

module.exports = WindowManager;
