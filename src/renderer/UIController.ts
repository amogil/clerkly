// Requirements: clerkly.1.3

interface RenderResult {
  success: boolean;
  renderTime: number;
  performanceWarning?: boolean;
  error?: string;
}

interface UpdateResult {
  success: boolean;
  updateTime: number;
  performanceWarning?: boolean;
  error?: string;
}

interface LoadingResult {
  success: boolean;
  duration?: number;
  error?: string;
}

class UIController {
  private container: HTMLElement;
  private loadingIndicators: Map<string, {element: HTMLElement; startTime: number}>;
  private performanceThreshold: number = 100; // ms
  private loadingThreshold: number = 200; // ms

  // Requirements: clerkly.1.3
  constructor(container: HTMLElement | null = null) {
    this.container = container || document.body;
    this.loadingIndicators = new Map();
  }

  // Requirements: clerkly.1.3
  render(): RenderResult {
    const startTime = performance.now();
    
    try {
      this.container.innerHTML = '';
      
      const mainContainer = document.createElement('div');
      mainContainer.className = 'main-container';
      mainContainer.setAttribute('data-testid', 'main-container');
      
      const header = this.createHeader();
      mainContainer.appendChild(header);
      
      const content = this.createContent();
      mainContainer.appendChild(content);
      
      const footer = this.createFooter();
      mainContainer.appendChild(footer);
      
      this.container.appendChild(mainContainer);
      
      const renderTime = performance.now() - startTime;
      
      if (renderTime > this.performanceThreshold) {
        console.warn(`Slow UI render: ${renderTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`);
      }
      
      return {
        success: true,
        renderTime: renderTime,
        performanceWarning: renderTime > this.performanceThreshold
      };
    } catch (error: any) {
      const renderTime = performance.now() - startTime;
      console.error('Failed to render UI:', error);
      return {
        success: false,
        error: error.message,
        renderTime: renderTime
      };
    }
  }

  // Requirements: clerkly.1.3
  updateView(data: any): UpdateResult {
    const startTime = performance.now();
    
    try {
      if (data === undefined || data === null) {
        throw new Error('Invalid data: data parameter is required');
      }
      
      const contentArea = this.container.querySelector('[data-testid="content-area"]');
      if (!contentArea) {
        throw new Error('Content area not found. Call render() first.');
      }
      
      if (typeof data === 'string') {
        contentArea.textContent = data;
      } else if (typeof data === 'object') {
        contentArea.innerHTML = '';
        const dataDisplay = this.createDataDisplay(data);
        contentArea.appendChild(dataDisplay);
      } else {
        contentArea.textContent = String(data);
      }
      
      const updateTime = performance.now() - startTime;
      
      if (updateTime > this.performanceThreshold) {
        console.warn(`Slow UI update: ${updateTime.toFixed(2)}ms (target: <${this.performanceThreshold}ms)`);
      }
      
      return {
        success: true,
        updateTime: updateTime,
        performanceWarning: updateTime > this.performanceThreshold
      };
    } catch (error: any) {
      const updateTime = performance.now() - startTime;
      console.error('Failed to update view:', error);
      return {
        success: false,
        error: error.message,
        updateTime: updateTime
      };
    }
  }

  // Requirements: clerkly.1.3
  showLoading(operationId: string, message: string = 'Loading...'): LoadingResult {
    try {
      if (!operationId || typeof operationId !== 'string') {
        throw new Error('Invalid operationId: must be a non-empty string');
      }
      
      if (this.loadingIndicators.has(operationId)) {
        return { success: false, error: 'Loading indicator already exists for this operation' };
      }
      
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-indicator';
      loadingDiv.setAttribute('data-testid', `loading-${operationId}`);
      loadingDiv.setAttribute('data-operation-id', operationId);
      
      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      loadingDiv.appendChild(spinner);
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'loading-message';
      messageDiv.textContent = message;
      loadingDiv.appendChild(messageDiv);
      
      this.container.appendChild(loadingDiv);
      
      this.loadingIndicators.set(operationId, {
        element: loadingDiv,
        startTime: performance.now()
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to show loading indicator:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.3
  hideLoading(operationId: string): LoadingResult {
    try {
      if (!operationId || typeof operationId !== 'string') {
        throw new Error('Invalid operationId: must be a non-empty string');
      }
      
      if (!this.loadingIndicators.has(operationId)) {
        return { success: false, error: 'Loading indicator not found for this operation' };
      }
      
      const indicator = this.loadingIndicators.get(operationId)!;
      const duration = performance.now() - indicator.startTime;
      
      if (indicator.element && indicator.element.parentNode) {
        indicator.element.parentNode.removeChild(indicator.element);
      }
      
      this.loadingIndicators.delete(operationId);
      
      return {
        success: true,
        duration: duration
      };
    } catch (error: any) {
      console.error('Failed to hide loading indicator:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.3
  async withLoading(operationId: string, operation: () => Promise<any>, loadingMessage: string = 'Loading...'): Promise<any> {
    if (!operationId || typeof operationId !== 'string') {
      throw new Error('Invalid operationId: must be a non-empty string');
    }
    
    if (typeof operation !== 'function') {
      throw new Error('Invalid operation: must be a function');
    }
    
    let loadingShown = false;
    
    const loadingTimeout = setTimeout(() => {
      this.showLoading(operationId, loadingMessage);
      loadingShown = true;
    }, this.loadingThreshold);
    
    try {
      const result = await operation();
      clearTimeout(loadingTimeout);
      
      if (loadingShown) {
        this.hideLoading(operationId);
      }
      
      return result;
    } catch (error) {
      clearTimeout(loadingTimeout);
      
      if (loadingShown) {
        this.hideLoading(operationId);
      }
      
      throw error;
    }
  }

  // Requirements: clerkly.1.3
  createHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'app-header';
    header.setAttribute('data-testid', 'app-header');
    
    const title = document.createElement('h1');
    title.textContent = 'Clerkly';
    header.appendChild(title);
    
    return header;
  }

  // Requirements: clerkly.1.3
  createContent(): HTMLElement {
    const content = document.createElement('main');
    content.className = 'app-content';
    content.setAttribute('data-testid', 'content-area');
    
    const welcomeMessage = document.createElement('p');
    welcomeMessage.textContent = 'Welcome to Clerkly - Your AI Assistant for Managers';
    content.appendChild(welcomeMessage);
    
    return content;
  }

  // Requirements: clerkly.1.3
  createFooter(): HTMLElement {
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.setAttribute('data-testid', 'app-footer');
    
    const version = document.createElement('span');
    version.textContent = 'Version 1.0.0';
    footer.appendChild(version);
    
    return footer;
  }

  // Requirements: clerkly.1.3
  createDataDisplay(data: any): HTMLElement {
    const dataDisplay = document.createElement('div');
    dataDisplay.className = 'data-display';
    dataDisplay.setAttribute('data-testid', 'data-display');
    
    if (Array.isArray(data)) {
      const list = document.createElement('ul');
      data.forEach((item) => {
        const listItem = document.createElement('li');
        listItem.textContent = typeof item === 'object' ? JSON.stringify(item) : String(item);
        list.appendChild(listItem);
      });
      dataDisplay.appendChild(list);
    } else {
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

  // Requirements: clerkly.1.3
  getContainer(): HTMLElement {
    return this.container;
  }

  // Requirements: clerkly.1.3
  setContainer(container: HTMLElement): void {
    if (!(container instanceof HTMLElement)) {
      throw new Error('Container must be an HTMLElement');
    }
    this.container = container;
  }

  // Requirements: clerkly.1.3
  clearAllLoading(): void {
    this.loadingIndicators.forEach((_indicator, operationId) => {
      this.hideLoading(operationId);
    });
  }
}

export default UIController;
