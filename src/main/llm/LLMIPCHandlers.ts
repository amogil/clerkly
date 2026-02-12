// Requirements: settings.3.4, settings.3.9

import { ipcMain } from 'electron';
import { Logger } from '../Logger';
import { LLMProviderFactory } from './LLMProviderFactory';
import { LLMProviderType } from './LLMConfig';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('LLMIPCHandlers');

/**
 * Register IPC handlers for LLM operations
 * 
 * Requirements: settings.3.4 - Handle llm:test-connection IPC event
 * Requirements: settings.3.9 - Log attempts and results safely
 */
export function registerLLMIPCHandlers(): void {
  // Requirements: settings.3.4 - Test connection handler
  ipcMain.handle(
    'llm:test-connection',
    async (
      event,
      { provider, apiKey }: { provider: LLMProviderType; apiKey: string }
    ) => {
      try {
        // Requirements: settings.3.9 - Log attempt (only first 4 chars of key)
        logger.info(`Testing connection to ${provider} (key: ${apiKey.substring(0, 4)}...)`);

        const llmProvider = LLMProviderFactory.createProvider(provider);
        const result = await llmProvider.testConnection(apiKey);

        // Requirements: settings.3.9 - Log result
        if (result.success) {
          logger.info(`Connection test successful for ${provider}`);
        } else {
          logger.warn(`Connection test failed for ${provider}: ${result.error}`);
        }

        return result;
      } catch (error) {
        logger.error(`Test connection failed: ${error}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  logger.info('LLM IPC handlers registered');
}
