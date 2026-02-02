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
  saveData: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
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
   * @param {any} value - Data value (serializable to JSON, max 10MB)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveData(key: string, value: any): Promise<{ success: boolean; error?: string }> {
    return await ipcRenderer.invoke('save-data', key, value);
  },

  /**
   * Load data from local storage via IPC
   * Requirements: clerkly.1   * @param {string} key - Data key to load
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async loadData(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
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
