// Requirements: clerkly.1.3

/**
 * UIController class
 * Manages UI rendering and updates in the Renderer Process
 * Ensures responsive UI with performance monitoring
 * 
 * Requirements: clerkly.1.3
 */
class UIController {
  /**
   * Constructor
   * Initializes the UIController with optional container element
   * @param {HTMLElement} container - Optional container element for rendering
   * 
   * Requirements: clerkly.1.3
   */
  constructor(container = null) {
    this.container = container || document.body;
    this.loadingIndicators = new Map();
    this.renderStartTime = null;
    this.performanceThreshold = 100; // ms - UI operations should complete in < 100ms
    this.loadingThreshold = 200; // ms - show loading indicators for operations > 200ms
  }

  /**
   * Render the UI
   * Ensures responsive rendering with performance monitoring (< 100ms)
   * @returns {Object} Result object with success status and render time
   * 
   * Requirements: clerkly.1.3
   */
  render() {
    const startTime = performance.now();
    
    try {
      // Clear existing content
      this.container.innerHTML = '';
      
      // Create main UI structure
      const mainContainer = document.createElement('div');
      mainContainer.className = 'main-container';
      mainContainer.setAttribute('data-testid', 'main-container');
      
      // Create header
      const header = this.createHeader();
      mainContainer.appendChild(header);
      
      // Create content area
      const content = this.createContent();
      mainContainer.appendChild(content);
      
      // Create footer
      const footer = this.createFooter();
      mainContainer.appendChild(footer);
      
      // Append to container
      this.container.appendChild(mainContainer);
      
      const renderTime = performance.now() - startTime;
      
      // Log warning if rendering is slow
      if (renderTime > this.performanceThreshold) {
        console.warn(`Slow UI render: ${renderTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`);
      }
      
      return {
        success: true,
        renderTime: renderTime,
        performanceWarning: renderTime > this.performanceThreshold
      };
    } catch (error) {
      const renderTime = performance.now() - startTime;
      console.error('Failed to render UI:', error);
      return {
        success: false,
        error: error.message,
        renderTime: renderTime
      };
    }
  }

  /**
   * Update view with new data
   * Efficiently updates the UI with new data without full re-render
   * @param {Object} data - Data to update the view with
   * @returns {Object} Result object with success status and update time
   * 
   * Requirements: clerkly.1.3
   */
  updateView(data) {
    const startTime = performance.now();
    
    try {
      // Validate data parameter
      if (data === undefined || data === null) {
        throw new Error('Invalid data: data parameter is required');
      }
      
      // Find content area
      const contentArea = this.container.querySelector('[data-testid="content-area"]');
      if (!contentArea) {
        throw new Error('Content area not found. Call render() first.');
      }
      
      // Update content based on data type
      if (typeof data === 'string') {
        contentArea.textContent = data;
      } else if (typeof data === 'object') {
        // Clear existing content
        contentArea.innerHTML = '';
        
        // Create data display
        const dataDisplay = this.createDataDisplay(data);
        contentArea.appendChild(dataDisplay);
      } else {
        contentArea.textContent = String(data);
      }
      
      const updateTime = performance.now() - startTime;
      
      // Log warning if update is slow
      if (updateTime > this.performanceThreshold) {
        console.warn(`Slow UI update: ${updateTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`);
      }
      
      return {
        success: true,
        updateTime: updateTime,
        performanceWarning: updateTime > this.performanceThreshold
      };
    } catch (error) {
      const updateTime = performance.now() - startTime;
      console.error('Failed to update view:', error);
      return {
        success: false,
        error: error.message,
        updateTime: updateTime
      };
    }
  }

  /**
   * Show loading indicator for long-running operations (> 200ms)
   * @param {string} operationId - Unique identifier for the operation
   * @param {string} message - Optional message to display
   * @returns {Object} Result object with success status
   * 
   * Requirements: clerkly.1.3
   */
  showLoading(operationId, message = 'Loading...') {
    try {
      // Validate operationId
      if (!operationId || typeof operationId !== 'string') {
        throw new Error('Invalid operationId: must be a non-empty string');
      }
      
      // Check if loading indicator already exists
      if (this.loadingIndicators.has(operationId)) {
        return { success: false, error: 'Loading indicator already exists for this operation' };
      }
      
      // Create loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-indicator';
      loadingDiv.setAttribute('data-testid', `loading-${operationId}`);
      loadingDiv.setAttribute('data-operation-id', operationId);
      
      // Create spinner
      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      loadingDiv.appendChild(spinner);
      
      // Create message
      const messageDiv = document.createElement('div');
      messageDiv.className = 'loading-message';
      messageDiv.textContent = message;
      loadingDiv.appendChild(messageDiv);
      
      // Append to container
      this.container.appendChild(loadingDiv);
      
      // Store reference
      this.loadingIndicators.set(operationId, {
        element: loadingDiv,
        startTime: performance.now()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to show loading indicator:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Hide loading indicator
   * @param {string} operationId - Unique identifier for the operation
   * @returns {Object} Result object with success status and operation duration
   * 
   * Requirements: clerkly.1.3
   */
  hideLoading(operationId) {
    try {
      // Validate operationId
      if (!operationId || typeof operationId !== 'string') {
        throw new Error('Invalid operationId: must be a non-empty string');
      }
      
      // Check if loading indicator exists
      if (!this.loadingIndicators.has(operationId)) {
        return { success: false, error: 'Loading indicator not found for this operation' };
      }
      
      // Get loading indicator
      const indicator = this.loadingIndicators.get(operationId);
      const duration = performance.now() - indicator.startTime;
      
      // Remove from DOM
      if (indicator.element && indicator.element.parentNode) {
        indicator.element.parentNode.removeChild(indicator.element);
      }
      
      // Remove from map
      this.loadingIndicators.delete(operationId);
      
      return {
        success: true,
        duration: duration
      };
    } catch (error) {
      console.error('Failed to hide loading indicator:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute operation with automatic loading indicator for operations > 200ms
   * @param {string} operationId - Unique identifier for the operation
   * @param {Function} operation - Async operation to execute
   * @param {string} loadingMessage - Optional loading message
   * @returns {Promise<any>} Result of the operation
   * 
   * Requirements: clerkly.1.3
   */
  async withLoading(operationId, operation, loadingMessage = 'Loading...') {
    // Validate parameters
    if (!operationId || typeof operationId !== 'string') {
      throw new Error('Invalid operationId: must be a non-empty string');
    }
    
    if (typeof operation !== 'function') {
      throw new Error('Invalid operation: must be a function');
    }
    
    const startTime = performance.now();
    let loadingShown = false;
    
    // Set timeout to show loading indicator after 200ms
    const loadingTimeout = setTimeout(() => {
      this.showLoading(operationId, loadingMessage);
      loadingShown = true;
    }, this.loadingThreshold);
    
    try {
      // Execute operation
      const result = await operation();
      
      // Clear timeout
      clearTimeout(loadingTimeout);
      
      // Hide loading indicator if shown
      if (loadingShown) {
        this.hideLoading(operationId);
      }
      
      const duration = performance.now() - startTime;
      
      return result;
    } catch (error) {
      // Clear timeout
      clearTimeout(loadingTimeout);
      
      // Hide loading indicator if shown
      if (loadingShown) {
        this.hideLoading(operationId);
      }
      
      throw error;
    }
  }

  /**
   * Create header element
   * @returns {HTMLElement} Header element
   * 
   * Requirements: clerkly.1.3
   */
  createHeader() {
    const header = document.createElement('header');
    header.className = 'app-header';
    header.setAttribute('data-testid', 'app-header');
    
    const title = document.createElement('h1');
    title.textContent = 'Clerkly';
    header.appendChild(title);
    
    return header;
  }

  /**
   * Create content area element
   * @returns {HTMLElement} Content area element
   * 
   * Requirements: clerkly.1.3
   */
  createContent() {
    const content = document.createElement('main');
    content.className = 'app-content';
    content.setAttribute('data-testid', 'content-area');
    
    const welcomeMessage = document.createElement('p');
    welcomeMessage.textContent = 'Welcome to Clerkly - Your AI Assistant for Managers';
    content.appendChild(welcomeMessage);
    
    return content;
  }

  /**
   * Create footer element
   * @returns {HTMLElement} Footer element
   * 
   * Requirements: clerkly.1.3
   */
  createFooter() {
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.setAttribute('data-testid', 'app-footer');
    
    const version = document.createElement('span');
    version.textContent = 'Version 1.0.0';
    footer.appendChild(version);
    
    return footer;
  }

  /**
   * Create data display element
   * @param {Object} data - Data to display
   * @returns {HTMLElement} Data display element
   * 
   * Requirements: clerkly.1.3
   */
  createDataDisplay(data) {
    const dataDisplay = document.createElement('div');
    dataDisplay.className = 'data-display';
    dataDisplay.setAttribute('data-testid', 'data-display');
    
    // Handle arrays
    if (Array.isArray(data)) {
      const list = document.createElement('ul');
      data.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = typeof item === 'object' ? JSON.stringify(item) : String(item);
        list.appendChild(listItem);
      });
      dataDisplay.appendChild(list);
    } else {
      // Handle objects
      const table = document.createElement('table');
      table.className = 'data-table';
      
      Object.entries(data).forEach(([key, value]) => {
        const row = document.createElement('tr');
        
        const keyCell = document.createElement('td');
        keyCell.className = 'data-key';
        keyCell.textContent = key;
        row.appendChild(keyCell);
        
        const valueCell = document.createElement('td');
        valueCell.className = 'data-value';
        valueCell.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
        row.appendChild(valueCell);
        
        table.appendChild(row);
      });
      
      dataDisplay.appendChild(table);
    }
    
    return dataDisplay;
  }

  /**
   * Get container element
   * @returns {HTMLElement} Container element
   * 
   * Requirements: clerkly.1.3
   */
  getContainer() {
    return this.container;
  }

  /**
   * Set container element
   * @param {HTMLElement} container - New container element
   * 
   * Requirements: clerkly.1.3
   */
  setContainer(container) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('Container must be an HTMLElement');
    }
    this.container = container;
  }

  /**
   * Clear all loading indicators
   * Useful for cleanup
   * 
   * Requirements: clerkly.1.3
   */
  clearAllLoading() {
    this.loadingIndicators.forEach((indicator, operationId) => {
      this.hideLoading(operationId);
    });
  }
}

// Export for use in both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}
