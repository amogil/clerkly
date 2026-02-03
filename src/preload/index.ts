// Requirements: clerkly.1, clerkly.2
/**
 * Preload script for secure IPC communication
 * Exposes secure API to renderer process via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * API interface for secure IPC communication
 * Exposed to renderer process via contextBridge
 */
interface API {
  saveData: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3
  auth: {
    startLogin: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ authorized: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    onAuthSuccess: (callback: () => void) => void;
    onAuthError: (callback: (error: string, errorCode?: string) => void) => void;
  };
}

// Requirements: clerkly.1, clerkly.2

/**
 * Expose secure IPC API to renderer process
 * Uses contextBridge for security isolation
 */
contextBridge.exposeInMainWorld('api', {
  /**
   * Save data to local storage via IPC
   * Requirements: clerkly.1   * @param {string} key - Data key (non-empty string, max 1000 chars)
   * @param {unknown} value - Data value (serializable to JSON, max 10MB)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveData(key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
    return await ipcRenderer.invoke('save-data', key, value);
  },

  /**
   * Load data from local storage via IPC
   * Requirements: clerkly.1   * @param {string} key - Data key to load
   * @returns {Promise<{success: boolean, data?: unknown, error?: string}>}
   */
  async loadData(key: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return await ipcRenderer.invoke('load-data', key);
  },

  /**
   * Delete data from local storage via IPC
   * Requirements: clerkly.1   * @param {string} key - Data key to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteData(key: string): Promise<{ success: boolean; error?: string }> {
    return await ipcRenderer.invoke('delete-data', key);
  },

  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3
  /**
   * Authentication API
   * Provides methods for OAuth authentication flow
   */
  auth: {
    /**
     * Start OAuth login flow
     * Requirements: google-oauth-auth.8.1
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async startLogin(): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('auth:start-login');
    },

    /**
     * Get current authentication status
     * Requirements: google-oauth-auth.8.2
     * @returns {Promise<{authorized: boolean, error?: string}>}
     */
    async getStatus(): Promise<{ authorized: boolean; error?: string }> {
      return await ipcRenderer.invoke('auth:get-status');
    },

    /**
     * Logout and revoke tokens
     * Requirements: google-oauth-auth.8.3
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async logout(): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('auth:logout');
    },

    /**
     * Listen for authentication success events
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on success
     */
    onAuthSuccess(callback: () => void): void {
      ipcRenderer.on('auth:success', callback);
    },

    /**
     * Listen for authentication error events
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on error
     */
    onAuthError(callback: (error: string, errorCode?: string) => void): void {
      ipcRenderer.on('auth:error', (_event, error: string, errorCode?: string) => {
        callback(error, errorCode);
      });
    },
  },
} as API);

/**
 * Global window interface extension for renderer process
 * Allows TypeScript to recognize window.api
 */
declare global {
  interface Window {
    api: API;
  }
}
