// Requirements: clerkly.2.1, clerkly.2.5
// Mock implementation of Electron API for testing

/**
 * Mock BrowserWindow class
 * Simulates Electron's BrowserWindow for testing window management
 */
class BrowserWindow {
  constructor(options = {}) {
    this.options = options;
    this._isDestroyed = false;
    this.webContents = {
      on: jest.fn(),
      send: jest.fn(),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest.fn(() => false),
      session: {
        clearCache: jest.fn((callback) => callback()),
        clearStorageData: jest.fn()
      }
    };
    this.listeners = {};
  }

  loadFile(filePath) {
    this.loadedFile = filePath;
    return Promise.resolve();
  }

  loadURL(url) {
    this.loadedURL = url;
    return Promise.resolve();
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  once(event, callback) {
    this.on(event, callback);
  }

  removeListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(...args));
    }
  }

  close() {
    this.emit('close');
    this._isDestroyed = true;
  }

  destroy() {
    this._isDestroyed = true;
  }

  show() {
    this.isVisible = true;
  }

  hide() {
    this.isVisible = false;
  }

  focus() {
    this.isFocused = true;
  }

  setTitle(title) {
    this.title = title;
  }

  getTitle() {
    return this.title || '';
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  getBounds() {
    return this.bounds || { x: 0, y: 0, width: 800, height: 600 };
  }

  setSize(width, height) {
    if (!this.bounds) this.bounds = { x: 0, y: 0, width: 800, height: 600 };
    this.bounds.width = width;
    this.bounds.height = height;
  }

  getSize() {
    const bounds = this.getBounds();
    return [bounds.width, bounds.height];
  }

  setMinimumSize(width, height) {
    this.minWidth = width;
    this.minHeight = height;
  }

  getMinimumSize() {
    return [this.minWidth || 0, this.minHeight || 0];
  }

  setResizable(resizable) {
    this.resizable = resizable;
  }

  setFullScreen(fullscreen) {
    this.fullscreen = fullscreen;
  }

  removeAllListeners() {
    this.listeners = {};
  }

  isDestroyed() {
    return this._isDestroyed || false;
  }

  static getAllWindows() {
    return BrowserWindow._windows || [];
  }

  static getFocusedWindow() {
    return BrowserWindow._focusedWindow || null;
  }
}

BrowserWindow._windows = [];
BrowserWindow._focusedWindow = null;

/**
 * Mock App class
 * Simulates Electron's app module for testing application lifecycle
 */
const app = {
  listeners: {},
  isReady: false,
  isQuitting: false,
  name: 'Clerkly',
  version: '1.0.0',

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  },

  once(event, callback) {
    this.on(event, callback);
    return this;
  },

  removeListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    return this;
  },

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(...args));
    }
  },

  whenReady() {
    return new Promise((resolve) => {
      if (this.isReady) {
        resolve();
      } else {
        this.once('ready', resolve);
      }
    });
  },

  quit() {
    this.isQuitting = true;
    this.emit('before-quit');
    this.emit('will-quit');
    this.emit('quit');
  },

  exit(code = 0) {
    this.quit();
    process.exit(code);
  },

  getPath(name) {
    const paths = {
      home: '/mock/home',
      appData: '/mock/appData',
      userData: '/mock/userData',
      temp: '/mock/temp',
      exe: '/mock/exe',
      module: '/mock/module',
      desktop: '/mock/desktop',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      music: '/mock/music',
      pictures: '/mock/pictures',
      videos: '/mock/videos',
      logs: '/mock/logs'
    };
    return paths[name] || '/mock/path';
  },

  getVersion() {
    return this.version;
  },

  getName() {
    return this.name;
  },

  setName(name) {
    this.name = name;
  },

  isPackaged: false,

  getAppPath() {
    return '/mock/app/path';
  },

  requestSingleInstanceLock() {
    return true;
  },

  hasSingleInstanceLock() {
    return true;
  },

  releaseSingleInstanceLock() {
    // Mock implementation
  }
};

/**
 * Mock IPC Main
 * Simulates Electron's ipcMain for testing IPC communication
 */
const ipcMain = {
  handlers: {},
  listeners: {},

  handle(channel, handler) {
    this.handlers[channel] = handler;
  },

  handleOnce(channel, handler) {
    this.handle(channel, handler);
  },

  removeHandler(channel) {
    delete this.handlers[channel];
  },

  on(channel, listener) {
    if (!this.listeners[channel]) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(listener);
  },

  once(channel, listener) {
    this.on(channel, listener);
  },

  removeListener(channel, listener) {
    if (this.listeners[channel]) {
      this.listeners[channel] = this.listeners[channel].filter(l => l !== listener);
    }
  },

  removeAllListeners(channel) {
    if (channel) {
      delete this.listeners[channel];
    } else {
      this.listeners = {};
    }
  },

  // Helper method for testing - simulate IPC call
  async _invokeHandler(channel, event, ...args) {
    if (this.handlers[channel]) {
      return await this.handlers[channel](event, ...args);
    }
    throw new Error(`No handler registered for channel: ${channel}`);
  },

  // Helper method for testing - simulate IPC event
  _emitEvent(channel, event, ...args) {
    if (this.listeners[channel]) {
      this.listeners[channel].forEach(listener => listener(event, ...args));
    }
  }
};

/**
 * Mock IPC Renderer
 * Simulates Electron's ipcRenderer for testing renderer process communication
 */
const ipcRenderer = {
  listeners: {},

  send(channel, ...args) {
    // Mock implementation - in real tests, this would communicate with ipcMain
  },

  invoke(channel, ...args) {
    // Mock implementation - in real tests, this would call ipcMain handlers
    return Promise.resolve();
  },

  on(channel, listener) {
    if (!this.listeners[channel]) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(listener);
    return this;
  },

  once(channel, listener) {
    this.on(channel, listener);
    return this;
  },

  removeListener(channel, listener) {
    if (this.listeners[channel]) {
      this.listeners[channel] = this.listeners[channel].filter(l => l !== listener);
    }
    return this;
  },

  removeAllListeners(channel) {
    if (channel) {
      delete this.listeners[channel];
    } else {
      this.listeners = {};
    }
    return this;
  },

  // Helper method for testing - simulate receiving message from main
  _simulateMessage(channel, event, ...args) {
    if (this.listeners[channel]) {
      this.listeners[channel].forEach(listener => listener(event, ...args));
    }
  }
};

/**
 * Mock shell module
 * Simulates Electron's shell for testing external operations
 */
const shell = {
  openExternal: jest.fn((url) => Promise.resolve()),
  openPath: jest.fn((path) => Promise.resolve('')),
  showItemInFolder: jest.fn(),
  moveItemToTrash: jest.fn(() => true),
  beep: jest.fn(),
  writeShortcutLink: jest.fn(() => true),
  readShortcutLink: jest.fn(() => ({}))
};

/**
 * Mock dialog module
 * Simulates Electron's dialog for testing user interactions
 */
const dialog = {
  showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
  showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
  showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
  showErrorBox: jest.fn(),
  showCertificateTrustDialog: jest.fn(() => Promise.resolve())
};

/**
 * Mock Menu module
 * Simulates Electron's Menu for testing application menus
 */
class Menu {
  constructor() {
    this.items = [];
  }

  static buildFromTemplate(template) {
    const menu = new Menu();
    menu.items = template;
    return menu;
  }

  static setApplicationMenu(menu) {
    Menu._applicationMenu = menu;
  }

  static getApplicationMenu() {
    return Menu._applicationMenu || null;
  }

  append(menuItem) {
    this.items.push(menuItem);
  }

  insert(pos, menuItem) {
    this.items.splice(pos, 0, menuItem);
  }

  popup(options) {
    // Mock implementation
  }

  closePopup(browserWindow) {
    // Mock implementation
  }
}

/**
 * Mock MenuItem class
 * Simulates Electron's MenuItem for testing menu items
 */
class MenuItem {
  constructor(options) {
    Object.assign(this, options);
  }
}

/**
 * Mock Notification class
 * Simulates Electron's Notification for testing notifications
 */
class Notification {
  constructor(options) {
    this.options = options;
    this.listeners = {};
  }

  show() {
    this.isShown = true;
  }

  close() {
    this.isShown = false;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  static isSupported() {
    return true;
  }
}

/**
 * Mock nativeTheme module
 * Simulates Electron's nativeTheme for testing theme settings
 */
const nativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system',
  listeners: {},

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
};

/**
 * Reset all mocks
 * Helper function to reset all mock state between tests
 */
function resetAllMocks() {
  // Reset app
  app.listeners = {};
  app.isReady = false;
  app.isQuitting = false;

  // Reset ipcMain
  ipcMain.handlers = {};
  ipcMain.listeners = {};

  // Reset ipcRenderer
  ipcRenderer.listeners = {};

  // Reset BrowserWindow
  BrowserWindow._windows = [];
  BrowserWindow._focusedWindow = null;

  // Reset jest mocks
  shell.openExternal.mockClear();
  shell.openPath.mockClear();
  shell.showItemInFolder.mockClear();
  shell.moveItemToTrash.mockClear();
  shell.beep.mockClear();

  dialog.showOpenDialog.mockClear();
  dialog.showSaveDialog.mockClear();
  dialog.showMessageBox.mockClear();
  dialog.showErrorBox.mockClear();
}

// Export all mocks
module.exports = {
  app,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  shell,
  dialog,
  Menu,
  MenuItem,
  Notification,
  nativeTheme,
  resetAllMocks
};
