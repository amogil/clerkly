// Requirements: ui.10.9, ui.10.26

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AIAgentSettingsManager } from './AIAgentSettingsManager';

/**
 * IPC result interface
 * Requirements: ui.10.9, ui.10.26
 */
interface IPCResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Settings IPC Handlers
 * Manages IPC communication between renderer and main processes for application settings
 * Requirements: ui.10.9, ui.10.26
 */
export class SettingsIPCHandlers {
  private aiAgentSettingsManager: AIAgentSettingsManager;
  private handlersRegistered: boolean = false;

  constructor(aiAgentSettingsManager: AIAgentSettingsManager) {
    this.aiAgentSettingsManager = aiAgentSettingsManager;
  }

  /**
   * Register all settings IPC handlers
   * Requirements: ui.10.26
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      console.warn('[SettingsIPCHandlers] Handlers already registered');
      return;
    }

    ipcMain.handle('settings:save-llm-provider', this.handleSaveLLMProvider.bind(this));
    ipcMain.handle('settings:load-llm-provider', this.handleLoadLLMProvider.bind(this));
    ipcMain.handle('settings:save-api-key', this.handleSaveAPIKey.bind(this));
    ipcMain.handle('settings:load-api-key', this.handleLoadAPIKey.bind(this));
    ipcMain.handle('settings:delete-api-key', this.handleDeleteAPIKey.bind(this));

    this.handlersRegistered = true;
    console.log('[SettingsIPCHandlers] Handlers registered');
  }

  /**
   * Unregister all settings IPC handlers
   * Requirements: ui.10.26
   */
  unregisterHandlers(): void {
    if (!this.handlersRegistered) {
      return;
    }

    ipcMain.removeHandler('settings:save-llm-provider');
    ipcMain.removeHandler('settings:load-llm-provider');
    ipcMain.removeHandler('settings:save-api-key');
    ipcMain.removeHandler('settings:load-api-key');
    ipcMain.removeHandler('settings:delete-api-key');

    this.handlersRegistered = false;
    console.log('[SettingsIPCHandlers] Handlers unregistered');
  }

  /**
   * Handle save LLM provider request
   * Requirements: ui.10.9, ui.10.26
   * @param event IPC event
   * @param provider LLM provider to save ('openai', 'anthropic', or 'google')
   * @returns IPC result with success status
   */
  private async handleSaveLLMProvider(
    _event: IpcMainInvokeEvent,
    provider: 'openai' | 'anthropic' | 'google'
  ): Promise<IPCResult> {
    try {
      console.log('[SettingsIPCHandlers] Saving LLM provider:', provider);

      // Requirements: ui.10.9 - Save LLM provider through AIAgentSettingsManager
      await this.aiAgentSettingsManager.saveLLMProvider(provider);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SettingsIPCHandlers] Failed to save LLM provider:', errorMessage);

      // Requirements: ui.10.9 - Return structured error response
      return {
        success: false,
        error: errorMessage || 'Failed to save LLM provider',
      };
    }
  }

  /**
   * Handle load LLM provider request
   * Requirements: ui.10.20, ui.10.21, ui.10.26
   * @param event IPC event
   * @returns IPC result with provider or default value
   */
  private async handleLoadLLMProvider(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      console.log('[SettingsIPCHandlers] Loading LLM provider');

      // Requirements: ui.10.20, ui.10.21 - Load LLM provider, return 'openai' as default
      const provider = await this.aiAgentSettingsManager.loadLLMProvider();

      return {
        success: true,
        provider,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SettingsIPCHandlers] Failed to load LLM provider:', errorMessage);

      // Requirements: ui.10.21 - Return default provider on error
      return {
        success: true,
        provider: 'openai',
      };
    }
  }

  /**
   * Handle save API key request
   * Requirements: ui.10.9, ui.10.13, ui.10.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @param apiKey API key to save
   * @returns IPC result with success status
   */
  private async handleSaveAPIKey(
    _event: IpcMainInvokeEvent,
    provider: 'openai' | 'anthropic' | 'google',
    apiKey: string
  ): Promise<IPCResult> {
    try {
      console.log('[SettingsIPCHandlers] Saving API key for provider:', provider);

      // Requirements: ui.10.9 - Save API key through AIAgentSettingsManager
      await this.aiAgentSettingsManager.saveAPIKey(provider, apiKey);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SettingsIPCHandlers] Failed to save API key:', errorMessage);

      // Requirements: ui.10.13 - Return structured error response
      return {
        success: false,
        error: errorMessage || 'Failed to save API key',
      };
    }
  }

  /**
   * Handle load API key request
   * Requirements: ui.10.20, ui.10.22, ui.10.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @returns IPC result with API key or null
   */
  private async handleLoadAPIKey(
    _event: IpcMainInvokeEvent,
    provider: 'openai' | 'anthropic' | 'google'
  ): Promise<IPCResult> {
    try {
      console.log('[SettingsIPCHandlers] Loading API key for provider:', provider);

      // Requirements: ui.10.20, ui.10.22 - Load API key, decrypt if encrypted
      const apiKey = await this.aiAgentSettingsManager.loadAPIKey(provider);

      return {
        success: true,
        apiKey,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SettingsIPCHandlers] Failed to load API key:', errorMessage);

      return {
        success: false,
        error: errorMessage || 'Failed to load API key',
      };
    }
  }

  /**
   * Handle delete API key request
   * Requirements: ui.10.11, ui.10.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @returns IPC result with success status
   */
  private async handleDeleteAPIKey(
    _event: IpcMainInvokeEvent,
    provider: 'openai' | 'anthropic' | 'google'
  ): Promise<IPCResult> {
    try {
      console.log('[SettingsIPCHandlers] Deleting API key for provider:', provider);

      // Requirements: ui.10.11 - Delete API key through AIAgentSettingsManager
      await this.aiAgentSettingsManager.deleteAPIKey(provider);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SettingsIPCHandlers] Failed to delete API key:', errorMessage);

      return {
        success: false,
        error: errorMessage || 'Failed to delete API key',
      };
    }
  }
}
