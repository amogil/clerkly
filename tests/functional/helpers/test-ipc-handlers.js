"use strict";
// Requirements: testing.3.8
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTestIPCHandlers = registerTestIPCHandlers;
exports.unregisterTestIPCHandlers = unregisterTestIPCHandlers;
const electron_1 = require("electron");
/**
 * Test IPC Handlers
 *
 * Special IPC handlers that are only available in test environment.
 * These handlers allow Playwright tests to interact with the Electron app's
 * internal state without using better-sqlite3 directly.
 *
 * Requirements: testing.3.8 - Test helpers for functional tests
 */
let tokenStorageManager = null;
let dataManager = null;
/**
 * Register test IPC handlers
 *
 * Should be called during app initialization when NODE_ENV === 'test'
 */
function registerTestIPCHandlers(tokenStorage, data) {
    tokenStorageManager = tokenStorage;
    dataManager = data;
    // Setup test tokens
    electron_1.ipcMain.handle('test:setup-tokens', async (_event, tokens) => {
        if (!tokenStorageManager) {
            throw new Error('TokenStorageManager not initialized');
        }
        await tokenStorageManager.saveTokens({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
            token_type: tokens.tokenType || 'Bearer',
        });
        return { success: true };
    });
    // Clear all tokens
    electron_1.ipcMain.handle('test:clear-tokens', async () => {
        if (!tokenStorageManager) {
            throw new Error('TokenStorageManager not initialized');
        }
        await tokenStorageManager.clearTokens();
        return { success: true };
    });
    // Get token status
    electron_1.ipcMain.handle('test:get-token-status', async () => {
        if (!tokenStorageManager) {
            throw new Error('TokenStorageManager not initialized');
        }
        const tokens = await tokenStorageManager.getTokens();
        return {
            hasTokens: !!tokens,
            accessToken: tokens?.access_token ? '***' : null,
            refreshToken: tokens?.refresh_token ? '***' : null,
            expiresAt: tokens?.expires_at || null,
        };
    });
    // Clear all data
    electron_1.ipcMain.handle('test:clear-data', async () => {
        if (!dataManager) {
            throw new Error('DataManager not initialized');
        }
        // Clear all data from database
        const db = dataManager.db;
        db.prepare('DELETE FROM user_data').run();
        return { success: true };
    });
    console.log('[TEST] Test IPC handlers registered');
}
/**
 * Unregister test IPC handlers
 *
 * Should be called during app cleanup
 */
function unregisterTestIPCHandlers() {
    electron_1.ipcMain.removeHandler('test:setup-tokens');
    electron_1.ipcMain.removeHandler('test:clear-tokens');
    electron_1.ipcMain.removeHandler('test:get-token-status');
    electron_1.ipcMain.removeHandler('test:clear-data');
    tokenStorageManager = null;
    dataManager = null;
    console.log('[TEST] Test IPC handlers unregistered');
}
//# sourceMappingURL=test-ipc-handlers.js.map