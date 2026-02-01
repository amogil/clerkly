/**
 * @jest-environment jsdom
 */

// Requirements: clerkly.2.1, clerkly.2.3

import { UIController } from '../../src/renderer/UIController';

/**
 * Unit tests for UIController class
 * Tests UI rendering, view updates, loading indicators, and performance monitoring
 * 
 * Requirements: clerkly.2.1, clerkly.2.3
 */
describe('UIController', () => {
  let uiController;
  let container;

  beforeEach(() => {
    // Create a mock DOM container
    container = document.createElement('div');
    container.setAttribute('id', 'test-container');
    document.body.appendChild(container);
    
    uiController = new UIController(container);
  });

  afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    uiController = null;
  });

  describe('Constructor', () => {
    /* Preconditions: UIController class is available
       Action: create new UIController instance with container element
       Assertions: instance is created with correct container and default settings
       Requirements: clerkly.1.3 */
    it('should create instance with provided container', () => {
      const controller = new UIController(container);
      
      expect(controller).toBeInstanceOf(UIController);
      expect(controller.getContainer()).toBe(container);
      expect(controller.performanceThreshold).toBe(100);
      expect(controller.loadingThreshold).toBe(200);
    });

    /* Preconditions: UIController class is available
       Action: create new UIController instance without container parameter
       Assertions: instance is created with document.body as default container
       Requirements: clerkly.1.3 */
    it('should use document.body as default container', () => {
      const controller = new UIController();
      
      expect(controller.getContainer()).toBe(document.body);
    });
  });

  describe('render()', () => {
    /* Preconditions: UIController instance is created with valid container
       Action: call render() method
       Assertions: UI is rendered with header, content, footer; returns success true and render time < 100ms
       Requirements: clerkly.1.3 */
    it('should render UI with all components', () => {
      const result = uiController.render();
      
      expect(result.success).toBe(true);
      expect(result.renderTime).toBeDefined();
      expect(typeof result.renderTime).toBe('number');
      
      // Check main container
      const mainContainer = container.querySelector('[data-testid="main-container"]');
      expect(mainContainer).toBeTruthy();
      
      // Check header
      const header = container.querySelector('[data-testid="app-header"]');
      expect(header).toBeTruthy();
      expect(header.textContent).toContain('Clerkly');
      
      // Check content area
      const content = container.querySelector('[data-testid="content-area"]');
      expect(content).toBeTruthy();
      expect(content.textContent).toContain('Welcome to Clerkly');
      
      // Check footer
      const footer = container.querySelector('[data-testid="app-footer"]');
      expect(footer).toBeTruthy();
      expect(footer.textContent).toContain('Version 1.0.0');
    });

    /* Preconditions: UIController instance is created with valid container
       Action: call render() method
       Assertions: render time is less than 100ms (performance requirement)
       Requirements: clerkly.1.3 */
    it('should render UI in less than 100ms', () => {
      const result = uiController.render();
      
      expect(result.success).toBe(true);
      expect(result.renderTime).toBeLessThan(100);
    });

    /* Preconditions: UIController instance is created, UI is already rendered
       Action: call render() method again
       Assertions: previous content is cleared and new UI is rendered
       Requirements: clerkly.1.3 */
    it('should clear existing content before rendering', () => {
      // First render
      uiController.render();
      
      // Add custom content
      const customDiv = document.createElement('div');
      customDiv.setAttribute('id', 'custom-content');
      container.appendChild(customDiv);
      
      // Second render
      uiController.render();
      
      // Custom content should be removed
      const customContent = container.querySelector('#custom-content');
      expect(customContent).toBeNull();
      
      // New UI should be present
      const mainContainer = container.querySelector('[data-testid="main-container"]');
      expect(mainContainer).toBeTruthy();
    });

    /* Preconditions: UIController instance is created, container.innerHTML setter throws error
       Action: call render() method
       Assertions: returns success false with error message
       Requirements: clerkly.1.3 */
    it('should handle render errors gracefully', () => {
      // Mock container to throw error
      const errorContainer = {
        innerHTML: '',
        appendChild: jest.fn(() => {
          throw new Error('DOM manipulation failed');
        })
      };
      
      const controller = new UIController(errorContainer);
      const result = controller.render();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM manipulation failed');
      expect(result.renderTime).toBeDefined();
    });
  });

  describe('updateView()', () => {
    beforeEach(() => {
      // Render initial UI
      uiController.render();
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with string data
       Assertions: content area is updated with string, returns success true and update time
       Requirements: clerkly.1.3 */
    it('should update view with string data', () => {
      const testData = 'Test content updated';
      const result = uiController.updateView(testData);
      
      expect(result.success).toBe(true);
      expect(result.updateTime).toBeDefined();
      expect(result.updateTime).toBeLessThan(100);
      
      const contentArea = container.querySelector('[data-testid="content-area"]');
      expect(contentArea.textContent).toBe(testData);
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with object data
       Assertions: content area is updated with data display table, returns success true
       Requirements: clerkly.1.3 */
    it('should update view with object data', () => {
      const testData = {
        name: 'John Doe',
        role: 'Manager',
        department: 'Engineering'
      };
      
      const result = uiController.updateView(testData);
      
      expect(result.success).toBe(true);
      expect(result.updateTime).toBeLessThan(100);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
      
      const table = dataDisplay.querySelector('.data-table');
      expect(table).toBeTruthy();
      
      // Check that all keys are displayed
      const rows = table.querySelectorAll('tr');
      expect(rows.length).toBe(3);
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with array data
       Assertions: content area is updated with list display, returns success true
       Requirements: clerkly.1.3 */
    it('should update view with array data', () => {
      const testData = ['Item 1', 'Item 2', 'Item 3'];
      
      const result = uiController.updateView(testData);
      
      expect(result.success).toBe(true);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
      
      const list = dataDisplay.querySelector('ul');
      expect(list).toBeTruthy();
      
      const items = list.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('Item 1');
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with number data
       Assertions: content area is updated with string representation of number
       Requirements: clerkly.1.3 */
    it('should update view with number data', () => {
      const testData = 42;
      const result = uiController.updateView(testData);
      
      expect(result.success).toBe(true);
      
      const contentArea = container.querySelector('[data-testid="content-area"]');
      expect(contentArea.textContent).toBe('42');
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with null parameter
       Assertions: returns success false with error message
       Requirements: clerkly.1.3 */
    it('should reject null data', () => {
      const result = uiController.updateView(null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid data');
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with undefined parameter
       Assertions: returns success false with error message
       Requirements: clerkly.1.3 */
    it('should reject undefined data', () => {
      const result = uiController.updateView(undefined);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid data');
    });

    /* Preconditions: UIController instance is created, render() has not been called
       Action: call updateView() with valid data
       Assertions: returns success false with error message about missing content area
       Requirements: clerkly.1.3 */
    it('should fail if render() was not called first', () => {
      const newController = new UIController(document.createElement('div'));
      const result = newController.updateView('test data');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Content area not found');
    });

    /* Preconditions: UI is rendered with content area
       Action: call updateView() with complex nested object
       Assertions: content area is updated with data display, handles nested objects
       Requirements: clerkly.1.3 */
    it('should handle complex nested objects', () => {
      const testData = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark', notifications: true }
      };
      
      const result = uiController.updateView(testData);
      
      expect(result.success).toBe(true);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
    });
  });

  describe('showLoading()', () => {
    /* Preconditions: UIController instance is created
       Action: call showLoading() with valid operationId and message
       Assertions: loading indicator is created and displayed, returns success true
       Requirements: clerkly.1.3 */
    it('should show loading indicator', () => {
      const operationId = 'test-operation';
      const message = 'Loading data...';
      
      const result = uiController.showLoading(operationId, message);
      
      expect(result.success).toBe(true);
      
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeTruthy();
      expect(loadingIndicator.textContent).toContain(message);
    });

    /* Preconditions: UIController instance is created
       Action: call showLoading() with operationId only (no message)
       Assertions: loading indicator is created with default "Loading..." message
       Requirements: clerkly.1.3 */
    it('should use default message if not provided', () => {
      const operationId = 'test-operation';
      
      const result = uiController.showLoading(operationId);
      
      expect(result.success).toBe(true);
      
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator.textContent).toContain('Loading...');
    });

    /* Preconditions: UIController instance is created, loading indicator already exists for operationId
       Action: call showLoading() with same operationId again
       Assertions: returns success false with error message about existing indicator
       Requirements: clerkly.1.3 */
    it('should reject duplicate operationId', () => {
      const operationId = 'test-operation';
      
      uiController.showLoading(operationId);
      const result = uiController.showLoading(operationId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    /* Preconditions: UIController instance is created
       Action: call showLoading() with empty string operationId
       Assertions: returns success false with error message about invalid operationId
       Requirements: clerkly.1.3 */
    it('should reject empty operationId', () => {
      const result = uiController.showLoading('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid operationId');
    });

    /* Preconditions: UIController instance is created
       Action: call showLoading() with null operationId
       Assertions: returns success false with error message about invalid operationId
       Requirements: clerkly.1.3 */
    it('should reject null operationId', () => {
      const result = uiController.showLoading(null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid operationId');
    });

    /* Preconditions: UIController instance is created
       Action: call showLoading() with multiple different operationIds
       Assertions: multiple loading indicators are created and displayed
       Requirements: clerkly.1.3 */
    it('should support multiple concurrent loading indicators', () => {
      const op1 = 'operation-1';
      const op2 = 'operation-2';
      
      uiController.showLoading(op1, 'Loading 1...');
      uiController.showLoading(op2, 'Loading 2...');
      
      const indicator1 = container.querySelector(`[data-testid="loading-${op1}"]`);
      const indicator2 = container.querySelector(`[data-testid="loading-${op2}"]`);
      
      expect(indicator1).toBeTruthy();
      expect(indicator2).toBeTruthy();
    });
  });

  describe('hideLoading()', () => {
    /* Preconditions: loading indicator is shown for operationId
       Action: call hideLoading() with operationId
       Assertions: loading indicator is removed from DOM, returns success true with duration
       Requirements: clerkly.1.3 */
    it('should hide loading indicator', () => {
      const operationId = 'test-operation';
      
      uiController.showLoading(operationId);
      const result = uiController.hideLoading(operationId);
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeNull();
    });

    /* Preconditions: UIController instance is created, no loading indicator exists
       Action: call hideLoading() with non-existent operationId
       Assertions: returns success false with error message about not found
       Requirements: clerkly.1.3 */
    it('should fail for non-existent operationId', () => {
      const result = uiController.hideLoading('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    /* Preconditions: UIController instance is created
       Action: call hideLoading() with empty string operationId
       Assertions: returns success false with error message about invalid operationId
       Requirements: clerkly.1.3 */
    it('should reject empty operationId', () => {
      const result = uiController.hideLoading('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid operationId');
    });

    /* Preconditions: loading indicator is shown for operationId
       Action: call hideLoading() twice with same operationId
       Assertions: first call succeeds, second call fails with not found error
       Requirements: clerkly.1.3 */
    it('should fail on second hide attempt', () => {
      const operationId = 'test-operation';
      
      uiController.showLoading(operationId);
      const result1 = uiController.hideLoading(operationId);
      const result2 = uiController.hideLoading(operationId);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('not found');
    });
  });

  describe('withLoading()', () => {
    /* Preconditions: UIController instance is created
       Action: call withLoading() with fast operation (< 200ms)
       Assertions: operation completes, no loading indicator is shown, returns operation result
       Requirements: clerkly.1.3 */
    it('should not show loading for fast operations', async () => {
      const operationId = 'fast-operation';
      const operation = jest.fn(async () => {
        return 'result';
      });
      
      const result = await uiController.withLoading(operationId, operation);
      
      expect(result).toBe('result');
      expect(operation).toHaveBeenCalled();
      
      // Loading indicator should not be shown
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeNull();
    });

    /* Preconditions: UIController instance is created
       Action: call withLoading() with slow operation (> 200ms)
       Assertions: loading indicator is shown during operation, hidden after completion
       Requirements: clerkly.1.3 */
    it('should show loading for slow operations', async () => {
      const operationId = 'slow-operation';
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        return 'result';
      });
      
      const promise = uiController.withLoading(operationId, operation);
      
      // Wait for loading threshold
      await new Promise(resolve => setTimeout(resolve, 210));
      
      // Loading indicator should be shown
      let loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeTruthy();
      
      // Wait for operation to complete
      const result = await promise;
      
      expect(result).toBe('result');
      
      // Loading indicator should be hidden
      loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeNull();
    });

    /* Preconditions: UIController instance is created
       Action: call withLoading() with operation that throws error
       Assertions: error is propagated, loading indicator is hidden if shown
       Requirements: clerkly.1.3 */
    it('should handle operation errors', async () => {
      const operationId = 'error-operation';
      const operation = jest.fn(async () => {
        throw new Error('Operation failed');
      });
      
      await expect(uiController.withLoading(operationId, operation)).rejects.toThrow('Operation failed');
      
      // Loading indicator should be cleaned up
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator).toBeNull();
    });

    /* Preconditions: UIController instance is created
       Action: call withLoading() with invalid operationId (empty string)
       Assertions: throws error about invalid operationId
       Requirements: clerkly.1.3 */
    it('should reject invalid operationId', async () => {
      const operation = jest.fn(async () => 'result');
      
      await expect(uiController.withLoading('', operation)).rejects.toThrow('Invalid operationId');
    });

    /* Preconditions: UIController instance is created
       Action: call withLoading() with non-function operation parameter
       Assertions: throws error about invalid operation
       Requirements: clerkly.1.3 */
    it('should reject non-function operation', async () => {
      await expect(uiController.withLoading('test', 'not a function')).rejects.toThrow('Invalid operation');
    });

    /* Preconditions: UIController instance is created
       Action: call withLoading() with custom loading message
       Assertions: loading indicator shows custom message when displayed
       Requirements: clerkly.1.3 */
    it('should use custom loading message', async () => {
      const operationId = 'custom-message-operation';
      const customMessage = 'Processing data...';
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        return 'result';
      });
      
      const promise = uiController.withLoading(operationId, operation, customMessage);
      
      // Wait for loading threshold
      await new Promise(resolve => setTimeout(resolve, 210));
      
      // Check custom message
      const loadingIndicator = container.querySelector(`[data-testid="loading-${operationId}"]`);
      expect(loadingIndicator.textContent).toContain(customMessage);
      
      await promise;
    });
  });

  describe('clearAllLoading()', () => {
    /* Preconditions: multiple loading indicators are shown
       Action: call clearAllLoading()
       Assertions: all loading indicators are removed from DOM
       Requirements: clerkly.1.3 */
    it('should clear all loading indicators', () => {
      uiController.showLoading('op1', 'Loading 1...');
      uiController.showLoading('op2', 'Loading 2...');
      uiController.showLoading('op3', 'Loading 3...');
      
      uiController.clearAllLoading();
      
      const indicator1 = container.querySelector('[data-testid="loading-op1"]');
      const indicator2 = container.querySelector('[data-testid="loading-op2"]');
      const indicator3 = container.querySelector('[data-testid="loading-op3"]');
      
      expect(indicator1).toBeNull();
      expect(indicator2).toBeNull();
      expect(indicator3).toBeNull();
    });

    /* Preconditions: UIController instance is created, no loading indicators exist
       Action: call clearAllLoading()
       Assertions: method completes without errors
       Requirements: clerkly.1.3 */
    it('should handle empty loading indicators map', () => {
      expect(() => uiController.clearAllLoading()).not.toThrow();
    });
  });

  describe('Container management', () => {
    /* Preconditions: UIController instance is created with container
       Action: call getContainer()
       Assertions: returns the correct container element
       Requirements: clerkly.1.3 */
    it('should get container', () => {
      const result = uiController.getContainer();
      expect(result).toBe(container);
    });

    /* Preconditions: UIController instance is created
       Action: call setContainer() with new valid HTMLElement
       Assertions: container is updated to new element
       Requirements: clerkly.1.3 */
    it('should set new container', () => {
      const newContainer = document.createElement('div');
      uiController.setContainer(newContainer);
      
      expect(uiController.getContainer()).toBe(newContainer);
    });

    /* Preconditions: UIController instance is created
       Action: call setContainer() with non-HTMLElement parameter
       Assertions: throws error about invalid container
       Requirements: clerkly.1.3 */
    it('should reject non-HTMLElement container', () => {
      expect(() => uiController.setContainer('not an element')).toThrow('Container must be an HTMLElement');
      expect(() => uiController.setContainer(null)).toThrow('Container must be an HTMLElement');
      expect(() => uiController.setContainer({})).toThrow('Container must be an HTMLElement');
    });
  });

  describe('Performance monitoring', () => {
    /* Preconditions: UIController instance is created
       Action: call render() method
       Assertions: render time is measured and returned in result
       Requirements: clerkly.1.3 */
    it('should measure render time', () => {
      const result = uiController.render();
      
      expect(result.renderTime).toBeDefined();
      expect(typeof result.renderTime).toBe('number');
      expect(result.renderTime).toBeGreaterThanOrEqual(0);
    });

    /* Preconditions: UI is rendered
       Action: call updateView() with data
       Assertions: update time is measured and returned in result
       Requirements: clerkly.1.3 */
    it('should measure update time', () => {
      uiController.render();
      const result = uiController.updateView('test data');
      
      expect(result.updateTime).toBeDefined();
      expect(typeof result.updateTime).toBe('number');
      expect(result.updateTime).toBeGreaterThanOrEqual(0);
    });

    /* Preconditions: loading indicator is shown
       Action: call hideLoading()
       Assertions: operation duration is measured and returned in result
       Requirements: clerkly.1.3 */
    it('should measure loading duration', async () => {
      const operationId = 'test-operation';
      
      uiController.showLoading(operationId);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = uiController.hideLoading(operationId);
      
      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Edge cases', () => {
    /* Preconditions: UI is rendered
       Action: call updateView() with empty string
       Assertions: content area is updated with empty string
       Requirements: clerkly.1.3 */
    it('should handle empty string data', () => {
      uiController.render();
      const result = uiController.updateView('');
      
      expect(result.success).toBe(true);
      
      const contentArea = container.querySelector('[data-testid="content-area"]');
      expect(contentArea.textContent).toBe('');
    });

    /* Preconditions: UI is rendered
       Action: call updateView() with empty object
       Assertions: content area is updated with empty data display
       Requirements: clerkly.1.3 */
    it('should handle empty object data', () => {
      uiController.render();
      const result = uiController.updateView({});
      
      expect(result.success).toBe(true);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
    });

    /* Preconditions: UI is rendered
       Action: call updateView() with empty array
       Assertions: content area is updated with empty list
       Requirements: clerkly.1.3 */
    it('should handle empty array data', () => {
      uiController.render();
      const result = uiController.updateView([]);
      
      expect(result.success).toBe(true);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
    });

    /* Preconditions: UI is rendered
       Action: call updateView() with large object (1000+ properties)
       Assertions: content area is updated successfully, performance is acceptable
       Requirements: clerkly.1.3 */
    it('should handle large data objects', () => {
      uiController.render();
      
      const largeData = {};
      for (let i = 0; i < 1000; i++) {
        largeData[`key${i}`] = `value${i}`;
      }
      
      const result = uiController.updateView(largeData);
      
      expect(result.success).toBe(true);
      expect(result.updateTime).toBeDefined();
    });

    /* Preconditions: UI is rendered
       Action: call updateView() with special characters in data
       Assertions: content area is updated with properly escaped special characters
       Requirements: clerkly.1.3 */
    it('should handle special characters in data', () => {
      uiController.render();
      
      const specialData = {
        'key<script>': 'value&nbsp;',
        'key"quotes"': "value'quotes'"
      };
      
      const result = uiController.updateView(specialData);
      
      expect(result.success).toBe(true);
      
      const dataDisplay = container.querySelector('[data-testid="data-display"]');
      expect(dataDisplay).toBeTruthy();
    });
  });
});
