/* Preconditions: SettingsIPCHandlers is initialized with AIAgentSettingsManager
   Action: Test IPC handlers for AI Agent settings
   Assertions: Handlers correctly save LLM provider and handle errors
   Requirements: ui.10.9, ui.10.26 */

import { SettingsIPCHandlers } from '../../src/main/SettingsIPCHandlers';
import { AIAgentSettingsManager } from '../../src/main/AIAgentSettingsManager';
import { ipcMain } from 'electron';

// IPC result interface for type checking
interface IPCResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

// Mock Electron IPC
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
}));

// Mock AIAgentSettingsManager
jest.mock('../../src/main/AIAgentSettingsManager');

describe('SettingsIPCHandlers', () => {
  let settingsIPCHandlers: SettingsIPCHandlers;
  let mockAIAgentSettingsManager: jest.Mocked<AIAgentSettingsManager>;
  let mockHandlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock AIAgentSettingsManager
    mockAIAgentSettingsManager = {
      saveLLMProvider: jest.fn(),
      loadLLMProvider: jest.fn(),
      saveAPIKey: jest.fn(),
      loadAPIKey: jest.fn(),
      deleteAPIKey: jest.fn(),
    } as unknown as jest.Mocked<AIAgentSettingsManager>;

    // Track registered handlers
    mockHandlers = new Map();
    (ipcMain.handle as jest.Mock).mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        mockHandlers.set(channel, handler);
      }
    );

    // Create SettingsIPCHandlers instance
    settingsIPCHandlers = new SettingsIPCHandlers(mockAIAgentSettingsManager);
  });

  describe('registerHandlers', () => {
    /* Preconditions: SettingsIPCHandlers is created
       Action: Call registerHandlers()
       Assertions: IPC handlers are registered
       Requirements: ui.10.26 */
    it('should register settings IPC handlers', () => {
      settingsIPCHandlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith(
        'settings:save-llm-provider',
        expect.any(Function)
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'settings:load-llm-provider',
        expect.any(Function)
      );
      expect(ipcMain.handle).toHaveBeenCalledWith('settings:save-api-key', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('settings:load-api-key', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('settings:delete-api-key', expect.any(Function));
    });

    /* Preconditions: Handlers are already registered
       Action: Call registerHandlers() again
       Assertions: Warning is logged, handlers not registered twice
       Requirements: ui.10.26 */
    it('should not register handlers twice', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      settingsIPCHandlers.registerHandlers();
      settingsIPCHandlers.registerHandlers();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[SettingsIPCHandlers] Handlers already registered'
      );
      expect(ipcMain.handle).toHaveBeenCalledTimes(5);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('unregisterHandlers', () => {
    /* Preconditions: Handlers are registered
       Action: Call unregisterHandlers()
       Assertions: IPC handlers are unregistered
       Requirements: ui.10.26 */
    it('should unregister settings IPC handlers', () => {
      settingsIPCHandlers.registerHandlers();
      settingsIPCHandlers.unregisterHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:save-llm-provider');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:load-llm-provider');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:save-api-key');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:load-api-key');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('settings:delete-api-key');
    });

    /* Preconditions: Handlers are not registered
       Action: Call unregisterHandlers()
       Assertions: No error, removeHandler not called
       Requirements: ui.10.26 */
    it('should handle unregister when handlers not registered', () => {
      settingsIPCHandlers.unregisterHandlers();

      expect(ipcMain.removeHandler).not.toHaveBeenCalled();
    });
  });

  describe('settings:save-llm-provider handler', () => {
    beforeEach(() => {
      settingsIPCHandlers.registerHandlers();
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider succeeds
       Action: Call handler with 'openai' provider
       Assertions: saveLLMProvider is called, success response returned
       Requirements: ui.10.9, ui.10.26 */
    it('should save LLM provider successfully', async () => {
      mockAIAgentSettingsManager.saveLLMProvider.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-llm-provider');
      expect(handler).toBeDefined();

      const result = await handler!({} as any, 'openai');

      expect(mockAIAgentSettingsManager.saveLLMProvider).toHaveBeenCalledWith('openai');
      expect(result).toEqual({
        success: true,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider succeeds
       Action: Call handler with 'anthropic' provider
       Assertions: saveLLMProvider is called with correct provider
       Requirements: ui.10.9, ui.10.26 */
    it('should save anthropic provider', async () => {
      mockAIAgentSettingsManager.saveLLMProvider.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-llm-provider');
      const result = await handler!({} as any, 'anthropic');

      expect(mockAIAgentSettingsManager.saveLLMProvider).toHaveBeenCalledWith('anthropic');
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider succeeds
       Action: Call handler with 'google' provider
       Assertions: saveLLMProvider is called with correct provider
       Requirements: ui.10.9, ui.10.26 */
    it('should save google provider', async () => {
      mockAIAgentSettingsManager.saveLLMProvider.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-llm-provider');
      const result = await handler!({} as any, 'google');

      expect(mockAIAgentSettingsManager.saveLLMProvider).toHaveBeenCalledWith('google');
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider throws error
       Action: Call handler with 'openai' provider
       Assertions: Error is caught, structured error response returned
       Requirements: ui.10.9, ui.10.26 */
    it('should handle save errors and return structured response', async () => {
      const errorMessage = 'Database error';
      mockAIAgentSettingsManager.saveLLMProvider.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:save-llm-provider');
      const result = await handler!({} as any, 'openai');

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider throws non-Error
       Action: Call handler with 'openai' provider
       Assertions: Unknown error is handled, structured error response returned
       Requirements: ui.10.9, ui.10.26 */
    it('should handle unknown errors', async () => {
      mockAIAgentSettingsManager.saveLLMProvider.mockRejectedValue('Unknown error');

      const handler = mockHandlers.get('settings:save-llm-provider');
      const result = await handler!({} as any, 'openai');

      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveLLMProvider throws error
       Action: Call handler with 'openai' provider
       Assertions: Error is logged to console
       Requirements: ui.10.9, ui.10.26 */
    it('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorMessage = 'Database error';
      mockAIAgentSettingsManager.saveLLMProvider.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:save-llm-provider');
      await handler!({} as any, 'openai');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SettingsIPCHandlers] Failed to save LLM provider:',
        errorMessage
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('settings:load-llm-provider handler', () => {
    beforeEach(() => {
      settingsIPCHandlers.registerHandlers();
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadLLMProvider returns 'openai'
       Action: Call handler
       Assertions: loadLLMProvider is called, provider returned
       Requirements: ui.10.20, ui.10.21, ui.10.26 */
    it('should load LLM provider successfully', async () => {
      mockAIAgentSettingsManager.loadLLMProvider.mockResolvedValue('openai');

      const handler = mockHandlers.get('settings:load-llm-provider');
      expect(handler).toBeDefined();

      const result = await handler!({} as any);

      expect(mockAIAgentSettingsManager.loadLLMProvider).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        provider: 'openai',
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadLLMProvider returns 'anthropic'
       Action: Call handler
       Assertions: Correct provider returned
       Requirements: ui.10.20, ui.10.26 */
    it('should load anthropic provider', async () => {
      mockAIAgentSettingsManager.loadLLMProvider.mockResolvedValue('anthropic');

      const handler = mockHandlers.get('settings:load-llm-provider');
      const result = await handler!({} as any);

      expect((result as IPCResult).success).toBe(true);
      expect((result as IPCResult).provider).toBe('anthropic');
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadLLMProvider returns 'google'
       Action: Call handler
       Assertions: Correct provider returned
       Requirements: ui.10.20, ui.10.26 */
    it('should load google provider', async () => {
      mockAIAgentSettingsManager.loadLLMProvider.mockResolvedValue('google');

      const handler = mockHandlers.get('settings:load-llm-provider');
      const result = await handler!({} as any);

      expect((result as IPCResult).success).toBe(true);
      expect((result as IPCResult).provider).toBe('google');
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadLLMProvider throws error
       Action: Call handler
       Assertions: Default provider 'openai' returned
       Requirements: ui.10.21, ui.10.26 */
    it('should return default provider on error', async () => {
      mockAIAgentSettingsManager.loadLLMProvider.mockRejectedValue(new Error('Database error'));

      const handler = mockHandlers.get('settings:load-llm-provider');
      const result = await handler!({} as any);

      expect(result).toEqual({
        success: true,
        provider: 'openai',
      });
    });
  });

  describe('settings:save-api-key handler', () => {
    beforeEach(() => {
      settingsIPCHandlers.registerHandlers();
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveAPIKey succeeds
       Action: Call handler with provider and API key
       Assertions: saveAPIKey is called, success response returned
       Requirements: ui.10.9, ui.10.26 */
    it('should save API key successfully', async () => {
      mockAIAgentSettingsManager.saveAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-api-key');
      expect(handler).toBeDefined();

      const result = await handler!({} as any, 'openai', 'test-api-key-123');

      expect(mockAIAgentSettingsManager.saveAPIKey).toHaveBeenCalledWith(
        'openai',
        'test-api-key-123'
      );
      expect(result).toEqual({
        success: true,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveAPIKey succeeds
       Action: Call handler with anthropic provider
       Assertions: saveAPIKey called with correct provider
       Requirements: ui.10.9, ui.10.26 */
    it('should save API key for anthropic provider', async () => {
      mockAIAgentSettingsManager.saveAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-api-key');
      const result = await handler!({} as any, 'anthropic', 'anthropic-key');

      expect(mockAIAgentSettingsManager.saveAPIKey).toHaveBeenCalledWith(
        'anthropic',
        'anthropic-key'
      );
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveAPIKey succeeds
       Action: Call handler with google provider
       Assertions: saveAPIKey called with correct provider
       Requirements: ui.10.9, ui.10.26 */
    it('should save API key for google provider', async () => {
      mockAIAgentSettingsManager.saveAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:save-api-key');
      const result = await handler!({} as any, 'google', 'google-key');

      expect(mockAIAgentSettingsManager.saveAPIKey).toHaveBeenCalledWith('google', 'google-key');
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveAPIKey throws error
       Action: Call handler with provider and API key
       Assertions: Error is caught, structured error response returned
       Requirements: ui.10.13, ui.10.26 */
    it('should handle save errors and return structured response', async () => {
      const errorMessage = 'Encryption failed';
      mockAIAgentSettingsManager.saveAPIKey.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:save-api-key');
      const result = await handler!({} as any, 'openai', 'test-key');

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.saveAPIKey throws error
       Action: Call handler
       Assertions: Error is logged to console
       Requirements: ui.10.13, ui.10.26 */
    it('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorMessage = 'Encryption failed';
      mockAIAgentSettingsManager.saveAPIKey.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:save-api-key');
      await handler!({} as any, 'openai', 'test-key');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SettingsIPCHandlers] Failed to save API key:',
        errorMessage
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('settings:load-api-key handler', () => {
    beforeEach(() => {
      settingsIPCHandlers.registerHandlers();
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadAPIKey returns key
       Action: Call handler with provider
       Assertions: loadAPIKey is called, API key returned
       Requirements: ui.10.20, ui.10.22, ui.10.26 */
    it('should load API key successfully', async () => {
      mockAIAgentSettingsManager.loadAPIKey.mockResolvedValue('decrypted-api-key');

      const handler = mockHandlers.get('settings:load-api-key');
      expect(handler).toBeDefined();

      const result = await handler!({} as any, 'openai');

      expect(mockAIAgentSettingsManager.loadAPIKey).toHaveBeenCalledWith('openai');
      expect(result).toEqual({
        success: true,
        apiKey: 'decrypted-api-key',
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadAPIKey returns null
       Action: Call handler with provider
       Assertions: null returned when key not found
       Requirements: ui.10.20, ui.10.26 */
    it('should return null when API key not found', async () => {
      mockAIAgentSettingsManager.loadAPIKey.mockResolvedValue(null);

      const handler = mockHandlers.get('settings:load-api-key');
      const result = await handler!({} as any, 'anthropic');

      expect(mockAIAgentSettingsManager.loadAPIKey).toHaveBeenCalledWith('anthropic');
      expect(result).toEqual({
        success: true,
        apiKey: null,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadAPIKey succeeds
       Action: Call handler with google provider
       Assertions: loadAPIKey called with correct provider
       Requirements: ui.10.20, ui.10.22, ui.10.26 */
    it('should load API key for google provider', async () => {
      mockAIAgentSettingsManager.loadAPIKey.mockResolvedValue('google-api-key');

      const handler = mockHandlers.get('settings:load-api-key');
      const result = await handler!({} as any, 'google');

      expect(mockAIAgentSettingsManager.loadAPIKey).toHaveBeenCalledWith('google');
      expect((result as IPCResult).success).toBe(true);
      expect((result as IPCResult).apiKey).toBe('google-api-key');
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.loadAPIKey throws error
       Action: Call handler with provider
       Assertions: Error is caught, structured error response returned
       Requirements: ui.10.20, ui.10.26 */
    it('should handle load errors and return structured response', async () => {
      const errorMessage = 'Decryption failed';
      mockAIAgentSettingsManager.loadAPIKey.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:load-api-key');
      const result = await handler!({} as any, 'openai');

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });
  });

  describe('settings:delete-api-key handler', () => {
    beforeEach(() => {
      settingsIPCHandlers.registerHandlers();
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.deleteAPIKey succeeds
       Action: Call handler with provider
       Assertions: deleteAPIKey is called, success response returned
       Requirements: ui.10.11, ui.10.26 */
    it('should delete API key successfully', async () => {
      mockAIAgentSettingsManager.deleteAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:delete-api-key');
      expect(handler).toBeDefined();

      const result = await handler!({} as any, 'openai');

      expect(mockAIAgentSettingsManager.deleteAPIKey).toHaveBeenCalledWith('openai');
      expect(result).toEqual({
        success: true,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.deleteAPIKey succeeds
       Action: Call handler with anthropic provider
       Assertions: deleteAPIKey called with correct provider
       Requirements: ui.10.11, ui.10.26 */
    it('should delete API key for anthropic provider', async () => {
      mockAIAgentSettingsManager.deleteAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:delete-api-key');
      const result = await handler!({} as any, 'anthropic');

      expect(mockAIAgentSettingsManager.deleteAPIKey).toHaveBeenCalledWith('anthropic');
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.deleteAPIKey succeeds
       Action: Call handler with google provider
       Assertions: deleteAPIKey called with correct provider
       Requirements: ui.10.11, ui.10.26 */
    it('should delete API key for google provider', async () => {
      mockAIAgentSettingsManager.deleteAPIKey.mockResolvedValue();

      const handler = mockHandlers.get('settings:delete-api-key');
      const result = await handler!({} as any, 'google');

      expect(mockAIAgentSettingsManager.deleteAPIKey).toHaveBeenCalledWith('google');
      expect((result as IPCResult).success).toBe(true);
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.deleteAPIKey throws error
       Action: Call handler with provider
       Assertions: Error is caught, structured error response returned
       Requirements: ui.10.11, ui.10.26 */
    it('should handle delete errors and return structured response', async () => {
      const errorMessage = 'Database error';
      mockAIAgentSettingsManager.deleteAPIKey.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:delete-api-key');
      const result = await handler!({} as any, 'openai');

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });

    /* Preconditions: Handler is registered, AIAgentSettingsManager.deleteAPIKey throws error
       Action: Call handler
       Assertions: Error is logged to console
       Requirements: ui.10.11, ui.10.26 */
    it('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorMessage = 'Database error';
      mockAIAgentSettingsManager.deleteAPIKey.mockRejectedValue(new Error(errorMessage));

      const handler = mockHandlers.get('settings:delete-api-key');
      await handler!({} as any, 'openai');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SettingsIPCHandlers] Failed to delete API key:',
        errorMessage
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
