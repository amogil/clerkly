// Requirements: ui.10.9, ui.10.10, ui.10.11, ui.10.14, ui.10.15, ui.10.22

import { DataManager } from './DataManager';
import { safeStorage } from 'electron';

/**
 * Manages AI Agent settings including LLM provider selection and API key storage
 * Handles encryption/decryption of API keys using Electron's safeStorage
 * Falls back to plain text storage when encryption is unavailable
 *
 * Requirements: ui.10.9, ui.10.10, ui.10.11, ui.10.14, ui.10.15, ui.10.22
 */
export class AIAgentSettingsManager {
  private dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * Save LLM provider selection
   * Saves immediately without debounce
   *
   * Requirements: ui.10.10
   *
   * @param provider - The LLM provider to save ('openai', 'anthropic', or 'google')
   * @throws Error if save operation fails
   */
  async saveLLMProvider(provider: 'openai' | 'anthropic' | 'google'): Promise<void> {
    try {
      const result = this.dataManager.saveData('ai_agent_llm_provider', provider);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save LLM provider');
      }

      console.log('[AIAgentSettingsManager] LLM provider saved:', provider);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIAgentSettingsManager] Failed to save LLM provider:', errorMessage);
      throw error;
    }
  }

  /**
   * Load LLM provider selection
   * Returns 'openai' as default if not found
   *
   * Requirements: ui.10.10
   *
   * @returns The saved LLM provider or 'openai' as default
   */
  async loadLLMProvider(): Promise<'openai' | 'anthropic' | 'google'> {
    try {
      const result = this.dataManager.loadData('ai_agent_llm_provider');

      if (!result.success || !result.data) {
        console.log('[AIAgentSettingsManager] No LLM provider found, using default: openai');
        return 'openai';
      }

      const provider = result.data as 'openai' | 'anthropic' | 'google';
      console.log('[AIAgentSettingsManager] LLM provider loaded:', provider);
      return provider;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIAgentSettingsManager] Failed to load LLM provider:', errorMessage);
      return 'openai';
    }
  }

  /**
   * Save API key for specific provider with encryption
   * Attempts to encrypt using safeStorage.encryptString()
   * Falls back to plain text if encryption is unavailable
   * Stores encryption status flag separately
   *
   * Requirements: ui.10.9, ui.10.14, ui.10.15
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @param apiKey - The API key to save
   * @throws Error if save operation fails
   */
  async saveAPIKey(provider: 'openai' | 'anthropic' | 'google', apiKey: string): Promise<void> {
    try {
      let storedKey: string;
      let isEncrypted: boolean;

      // Requirements: ui.10.14, ui.10.15 - Try to encrypt, fallback to plain text
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(apiKey);
        storedKey = buffer.toString('base64');
        isEncrypted = true;
        console.log(`[AIAgentSettingsManager] API key encrypted for ${provider}`);
      } else {
        storedKey = apiKey;
        isEncrypted = false;
        console.log(
          `[AIAgentSettingsManager] Encryption unavailable, storing plain text for ${provider}`
        );
      }

      // Save the key
      const keyResult = this.dataManager.saveData(`ai_agent_api_key_${provider}`, storedKey);
      if (!keyResult.success) {
        throw new Error(keyResult.error || 'Failed to save API key');
      }

      // Save encryption status flag
      const flagResult = this.dataManager.saveData(
        `ai_agent_api_key_${provider}_encrypted`,
        isEncrypted
      );
      if (!flagResult.success) {
        throw new Error(flagResult.error || 'Failed to save encryption flag');
      }

      console.log(`[AIAgentSettingsManager] API key saved for ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AIAgentSettingsManager] Failed to save API key for ${provider}:`,
        errorMessage
      );
      throw error;
    }
  }

  /**
   * Load API key for specific provider
   * Decrypts using safeStorage.decryptString() if key was encrypted
   * Returns plain text if key was stored without encryption
   *
   * Requirements: ui.10.22
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @returns The API key or null if not found
   */
  async loadAPIKey(provider: 'openai' | 'anthropic' | 'google'): Promise<string | null> {
    try {
      const keyResult = this.dataManager.loadData(`ai_agent_api_key_${provider}`);
      const encryptedResult = this.dataManager.loadData(`ai_agent_api_key_${provider}_encrypted`);

      if (!keyResult.success || !keyResult.data) {
        console.log(`[AIAgentSettingsManager] No API key found for ${provider}`);
        return null;
      }

      const storedKey = keyResult.data as string;
      const isEncrypted = encryptedResult.success && encryptedResult.data === true;

      // Requirements: ui.10.22 - Decrypt if encrypted
      if (isEncrypted) {
        const buffer = Buffer.from(storedKey, 'base64');
        const decryptedKey = safeStorage.decryptString(buffer);
        console.log(`[AIAgentSettingsManager] API key decrypted for ${provider}`);
        return decryptedKey;
      }

      console.log(`[AIAgentSettingsManager] API key loaded (plain text) for ${provider}`);
      return storedKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AIAgentSettingsManager] Failed to load API key for ${provider}:`,
        errorMessage
      );
      return null;
    }
  }

  /**
   * Delete API key for specific provider
   * Removes both the key and encryption status flag
   *
   * Requirements: ui.10.11
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'google')
   * @throws Error if delete operation fails
   */
  async deleteAPIKey(provider: 'openai' | 'anthropic' | 'google'): Promise<void> {
    try {
      // Delete the key
      const keyResult = this.dataManager.deleteData(`ai_agent_api_key_${provider}`);

      // Delete encryption flag (ignore errors if flag doesn't exist)
      this.dataManager.deleteData(`ai_agent_api_key_${provider}_encrypted`);

      if (!keyResult.success && keyResult.error !== 'Key not found') {
        throw new Error(keyResult.error || 'Failed to delete API key');
      }

      console.log(`[AIAgentSettingsManager] API key deleted for ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AIAgentSettingsManager] Failed to delete API key for ${provider}:`,
        errorMessage
      );
      throw error;
    }
  }
}
