// Requirements: clerkly.1.4
const { ipcMain } = require('electron');

/**
 * IPCHandlers class
 * Manages IPC communication between Main and Renderer processes
 * Provides handlers for data operations with validation, error handling, and timeouts
 * 
 * Requirements: clerkly.1.4
 */
class IPCHandlers {
  /**
   * Constructor
   * @param {DataManager} dataManager - DataManager instance for data operations
   * 
   * Requirements: clerkly.1.4
   */
  constructor(dataManager) {
    if (!dataManager) {
      throw new Error('DataManager is required');
    }
    this.dataManager = dataManager;
    this.timeout = 10000; // 10 seconds timeout for IPC requests
  }

  /**
   * Register all IPC handlers
   * Sets up handlers for save-data, load-data, and delete-data channels
   * 
   * Requirements: clerkly.1.4
   */
  registerHandlers() {
    // Register save-data handler
    ipcMain.handle('save-data', async (event, key, value) => {
      return this.handleSaveData(event, key, value);
    });

    // Register load-data handler
    ipcMain.handle('load-data', async (event, key) => {
      return this.handleLoadData(event, key);
    });

    // Register delete-data handler
    ipcMain.handle('delete-data', async (event, key) => {
      return this.handleDeleteData(event, key);
    });
  }

  /**
   * Unregister all IPC handlers
   * Removes all registered handlers (useful for cleanup)
   * 
   * Requirements: clerkly.1.4
   */
  unregisterHandlers() {
    ipcMain.removeHandler('save-data');
    ipcMain.removeHandler('load-data');
    ipcMain.removeHandler('delete-data');
  }

  /**
   * Handle save-data IPC request with timeout
   * @param {Object} event - IPC event object
   * @param {string} key - Data key
   * @param {any} value - Data value
   * @returns {Promise<Object>} Result object with success status
   * 
   * Requirements: clerkly.1.4
   */
  async handleSaveData(event, key, value) {
    try {
      // Validate parameters
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

      // Execute with timeout
      const result = await this.withTimeout(
        this.dataManager.saveData(key, value),
        this.timeout,
        'save-data operation timed out'
      );

      // Log failures
      if (!result.success) {
        console.error(`[IPC] save-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] save-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle load-data IPC request with timeout
   * @param {Object} event - IPC event object
   * @param {string} key - Data key
   * @returns {Promise<Object>} Result object with success status and data
   * 
   * Requirements: clerkly.1.4
   */
  async handleLoadData(event, key) {
    try {
      // Validate parameters
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        console.error(`[IPC] load-data failed: ${error}`);
        return { success: false, error };
      }

      // Execute with timeout
      const result = await this.withTimeout(
        this.dataManager.loadData(key),
        this.timeout,
        'load-data operation timed out'
      );

      // Log failures
      if (!result.success) {
        console.error(`[IPC] load-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] load-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle delete-data IPC request with timeout
   * @param {Object} event - IPC event object
   * @param {string} key - Data key
   * @returns {Promise<Object>} Result object with success status
   * 
   * Requirements: clerkly.1.4
   */
  async handleDeleteData(event, key) {
    try {
      // Validate parameters
      if (key === undefined || key === null) {
        const error = 'Invalid parameters: key is required';
        console.error(`[IPC] delete-data failed: ${error}`);
        return { success: false, error };
      }

      // Execute with timeout
      const result = await this.withTimeout(
        this.dataManager.deleteData(key),
        this.timeout,
        'delete-data operation timed out'
      );

      // Log failures
      if (!result.success) {
        console.error(`[IPC] delete-data failed for key "${key}": ${result.error}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[IPC] delete-data exception for key "${key}": ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute a promise with timeout
   * @param {Promise} promise - Promise to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} timeoutMessage - Error message for timeout
   * @returns {Promise} Promise that resolves or rejects with timeout
   * 
   * Requirements: clerkly.1.4
   */
  withTimeout(promise, timeoutMs, timeoutMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Set timeout for IPC requests
   * @param {number} timeoutMs - Timeout in milliseconds
   * 
   * Requirements: clerkly.1.4
   */
  setTimeout(timeoutMs) {
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    this.timeout = timeoutMs;
  }

  /**
   * Get current timeout value
   * @returns {number} Timeout in milliseconds
   * 
   * Requirements: clerkly.1.4
   */
  getTimeout() {
    return this.timeout;
  }
}

module.exports = IPCHandlers;
