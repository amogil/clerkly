// Requirements: clerkly.1.3, clerkly.1.4

/**
 * Renderer Process Entry Point
 * Инициализирует UIController и StateController
 * Настраивает обработчики событий UI
 * Предоставляет демонстрационный функционал для работы с данными через IPC
 */

import { UIController } from './UIController';
import { StateController } from './StateController';

/**
 * Инициализирует renderer process
 * Создает UIController и StateController
 * Настраивает обработчики событий UI
 * Добавляет демонстрационный функционал
 * Requirements: clerkly.1.3, clerkly.1.4
 */
async function initializeRenderer(): Promise<void> {
  console.log('Clerkly - Initializing Renderer Process');

  try {
    // Получаем root контейнер
    const rootContainer = document.getElementById('root');
    if (!rootContainer) {
      throw new Error('Root container not found');
    }

    // Requirements: clerkly.1.3
    // Инициализируем UIController
    const uiController = new UIController(rootContainer);

    // Requirements: clerkly.1.3
    // Инициализируем StateController с начальным состоянием
    const stateController = new StateController({
      appName: 'Clerkly',
      version: '1.0.0',
      initialized: true,
    });

    // Отрисовываем начальный UI
    const renderResult = uiController.render();
    if (!renderResult.success) {
      throw new Error('Failed to render initial UI');
    }

    console.log(`UI rendered in ${renderResult.renderTime.toFixed(2)}ms`);

    // Requirements: clerkly.1.3, clerkly.1.4
    // Настраиваем демонстрационный функционал
    setupDemoFunctionality(uiController, stateController);

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

/**
 * Настраивает демонстрационный функционал для работы с данными
 * Добавляет UI элементы и обработчики событий для сохранения/загрузки данных через IPC
 * Requirements: clerkly.1.3, clerkly.1.4
 */
function setupDemoFunctionality(
  uiController: UIController,
  stateController: StateController
): void {
  // Находим content area
  const contentArea = document.querySelector('[data-testid="content-area"]');
  if (!contentArea) {
    console.error('Content area not found');
    return;
  }

  // Requirements: clerkly.1.4
  // Создаем демонстрационную форму для работы с данными
  const demoForm = createDemoForm();
  contentArea.appendChild(demoForm);

  // Настраиваем обработчики событий
  setupEventHandlers(uiController, stateController, demoForm);
}

/**
 * Создает демонстрационную форму для работы с данными
 * Requirements: clerkly.1.3, clerkly.1.4
 */
function createDemoForm(): HTMLElement {
  const form = document.createElement('div');
  form.setAttribute('data-testid', 'demo-form');
  form.className = 'demo-form';
  form.style.cssText = 'padding: 20px; max-width: 600px; margin: 20px auto;';

  form.innerHTML = `
    <h2 style="margin-bottom: 20px;">Data Storage Demo</h2>
    
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">
        Key:
      </label>
      <input 
        type="text" 
        id="data-key" 
        data-testid="data-key-input"
        placeholder="Enter data key"
        style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
      />
    </div>
    
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">
        Value:
      </label>
      <textarea 
        id="data-value" 
        data-testid="data-value-input"
        placeholder="Enter data value (JSON supported)"
        rows="4"
        style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;"
      ></textarea>
    </div>
    
    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
      <button 
        id="save-btn" 
        data-testid="save-button"
        style="flex: 1; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        Save Data
      </button>
      <button 
        id="load-btn" 
        data-testid="load-button"
        style="flex: 1; padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        Load Data
      </button>
      <button 
        id="delete-btn" 
        data-testid="delete-button"
        style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        Delete Data
      </button>
    </div>
    
    <div 
      id="result-area" 
      data-testid="result-area"
      style="padding: 15px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; min-height: 100px; font-family: monospace; white-space: pre-wrap;"
    >
      Ready to save/load data...
    </div>
  `;

  return form;
}

/**
 * Настраивает обработчики событий для демонстрационной формы
 * Requirements: clerkly.1.3, clerkly.1.4
 */
function setupEventHandlers(
  uiController: UIController,
  stateController: StateController,
  form: HTMLElement
): void {
  const keyInput = form.querySelector('#data-key') as HTMLInputElement;
  const valueInput = form.querySelector('#data-value') as HTMLTextAreaElement;
  const saveBtn = form.querySelector('#save-btn') as HTMLButtonElement;
  const loadBtn = form.querySelector('#load-btn') as HTMLButtonElement;
  const deleteBtn = form.querySelector('#delete-btn') as HTMLButtonElement;
  const resultArea = form.querySelector('#result-area') as HTMLDivElement;

  if (!keyInput || !valueInput || !saveBtn || !loadBtn || !deleteBtn || !resultArea) {
    console.error('Demo form elements not found');
    return;
  }

  // Requirements: clerkly.1.4
  // Обработчик сохранения данных
  saveBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    const valueStr = valueInput.value.trim();

    if (!key) {
      showResult(resultArea, 'Error: Key is required', 'error');
      return;
    }

    if (!valueStr) {
      showResult(resultArea, 'Error: Value is required', 'error');
      return;
    }

    try {
      // Пытаемся распарсить значение как JSON
      let value: any;
      try {
        value = JSON.parse(valueStr);
      } catch {
        // Если не JSON, используем как строку
        value = valueStr;
      }

      // Сохраняем через IPC с индикатором загрузки
      const result = await uiController.withLoading(
        'save-operation',
        async () => await window.api.saveData(key, value),
        'Saving data...'
      );

      if (result.success) {
        // Обновляем состояние
        stateController.setStateProperty('lastSavedKey', key);
        stateController.setStateProperty('lastSavedValue', value);
        stateController.setStateProperty('lastOperation', 'save');
        stateController.setStateProperty('lastOperationTime', new Date().toISOString());

        showResult(
          resultArea,
          `✓ Data saved successfully!\nKey: ${key}\nValue: ${JSON.stringify(value, null, 2)}`,
          'success'
        );
      } else {
        showResult(resultArea, `✗ Failed to save data:\n${result.error}`, 'error');
      }
    } catch (error: any) {
      showResult(resultArea, `✗ Error saving data:\n${error.message}`, 'error');
    }
  });

  // Requirements: clerkly.1.4
  // Обработчик загрузки данных
  loadBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();

    if (!key) {
      showResult(resultArea, 'Error: Key is required', 'error');
      return;
    }

    try {
      // Загружаем через IPC с индикатором загрузки
      const result = await uiController.withLoading(
        'load-operation',
        async () => await window.api.loadData(key),
        'Loading data...'
      );

      if (result.success) {
        // Обновляем состояние
        stateController.setStateProperty('lastLoadedKey', key);
        stateController.setStateProperty('lastLoadedValue', result.data);
        stateController.setStateProperty('lastOperation', 'load');
        stateController.setStateProperty('lastOperationTime', new Date().toISOString());

        // Отображаем загруженные данные
        const dataStr =
          typeof result.data === 'object'
            ? JSON.stringify(result.data, null, 2)
            : String(result.data);

        showResult(
          resultArea,
          `✓ Data loaded successfully!\nKey: ${key}\nValue: ${dataStr}`,
          'success'
        );

        // Заполняем поле значения загруженными данными
        valueInput.value =
          typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : result.data;
      } else {
        showResult(resultArea, `✗ Failed to load data:\n${result.error}`, 'error');
      }
    } catch (error: any) {
      showResult(resultArea, `✗ Error loading data:\n${error.message}`, 'error');
    }
  });

  // Requirements: clerkly.1.4
  // Обработчик удаления данных
  deleteBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();

    if (!key) {
      showResult(resultArea, 'Error: Key is required', 'error');
      return;
    }

    try {
      // Удаляем через IPC с индикатором загрузки
      const result = await uiController.withLoading(
        'delete-operation',
        async () => await window.api.deleteData(key),
        'Deleting data...'
      );

      if (result.success) {
        // Обновляем состояние
        stateController.setStateProperty('lastDeletedKey', key);
        stateController.setStateProperty('lastOperation', 'delete');
        stateController.setStateProperty('lastOperationTime', new Date().toISOString());

        showResult(resultArea, `✓ Data deleted successfully!\nKey: ${key}`, 'success');

        // Очищаем поле значения
        valueInput.value = '';
      } else {
        showResult(resultArea, `✗ Failed to delete data:\n${result.error}`, 'error');
      }
    } catch (error: any) {
      showResult(resultArea, `✗ Error deleting data:\n${error.message}`, 'error');
    }
  });
}

/**
 * Отображает результат операции в result area
 * Requirements: clerkly.1.3
 */
function showResult(element: HTMLElement, message: string, type: 'success' | 'error'): void {
  element.textContent = message;
  element.style.background = type === 'success' ? '#d4edda' : '#f8d7da';
  element.style.color = type === 'success' ? '#155724' : '#721c24';
  element.style.borderColor = type === 'success' ? '#c3e6cb' : '#f5c6cb';
}

// Requirements: clerkly.1.3, clerkly.1.4
// Инициализируем renderer process когда DOM готов
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer);
} else {
  // DOM уже загружен
  initializeRenderer();
}

export {};
