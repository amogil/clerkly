// Requirements: settings.2.4, settings.2.9

// Mock dependencies BEFORE imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

jest.mock('../../../src/main/llm/LLMProviderFactory');
jest.mock('../../../src/main/Logger', () => ({
  Logger: {
    create: jest.fn(() => mockLogger),
  },
}));

import { ipcMain } from 'electron';
import { registerLLMIPCHandlers } from '../../../src/main/llm/LLMIPCHandlers';
import { LLMProviderFactory } from '../../../src/main/llm/LLMProviderFactory';

describe('LLMIPCHandlers', () => {
  let mockProvider: any;
  let handler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock provider
    mockProvider = {
      testConnection: jest.fn(),
    };
    (LLMProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    // Register handlers and capture the handler function
    registerLLMIPCHandlers();
    handler = (ipcMain.handle as jest.Mock).mock.calls[0][1];
  });

  /* Preconditions: registerLLMIPCHandlers called
     Action: check ipcMain.handle registration
     Assertions: handler registered for 'llm:test-connection'
     Requirements: settings.2.4 */
  it('should register llm:test-connection handler', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('llm:test-connection', expect.any(Function));
    expect(mockLogger.info).toHaveBeenCalledWith('LLM IPC handlers registered');
  });

  /* Preconditions: Handler called with valid provider and API key
     Action: invoke handler with test parameters
     Assertions: returns success result and logs safely
     Requirements: settings.2.4, settings.2.9 */
  it('should handle successful test connection', async () => {
    mockProvider.testConnection.mockResolvedValueOnce({ success: true });

    const result = await handler(null, {
      provider: 'openai',
      apiKey: 'sk-test1234567890',
    });

    expect(result).toEqual({ success: true, data: { success: true }, error: undefined });
    expect(LLMProviderFactory.createProvider).toHaveBeenCalledWith('openai');
    expect(mockProvider.testConnection).toHaveBeenCalledWith('sk-test1234567890');

    // Requirements: settings.2.9 - Log only first 4 chars of API key
    expect(mockLogger.info).toHaveBeenCalledWith('Testing connection to openai (key: sk-t...)');
    expect(mockLogger.info).toHaveBeenCalledWith('Connection test successful for openai');
  });

  /* Preconditions: Handler called with invalid API key
     Action: invoke handler, provider returns error
     Assertions: returns error result and logs failure
     Requirements: settings.2.4, settings.2.9 */
  it('should handle failed test connection', async () => {
    mockProvider.testConnection.mockResolvedValueOnce({
      success: false,
      error: 'Invalid API key',
    });

    const result = await handler(null, {
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    expect(result).toEqual({ success: false, error: 'Invalid API key' });
    expect(LLMProviderFactory.createProvider).toHaveBeenCalledWith('anthropic');

    // Requirements: settings.2.9 - Log failure with error message
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Connection test failed for anthropic: Invalid API key'
    );
  });

  /* Preconditions: Handler called, provider throws exception
     Action: invoke handler, provider throws error
     Assertions: returns error result and logs exception
     Requirements: settings.2.4, settings.2.9 */
  it('should handle provider exception', async () => {
    const error = new Error('Network error');
    mockProvider.testConnection.mockRejectedValueOnce(error);

    const result = await handler(null, {
      provider: 'google',
      apiKey: 'test-key',
    });

    expect(result).toEqual({ success: false, error: 'Network error' });
    expect(mockLogger.error).toHaveBeenCalledWith(`Test connection failed: ${error}`);
  });

  /* Preconditions: Handler called, factory throws exception
     Action: invoke handler with unknown provider
     Assertions: returns error result and logs exception
     Requirements: settings.2.4, settings.2.9 */
  it('should handle factory exception', async () => {
    const error = new Error('Unknown provider: invalid');
    (LLMProviderFactory.createProvider as jest.Mock).mockImplementationOnce(() => {
      throw error;
    });

    const result = await handler(null, {
      provider: 'invalid' as any,
      apiKey: 'test-key',
    });

    expect(result).toEqual({ success: false, error: 'Unknown provider: invalid' });
    expect(mockLogger.error).toHaveBeenCalledWith(`Test connection failed: ${error}`);
  });

  /* Preconditions: Handler called with API key
     Action: invoke handler
     Assertions: logs only first 4 characters of API key
     Requirements: settings.2.9 */
  it('should log API key safely (only first 4 chars)', async () => {
    mockProvider.testConnection.mockResolvedValueOnce({ success: true });

    await handler(null, {
      provider: 'openai',
      apiKey: 'sk-1234567890abcdef',
    });

    // Requirements: settings.2.9 - Only first 4 chars logged
    expect(mockLogger.info).toHaveBeenCalledWith('Testing connection to openai (key: sk-1...)');

    // Verify full key is NOT logged
    const logCalls = mockLogger.info.mock.calls.map((call: any) => call[0]).join(' ');
    expect(logCalls).not.toContain('sk-1234567890abcdef');
  });

  /* Preconditions: Handler called with different providers
     Action: invoke handler multiple times with different providers
     Assertions: creates correct provider for each type
     Requirements: settings.2.4 */
  it('should handle different provider types', async () => {
    mockProvider.testConnection.mockResolvedValue({ success: true });

    await handler(null, { provider: 'openai', apiKey: 'key1' });
    await handler(null, { provider: 'anthropic', apiKey: 'key2' });
    await handler(null, { provider: 'google', apiKey: 'key3' });

    expect(LLMProviderFactory.createProvider).toHaveBeenCalledWith('openai');
    expect(LLMProviderFactory.createProvider).toHaveBeenCalledWith('anthropic');
    expect(LLMProviderFactory.createProvider).toHaveBeenCalledWith('google');
  });

  /* Preconditions: Handler called, provider throws non-Error object
     Action: invoke handler, provider throws string
     Assertions: returns 'Unknown error' message
     Requirements: settings.2.4 */
  it('should handle non-Error exception', async () => {
    mockProvider.testConnection.mockRejectedValueOnce('String error');

    const result = await handler(null, {
      provider: 'openai',
      apiKey: 'test-key',
    });

    expect(result).toEqual({ success: false, error: 'Unknown error' });
  });
});
