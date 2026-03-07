/**
 * Window configuration options
 */
export interface WindowOptions {
  width?: number;
  height?: number;
  title?: string;
  resizable?: boolean;
  fullscreen?: boolean;
}
/**
 * Window settings for Mac OS X native interface
 */
export interface WindowSettings {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  titleBarStyle: string;
  vibrancy: string;
}
/**
 * Application initialization result
 */
export interface InitializeResult {
  success: boolean;
  loadTime?: number;
  migrations?: {
    success: boolean;
    appliedCount: number;
    message: string;
  };
  warning?: string;
  path?: string;
}
/**
 * Data operation result
 */
export interface SaveDataResult {
  success: boolean;
  error?: string;
}
export interface LoadDataResult {
  success: boolean;
  data?: any;
  error?: string;
}
export interface DeleteDataResult {
  success: boolean;
  error?: string;
}
/**
 * IPC communication result
 */
export interface IPCResult {
  success: boolean;
  data?: any;
  error?: string;
}
/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  appliedCount?: number;
  message?: string;
  error?: string;
}
/**
 * Migration status
 */
export interface MigrationStatus {
  currentVersion: number;
  appliedMigrations: number;
  pendingMigrations: number;
  totalMigrations: number;
  pending: Array<{
    version: number;
    name: string;
  }>;
}
/**
 * Migration file structure
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}
/**
 * UI render result
 */
export interface RenderResult {
  success: boolean;
  renderTime: number;
  performanceWarning?: boolean;
}
/**
 * UI update result
 */
export interface UpdateResult {
  success: boolean;
  updateTime: number;
  performanceWarning?: boolean;
}
/**
 * Loading indicator result
 */
export interface LoadingResult {
  success: boolean;
  duration?: number;
  error?: string;
}
/**
 * State operation result
 */
export interface StateResult {
  success: boolean;
  state?: Record<string, any>;
  error?: string;
}
/**
 * User data structure
 */
export interface UserData {
  key: string;
  value: any;
  timestamp: number;
}
/**
 * Application configuration
 */
export interface AppConfig {
  version: string;
  platform: string;
  minOSVersion: string;
  windowSettings: WindowSettings;
}
/**
 * Global window interface extension for renderer process
 * Note: Actual API type is defined in src/types/api.d.ts
 */
declare global {
  interface Window {
    api: {
      saveData: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
      loadData: (key: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
      events?: {
        onEvent: (callback: (type: string, payload: unknown) => void) => () => void;
        sendEvent: (type: string, payload: unknown) => void;
      };
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
      error: {
        onNotify: (callback: (message: string, context: string) => void) => () => void;
      };
      settings: {
        saveLLMProvider: (provider: string) => Promise<{ success: boolean; error?: string }>;
        loadLLMProvider: () => Promise<{ success: boolean; provider?: string; error?: string }>;
        saveAPIKey: (
          provider: string,
          apiKey: string
        ) => Promise<{ success: boolean; error?: string }>;
        loadAPIKey: (
          provider: string
        ) => Promise<{ success: boolean; apiKey?: string | null; error?: string }>;
        deleteAPIKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
      };
      llm: {
        testConnection: (
          provider: string,
          apiKey: string
        ) => Promise<{ success: boolean; error?: string }>;
      };
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
      messages: {
        list: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        create: (
          agentId: string,
          payload: unknown
        ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        update: (
          messageId: number,
          agentId: string,
          payload: unknown
        ) => Promise<{ success: boolean; error?: string }>;
        getLast: (agentId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        cancel: (agentId: string) => Promise<{ success: boolean; error?: string }>;
        retryLast: (agentId: string) => Promise<{ success: boolean; error?: string }>;
        cancelRetry: (
          agentId: string,
          userMessageId: number
        ) => Promise<{ success: boolean; error?: string }>;
      };
      test?: {
        simulateDataError: (
          operation: string,
          errorMessage: string
        ) => Promise<{ success: boolean; error?: string }>;
        clearDataErrors: () => Promise<{ success: boolean; error?: string }>;
        deleteCurrentUser: () => Promise<{ success: boolean; error?: string }>;
        createAgentWithOldMessage: (
          minutesAgo: number
        ) => Promise<{ success: boolean; agentId?: string; timestamp?: string; error?: string }>;
        createAgentMessage: (
          agentId: string,
          text: string
        ) => Promise<{ success: boolean; error?: string }>;
        setAgentStatus: (
          agentId: string,
          status: 'new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed'
        ) => Promise<{ success: boolean; error?: string }>;
      };
      ipcRenderer?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      };
    };
  }
}
//# sourceMappingURL=index.d.ts.map
