/* Preconditions: Mock UserSettingsManager and Electron safeStorage
   Action: Test AIAgentSettingsManager methods for saving, loading, and deleting settings
   Assertions: Verify correct behavior with encryption, plain text fallback, and error handling
   Requirements: settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.22 */

import { AIAgentSettingsManager } from '../../src/main/AIAgentSettingsManager';
import type { IUserSettingsManager } from '../../src/main/UserSettingsManager';

// Mock Electron
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn(),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  },
}));

describe('AIAgentSettingsManager', () => {
  let manager: AIAgentSettingsManager;
  let mockUserSettingsManager: jest.Mocked<IUserSettingsManager>;
  let mockSafeStorage: {
    isEncryptionAvailable: jest.Mock;
    encryptString: jest.Mock;
    decryptString: jest.Mock;
  };

  beforeEach(() => {
    // Create mock UserSettingsManager
    mockUserSettingsManager = {
      saveData: jest.fn(),
      loadData: jest.fn(),
      deleteData: jest.fn(),
    } as jest.Mocked<IUserSettingsManager>;

    // Get mock safeStorage
    const electron = require('electron');
    mockSafeStorage = electron.safeStorage;

    // Reset all mocks
    jest.clearAllMocks();

    // Create manager instance
    manager = new AIAgentSettingsManager(mockUserSettingsManager);
  });

  describe('saveLLMProvider', () => {
    /* Preconditions: UserSettingsManager is mocked to return success
       Action: Call saveLLMProvider with a valid provider
       Assertions: Verify UserSettingsManager.saveData is called with correct key and value
       Requirements: settings.1.10 */
    it('should save LLM provider successfully', async () => {
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      await manager.saveLLMProvider('openai');

      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_llm_provider',
        'openai'
      );
    });

    /* Preconditions: UserSettingsManager is mocked to return success
       Action: Call saveLLMProvider with each valid provider
       Assertions: Verify all providers can be saved
       Requirements: settings.1.10 */
    it('should save all provider types', async () => {
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      await manager.saveLLMProvider('openai');
      await manager.saveLLMProvider('anthropic');
      await manager.saveLLMProvider('google');

      expect(mockUserSettingsManager.saveData).toHaveBeenCalledTimes(3);
      expect(mockUserSettingsManager.saveData).toHaveBeenNthCalledWith(
        1,
        'ai_agent_llm_provider',
        'openai'
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenNthCalledWith(
        2,
        'ai_agent_llm_provider',
        'anthropic'
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenNthCalledWith(
        3,
        'ai_agent_llm_provider',
        'google'
      );
    });

    /* Preconditions: UserSettingsManager is mocked to return failure
       Action: Call saveLLMProvider
       Assertions: Verify error is thrown
       Requirements: settings.1.10 */
    it('should throw error when save fails', async () => {
      mockUserSettingsManager.saveData.mockReturnValue({ success: false, error: 'Database error' });

      await expect(manager.saveLLMProvider('openai')).rejects.toThrow('Database error');
    });

    /* Preconditions: UserSettingsManager is mocked to return failure without error message
       Action: Call saveLLMProvider
       Assertions: Verify fallback error message is used
       Requirements: settings.1.10 */
    it('should use fallback error message when error is empty', async () => {
      mockUserSettingsManager.saveData.mockReturnValue({ success: false });

      await expect(manager.saveLLMProvider('openai')).rejects.toThrow(
        'Failed to save LLM provider'
      );
    });
  });

  describe('loadLLMProvider', () => {
    /* Preconditions: UserSettingsManager is mocked to return saved provider
       Action: Call loadLLMProvider
       Assertions: Verify correct provider is returned
       Requirements: settings.1.10 */
    it('should load saved LLM provider', async () => {
      mockUserSettingsManager.loadData.mockReturnValue({ success: true, data: 'anthropic' });

      const result = await manager.loadLLMProvider();

      expect(mockUserSettingsManager.loadData).toHaveBeenCalledWith('ai_agent_llm_provider');
      expect(result).toBe('anthropic');
    });

    /* Preconditions: UserSettingsManager is mocked to return no data
       Action: Call loadLLMProvider
       Assertions: Verify default 'openai' is returned
       Requirements: settings.1.10 */
    it('should return default openai when no provider is saved', async () => {
      mockUserSettingsManager.loadData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await manager.loadLLMProvider();

      expect(result).toBe('openai');
    });

    /* Preconditions: UserSettingsManager throws an error
       Action: Call loadLLMProvider
       Assertions: Verify default 'openai' is returned and error is logged
       Requirements: settings.1.10 */
    it('should return default openai on error', async () => {
      mockUserSettingsManager.loadData.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await manager.loadLLMProvider();

      expect(result).toBe('openai');
    });
  });

  describe('saveAPIKey', () => {
    /* Preconditions: safeStorage encryption is available, UserSettingsManager returns success
       Action: Call saveAPIKey with a test key
       Assertions: Verify key is encrypted and saved with encryption flag
       Requirements: settings.1.9, settings.1.14 */
    it('should encrypt and save API key when encryption is available', async () => {
      const testKey = 'test-api-key-123';
      const encryptedBuffer = Buffer.from('encrypted-data');

      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('openai', testKey);

      expect(mockSafeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith(testKey);
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        encryptedBuffer.toString('base64')
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai_encrypted',
        true
      );
    });

    /* Preconditions: safeStorage encryption is NOT available, UserSettingsManager returns success
       Action: Call saveAPIKey with a test key
       Assertions: Verify key is saved as plain text with encryption flag set to false
       Requirements: settings.1.15 */
    it('should save API key as plain text when encryption is unavailable', async () => {
      const testKey = 'test-api-key-456';

      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('anthropic', testKey);

      expect(mockSafeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic',
        testKey
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic_encrypted',
        false
      );
    });

    /* Preconditions: UserSettingsManager returns failure for key save
       Action: Call saveAPIKey
       Assertions: Verify error is thrown
       Requirements: settings.1.9 */
    it('should throw error when key save fails', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockUserSettingsManager.saveData.mockReturnValueOnce({
        success: false,
        error: 'Database full',
      });

      await expect(manager.saveAPIKey('google', 'test-key')).rejects.toThrow('Database full');
    });

    /* Preconditions: UserSettingsManager returns failure for key save without error message
       Action: Call saveAPIKey
       Assertions: Verify fallback error message is used
       Requirements: settings.1.9 */
    it('should use fallback error message when key save error is empty', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockUserSettingsManager.saveData.mockReturnValueOnce({ success: false });

      await expect(manager.saveAPIKey('google', 'test-key')).rejects.toThrow(
        'Failed to save API key'
      );
    });

    /* Preconditions: UserSettingsManager returns failure for encryption flag save
       Action: Call saveAPIKey
       Assertions: Verify error is thrown
       Requirements: settings.1.9 */
    it('should throw error when encryption flag save fails', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockUserSettingsManager.saveData
        .mockReturnValueOnce({ success: true })
        .mockReturnValueOnce({ success: false, error: 'Database error' });

      await expect(manager.saveAPIKey('openai', 'test-key')).rejects.toThrow('Database error');
    });

    /* Preconditions: UserSettingsManager returns failure for encryption flag save without error message
       Action: Call saveAPIKey
       Assertions: Verify fallback error message is used
       Requirements: settings.1.9 */
    it('should use fallback error message when encryption flag save error is empty', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockUserSettingsManager.saveData
        .mockReturnValueOnce({ success: true })
        .mockReturnValueOnce({ success: false });

      await expect(manager.saveAPIKey('openai', 'test-key')).rejects.toThrow(
        'Failed to save encryption flag'
      );
    });

    /* Preconditions: safeStorage encryption is available
       Action: Call saveAPIKey for each provider
       Assertions: Verify provider-specific keys are used
       Requirements: settings.1.9 */
    it('should use provider-specific keys for storage', async () => {
      const encryptedBuffer = Buffer.from('encrypted');
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('openai', 'key1');
      await manager.saveAPIKey('anthropic', 'key2');
      await manager.saveAPIKey('google', 'key3');

      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        expect.any(String)
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic',
        expect.any(String)
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_google',
        expect.any(String)
      );
    });
  });

  describe('loadAPIKey', () => {
    /* Preconditions: CLERKLY_OPENAI_API_KEY env variable is set
       Action: Call loadAPIKey for openai provider
       Assertions: Returns env value without touching UserSettingsManager
       Requirements: settings.1.22 */
    it('should return API key from env variable when set', async () => {
      const envKey = 'env-api-key-from-process';
      process.env['CLERKLY_OPENAI_API_KEY'] = envKey;

      try {
        const result = await manager.loadAPIKey('openai');

        expect(result).toBe(envKey);
        expect(mockUserSettingsManager.loadData).not.toHaveBeenCalled();
        expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
      } finally {
        delete process.env['CLERKLY_OPENAI_API_KEY'];
      }
    });

    /* Preconditions: Encrypted key is stored in UserSettingsManager
       Action: Call loadAPIKey
       Assertions: Verify key is decrypted and returned
       Requirements: settings.1.22 */
    it('should decrypt and load encrypted API key', async () => {
      const encryptedKey = Buffer.from('encrypted-data').toString('base64');
      const decryptedKey = 'decrypted-api-key';

      mockUserSettingsManager.loadData
        .mockReturnValueOnce({ success: true, data: encryptedKey })
        .mockReturnValueOnce({ success: true, data: true });
      mockSafeStorage.decryptString.mockReturnValue(decryptedKey);

      const result = await manager.loadAPIKey('openai');

      expect(mockUserSettingsManager.loadData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockUserSettingsManager.loadData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai_encrypted'
      );
      expect(mockSafeStorage.decryptString).toHaveBeenCalledWith(
        Buffer.from(encryptedKey, 'base64')
      );
      expect(result).toBe(decryptedKey);
    });

    /* Preconditions: Plain text key is stored in UserSettingsManager
       Action: Call loadAPIKey
       Assertions: Verify key is returned without decryption
       Requirements: settings.1.22 */
    it('should load plain text API key without decryption', async () => {
      const plainKey = 'plain-text-key';

      mockUserSettingsManager.loadData
        .mockReturnValueOnce({ success: true, data: plainKey })
        .mockReturnValueOnce({ success: true, data: false });

      const result = await manager.loadAPIKey('anthropic');

      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
      expect(result).toBe(plainKey);
    });

    /* Preconditions: No key is stored in UserSettingsManager
       Action: Call loadAPIKey
       Assertions: Verify null is returned
       Requirements: settings.1.22 */
    it('should return null when no API key is found', async () => {
      mockUserSettingsManager.loadData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await manager.loadAPIKey('google');

      expect(result).toBeNull();
    });

    /* Preconditions: UserSettingsManager throws an error
       Action: Call loadAPIKey
       Assertions: Verify null is returned and error is logged
       Requirements: settings.1.22 */
    it('should return null on error', async () => {
      mockUserSettingsManager.loadData.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await manager.loadAPIKey('openai');

      expect(result).toBeNull();
    });

    /* Preconditions: Encrypted key is stored but decryption fails
       Action: Call loadAPIKey
       Assertions: Verify null is returned and error is logged
       Requirements: settings.1.22 */
    it('should return null when decryption fails', async () => {
      const encryptedKey = Buffer.from('encrypted-data').toString('base64');

      mockUserSettingsManager.loadData
        .mockReturnValueOnce({ success: true, data: encryptedKey })
        .mockReturnValueOnce({ success: true, data: true });
      mockSafeStorage.decryptString.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = await manager.loadAPIKey('openai');

      expect(result).toBeNull();
    });

    /* Preconditions: Encrypted flag is missing but key exists
       Action: Call loadAPIKey
       Assertions: Verify key is treated as plain text
       Requirements: settings.1.22 */
    it('should treat key as plain text when encryption flag is missing', async () => {
      const plainKey = 'some-key';

      mockUserSettingsManager.loadData
        .mockReturnValueOnce({ success: true, data: plainKey })
        .mockReturnValueOnce({ success: false });

      const result = await manager.loadAPIKey('openai');

      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
      expect(result).toBe(plainKey);
    });
  });

  describe('deleteAPIKey', () => {
    /* Preconditions: API key exists in UserSettingsManager
       Action: Call deleteAPIKey
       Assertions: Verify both key and encryption flag are deleted
       Requirements: settings.1.11 */
    it('should delete API key and encryption flag', async () => {
      mockUserSettingsManager.deleteData.mockReturnValue({ success: true });

      await manager.deleteAPIKey('openai');

      expect(mockUserSettingsManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockUserSettingsManager.deleteData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai_encrypted'
      );
    });

    /* Preconditions: API key does not exist
       Action: Call deleteAPIKey
       Assertions: Verify no error is thrown (graceful handling)
       Requirements: settings.1.11 */
    it('should not throw error when key does not exist', async () => {
      mockUserSettingsManager.deleteData.mockReturnValue({
        success: false,
        error: 'Key not found',
      });

      await expect(manager.deleteAPIKey('anthropic')).resolves.not.toThrow();
    });

    /* Preconditions: UserSettingsManager returns database error
       Action: Call deleteAPIKey
       Assertions: Verify error is thrown
       Requirements: settings.1.11 */
    it('should throw error on database failure', async () => {
      mockUserSettingsManager.deleteData.mockReturnValue({
        success: false,
        error: 'Database locked',
      });

      await expect(manager.deleteAPIKey('google')).rejects.toThrow('Database locked');
    });

    /* Preconditions: Multiple providers have keys
       Action: Call deleteAPIKey for each provider
       Assertions: Verify provider-specific keys are deleted
       Requirements: settings.1.11 */
    it('should delete provider-specific keys', async () => {
      mockUserSettingsManager.deleteData.mockReturnValue({ success: true });

      await manager.deleteAPIKey('openai');
      await manager.deleteAPIKey('anthropic');
      await manager.deleteAPIKey('google');

      expect(mockUserSettingsManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockUserSettingsManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_anthropic');
      expect(mockUserSettingsManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_google');
    });
  });

  describe('provider isolation', () => {
    /* Preconditions: Multiple providers with different API keys
       Action: Save and load keys for all three providers
       Assertions: Verify each provider has separate storage and correct keys are returned
       Requirements: settings.1.16, settings.1.19 */
    it('should maintain separate storage for each provider', async () => {
      const openaiKey = 'openai-key-123';
      const anthropicKey = 'anthropic-key-456';
      const googleKey = 'google-key-789';

      // Setup encryption
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockImplementation((key: string) =>
        Buffer.from(`encrypted-${key}`)
      );
      mockSafeStorage.decryptString.mockImplementation((buffer: Buffer) => {
        const encrypted = buffer.toString();
        return encrypted.replace('encrypted-', '');
      });
      mockUserSettingsManager.saveData.mockReturnValue({ success: true });

      // Save keys for all providers
      await manager.saveAPIKey('openai', openaiKey);
      await manager.saveAPIKey('anthropic', anthropicKey);
      await manager.saveAPIKey('google', googleKey);

      // Verify each provider has unique storage keys
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        expect.any(String)
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic',
        expect.any(String)
      );
      expect(mockUserSettingsManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_google',
        expect.any(String)
      );

      // Setup load mocks for each provider
      mockUserSettingsManager.loadData.mockImplementation((key: string) => {
        if (key === 'ai_agent_api_key_openai') {
          return { success: true, data: Buffer.from(`encrypted-${openaiKey}`).toString('base64') };
        }
        if (key === 'ai_agent_api_key_anthropic') {
          return {
            success: true,
            data: Buffer.from(`encrypted-${anthropicKey}`).toString('base64'),
          };
        }
        if (key === 'ai_agent_api_key_google') {
          return { success: true, data: Buffer.from(`encrypted-${googleKey}`).toString('base64') };
        }
        if (key.endsWith('_encrypted')) {
          return { success: true, data: true };
        }
        return { success: false };
      });

      // Load and verify each provider returns correct key
      const loadedOpenai = await manager.loadAPIKey('openai');
      const loadedAnthropic = await manager.loadAPIKey('anthropic');
      const loadedGoogle = await manager.loadAPIKey('google');

      expect(loadedOpenai).toBe(openaiKey);
      expect(loadedAnthropic).toBe(anthropicKey);
      expect(loadedGoogle).toBe(googleKey);
    });
  });
});
