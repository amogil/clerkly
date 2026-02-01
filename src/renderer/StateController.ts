// Requirements: clerkly.1.3

interface StateResult {
  success: boolean;
  state?: Record<string, any>;
  error?: string;
}

class StateController {
  private state: Record<string, any>;
  private stateHistory: Array<Record<string, any>>;
  private maxHistorySize: number = 10;

  // Requirements: clerkly.1.3
  constructor(initialState: Record<string, any> = {}) {
    if (initialState !== null && typeof initialState !== 'object') {
      throw new Error('Invalid initialState: must be an object or null');
    }
    
    this.state = initialState === null ? {} : { ...initialState };
    this.stateHistory = [];
  }

  // Requirements: clerkly.1.3
  setState(newState: Record<string, any>): StateResult {
    try {
      if (newState === undefined || newState === null) {
        throw new Error('Invalid newState: newState parameter is required');
      }
      
      if (typeof newState !== 'object' || Array.isArray(newState)) {
        throw new Error('Invalid newState: must be an object');
      }
      
      this.stateHistory.push({ ...this.state });
      
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      this.state = {
        ...this.state,
        ...newState
      };
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error: any) {
      console.error('Failed to set state:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.3
  getState(): Record<string, any> {
    return { ...this.state };
  }

  // Requirements: clerkly.1.3
  resetState(newState: Record<string, any> = {}): StateResult {
    try {
      if (newState !== null && typeof newState !== 'object') {
        throw new Error('Invalid newState: must be an object or null');
      }
      
      this.stateHistory.push({ ...this.state });
      
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      this.state = newState === null ? {} : { ...newState };
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error: any) {
      console.error('Failed to reset state:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.3
  getStateProperty(key: string): any {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }
    
    return this.state[key];
  }

  // Requirements: clerkly.1.3
  setStateProperty(key: string, value: any): StateResult {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Invalid key: must be a non-empty string');
      }
      
      return this.setState({ [key]: value });
    } catch (error: any) {
      console.error('Failed to set state property:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.3
  removeStateProperty(key: string): StateResult {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Invalid key: must be a non-empty string');
      }
      
      if (!(key in this.state)) {
        return {
          success: false,
          error: 'Property not found in state'
        };
      }
      
      this.stateHistory.push({ ...this.state });
      
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      const newState = { ...this.state };
      delete newState[key];
      this.state = newState;
      
      return {
        success: true,
        state: { ...this.state }
      };
    } catch (error: any) {
      console.error('Failed to remove state property:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.3
  hasStateProperty(key: string): boolean {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }
    
    return key in this.state;
  }

  // Requirements: clerkly.1.3
  getStateHistory(): Array<Record<string, any>> {
    return [...this.stateHistory];
  }

  // Requirements: clerkly.1.3
  clearStateHistory(): { success: boolean } {
    this.stateHistory = [];
    return { success: true };
  }

  // Requirements: clerkly.1.3
  getStateKeys(): string[] {
    return Object.keys(this.state);
  }

  // Requirements: clerkly.1.3
  getStateSize(): number {
    return Object.keys(this.state).length;
  }

  // Requirements: clerkly.1.3
  isStateEmpty(): boolean {
    return Object.keys(this.state).length === 0;
  }
}

export default StateController;
