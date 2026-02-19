// Requirements: clerkly.1, clerkly.2
/**
 * State Controller - manages application state in renderer process
 * Ensures state immutability through deep copy
 * Supports change history (max 10 entries)
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
   * Updates application state
   * Performs shallow merge with current state
   * Saves previous state to history (max 10 entries)
   * Requirements: clerkly.1, clerkly.2
   * @param {Record<string, unknown>} newState - new state to merge
   * @returns {StateResult} operation result
   */
  setState(newState: Record<string, unknown>): StateResult {
    try {
      if (!newState || typeof newState !== 'object' || Array.isArray(newState)) {
        return {
          success: false,
          error: 'Invalid state: must be a non-null object',
        };
      }

      // Save current state to history
      this.stateHistory.push(this.deepCopy(this.state));

      // Limit history size
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }

      // Perform shallow merge
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
   * Returns a copy of current state
   * Ensures immutability through deep copy
   * Requirements: clerkly.1, clerkly.2
   * @returns {Record<string, unknown>} deep copy of current state
   */
  getState(): Record<string, unknown> {
    return this.deepCopy(this.state);
  }

  /**
   * Resets state to a new value
   * Saves previous state to history
   * Requirements: clerkly.1, clerkly.2
   * @param {Record<string, unknown>} newState - new state (defaults to empty object)
   * @returns {StateResult} operation result
   */
  resetState(newState: Record<string, unknown> = {}): StateResult {
    try {
      if (!newState || typeof newState !== 'object' || Array.isArray(newState)) {
        return {
          success: false,
          error: 'Invalid state: must be a non-null object',
        };
      }

      // Save current state to history
      this.stateHistory.push(this.deepCopy(this.state));

      // Limit history size
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }

      // Completely replace state
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
   * Returns a specific state property
   * Requirements: clerkly.1, clerkly.2
   * @param {string} key - property key
   * @returns {unknown} property value (deep copy if object)
   */
  getStateProperty(key: string): unknown {
    const value = this.state[key];
    // Return deep copy for objects and arrays
    if (value !== null && typeof value === 'object') {
      return this.deepCopy(value);
    }
    return value;
  }

  /**
   * Sets a specific state property
   * Saves previous state to history
   * Requirements: clerkly.1, clerkly.2
   * @param {string} key - property key
   * @param {unknown} value - property value
   */
  setStateProperty(key: string, value: unknown): void {
    // Save current state to history
    this.stateHistory.push(this.deepCopy(this.state));

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Set property
    this.state[key] = value;
  }

  /**
   * Removes a property from state
   * Saves previous state to history
   * Requirements: clerkly.1, clerkly.2
   * @param {string} key - property key to remove
   */
  removeStateProperty(key: string): void {
    // Save current state to history
    this.stateHistory.push(this.deepCopy(this.state));

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Remove property
    delete this.state[key];
  }

  /**
   * Checks if a property exists in state
   * Requirements: clerkly.1, clerkly.2
   * @param {string} key - property key
   * @returns {boolean} true if property exists
   */
  hasStateProperty(key: string): boolean {
    return key in this.state;
  }

  /**
   * Returns state change history
   * Returns deep copy for immutability
   * Requirements: clerkly.1, clerkly.2
   * @returns {Array<Record<string, unknown>>} array of previous states
   */
  getStateHistory(): Array<Record<string, unknown>> {
    return this.stateHistory.map((state) => this.deepCopy(state));
  }

  /**
   * Clears state history
   * Requirements: clerkly.1, clerkly.2
   * @returns {{success: boolean}} operation result
   */
  clearStateHistory(): { success: boolean } {
    this.stateHistory = [];
    return { success: true };
  }

  /**
   * Returns all state keys
   * Requirements: clerkly.1, clerkly.2
   * @returns {string[]} array of state keys
   */
  getStateKeys(): string[] {
    return Object.keys(this.state);
  }

  /**
   * Returns number of properties in state
   * Requirements: clerkly.1, clerkly.2
   * @returns {number} number of properties
   */
  getStateSize(): number {
    return Object.keys(this.state).length;
  }

  /**
   * Checks if state is empty
   * Requirements: clerkly.1, clerkly.2
   * @returns {boolean} true if state is empty
   */
  isStateEmpty(): boolean {
    return Object.keys(this.state).length === 0;
  }

  /**
   * Creates deep copy of an object
   * Used to ensure immutability
   * Requirements: clerkly.1, clerkly.2
   * @param {T} obj - object to copy
   * @returns {T} deep copy of object
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
