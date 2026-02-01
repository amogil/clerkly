// Requirements: clerkly.1.1, clerkly.1.2, clerkly.1.3, clerkly.1.4
import { app } from 'electron';
import * as path from 'path';
import WindowManager from './src/main/WindowManager';
import DataManager from './src/main/DataManager';
import LifecycleManager from './src/main/LifecycleManager';
import IPCHandlers from './src/main/IPCHandlers';

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
let windowManager: WindowManager;
let dataManager: DataManager;
let lifecycleManager: LifecycleManager;
let ipcHandlers: IPCHandlers;

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
async function initializeApp() {
  // Get user data path for storage
  const userDataPath = app.getPath('userData');
  const storagePath = path.join(userDataPath, 'data');

  // Initialize components
  windowManager = new WindowManager();
  dataManager = new DataManager(storagePath);
  lifecycleManager = new LifecycleManager(windowManager, dataManager);
  ipcHandlers = new IPCHandlers(dataManager);

  // Register IPC handlers
  ipcHandlers.registerHandlers();

  // Initialize application
  await lifecycleManager.initialize();
}

// Requirements: clerkly.1.2, clerkly.1.3
app.whenReady().then(initializeApp);

// Requirements: clerkly.1.2, clerkly.1.3
app.on('window-all-closed', () => {
  lifecycleManager.handleWindowClose();
});

// Requirements: clerkly.1.2, clerkly.1.3
app.on('activate', () => {
  lifecycleManager.handleActivation();
});

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
app.on('before-quit', async () => {
  await lifecycleManager.handleQuit();
  if (dataManager) {
    dataManager.close();
  }
  if (ipcHandlers) {
    ipcHandlers.unregisterHandlers();
  }
});
