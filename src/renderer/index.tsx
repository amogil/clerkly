// Requirements: clerkly.1
/**
 * Renderer Process Entry Point
 * Инициализирует React приложение
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Requirements: clerkly.1
/**
 * Инициализирует renderer process с React
 */
async function initializeRenderer(): Promise<void> {
  console.log('Clerkly - Initializing Renderer Process');

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

    console.log('Renderer Process initialized successfully');
  } catch (error: any) {
    console.error('Failed to initialize Renderer Process:', error);
    // Показываем ошибку пользователю
    document.body.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h1>Initialization Error</h1>
        <p>${error.message}</p>
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
