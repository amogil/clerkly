// Requirements: clerkly.2

import { StateController } from '../../src/renderer/StateController';

describe('StateController', () => {
  let stateController: StateController;

  beforeEach(() => {
    stateController = new StateController();
  });

  describe('constructor', () => {
    /* Preconditions: no StateController instance exists
       Action: create StateController with no initial state
       Assertions: state is empty object, history is empty
       Requirements: clerkly.2*/
    it('should initialize with empty state when no initial state provided', () => {
      const controller = new StateController();
      const state = controller.getState();

      expect(state).toEqual({});
      expect(controller.isStateEmpty()).toBe(true);
      expect(controller.getStateHistory()).toEqual([]);
    });

    /* Preconditions: no StateController instance exists
       Action: create StateController with initial state object
       Assertions: state equals initial state (deep copy), history is empty
       Requirements: clerkly.2*/
    it('should initialize with provided initial state', () => {
      const initialState = { key1: 'value1', key2: 42 };
      const controller = new StateController(initialState);
      const state = controller.getState();

      expect(state).toEqual(initialState);
      expect(controller.isStateEmpty()).toBe(false);
      expect(controller.getStateHistory()).toEqual([]);
    });

    /* Preconditions: no StateController instance exists
       Action: create StateController with initial state, mutate initial state object
       Assertions: internal state not affected by mutation (deep copy)
       Requirements: clerkly.2*/
    it('should create deep copy of initial state', () => {
      const initialState = { nested: { key: 'value' } };
      const controller = new StateController(initialState);

      // Mutate original object
      initialState.nested.key = 'modified';

      const state = controller.getState();
      expect(state.nested.key).toBe('value');
    });
  });

  describe('setState', () => {
    /* Preconditions: StateController initialized with empty state
       Action: call setState with new properties
       Assertions: returns success true, state updated with new properties, previous state saved to history
       Requirements: clerkly.2*/
    it('should update state with new properties (shallow merge)', () => {
      const newState = { key1: 'value1', key2: 42 };
      const result = stateController.setState(newState);

      expect(result.success).toBe(true);
      expect(result.state).toEqual(newState);
      expect(stateController.getState()).toEqual(newState);

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({});
    });

    /* Preconditions: StateController initialized with existing state
       Action: call setState with additional properties
       Assertions: new properties merged with existing (shallow merge), old properties preserved
       Requirements: clerkly.2*/
    it('should perform shallow merge with existing state', () => {
      stateController.setState({ key1: 'value1', key2: 42 });
      const result = stateController.setState({ key3: 'value3' });

      expect(result.success).toBe(true);
      expect(result.state).toEqual({ key1: 'value1', key2: 42, key3: 'value3' });
    });

    /* Preconditions: StateController initialized with existing state
       Action: call setState with overlapping properties
       Assertions: overlapping properties overwritten, non-overlapping preserved
       Requirements: clerkly.2*/
    it('should overwrite existing properties on shallow merge', () => {
      stateController.setState({ key1: 'old', key2: 42 });
      const result = stateController.setState({ key1: 'new', key3: 'value3' });

      expect(result.success).toBe(true);
      expect(result.state).toEqual({ key1: 'new', key2: 42, key3: 'value3' });
    });

    /* Preconditions: StateController initialized
       Action: call setState with null
       Assertions: returns success false, error about invalid state
       Requirements: clerkly.2*/
    it('should reject null as new state', () => {
      const result = stateController.setState(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
      expect(result.error).toContain('non-null object');
    });

    /* Preconditions: StateController initialized
       Action: call setState with undefined
       Assertions: returns success false, error about invalid state
       Requirements: clerkly.2*/
    it('should reject undefined as new state', () => {
      const result = stateController.setState(undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
    });

    /* Preconditions: StateController initialized
       Action: call setState with array
       Assertions: returns success false, error about invalid state (must be object)
       Requirements: clerkly.2*/
    it('should reject array as new state', () => {
      const result = stateController.setState([1, 2, 3] as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
      expect(result.error).toContain('non-null object');
    });

    /* Preconditions: StateController initialized
       Action: call setState with string
       Assertions: returns success false, error about invalid state
       Requirements: clerkly.2*/
    it('should reject non-object as new state', () => {
      const result = stateController.setState('string' as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
    });

    /* Preconditions: StateController initialized
       Action: call setState 11 times
       Assertions: history limited to 10 entries (oldest removed)
       Requirements: clerkly.2*/
    it('should limit history to 10 entries', () => {
      // Add 11 state changes
      for (let i = 0; i < 11; i++) {
        stateController.setState({ count: i });
      }

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(10);
      // First entry should be { count: 0 }, not empty object
      expect(history[0]).toEqual({ count: 0 });
      expect(history[9]).toEqual({ count: 9 });
    });

    /* Preconditions: StateController initialized with state
       Action: call setState, verify history contains previous state
       Assertions: history contains deep copy of previous state
       Requirements: clerkly.2*/
    it('should save previous state to history', () => {
      stateController.setState({ key1: 'value1' });
      stateController.setState({ key2: 'value2' });

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({});
      expect(history[1]).toEqual({ key1: 'value1' });
    });

    /* Preconditions: StateController initialized
       Action: call setState with nested object, mutate returned state
       Assertions: internal state not affected by mutation
       Requirements: clerkly.2*/
    it('should return immutable copy of state', () => {
      stateController.setState({ nested: { key: 'value' } });
      const result = stateController.setState({ key2: 'value2' });

      // Mutate returned state
      if (result.state) {
        result.state.nested.key = 'modified';
        result.state.key2 = 'modified';
      }

      const currentState = stateController.getState();
      expect(currentState.nested.key).toBe('value');
      expect(currentState.key2).toBe('value2');
    });
  });

  describe('getState', () => {
    /* Preconditions: StateController initialized with state
       Action: call getState()
       Assertions: returns deep copy of current state
       Requirements: clerkly.2*/
    it('should return copy of current state', () => {
      const initialState = { key1: 'value1', key2: 42 };
      stateController.setState(initialState);

      const state = stateController.getState();

      expect(state).toEqual(initialState);
    });

    /* Preconditions: StateController initialized with nested state
       Action: call getState(), mutate returned object
       Assertions: internal state not affected by mutation (immutability)
       Requirements: clerkly.2*/
    it('should return immutable copy (mutations do not affect internal state)', () => {
      stateController.setState({ nested: { key: 'value' }, array: [1, 2, 3] });

      const state1 = stateController.getState();
      state1.nested.key = 'modified';
      state1.array.push(4);
      state1.newKey = 'new';

      const state2 = stateController.getState();
      expect(state2.nested.key).toBe('value');
      expect(state2.array).toEqual([1, 2, 3]);
      expect(state2.newKey).toBeUndefined();
    });

    /* Preconditions: StateController initialized with empty state
       Action: call getState()
       Assertions: returns empty object
       Requirements: clerkly.2*/
    it('should return empty object when state is empty', () => {
      const state = stateController.getState();

      expect(state).toEqual({});
      expect(Object.keys(state)).toHaveLength(0);
    });

    /* Preconditions: StateController initialized with complex nested state
       Action: call getState()
       Assertions: returns deep copy of all nested structures
       Requirements: clerkly.2*/
    it('should return deep copy of complex nested state', () => {
      const complexState = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
          array: [{ id: 1 }, { id: 2 }],
        },
      };
      stateController.setState(complexState);

      const state = stateController.getState();
      state.level1.level2.level3.value = 'modified';
      state.level1.array[0].id = 999;

      const state2 = stateController.getState();
      expect(state2.level1.level2.level3.value).toBe('deep');
      expect(state2.level1.array[0].id).toBe(1);
    });
  });

  describe('resetState', () => {
    /* Preconditions: StateController initialized with existing state
       Action: call resetState with new state
       Assertions: state completely replaced, previous state saved to history
       Requirements: clerkly.2*/
    it('should completely replace state with new state', () => {
      stateController.setState({ key1: 'value1', key2: 42 });
      const result = stateController.resetState({ key3: 'value3' });

      expect(result.success).toBe(true);
      expect(result.state).toEqual({ key3: 'value3' });
      expect(stateController.getState()).toEqual({ key3: 'value3' });

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(2);
      expect(history[1]).toEqual({ key1: 'value1', key2: 42 });
    });

    /* Preconditions: StateController initialized with existing state
       Action: call resetState with empty object
       Assertions: state reset to empty object, previous state saved to history
       Requirements: clerkly.2*/
    it('should reset to empty state when called with empty object', () => {
      stateController.setState({ key1: 'value1' });
      const result = stateController.resetState({});

      expect(result.success).toBe(true);
      expect(result.state).toEqual({});
      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController initialized with existing state
       Action: call resetState with no arguments
       Assertions: state reset to empty object (default parameter)
       Requirements: clerkly.2*/
    it('should reset to empty state when called with no arguments', () => {
      stateController.setState({ key1: 'value1' });
      const result = stateController.resetState();

      expect(result.success).toBe(true);
      expect(result.state).toEqual({});
      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController initialized
       Action: call resetState with null
       Assertions: returns success false, error about invalid state
       Requirements: clerkly.2*/
    it('should reject null as new state', () => {
      const result = stateController.resetState(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
    });

    /* Preconditions: StateController initialized
       Action: call resetState with array
       Assertions: returns success false, error about invalid state
       Requirements: clerkly.2*/
    it('should reject array as new state', () => {
      const result = stateController.resetState([1, 2, 3] as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
    });

    /* Preconditions: StateController initialized
       Action: call resetState, verify history updated
       Assertions: previous state saved to history before reset
       Requirements: clerkly.2*/
    it('should save previous state to history before reset', () => {
      stateController.setState({ key1: 'value1' });
      stateController.resetState({ key2: 'value2' });

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({});
      expect(history[1]).toEqual({ key1: 'value1' });
    });
  });

  describe('getStateProperty', () => {
    /* Preconditions: StateController initialized with state
       Action: call getStateProperty with existing key
       Assertions: returns value for that key
       Requirements: clerkly.2*/
    it('should return value for existing property', () => {
      stateController.setState({ key1: 'value1', key2: 42 });

      expect(stateController.getStateProperty('key1')).toBe('value1');
      expect(stateController.getStateProperty('key2')).toBe(42);
    });

    /* Preconditions: StateController initialized with state
       Action: call getStateProperty with non-existent key
       Assertions: returns undefined
       Requirements: clerkly.2*/
    it('should return undefined for non-existent property', () => {
      stateController.setState({ key1: 'value1' });

      expect(stateController.getStateProperty('nonExistent')).toBeUndefined();
    });

    /* Preconditions: StateController initialized with nested object property
       Action: call getStateProperty, mutate returned object
       Assertions: internal state not affected (returns deep copy)
       Requirements: clerkly.2*/
    it('should return deep copy for object properties', () => {
      stateController.setState({ nested: { key: 'value' } });

      const nested = stateController.getStateProperty('nested');
      nested.key = 'modified';

      const nested2 = stateController.getStateProperty('nested');
      expect(nested2.key).toBe('value');
    });

    /* Preconditions: StateController initialized with array property
       Action: call getStateProperty, mutate returned array
       Assertions: internal state not affected (returns deep copy)
       Requirements: clerkly.2*/
    it('should return deep copy for array properties', () => {
      stateController.setState({ array: [1, 2, 3] });

      const array = stateController.getStateProperty('array');
      array.push(4);

      const array2 = stateController.getStateProperty('array');
      expect(array2).toEqual([1, 2, 3]);
    });

    /* Preconditions: StateController initialized with primitive property
       Action: call getStateProperty for primitive values
       Assertions: returns primitive value directly (no copy needed)
       Requirements: clerkly.2*/
    it('should return primitive values directly', () => {
      stateController.setState({ string: 'test', number: 42, boolean: true, nullValue: null });

      expect(stateController.getStateProperty('string')).toBe('test');
      expect(stateController.getStateProperty('number')).toBe(42);
      expect(stateController.getStateProperty('boolean')).toBe(true);
      expect(stateController.getStateProperty('nullValue')).toBeNull();
    });
  });

  describe('setStateProperty', () => {
    /* Preconditions: StateController initialized with empty state
       Action: call setStateProperty with new key-value
       Assertions: property added to state, previous state saved to history
       Requirements: clerkly.2*/
    it('should add new property to state', () => {
      stateController.setStateProperty('key1', 'value1');

      expect(stateController.getState()).toEqual({ key1: 'value1' });
      expect(stateController.getStateHistory()).toHaveLength(1);
    });

    /* Preconditions: StateController initialized with existing state
       Action: call setStateProperty with existing key
       Assertions: property value updated, previous state saved to history
       Requirements: clerkly.2*/
    it('should update existing property', () => {
      stateController.setState({ key1: 'old' });
      stateController.setStateProperty('key1', 'new');

      expect(stateController.getStateProperty('key1')).toBe('new');
      expect(stateController.getStateHistory()).toHaveLength(2);
    });

    /* Preconditions: StateController initialized
       Action: call setStateProperty with various value types
       Assertions: all value types stored correctly
       Requirements: clerkly.2*/
    it('should handle various value types', () => {
      stateController.setStateProperty('string', 'test');
      stateController.setStateProperty('number', 42);
      stateController.setStateProperty('boolean', true);
      stateController.setStateProperty('object', { nested: 'value' });
      stateController.setStateProperty('array', [1, 2, 3]);
      stateController.setStateProperty('null', null);

      expect(stateController.getStateProperty('string')).toBe('test');
      expect(stateController.getStateProperty('number')).toBe(42);
      expect(stateController.getStateProperty('boolean')).toBe(true);
      expect(stateController.getStateProperty('object')).toEqual({ nested: 'value' });
      expect(stateController.getStateProperty('array')).toEqual([1, 2, 3]);
      expect(stateController.getStateProperty('null')).toBeNull();
    });

    /* Preconditions: StateController initialized
       Action: call setStateProperty multiple times
       Assertions: history limited to 10 entries
       Requirements: clerkly.2*/
    it('should limit history to 10 entries', () => {
      for (let i = 0; i < 12; i++) {
        stateController.setStateProperty('count', i);
      }

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(10);
    });
  });

  describe('removeStateProperty', () => {
    /* Preconditions: StateController initialized with state
       Action: call removeStateProperty with existing key
       Assertions: property removed from state, previous state saved to history
       Requirements: clerkly.2*/
    it('should remove existing property from state', () => {
      stateController.setState({ key1: 'value1', key2: 'value2' });
      stateController.removeStateProperty('key1');

      expect(stateController.getState()).toEqual({ key2: 'value2' });
      expect(stateController.hasStateProperty('key1')).toBe(false);
      expect(stateController.getStateHistory()).toHaveLength(2);
    });

    /* Preconditions: StateController initialized with state
       Action: call removeStateProperty with non-existent key
       Assertions: state unchanged, history still updated
       Requirements: clerkly.2*/
    it('should handle removing non-existent property', () => {
      stateController.setState({ key1: 'value1' });
      const stateBefore = stateController.getState();

      stateController.removeStateProperty('nonExistent');

      expect(stateController.getState()).toEqual(stateBefore);
      expect(stateController.getStateHistory()).toHaveLength(2);
    });

    /* Preconditions: StateController initialized with multiple properties
       Action: call removeStateProperty to remove all properties
       Assertions: state becomes empty
       Requirements: clerkly.2*/
    it('should allow removing all properties', () => {
      stateController.setState({ key1: 'value1', key2: 'value2', key3: 'value3' });

      stateController.removeStateProperty('key1');
      stateController.removeStateProperty('key2');
      stateController.removeStateProperty('key3');

      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController initialized
       Action: call removeStateProperty multiple times
       Assertions: history limited to 10 entries
       Requirements: clerkly.2*/
    it('should limit history to 10 entries', () => {
      stateController.setState({ key1: 'v1', key2: 'v2', key3: 'v3' });

      for (let i = 0; i < 12; i++) {
        stateController.removeStateProperty(`key${(i % 3) + 1}`);
      }

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(10);
    });
  });

  describe('hasStateProperty', () => {
    /* Preconditions: StateController initialized with state
       Action: call hasStateProperty with existing key
       Assertions: returns true
       Requirements: clerkly.2*/
    it('should return true for existing property', () => {
      stateController.setState({ key1: 'value1' });

      expect(stateController.hasStateProperty('key1')).toBe(true);
    });

    /* Preconditions: StateController initialized with state
       Action: call hasStateProperty with non-existent key
       Assertions: returns false
       Requirements: clerkly.2*/
    it('should return false for non-existent property', () => {
      stateController.setState({ key1: 'value1' });

      expect(stateController.hasStateProperty('nonExistent')).toBe(false);
    });

    /* Preconditions: StateController initialized with empty state
       Action: call hasStateProperty with any key
       Assertions: returns false
       Requirements: clerkly.2*/
    it('should return false for empty state', () => {
      expect(stateController.hasStateProperty('anyKey')).toBe(false);
    });

    /* Preconditions: StateController initialized with property set to undefined
       Action: call hasStateProperty for that key
       Assertions: returns true (property exists even if value is undefined)
       Requirements: clerkly.2*/
    it('should return true for property with undefined value', () => {
      stateController.setStateProperty('key1', undefined);

      expect(stateController.hasStateProperty('key1')).toBe(true);
    });

    /* Preconditions: StateController initialized with property set to null
       Action: call hasStateProperty for that key
       Assertions: returns true (property exists even if value is null)
       Requirements: clerkly.2*/
    it('should return true for property with null value', () => {
      stateController.setStateProperty('key1', null);

      expect(stateController.hasStateProperty('key1')).toBe(true);
    });

    /* Preconditions: StateController initialized with property, then removed
       Action: call hasStateProperty after removal
       Assertions: returns false
       Requirements: clerkly.2*/
    it('should return false after property is removed', () => {
      stateController.setState({ key1: 'value1' });
      stateController.removeStateProperty('key1');

      expect(stateController.hasStateProperty('key1')).toBe(false);
    });
  });

  describe('getStateHistory', () => {
    /* Preconditions: StateController initialized with no state changes
       Action: call getStateHistory()
       Assertions: returns empty array
       Requirements: clerkly.2*/
    it('should return empty array when no state changes made', () => {
      const history = stateController.getStateHistory();

      expect(history).toEqual([]);
      expect(history).toHaveLength(0);
    });

    /* Preconditions: StateController initialized, multiple state changes made
       Action: call getStateHistory()
       Assertions: returns array of previous states in chronological order
       Requirements: clerkly.2*/
    it('should return history of previous states', () => {
      stateController.setState({ key1: 'value1' });
      stateController.setState({ key2: 'value2' });
      stateController.setState({ key3: 'value3' });

      const history = stateController.getStateHistory();

      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({});
      expect(history[1]).toEqual({ key1: 'value1' });
      expect(history[2]).toEqual({ key1: 'value1', key2: 'value2' });
    });

    /* Preconditions: StateController initialized with state changes
       Action: call getStateHistory(), mutate returned array
       Assertions: internal history not affected (returns deep copy)
       Requirements: clerkly.2*/
    it('should return immutable copy of history', () => {
      stateController.setState({ key1: 'value1' });
      stateController.setState({ key2: 'value2' });

      const history1 = stateController.getStateHistory();
      history1.push({ fake: 'state' });
      history1[0].modified = 'value';

      const history2 = stateController.getStateHistory();
      expect(history2).toHaveLength(2);
      expect(history2[0]).toEqual({});
    });

    /* Preconditions: StateController initialized, more than 10 state changes made
       Action: call getStateHistory()
       Assertions: returns only last 10 states
       Requirements: clerkly.2*/
    it('should return maximum of 10 history entries', () => {
      for (let i = 0; i < 15; i++) {
        stateController.setState({ count: i });
      }

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(10);
    });

    /* Preconditions: StateController initialized with nested state changes
       Action: call getStateHistory()
       Assertions: each history entry is deep copy of state at that time
       Requirements: clerkly.2*/
    it('should contain deep copies of each historical state', () => {
      stateController.setState({ nested: { key: 'value1' } });
      stateController.setState({ nested: { key: 'value2' } });

      const history = stateController.getStateHistory();

      expect(history[0]).toEqual({});
      expect(history[1].nested.key).toBe('value1');
    });
  });

  describe('clearStateHistory', () => {
    /* Preconditions: StateController initialized with state changes
       Action: call clearStateHistory()
       Assertions: returns success true, history becomes empty, current state unchanged
       Requirements: clerkly.2*/
    it('should clear all history entries', () => {
      stateController.setState({ key1: 'value1' });
      stateController.setState({ key2: 'value2' });
      stateController.setState({ key3: 'value3' });

      const result = stateController.clearStateHistory();

      expect(result.success).toBe(true);
      expect(stateController.getStateHistory()).toEqual([]);
      expect(stateController.getState()).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });

    /* Preconditions: StateController initialized with empty history
       Action: call clearStateHistory()
       Assertions: returns success true, no error (idempotent)
       Requirements: clerkly.2*/
    it('should handle clearing empty history', () => {
      const result = stateController.clearStateHistory();

      expect(result.success).toBe(true);
      expect(stateController.getStateHistory()).toEqual([]);
    });

    /* Preconditions: StateController initialized, history cleared, new changes made
       Action: make state changes after clearing history
       Assertions: new history starts accumulating from empty
       Requirements: clerkly.2*/
    it('should allow new history to accumulate after clearing', () => {
      stateController.setState({ key1: 'value1' });
      stateController.clearStateHistory();
      stateController.setState({ key2: 'value2' });

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ key1: 'value1' });
    });
  });

  describe('getStateKeys', () => {
    /* Preconditions: StateController initialized with state
       Action: call getStateKeys()
       Assertions: returns array of all property keys
       Requirements: clerkly.2*/
    it('should return all state property keys', () => {
      stateController.setState({ key1: 'value1', key2: 'value2', key3: 'value3' });

      const keys = stateController.getStateKeys();

      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    /* Preconditions: StateController initialized with empty state
       Action: call getStateKeys()
       Assertions: returns empty array
       Requirements: clerkly.2*/
    it('should return empty array for empty state', () => {
      const keys = stateController.getStateKeys();

      expect(keys).toEqual([]);
      expect(keys).toHaveLength(0);
    });

    /* Preconditions: StateController initialized with state
       Action: call getStateKeys(), mutate returned array
       Assertions: subsequent calls return correct keys (not affected by mutation)
       Requirements: clerkly.2*/
    it('should return new array each time (not reference to internal array)', () => {
      stateController.setState({ key1: 'value1' });

      const keys1 = stateController.getStateKeys();
      keys1.push('fake-key');

      const keys2 = stateController.getStateKeys();
      expect(keys2).toEqual(['key1']);
    });

    /* Preconditions: StateController initialized, properties added and removed
       Action: call getStateKeys() after modifications
       Assertions: returns only current keys
       Requirements: clerkly.2*/
    it('should reflect current state after modifications', () => {
      stateController.setState({ key1: 'value1', key2: 'value2' });
      stateController.removeStateProperty('key1');
      stateController.setStateProperty('key3', 'value3');

      const keys = stateController.getStateKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).not.toContain('key1');
    });
  });

  describe('getStateSize', () => {
    /* Preconditions: StateController initialized with state
       Action: call getStateSize()
       Assertions: returns number of properties in state
       Requirements: clerkly.2*/
    it('should return number of properties in state', () => {
      stateController.setState({ key1: 'value1', key2: 'value2', key3: 'value3' });

      expect(stateController.getStateSize()).toBe(3);
    });

    /* Preconditions: StateController initialized with empty state
       Action: call getStateSize()
       Assertions: returns 0
       Requirements: clerkly.2*/
    it('should return 0 for empty state', () => {
      expect(stateController.getStateSize()).toBe(0);
    });

    /* Preconditions: StateController initialized, properties added
       Action: call getStateSize() after adding properties
       Assertions: returns updated count
       Requirements: clerkly.2*/
    it('should update as properties are added', () => {
      expect(stateController.getStateSize()).toBe(0);

      stateController.setStateProperty('key1', 'value1');
      expect(stateController.getStateSize()).toBe(1);

      stateController.setStateProperty('key2', 'value2');
      expect(stateController.getStateSize()).toBe(2);
    });

    /* Preconditions: StateController initialized with state, properties removed
       Action: call getStateSize() after removing properties
       Assertions: returns updated count
       Requirements: clerkly.2*/
    it('should update as properties are removed', () => {
      stateController.setState({ key1: 'value1', key2: 'value2', key3: 'value3' });
      expect(stateController.getStateSize()).toBe(3);

      stateController.removeStateProperty('key1');
      expect(stateController.getStateSize()).toBe(2);

      stateController.removeStateProperty('key2');
      expect(stateController.getStateSize()).toBe(1);
    });
  });

  describe('isStateEmpty', () => {
    /* Preconditions: StateController initialized with empty state
       Action: call isStateEmpty()
       Assertions: returns true
       Requirements: clerkly.2*/
    it('should return true for empty state', () => {
      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController initialized with state
       Action: call isStateEmpty()
       Assertions: returns false
       Requirements: clerkly.2*/
    it('should return false when state has properties', () => {
      stateController.setState({ key1: 'value1' });

      expect(stateController.isStateEmpty()).toBe(false);
    });

    /* Preconditions: StateController initialized with state, all properties removed
       Action: call isStateEmpty() after removing all properties
       Assertions: returns true
       Requirements: clerkly.2*/
    it('should return true after all properties are removed', () => {
      stateController.setState({ key1: 'value1', key2: 'value2' });
      stateController.removeStateProperty('key1');
      stateController.removeStateProperty('key2');

      expect(stateController.isStateEmpty()).toBe(true);
    });

    /* Preconditions: StateController initialized with state, reset to empty
       Action: call isStateEmpty() after reset
       Assertions: returns true
       Requirements: clerkly.2*/
    it('should return true after state is reset to empty', () => {
      stateController.setState({ key1: 'value1' });
      stateController.resetState({});

      expect(stateController.isStateEmpty()).toBe(true);
    });
  });

  describe('edge cases and complex scenarios', () => {
    /* Preconditions: StateController initialized
       Action: set state with deeply nested objects
       Assertions: deep copy works correctly for all nesting levels
       Requirements: clerkly.2*/
    it('should handle deeply nested objects', () => {
      const deepState = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      stateController.setState(deepState);
      const retrieved = stateController.getState();

      retrieved.level1.level2.level3.level4.value = 'modified';

      const retrieved2 = stateController.getState();
      expect(retrieved2.level1.level2.level3.level4.value).toBe('deep');
    });

    /* Preconditions: StateController initialized
       Action: set state with arrays containing objects
       Assertions: deep copy works for nested arrays and objects
       Requirements: clerkly.2*/
    it('should handle arrays containing objects', () => {
      stateController.setState({
        items: [
          { id: 1, name: 'item1' },
          { id: 2, name: 'item2' },
        ],
      });

      const state = stateController.getState();
      state.items[0].name = 'modified';
      state.items.push({ id: 3, name: 'item3' });

      const state2 = stateController.getState();
      expect(state2.items).toHaveLength(2);
      expect(state2.items[0].name).toBe('item1');
    });

    /* Preconditions: StateController initialized
       Action: set state with Date objects
       Assertions: Date objects are properly copied
       Requirements: clerkly.2*/
    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      stateController.setState({ timestamp: date });

      const state = stateController.getState();
      state.timestamp.setFullYear(2025);

      const state2 = stateController.getState();
      expect(state2.timestamp.getFullYear()).toBe(2024);
    });

    /* Preconditions: StateController initialized
       Action: perform mixed operations (setState, setStateProperty, removeStateProperty)
       Assertions: all operations work correctly together, history tracks all changes
       Requirements: clerkly.2*/
    it('should handle mixed operations correctly', () => {
      stateController.setState({ key1: 'value1' });
      stateController.setStateProperty('key2', 'value2');
      stateController.setState({ key3: 'value3' });
      stateController.removeStateProperty('key1');

      const state = stateController.getState();
      expect(state).toEqual({ key2: 'value2', key3: 'value3' });

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(4);
    });

    /* Preconditions: StateController initialized
       Action: set state with empty string, zero, false values
       Assertions: falsy values are preserved correctly
       Requirements: clerkly.2*/
    it('should preserve falsy values correctly', () => {
      stateController.setState({
        emptyString: '',
        zero: 0,
        false: false,
        null: null,
      });

      const state = stateController.getState();
      expect(state.emptyString).toBe('');
      expect(state.zero).toBe(0);
      expect(state.false).toBe(false);
      expect(state.null).toBeNull();
    });

    /* Preconditions: StateController initialized
       Action: set state with special characters in keys
       Assertions: special characters in keys handled correctly
       Requirements: clerkly.2*/
    it('should handle special characters in property keys', () => {
      stateController.setState({
        'key-with-dash': 'value1',
        key_with_underscore: 'value2',
        'key.with.dot': 'value3',
        'key with space': 'value4',
      });

      expect(stateController.getStateProperty('key-with-dash')).toBe('value1');
      expect(stateController.getStateProperty('key_with_underscore')).toBe('value2');
      expect(stateController.getStateProperty('key.with.dot')).toBe('value3');
      expect(stateController.getStateProperty('key with space')).toBe('value4');
    });

    /* Preconditions: StateController initialized
       Action: set large state object (100+ properties)
       Assertions: all properties stored and retrieved correctly
       Requirements: clerkly.2*/
    it('should handle large state objects', () => {
      const largeState: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        largeState[`key${i}`] = `value${i}`;
      }

      stateController.setState(largeState);

      expect(stateController.getStateSize()).toBe(100);
      expect(stateController.getStateProperty('key0')).toBe('value0');
      expect(stateController.getStateProperty('key99')).toBe('value99');
    });

    /* Preconditions: StateController initialized with state
       Action: perform operations that trigger history limit multiple times
       Assertions: history consistently maintains 10 entries max
       Requirements: clerkly.2*/
    it('should consistently maintain history limit across different operations', () => {
      // Mix of setState, setStateProperty, removeStateProperty, resetState
      for (let i = 0; i < 5; i++) {
        stateController.setState({ count: i });
      }
      for (let i = 0; i < 5; i++) {
        stateController.setStateProperty('prop', i);
      }
      for (let i = 0; i < 5; i++) {
        stateController.removeStateProperty('count');
      }

      const history = stateController.getStateHistory();
      expect(history).toHaveLength(10);
    });

    /* Preconditions: StateController initialized
       Action: set state with circular reference (should not occur in normal use)
       Assertions: operations work with non-circular data
       Requirements: clerkly.2*/
    it('should work correctly with normal non-circular data', () => {
      // This test verifies normal operation without circular references
      const normalState = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark', notifications: true },
      };

      stateController.setState(normalState);
      const retrieved = stateController.getState();

      expect(retrieved).toEqual(normalState);
      expect(retrieved).not.toBe(normalState); // Different reference
    });
  });
});
