// Requirements: clerkly.1
/**
 * Renderer Process Entry Point
 * Initializes React application
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { Logger } from './Logger';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('Index');

// Requirements: clerkly.1
/**
 * Initializes renderer process with React
 */
async function initializeRenderer(): Promise<void> {
  logger.info('Clerkly - Initializing Renderer Process');

  try {
    // Get root container
    const rootContainer = document.getElementById('root');
    if (!rootContainer) {
      throw new Error('Root container not found');
    }

    // Requirements: clerkly.1
    // Initialize React application
    const root = ReactDOM.createRoot(rootContainer);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    logger.info('Renderer Process initialized successfully');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to initialize Renderer Process: ${errorMessage}`);
    // Show error to user
    document.body.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h1>Initialization Error</h1>
        <p>${errorMessage}</p>
      </div>
    `;
  }
}

// Requirements: clerkly.1
// Initialize renderer process when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer);
} else {
  // DOM is already loaded
  initializeRenderer();
}

export {};
