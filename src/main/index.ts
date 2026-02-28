// Requirements: clerkly.1.1, clerkly.1.2, clerkly.1.3, clerkly.1.4, google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.5

/**
 * Main entry point for Clerkly Electron application
 * Initializes all components and manages application lifecycle
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import WindowManager from './WindowManager';
import { LifecycleManager } from './LifecycleManager';
import { UserSettingsManager } from './UserSettingsManager';
import { DatabaseManager } from './DatabaseManager';
import { IPCHandlers } from './IPCHandlers';
import { OAuthClientManager } from './auth/OAuthClientManager';
import { TokenStorageManager } from './auth/TokenStorageManager';
import { UserManager } from './auth/UserManager';
import { getOAuthConfig, OAUTH_CONFIG } from './auth/OAuthConfig';
import { AuthIPCHandlers } from './auth/AuthIPCHandlers';
import { AIAgentSettingsManager } from './AIAgentSettingsManager';
import { SettingsIPCHandlers } from './SettingsIPCHandlers';
import { registerLLMIPCHandlers } from './llm/LLMIPCHandlers';
import { registerEventIPCHandlers } from './events/EventIPCHandlers';
import { EventLogger } from './events/EventLogger';
import { Logger } from './Logger';
import { registerTestIPCHandlers } from './TestIPCHandlers';
import { AppCoordinator } from './app/AppCoordinator';
import { isNoUserLoggedInError } from '../shared/errors/userErrors';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for Main module
const logger = Logger.create('Main');

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
// Set app name for single instance lock
// This helps macOS identify the app correctly
app.setName('Clerkly');

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Request single instance lock BEFORE registering protocol
// This ensures that deep links are handled by the existing instance
// Skip single instance lock in test environment to allow multiple test instances
const gotTheLock = process.env['NODE_ENV'] === 'test' ? true : app.requestSingleInstanceLock();

logger.info(`Single instance lock: ${gotTheLock ? 'ACQUIRED' : 'FAILED'}`);
logger.info(`Process args: ${JSON.stringify(process.argv)}`);
logger.info(`Process defaultApp: ${process.defaultApp}`);

// Requirements: google-oauth-auth.2.1
// Extract protocol scheme from redirect URI for deep link handling
const protocolScheme = OAUTH_CONFIG.redirectUri.split(':')[0] ?? '';
if (!protocolScheme) {
  throw new Error('Invalid redirect URI: missing protocol scheme');
}
logger.info(`Protocol scheme: ${protocolScheme}`);

// Track application initialization state
let isAppInitialized = false;
let pendingDeepLink: string | null = null;

if (!gotTheLock) {
  logger.info('Another instance is already running');

  // Check if this instance was launched with a deep link
  const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
  if (launchUrl) {
    logger.info(`This instance has deep link, will pass to primary instance: ${launchUrl}`);
    // The deep link will be passed to the primary instance via second-instance event
  }

  logger.info('Quitting secondary instance...');
  app.quit();
} else {
  logger.info('This is the primary instance');

  // Handle custom user data directory for functional tests
  // Check for --user-data-dir argument
  const userDataDirIndex = process.argv.indexOf('--user-data-dir');
  if (userDataDirIndex !== -1) {
    const customUserDataPath = process.argv[userDataDirIndex + 1];
    if (customUserDataPath) {
      app.setPath('userData', customUserDataPath);
      logger.info(`Using custom user data path: ${customUserDataPath}`);
    }
  }

  // Register custom protocol for deep link handling
  // Using reverse client ID format: com.googleusercontent.apps.CLIENT_ID
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const execPath = process.execPath;
      // In dev mode, we need to register with the full path to the entry point
      // Get the absolute path to the main file
      const mainPath = path.resolve(__dirname, 'index.js');
      logger.info(`Registering protocol in dev mode: ${JSON.stringify({ execPath, mainPath })}`);
      app.setAsDefaultProtocolClient(protocolScheme, execPath, [mainPath]);
    }
  } else {
    logger.info('Registering protocol in production mode');
    app.setAsDefaultProtocolClient(protocolScheme);
  }
}

// Requirements: clerkly.1.4, database-refactoring.3.7
// Initialize DatabaseManager first (single point of entry for database)
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'storage');
const dbManager = new DatabaseManager();
dbManager.initialize(storagePath);

// Requirements: database-refactoring.2.4
// Initialize UserSettingsManager with DatabaseManager
const dataManager = new UserSettingsManager(dbManager);

// Requirements: testing.3.1, testing.3.2
// Helper function to check if we're in test environment
const isTestEnvironment = () => {
  return process.env['NODE_ENV'] === 'test' || process.env['PLAYWRIGHT_TEST'] === '1';
};

// Create TestDataManager wrapper in test environment
import { TestDataManager } from './TestDataManager';
let testDataManager: TestDataManager | null = null;
if (isTestEnvironment()) {
  testDataManager = new TestDataManager(dataManager);
  logger.info('TestDataManager created for test environment');
}

// Check if app was launched with a deep link
const launchUrl = process.argv.find((arg) => arg.startsWith(protocolScheme));
if (launchUrl) {
  logger.info(`App launched with deep link: ${launchUrl}`);
  pendingDeepLink = launchUrl;
}

// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2
// Initialize Token Storage Manager
const tokenStorage = new TokenStorageManager(dataManager);

// Requirements: google-oauth-auth.1.1, google-oauth-auth.2.2
// Initialize OAuth Client Manager
const oauthConfig = getOAuthConfig();
const oauthClient = new OAuthClientManager(oauthConfig, tokenStorage);

// Requirements: token-management-ui.1.1, token-management-ui.1.2
// Set OAuth Client Manager for automatic token refresh in API requests
import { setOAuthClientManager } from './auth/APIRequestHandler';
setOAuthClientManager(oauthClient);

// Requirements: account-profile.1.3, user-data-isolation.6.2
// DatabaseManager already created above, use it for UserManager

// Requirements: account-profile.1.5
// Initialize User Manager with DatabaseManager
const userManager = new UserManager(dbManager, tokenStorage);

// Requirements: user-data-isolation.6.3 - Set UserManager in DatabaseManager for data isolation
// UserSettingsManager gets user_id from DatabaseManager, so we only need to set it once
dbManager.setUserManager(userManager);

// Requirements: account-profile.1.5
// Connect profile manager to oauth client for automatic updates
oauthClient.setUserManager(userManager);

// Requirements: clerkly.1.2, clerkly.1.3, window-management.5, database-refactoring.3.6
// Initialize Window Manager with DatabaseManager
const windowManager = new WindowManager(dbManager);

// Requirements: google-oauth-auth.11.1
// Initialize Auth Window Manager
import { AuthWindowManager } from './auth/AuthWindowManager';
const authWindowManager = new AuthWindowManager(windowManager, oauthClient);

// Requirements: google-oauth-auth.7.1
// Connect auth window manager to oauth client for loader display
oauthClient.setAuthWindowManager(authWindowManager);

// Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4, account-profile.1.5, database-refactoring.3.5
// Initialize Lifecycle Manager with DatabaseManager
const lifecycleManager = new LifecycleManager(windowManager, dbManager, oauthClient, userManager);

// Requirements: clerkly.1.4, clerkly.2.5
// Initialize IPC Handlers
const ipcHandlers = new IPCHandlers(dataManager);

// Requirements: google-oauth-auth.8.1, account-profile.1.2
// Initialize Auth IPC Handlers
const authIPCHandlers = new AuthIPCHandlers(oauthClient);
// Requirements: account-profile.1.2 - Connect profile manager to auth IPC handlers
authIPCHandlers.setUserManager(userManager);

// Requirements: settings.1.9, settings.1.26
// Initialize AI Agent Settings Manager
// Use TestDataManager in test environment for error simulation
const aiAgentSettingsManager = new AIAgentSettingsManager(
  isTestEnvironment() && testDataManager ? testDataManager : dataManager
);

// Requirements: settings.1.9, settings.1.26
// Initialize Settings IPC Handlers
const settingsIPCHandlers = new SettingsIPCHandlers(aiAgentSettingsManager);

// Requirements: agents.2, agents.4, agents.10, llm-integration.6
// Initialize Agent and Message Managers
import { AgentManager } from './agents/AgentManager';
import { MessageManager } from './agents/MessageManager';
import { AgentIPCHandlers } from './agents/AgentIPCHandlers';
import { MainPipeline } from './agents/MainPipeline';
import { PromptBuilder, FullHistoryStrategy } from './agents/PromptBuilder';

const agentManager = new AgentManager(dbManager);
const messageManager = new MessageManager(dbManager);
const promptBuilder = new PromptBuilder(
  'You are a helpful AI assistant. You may respond in Markdown when it improves clarity. Supported Markdown (GFM): headings, paragraphs, bold/italic/strikethrough, links/autolinks, blockquotes, ordered/unordered lists and task lists, tables, horizontal rules, images, inline code, fenced code blocks with language tags (syntax highlighting), Mermaid diagrams (```mermaid```), and math via KaTeX (inline $...$ or block $$...$$).',
  [],
  new FullHistoryStrategy()
);
const mainPipeline = new MainPipeline(messageManager, aiAgentSettingsManager, promptBuilder);
const agentIPCHandlers = new AgentIPCHandlers(agentManager, messageManager, mainPipeline);
const appCoordinator = new AppCoordinator(oauthClient);

// Requirements: testing.3.8
// Initialize Test IPC Handlers (only in test environment)
if (process.env['NODE_ENV'] === 'test') {
  // Export test context for functional tests
  // This allows tests to access internal state like PKCE storage
  (global as { testContext?: unknown }).testContext = {
    oauthClient,
    tokenStorage,
    userManager,
    dataManager,
    dbManager,
    isNoUserLoggedInError,
  };

  // Store testDataManager in global for test handlers
  if (testDataManager) {
    (global as { testDataManager?: unknown }).testDataManager = testDataManager;
  }

  // Register test IPC handlers from separate file
  // Requirements: testing.3.1.2 - Test IPC handlers for functional tests
  registerTestIPCHandlers(
    tokenStorage,
    userManager,
    dbManager,
    dataManager,
    agentManager,
    messageManager,
    authIPCHandlers,
    oauthClient
  );
}

// Requirements: clerkly.1.1, clerkly.1.2
// Handle application ready event
app.whenReady().then(async () => {
  try {
    logger.info('Application starting...');
    const startTime = Date.now();

    // Requirements: user-data-isolation.1.17 - Initialize profile manager to restore email from database
    await userManager.initialize();
    logger.info('UserManager initialized');

    // Requirements: clerkly.1.2, clerkly.1.3, clerkly.1.4
    // Initialize application
    const initResult = await lifecycleManager.initialize();

    if (!initResult.success) {
      logger.error('Application initialization failed');
      app.quit();
      return;
    }

    const loadTime = Date.now() - startTime;
    logger.info(`Application started successfully in ${loadTime}ms`);

    // Requirements: clerkly.nfr.1.1
    // Warn if startup time exceeds 3 seconds
    if (loadTime > 3000) {
      logger.warn(`Slow startup detected: ${loadTime}ms (target: <3000ms)`);
    }

    // Requirements: clerkly.1.4, clerkly.2.5
    // Register IPC handlers
    ipcHandlers.registerHandlers();
    logger.info('IPC handlers registered');

    // Requirements: google-oauth-auth.8.1
    // Register Auth IPC handlers
    authIPCHandlers.registerHandlers();
    logger.info('Auth IPC handlers registered');

    // Requirements: settings.1.9, settings.1.26
    // Register Settings IPC handlers
    settingsIPCHandlers.registerHandlers();
    logger.info('Settings IPC handlers registered');

    // Requirements: settings.3.4, settings.3.9
    // Register LLM IPC handlers
    registerLLMIPCHandlers();
    logger.info('LLM IPC handlers registered');

    // Requirements: realtime-events.4.1
    // Register Event IPC handlers
    registerEventIPCHandlers();
    logger.info('Event IPC handlers registered');

    // Coordinator state query IPC for renderer bootstrap
    ipcMain.handle('app:get-state', () => appCoordinator.getState());
    logger.info('AppCoordinator state IPC handler registered');

    // Requirements: agents.2, agents.4, agents.10
    // Register Agent IPC handlers
    agentIPCHandlers.registerHandlers();
    logger.info('Agent IPC handlers registered');

    await appCoordinator.start();
    logger.info('AppCoordinator started');

    // Requirements: realtime-events.1.3, clerkly.3
    // Start EventLogger to log all events
    EventLogger.getInstance().start();
    logger.info('EventLogger started');

    // Requirements: google-oauth-auth.11.1
    // Initialize Auth Window Manager to check auth status and show appropriate window
    await authWindowManager.initializeApp();
    logger.info('Auth Window Manager initialized');

    logger.info('Main window created and loaded');

    // Mark app as initialized
    isAppInitialized = true;

    // Process pending deep link if any
    if (pendingDeepLink) {
      logger.info(`Processing pending deep link: ${pendingDeepLink}`);
      await handleDeepLinkUrl(pendingDeepLink);
      pendingDeepLink = null;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Startup error: ${errorMessage}`);
    app.quit();
  }
});

// Requirements: clerkly.1.2, clerkly.1.3
// Handle activate event (Mac OS X specific)
app.on('activate', () => {
  logger.info('Application activated');
  lifecycleManager.handleActivation();
});

// Requirements: clerkly.1.2, window-management.6.1, window-management.6.2
// Handle window-all-closed event
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  // Requirements: window-management.6.1, window-management.6.2
  // Quit application when all windows are closed on all platforms
  // This ensures no background processes remain after user closes the window
  app.quit();
});

// Requirements: clerkly.1.2
// Handle before-quit event
app.on('before-quit', () => {
  logger.info('Application quitting...');
  ipcMain.removeHandler('app:get-state');
  appCoordinator.stop();
  lifecycleManager.handleWindowClose();
});

/**
 * Handle deep link URL processing
 * Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5, account-profile.1.2, account-profile.1.3
 * @param url Deep link URL to process
 */
async function handleDeepLinkUrl(url: string): Promise<void> {
  if (!url.startsWith(protocolScheme)) {
    return;
  }

  try {
    logger.info(`Handling deep link: ${url}`);

    // Handle deep link first
    const authStatus = await oauthClient.handleDeepLink(url);
    logger.info(`Deep link auth status: ${JSON.stringify(authStatus)}`);

    // Get main window
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (mainWindow) {
      // Events are now published directly from OAuthClientManager.handleDeepLink()
      // No need to send them here - they are already sent
      logger.info(
        `Deep link handled, authorized: ${authStatus.authorized}, error: ${authStatus.error || 'none'}`
      );

      // Focus and restore window
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    } else {
      logger.warn('No window available to send auth event');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Deep link handling error: ${errorMessage}`);

    // Try to send error to window if available
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      authIPCHandlers.sendAuthError(errorMessage, 'unknown_error');
    }
  }
}

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on macOS (open-url event)
app.on('open-url', async (event, url) => {
  event.preventDefault();
  logger.info(`open-url event received: ${url}`);

  if (!url.startsWith(protocolScheme)) {
    return;
  }

  // If app is not initialized yet, store the deep link for later processing
  if (!isAppInitialized) {
    logger.info('App not initialized yet, storing deep link for later');
    pendingDeepLink = url;
    return;
  }

  // Process deep link immediately if app is initialized
  await handleDeepLinkUrl(url);
});

// Requirements: google-oauth-auth.2.2, google-oauth-auth.2.5
// Handle deep link on Windows/Linux (second-instance event)
// Single instance lock is already requested at the top of the file
app.on('second-instance', async (_event, commandLine, _workingDirectory) => {
  logger.info('second-instance event received');
  logger.info(`Command line args: ${JSON.stringify(commandLine)}`);

  // Find deep link URL in command line arguments
  const url = commandLine.find((arg) => arg.startsWith(protocolScheme));
  if (url) {
    logger.info(`Deep link found in second-instance: ${url}`);

    // If app is not initialized yet, store the deep link for later processing
    if (!isAppInitialized) {
      logger.info('App not initialized yet, storing deep link for later');
      pendingDeepLink = url;
    } else {
      // Process deep link immediately if app is initialized
      await handleDeepLinkUrl(url);
    }
  } else {
    logger.info('No deep link in command line, just activating window');
    // No deep link, just activate the window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }
});
