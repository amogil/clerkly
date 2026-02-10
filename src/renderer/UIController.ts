// Requirements: clerkly.1, clerkly.2, clerkly.nfr.1, clerkly.3.8
/**
 * UI Controller - manages user interface rendering and performance monitoring
 */

import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
export interface RenderResult {
  success: boolean;
  renderTime: number;
  performanceWarning?: boolean;
}

export interface UpdateResult {
  success: boolean;
  updateTime: number;
  performanceWarning?: boolean;
}

export interface LoadingResult {
  success: boolean;
  duration?: number;
  error?: string;
}

export class UIController {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('UIController');
  private container: HTMLElement;
  private loadingIndicators: Map<string, { element: HTMLElement; startTime: number }>;
  private performanceThreshold: number = 100; // ms
  private loadingThreshold: number = 200; // ms

  constructor(container: HTMLElement) {
    this.container = container;
    this.loadingIndicators = new Map();
  }

  /**
   * Renders the UI with header, content, and footer
   * Monitors render time and warns if it exceeds performance threshold
   * Requirements: clerkly.1, clerkly.nfr.1   */
  render(): RenderResult {
    const startTime = performance.now();

    try {
      // Clear existing content
      this.container.innerHTML = '';

      // Create main container
      const mainContainer = document.createElement('div');
      mainContainer.setAttribute('data-testid', 'main-container');
      mainContainer.className = 'main-container';

      // Create and append header
      const header = this.createHeader();
      mainContainer.appendChild(header);

      // Create and append content
      const content = this.createContent();
      mainContainer.appendChild(content);

      // Create and append footer
      const footer = this.createFooter();
      mainContainer.appendChild(footer);

      // Append to container
      this.container.appendChild(mainContainer);

      const renderTime = performance.now() - startTime;
      const performanceWarning = renderTime > this.performanceThreshold;

      if (performanceWarning) {
        Logger.warn(
          'UIController',
          `Slow UI render: ${renderTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`
        );
      }

      return { success: true, renderTime, performanceWarning };
    } catch (error: unknown) {
      const renderTime = performance.now() - startTime;
      this.logger.error(`Failed to render UI: ${error}`);
      return {
        success: false,
        renderTime,
        performanceWarning: renderTime > this.performanceThreshold,
      };
    }
  }

  /**
   * Updates the view with new data efficiently without full re-render
   * Monitors update time and warns if it exceeds performance threshold
   * Requirements: clerkly.1, clerkly.nfr.1   */
  updateView(data: unknown): UpdateResult {
    const startTime = performance.now();

    try {
      // Find content area
      const contentArea = this.container.querySelector('[data-testid="content-area"]');
      if (!contentArea) {
        throw new Error('Content area not found');
      }

      // Clear existing data display
      const existingDisplay = contentArea.querySelector('[data-testid="data-display"]');
      if (existingDisplay) {
        existingDisplay.remove();
      }

      // Create and append new data display
      const dataDisplay = this.createDataDisplay(data);
      contentArea.appendChild(dataDisplay);

      const updateTime = performance.now() - startTime;
      const performanceWarning = updateTime > this.performanceThreshold;

      if (performanceWarning) {
        Logger.warn(
          'UIController',
          `Slow UI update: ${updateTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`
        );
      }

      return { success: true, updateTime, performanceWarning };
    } catch (error: unknown) {
      const updateTime = performance.now() - startTime;
      this.logger.error(`Failed to update view: ${error}`);
      return {
        success: false,
        updateTime,
        performanceWarning: updateTime > this.performanceThreshold,
      };
    }
  }

  /**
   * Shows loading indicator for long-running operations
   * Requirements: clerkly.nfr.1   */
  showLoading(operationId: string, message: string): LoadingResult {
    try {
      // Check if loading indicator already exists
      if (this.loadingIndicators.has(operationId)) {
        return {
          success: false,
          error: `Loading indicator for operation "${operationId}" already exists`,
        };
      }

      // Create loading indicator element
      const loadingElement = document.createElement('div');
      loadingElement.setAttribute('data-testid', `loading-${operationId}`);
      loadingElement.className = 'loading-indicator';
      loadingElement.textContent = message;

      // Append to container
      this.container.appendChild(loadingElement);

      // Store reference
      this.loadingIndicators.set(operationId, {
        element: loadingElement,
        startTime: Date.now(),
      });

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to show loading indicator: ${error}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Hides loading indicator and returns duration
   * Requirements: clerkly.nfr.1   */
  hideLoading(operationId: string): LoadingResult {
    try {
      const indicator = this.loadingIndicators.get(operationId);
      if (!indicator) {
        return {
          success: false,
          error: `Loading indicator for operation "${operationId}" not found`,
        };
      }

      // Calculate duration
      const duration = Date.now() - indicator.startTime;

      // Remove element
      indicator.element.remove();

      // Remove from map
      this.loadingIndicators.delete(operationId);

      return { success: true, duration };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to hide loading indicator: ${error}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Executes operation with automatic loading indicator for operations > 200ms
   * Requirements: clerkly.nfr.1   */
  async withLoading<T>(
    operationId: string,
    operation: () => Promise<T>,
    loadingMessage: string
  ): Promise<T> {
    // Set timeout to show loading indicator after threshold
    const loadingTimeout = setTimeout(() => {
      this.showLoading(operationId, loadingMessage);
    }, this.loadingThreshold);

    try {
      const result = await operation();
      clearTimeout(loadingTimeout);
      this.hideLoading(operationId);
      return result;
    } catch (error) {
      clearTimeout(loadingTimeout);
      this.hideLoading(operationId);
      throw error;
    }
  }

  /**
   * Creates header element
   * Requirements: clerkly.1   */
  createHeader(): HTMLElement {
    const header = document.createElement('header');
    header.setAttribute('data-testid', 'header');
    header.className = 'app-header';
    header.textContent = 'Clerkly';
    return header;
  }

  /**
   * Creates content area element
   * Requirements: clerkly.1   */
  createContent(): HTMLElement {
    const content = document.createElement('div');
    content.setAttribute('data-testid', 'content-area');
    content.className = 'content-area';
    return content;
  }

  /**
   * Creates footer element
   * Requirements: clerkly.1   */
  createFooter(): HTMLElement {
    const footer = document.createElement('footer');
    footer.setAttribute('data-testid', 'footer');
    footer.className = 'app-footer';
    footer.textContent = 'v1.0.0';
    return footer;
  }

  /**
   * Creates data display element (table/list)
   * Requirements: clerkly.1   */
  createDataDisplay(data: unknown): HTMLElement {
    const display = document.createElement('div');
    display.setAttribute('data-testid', 'data-display');
    display.className = 'data-display';

    if (data === null || data === undefined) {
      display.textContent = 'No data';
      return display;
    }

    if (typeof data === 'object') {
      // Create a simple key-value display
      const list = document.createElement('ul');
      list.className = 'data-list';

      const entries = Array.isArray(data)
        ? data.map((item, index) => [index.toString(), item])
        : Object.entries(data);

      for (const [key, value] of entries) {
        const item = document.createElement('li');
        item.className = 'data-item';

        const keySpan = document.createElement('span');
        keySpan.className = 'data-key';
        keySpan.textContent = `${key}: `;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'data-value';
        const valueStr =
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        valueSpan.textContent = valueStr;

        item.appendChild(keySpan);
        item.appendChild(valueSpan);
        list.appendChild(item);
      }

      display.appendChild(list);
    } else {
      display.textContent = String(data);
    }

    return display;
  }

  /**
   * Clears all loading indicators
   * Requirements: clerkly.1   */
  clearAllLoading(): void {
    for (const [operationId] of this.loadingIndicators) {
      this.hideLoading(operationId);
    }
  }

  /**
   * Returns current container
   * Requirements: clerkly.1   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Sets new container and clears loading indicators
   * Requirements: clerkly.1   */
  setContainer(container: HTMLElement): void {
    this.clearAllLoading();
    this.container = container;
  }
}
