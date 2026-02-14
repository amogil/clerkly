// Requirements: testing.3.9

import { ipcMain } from 'electron';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { UserSettingsManager } from '../../../src/main/UserSettingsManager';

/**
 * Register test IPC handlers
 *
 * Should be called during app initialization when NODE_ENV === 'test'
 * Requirements: testing.3.9
 */
export function registerTestIPCHandlers(
  tokenStorage: TokenStorageManager,
  dataManager: UserSettingsManager
): void {
  // Test handler for saving data
  ipcMain.handle('test:save-data', async (_event, key: string, value: string) => {
    try {
      await dataManager.saveData(key, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Test handler for loading data
  ipcMain.handle('test:load-data', async (_event, key: string) => {
    try {
      const result = await dataManager.loadData(key);
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Test handler for deleting data
  ipcMain.handle('test:delete-data', async (_event, key: string) => {
    try {
      await dataManager.deleteData(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Test handler for clearing all tokens
  ipcMain.handle('test:clear-tokens', async () => {
    try {
      await tokenStorage.clearTokens();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('[TEST IPC] Test IPC handlers registered');
}

/**
 * Unregister test IPC handlers
 *
 * Should be called during app cleanup
 * Requirements: testing.3.9
 */
export function unregisterTestIPCHandlers(): void {
  ipcMain.removeHandler('test:save-data');
  ipcMain.removeHandler('test:load-data');
  ipcMain.removeHandler('test:delete-data');
  ipcMain.removeHandler('test:clear-tokens');

  console.log('[TEST IPC] Test IPC handlers unregistered');
}
