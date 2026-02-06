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
 * Requirements: clerkly.1, google-oauth-auth.8, ui.6.2, ui.6.5
 */
export interface API {
  saveData: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
  // Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, ui.6.2, ui.6.5
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
    onAuthSuccess: (callback: () => void) => void;
    onAuthError: (callback: (error: string, errorCode?: string) => void) => void;
    onLogout: (callback: () => void) => void;
  };
}

/**
 * User profile data from Google UserInfo API
 * Requirements: ui.6.2, ui.6.3
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
   * URL to user's profile picture (optional)
   */
  picture?: string;

  /**
   * Unix timestamp of when the profile was last updated
   * Used for tracking profile freshness
   */
  lastUpdated: number;
}

/**
 * Global window interface extension for renderer process
 */
declare global {
  interface Window {
    api: API;
  }
}
