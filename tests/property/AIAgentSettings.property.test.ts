/* Preconditions: AIAgentSettingsManager is initialized with mocked DataManager and safeStorage
   Action: Test property-based scenarios for AI Agent Settings
   Assertions: Verify round-trip save/load, encryption, and provider switching
   Requirements: ui.10.4, ui.10.9, ui.10.11, ui.10.14, ui.10.17 */

import * as fc from 'fast-check';
import { AIAgentSettingsManager } from '../../src/main/AIAgentSettingsManager';
import { DataManager } from '../../src/main/DataManager';
import { safeStorage } from 'electron';

// Mock electron
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn(),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  },
}));

describe('AIAgentSettings Property-Based Tests', () => {
  let dataManager: DataManager;
  let settingsManager: AIAgentSettingsManager;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    mockStorage = new Map();

    // Mock DataManager
    dataManager = {
      saveData: jest.fn((key: string, value: any) => {
        mockStorage.set(key, value);
        return { success: true };
      }),
      loadData: jest.fn((key: string) => {
        if (mockStorage.has(key)) {
          return { success: true, data: mockStorage.get(key) };
        }
        return { success: false, data: null };
      }),
      deleteData: jest.fn((key: string) => {
        mockStorage.delete(key);
        return { success: true };
      }),
    } as any;

    settingsManager = new AIAgentSettingsManager(dataManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: AIAgentSettingsManager is initialized
     Action: Generate random API keys, save and load for each provider
     Assertions: Loaded key equals saved key (round-trip)
     Requirements: ui.10.4, ui.10.17 */
  test('52.1: should preserve API key through save/load cycle', async () => {
    // Mock encryption as unavailable for simplicity
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);

    const providers = fc.constantFrom('openai' as const, 'anthropic' as const, 'google' as const);
    const apiKeys = fc.string({ minLength: 10, maxLength: 100 });

    await fc.assert(
      fc.asyncProperty(providers, apiKeys, async (provider, apiKey) => {
        // Save API key
        await settingsManager.saveAPIKey(provider, apiKey);

        // Load API key
        const loadedKey = await settingsManager.loadAPIKey(provider);

        // Should match
        expect(loadedKey).toBe(apiKey);
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: AIAgentSettingsManager is initialized with encryption available
     Action: Generate random API keys, save with encryption, load and decrypt
     Assertions: Decrypted key equals original key
     Requirements: ui.10.9, ui.10.17 */
  test('52.2: should preserve data through encryption/decryption', async () => {
    // Mock encryption as available
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(true);
    (safeStorage.encryptString as jest.Mock).mockImplementation((str: string) => {
      // Simple mock: reverse the string and convert to buffer
      return Buffer.from(str.split('').reverse().join(''));
    });
    (safeStorage.decryptString as jest.Mock).mockImplementation((buffer: Buffer) => {
      // Simple mock: reverse back
      return buffer.toString().split('').reverse().join('');
    });

    const providers = fc.constantFrom('openai' as const, 'anthropic' as const, 'google' as const);
    const apiKeys = fc.string({ minLength: 10, maxLength: 100 });

    await fc.assert(
      fc.asyncProperty(providers, apiKeys, async (provider, apiKey) => {
        // Save API key (should encrypt)
        await settingsManager.saveAPIKey(provider, apiKey);

        // Load API key (should decrypt)
        const loadedKey = await settingsManager.loadAPIKey(provider);

        // Should match original
        expect(loadedKey).toBe(apiKey);
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: AIAgentSettingsManager is initialized
     Action: Generate keys for all providers, save them, switch between providers randomly
     Assertions: Each provider returns its own key
     Requirements: ui.10.11, ui.10.14 */
  test('52.3: should preserve keys when switching between providers', async () => {
    // Mock encryption as unavailable for simplicity
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);

    const apiKeys = fc.record({
      openai: fc.string({ minLength: 10, maxLength: 50 }),
      anthropic: fc.string({ minLength: 10, maxLength: 50 }),
      google: fc.string({ minLength: 10, maxLength: 50 }),
    });

    await fc.assert(
      fc.asyncProperty(apiKeys, async (keys) => {
        // Save keys for all providers
        await settingsManager.saveAPIKey('openai', keys.openai);
        await settingsManager.saveAPIKey('anthropic', keys.anthropic);
        await settingsManager.saveAPIKey('google', keys.google);

        // Load keys in random order and verify
        const loadedOpenAI = await settingsManager.loadAPIKey('openai');
        const loadedAnthropic = await settingsManager.loadAPIKey('anthropic');
        const loadedGoogle = await settingsManager.loadAPIKey('google');

        // Each provider should return its own key
        expect(loadedOpenAI).toBe(keys.openai);
        expect(loadedAnthropic).toBe(keys.anthropic);
        expect(loadedGoogle).toBe(keys.google);

        // Switch to different provider and back
        const loadedOpenAI2 = await settingsManager.loadAPIKey('openai');
        expect(loadedOpenAI2).toBe(keys.openai);
      }),
      { numRuns: 100 }
    );
  });
});
