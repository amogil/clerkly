// Requirements: settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.22

import type { IUserSettingsManager } from './UserSettingsManager';
import { safeStorage } from 'electron';
import { Logger } from './Logger';
import type { LLMProvider } from '../types';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Manages AI Agent settings including LLM provider selection and API key storage
 * Handles encryption/decryption of API keys using Electron's safeStorage
 * Falls back to plain text storage when encryption is unavailable
 *
 * Requirements: settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.22
 */
export class AIAgentSettingsManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('AIAgentSettingsManager');
  private userSettingsManager: IUserSettingsManager;

  constructor(userSettingsManager: IUserSettingsManager) {
    this.userSettingsManager = userSettingsManager;
  }

  /**
   * Save LLM provider selection
   * Saves immediately without debounce
   *
   * Requirements: settings.1.10
   *
   * @param provider - The LLM provider to save ('openai', 'anthropic', or 'google')
   * @throws Error if save operation fails
   */
  async saveLLMProvider(provider: LLMProvider): Promise<void> {
    try {
      const result = this.userSettingsManager.saveData('ai_agent_llm_provider', provider);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save LLM provider');
      }

      this.logger.info(`LLM provider saved: ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save LLM provider: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Load LLM provider selection
   * Returns 'openai' as default if not found
   *
   * Requirements: settings.1.10
   *
   * @returns The saved LLM provider or 'openai' as default
   */
  async loadLLMProvider(): Promise<LLMProvider> {
    try {
      const result = this.userSettingsManager.loadData('ai_agent_llm_provider');

      if (!result.success || !result.data) {
        this.logger.info('No LLM provider found, using default: openai');
        return 'openai';
      }

      const provider = result.data as LLMProvider;
      this.logger.info(`LLM provider loaded: ${provider}`);
      return provider;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load LLM provider: ${errorMessage}`);
      return 'openai';
    }
  }

  /**
   * Save API key for specific provider with encryption
   * Attempts to encrypt using safeStorage.encryptString()
   * Falls back to plain text if encryption is unavailable
   * Stores encryption status flag separately
   *
   * Requirements: settings.1.9, settings.1.14, settings.1.15
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @param apiKey - The API key to save
   * @throws Error if save operation fails
   */
  async saveAPIKey(provider: LLMProvider, apiKey: string): Promise<void> {
    try {
      let storedKey: string;
      let isEncrypted: boolean;

      // Requirements: settings.1.14, settings.1.15 - Try to encrypt, fallback to plain text
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(apiKey);
        storedKey = buffer.toString('base64');
        isEncrypted = true;
        this.logger.info(`API key encrypted for ${provider}`);
      } else {
        storedKey = apiKey;
        isEncrypted = false;
        this.logger.info(`Encryption unavailable, storing plain text for ${provider}`);
      }

      // Save the key
      const keyResult = this.userSettingsManager.saveData(
        `ai_agent_api_key_${provider}`,
        storedKey
      );
      if (!keyResult.success) {
        throw new Error(keyResult.error || 'Failed to save API key');
      }

      // Save encryption status flag
      const flagResult = this.userSettingsManager.saveData(
        `ai_agent_api_key_${provider}_encrypted`,
        isEncrypted
      );
      if (!flagResult.success) {
        throw new Error(flagResult.error || 'Failed to save encryption flag');
      }

      this.logger.info(`API key saved for ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save API key for ${provider}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Load API key for specific provider
   * Decrypts using safeStorage.decryptString() if key was encrypted
   * Returns plain text if key was stored without encryption
   *
   * Requirements: settings.1.22
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @returns The API key or null if not found
   */
  async loadAPIKey(provider: LLMProvider): Promise<string | null> {
    try {
      // Check env variable first — takes priority over DB (useful for tests and CI)
      // Requirements: settings.1.22
      const envKey = process.env[`CLERKLY_${provider.toUpperCase()}_API_KEY`];
      if (envKey) {
        this.logger.info(`API key loaded from env for ${provider}`);
        return envKey;
      }

      const keyResult = this.userSettingsManager.loadData(`ai_agent_api_key_${provider}`);
      const encryptedResult = this.userSettingsManager.loadData(
        `ai_agent_api_key_${provider}_encrypted`
      );

      if (!keyResult.success || !keyResult.data) {
        this.logger.info(`No API key found for ${provider}`);
        return null;
      }

      const storedKey = keyResult.data as string;
      const isEncrypted = encryptedResult.success && encryptedResult.data === true;

      // Requirements: settings.1.22 - Decrypt if encrypted
      if (isEncrypted) {
        const buffer = Buffer.from(storedKey, 'base64');
        const decryptedKey = safeStorage.decryptString(buffer);
        this.logger.info(`API key decrypted for ${provider}`);
        return decryptedKey;
      }

      this.logger.info(`API key loaded (plain text) for ${provider}`);
      return storedKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load API key for ${provider}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Delete API key for specific provider
   * Removes both the key and encryption status flag
   *
   * Requirements: settings.1.11
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @throws Error if delete operation fails
   */
  async deleteAPIKey(provider: LLMProvider): Promise<void> {
    try {
      // Delete the key
      const keyResult = this.userSettingsManager.deleteData(`ai_agent_api_key_${provider}`);

      // Delete encryption flag (ignore errors if flag doesn't exist)
      this.userSettingsManager.deleteData(`ai_agent_api_key_${provider}_encrypted`);

      if (!keyResult.success && keyResult.error !== 'Key not found') {
        throw new Error(keyResult.error || 'Failed to delete API key');
      }

      this.logger.info(`API key deleted for ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete API key for ${provider}: ${errorMessage}`);
      throw error;
    }
  }
}
