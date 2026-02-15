// Requirements: settings.1.9, settings.1.26

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AIAgentSettingsManager } from './AIAgentSettingsManager';
import { Logger } from './Logger';
import type { LLMProvider } from '../types';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * IPC result interface
 * Requirements: settings.1.9, settings.1.26
 */
interface IPCResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Settings IPC Handlers
 * Manages IPC communication between renderer and main processes for application settings
 * Requirements: settings.1.9, settings.1.26
 */
export class SettingsIPCHandlers {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('SettingsIPCHandlers');
  private aiAgentSettingsManager: AIAgentSettingsManager;
  private handlersRegistered: boolean = false;

  constructor(aiAgentSettingsManager: AIAgentSettingsManager) {
    this.aiAgentSettingsManager = aiAgentSettingsManager;
  }

  /**
   * Register all settings IPC handlers
   * Requirements: settings.1.26
   */
  registerHandlers(): void {
    if (this.handlersRegistered) {
      this.logger.warn('Handlers already registered');
      return;
    }

    ipcMain.handle('settings:save-llm-provider', this.handleSaveLLMProvider.bind(this));
    ipcMain.handle('settings:load-llm-provider', this.handleLoadLLMProvider.bind(this));
    ipcMain.handle('settings:save-api-key', this.handleSaveAPIKey.bind(this));
    ipcMain.handle('settings:load-api-key', this.handleLoadAPIKey.bind(this));
    ipcMain.handle('settings:delete-api-key', this.handleDeleteAPIKey.bind(this));

    this.handlersRegistered = true;
    this.logger.info('Handlers registered');
  }

  /**
   * Unregister all settings IPC handlers
   * Requirements: settings.1.26
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
    this.logger.info('Handlers unregistered');
  }

  /**
   * Handle save LLM provider request
   * Requirements: settings.1.9, settings.1.26
   * @param event IPC event
   * @param provider LLM provider to save ('openai', 'anthropic', or 'google')
   * @returns IPC result with success status
   */
  private async handleSaveLLMProvider(
    _event: IpcMainInvokeEvent,
    provider: LLMProvider
  ): Promise<IPCResult> {
    try {
      this.logger.info(`Saving LLM provider: ${provider}`);

      // Requirements: settings.1.9 - Save LLM provider through AIAgentSettingsManager
      await this.aiAgentSettingsManager.saveLLMProvider(provider);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save LLM provider: ${errorMessage}`);

      // Requirements: settings.1.9 - Return structured error response
      return {
        success: false,
        error: errorMessage || 'Failed to save LLM provider',
      };
    }
  }

  /**
   * Handle load LLM provider request
   * Requirements: settings.1.20, settings.1.21, settings.1.26
   * @param event IPC event
   * @returns IPC result with provider or default value
   */
  private async handleLoadLLMProvider(_event: IpcMainInvokeEvent): Promise<IPCResult> {
    try {
      this.logger.info('Loading LLM provider');

      // Requirements: settings.1.20, settings.1.21 - Load LLM provider, return 'openai' as default
      const provider = await this.aiAgentSettingsManager.loadLLMProvider();

      return {
        success: true,
        data: { provider },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load LLM provider: ${errorMessage}`);

      // Requirements: settings.1.21 - Return default provider on error
      return {
        success: true,
        data: { provider: 'openai' as const },
      };
    }
  }

  /**
   * Handle save API key request
   * Requirements: settings.1.9, settings.1.13, settings.1.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @param apiKey API key to save
   * @returns IPC result with success status
   */
  private async handleSaveAPIKey(
    _event: IpcMainInvokeEvent,
    provider: LLMProvider,
    apiKey: string
  ): Promise<IPCResult> {
    try {
      this.logger.info(`Saving API key for provider: ${provider}`);

      // Requirements: settings.1.9 - Save API key through AIAgentSettingsManager
      await this.aiAgentSettingsManager.saveAPIKey(provider, apiKey);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save API key: ${errorMessage}`);

      // Requirements: settings.1.13 - Return structured error response
      return {
        success: false,
        error: errorMessage || 'Failed to save API key',
      };
    }
  }

  /**
   * Handle load API key request
   * Requirements: settings.1.20, settings.1.22, settings.1.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @returns IPC result with API key or null
   */
  private async handleLoadAPIKey(
    _event: IpcMainInvokeEvent,
    provider: LLMProvider
  ): Promise<IPCResult> {
    try {
      this.logger.info(`Loading API key for provider: ${provider}`);

      // Requirements: settings.1.20, settings.1.22 - Load API key, decrypt if encrypted
      const apiKey = await this.aiAgentSettingsManager.loadAPIKey(provider);

      return {
        success: true,
        data: { apiKey },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load API key: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage || 'Failed to load API key',
      };
    }
  }

  /**
   * Handle delete API key request
   * Requirements: settings.1.11, settings.1.26
   * @param event IPC event
   * @param provider LLM provider ('openai', 'anthropic', or 'google')
   * @returns IPC result with success status
   */
  private async handleDeleteAPIKey(
    _event: IpcMainInvokeEvent,
    provider: LLMProvider
  ): Promise<IPCResult> {
    try {
      this.logger.info(`Deleting API key for provider: ${provider}`);

      // Requirements: settings.1.11 - Delete API key through AIAgentSettingsManager
      await this.aiAgentSettingsManager.deleteAPIKey(provider);

      return {
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete API key: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage || 'Failed to delete API key',
      };
    }
  }
}
