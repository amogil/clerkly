// Requirements: clerkly.1, clerkly.2

import * as fc from 'fast-check';
import { StateController } from '../../src/renderer/StateController';

describe('Property Tests - State Controller', () => {
  /* Preconditions: StateController initialized with random state containing various data types
     Action: call getState() to get state copy, mutate the returned object (add/modify/delete properties), call getState() again
     Assertions: for all states, internal state remains unchanged after mutations to returned object (deep equality with original)
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3: State Immutability - getState() returns copy and mutations do not affect internal state', () => {
    // Create JSON-safe arbitrary generator for state objects
    const jsonSafeValue = fc.letrec((tie) => ({
      value: fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.double(),
        fc.constantFrom(null),
        fc.dictionary(fc.string(), tie('value') as fc.Arbitrary<any>, { maxKeys: 10 }),
        fc.array(tie('value') as fc.Arbitrary<any>, { maxLength: 20 })
      ),
    })).value;

    // Filter out special JavaScript properties like __proto__, constructor, prototype
    const safeKeyFilter = (key: string) =>
      key !== '__proto__' && key !== 'constructor' && key !== 'prototype';

    // Recursively filter special properties from nested objects
    const filterSpecialProps = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map((item) => filterSpecialProps(item));
      }

      const filtered: Record<string, any> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && safeKeyFilter(key)) {
          filtered[key] = filterSpecialProps(obj[key]);
        }
      }
      return filtered;
    };

    const stateArbitrary = fc
      .dictionary(fc.string({ minLength: 1, maxLength: 50 }), jsonSafeValue, {
        minKeys: 1,
        maxKeys: 20,
      })
      .map((obj) => {
        // Filter out special properties recursively
        const filtered = filterSpecialProps(obj);
        // Ensure at least one property remains
        if (Object.keys(filtered).length === 0) {
          return { safeKey: 'value' };
        }
        return filtered;
      });

    fc.assert(
      fc.property(stateArbitrary, (initialState: Record<string, any>) => {
        // Create StateController with initial state
        const stateController = new StateController(initialState);

        // Get state copy
        const stateCopy1 = stateController.getState();

        // Verify initial state matches
        expect(stateCopy1).toEqual(initialState);

        // Mutate the returned object in various ways
        // 1. Add new properties
        stateCopy1['__new_property__'] = 'new-value';
        stateCopy1['__another_new__'] = { nested: 'object' };

        // 2. Modify existing properties (if any)
        const keys = Object.keys(stateCopy1);
        if (keys.length > 0) {
          const firstKey = keys[0];
          stateCopy1[firstKey] = '__modified__';

          if (keys.length > 1) {
            const secondKey = keys[1];
            delete stateCopy1[secondKey];
          }
        }

        // 3. Mutate nested objects/arrays (if any)
        for (const key in stateCopy1) {
          const value = stateCopy1[key];
          if (value !== null && typeof value === 'object') {
            if (Array.isArray(value)) {
              value.push('__mutated_array__');
            } else {
              (value as Record<string, unknown>)['__mutated_nested__'] = 'mutated';
            }
          }
        }

        // Get state again
        const stateCopy2 = stateController.getState();

        // Verify internal state is unchanged
        expect(stateCopy2).toEqual(initialState);
        expect(stateCopy2).not.toHaveProperty('__new_property__');
        expect(stateCopy2).not.toHaveProperty('__another_new__');

        // Verify no mutations propagated to internal state
        for (const key in stateCopy2) {
          const value = stateCopy2[key];
          if (value !== null && typeof value === 'object') {
            if (Array.isArray(value)) {
              expect(value).not.toContain('__mutated_array__');
            } else if (typeof value === 'object') {
              expect(value).not.toHaveProperty('__mutated_nested__');
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: StateController initialized with nested objects
     Action: get state, mutate nested objects deeply, get state again
     Assertions: nested objects in internal state remain unchanged
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: deeply nested objects remain immutable', () => {
    const initialState = {
      level1: {
        level2: {
          level3: {
            level4: {
              data: 'deep-value',
              array: [1, 2, 3],
              boolean: true,
            },
          },
        },
      },
      anotherKey: 'value',
    };

    const stateController = new StateController(initialState);

    // Get state and mutate deeply
    const state1 = stateController.getState() as {
      level1: {
        level2: {
          level3: {
            level4: {
              data: string;
              array: number[];
              newProp?: string;
            };
          };
          newLevel?: string;
        };
      };
    };
    state1.level1.level2.level3.level4.data = 'MUTATED';
    state1.level1.level2.level3.level4.array.push(999);
    state1.level1.level2.level3.level4.newProp = 'NEW';
    state1.level1.level2.newLevel = 'ADDED';

    // Get state again
    const state2 = stateController.getState() as typeof state1;

    // Verify no mutations propagated
    expect(state2).toEqual(initialState);
    expect(state2.level1.level2.level3.level4.data).toBe('deep-value');
    expect(state2.level1.level2.level3.level4.array).toEqual([1, 2, 3]);
    expect(state2.level1.level2.level3.level4).not.toHaveProperty('newProp');
    expect(state2.level1.level2).not.toHaveProperty('newLevel');
  });

  /* Preconditions: StateController initialized with arrays in state
     Action: get state, mutate arrays (push, pop, splice), get state again
     Assertions: arrays in internal state remain unchanged
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: arrays remain immutable', () => {
    const initialState = {
      simpleArray: [1, 2, 3, 4, 5],
      nestedArray: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      mixedArray: [1, 'string', { nested: 'object' }, [1, 2], true, null],
    };

    const stateController = new StateController(initialState);

    // Get state and mutate arrays
    const state1 = stateController.getState() as {
      simpleArray: number[];
      nestedArray: number[][];
      mixedArray: unknown[];
    };
    state1.simpleArray.push(999);
    state1.simpleArray[0] = 999 as never; // Type assertion needed for mutation
    state1.nestedArray[0].push(999);
    state1.nestedArray.push([999, 999]);
    // Mutate the array element before splicing
    if (Array.isArray(state1.mixedArray[3])) {
      state1.mixedArray[3].push(999);
    }
    state1.mixedArray.splice(2, 1);

    // Get state again
    const state2 = stateController.getState() as typeof state1;

    // Verify no mutations propagated
    expect(state2).toEqual(initialState);
    expect(state2.simpleArray).toEqual([1, 2, 3, 4, 5]);
    expect(state2.nestedArray).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(state2.mixedArray).toEqual([1, 'string', { nested: 'object' }, [1, 2], true, null]);
  });

  /* Preconditions: StateController initialized with empty state
     Action: get state, add properties to returned object, get state again
     Assertions: internal state remains empty
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: empty state remains immutable', () => {
    const stateController = new StateController({});

    // Get state and add properties
    const state1 = stateController.getState();
    state1.newKey = 'new-value';
    state1.anotherKey = { nested: 'object' };
    state1.arrayKey = [1, 2, 3];

    // Get state again
    const state2 = stateController.getState();

    // Verify state is still empty
    expect(state2).toEqual({});
    expect(Object.keys(state2).length).toBe(0);
  });

  /* Preconditions: StateController initialized with state containing many properties
     Action: get state, delete multiple properties from returned object, get state again
     Assertions: all properties remain in internal state
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: state with many properties remains immutable', () => {
    const initialState: Record<string, any> = {};
    for (let i = 0; i < 50; i++) {
      initialState[`key${i}`] = `value${i}`;
    }

    const stateController = new StateController(initialState);

    // Get state and delete properties
    const state1 = stateController.getState();
    for (let i = 0; i < 25; i++) {
      delete state1[`key${i}`];
    }

    // Get state again
    const state2 = stateController.getState();

    // Verify all properties still exist
    expect(state2).toEqual(initialState);
    expect(Object.keys(state2).length).toBe(50);
    for (let i = 0; i < 50; i++) {
      expect(state2[`key${i}`]).toBe(`value${i}`);
    }
  });

  /* Preconditions: StateController initialized with state
     Action: get state multiple times, mutate each copy differently, get state again
     Assertions: internal state remains unchanged regardless of multiple mutations
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: multiple getState calls return independent copies', () => {
    const initialState = {
      counter: 0,
      data: { value: 'original' },
      items: [1, 2, 3],
    };

    const stateController = new StateController(initialState);

    // Get state multiple times and mutate each copy
    const state1 = stateController.getState() as {
      counter: number;
      data: { value: string };
      items: number[];
    };
    state1.counter = 100;
    state1.data.value = 'mutated1';
    state1.items.push(999);

    const state2 = stateController.getState() as typeof state1;
    state2.counter = 200;
    state2.data.value = 'mutated2';
    state2.items.splice(0, 1);

    const state3 = stateController.getState() as {
      counter: number;
      data?: { value: string };
      items: number[];
    };
    state3.counter = 300;
    delete state3.data;
    state3.items = [];

    // Get final state
    const finalState = stateController.getState() as {
      counter: number;
      data: { value: string };
      items: number[];
    };

    // Verify internal state is unchanged
    expect(finalState).toEqual(initialState);
    expect(finalState.counter).toBe(0);
    expect(finalState.data.value).toBe('original');
    expect(finalState.items).toEqual([1, 2, 3]);
  });

  /* Preconditions: StateController initialized with state containing Date objects
     Action: get state, mutate Date objects, get state again
     Assertions: Date objects in internal state remain unchanged
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: Date objects remain immutable', () => {
    const originalDate = new Date('2024-01-01T00:00:00Z');
    const initialState = {
      timestamp: originalDate,
      nested: {
        date: new Date('2024-12-31T23:59:59Z'),
      },
    };

    const stateController = new StateController(initialState);

    // Get state and mutate Date objects
    const state1 = stateController.getState() as {
      timestamp: Date;
      nested: { date: Date };
    };
    state1.timestamp.setFullYear(2099);
    state1.nested.date.setMonth(0);

    // Get state again
    const state2 = stateController.getState() as typeof state1;

    // Verify Date objects are unchanged
    expect(state2.timestamp.getTime()).toBe(originalDate.getTime());
    expect(state2.nested.date.getTime()).toBe(new Date('2024-12-31T23:59:59Z').getTime());
  });

  /* Preconditions: StateController initialized with state
     Action: call setState to update state, get state, mutate returned object, get state again
     Assertions: state after setState is preserved, mutations do not affect it
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: state immutability after setState', () => {
    const stateController = new StateController({ initial: 'value' });

    // Update state
    stateController.setState({ updated: 'new-value', counter: 42 });

    // Get state and mutate
    const state1 = stateController.getState();
    state1.updated = 'MUTATED';
    state1.counter = 999;
    state1.added = 'NEW';

    // Get state again
    const state2 = stateController.getState();

    // Verify state is unchanged
    expect(state2.initial).toBe('value');
    expect(state2.updated).toBe('new-value');
    expect(state2.counter).toBe(42);
    expect(state2).not.toHaveProperty('added');
  });

  /* Preconditions: StateController initialized with state
     Action: call getStateProperty for nested object, mutate returned value, call getStateProperty again
     Assertions: property value remains unchanged in internal state
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3 edge case: getStateProperty returns immutable copy', () => {
    const initialState = {
      user: {
        name: 'John',
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
      items: [1, 2, 3],
    };

    const stateController = new StateController(initialState);

    // Get property and mutate
    const user1 = stateController.getStateProperty('user') as {
      name: string;
      settings: { theme: string };
      newProp?: string;
    };
    user1.name = 'MUTATED';
    user1.settings.theme = 'MUTATED';
    user1.newProp = 'NEW';

    const items1 = stateController.getStateProperty('items') as (number | string)[];
    items1.push(999);
    items1[0] = 'MUTATED';

    // Get properties again
    const user2 = stateController.getStateProperty('user') as typeof user1;
    const items2 = stateController.getStateProperty('items') as number[];

    // Verify properties are unchanged
    expect(user2).toEqual(initialState.user);
    expect(user2.name).toBe('John');
    expect(user2.settings.theme).toBe('dark');
    expect(user2).not.toHaveProperty('newProp');

    expect(items2).toEqual(initialState.items);
    expect(items2).toEqual([1, 2, 3]);
  });

  /* Preconditions: StateController initialized with complex nested structure
     Action: generate random mutations on nested structures, verify immutability
     Assertions: for all mutation patterns, internal state remains unchanged
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 3
  test('Property 3: complex nested structures remain immutable with random mutations', () => {
    const complexStateArbitrary = fc.record({
      primitives: fc.record({
        string: fc.string(),
        number: fc.integer(),
        boolean: fc.boolean(),
        null: fc.constant(null),
      }),
      arrays: fc.record({
        numbers: fc.array(fc.integer(), { maxLength: 10 }),
        strings: fc.array(fc.string(), { maxLength: 10 }),
        mixed: fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { maxLength: 10 }),
      }),
      nested: fc.record({
        level1: fc.record({
          level2: fc.record({
            data: fc.string(),
            values: fc.array(fc.integer(), { maxLength: 5 }),
          }),
        }),
      }),
    });

    fc.assert(
      fc.property(complexStateArbitrary, (initialState) => {
        const stateController = new StateController(initialState);

        // Get state and perform various mutations
        const state1 = stateController.getState() as {
          primitives: {
            string: string;
            number: number;
            boolean: boolean;
            null: null;
          };
          arrays: {
            numbers: number[];
            strings: string[];
            mixed: (string | number | boolean)[];
          };
          nested: {
            level1: {
              level2: {
                data: string;
                values: number[];
              };
              newProp?: string;
            };
          };
        };

        // Mutate primitives
        state1.primitives.string = 'MUTATED';
        state1.primitives.number = 999999;
        state1.primitives.boolean = !state1.primitives.boolean;

        // Mutate arrays
        state1.arrays.numbers.push(999);
        state1.arrays.strings.splice(0, 1);
        state1.arrays.mixed = [];

        // Mutate nested structures
        state1.nested.level1.level2.data = 'MUTATED';
        state1.nested.level1.level2.values.push(999);
        state1.nested.level1.newProp = 'NEW';

        // Get state again
        const state2 = stateController.getState();

        // Verify complete immutability
        expect(state2).toEqual(initialState);
      }),
      { numRuns: 100 }
    );
  });
});
