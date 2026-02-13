// Requirements: clerkly.1, clerkly.nfr.1, clerkly.nfr.2, account-profile.1.5, clerkly.3.8

import WindowManager from './WindowManager';
import { DataManager } from './DataManager';
import { OAuthClientManager } from './auth/OAuthClientManager';
import { UserManager } from './auth/UserManager';
import { TokenStorageManager } from './auth/TokenStorageManager';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Initialize result
 */
export interface InitializeResult {
  success: boolean;
  loadTime: number;
}

/**
 * Manages application lifecycle including startup, activation, and shutdown
 * Requirements: clerkly.1, clerkly.nfr.1, clerkly.nfr.2, account-profile.1.5
 */
export class LifecycleManager {
  private windowManager: WindowManager;
  private dataManager: DataManager;
  private oauthClient: OAuthClientManager;
  private userManager: UserManager;
  private startTime: number | null = null;
  private initialized: boolean = false;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('LifecycleManager');

  constructor(
    windowManager: WindowManager,
    dataManager: DataManager,
    oauthClient: OAuthClientManager,
    tokenStorage: TokenStorageManager
  ) {
    this.windowManager = windowManager;
    this.dataManager = dataManager;
    this.oauthClient = oauthClient;
    // Requirements: account-profile.1.5 - Initialize UserManager
    this.userManager = new UserManager(dataManager, tokenStorage);
  }

  /**
   * Инициализирует приложение
   * Обеспечивает запуск менее чем за 3 секунды
   * Requirements: clerkly.1, clerkly.nfr.1, account-profile.1.5
   * @returns {Promise<InitializeResult>}
   */
  async initialize(): Promise<InitializeResult> {
    const startTime = Date.now();
    this.startTime = startTime;

    try {
      // Инициализация хранилища данных
      this.dataManager.initialize();

      // Создание окна приложения
      this.windowManager.createWindow();

      // Requirements: account-profile.1.5 - Fetch profile on startup if authenticated
      const authStatus = await this.oauthClient.getAuthStatus();
      if (authStatus.authorized) {
        this.logger.info('User authenticated, fetching profile');
        await this.userManager.fetchProfile();
      } else {
        this.logger.info('User not authenticated, skipping profile fetch');
      }

      this.initialized = true;

      const loadTime = Date.now() - startTime;

      // Предупреждение о медленном запуске (> 3 секунды)
      if (loadTime > 3000) {
        this.logger.warn(`Slow startup: ${loadTime}ms (target: <3000ms)`);
      }

      return {
        success: true,
        loadTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize application: ${errorMessage}`);
      throw new Error(`Application initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Обрабатывает активацию приложения (Mac OS X специфика)
   * Пересоздает окно при клике на dock icon
   * Requirements: clerkly.1, clerkly.nfr.3   */
  handleActivation(): void {
    try {
      // Mac OS X специфика: пересоздать окно при активации если оно закрыто
      if (!this.windowManager.isWindowCreated()) {
        this.windowManager.createWindow();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle activation: ${errorMessage}`);
    }
  }

  /**
   * Корректно завершает приложение
   * Сохраняет все данные перед выходом
   * Requirements: clerkly.1, clerkly.nfr.2   * @returns {Promise<void>}
   */
  async handleQuit(): Promise<void> {
    try {
      // Таймаут 5 секунд для graceful shutdown
      const shutdownPromise = this.performShutdown();

      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Shutdown timeout exceeded')), 5000);
        timeoutId.unref();
      });

      try {
        await Promise.race([shutdownPromise, timeoutPromise]);
      } finally {
        // Очищаем таймер, если shutdown завершился первым
        clearTimeout(timeoutId!);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error during shutdown: ${errorMessage}`);
      // Продолжаем завершение даже при ошибках
    }
  }

  /**
   * Выполняет процедуру завершения приложения
   * Requirements: clerkly.nfr.2   * @private
   */
  private async performShutdown(): Promise<void> {
    // Закрываем окно
    if (this.windowManager.isWindowCreated()) {
      this.windowManager.closeWindow();
    }

    // Закрываем соединение с базой данных
    this.dataManager.close();

    this.initialized = false;
  }

  /**
   * Обрабатывает закрытие всех окон
   * Mac OS X: приложение остается активным
   * Requirements: clerkly.1, clerkly.nfr.3   */
  handleWindowClose(): void {
    // Mac OS X специфика: приложение остается активным при закрытии окна
    // Не завершаем приложение, только очищаем ссылку на окно
    // Окно будет пересоздано при активации через handleActivation()
  }

  /**
   * Возвращает время запуска
   * Requirements: clerkly.nfr.1   * @returns {number | null}
   */
  getStartupTime(): number | null {
    return this.startTime;
  }

  /**
   * Проверяет, инициализировано ли приложение
   * Requirements: clerkly.1   * @returns {boolean}
   */
  isAppInitialized(): boolean {
    return this.initialized;
  }
}
