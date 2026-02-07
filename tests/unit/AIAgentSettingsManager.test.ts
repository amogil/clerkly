/* Preconditions: Mock DataManager and Electron safeStorage
   Action: Test AIAgentSettingsManager methods for saving, loading, and deleting settings
   Assertions: Verify correct behavior with encryption, plain text fallback, and error handling
   Requirements: ui.10.9, ui.10.10, ui.10.11, ui.10.14, ui.10.15, ui.10.22 */

import { AIAgentSettingsManager } from '../../src/main/AIAgentSettingsManager';
import { DataManager } from '../../src/main/DataManager';

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
  let mockDataManager: jest.Mocked<DataManager>;
  let mockSafeStorage: {
    isEncryptionAvailable: jest.Mock;
    encryptString: jest.Mock;
    decryptString: jest.Mock;
  };

  beforeEach(() => {
    // Create mock DataManager
    mockDataManager = {
      saveData: jest.fn(),
      loadData: jest.fn(),
      deleteData: jest.fn(),
    } as unknown as jest.Mocked<DataManager>;

    // Get mock safeStorage
    const electron = require('electron');
    mockSafeStorage = electron.safeStorage;

    // Reset all mocks
    jest.clearAllMocks();

    // Create manager instance
    manager = new AIAgentSettingsManager(mockDataManager);
  });

  describe('saveLLMProvider', () => {
    /* Preconditions: DataManager is mocked to return success
       Action: Call saveLLMProvider with a valid provider
       Assertions: Verify DataManager.saveData is called with correct key and value
       Requirements: ui.10.10 */
    it('should save LLM provider successfully', async () => {
      mockDataManager.saveData.mockReturnValue({ success: true });

      await manager.saveLLMProvider('openai');

      expect(mockDataManager.saveData).toHaveBeenCalledWith('ai_agent_llm_provider', 'openai');
    });

    /* Preconditions: DataManager is mocked to return success
       Action: Call saveLLMProvider with each valid provider
       Assertions: Verify all providers can be saved
       Requirements: ui.10.10 */
    it('should save all provider types', async () => {
      mockDataManager.saveData.mockReturnValue({ success: true });

      await manager.saveLLMProvider('openai');
      await manager.saveLLMProvider('anthropic');
      await manager.saveLLMProvider('google');

      expect(mockDataManager.saveData).toHaveBeenCalledTimes(3);
      expect(mockDataManager.saveData).toHaveBeenNthCalledWith(
        1,
        'ai_agent_llm_provider',
        'openai'
      );
      expect(mockDataManager.saveData).toHaveBeenNthCalledWith(
        2,
        'ai_agent_llm_provider',
        'anthropic'
      );
      expect(mockDataManager.saveData).toHaveBeenNthCalledWith(
        3,
        'ai_agent_llm_provider',
        'google'
      );
    });

    /* Preconditions: DataManager is mocked to return failure
       Action: Call saveLLMProvider
       Assertions: Verify error is thrown
       Requirements: ui.10.10 */
    it('should throw error when save fails', async () => {
      mockDataManager.saveData.mockReturnValue({ success: false, error: 'Database error' });

      await expect(manager.saveLLMProvider('openai')).rejects.toThrow('Database error');
    });
  });

  describe('loadLLMProvider', () => {
    /* Preconditions: DataManager is mocked to return saved provider
       Action: Call loadLLMProvider
       Assertions: Verify correct provider is returned
       Requirements: ui.10.10 */
    it('should load saved LLM provider', async () => {
      mockDataManager.loadData.mockReturnValue({ success: true, data: 'anthropic' });

      const result = await manager.loadLLMProvider();

      expect(mockDataManager.loadData).toHaveBeenCalledWith('ai_agent_llm_provider');
      expect(result).toBe('anthropic');
    });

    /* Preconditions: DataManager is mocked to return no data
       Action: Call loadLLMProvider
       Assertions: Verify default 'openai' is returned
       Requirements: ui.10.10 */
    it('should return default openai when no provider is saved', async () => {
      mockDataManager.loadData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await manager.loadLLMProvider();

      expect(result).toBe('openai');
    });

    /* Preconditions: DataManager throws an error
       Action: Call loadLLMProvider
       Assertions: Verify default 'openai' is returned and error is logged
       Requirements: ui.10.10 */
    it('should return default openai on error', async () => {
      mockDataManager.loadData.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await manager.loadLLMProvider();

      expect(result).toBe('openai');
    });
  });

  describe('saveAPIKey', () => {
    /* Preconditions: safeStorage encryption is available, DataManager returns success
       Action: Call saveAPIKey with a test key
       Assertions: Verify key is encrypted and saved with encryption flag
       Requirements: ui.10.9, ui.10.14 */
    it('should encrypt and save API key when encryption is available', async () => {
      const testKey = 'test-api-key-123';
      const encryptedBuffer = Buffer.from('encrypted-data');

      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);
      mockDataManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('openai', testKey);

      expect(mockSafeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith(testKey);
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        encryptedBuffer.toString('base64')
      );
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai_encrypted',
        true
      );
    });

    /* Preconditions: safeStorage encryption is NOT available, DataManager returns success
       Action: Call saveAPIKey with a test key
       Assertions: Verify key is saved as plain text with encryption flag set to false
       Requirements: ui.10.15 */
    it('should save API key as plain text when encryption is unavailable', async () => {
      const testKey = 'test-api-key-456';

      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockDataManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('anthropic', testKey);

      expect(mockSafeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
      expect(mockDataManager.saveData).toHaveBeenCalledWith('ai_agent_api_key_anthropic', testKey);
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic_encrypted',
        false
      );
    });

    /* Preconditions: DataManager returns failure for key save
       Action: Call saveAPIKey
       Assertions: Verify error is thrown
       Requirements: ui.10.9 */
    it('should throw error when key save fails', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockDataManager.saveData.mockReturnValueOnce({ success: false, error: 'Database full' });

      await expect(manager.saveAPIKey('google', 'test-key')).rejects.toThrow('Database full');
    });

    /* Preconditions: DataManager returns failure for encryption flag save
       Action: Call saveAPIKey
       Assertions: Verify error is thrown
       Requirements: ui.10.9 */
    it('should throw error when encryption flag save fails', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      mockDataManager.saveData
        .mockReturnValueOnce({ success: true })
        .mockReturnValueOnce({ success: false, error: 'Database error' });

      await expect(manager.saveAPIKey('openai', 'test-key')).rejects.toThrow('Database error');
    });

    /* Preconditions: safeStorage encryption is available
       Action: Call saveAPIKey for each provider
       Assertions: Verify provider-specific keys are used
       Requirements: ui.10.9 */
    it('should use provider-specific keys for storage', async () => {
      const encryptedBuffer = Buffer.from('encrypted');
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);
      mockDataManager.saveData.mockReturnValue({ success: true });

      await manager.saveAPIKey('openai', 'key1');
      await manager.saveAPIKey('anthropic', 'key2');
      await manager.saveAPIKey('google', 'key3');

      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        expect.any(String)
      );
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic',
        expect.any(String)
      );
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_google',
        expect.any(String)
      );
    });
  });

  describe('loadAPIKey', () => {
    /* Preconditions: Encrypted key is stored in DataManager
       Action: Call loadAPIKey
       Assertions: Verify key is decrypted and returned
       Requirements: ui.10.22 */
    it('should decrypt and load encrypted API key', async () => {
      const encryptedKey = Buffer.from('encrypted-data').toString('base64');
      const decryptedKey = 'decrypted-api-key';

      mockDataManager.loadData
        .mockReturnValueOnce({ success: true, data: encryptedKey })
        .mockReturnValueOnce({ success: true, data: true });
      mockSafeStorage.decryptString.mockReturnValue(decryptedKey);

      const result = await manager.loadAPIKey('openai');

      expect(mockDataManager.loadData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockDataManager.loadData).toHaveBeenCalledWith('ai_agent_api_key_openai_encrypted');
      expect(mockSafeStorage.decryptString).toHaveBeenCalledWith(
        Buffer.from(encryptedKey, 'base64')
      );
      expect(result).toBe(decryptedKey);
    });

    /* Preconditions: Plain text key is stored in DataManager
       Action: Call loadAPIKey
       Assertions: Verify key is returned without decryption
       Requirements: ui.10.22 */
    it('should load plain text API key without decryption', async () => {
      const plainKey = 'plain-text-key';

      mockDataManager.loadData
        .mockReturnValueOnce({ success: true, data: plainKey })
        .mockReturnValueOnce({ success: true, data: false });

      const result = await manager.loadAPIKey('anthropic');

      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
      expect(result).toBe(plainKey);
    });

    /* Preconditions: No key is stored in DataManager
       Action: Call loadAPIKey
       Assertions: Verify null is returned
       Requirements: ui.10.22 */
    it('should return null when no API key is found', async () => {
      mockDataManager.loadData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await manager.loadAPIKey('google');

      expect(result).toBeNull();
    });

    /* Preconditions: DataManager throws an error
       Action: Call loadAPIKey
       Assertions: Verify null is returned and error is logged
       Requirements: ui.10.22 */
    it('should return null on error', async () => {
      mockDataManager.loadData.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await manager.loadAPIKey('openai');

      expect(result).toBeNull();
    });

    /* Preconditions: Encrypted key is stored but decryption fails
       Action: Call loadAPIKey
       Assertions: Verify null is returned and error is logged
       Requirements: ui.10.22 */
    it('should return null when decryption fails', async () => {
      const encryptedKey = Buffer.from('encrypted-data').toString('base64');

      mockDataManager.loadData
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
       Requirements: ui.10.22 */
    it('should treat key as plain text when encryption flag is missing', async () => {
      const plainKey = 'some-key';

      mockDataManager.loadData
        .mockReturnValueOnce({ success: true, data: plainKey })
        .mockReturnValueOnce({ success: false });

      const result = await manager.loadAPIKey('openai');

      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
      expect(result).toBe(plainKey);
    });
  });

  describe('deleteAPIKey', () => {
    /* Preconditions: API key exists in DataManager
       Action: Call deleteAPIKey
       Assertions: Verify both key and encryption flag are deleted
       Requirements: ui.10.11 */
    it('should delete API key and encryption flag', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: true });

      await manager.deleteAPIKey('openai');

      expect(mockDataManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockDataManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_openai_encrypted');
    });

    /* Preconditions: API key does not exist
       Action: Call deleteAPIKey
       Assertions: Verify no error is thrown (graceful handling)
       Requirements: ui.10.11 */
    it('should not throw error when key does not exist', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: false, error: 'Key not found' });

      await expect(manager.deleteAPIKey('anthropic')).resolves.not.toThrow();
    });

    /* Preconditions: DataManager returns database error
       Action: Call deleteAPIKey
       Assertions: Verify error is thrown
       Requirements: ui.10.11 */
    it('should throw error on database failure', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: false, error: 'Database locked' });

      await expect(manager.deleteAPIKey('google')).rejects.toThrow('Database locked');
    });

    /* Preconditions: Multiple providers have keys
       Action: Call deleteAPIKey for each provider
       Assertions: Verify provider-specific keys are deleted
       Requirements: ui.10.11 */
    it('should delete provider-specific keys', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: true });

      await manager.deleteAPIKey('openai');
      await manager.deleteAPIKey('anthropic');
      await manager.deleteAPIKey('google');

      expect(mockDataManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_openai');
      expect(mockDataManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_anthropic');
      expect(mockDataManager.deleteData).toHaveBeenCalledWith('ai_agent_api_key_google');
    });
  });

  describe('provider isolation', () => {
    /* Preconditions: Multiple providers with different API keys
       Action: Save and load keys for all three providers
       Assertions: Verify each provider has separate storage and correct keys are returned
       Requirements: ui.10.16, ui.10.19 */
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
      mockDataManager.saveData.mockReturnValue({ success: true });

      // Save keys for all providers
      await manager.saveAPIKey('openai', openaiKey);
      await manager.saveAPIKey('anthropic', anthropicKey);
      await manager.saveAPIKey('google', googleKey);

      // Verify each provider has unique storage keys
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_openai',
        expect.any(String)
      );
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_anthropic',
        expect.any(String)
      );
      expect(mockDataManager.saveData).toHaveBeenCalledWith(
        'ai_agent_api_key_google',
        expect.any(String)
      );

      // Setup load mocks for each provider
      mockDataManager.loadData.mockImplementation((key: string) => {
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
