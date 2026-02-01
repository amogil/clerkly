// Requirements: clerkly.1.4
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import DataManager from './DataManager';

interface IPCResult {
  success: boolean;
  data?: any;
  error?: string;
}

class IPCHandlers {
  private dataManager: DataManager;
  private timeout: number = 10000; // 10 seconds

  // Requirements: clerkly.1.4
  constructor(dataManager: DataManager) {
    if (!dataManager) {
      throw new Error('DataManager is required');
    }
    this.dataManager = dataManager;
  }

  // Requirements: clerkly.1.4
  registerHandlers(): void {
    ipcMain.handle('save-data', async (event, key, value) => {
      return this.handleSaveData(event, key, value);
    });

    ipcMain.handle('load-data', async (event, key) => {
      return this.handleLoadData(event, key);
    });

    ipcMain.handle('delete-data', async (event, key) => {
      return this.handleDeleteData(event, key);
    });
  }

  // Requirements: clerkly.1.4
  unregisterHandlers(): void {
    ipcMain.removeHandler('save-data');
    ipcMain.removeHandler('load-data');
    ipcMain.removeHandler('delete-data');
  }

  // Requirements: clerkly.1.4
  async handleSaveData(_event: IpcMainInvokeEvent, key: string, value: any): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        console.error(`[IPC] save-data failed: ${error}`);
        return { success: false, error };
      }

      if (value === undefined) {
        const error = 'Invalid parameters: value is required';
        console.error(`[IPC] save-data failed: ${error}`);
        return { success: false, error };
      }

      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.saveData(key, value)),
        this.timeout,
        'save-data operation timed out'
      );

      if (!result.success) {
        console.error(`[IPC] save-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] save-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // Requirements: clerkly.1.4
  async handleLoadData(_event: IpcMainInvokeEvent, key: string): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        console.error(`[IPC] load-data failed: ${error}`);
        return { success: false, error };
      }

      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.loadData(key)),
        this.timeout,
        'load-data operation timed out'
      );

      if (!result.success) {
        console.error(`[IPC] load-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] load-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // Requirements: clerkly.1.4
  async handleDeleteData(_event: IpcMainInvokeEvent, key: string): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        console.error(`[IPC] delete-data failed: ${error}`);
        return { success: false, error };
      }

      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.deleteData(key)),
        this.timeout,
        'delete-data operation timed out'
      );

      if (!result.success) {
        console.error(`[IPC] delete-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] delete-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // Requirements: clerkly.1.4
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      })
    ]);
  }

  // Requirements: clerkly.1.4
  setTimeout(timeoutMs: number): void {
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    this.timeout = timeoutMs;
  }

  // Requirements: clerkly.1.4
  getTimeout(): number {
    return this.timeout;
  }
}

export default IPCHandlers;
