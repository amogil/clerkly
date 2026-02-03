// Requirements: testing.1.2
// Mock for Electron API used in unit and property-based tests

export const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadFile: jest.fn(),
  loadURL: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  close: jest.fn(),
  destroy: jest.fn(),
  getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
  setBounds: jest.fn(),
  setSize: jest.fn(),
  setPosition: jest.fn(),
  center: jest.fn(),
  isMaximized: jest.fn(() => false),
  isMinimized: jest.fn(() => false),
  isFullScreen: jest.fn(() => false),
  maximize: jest.fn(),
  unmaximize: jest.fn(),
  minimize: jest.fn(),
  restore: jest.fn(),
  setFullScreen: jest.fn(),
  webContents: {
    send: jest.fn(),
    on: jest.fn(),
    openDevTools: jest.fn(),
  },
}));

export const app = {
  getPath: jest.fn((name: string) => `/mock/path/${name}`),
  on: jest.fn(),
  once: jest.fn(),
  quit: jest.fn(),
  exit: jest.fn(),
  whenReady: jest.fn(() => Promise.resolve()),
  isReady: jest.fn(() => true),
  getVersion: jest.fn(() => '1.0.0'),
  getName: jest.fn(() => 'Clerkly'),
  setName: jest.fn(),
  getLocale: jest.fn(() => 'en-US'),
};

export const screen = {
  getPrimaryDisplay: jest.fn(() => ({
    workAreaSize: { width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
  getAllDisplays: jest.fn(() => [
    {
      workAreaSize: { width: 1920, height: 1080 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    },
  ]),
};

export const ipcMain = {
  on: jest.fn(),
  once: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const ipcRenderer = {
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  invoke: jest.fn(() => Promise.resolve()),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const shell = {
  openExternal: jest.fn(() => Promise.resolve()),
  openPath: jest.fn(() => Promise.resolve('')),
  showItemInFolder: jest.fn(),
};

export const dialog = {
  showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
  showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
  showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
  showErrorBox: jest.fn(),
};
