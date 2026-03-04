// Requirements: clerkly.1, clerkly.2
/**
 * Preload script for secure IPC communication
 * Exposes secure API to renderer process via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_TYPES } from '../shared/events/constants';
import type { User } from '../types';
import type { AppPhase, AppScreen } from '../shared/events/types';

// LLM Provider type (duplicated from types/index.ts due to rootDir restriction)
type LLMProvider = 'openai' | 'anthropic' | 'google';

// Message payload type for agents API (duplicated due to rootDir restriction)
// Requirements: agents.7.2, llm-integration.2
// Note: 'kind' is now a separate parameter, not part of payload
interface MessagePayloadAPI {
  timing?: {
    started_at: string;
    finished_at: string;
  };
  data: Record<string, unknown>;
}

/**
 * API interface for secure IPC communication
 * Exposed to renderer process via contextBridge
 */
export interface API {
  saveData: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
  app: {
    getState: () => Promise<{
      phase: AppPhase;
      authorized: boolean;
      targetScreen: AppScreen;
      reason?: string;
    }>;
  };
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
    getUser: () => Promise<{ success: boolean; user?: User; error?: string }>;
    refreshUser: () => Promise<{ success: boolean; user?: User; error?: string }>;
    onAuthSuccess: (callback: () => void) => () => void;
    onAuthError: (callback: (error: string, errorCode?: string) => void) => () => void;
    onLogout: (callback: () => void) => () => void;
    onUserUpdated: (callback: (user: User) => void) => () => void;
  };
  // Requirements: error-notifications.1.1
  error: {
    onNotify: (callback: (message: string, context: string) => void) => () => void;
  };
  // Requirements: settings.1.26
  settings: {
    saveLLMProvider: (provider: LLMProvider) => Promise<{ success: boolean; error?: string }>;
    loadLLMProvider: () => Promise<{
      success: boolean;
      provider?: LLMProvider;
      error?: string;
    }>;
    saveAPIKey: (
      provider: LLMProvider,
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>;
    loadAPIKey: (
      provider: LLMProvider
    ) => Promise<{ success: boolean; apiKey?: string | null; error?: string }>;
    deleteAPIKey: (provider: LLMProvider) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: settings.3
  llm: {
    testConnection: (
      provider: LLMProvider,
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: agents.2, agents.4, user-data-isolation.6.6
  agents: {
    create: (name?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    list: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
    get: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    update: (
      agentId: string,
      data: { name?: string }
    ) => Promise<{ success: boolean; error?: string }>;
    archive: (agentId: string) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: agents.4, agents.7, user-data-isolation.6.6
  messages: {
    list: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    listPaginated: (
      agentId: string,
      limit?: number,
      beforeId?: number
    ) => Promise<{
      success: boolean;
      data?: { messages: unknown[]; hasMore: boolean };
      error?: string;
    }>;
    create: (
      agentId: string,
      kind: string,
      payload: MessagePayloadAPI
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    update: (
      messageId: number,
      agentId: string,
      payload: MessagePayloadAPI
    ) => Promise<{ success: boolean; error?: string }>;
    getLast: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    // Requirements: llm-integration.8.1, llm-integration.8.7
    cancel: (agentId: string) => Promise<{ success: boolean; error?: string }>;
    // Requirements: llm-integration.3.7.3
    retryLast: (agentId: string) => Promise<{ success: boolean; error?: string }>;
    // Requirements: llm-integration.3.7.4
    cancelRetry: (
      agentId: string,
      userMessageId: number
    ) => Promise<{ success: boolean; error?: string }>;
  };
  // Requirements: testing.3.1, testing.3.2 - Test API methods (only available in test environment)
  test?: {
    simulateDataError: (
      operation: 'saveData' | 'loadData' | 'deleteData',
      errorMessage: string
    ) => Promise<{ success: boolean; error?: string }>;
    clearDataErrors: () => Promise<{ success: boolean; error?: string }>;
    deleteCurrentUser: () => Promise<{ success: boolean; error?: string }>;
    createAgentWithOldMessage: (
      minutesAgo: number
    ) => Promise<{ success: boolean; agentId?: string; timestamp?: string; error?: string }>;
  };
  // Requirements: testing.3.8 - Test IPC methods (only available in test environment)
  ipcRenderer?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
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

  app: {
    async getState(): Promise<{
      phase: AppPhase;
      authorized: boolean;
      targetScreen: AppScreen;
      reason?: string;
    }> {
      return await ipcRenderer.invoke('app:get-state');
    },
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
     * Get current user from database
     * Returns user data from users table
     * Requirements: account-profile.1.2
     * @returns {Promise<{success: boolean, user?: User, error?: string}>}
     */
    async getUser(): Promise<{ success: boolean; user?: User; error?: string }> {
      return await ipcRenderer.invoke('auth:get-user');
    },

    /**
     * Refresh user profile from Google API
     * Fetches fresh profile data from Google UserInfo API
     * Requirements: account-profile.1.5
     * @returns {Promise<{success: boolean, user?: User, error?: string}>}
     */
    async refreshUser(): Promise<{ success: boolean; user?: User; error?: string }> {
      return await ipcRenderer.invoke('auth:refresh-user');
    },

    /**
     * Listen for authentication success events via EventBus
     * Requirements: google-oauth-auth.8.4
     * @param {Function} callback - Callback function to execute on success
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onAuthSuccess(callback: () => void): () => void {
      // Use the events API to listen for auth.completed events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPES.AUTH_COMPLETED) {
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
      // Use the events API to listen for auth.failed and auth.cancelled events
      return api.events!.onEvent((type: string, payload: unknown) => {
        if (type === EVENT_TYPES.AUTH_FAILED) {
          const data = payload as { code: string; message: string };
          callback(data.message, data.code);
        } else if (type === EVENT_TYPES.AUTH_CANCELLED) {
          callback('User cancelled authentication', 'access_denied');
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
      // Use the events API to listen for auth.signed-out events
      return api.events!.onEvent((type: string) => {
        if (type === EVENT_TYPES.AUTH_SIGNED_OUT || type === EVENT_TYPES.USER_LOGOUT) {
          callback();
        }
      });
    },

    /**
     * Listen for user update events via EventBus
     * Requirements: account-profile.1.5
     * @param {Function} callback - Callback function to execute when user is updated
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onUserUpdated(callback: (user: User) => void): () => void {
      // Use the events API to listen for auth.completed events (profile is included)
      return api.events!.onEvent((type: string, payload: unknown) => {
        if (type === EVENT_TYPES.AUTH_COMPLETED) {
          const data = payload as { userId: string; profile: User };
          callback(data.profile);
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
        if (type === EVENT_TYPES.ERROR_CREATED) {
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

  // Requirements: agents.2, agents.4, user-data-isolation.6.6
  /**
   * Agents API
   * Provides methods for managing AI agents (chats)
   * userId is automatically injected by main process
   */
  agents: {
    /**
     * Create a new agent
     * Requirements: agents.2.3, agents.2.4, agents.2.5
     * @param {string} name - Optional agent name
     * @returns {Promise<{success: boolean, data?: Agent, error?: string}>}
     */
    async create(name?: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('agents:create', { name });
    },

    /**
     * List all non-archived agents for current user
     * Requirements: agents.1.3, agents.10.2
     * @returns {Promise<{success: boolean, data?: Agent[], error?: string}>}
     */
    async list(): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('agents:list');
    },

    /**
     * Get a specific agent by ID
     * Requirements: agents.3.2, agents.10.4
     * @param {string} agentId - Agent ID
     * @returns {Promise<{success: boolean, data?: Agent, error?: string}>}
     */
    async get(agentId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('agents:get', { agentId });
    },

    /**
     * Update an agent's name
     * Requirements: agents.10.4
     * @param {string} agentId - Agent ID
     * @param {object} data - Update data
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async update(
      agentId: string,
      data: { name?: string }
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('agents:update', { agentId, ...data });
    },

    /**
     * Archive an agent (soft delete)
     * Requirements: agents.10.4
     * @param {string} agentId - Agent ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async archive(agentId: string): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('agents:archive', { agentId });
    },
  },

  // Requirements: agents.4, agents.7, user-data-isolation.6.6
  /**
   * Messages API
   * Provides methods for managing agent messages
   * Access control is handled by main process through AgentsRepository
   */
  messages: {
    /**
     * List messages for an agent with pagination
     * Requirements: agents.13.1, agents.13.2, agents.13.4
     */
    async listPaginated(
      agentId: string,
      limit?: number,
      beforeId?: number
    ): Promise<{
      success: boolean;
      data?: { messages: unknown[]; hasMore: boolean };
      error?: string;
    }> {
      return await ipcRenderer.invoke('messages:list-paginated', { agentId, limit, beforeId });
    },

    /**
     * List all messages for an agent
     * Requirements: agents.4.8, user-data-isolation.7.6
     * @param {string} agentId - Agent ID
     * @returns {Promise<{success: boolean, data?: Message[], error?: string}>}
     */
    async list(agentId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('messages:list', { agentId });
    },

    /**
     * Get the last message for an agent (most recent)
     * Returns null if no messages exist
     * Requirements: agents.5.5
     * @param {string} agentId - Agent ID
     * @returns {Promise<{success: boolean, data?: Message | null, error?: string}>}
     */
    async getLast(agentId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('messages:get-last', { agentId });
    },

    /**
     * Create a new message for an agent
     * Requirements: agents.4.3, agents.7.1, agents.1.4
     * @param {string} agentId - Agent ID
     * @param {string} kind - Message kind ('user' | 'llm' | 'error' | ...)
     * @param {MessagePayloadAPI} payload - Message payload
     * @returns {Promise<{success: boolean, data?: Message, error?: string}>}
     */
    async create(
      agentId: string,
      kind: string,
      payload: MessagePayloadAPI
    ): Promise<{ success: boolean; data?: unknown; error?: string }> {
      return await ipcRenderer.invoke('messages:create', { agentId, kind, payload });
    },

    /**
     * Update a message's payload
     * Requirements: agents.7.1
     * @param {number} messageId - Message ID
     * @param {string} agentId - Agent ID (for access control)
     * @param {MessagePayloadAPI} payload - New message payload
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async update(
      messageId: number,
      agentId: string,
      payload: MessagePayloadAPI
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('messages:update', { messageId, agentId, payload });
    },

    /**
     * Cancel active LLM request for an agent
     * Requirements: llm-integration.8.1, llm-integration.8.7
     */
    async cancel(agentId: string): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('messages:cancel', { agentId });
    },

    /**
     * Retry last LLM request after rate limit countdown
     * Requirements: llm-integration.3.7.3
     */
    async retryLast(agentId: string): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('messages:retry-last', { agentId });
    },

    /**
     * Cancel rate limit retry — hides the user message
     * Requirements: llm-integration.3.7.4
     */
    async cancelRetry(
      agentId: string,
      userMessageId: number
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('messages:cancel-retry', { agentId, userMessageId });
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

    /**
     * Delete current user from database (for testing corrupted state)
     * Requirements: testing.3.1
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteCurrentUser(): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('test:delete-current-user');
    },

    /**
     * Create agent with old message timestamp for testing date updates
     * Requirements: testing.3.1
     * @param minutesAgo - How many minutes ago the message should be
     * @returns {Promise<{success: boolean, agentId?: string, timestamp?: string, error?: string}>}
     */
    async createAgentWithOldMessage(
      minutesAgo: number
    ): Promise<{ success: boolean; agentId?: string; timestamp?: string; error?: string }> {
      return await ipcRenderer.invoke('test:create-agent-with-old-message', minutesAgo);
    },

    /**
     * Create agent message for testing autoscroll behavior
     * Requirements: testing.3.1
     * @param agentId - Agent ID to create message for
     * @param text - Message text
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    // @ts-expect-error - Type will be added to api.test interface
    async createAgentMessage(
      agentId: string,
      text: string
    ): Promise<{ success: boolean; error?: string }> {
      return await ipcRenderer.invoke('test:create-agent-message', agentId, text);
    },
  };

  api.ipcRenderer = {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  };
}

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  },
});
