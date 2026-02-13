// Requirements: clerkly.1, clerkly.2
/**
 * Preload script for secure IPC communication
 * Exposes secure API to renderer process via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

// Event type constants (duplicated from shared/events/constants.ts due to rootDir restriction)
const EVENT_TYPE_USER_LOGOUT = 'user.logout';
const EVENT_TYPE_AUTH_FAILED = 'auth.failed';
const EVENT_TYPE_AUTH_SUCCEEDED = 'auth.succeeded';
const EVENT_TYPE_PROFILE_SYNCED = 'profile.synced';
const EVENT_TYPE_LOADER_SHOW = 'loader.show';
const EVENT_TYPE_LOADER_HIDE = 'loader.hide';
const EVENT_TYPE_ERROR_CREATED = 'error.created';

/**
 * API interface for secure IPC communication
 * Exposed to renderer process via contextBridge
 */
interface API {
  saveData: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
  // Requirements: realtime-events.4.5, realtime-events.4.6, realtime-events.4.7
  events?: {
    onEvent: (callback: (type: string, payload: unknown) => void) => () => void;
    sendEvent: (type: string, payload: unknown) => void;
  };
  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, account-profile.1.2, account-profile.1.5
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
    onShowLoader: (callback: () => void) => () => void;
    onHideLoader: (callback: () => void) => () => void;
  };
  // Requirements: error-notifications.1.1
  error: {
    onNotify: (callback: (message: string, context: string) => void) => () => void;
  };
  // Requirements: settings.1.26
  settings: {
    saveLLMProvider: (
      provider: 'openai' | 'anthropic' | 'google'
    ) => Promise<{ success: boolean; error?: string }>;
    loadLLMProvider: () => Promise<{
      success: boolean;
      provider?: 'openai' | 'anthropic' | 'google';
      error?: string;
    }>;
    saveAPIKey: (
      provider: 'openai' | 'anthropic' | 'google',
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>;
    loadAPIKey: (
      provider: 'openai' | 'anthropic' | 'google'
    ) => Promise<{ success: boolean; apiKey?: string | null; error?: string }>;
    deleteAPIKey: (
      provider: 'openai' | 'anthropic' | 'google'
    ) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: settings.3
  llm: {
    testConnection: (
      provider: 'openai' | 'anthropic' | 'google',
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: testing.3.1, testing.3.2 - Test API methods (only available in test environment)
  test?: {
    simulateDataError: (
      operation: 'saveData' | 'loadData' | 'deleteData',
      errorMessage: string
    ) => Promise<{ success: boolean; error?: string }>;
    clearDataErrors: () => Promise<{ success: boolean; error?: string }>;
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

  // Requirements: realtime-events.4.5, realtime-events.4.6, realtime-events.4.7
  /**
   * Events API
   * Provides methods for real-time event communication between main and renderer
   */
  events: {
    /**
     * Listen for events from main process
     * Requirements: realtime-events.4.5
     * @param {Function} callback - Callback function to execute when event is received
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onEvent(callback: (type: string, payload: unknown) => void): () => void {
      const listener = (_event: Electron.IpcRendererEvent, type: string, payload: unknown) => {
        callback(type, payload);
      };
      ipcRenderer.on('events:from-main', listener);
      return () => {
        ipcRenderer.removeListener('events:from-main', listener);
      };
    },

    /**
     * Send event to main process
     * Requirements: realtime-events.4.6
     * @param {string} type - Event type
     * @param {unknown} payload - Event payload
     */
    sendEvent(type: string, payload: unknown): void {
      ipcRenderer.send('events:from-renderer', type, payload);
    },
  },

  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, account-profile.1.2, account-profile.1.5
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
     * Requirements: account-profile.1.2
     * @returns {Promise<{success: boolean, profile?: any, error?: string}>}
     */
    async getProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
      return await ipcRenderer.invoke('auth:get-profile');
    },

    /**
     * Refresh user profile from Google API
     * Fetches fresh profile data from Google UserInfo API
     * Requirements: account-profile.1.5
     * @returns {Promise<{success: boolean, profile?: any, error?: string}>}
     */
    async refreshProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
      return await ipcRenderer.invoke('auth:refresh-profile');
    },

    /**
     * Listen for authentication success events via EventBus
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on success
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onAuthSuccess(callback: () => void): () => void {
      // Use the events API to listen for auth.succeeded events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPE_AUTH_SUCCEEDED) {
          callback();
        }
      });
    },

    /**
     * Listen for authentication error events via EventBus
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on error
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onAuthError(callback: (error: string, errorCode?: string) => void): () => void {
      // Use the events API to listen for auth.failed events
      return api.events!.onEvent((type: string, payload: unknown) => {
        if (type === EVENT_TYPE_AUTH_FAILED) {
          const data = payload as { error: string; errorCode?: string };
          callback(data.error, data.errorCode);
        }
      });
    },

    /**
     * Listen for logout events via EventBus
     * Requirements: account-profile.1.8
     * @param {Function} callback - Callback function to execute on logout
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onLogout(callback: () => void): () => void {
      // Use the events API to listen for user.logout events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPE_USER_LOGOUT) {
          callback();
        }
      });
    },

    /**
     * Listen for profile update events via EventBus
     * Requirements: account-profile.1.5
     * @param {Function} callback - Callback function to execute when profile is updated
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onProfileUpdated(callback: (profile: any) => void): () => void {
      // Use the events API to listen for profile.synced events
      return api.events!.onEvent((type: string, payload: unknown) => {
        if (type === EVENT_TYPE_PROFILE_SYNCED) {
          const data = payload as { profile: any };
          callback(data.profile);
        }
      });
    },

    /**
     * Listen for loader show events via EventBus
     * Requirements: google-oauth-auth.7.1
     * @param {Function} callback - Callback function to execute when loader should be shown
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onShowLoader(callback: () => void): () => void {
      // Use the events API to listen for loader.show events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPE_LOADER_SHOW) {
          callback();
        }
      });
    },

    /**
     * Listen for loader hide events via EventBus
     * Requirements: google-oauth-auth.7.1
     * @param {Function} callback - Callback function to execute when loader should be hidden
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onHideLoader(callback: () => void): () => void {
      // Use the events API to listen for loader.hide events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPE_LOADER_HIDE) {
          callback();
        }
      });
    },
  },

  // Requirements: error-notifications.1.1
  /**
   * Error notification API
   * Provides methods for receiving error notifications from main process
   */
  error: {
    /**
     * Listen for error notification events via EventBus
     * Requirements: error-notifications.1.1, error-notifications.1.2
     * @param {Function} callback - Callback function to execute when error notification is received
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onNotify(callback: (message: string, context: string) => void): () => void {
      // Use the events API to listen for error.created events
      return api.events!.onEvent((type: string, payload: unknown) => {
        if (type === EVENT_TYPE_ERROR_CREATED) {
          const data = payload as { message: string; context: string };
          callback(data.message, data.context);
        }
      });
    },
  },

  // Requirements: settings.1.26
  /**
   * Settings API
   * Provides methods for managing application settings including AI Agent configuration
   */
  settings: {
    /**
     * Save LLM provider selection
     * Requirements: settings.1.9, settings.1.26
     * @param {string} provider - LLM provider ('openai', 'anthropic', or 'google')
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async saveLLMProvider(
      provider: 'openai' | 'anthropic' | 'google'
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('settings:save-llm-provider', provider);
    },

    /**
     * Load LLM provider selection
     * Returns 'openai' as default if not found
     * Requirements: settings.1.20, settings.1.21, settings.1.26
     * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
     */
    async loadLLMProvider(): Promise<{
      success: boolean;
      provider?: 'openai' | 'anthropic' | 'google';
      error?: string;
    }> {
      return await ipcRenderer.invoke('settings:load-llm-provider');
    },

    /**
     * Save API key for specific provider
     * Key is encrypted when safeStorage is available
     * Requirements: settings.1.9, settings.1.13, settings.1.26
     * @param {string} provider - LLM provider ('openai', 'anthropic', or 'google')
     * @param {string} apiKey - API key to save
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async saveAPIKey(
      provider: 'openai' | 'anthropic' | 'google',
      apiKey: string
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('settings:save-api-key', provider, apiKey);
    },

    /**
     * Load API key for specific provider
     * Decrypts key if it was encrypted
     * Requirements: settings.1.20, settings.1.22, settings.1.26
     * @param {string} provider - LLM provider ('openai', 'anthropic', or 'google')
     * @returns {Promise<{success: boolean, apiKey?: string | null, error?: string}>}
     */
    async loadAPIKey(
      provider: 'openai' | 'anthropic' | 'google'
    ): Promise<{ success: boolean; apiKey?: string | null; error?: string }> {
      return await ipcRenderer.invoke('settings:load-api-key', provider);
    },

    /**
     * Delete API key for specific provider
     * Requirements: settings.1.11, settings.1.26
     * @param {string} provider - LLM provider ('openai', 'anthropic', or 'google')
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteAPIKey(
      provider: 'openai' | 'anthropic' | 'google'
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('settings:delete-api-key', provider);
    },
  },

  // Requirements: settings.3
  /**
   * LLM API
   * Provides methods for testing LLM provider connections
   */
  llm: {
    /**
     * Test connection to LLM provider
     * Requirements: settings.3.4, settings.3.7, settings.3.8
     * @param {string} provider - LLM provider ('openai', 'anthropic', or 'google')
     * @param {string} apiKey - API key to test
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async testConnection(
      provider: 'openai' | 'anthropic' | 'google',
      apiKey: string
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('llm:test-connection', { provider, apiKey });
    },
  },
};

// Requirements: testing.3.8
// Expose ipcRenderer in test environment for test IPC handlers
if (process.env.NODE_ENV === 'test') {
  api.test = {
    /**
     * Simulate data error for next operation
     * Requirements: testing.3.1, testing.3.2
     * @param {string} operation - Operation to simulate error for ('saveData', 'loadData', 'deleteData')
     * @param {string} errorMessage - Error message to return
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async simulateDataError(
      operation: 'saveData' | 'loadData' | 'deleteData',
      errorMessage: string
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('test:simulate-data-error', operation, errorMessage);
    },

    /**
     * Clear all error simulations
     * Requirements: testing.3.1, testing.3.2
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async clearDataErrors(): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('test:clear-data-errors');
    },
  };

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
