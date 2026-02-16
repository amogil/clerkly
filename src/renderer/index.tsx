// Requirements: clerkly.1
/**
 * Renderer Process Entry Point
 * Инициализирует React приложение
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
 * Инициализирует renderer process с React
 */
async function initializeRenderer(): Promise<void> {
  logger.info('Clerkly - Initializing Renderer Process');

  try {
    // Получаем root контейнер
    const rootContainer = document.getElementById('root');
    if (!rootContainer) {
      throw new Error('Root container not found');
    }

    // Requirements: clerkly.1
    // Инициализируем React приложение
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
    // Показываем ошибку пользователю
    document.body.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h1>Initialization Error</h1>
        <p>${errorMessage}</p>
      </div>
    `;
  }
}

// Requirements: clerkly.1
// Инициализируем renderer process когда DOM готов
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer);
} else {
  // DOM уже загружен
  initializeRenderer();
}

export {};
