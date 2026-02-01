// Requirements: clerkly.2.1, clerkly.2.3

import { StateController } from '../../src/renderer/StateController';

describe('StateController', () => {
  let stateController;

  beforeEach(() => {
    stateController = new StateController();
  });

  describe('Constructor', () => {
    /* Preconditions: StateController class is available
       Action: create new StateController instance with no parameters
       Assertions: instance is created with empty state object
       Requirements: clerkly.1.3 */
    it('should initialize with empty state when no initial state provided', () => {
      const controller = new StateController();
      expect(controller.getState()).toEqual({});
    });

    /* Preconditions: StateController class is available
       Action: create new StateController instance with initial state object
       Assertions: instance is created with provided initial state
       Requirements: clerkly.1.3 */
    it('should initialize with provided initial state', () => {
      const initialState = { user: 'John', count: 0 };
      const controller = new StateController(initialState);
      expect(controller.getState()).toEqual(initialState);
    });

    /* Preconditions: StateController class is available
       Action: create new StateController instance with null initial state
       Assertions: instance is created with empty state object
       Requirements: clerkly.1.3 */
    it('should initialize with empty state when null provided', () => {
      const controller = new StateController(null);
      expect(controller.getState()).toEqual({});
    });

    /* Preconditions: StateController class is available
       Action: create new StateController instance with non-object initial state
       Assertions: throws error with message about invalid initialState
       Requirements: clerkly.1.3 */
    it('should throw error when initial state is not an object', () => {
      expect(() => new StateController('invalid')).toThrow('Invalid initialState: must be an object or null');
      expect(() => new StateController(123)).toThrow('Invalid initialState: must be an object or null');
      expect(() => new StateController(true)).toThrow('Invalid initialState: must be an object or null');
    });

    /* Preconditions: StateController class is available
       Action: create new StateController instance with initial state, then mutate the original object
       Assertions: controller state is not affected by external mutations
       Requirements: clerkly.1.3 */
    it('should create independent copy of initial state', () => {
      const initialState = { user: 'John' };
      const controller = new StateController(initialState);
      initialState.user = 'Jane';
      expect(controller.getState()).toEqual({ user: 'John' });
    });
  });

  describe('setState', () => {
    /* Preconditions: StateController instance with empty state
       Action: call setState with valid state object
       Assertions: returns success true, state is updated with new values
       Requirements: clerkly.1.3 */
    it('should update state with new values', () => {
      const newState = { user: 'John', count: 5 };
      const result = stateController.setState(newState);
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual(newState);
      expect(stateController.getState()).toEqual(newState);
    });

    /* Preconditions: StateController instance with existing state
       Action: call setState with partial state object
       Assertions: returns success true, state is merged with existing state
       Requirements: clerkly.1.3 */
    it('should merge new state with existing state', () => {
      stateController.setState({ user: 'John', count: 5 });
      const result = stateController.setState({ count: 10 });
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual({ user: 'John', count: 10 });
      expect(stateController.getState()).toEqual({ user: 'John', count: 10 });
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with undefined parameter
       Assertions: returns success false, error message about required parameter
       Requirements: clerkly.1.3 */
    it('should reject undefined newState', () => {
      const result = stateController.setState(undefined);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: newState parameter is required');
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with null parameter
       Assertions: returns success false, error message about required parameter
       Requirements: clerkly.1.3 */
    it('should reject null newState', () => {
      const result = stateController.setState(null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: newState parameter is required');
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with non-object parameter (string, number, array)
       Assertions: returns success false, error message about invalid type
       Requirements: clerkly.1.3 */
    it('should reject non-object newState', () => {
      let result = stateController.setState('invalid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: must be an object');
      
      result = stateController.setState(123);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: must be an object');
      
      result = stateController.setState([1, 2, 3]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: must be an object');
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with empty object
       Assertions: returns success true, state remains empty
       Requirements: clerkly.1.3 */
    it('should handle empty object as newState', () => {
      const result = stateController.setState({});
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual({});
      expect(stateController.getState()).toEqual({});
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with state object, then mutate the returned state
       Assertions: controller state is not affected by external mutations
       Requirements: clerkly.1.3 */
    it('should return independent copy of state', () => {
      const result = stateController.setState({ user: 'John' });
      result.state.user = 'Jane';
      
      expect(stateController.getState()).toEqual({ user: 'John' });
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState multiple times with different values
       Assertions: state history is maintained with previous states
       Requirements: clerkly.1.3 */
    it('should maintain state history', () => {
      stateController.setState({ count: 1 });
      stateController.setState({ count: 2 });
      stateController.setState({ count: 3 });
      
      const history = stateController.getStateHistory();
      expect(history.length).toBe(3);
      expect(history[0]).toEqual({});
      expect(history[1]).toEqual({ count: 1 });
      expect(history[2]).toEqual({ count: 2 });
    });
  });

  describe('getState', () => {
    /* Preconditions: StateController instance with empty state
       Action: call getState
       Assertions: returns empty object
       Requirements: clerkly.1.3 */
    it('should return empty object for empty state', () => {
      expect(stateController.getState()).toEqual({});
    });

    /* Preconditions: StateController instance with populated state
       Action: call getState
       Assertions: returns copy of current state
       Requirements: clerkly.1.3 */
    it('should return current state', () => {
      stateController.setState({ user: 'John', count: 5 });
      expect(stateController.getState()).toEqual({ user: 'John', count: 5 });
    });

    /* Preconditions: StateController instance with populated state
       Action: call getState and mutate returned object
       Assertions: controller state is not affected by external mutations
       Requirements: clerkly.1.3 */
    it('should return independent copy of state', () => {
      stateController.setState({ user: 'John' });
      const state = stateController.getState();
      state.user = 'Jane';
      
      expect(stateController.getState()).toEqual({ user: 'John' });
    });
  });

  describe('resetState', () => {
    /* Preconditions: StateController instance with populated state
       Action: call resetState with no parameters
       Assertions: returns success true, state is reset to empty object
       Requirements: clerkly.1.3 */
    it('should reset state to empty object when no parameter provided', () => {
      stateController.setState({ user: 'John', count: 5 });
      const result = stateController.resetState();
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual({});
      expect(stateController.getState()).toEqual({});
    });

    /* Preconditions: StateController instance with populated state
       Action: call resetState with new state object
       Assertions: returns success true, state is reset to provided object
       Requirements: clerkly.1.3 */
    it('should reset state to provided object', () => {
      stateController.setState({ user: 'John', count: 5 });
      const newState = { admin: true };
      const result = stateController.resetState(newState);
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual(newState);
      expect(stateController.getState()).toEqual(newState);
    });

    /* Preconditions: StateController instance with populated state
       Action: call resetState with null parameter
       Assertions: returns success true, state is reset to empty object
       Requirements: clerkly.1.3 */
    it('should reset state to empty object when null provided', () => {
      stateController.setState({ user: 'John' });
      const result = stateController.resetState(null);
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual({});
      expect(stateController.getState()).toEqual({});
    });

    /* Preconditions: StateController instance with populated state
       Action: call resetState with non-object parameter
       Assertions: returns success false, error message about invalid type
       Requirements: clerkly.1.3 */
    it('should reject non-object newState', () => {
      stateController.setState({ user: 'John' });
      const result = stateController.resetState('invalid');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid newState: must be an object or null');
    });
  });

  describe('getStateProperty', () => {
    /* Preconditions: StateController instance with populated state
       Action: call getStateProperty with existing key
       Assertions: returns value of the property
       Requirements: clerkly.1.3 */
    it('should return value of existing property', () => {
      stateController.setState({ user: 'John', count: 5 });
      expect(stateController.getStateProperty('user')).toBe('John');
      expect(stateController.getStateProperty('count')).toBe(5);
    });

    /* Preconditions: StateController instance with populated state
       Action: call getStateProperty with non-existing key
       Assertions: returns undefined
       Requirements: clerkly.1.3 */
    it('should return undefined for non-existing property', () => {
      stateController.setState({ user: 'John' });
      expect(stateController.getStateProperty('nonexistent')).toBeUndefined();
    });

    /* Preconditions: StateController instance with empty state
       Action: call getStateProperty with empty string key
       Assertions: throws error with message about invalid key
       Requirements: clerkly.1.3 */
    it('should throw error for empty string key', () => {
      expect(() => stateController.getStateProperty('')).toThrow('Invalid key: must be a non-empty string');
    });

    /* Preconditions: StateController instance with empty state
       Action: call getStateProperty with non-string key
       Assertions: throws error with message about invalid key
       Requirements: clerkly.1.3 */
    it('should throw error for non-string key', () => {
      expect(() => stateController.getStateProperty(123)).toThrow('Invalid key: must be a non-empty string');
      expect(() => stateController.getStateProperty(null)).toThrow('Invalid key: must be a non-empty string');
    });
  });

  describe('setStateProperty', () => {
    /* Preconditions: StateController instance with empty state
       Action: call setStateProperty with valid key and value
       Assertions: returns success true, property is added to state
       Requirements: clerkly.1.3 */
    it('should set property in state', () => {
      const result = stateController.setStateProperty('user', 'John');
      
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual({ user: 'John' });
    });

    /* Preconditions: StateController instance with populated state
       Action: call setStateProperty with existing key and new value
       Assertions: returns success true, property value is updated
       Requirements: clerkly.1.3 */
    it('should update existing property', () => {
      stateController.setState({ user: 'John', count: 5 });
      const result = stateController.setStateProperty('user', 'Jane');
      
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual({ user: 'Jane', count: 5 });
    });

    /* Preconditions: StateController instance with empty state
       Action: call setStateProperty with empty string key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1.3 */
    it('should reject empty string key', () => {
      const result = stateController.setStateProperty('', 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key: must be a non-empty string');
    });

    /* Preconditions: StateController instance with empty state
       Action: call setStateProperty with non-string key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1.3 */
    it('should reject non-string key', () => {
      const result = stateController.setStateProperty(123, 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key: must be a non-empty string');
    });
  });

  describe('removeStateProperty', () => {
    /* Preconditions: StateController instance with populated state
       Action: call removeStateProperty with existing key
       Assertions: returns success true, property is removed from state
       Requirements: clerkly.1.3 */
    it('should remove existing property from state', () => {
      stateController.setState({ user: 'John', count: 5 });
      const result = stateController.removeStateProperty('user');
      
      expect(result.success).toBe(true);
      expect(result.state).toEqual({ count: 5 });
      expect(stateController.getState()).toEqual({ count: 5 });
    });

    /* Preconditions: StateController instance with populated state
       Action: call removeStateProperty with non-existing key
       Assertions: returns success false, error message about property not found
       Requirements: clerkly.1.3 */
    it('should return error for non-existing property', () => {
      stateController.setState({ user: 'John' });
      const result = stateController.removeStateProperty('nonexistent');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Property not found in state');
    });

    /* Preconditions: StateController instance with empty state
       Action: call removeStateProperty with empty string key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1.3 */
    it('should reject empty string key', () => {
      const result = stateController.removeStateProperty('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key: must be a non-empty string');
    });
  });

  describe('hasStateProperty', () => {
    /* Preconditions: StateController instance with populated state
       Action: call hasStateProperty with existing key
       Assertions: returns true
       Requirements: clerkly.1.3 */
    it('should return true for existing property', () => {
      stateController.setState({ user: 'John', count: 5 });
      expect(stateController.hasStateProperty('user')).toBe(true);
      expect(stateController.hasStateProperty('count')).toBe(true);
    });

    /* Preconditions: StateController instance with populated state
       Action: call hasStateProperty with non-existing key
       Assertions: returns false
       Requirements: clerkly.1.3 */
    it('should return false for non-existing property', () => {
      stateController.setState({ user: 'John' });
      expect(stateController.hasStateProperty('nonexistent')).toBe(false);
    });

    /* Preconditions: StateController instance with empty state
       Action: call hasStateProperty with empty string key
       Assertions: throws error with message about invalid key
       Requirements: clerkly.1.3 */
    it('should throw error for empty string key', () => {
      expect(() => stateController.hasStateProperty('')).toThrow('Invalid key: must be a non-empty string');
    });
  });

  describe('State History', () => {
    /* Preconditions: StateController instance with empty state
       Action: call getStateHistory
       Assertions: returns empty array
       Requirements: clerkly.1.3 */
    it('should return empty history for new controller', () => {
      expect(stateController.getStateHistory()).toEqual([]);
    });

    /* Preconditions: StateController instance with state changes
       Action: call getStateHistory
       Assertions: returns array of previous states
       Requirements: clerkly.1.3 */
    it('should track state changes in history', () => {
      stateController.setState({ count: 1 });
      stateController.setState({ count: 2 });
      
      const history = stateController.getStateHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({});
      expect(history[1]).toEqual({ count: 1 });
    });

    /* Preconditions: StateController instance with state changes
       Action: call clearStateHistory
       Assertions: returns success true, history is cleared
       Requirements: clerkly.1.3 */
    it('should clear state history', () => {
      stateController.setState({ count: 1 });
      stateController.setState({ count: 2 });
      
      const result = stateController.clearStateHistory();
      expect(result.success).toBe(true);
      expect(stateController.getStateHistory()).toEqual([]);
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState 15 times to exceed max history size
       Assertions: history size is limited to 10 entries
       Requirements: clerkly.1.3 */
    it('should limit history size to max entries', () => {
      for (let i = 0; i < 15; i++) {
        stateController.setState({ count: i });
      }
      
      const history = stateController.getStateHistory();
      expect(history.length).toBe(10);
    });
  });

  describe('State Utility Methods', () => {
    /* Preconditions: StateController instance with populated state
       Action: call getStateKeys
       Assertions: returns array of state property keys
       Requirements: clerkly.1.3 */
    it('should return array of state keys', () => {
      stateController.setState({ user: 'John', count: 5, admin: true });
      const keys = stateController.getStateKeys();
      
      expect(keys).toEqual(['user', 'count', 'admin']);
    });

    /* Preconditions: StateController instance with populated state
       Action: call getStateSize
       Assertions: returns number of properties in state
       Requirements: clerkly.1.3 */
    it('should return state size', () => {
      stateController.setState({ user: 'John', count: 5 });
      expect(stateController.getStateSize()).toBe(2);
    });

    /* Preconditions: StateController instance with empty state
       Action: call isStateEmpty
       Assertions: returns true
       Requirements: clerkly.1.3 */
    it('should return true for empty state', () => {
      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController instance with populated state
       Action: call isStateEmpty
       Assertions: returns false
       Requirements: clerkly.1.3 */
    it('should return false for non-empty state', () => {
      stateController.setState({ user: 'John' });
      expect(stateController.isStateEmpty()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: StateController instance with empty state
       Action: call setState with nested objects
       Assertions: returns success true, nested objects are stored correctly
       Requirements: clerkly.1.3 */
    it('should handle nested objects in state', () => {
      const nestedState = {
        user: {
          name: 'John',
          profile: {
            age: 30,
            email: 'john@example.com'
          }
        }
      };
      
      const result = stateController.setState(nestedState);
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual(nestedState);
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with arrays in state
       Assertions: returns success true, arrays are stored correctly
       Requirements: clerkly.1.3 */
    it('should handle arrays in state values', () => {
      const stateWithArray = {
        users: ['John', 'Jane', 'Bob'],
        counts: [1, 2, 3, 4, 5]
      };
      
      const result = stateController.setState(stateWithArray);
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual(stateWithArray);
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with special characters in keys
       Assertions: returns success true, keys with special characters are handled
       Requirements: clerkly.1.3 */
    it('should handle special characters in state keys', () => {
      const specialState = {
        'user-name': 'John',
        'user_email': 'john@example.com',
        'user.id': 123
      };
      
      const result = stateController.setState(specialState);
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual(specialState);
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with various data types as values
       Assertions: returns success true, all data types are stored correctly
       Requirements: clerkly.1.3 */
    it('should handle various data types in state values', () => {
      const mixedState = {
        string: 'text',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, 3],
        object: { nested: 'value' }
      };
      
      const result = stateController.setState(mixedState);
      expect(result.success).toBe(true);
      expect(stateController.getState()).toEqual(mixedState);
    });

    /* Preconditions: StateController instance with empty state
       Action: call setState with large state object (100+ properties)
       Assertions: returns success true, large state is handled correctly
       Requirements: clerkly.1.3 */
    it('should handle large state objects', () => {
      const largeState = {};
      for (let i = 0; i < 100; i++) {
        largeState[`key${i}`] = `value${i}`;
      }
      
      const result = stateController.setState(largeState);
      expect(result.success).toBe(true);
      expect(stateController.getStateSize()).toBe(100);
    });
  });
});
