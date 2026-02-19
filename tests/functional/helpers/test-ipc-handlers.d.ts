import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { UserSettingsManager } from '../../../src/main/UserSettingsManager';
/**
 * Register test IPC handlers
 *
 * Should be called during app initialization when NODE_ENV === 'test'
 */
export declare function registerTestIPCHandlers(
  tokenStorage: TokenStorageManager,
  data: UserSettingsManager
): void;
/**
 * Unregister test IPC handlers
 *
 * Should be called during app cleanup
 */
export declare function unregisterTestIPCHandlers(): void;
