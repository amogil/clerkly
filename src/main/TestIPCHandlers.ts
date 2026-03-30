// Requirements: testing.3.8
// Test IPC Handlers - only for test environment
// This file is excluded from no-restricted-syntax ESLint rule

import { ipcMain } from 'electron';
import type { TokenStorageManager } from './auth/TokenStorageManager';
import type { UserManager } from './auth/UserManager';
import type { DatabaseManager } from './DatabaseManager';
import type { UserSettingsManager } from './UserSettingsManager';
import type { AgentManager } from './agents/AgentManager';
import type { MessageManager } from './agents/MessageManager';
import type { AuthIPCHandlers } from './auth/AuthIPCHandlers';
import type { OAuthClientManager } from './auth/OAuthClientManager';
import { Logger } from './Logger';
import { NO_USER_LOGGED_IN_ERROR } from '../shared/errors/userErrors';
import { SandboxWebSearchHandler } from './code_exec/SandboxWebSearchHandler';
import type { LLMProvider } from '../types';

const logger = Logger.create('TestIPCHandlers');

export function registerTestIPCHandlers(
  tokenStorage: TokenStorageManager,
  userManager: UserManager,
  dbManager: DatabaseManager,
  dataManager: UserSettingsManager,
  agentManager: AgentManager,
  messageManager: MessageManager,
  authIPCHandlers: AuthIPCHandlers,
  oauthClient: OAuthClientManager
): void {
  const isTestEnvironment = () => {
    return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
  };

  ipcMain.handle('test:clear-tokens', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-tokens can only be used in test environment');
    }
    await tokenStorage.deleteTokens();
    return { success: true };
  });

  ipcMain.handle('test:clear-data', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-data can only be used in test environment');
    }
    // Clear all user_data using direct DB access (allowed in tests)
    const db = dbManager.getDatabase();
    if (db) {
      const rows = db.prepare('SELECT key, user_id FROM user_data').all() as Array<{
        key: string;
        user_id: string;
      }>;

      for (const row of rows) {
        db.prepare('DELETE FROM user_data WHERE key = ? AND user_id = ?').run(row.key, row.user_id);
      }
    }
    return { success: true };
  });

  ipcMain.handle('test:delete-current-user', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:delete-current-user can only be used in test environment');
    }
    const userId = userManager.getCurrentUserId();
    if (userId) {
      dbManager.users.delete(userId);
    }
    return { success: true };
  });

  ipcMain.handle('test:trigger-auth-success', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:trigger-auth-success can only be used in test environment');
    }
    try {
      await userManager.fetchProfile();
      const userId = userManager.getCurrentUserId();
      const user = userManager.getCurrentUser();
      if (userId && user) {
        authIPCHandlers.sendAuthSuccess(userId, user);
      }
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch profile: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:get-profile', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:get-profile can only be used in test environment');
    }
    try {
      const user = userManager.getCurrentUser();
      return { success: true, profile: user };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, profile: null };
    }
  });

  ipcMain.handle(
    'test:get-profile-by-email',
    async (_event: Electron.IpcMainInvokeEvent, email: string) => {
      if (!isTestEnvironment()) {
        throw new Error('test:get-profile-by-email can only be used in test environment');
      }
      if (!email || typeof email !== 'string') {
        return { success: false, error: 'Email parameter is required', profile: null };
      }
      try {
        const user = userManager.loadUserByEmail(email);
        return { success: true, profile: user };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage, profile: null };
      }
    }
  );

  ipcMain.handle(
    'test:create-agent-with-old-message',
    async (_event: Electron.IpcMainInvokeEvent, minutesAgo: number) => {
      if (!isTestEnvironment()) {
        throw new Error('test:create-agent-with-old-message can only be used in test environment');
      }
      try {
        const userId = userManager.getCurrentUserId();
        if (!userId) {
          throw new Error(NO_USER_LOGGED_IN_ERROR);
        }

        const agent = agentManager.create(userId);
        const oldTimestamp = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

        const payload = {
          data: { text: 'Test message from the past' },
        };

        // Create message with old timestamp - this will trigger MESSAGE_CREATED event
        // which will update agent's updatedAt to match the message timestamp
        messageManager.create(agent.agentId, 'user', payload, null, false, oldTimestamp);

        return {
          success: true,
          agentId: agent.agentId,
          timestamp: oldTimestamp,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'test:setup-profile',
    async (
      _event: Electron.IpcMainInvokeEvent,
      profileData: {
        id?: string;
        email: string;
        name?: string;
        given_name?: string;
        family_name?: string;
        locale?: string;
      }
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:setup-profile can only be used in test environment');
      }
      try {
        const googleProfile = {
          id: profileData.id || 'test-google-id',
          email: profileData.email,
          verified_email: true,
          name: profileData.name || 'Test User',
          given_name: profileData.given_name || 'Test',
          family_name: profileData.family_name || 'User',
          locale: profileData.locale || 'en',
        };
        userManager.findOrCreateUser(googleProfile);
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'test:save-data',
    async (_event: Electron.IpcMainInvokeEvent, key: string, value: string) => {
      if (!isTestEnvironment()) {
        throw new Error('test:save-data can only be used in test environment');
      }
      try {
        const result = dataManager.saveData(key, value);
        if (!result.success) {
          return result;
        }
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle('test:load-data', async (_event: Electron.IpcMainInvokeEvent, key: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:load-data can only be used in test environment');
    }
    try {
      const result = dataManager.loadData(key);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:delete-data', async (_event: Electron.IpcMainInvokeEvent, key: string) => {
    if (!isTestEnvironment()) {
      throw new Error('test:delete-data can only be used in test environment');
    }
    try {
      dataManager.deleteData(key);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    'test:handle-deep-link',
    async (_event: Electron.IpcMainInvokeEvent, url: string) => {
      if (!isTestEnvironment()) {
        throw new Error('test:handle-deep-link can only be used in test environment');
      }
      try {
        logger.info(`Handling deep link: ${url}`);
        const authStatus = await oauthClient.handleDeepLink(url);
        logger.info(`Deep link auth status: ${JSON.stringify(authStatus)}`);
        return authStatus;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Deep link handling error: ${errorMessage}`);
        return { authorized: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'test:trigger-error-notification',
    async (_event: Electron.IpcMainInvokeEvent, data: { message: string; context: string }) => {
      if (!isTestEnvironment()) {
        throw new Error('test:trigger-error-notification can only be used in test environment');
      }
      try {
        authIPCHandlers.sendErrorNotification(data.message, data.context);
        logger.info(`Sent error notification via AuthIPCHandlers: ${JSON.stringify(data)}`);
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error sending notification: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle('test:expire-token', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:expire-token can only be used in test environment');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      if (!tokens) {
        return { success: false, error: 'No tokens found' };
      }

      const expiredTokens = {
        ...tokens,
        expiresAt: Date.now() - 1000,
      };

      await tokenStorage.saveTokens(expiredTokens);
      logger.info('Token expiration simulated for testing');

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to expire token: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('test:get-tokens', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:get-tokens can only be used in test environment');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      if (!tokens) {
        return { success: false, error: 'No tokens found' };
      }

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get tokens: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    'test:simulate-data-error',
    async (
      _event: Electron.IpcMainInvokeEvent,
      operation: 'saveData' | 'loadData' | 'deleteData',
      errorMessage: string
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:simulate-data-error can only be used in test environment');
      }
      const testDataManager = (global as Record<string, unknown>).testDataManager as unknown as {
        simulateError: (operation: string, errorMessage: string) => void;
      };
      if (!testDataManager) {
        return { success: false, error: 'TestDataManager not initialized' };
      }

      testDataManager.simulateError(operation, errorMessage);
      return { success: true };
    }
  );

  ipcMain.handle('test:clear-data-errors', async () => {
    if (!isTestEnvironment()) {
      throw new Error('test:clear-data-errors can only be used in test environment');
    }
    const testDataManager = (global as Record<string, unknown>).testDataManager as unknown as {
      clearErrorSimulations: () => void;
    };
    if (!testDataManager) {
      return { success: false, error: 'TestDataManager not initialized' };
    }

    testDataManager.clearErrorSimulations();
    return { success: true };
  });

  ipcMain.handle(
    'test:create-agent-message',
    async (_event: Electron.IpcMainInvokeEvent, agentId: string, text: string) => {
      if (!isTestEnvironment()) {
        throw new Error('test:create-agent-message can only be used in test environment');
      }

      // Validate parameters
      if (!agentId || typeof agentId !== 'string') {
        return { success: false, error: 'agentId parameter is required' };
      }
      if (!text || typeof text !== 'string') {
        return { success: false, error: 'text parameter is required' };
      }

      try {
        const payload = {
          data: { text },
        };
        // Pass done=true so seeded messages represent completed LLM responses
        // and are not treated as stale in-flight messages by startup reconciliation.
        messageManager.create(agentId, 'llm', payload, null, true);
        logger.info(`Test: Created agent message for agent ${agentId}`);
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to create agent message: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'test:set-agent-status',
    async (
      _event: Electron.IpcMainInvokeEvent,
      agentId: string,
      status: 'new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed'
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:set-agent-status can only be used in test environment');
      }

      if (!agentId || typeof agentId !== 'string') {
        return { success: false, error: 'agentId parameter is required' };
      }

      if (!['new', 'in-progress', 'awaiting-response', 'error', 'completed'].includes(status)) {
        return { success: false, error: `Unsupported status: ${status}` };
      }

      try {
        const lastMessage = messageManager.getLastMessage(agentId);
        const replyToMessageId = lastMessage?.id ?? null;

        if (status === 'new') {
          // "new" means no messages; tests should call this for a fresh agent.
          return { success: true };
        }

        if (status === 'in-progress') {
          messageManager.create(
            agentId,
            'llm',
            { data: { text: 'In progress status fixture' } },
            replyToMessageId,
            false
          );
          return { success: true };
        }

        if (status === 'awaiting-response') {
          messageManager.create(
            agentId,
            'llm',
            { data: { text: 'Awaiting response status fixture' } },
            replyToMessageId,
            true
          );
          return { success: true };
        }

        if (status === 'error') {
          messageManager.create(
            agentId,
            'error',
            { data: { error: { message: 'Status fixture error' } } },
            replyToMessageId,
            true
          );
          return { success: true };
        }

        // status === 'completed'
        // Requirements: agents.9.2, llm-integration.9.2
        // Completed status is derived from a done tool_call(final_answer), not from legacy message kind.
        messageManager.create(
          agentId,
          'tool_call',
          {
            data: {
              callId: 'status-fixture-final-answer',
              toolName: 'final_answer',
              arguments: {
                text: 'Status fixture completed',
                summary_points: ['Fixture completion summary'],
              },
            },
          },
          replyToMessageId,
          true
        );
        return { success: true };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to set agent status: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'test:web-search-execute',
    async (_event: Electron.IpcMainInvokeEvent, provider: LLMProvider, args: unknown) => {
      if (!isTestEnvironment()) {
        throw new Error('test:web-search-execute can only be used in test environment');
      }
      try {
        const envKeyName = `CLERKLY_${provider.toUpperCase()}_API_KEY`;
        const envKey = process.env[envKeyName];
        if (!envKey) {
          return { success: false, error: `Missing ${envKeyName}` };
        }

        const result = await new SandboxWebSearchHandler(provider, envKey).execute(args);
        return { success: true, data: result };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to execute web search for ${provider}: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Requirements: llm-integration.11.6.3
  // Inject a stale tool_call message (done=false, status=running) for startup recovery tests.
  ipcMain.handle(
    'test:inject-stale-tool-call',
    async (
      _event: Electron.IpcMainInvokeEvent,
      agentId: string,
      toolName: string = 'code_exec',
      callId?: string
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:inject-stale-tool-call can only be used in test environment');
      }
      if (!agentId || typeof agentId !== 'string') {
        return { success: false, error: 'agentId parameter is required' };
      }
      try {
        const resolvedCallId = callId || `stale-call-${Date.now()}`;
        const payload = {
          data: {
            callId: resolvedCallId,
            toolName,
            arguments: toolName === 'code_exec' ? { code: 'console.log("stale")' } : {},
          },
        };
        const lastMessage = messageManager.getLastMessage(agentId);
        const replyToMessageId = lastMessage?.id ?? null;
        // Create with done=false to simulate a stale running tool_call
        const message = messageManager.create(
          agentId,
          'tool_call',
          payload,
          replyToMessageId,
          false
        );
        logger.info(`Test: Injected stale tool_call for agent ${agentId}, messageId=${message.id}`);
        return { success: true, messageId: message.id };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to inject stale tool_call: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Requirements: llm-integration.11.6.4
  // Inject a stale kind:llm message (done=false, hidden=false) for startup recovery tests.
  ipcMain.handle(
    'test:inject-stale-llm',
    async (
      _event: Electron.IpcMainInvokeEvent,
      agentId: string,
      text?: string,
      reasoning?: string
    ) => {
      if (!isTestEnvironment()) {
        throw new Error('test:inject-stale-llm can only be used in test environment');
      }
      if (!agentId || typeof agentId !== 'string') {
        return { success: false, error: 'agentId parameter is required' };
      }
      try {
        const payload: Record<string, unknown> = {
          data: {
            ...(text ? { text } : {}),
            ...(reasoning ? { reasoning: { text: reasoning } } : {}),
          },
        };
        const lastMessage = messageManager.getLastMessage(agentId);
        const replyToMessageId = lastMessage?.id ?? null;
        // Create with done=false to simulate a stale in-flight llm message
        const message = messageManager.create(agentId, 'llm', payload, replyToMessageId, false);
        logger.info(`Test: Injected stale llm for agent ${agentId}, messageId=${message.id}`);
        return { success: true, messageId: message.id };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to inject stale llm: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Requirements: llm-integration.11.6.3, llm-integration.11.6.4
  // Return all messages for a given agent (including hidden) as raw DB rows.
  // Used to assert DB state after restart without relying on UI rendering.
  ipcMain.handle(
    'test:get-messages-raw',
    async (_event: Electron.IpcMainInvokeEvent, agentId: string) => {
      if (!isTestEnvironment()) {
        throw new Error('test:get-messages-raw can only be used in test environment');
      }
      if (!agentId || typeof agentId !== 'string') {
        return { success: false, error: 'agentId parameter is required' };
      }
      try {
        // Use listByAgent with includeHidden=true to get all messages including hidden
        const db = dbManager.getDatabase();
        if (!db) {
          return { success: false, error: 'Database not available' };
        }
        const allMessages = db
          .prepare(
            'SELECT id, agent_id as agentId, kind, done, hidden, payload_json as payloadJson, timestamp, reply_to_message_id as replyToMessageId FROM messages WHERE agent_id = ? ORDER BY id ASC'
          )
          .all(agentId) as Array<{
          id: number;
          agentId: string;
          kind: string;
          done: number;
          hidden: number;
          payloadJson: string;
          timestamp: string;
          replyToMessageId: number | null;
        }>;
        const rawMessages = allMessages.map((msg) => ({
          id: msg.id,
          agentId: msg.agentId,
          kind: msg.kind,
          done: !!msg.done,
          hidden: !!msg.hidden,
          payloadJson: msg.payloadJson,
          timestamp: msg.timestamp,
          replyToMessageId: msg.replyToMessageId,
        }));
        return { success: true, messages: rawMessages };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Test: Failed to get raw messages: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  logger.info('Test IPC handlers registered');
}
