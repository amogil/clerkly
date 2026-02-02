/**
 * @jest-environment jsdom
 */

// Requirements: clerkly.2.1, clerkly.2.8
import { UIController } from '../../src/renderer/UIController';

describe('UIController', () => {
  let container: HTMLElement;
  let uiController: UIController;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div');
    container.setAttribute('data-testid', 'test-container');
    document.body.appendChild(container);
    uiController = new UIController(container);
  });

  afterEach(() => {
    // Clean up
    uiController.clearAllLoading();
    document.body.removeChild(container);
  });

  describe('constructor', () => {
    /* Preconditions: no UIController instance exists, container element created
       Action: create UIController with container element
       Assertions: container is set, loadingIndicators map is empty
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should initialize with container and empty loading indicators', () => {
      const controller = new UIController(container);

      expect(controller.getContainer()).toBe(container);
    });

    /* Preconditions: no UIController instance exists
       Action: create UIController with different container
       Assertions: correct container is stored
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should store provided container', () => {
      const customContainer = document.createElement('div');
      const controller = new UIController(customContainer);

      expect(controller.getContainer()).toBe(customContainer);
    });
  });

  describe('render', () => {
    /* Preconditions: UIController initialized with empty container
       Action: call render()
       Assertions: returns success true, container has main-container with header/content/footer, renderTime measured
       Requirements: clerkly.1.3, clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should render UI with header, content, and footer', () => {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.renderTime).toBe('number');

      const mainContainer = container.querySelector('[data-testid="main-container"]');
      expect(mainContainer).toBeTruthy();

      const header = container.querySelector('[data-testid="header"]');
      expect(header).toBeTruthy();
      expect(header?.textContent).toBe('Clerkly');

      const content = container.querySelector('[data-testid="content-area"]');
      expect(content).toBeTruthy();

      const footer = container.querySelector('[data-testid="footer"]');
      expect(footer).toBeTruthy();
      expect(footer?.textContent).toBe('v1.0.0');
    });

    /* Preconditions: UIController initialized, container has existing content
       Action: call render()
       Assertions: existing content cleared, new UI rendered
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should clear existing content before rendering', () => {
      container.innerHTML = '<div>Old content</div>';

      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(container.textContent).not.toContain('Old content');
      expect(container.querySelector('[data-testid="main-container"]')).toBeTruthy();
    });

    /* Preconditions: UIController initialized
       Action: call render() and measure performance
       Assertions: renderTime is less than 100ms (performance threshold), performanceWarning is false
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should render within performance threshold', () => {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBeLessThan(100);
      expect(result.performanceWarning).toBe(false);
    });

    /* Preconditions: UIController initialized
       Action: call render() multiple times
       Assertions: each render succeeds, UI is re-rendered correctly
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle multiple renders', () => {
      const result1 = uiController.render();
      expect(result1.success).toBe(true);

      const result2 = uiController.render();
      expect(result2.success).toBe(true);

      const mainContainer = container.querySelector('[data-testid="main-container"]');
      expect(mainContainer).toBeTruthy();
    });

    /* Preconditions: UIController initialized
       Action: call render(), verify performance warning logic
       Assertions: if renderTime > 100ms, performanceWarning is true
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should set performanceWarning when render exceeds threshold', () => {
      // Mock performance.now to simulate slow render
      const originalNow = performance.now;
      let callCount = 0;
      performance.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 0; // Start time
        return 150; // End time (150ms elapsed)
      });

      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBe(150);
      expect(result.performanceWarning).toBe(true);

      // Restore original
      performance.now = originalNow;
    });

    /* Preconditions: UIController initialized
       Action: call render() with error condition (container removed from DOM)
       Assertions: returns success false, renderTime still measured
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle render errors gracefully', () => {
      // Create a scenario that might cause errors
      const badController = new UIController(container);

      // Mock innerHTML setter to throw error
      const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(container, 'innerHTML', {
        set: () => {
          throw new Error('Test error');
        },
        configurable: true,
      });

      const result = badController.render();

      expect(result.success).toBe(false);
      expect(result.renderTime).toBeGreaterThanOrEqual(0);

      // Restore original
      if (originalInnerHTML) {
        Object.defineProperty(container, 'innerHTML', originalInnerHTML);
      }
    });
  });

  describe('updateView', () => {
    /* Preconditions: UIController initialized, UI rendered
       Action: call updateView with data object
       Assertions: returns success true, data display created in content area, updateTime measured
       Requirements: clerkly.1.3, clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should update view with new data', () => {
      uiController.render();

      const testData = { key1: 'value1', key2: 42 };
      const result = uiController.updateView(testData);

      expect(result.success).toBe(true);
      expect(result.updateTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.updateTime).toBe('number');

      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
      expect(dataDisplay?.textContent).toContain('key1');
      expect(dataDisplay?.textContent).toContain('value1');
      expect(dataDisplay?.textContent).toContain('key2');
      expect(dataDisplay?.textContent).toContain('42');
    });

    /* Preconditions: UIController initialized, UI rendered with existing data
       Action: call updateView with new data
       Assertions: old data display removed, new data display created
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should replace existing data display', () => {
      uiController.render();
      uiController.updateView({ old: 'data' });

      const result = uiController.updateView({ new: 'data' });

      expect(result.success).toBe(true);

      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay?.textContent).toContain('new');
      expect(dataDisplay?.textContent).not.toContain('old');
    });

    /* Preconditions: UIController initialized, UI rendered
       Action: call updateView() and measure performance
       Assertions: updateTime is less than 100ms, performanceWarning is false
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should update within performance threshold', () => {
      uiController.render();

      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(true);
      expect(result.updateTime).toBeLessThan(100);
      expect(result.performanceWarning).toBe(false);
    });

    /* Preconditions: UIController initialized, UI rendered
       Action: call updateView with various data types
       Assertions: all data types displayed correctly
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle various data types', () => {
      uiController.render();

      // Test with object
      let result = uiController.updateView({ key: 'value' });
      expect(result.success).toBe(true);

      // Test with array
      result = uiController.updateView([1, 2, 3]);
      expect(result.success).toBe(true);

      // Test with string
      result = uiController.updateView('simple string');
      expect(result.success).toBe(true);

      // Test with number
      result = uiController.updateView(42);
      expect(result.success).toBe(true);

      // Test with null
      result = uiController.updateView(null);
      expect(result.success).toBe(true);
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay?.textContent).toBe('No data');
    });

    /* Preconditions: UIController initialized, UI rendered
       Action: call updateView with slow performance
       Assertions: performanceWarning is true when updateTime > 100ms
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should set performanceWarning when update exceeds threshold', () => {
      uiController.render();

      // Mock performance.now to simulate slow update
      const originalNow = performance.now;
      let callCount = 0;
      performance.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 0; // Start time
        return 120; // End time (120ms elapsed)
      });

      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(true);
      expect(result.updateTime).toBe(120);
      expect(result.performanceWarning).toBe(true);

      // Restore original
      performance.now = originalNow;
    });

    /* Preconditions: UIController initialized, UI not rendered
       Action: call updateView without rendering first
       Assertions: returns success false, error about content area not found
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle missing content area', () => {
      // Don't render first
      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(false);
      expect(result.updateTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('showLoading', () => {
    /* Preconditions: UIController initialized
       Action: call showLoading with operationId and message
       Assertions: returns success true, loading indicator element created and appended to container
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should show loading indicator', () => {
      const result = uiController.showLoading('test-op', 'Loading...');

      expect(result.success).toBe(true);

      const loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeTruthy();
      expect(loadingElement?.textContent).toBe('Loading...');
      expect(loadingElement?.className).toBe('loading-indicator');
    });

    /* Preconditions: UIController initialized
       Action: call showLoading with same operationId twice
       Assertions: second call returns success false, error about existing indicator
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should reject duplicate loading indicators', () => {
      const result1 = uiController.showLoading('test-op', 'Loading...');
      expect(result1.success).toBe(true);

      const result2 = uiController.showLoading('test-op', 'Loading again...');
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });

    /* Preconditions: UIController initialized
       Action: call showLoading with multiple different operationIds
       Assertions: all loading indicators created successfully
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle multiple loading indicators', () => {
      const result1 = uiController.showLoading('op1', 'Loading 1...');
      const result2 = uiController.showLoading('op2', 'Loading 2...');
      const result3 = uiController.showLoading('op3', 'Loading 3...');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      expect(container.querySelector('[data-testid="loading-op1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="loading-op2"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="loading-op3"]')).toBeTruthy();
    });

    /* Preconditions: UIController initialized
       Action: call showLoading with empty message
       Assertions: loading indicator created with empty message
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle empty loading message', () => {
      const result = uiController.showLoading('test-op', '');

      expect(result.success).toBe(true);

      const loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeTruthy();
      expect(loadingElement?.textContent).toBe('');
    });
  });

  describe('hideLoading', () => {
    /* Preconditions: UIController initialized, loading indicator shown
       Action: call hideLoading with operationId
       Assertions: returns success true, loading indicator removed, duration calculated
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should hide loading indicator and return duration', () => {
      uiController.showLoading('test-op', 'Loading...');

      // Wait a bit to ensure duration > 0
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Small delay
      }

      const result = uiController.hideLoading('test-op');

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');

      const loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeNull();
    });

    /* Preconditions: UIController initialized, no loading indicator shown
       Action: call hideLoading with non-existent operationId
       Assertions: returns success false, error about indicator not found
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle hiding non-existent loading indicator', () => {
      const result = uiController.hideLoading('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    /* Preconditions: UIController initialized, multiple loading indicators shown
       Action: call hideLoading for one indicator
       Assertions: only specified indicator removed, others remain
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should hide only specified loading indicator', () => {
      uiController.showLoading('op1', 'Loading 1...');
      uiController.showLoading('op2', 'Loading 2...');
      uiController.showLoading('op3', 'Loading 3...');

      const result = uiController.hideLoading('op2');

      expect(result.success).toBe(true);
      expect(container.querySelector('[data-testid="loading-op1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="loading-op2"]')).toBeNull();
      expect(container.querySelector('[data-testid="loading-op3"]')).toBeTruthy();
    });

    /* Preconditions: UIController initialized, loading indicator shown then hidden
       Action: call hideLoading again with same operationId
       Assertions: returns success false, error about indicator not found
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle hiding already hidden indicator', () => {
      uiController.showLoading('test-op', 'Loading...');
      uiController.hideLoading('test-op');

      const result = uiController.hideLoading('test-op');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('withLoading', () => {
    /* Preconditions: UIController initialized
       Action: call withLoading with fast operation (< 200ms)
       Assertions: operation completes, loading indicator not shown, result returned
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should not show loading for fast operations', async () => {
      const fastOperation = jest.fn(async () => {
        return 'result';
      });

      const result = await uiController.withLoading('test-op', fastOperation, 'Loading...');

      expect(result).toBe('result');
      expect(fastOperation).toHaveBeenCalled();

      // Loading indicator should not be shown for fast operations
      const loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeNull();
    });

    /* Preconditions: UIController initialized
       Action: call withLoading with slow operation (> 200ms)
       Assertions: loading indicator shown after 200ms, then hidden after completion
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should show loading for slow operations', async () => {
      const slowOperation = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return 'result';
      });

      const promise = uiController.withLoading('test-op', slowOperation, 'Loading...');

      // Wait for loading threshold (200ms)
      await new Promise((resolve) => setTimeout(resolve, 210));

      // Loading indicator should be shown
      let loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeTruthy();

      // Wait for operation to complete
      const result = await promise;

      expect(result).toBe('result');
      expect(slowOperation).toHaveBeenCalled();

      // Loading indicator should be hidden after completion
      loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeNull();
    });

    /* Preconditions: UIController initialized
       Action: call withLoading with operation that throws error
       Assertions: error propagated, loading indicator hidden
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle operation errors and hide loading', async () => {
      const errorOperation = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        throw new Error('Operation failed');
      });

      const promise = uiController.withLoading('test-op', errorOperation, 'Loading...');

      // Wait for loading threshold
      await new Promise((resolve) => setTimeout(resolve, 210));

      // Loading indicator should be shown
      let loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeTruthy();

      // Wait for operation to fail
      await expect(promise).rejects.toThrow('Operation failed');

      // Loading indicator should be hidden after error
      loadingElement = container.querySelector('[data-testid="loading-test-op"]');
      expect(loadingElement).toBeNull();
    });

    /* Preconditions: UIController initialized
       Action: call withLoading with operation that returns various types
       Assertions: all return types handled correctly
       Requirements: clerkly.nfr.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle various return types', async () => {
      // Test with object
      let result = await uiController.withLoading(
        'op1',
        async () => ({ key: 'value' }),
        'Loading...'
      );
      expect(result).toEqual({ key: 'value' });

      // Test with array
      result = await uiController.withLoading('op2', async () => [1, 2, 3], 'Loading...');
      expect(result).toEqual([1, 2, 3]);

      // Test with null
      result = await uiController.withLoading('op3', async () => null, 'Loading...');
      expect(result).toBeNull();

      // Test with undefined
      result = await uiController.withLoading('op4', async () => undefined, 'Loading...');
      expect(result).toBeUndefined();
    });
  });

  describe('createHeader', () => {
    /* Preconditions: UIController initialized
       Action: call createHeader()
       Assertions: returns header element with correct attributes and content
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create header element', () => {
      const header = uiController.createHeader();

      expect(header.tagName).toBe('HEADER');
      expect(header.getAttribute('data-testid')).toBe('header');
      expect(header.className).toBe('app-header');
      expect(header.textContent).toBe('Clerkly');
    });

    /* Preconditions: UIController initialized
       Action: call createHeader() multiple times
       Assertions: each call returns new independent element
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create independent header elements', () => {
      const header1 = uiController.createHeader();
      const header2 = uiController.createHeader();

      expect(header1).not.toBe(header2);
      expect(header1.textContent).toBe(header2.textContent);
    });
  });

  describe('createContent', () => {
    /* Preconditions: UIController initialized
       Action: call createContent()
       Assertions: returns content div element with correct attributes
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create content area element', () => {
      const content = uiController.createContent();

      expect(content.tagName).toBe('DIV');
      expect(content.getAttribute('data-testid')).toBe('content-area');
      expect(content.className).toBe('content-area');
    });

    /* Preconditions: UIController initialized
       Action: call createContent() multiple times
       Assertions: each call returns new independent element
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create independent content elements', () => {
      const content1 = uiController.createContent();
      const content2 = uiController.createContent();

      expect(content1).not.toBe(content2);
    });
  });

  describe('createFooter', () => {
    /* Preconditions: UIController initialized
       Action: call createFooter()
       Assertions: returns footer element with correct attributes and version
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create footer element', () => {
      const footer = uiController.createFooter();

      expect(footer.tagName).toBe('FOOTER');
      expect(footer.getAttribute('data-testid')).toBe('footer');
      expect(footer.className).toBe('app-footer');
      expect(footer.textContent).toBe('v1.0.0');
    });

    /* Preconditions: UIController initialized
       Action: call createFooter() multiple times
       Assertions: each call returns new independent element
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create independent footer elements', () => {
      const footer1 = uiController.createFooter();
      const footer2 = uiController.createFooter();

      expect(footer1).not.toBe(footer2);
      expect(footer1.textContent).toBe(footer2.textContent);
    });
  });

  describe('createDataDisplay', () => {
    /* Preconditions: UIController initialized
       Action: call createDataDisplay with object data
       Assertions: returns div with data-display testid, displays key-value pairs
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create data display for object', () => {
      const data = { key1: 'value1', key2: 42, key3: true };
      const display = uiController.createDataDisplay(data);

      expect(display.tagName).toBe('DIV');
      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.className).toBe('data-display');

      const list = display.querySelector('ul.data-list');
      expect(list).toBeTruthy();

      const items = display.querySelectorAll('li.data-item');
      expect(items.length).toBe(3);

      expect(display.textContent).toContain('key1');
      expect(display.textContent).toContain('value1');
      expect(display.textContent).toContain('key2');
      expect(display.textContent).toContain('42');
      expect(display.textContent).toContain('key3');
      expect(display.textContent).toContain('true');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with array data
       Assertions: displays array items with indices
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should create data display for array', () => {
      const data = ['item1', 'item2', 'item3'];
      const display = uiController.createDataDisplay(data);

      expect(display.getAttribute('data-testid')).toBe('data-display');

      const items = display.querySelectorAll('li.data-item');
      expect(items.length).toBe(3);

      expect(display.textContent).toContain('0');
      expect(display.textContent).toContain('item1');
      expect(display.textContent).toContain('1');
      expect(display.textContent).toContain('item2');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with null
       Assertions: displays "No data" message
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle null data', () => {
      const display = uiController.createDataDisplay(null);

      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.textContent).toBe('No data');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with undefined
       Assertions: displays "No data" message
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle undefined data', () => {
      const display = uiController.createDataDisplay(undefined);

      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.textContent).toBe('No data');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with primitive string
       Assertions: displays string value directly
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle primitive string data', () => {
      const display = uiController.createDataDisplay('simple string');

      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.textContent).toBe('simple string');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with primitive number
       Assertions: displays number value as string
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle primitive number data', () => {
      const display = uiController.createDataDisplay(42);

      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.textContent).toBe('42');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with nested object
       Assertions: nested objects displayed as JSON strings
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle nested objects', () => {
      const data = {
        nested: { key: 'value' },
        array: [1, 2, 3],
      };
      const display = uiController.createDataDisplay(data);

      expect(display.getAttribute('data-testid')).toBe('data-display');
      expect(display.textContent).toContain('nested');
      expect(display.textContent).toContain('array');
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with empty object
       Assertions: creates display with no items
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle empty object', () => {
      const display = uiController.createDataDisplay({});

      expect(display.getAttribute('data-testid')).toBe('data-display');

      const items = display.querySelectorAll('li.data-item');
      expect(items.length).toBe(0);
    });

    /* Preconditions: UIController initialized
       Action: call createDataDisplay with empty array
       Assertions: creates display with no items
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle empty array', () => {
      const display = uiController.createDataDisplay([]);

      expect(display.getAttribute('data-testid')).toBe('data-display');

      const items = display.querySelectorAll('li.data-item');
      expect(items.length).toBe(0);
    });
  });

  describe('clearAllLoading', () => {
    /* Preconditions: UIController initialized, multiple loading indicators shown
       Action: call clearAllLoading()
       Assertions: all loading indicators removed from DOM
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should clear all loading indicators', () => {
      uiController.showLoading('op1', 'Loading 1...');
      uiController.showLoading('op2', 'Loading 2...');
      uiController.showLoading('op3', 'Loading 3...');

      uiController.clearAllLoading();

      expect(container.querySelector('[data-testid="loading-op1"]')).toBeNull();
      expect(container.querySelector('[data-testid="loading-op2"]')).toBeNull();
      expect(container.querySelector('[data-testid="loading-op3"]')).toBeNull();
    });

    /* Preconditions: UIController initialized, no loading indicators shown
       Action: call clearAllLoading()
       Assertions: no error, operation completes successfully (idempotent)
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle clearing when no loading indicators exist', () => {
      expect(() => {
        uiController.clearAllLoading();
      }).not.toThrow();
    });

    /* Preconditions: UIController initialized, loading indicators shown and cleared
       Action: show new loading indicators after clearing
       Assertions: new indicators can be shown successfully
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should allow new loading indicators after clearing', () => {
      uiController.showLoading('op1', 'Loading...');
      uiController.clearAllLoading();

      const result = uiController.showLoading('op1', 'Loading again...');

      expect(result.success).toBe(true);
      expect(container.querySelector('[data-testid="loading-op1"]')).toBeTruthy();
    });
  });

  describe('getContainer', () => {
    /* Preconditions: UIController initialized with container
       Action: call getContainer()
       Assertions: returns the container element
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should return current container', () => {
      const returnedContainer = uiController.getContainer();

      expect(returnedContainer).toBe(container);
    });

    /* Preconditions: UIController initialized
       Action: call getContainer() multiple times
       Assertions: always returns same container reference
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should return same container reference', () => {
      const container1 = uiController.getContainer();
      const container2 = uiController.getContainer();

      expect(container1).toBe(container2);
      expect(container1).toBe(container);
    });
  });

  describe('setContainer', () => {
    /* Preconditions: UIController initialized with container
       Action: call setContainer with new container
       Assertions: container updated, getContainer returns new container
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should update container', () => {
      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);

      uiController.setContainer(newContainer);

      expect(uiController.getContainer()).toBe(newContainer);
      expect(uiController.getContainer()).not.toBe(container);

      document.body.removeChild(newContainer);
    });

    /* Preconditions: UIController initialized with loading indicators shown
       Action: call setContainer with new container
       Assertions: all loading indicators cleared before container change
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should clear loading indicators when changing container', () => {
      uiController.showLoading('op1', 'Loading...');
      uiController.showLoading('op2', 'Loading...');

      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);

      uiController.setContainer(newContainer);

      // Old container should not have loading indicators
      expect(container.querySelector('[data-testid="loading-op1"]')).toBeNull();
      expect(container.querySelector('[data-testid="loading-op2"]')).toBeNull();

      document.body.removeChild(newContainer);
    });

    /* Preconditions: UIController initialized, UI rendered in old container
       Action: call setContainer with new container, then render
       Assertions: UI rendered in new container, old container unchanged
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should render in new container after setContainer', () => {
      uiController.render();

      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);

      uiController.setContainer(newContainer);
      uiController.render();

      // New container should have UI
      expect(newContainer.querySelector('[data-testid="main-container"]')).toBeTruthy();

      // Old container should still have its previous content (render doesn't clear old container)
      expect(container.querySelector('[data-testid="main-container"]')).toBeTruthy();

      document.body.removeChild(newContainer);
    });
  });

  describe('edge cases and error handling', () => {
    /* Preconditions: UIController initialized
       Action: call render with very large data structure
       Assertions: render completes successfully, performance may be slower
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle large data structures', () => {
      uiController.render();

      const largeData: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`key${i}`] = `value${i}`;
      }

      const result = uiController.updateView(largeData);

      expect(result.success).toBe(true);
      expect(result.updateTime).toBeGreaterThanOrEqual(0);
    });

    /* Preconditions: UIController initialized
       Action: call methods with special characters in data
       Assertions: special characters handled correctly, no XSS vulnerabilities
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle special characters in data', () => {
      uiController.render();

      const specialData = {
        'key<script>': 'value<script>alert("xss")</script>',
        'key&': 'value&amp;',
        'key"': 'value"quotes"',
      };

      const result = uiController.updateView(specialData);

      expect(result.success).toBe(true);

      // Verify no script execution (textContent, not innerHTML)
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay?.innerHTML).not.toContain('<script>');
    });

    /* Preconditions: UIController initialized
       Action: rapidly call render multiple times
       Assertions: all renders complete successfully
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle rapid consecutive renders', () => {
      for (let i = 0; i < 10; i++) {
        const result = uiController.render();
        expect(result.success).toBe(true);
      }

      const mainContainer = container.querySelector('[data-testid="main-container"]');
      expect(mainContainer).toBeTruthy();
    });

    /* Preconditions: UIController initialized
       Action: call updateView with circular reference object
       Assertions: handles gracefully, returns success (displays what it can)
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle circular references in data', () => {
      uiController.render();

      const circularData: any = { key: 'value' };
      circularData.self = circularData;

      // This should not cause infinite loop or crash
      // The circular reference will be displayed as [object Object] or similar
      const result = uiController.updateView(circularData);

      // Should complete without crashing (success may be true or false depending on implementation)
      expect(result.updateTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.success).toBe('boolean');
    });

    /* Preconditions: UIController initialized, multiple operations in progress
       Action: call showLoading, hideLoading, render, updateView in various orders
       Assertions: all operations complete successfully without interference
       Requirements: clerkly.1.3, clerkly.2.1, clerkly.2.8 */
    it('should handle concurrent operations', () => {
      uiController.showLoading('op1', 'Loading 1...');
      const renderResult = uiController.render();
      uiController.showLoading('op2', 'Loading 2...');
      const updateResult = uiController.updateView({ test: 'data' });
      uiController.hideLoading('op1');

      expect(renderResult.success).toBe(true);
      expect(updateResult.success).toBe(true);
      expect(container.querySelector('[data-testid="loading-op1"]')).toBeNull();
      expect(container.querySelector('[data-testid="loading-op2"]')).toBeTruthy();
    });
  });

  describe('performance monitoring', () => {
    /* Preconditions: UIController initialized
       Action: call render and verify performance warning logged
       Assertions: console.warn called when renderTime > 100ms
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should log performance warning for slow render', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock slow render
      const originalNow = performance.now;
      let callCount = 0;
      performance.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 0;
        return 150;
      });

      uiController.render();

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Slow UI render'));

      // Restore
      performance.now = originalNow;
      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UIController initialized, UI rendered
       Action: call updateView and verify performance warning logged
       Assertions: console.warn called when updateTime > 100ms
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should log performance warning for slow update', () => {
      uiController.render();

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock slow update
      const originalNow = performance.now;
      let callCount = 0;
      performance.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 0;
        return 120;
      });

      uiController.updateView({ test: 'data' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Slow UI update'));

      // Restore
      performance.now = originalNow;
      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UIController initialized
       Action: call render with fast performance
       Assertions: no console.warn called when renderTime < 100ms
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should not log warning for fast render', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      uiController.render();

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UIController initialized
       Action: measure actual render time
       Assertions: renderTime accurately reflects elapsed time
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should accurately measure render time', () => {
      const result = uiController.render();

      expect(result.renderTime).toBeGreaterThanOrEqual(0);
      expect(result.renderTime).toBeLessThan(1000); // Should be much faster
      expect(typeof result.renderTime).toBe('number');
      expect(Number.isFinite(result.renderTime)).toBe(true);
    });

    /* Preconditions: UIController initialized, UI rendered
       Action: measure actual update time
       Assertions: updateTime accurately reflects elapsed time
       Requirements: clerkly.nfr.1.2, clerkly.2.1, clerkly.2.8 */
    it('should accurately measure update time', () => {
      uiController.render();

      const result = uiController.updateView({ test: 'data' });

      expect(result.updateTime).toBeGreaterThanOrEqual(0);
      expect(result.updateTime).toBeLessThan(1000);
      expect(typeof result.updateTime).toBe('number');
      expect(Number.isFinite(result.updateTime)).toBe(true);
    });
  });
});
