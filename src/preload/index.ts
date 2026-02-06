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
  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, ui.6.2, ui.6.5
  auth: {
    startLogin: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ authorized: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    getProfile: () => Promise<{ success: boolean; profile?: any; error?: string }>;
    refreshProfile: () => Promise<{ success: boolean; profile?: any; error?: string }>;
    onAuthSuccess: (callback: () => void) => () => void;
    onAuthError: (callback: (error: string, errorCode?: string) => void) => () => void;
    onLogout: (callback: () => void) => () => void;
    onProfileUpdated: (callback: (profile: any) => void) => () => void;
  };
  // Requirements: ui.7.1
  error: {
    onNotify: (callback: (message: string, context: string) => void) => () => void;
  };
  // Requirements: testing.3.8 - Test IPC methods (only available in test environment)
  ipcRenderer?: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
}

// Requirements: clerkly.1, clerkly.2

/**
 * Expose secure IPC API to renderer process
 * Uses contextBridge for security isolation
 */
const api: API = {
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

  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, ui.6.2, ui.6.5
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
     * Get user profile from local cache
     * Returns cached profile data from DataManager
     * Requirements: ui.6.2
     * @returns {Promise<{success: boolean, profile?: any, error?: string}>}
     */
    async getProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
      return await ipcRenderer.invoke('auth:get-profile');
    },

    /**
     * Refresh user profile from Google API
     * Fetches fresh profile data from Google UserInfo API
     * Requirements: ui.6.5
     * @returns {Promise<{success: boolean, profile?: any, error?: string}>}
     */
    async refreshProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
      return await ipcRenderer.invoke('auth:refresh-profile');
    },

    /**
     * Listen for authentication success events
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on success
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onAuthSuccess(callback: () => void): () => void {
      const listener = () => {
        callback();
      };
      ipcRenderer.on('auth:success', listener);
      return () => {
        ipcRenderer.removeListener('auth:success', listener);
      };
    },

    /**
     * Listen for authentication error events
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on error
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onAuthError(callback: (error: string, errorCode?: string) => void): () => void {
      const listener = (_event: any, data: { error: string; errorCode?: string }) => {
        callback(data.error, data.errorCode);
      };
      ipcRenderer.on('auth:error', listener);
      return () => {
        ipcRenderer.removeListener('auth:error', listener);
      };
    },

    /**
     * Listen for logout events
     * Requirements: ui.6.8
     * @param {Function} callback - Callback function to execute on logout
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onLogout(callback: () => void): () => void {
      const listener = () => {
        callback();
      };
      ipcRenderer.on('auth:logout-complete', listener);
      return () => {
        ipcRenderer.removeListener('auth:logout-complete', listener);
      };
    },

    /**
     * Listen for profile update events
     * Requirements: ui.6.5
     * @param {Function} callback - Callback function to execute when profile is updated
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onProfileUpdated(callback: (profile: any) => void): () => void {
      const listener = (_event: any, profile: any) => {
        callback(profile);
      };
      ipcRenderer.on('auth:profile-updated', listener);
      return () => {
        ipcRenderer.removeListener('auth:profile-updated', listener);
      };
    },
  },

  // Requirements: ui.7.1
  /**
   * Error notification API
   * Provides methods for receiving error notifications from main process
   */
  error: {
    /**
     * Listen for error notification events
     * Requirements: ui.7.1, ui.7.2
     * @param {Function} callback - Callback function to execute when error notification is received
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onNotify(callback: (message: string, context: string) => void): () => void {
      const listener = (_event: any, message: string, context: string) => {
        callback(message, context);
      };
      ipcRenderer.on('error:notify', listener);
      return () => {
        ipcRenderer.removeListener('error:notify', listener);
      };
    },
  },
};

// Requirements: testing.3.8
// Expose ipcRenderer in test environment for test IPC handlers
if (process.env.NODE_ENV === 'test') {
  api.ipcRenderer = {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  };
}

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  },
});
