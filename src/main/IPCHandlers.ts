// Requirements: clerkly.1, clerkly.2, clerkly.nfr.2

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataManager } from './DataManager';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * IPC result interface
 */
export interface IPCResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Manages IPC communication between Main and Renderer processes
 */
export class IPCHandlers {
  private dataManager: DataManager;
  private timeout: number = 10000; // 10 seconds
  private registeredChannels: string[] = [];

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * Регистрирует все IPC handlers
   * Каналы: 'save-data', 'load-data', 'delete-data'
   * Requirements: clerkly.1, clerkly.2   */
  registerHandlers(): void {
    // Register save-data handler
    ipcMain.handle('save-data', this.handleSaveData.bind(this));
    this.registeredChannels.push('save-data');

    // Register load-data handler
    ipcMain.handle('load-data', this.handleLoadData.bind(this));
    this.registeredChannels.push('load-data');

    // Register delete-data handler
    ipcMain.handle('delete-data', this.handleDeleteData.bind(this));
    this.registeredChannels.push('delete-data');
  }

  /**
   * Удаляет все IPC handlers
   * Requirements: clerkly.1, clerkly.2   */
  unregisterHandlers(): void {
    for (const channel of this.registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    this.registeredChannels = [];
  }

  /**
   * Обрабатывает save-data запрос
   * Валидирует параметры
   * Применяет timeout (10 секунд)
   * Логирует ошибки
   * Requirements: clerkly.1, clerkly.nfr.2   * @param {IpcMainInvokeEvent} event
   * @param {string} key
   * @param {any} value
   * @returns {Promise<IPCResult>}
   */
  async handleSaveData(event: IpcMainInvokeEvent, key: string, value: unknown): Promise<IPCResult> {
    try {
      // Валидация параметров
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        Logger.error('IPCHandlers', `[IPC] save-data failed: ${error}`);
        return { success: false, error };
      }

      if (value === undefined) {
        const error = 'Invalid parameters: value is required';
        Logger.error('IPCHandlers', `[IPC] save-data failed: ${error}`);
        return { success: false, error };
      }

      // Выполнение с timeout
      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.saveData(key, value)),
        this.timeout,
        'save-data operation timed out'
      );

      // Логирование ошибок
      if (!result.success) {
        Logger.error('IPCHandlers', `[IPC] save-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('IPCHandlers', `[IPC] save-data exception: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Обрабатывает load-data запрос
   * Валидирует параметры
   * Применяет timeout
   * Логирует ошибки
   * Requirements: clerkly.1, clerkly.nfr.2   * @param {IpcMainInvokeEvent} event
   * @param {string} key
   * @returns {Promise<IPCResult>}
   */
  async handleLoadData(event: IpcMainInvokeEvent, key: string): Promise<IPCResult> {
    try {
      // Валидация параметров
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        Logger.error('IPCHandlers', `[IPC] load-data failed: ${error}`);
        return { success: false, error };
      }

      // Выполнение с timeout
      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.loadData(key)),
        this.timeout,
        'load-data operation timed out'
      );

      // Логирование ошибок
      if (!result.success) {
        Logger.error('IPCHandlers', `[IPC] load-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('IPCHandlers', `[IPC] load-data exception: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Обрабатывает delete-data запрос
   * Валидирует параметры
   * Применяет timeout
   * Логирует ошибки
   * Requirements: clerkly.1, clerkly.nfr.2   * @param {IpcMainInvokeEvent} event
   * @param {string} key
   * @returns {Promise<IPCResult>}
   */
  async handleDeleteData(event: IpcMainInvokeEvent, key: string): Promise<IPCResult> {
    try {
      // Валидация параметров
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        Logger.error('IPCHandlers', `[IPC] delete-data failed: ${error}`);
        return { success: false, error };
      }

      // Выполнение с timeout
      const result = await this.withTimeout(
        Promise.resolve(this.dataManager.deleteData(key)),
        this.timeout,
        'delete-data operation timed out'
      );

      // Логирование ошибок
      if (!result.success) {
        Logger.error('IPCHandlers', `[IPC] delete-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('IPCHandlers', `[IPC] delete-data exception: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Выполняет promise с timeout
   * Requirements: clerkly.nfr.2   * @param {Promise<T>} promise
   * @param {number} timeoutMs
   * @param {string} timeoutMessage
   * @returns {Promise<T>}
   */
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
          timeoutHandle.unref();
        }),
      ]);

      // Clear timeout if operation completed successfully
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      return result;
    } catch (error) {
      // Clear timeout on error
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      throw error;
    }
  }

  /**
   * Устанавливает timeout для IPC запросов
   * Requirements: clerkly.nfr.2   * @param {number} timeoutMs
   */
  setTimeout(timeoutMs: number): void {
    this.timeout = timeoutMs;
  }

  /**
   * Возвращает текущий timeout
   * Requirements: clerkly.nfr.2   * @returns {number}
   */
  getTimeout(): number {
    return this.timeout;
  }
}
