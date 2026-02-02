// Requirements: clerkly.1, clerkly.nfr.1, clerkly.nfr.2

import WindowManager from './WindowManager';
import { DataManager } from './DataManager';

/**
 * Initialize result
 */
export interface InitializeResult {
  success: boolean;
  loadTime: number;
}

/**
 * Manages application lifecycle including startup, activation, and shutdown
 */
export class LifecycleManager {
  private windowManager: WindowManager;
  private dataManager: DataManager;
  private startTime: number | null = null;
  private initialized: boolean = false;

  constructor(windowManager: WindowManager, dataManager: DataManager) {
    this.windowManager = windowManager;
    this.dataManager = dataManager;
  }

  /**
   * Инициализирует приложение
   * Обеспечивает запуск менее чем за 3 секунды
   * Requirements: clerkly.1, clerkly.nfr.1   * @returns {Promise<InitializeResult>}
   */
  async initialize(): Promise<InitializeResult> {
    const startTime = Date.now();
    this.startTime = startTime;

    try {
      // Инициализация хранилища данных
      this.dataManager.initialize();

      // Создание окна приложения
      this.windowManager.createWindow();

      this.initialized = true;

      const loadTime = Date.now() - startTime;

      // Предупреждение о медленном запуске (> 3 секунды)
      if (loadTime > 3000) {
        console.warn(`Slow startup: ${loadTime}ms (target: <3000ms)`);
      }

      return {
        success: true,
        loadTime,
      };
    } catch (error: any) {
      console.error('Failed to initialize application:', error.message);
      throw new Error(`Application initialization failed: ${error.message}`);
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
    } catch (error: any) {
      console.error('Failed to handle activation:', error.message);
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
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout exceeded')), 5000);
      });

      await Promise.race([shutdownPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('Error during shutdown:', error.message);
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
