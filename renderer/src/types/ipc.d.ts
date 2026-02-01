// Requirements: platform-foundation.3.3, platform-foundation.3.4
// Dedicated IPC type definitions for renderer process

import type {
  AuthResult,
  AuthState,
  OperationResult,
  IPCChannels,
  IPCEvents,
  IPCChannelName,
  IPCEventName,
} from "../../../src/ipc/types";

/**
 * Renderer-side IPC API interface
 * Defines the methods available on window.clerkly
 * Requirements: platform-foundation.3.3, platform-foundation.3.4, ui-cleanup.3.4, ui-cleanup.8.2
 */
export interface ClerklyAPI {
  // Authentication methods
  openGoogleAuth: () => Promise<AuthResult>;
  getAuthState: () => Promise<AuthState>;
  signOut: () => Promise<OperationResult>;

  // Event listeners
  onAuthResult: (callback: (result: AuthResult) => void) => () => void;
}

/**
 * Type-safe IPC invoke wrapper
 * Ensures type safety when calling IPC methods from renderer
 */
export type IPCInvoke = <T extends IPCChannelName>(
  channel: T,
  ...args: IPCChannels[T]["params"] extends void ? [] : [IPCChannels[T]["params"]]
) => Promise<IPCChannels[T]["returns"]>;

/**
 * Type-safe IPC event listener wrapper
 * Ensures type safety when listening to IPC events from renderer
 */
export type IPCEventListener = <T extends IPCEventName>(
  event: T,
  callback: (payload: IPCEvents[T]) => void,
) => () => void;

/**
 * Extended window interface for Clerkly application
 * This interface extends the global Window interface with Clerkly-specific API
 */
export interface ClerklyWindow extends Window {
  clerkly: ClerklyAPI;
}

// Re-export commonly used types for convenience
export type { AuthResult, AuthState, OperationResult, IPCChannelName, IPCEventName };
