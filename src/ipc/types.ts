// Requirements: platform-foundation.3.3, platform-foundation.3.4
// IPC Channel Types and Interfaces

/**
 * Common result type for operations that can succeed or fail
 */
export interface OperationResult {
  success: boolean;
  error?: string;
}

/**
 * Authentication result with optional error message
 */
export interface AuthResult extends OperationResult {
  success: boolean;
  error?: string;
}

/**
 * Authentication state information
 */
export interface AuthState {
  authorized: boolean;
}

/**
 * Sidebar state information
 */
export interface SidebarState {
  collapsed: boolean;
}

/**
 * Parameters for setting sidebar state
 */
export interface SetSidebarStateParams {
  collapsed: boolean;
}

/**
 * Performance metrics information
 */
export interface PerformanceMetrics {
  latest: {
    memoryUsageMB: number;
    heapTotalMB: number;
    externalMB: number;
    cpuUser: number;
    cpuSystem: number;
    timestamp: number;
  } | null;
  averageMemoryUsageMB: number;
  uptime: number;
  pid: number;
}

/**
 * Security audit result
 */
export interface SecurityAuditResult {
  passed: boolean;
  results: Array<{
    contextIsolation: boolean;
    nodeIntegration: boolean;
    webSecurity: boolean;
    allowRunningInsecureContent: boolean;
    experimentalFeatures: boolean;
    preloadScript: string | null;
    timestamp: number;
    passed: boolean;
    issues: string[];
  }>;
  timestamp: number;
}

/**
 * IPC Channel Definitions
 * Maps channel names to their parameter and return types
 */
export interface IPCChannels {
  // Authentication channels
  "auth:open-google": {
    params: void;
    returns: AuthResult;
  };
  "auth:get-state": {
    params: void;
    returns: AuthState;
  };
  "auth:sign-out": {
    params: void;
    returns: OperationResult;
  };

  // Sidebar channels
  "sidebar:get-state": {
    params: void;
    returns: SidebarState;
  };
  "sidebar:set-state": {
    params: SetSidebarStateParams;
    returns: OperationResult;
  };

  // Performance channels
  "performance:get-metrics": {
    params: void;
    returns: PerformanceMetrics;
  };

  // Security channels
  "security:audit": {
    params: void;
    returns: SecurityAuditResult;
  };
}

/**
 * IPC Event Definitions
 * Maps event names to their payload types
 */
export interface IPCEvents {
  "auth:result": AuthResult;
}

/**
 * Type helper to extract parameter type for a given channel
 */
export type IPCChannelParams<T extends keyof IPCChannels> = IPCChannels[T]["params"];

/**
 * Type helper to extract return type for a given channel
 */
export type IPCChannelReturns<T extends keyof IPCChannels> = IPCChannels[T]["returns"];

/**
 * Type helper to extract event payload type for a given event
 */
export type IPCEventPayload<T extends keyof IPCEvents> = IPCEvents[T];

/**
 * Union type of all available IPC channel names
 */
export type IPCChannelName = keyof IPCChannels;

/**
 * Union type of all available IPC event names
 */
export type IPCEventName = keyof IPCEvents;
