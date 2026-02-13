// Requirements: clerkly.1
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
  pending: Array<{ version: number; name: string }>;
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
 * API exposed to renderer process via contextBridge
 * Requirements: clerkly.1, google-oauth-auth.8, account-profile.1.2, account-profile.1.5, error-notifications.1.1, settings.1.26, realtime-events.4.5
 */
export interface API {
  saveData: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, account-profile.1.2, account-profile.1.5
  auth: {
    startLogin: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ authorized: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    getProfile: () => Promise<{ success: boolean; profile?: UserProfile | null; error?: string }>;
    refreshProfile: () => Promise<{
      success: boolean;
      profile?: UserProfile | null;
      error?: string;
    }>;
    onAuthSuccess: (callback: () => void) => () => void;
    onAuthError: (callback: (error: string, errorCode?: string) => void) => () => void;
    onLogout: (callback: () => void) => () => void;
    onProfileUpdated: (callback: (profile: UserProfile | null) => void) => () => void;
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
  // Requirements: realtime-events.4.5, realtime-events.4.6, realtime-events.4.7
  events?: {
    onEvent: (callback: (type: string, payload: any) => void) => () => void;
    sendEvent: (type: string, payload: any) => void;
  };
}

/**
 * User profile data from Google UserInfo API
 * Requirements: account-profile.1.2, account-profile.1.3
 */
export interface UserProfile {
  /**
   * Unique user identifier from Google
   */
  id: string;

  /**
   * User's email address
   */
  email: string;

  /**
   * Whether the email has been verified
   */
  verified_email: boolean;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's given name (first name)
   */
  given_name: string;

  /**
   * User's family name (last name)
   */
  family_name: string;

  /**
   * User's locale/language preference
   */
  locale: string;

  /**
   * Unix timestamp of when the profile was last updated
   * Used for tracking profile freshness
   */
  lastUpdated: number;
}

/**
 * AI Agent Settings configuration
 * Requirements: settings.1.1, settings.1.16
 */
export interface AIAgentSettings {
  /**
   * Selected LLM provider for AI agent operations
   * Supported providers: OpenAI (GPT), Anthropic (Claude), Google (Gemini)
   * Requirements: settings.1.1
   */
  llmProvider: 'openai' | 'anthropic' | 'google';

  /**
   * API keys for each LLM provider
   * Each provider has separate storage for its API key
   * Keys are stored encrypted when safeStorage is available
   * Requirements: settings.1.16
   */
  apiKeys: {
    /**
     * OpenAI API key (optional)
     */
    openai?: string;

    /**
     * Anthropic API key (optional)
     */
    anthropic?: string;

    /**
     * Google API key (optional)
     */
    google?: string;
  };

  /**
   * Encryption status for each provider's API key
   * true: key is encrypted using safeStorage
   * false: key is stored as plain text (fallback when encryption unavailable)
   * Requirements: settings.1.14, settings.1.15, settings.1.17
   */
  encryptionStatus: {
    /**
     * OpenAI API key encryption status
     */
    openai?: boolean;

    /**
     * Anthropic API key encryption status
     */
    anthropic?: boolean;

    /**
     * Google API key encryption status
     */
    google?: boolean;
  };
}

/**
 * Global window interface extension for renderer process
 */
declare global {
  interface Window {
    api: API;
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}
