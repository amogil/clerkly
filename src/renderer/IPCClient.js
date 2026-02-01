// Requirements: clerkly.1.4
const { ipcRenderer } = require('electron');

/**
 * IPCClient class
 * Provides client-side interface for IPC communication with Main Process
 * Handles data operations with timeout support and error handling
 * 
 * Requirements: clerkly.1.4
 */
class IPCClient {
  /**
   * Constructor
   * @param {number} timeout - Timeout for IPC requests in milliseconds (default: 10000)
   * 
   * Requirements: clerkly.1.4
   */
  constructor(timeout = 10000) {
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    this.timeout = timeout;
  }

  /**
   * Save data to local storage via IPC
   * @param {string} key - Unique identifier for the data
   * @param {any} value - Data to save
   * @returns {Promise<Object>} Result object with success status
   * 
   * Requirements: clerkly.1.4
   */
  async saveData(key, value) {
    try {
      // Validate parameters
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      if (value === undefined) {
        return { success: false, error: 'Invalid parameters: value is required' };
      }

      // Execute IPC call with timeout
      const result = await this.withTimeout(
        ipcRenderer.invoke('save-data', key, value),
        this.timeout,
        'save-data request timed out'
      );

      return result;
    } catch (error) {
      // Handle timeout and other errors
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Load data from local storage via IPC
   * @param {string} key - Unique identifier for the data
   * @returns {Promise<Object>} Result object with success status and data
   * 
   * Requirements: clerkly.1.4
   */
  async loadData(key) {
    try {
      // Validate parameters
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      // Execute IPC call with timeout
      const result = await this.withTimeout(
        ipcRenderer.invoke('load-data', key),
        this.timeout,
        'load-data request timed out'
      );

      return result;
    } catch (error) {
      // Handle timeout and other errors
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Delete data from local storage via IPC
   * @param {string} key - Unique identifier for the data
   * @returns {Promise<Object>} Result object with success status
   * 
   * Requirements: clerkly.1.4
   */
  async deleteData(key) {
    try {
      // Validate parameters
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      // Execute IPC call with timeout
      const result = await this.withTimeout(
        ipcRenderer.invoke('delete-data', key),
        this.timeout,
        'delete-data request timed out'
      );

      return result;
    } catch (error) {
      // Handle timeout and other errors
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
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

module.exports = IPCClient;
