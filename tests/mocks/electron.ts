// Requirements: clerkly.2.1, clerkly.2.5

export class BrowserWindow {
  options: any;
  _isDestroyed: boolean;
  webContents: any;
  listeners: Record<string, Function[]>;
  loadedFile?: string;
  loadedURL?: string;
  isVisible?: boolean;
  isFocused?: boolean;
  title?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  fullscreen?: boolean;

  static _windows: BrowserWindow[] = [];
  static _focusedWindow: BrowserWindow | null = null;

  constructor(options: any = {}) {
    this.options = options;
    this._isDestroyed = false;
    this.webContents = {
      on: jest.fn(),
      send: jest.fn(),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest.fn(() => false),
      session: {
        clearCache: jest.fn((callback: Function) => callback()),
        clearStorageData: jest.fn()
      }
    };
    this.listeners = {};
  }

  loadFile(filePath: string): Promise<void> {
    this.loadedFile = filePath;
    return Promise.resolve();
  }

  loadURL(url: string): Promise<void> {
    this.loadedURL = url;
    return Promise.resolve();
  }

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  once(event: string, callback: Function): void {
    this.on(event, callback);
  }

  removeListener(event: string, callback: Function): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(...args));
    }
  }

  close(): void {
    this.emit('close');
    this._isDestroyed = true;
  }

  destroy(): void {
    this._isDestroyed = true;
  }

  show(): void {
    this.isVisible = true;
  }

  hide(): void {
    this.isVisible = false;
  }

  focus(): void {
    this.isFocused = true;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  getTitle(): string {
    return this.title || '';
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this.bounds || { x: 0, y: 0, width: 800, height: 600 };
  }

  setSize(width: number, height: number): void {
    if (!this.bounds) this.bounds = { x: 0, y: 0, width: 800, height: 600 };
    this.bounds.width = width;
    this.bounds.height = height;
  }

  getSize(): [number, number] {
    const bounds = this.getBounds();
    return [bounds.width, bounds.height];
  }

  setMinimumSize(width: number, height: number): void {
    this.minWidth = width;
    this.minHeight = height;
  }

  getMinimumSize(): [number, number] {
    return [this.minWidth || 0, this.minHeight || 0];
  }

  setResizable(resizable: boolean): void {
    this.resizable = resizable;
  }

  setFullScreen(fullscreen: boolean): void {
    this.fullscreen = fullscreen;
  }

  removeAllListeners(): void {
    this.listeners = {};
  }

  isDestroyed(): boolean {
    return this._isDestroyed || false;
  }

  static getAllWindows(): BrowserWindow[] {
    return BrowserWindow._windows || [];
  }

  static getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow._focusedWindow || null;
  }
}

interface AppType {
  listeners: Record<string, Function[]>;
  isReady: boolean;
  isQuitting: boolean;
  name: string;
  version: string;
  isPackaged: boolean;
  on(event: string, callback: Function): AppType;
  once(event: string, callback: Function): AppType;
  removeListener(event: string, callback: Function): AppType;
  emit(event: string, ...args: any[]): void;
  whenReady(): Promise<void>;
  quit(): void;
  exit(code?: number): void;
  getPath(name: string): string;
  getVersion(): string;
  getName(): string;
  setName(name: string): void;
  getAppPath(): string;
  requestSingleInstanceLock(): boolean;
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
}

export const app: AppType = {
  listeners: {},
  isReady: false,
  isQuitting: false,
  name: 'Clerkly',
  version: '1.0.0',
  isPackaged: false,

  on(event: string, callback: Function): AppType {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  },

  once(event: string, callback: Function): AppType {
    this.on(event, callback);
    return this;
  },

  removeListener(event: string, callback: Function): AppType {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    return this;
  },

  emit(event: string, ...args: any[]): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(...args));
    }
  },

  whenReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.isReady) {
        resolve();
      } else {
        this.once('ready', resolve);
      }
    });
  },

  quit(): void {
    this.isQuitting = true;
    this.emit('before-quit');
    this.emit('will-quit');
    this.emit('quit');
  },

  exit(code = 0): void {
    this.quit();
    process.exit(code);
  },

  getPath(name: string): string {
    const paths: Record<string, string> = {
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

  getVersion(): string {
    return this.version;
  },

  getName(): string {
    return this.name;
  },

  setName(name: string): void {
    this.name = name;
  },

  getAppPath(): string {
    return '/mock/app/path';
  },

  requestSingleInstanceLock(): boolean {
    return true;
  },

  hasSingleInstanceLock(): boolean {
    return true;
  },

  releaseSingleInstanceLock(): void {
    // Mock implementation
  }
};

export const ipcMain = {
  handlers: {} as Record<string, Function>,
  listeners: {} as Record<string, Function[]>,

  handle(channel: string, handler: Function): void {
    this.handlers[channel] = handler;
  },

  handleOnce(channel: string, handler: Function): void {
    this.handle(channel, handler);
  },

  removeHandler(channel: string): void {
    delete this.handlers[channel];
  },

  on(channel: string, listener: Function): void {
    if (!this.listeners[channel]) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(listener);
  },

  once(channel: string, listener: Function): void {
    this.on(channel, listener);
  },

  removeListener(channel: string, listener: Function): void {
    if (this.listeners[channel]) {
      this.listeners[channel] = this.listeners[channel].filter(l => l !== listener);
    }
  },

  removeAllListeners(channel?: string): void {
    if (channel) {
      delete this.listeners[channel];
    } else {
      this.listeners = {};
    }
  },

  async _invokeHandler(channel: string, event: any, ...args: any[]): Promise<any> {
    if (this.handlers[channel]) {
      return await this.handlers[channel](event, ...args);
    }
    throw new Error(`No handler registered for channel: ${channel}`);
  },

  _emitEvent(channel: string, event: any, ...args: any[]): void {
    if (this.listeners[channel]) {
      this.listeners[channel].forEach(listener => listener(event, ...args));
    }
  }
};

interface IpcRendererType {
  listeners: Record<string, Function[]>;
  send(_channel: string, ..._args: any[]): void;
  invoke(_channel: string, ..._args: any[]): Promise<any>;
  on(channel: string, listener: Function): IpcRendererType;
  once(channel: string, listener: Function): IpcRendererType;
  removeListener(channel: string, listener: Function): IpcRendererType;
  removeAllListeners(channel?: string): IpcRendererType;
  _simulateMessage(channel: string, event: any, ...args: any[]): void;
}

export const ipcRenderer: IpcRendererType = {
  listeners: {},

  send(_channel: string, ..._args: any[]): void {
    // Mock implementation
  },

  invoke(_channel: string, ..._args: any[]): Promise<any> {
    return Promise.resolve();
  },

  on(channel: string, listener: Function): IpcRendererType {
    if (!this.listeners[channel]) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(listener);
    return this;
  },

  once(channel: string, listener: Function): IpcRendererType {
    this.on(channel, listener);
    return this;
  },

  removeListener(channel: string, listener: Function): IpcRendererType {
    if (this.listeners[channel]) {
      this.listeners[channel] = this.listeners[channel].filter(l => l !== listener);
    }
    return this;
  },

  removeAllListeners(channel?: string): IpcRendererType {
    if (channel) {
      delete this.listeners[channel];
    } else {
      this.listeners = {};
    }
    return this;
  },

  _simulateMessage(channel: string, event: any, ...args: any[]): void {
    if (this.listeners[channel]) {
      this.listeners[channel].forEach(listener => listener(event, ...args));
    }
  }
};

export const shell = {
  openExternal: jest.fn((_url: string) => Promise.resolve()),
  openPath: jest.fn((_path: string) => Promise.resolve('')),
  showItemInFolder: jest.fn(),
  moveItemToTrash: jest.fn(() => true),
  beep: jest.fn(),
  writeShortcutLink: jest.fn(() => true),
  readShortcutLink: jest.fn(() => ({}))
};

export const dialog = {
  showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
  showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
  showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
  showErrorBox: jest.fn(),
  showCertificateTrustDialog: jest.fn(() => Promise.resolve())
};

export class Menu {
  items: any[] = [];
  static _applicationMenu: Menu | null = null;

  static buildFromTemplate(template: any[]): Menu {
    const menu = new Menu();
    menu.items = template;
    return menu;
  }

  static setApplicationMenu(menu: Menu | null): void {
    Menu._applicationMenu = menu;
  }

  static getApplicationMenu(): Menu | null {
    return Menu._applicationMenu || null;
  }

  append(menuItem: any): void {
    this.items.push(menuItem);
  }

  insert(pos: number, menuItem: any): void {
    this.items.splice(pos, 0, menuItem);
  }

  popup(_options?: any): void {
    // Mock implementation
  }

  closePopup(_browserWindow?: BrowserWindow): void {
    // Mock implementation
  }
}

export class MenuItem {
  [key: string]: any;

  constructor(options: any) {
    Object.assign(this, options);
  }
}

export class Notification {
  options: any;
  listeners: Record<string, Function[]> = {};
  isShown = false;

  constructor(options: any) {
    this.options = options;
  }

  show(): void {
    this.isShown = true;
  }

  close(): void {
    this.isShown = false;
  }

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  static isSupported(): boolean {
    return true;
  }
}

export const nativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system',
  listeners: {} as Record<string, Function[]>,

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
};

export function resetAllMocks(): void {
  app.listeners = {};
  app.isReady = false;
  app.isQuitting = false;

  ipcMain.handlers = {};
  ipcMain.listeners = {};

  ipcRenderer.listeners = {};

  BrowserWindow._windows = [];
  BrowserWindow._focusedWindow = null;

  (shell.openExternal as jest.Mock).mockClear();
  (shell.openPath as jest.Mock).mockClear();
  (shell.showItemInFolder as jest.Mock).mockClear();
  (shell.moveItemToTrash as jest.Mock).mockClear();
  (shell.beep as jest.Mock).mockClear();

  (dialog.showOpenDialog as jest.Mock).mockClear();
  (dialog.showSaveDialog as jest.Mock).mockClear();
  (dialog.showMessageBox as jest.Mock).mockClear();
  (dialog.showErrorBox as jest.Mock).mockClear();
}
