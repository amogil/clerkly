// Requirements: clerkly.1.3

/**
 * StateController class
 * Manages application state in the Renderer Process
 * Provides centralized state management with immutable updates
 * 
 * Requirements: clerkly.1.3
 */
class StateController {
  /**
   * Constructor
   * Initializes the StateController with optional initial state
   * @param {Object} initialState - Optional initial state object
   * 
   * Requirements: clerkly.1.3
   */
  constructor(initialState = {}) {
    // Validate initial state
    if (initialState !== null && typeof initialState !== 'object') {
      throw new Error('Invalid initialState: must be an object or null');
    }
    
    // Initialize state with a copy to prevent external mutations
    this.state = initialState === null ? {} : { ...initialState };
    
    // Track state history for debugging (optional feature)
    this.stateHistory = [];
    this.maxHistorySize = 10;
  }

  /**
   * Set new state
   * Updates the application state with new values
   * Performs shallow merge with existing state
   * @param {Object} newState - New state object to merge with current state
   * @returns {Object} Result object with success status and updated state
   * 
   * Requirements: clerkly.1.3
   */
  setState(newState) {
    try {
      // Validate newState parameter
      if (newState === undefined || newState === null) {
        throw new Error('Invalid newState: newState parameter is required');
      }
      
      if (typeof newState !== 'object' || Array.isArray(newState)) {
        throw new Error('Invalid newState: must be an object');
      }
      
      // Store previous state in history
      this.stateHistory.push({ ...this.state });
      
      // Trim history if it exceeds max size
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      // Merge new state with existing state (shallow merge)
      this.state = {
        ...this.state,
        ...newState
      };
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error) {
      console.error('Failed to set state:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current state
   * Returns a copy of the current application state
   * @returns {Object} Copy of current state
   * 
   * Requirements: clerkly.1.3
   */
  getState() {
    // Return a copy to prevent external mutations
    return { ...this.state };
  }

  /**
   * Reset state to initial or provided state
   * @param {Object} newState - Optional new state to reset to (defaults to empty object)
   * @returns {Object} Result object with success status
   * 
   * Requirements: clerkly.1.3
   */
  resetState(newState = {}) {
    try {
      // Validate newState parameter
      if (newState !== null && typeof newState !== 'object') {
        throw new Error('Invalid newState: must be an object or null');
      }
      
      // Store previous state in history
      this.stateHistory.push({ ...this.state });
      
      // Trim history if it exceeds max size
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      // Reset state
      this.state = newState === null ? {} : { ...newState };
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error) {
      console.error('Failed to reset state:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get specific state property
   * @param {string} key - Property key to retrieve
   * @returns {any} Value of the property, or undefined if not found
   * 
   * Requirements: clerkly.1.3
   */
  getStateProperty(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }
    
    return this.state[key];
  }

  /**
   * Set specific state property
   * @param {string} key - Property key to set
   * @param {any} value - Value to set
   * @returns {Object} Result object with success status
   * 
   * Requirements: clerkly.1.3
   */
  setStateProperty(key, value) {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Invalid key: must be a non-empty string');
      }
      
      // Use setState to maintain consistency
      return this.setState({ [key]: value });
    } catch (error) {
      console.error('Failed to set state property:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove specific state property
   * @param {string} key - Property key to remove
   * @returns {Object} Result object with success status
   * 
   * Requirements: clerkly.1.3
   */
  removeStateProperty(key) {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Invalid key: must be a non-empty string');
      }
      
      // Check if property exists
      if (!(key in this.state)) {
        return {
          success: false,
          error: 'Property not found in state'
        };
      }
      
      // Store previous state in history
      this.stateHistory.push({ ...this.state });
      
      // Trim history if it exceeds max size
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      // Create new state without the property
      const newState = { ...this.state };
      delete newState[key];
      this.state = newState;
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error) {
      console.error('Failed to remove state property:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if state has a specific property
   * @param {string} key - Property key to check
   * @returns {boolean} True if property exists, false otherwise
   * 
   * Requirements: clerkly.1.3
   */
  hasStateProperty(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }
    
    return key in this.state;
  }

  /**
   * Get state history
   * Returns array of previous states for debugging
   * @returns {Array<Object>} Array of previous states
   * 
   * Requirements: clerkly.1.3
   */
  getStateHistory() {
    return [...this.stateHistory];
  }

  /**
   * Clear state history
   * Removes all stored previous states
   * @returns {Object} Result object with success status
   * 
   * Requirements: clerkly.1.3
   */
  clearStateHistory() {
    this.stateHistory = [];
    return { success: true };
  }

  /**
   * Get state keys
   * Returns array of all state property keys
   * @returns {Array<string>} Array of state keys
   * 
   * Requirements: clerkly.1.3
   */
  getStateKeys() {
    return Object.keys(this.state);
  }

  /**
   * Get state size
   * Returns number of properties in state
   * @returns {number} Number of state properties
   * 
   * Requirements: clerkly.1.3
   */
  getStateSize() {
    return Object.keys(this.state).length;
  }

  /**
   * Check if state is empty
   * @returns {boolean} True if state has no properties, false otherwise
   * 
   * Requirements: clerkly.1.3
   */
  isStateEmpty() {
    return Object.keys(this.state).length === 0;
  }
}

// Export for use in both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateController;
}
