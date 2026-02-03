// Requirements: clerkly.1, clerkly.2
/**
 * State Controller - управляет состоянием приложения в renderer process
 * Обеспечивает immutability состояния через deep copy
 * Поддерживает историю изменений (max 10 записей)
 */

interface StateResult {
  success: boolean;
  state?: Record<string, unknown>;
  error?: string;
}

export class StateController {
  private state: Record<string, unknown>;
  private stateHistory: Array<Record<string, unknown>>;
  private maxHistorySize: number = 10;

  constructor(initialState: Record<string, unknown> = {}) {
    this.state = this.deepCopy(initialState);
    this.stateHistory = [];
  }

  /**
   * Обновляет состояние приложения
   * Выполняет shallow merge с текущим состоянием
   * Сохраняет предыдущее состояние в историю (max 10 записей)
   * Requirements: clerkly.1, clerkly.2   * @param {Record<string, unknown>} newState - новое состояние для merge
   * @returns {StateResult} результат операции
   */
  setState(newState: Record<string, unknown>): StateResult {
    try {
      if (!newState || typeof newState !== 'object' || Array.isArray(newState)) {
        return {
          success: false,
          error: 'Invalid state: must be a non-null object',
        };
      }

      // Сохраняем текущее состояние в историю
      this.stateHistory.push(this.deepCopy(this.state));

      // Ограничиваем размер истории
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }

      // Выполняем shallow merge
      this.state = { ...this.state, ...newState };

      return {
        success: true,
        state: this.deepCopy(this.state),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to set state: ${errorMessage}`,
      };
    }
  }

  /**
   * Возвращает копию текущего состояния
   * Обеспечивает immutability через deep copy
   * Requirements: clerkly.1, clerkly.2   * @returns {Record<string, unknown>} deep copy текущего состояния
   */
  getState(): Record<string, unknown> {
    return this.deepCopy(this.state);
  }

  /**
   * Сбрасывает состояние к новому значению
   * Сохраняет предыдущее состояние в историю
   * Requirements: clerkly.1, clerkly.2   * @param {Record<string, unknown>} newState - новое состояние (по умолчанию пустой объект)
   * @returns {StateResult} результат операции
   */
  resetState(newState: Record<string, unknown> = {}): StateResult {
    try {
      if (!newState || typeof newState !== 'object' || Array.isArray(newState)) {
        return {
          success: false,
          error: 'Invalid state: must be a non-null object',
        };
      }

      // Сохраняем текущее состояние в историю
      this.stateHistory.push(this.deepCopy(this.state));

      // Ограничиваем размер истории
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }

      // Полностью заменяем состояние
      this.state = this.deepCopy(newState);

      return {
        success: true,
        state: this.deepCopy(this.state),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to reset state: ${errorMessage}`,
      };
    }
  }

  /**
   * Возвращает конкретное свойство состояния
   * Requirements: clerkly.1, clerkly.2   * @param {string} key - ключ свойства
   * @returns {unknown} значение свойства (deep copy если объект)
   */
  getStateProperty(key: string): unknown {
    const value = this.state[key];
    // Возвращаем deep copy для объектов и массивов
    if (value !== null && typeof value === 'object') {
      return this.deepCopy(value);
    }
    return value;
  }

  /**
   * Устанавливает конкретное свойство состояния
   * Сохраняет предыдущее состояние в историю
   * Requirements: clerkly.1, clerkly.2   * @param {string} key - ключ свойства
   * @param {unknown} value - значение свойства
   */
  setStateProperty(key: string, value: unknown): void {
    // Сохраняем текущее состояние в историю
    this.stateHistory.push(this.deepCopy(this.state));

    // Ограничиваем размер истории
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Устанавливаем свойство
    this.state[key] = value;
  }

  /**
   * Удаляет свойство из состояния
   * Сохраняет предыдущее состояние в историю
   * Requirements: clerkly.1, clerkly.2   * @param {string} key - ключ свойства для удаления
   */
  removeStateProperty(key: string): void {
    // Сохраняем текущее состояние в историю
    this.stateHistory.push(this.deepCopy(this.state));

    // Ограничиваем размер истории
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Удаляем свойство
    delete this.state[key];
  }

  /**
   * Проверяет наличие свойства в состоянии
   * Requirements: clerkly.1, clerkly.2   * @param {string} key - ключ свойства
   * @returns {boolean} true если свойство существует
   */
  hasStateProperty(key: string): boolean {
    return key in this.state;
  }

  /**
   * Возвращает историю изменений состояния
   * Возвращает deep copy для immutability
   * Requirements: clerkly.1, clerkly.2   * @returns {Array<Record<string, unknown>>} массив предыдущих состояний
   */
  getStateHistory(): Array<Record<string, unknown>> {
    return this.stateHistory.map((state) => this.deepCopy(state));
  }

  /**
   * Очищает историю состояний
   * Requirements: clerkly.1, clerkly.2   * @returns {{success: boolean}} результат операции
   */
  clearStateHistory(): { success: boolean } {
    this.stateHistory = [];
    return { success: true };
  }

  /**
   * Возвращает все ключи состояния
   * Requirements: clerkly.1, clerkly.2   * @returns {string[]} массив ключей состояния
   */
  getStateKeys(): string[] {
    return Object.keys(this.state);
  }

  /**
   * Возвращает количество свойств в состоянии
   * Requirements: clerkly.1, clerkly.2   * @returns {number} количество свойств
   */
  getStateSize(): number {
    return Object.keys(this.state).length;
  }

  /**
   * Проверяет, пусто ли состояние
   * Requirements: clerkly.1, clerkly.2   * @returns {boolean} true если состояние пустое
   */
  isStateEmpty(): boolean {
    return Object.keys(this.state).length === 0;
  }

  /**
   * Создает deep copy объекта
   * Используется для обеспечения immutability
   * Requirements: clerkly.1, clerkly.2   * @param {T} obj - объект для копирования
   * @returns {T} deep copy объекта
   */
  private deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }

    if (obj instanceof Array) {
      const copy: unknown[] = [];
      for (let i = 0; i < obj.length; i++) {
        copy[i] = this.deepCopy(obj[i]);
      }
      return copy as T;
    }

    if (obj instanceof Object) {
      const copy: Record<string, unknown> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          copy[key] = this.deepCopy(obj[key]);
        }
      }
      return copy as T;
    }

    throw new Error('Unable to copy object. Type not supported.');
  }
}
