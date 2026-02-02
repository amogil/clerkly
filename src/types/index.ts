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
 */
export interface API {
  saveData: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (key: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deleteData: (key: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Global window interface extension for renderer process
 */
declare global {
  interface Window {
    api: API;
  }
}
