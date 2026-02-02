# Документ Дизайна: UI Приложения

## Обзор

Данный документ описывает архитектуру и дизайн пользовательского интерфейса приложения Clerkly, включая управление главным окном, его конфигурацию при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

### Цели Дизайна

- Обеспечить нативный macOS опыт использования приложения
- Максимизировать использование экранного пространства при запуске
- Сохранять предпочтения пользователя по размеру и позиции окна
- Адаптироваться к различным размерам экранов
- Поддерживать минималистичный интерфейс без лишних элементов

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **BrowserWindow API**: Electron API для управления окнами
- **screen API**: Electron API для получения информации об экранах
- **SQLite**: База данных для хранения состояния окна (через существующий DataManager)

## Архитектура

### Компоненты Системы

Система управления UI состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────┐         ┌─────────────────────┐       │
│  │  WindowManager   │────────▶│  WindowStateManager │       │
│  │                  │         │                     │       │
│  │  - createWindow()│         │  - saveState()      │       │
│  │  - configure()   │         │  - loadState()      │       │
│  │  - getWindow()   │         │  - getDefaultState()│       │
│  └──────────────────┘         └─────────────────────┘       │
│           │                              │                   │
│           │                              │                   │
│           ▼                              ▼                   │
│  ┌──────────────────┐         ┌─────────────────────┐       │
│  │  BrowserWindow   │         │    DataManager      │       │
│  │   (Electron)     │         │     (SQLite)        │       │
│  └──────────────────┘         └─────────────────────┘       │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐
   │  Renderer HTML  │
   └─────────────────┘
```

### Поток Данных

1. **Запуск приложения**:
   - `WindowManager` запрашивает сохраненное состояние у `WindowStateManager`
   - `WindowStateManager` загружает состояние из базы данных через `DataManager`
   - Если состояние отсутствует, используются значения по умолчанию
   - `WindowManager` создает `BrowserWindow` с полученной конфигурацией

2. **Изменение состояния окна**:
   - Пользователь изменяет размер, позицию или состояние окна
   - `BrowserWindow` генерирует события (resize, move, maximize, unmaximize)
   - `WindowStateManager` слушает эти события и сохраняет новое состояние
   - Состояние записывается в базу данных через `DataManager`

3. **Закрытие приложения**:
   - Финальное состояние окна сохраняется перед закрытием
   - При следующем запуске состояние будет восстановлено

## Компоненты и Интерфейсы

### WindowManager (Существующий, Расширенный)

Класс `WindowManager` управляет жизненным циклом главного окна приложения.

**Расширения для новых требований:**

```typescript
// Requirements: ui.1, ui.2, ui.3, ui.4, ui.5
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private windowStateManager: WindowStateManager;

  constructor(dataManager: DataManager) {
    this.windowStateManager = new WindowStateManager(dataManager);
  }

  // Requirements: ui.1.1, ui.1.2, ui.2.1, ui.3.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5
  createWindow(): BrowserWindow {
    // Requirements: ui.5.4, ui.5.5
    const windowState = this.windowStateManager.loadState();
    
    // Requirements: ui.1.3, ui.1.4, ui.2.1, ui.3.1
    const windowConfig: BrowserWindowConstructorOptions = {
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      title: '', // Requirements: ui.2.1
      show: false,
      
      // Requirements: ui.3.1, ui.3.2
      titleBarStyle: 'default',
      
      // Requirements: ui.3.1, ui.3.2, ui.3.3, ui.3.4
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    };

    // Requirements: ui.1.1, ui.1.2, ui.1.3
    this.mainWindow = new BrowserWindow(windowConfig);

    // Requirements: ui.1.1
    if (windowState.isMaximized) {
      this.mainWindow.maximize();
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Requirements: ui.5.1, ui.5.2, ui.5.3
    this.setupStateTracking();
    
    return this.mainWindow;
  }

  /**
   * Настраивает отслеживание изменений состояния окна
   * Requirements: ui.5
   */
  private setupStateTracking(): void {
    if (!this.mainWindow) return;

    // Отслеживать изменения размера и позиции
    this.mainWindow.on('resize', () => this.saveCurrentState());
    this.mainWindow.on('move', () => this.saveCurrentState());
    this.mainWindow.on('maximize', () => this.saveCurrentState());
    this.mainWindow.on('unmaximize', () => this.saveCurrentState());
    
    // Сохранить финальное состояние перед закрытием
    this.mainWindow.on('close', () => this.saveCurrentState());
  }

  /**
   * Сохраняет текущее состояние окна
   * Requirements: ui.5
   */
  private saveCurrentState(): void {
    if (!this.mainWindow) return;
    
    const bounds = this.mainWindow.getBounds();
    const isMaximized = this.mainWindow.isMaximized();
    
    this.windowStateManager.saveState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  }
}
```

**Ключевые изменения:**
- Добавлена зависимость от `WindowStateManager`
- Метод `createWindow()` теперь загружает сохраненное состояние
- Добавлены методы для отслеживания и сохранения состояния окна
- Пустой заголовок окна (`title: ''`)
- Применение состояния maximized после создания окна

### WindowStateManager (Новый Компонент)

Новый класс для управления состоянием окна и его персистентностью.

```typescript
interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Requirements: ui.5
class WindowStateManager {
  private dataManager: DataManager;
  private readonly stateKey = 'window_state';

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  // Requirements: ui.1.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5, ui.5.6
  loadState(): WindowState {
  // Requirements: ui.1.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5, ui.5.6
  loadState(): WindowState {
    try {
      // Requirements: ui.5.4
      const savedState = this.dataManager.get(this.stateKey);
      
      if (savedState) {
        const state = JSON.parse(savedState) as WindowState;
        
        // Requirements: ui.5.6
        if (this.isPositionValid(state.x, state.y)) {
          return state;
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error);
    }

    // Requirements: ui.5.5
    return this.getDefaultState();
  }

  // Requirements: ui.5.1, ui.5.2, ui.5.3
  saveState(state: WindowState): void {
  // Requirements: ui.5.1, ui.5.2, ui.5.3
  saveState(state: WindowState): void {
    try {
      const stateJson = JSON.stringify(state);
      this.dataManager.set(this.stateKey, stateJson);
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  // Requirements: ui.1.1, ui.4.1, ui.4.2
  private getDefaultState(): WindowState {
  // Requirements: ui.1.1, ui.4.1, ui.4.2
  private getDefaultState(): WindowState {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Requirements: ui.4.1, ui.4.2, ui.4.3
    return {
      x: Math.floor(width * 0.05),
      y: Math.floor(height * 0.05),
      width: Math.floor(width * 0.9),
      height: Math.floor(height * 0.9),
      isMaximized: true, // Requirements: ui.1.1
    };
  }

  // Requirements: ui.5.6
  private isPositionValid(x: number, y: number): boolean {
  // Requirements: ui.5.6
  private isPositionValid(x: number, y: number): boolean {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();

    return displays.some((display) => {
      const { x: dx, y: dy, width, height } = display.bounds;
      return x >= dx && x < dx + width && y >= dy && y < dy + height;
    });
  }
}
```

**Ключевые особенности:**
- Использует `DataManager` для персистентности состояния
- Хранит состояние в формате JSON
- Валидирует позицию окна относительно доступных экранов
- Возвращает адаптивное состояние по умолчанию на основе размера экрана
- По умолчанию окно развернуто (maximized)

### Интеграция с DataManager

`WindowStateManager` использует существующий `DataManager` для хранения состояния окна в SQLite базе данных.

**Схема данных:**

```sql
-- Таблица key_value_store уже существует в DataManager
-- Используется ключ 'window_state' для хранения JSON состояния

key: 'window_state'
value: '{"x":100,"y":100,"width":1200,"height":800,"isMaximized":true}'
```

**Преимущества использования DataManager:**
- Единая точка доступа к данным
- Транзакционность и надежность SQLite
- Не требуется создание новых таблиц
- Простая интеграция с существующей инфраструктурой

## Модели Данных

### WindowState

Интерфейс для представления состояния окна.

```typescript
interface WindowState {
  /**
   * X координата левого верхнего угла окна
   */
  x: number;

  /**
   * Y координата левого верхнего угла окна
   */
  y: number;

  /**
   * Ширина окна в пикселях
   */
  width: number;

  /**
   * Высота окна в пикселях
   */
  height: number;

  /**
   * Флаг развернутого состояния окна
   */
  isMaximized: boolean;
}
```

**Валидация:**
- `x`, `y`: Должны находиться в пределах доступных экранов
- `width`, `height`: Должны быть положительными числами
- `isMaximized`: Булево значение

### BrowserWindowConstructorOptions (Electron)

Конфигурация для создания окна Electron.

**Ключевые параметры для наших требований:**

```typescript
// Requirements: ui.1, ui.2, ui.3, ui.4, ui.5
{
  x: number,              // Requirements: ui.5.2, ui.5.4
  y: number,              // Requirements: ui.5.2, ui.5.4
  width: number,          // Requirements: ui.4.1, ui.4.2, ui.5.1, ui.5.4
  height: number,         // Requirements: ui.4.1, ui.4.2, ui.5.1, ui.5.4
  title: string,          // Requirements: ui.2.1
  show: boolean,
  titleBarStyle: string,  // Requirements: ui.3.1, ui.3.2
  resizable: boolean,     // Requirements: ui.1.3
  fullscreen: boolean,    // Requirements: ui.1.2
  webPreferences: {       // Requirements: ui.3.1, ui.3.2, ui.3.3, ui.3.4
    preload: string,
    contextIsolation: boolean,
    nodeIntegration: boolean,
    sandbox: boolean,
    webSecurity: boolean,
  }
}
```

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Окно открывается в развернутом состоянии

*Для любого* запуска приложения, когда создается главное окно, оно должно находиться в развернутом состоянии (maximized), но не в полноэкранном режиме (fullscreen).

**Validates: Requirements ui.1.1, ui.1.2**

### Property 2: Окно поддерживает изменение размера

*Для любого* созданного главного окна, флаг `resizable` должен быть установлен в `true`, позволяя пользователю изменять размер окна.

**Validates: Requirements ui.1.3**

### Property 3: Окно имеет пустой заголовок

*Для любого* созданного главного окна, заголовок окна должен быть пустой строкой (`title: ''`).

**Validates: Requirements ui.2.1**

### Property 4: Окно использует нативные macOS элементы управления

*Для любого* созданного главного окна, параметр `titleBarStyle` должен быть установлен в `'default'`, обеспечивая использование стандартных элементов управления окном macOS.

**Validates: Requirements ui.2.3, ui.3.1**

### Property 5: Размер окна основан на размере экрана

*Для любого* первого запуска приложения (когда сохраненное состояние отсутствует), размеры окна по умолчанию должны быть вычислены на основе размера экрана пользователя, а не использовать хардкоженные значения.

**Validates: Requirements ui.4.1, ui.4.3**

### Property 6: Изменения состояния окна сохраняются

*Для любого* изменения состояния окна (размер, позиция, состояние maximized), новое состояние должно быть сохранено в постоянное хранилище через `DataManager`.

**Validates: Requirements ui.5.1, ui.5.2, ui.5.3**

### Property 7: Round-trip сохранения и загрузки состояния

*Для любого* валидного состояния окна, сохранение состояния с последующей загрузкой должно возвращать эквивалентное состояние (с учетом валидации позиции).

**Validates: Requirements ui.5.4**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Маленький экран (ui.4.4)**: Когда размер экрана меньше стандартного, размеры окна должны адаптироваться к доступному пространству и не превышать размер экрана.

2. **Первый запуск (ui.5.5)**: Когда сохраненное состояние отсутствует, должно использоваться состояние по умолчанию с развернутым окном.

3. **Невалидная позиция (ui.5.6)**: Когда сохраненная позиция находится за пределами доступных экранов, должно использоваться состояние по умолчанию на основном экране.


## Обработка Ошибок

### Стратегия Обработки Ошибок

Система управления UI должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка загрузки состояния окна

**Причины:**
- Поврежденные данные в базе данных
- Ошибка парсинга JSON
- Отсутствие доступа к базе данных

**Обработка:**
```typescript
// Requirements: ui.5.4, ui.5.5, ui.5.6
loadState(): WindowState {
  try {
    const savedState = this.dataManager.get(this.stateKey);
    if (savedState) {
      const state = JSON.parse(savedState) as WindowState;
      if (this.isPositionValid(state.x, state.y)) {
        return state;
      }
    }
  } catch (error) {
    console.error('Failed to load window state:', error);
  }
  return this.getDefaultState();
}
```

**Результат:** Использование состояния по умолчанию, приложение продолжает работу.

#### 2. Ошибка сохранения состояния окна

**Причины:**
- Ошибка записи в базу данных
- Недостаточно места на диске
- Проблемы с правами доступа

**Обработка:**
```typescript
// Requirements: ui.5.1, ui.5.2, ui.5.3
saveState(state: WindowState): void {
  try {
    const stateJson = JSON.stringify(state);
    this.dataManager.set(this.stateKey, stateJson);
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}
```

**Результат:** Ошибка логируется, но не влияет на работу приложения. Состояние не сохраняется, но при следующем запуске будет использовано предыдущее сохраненное состояние или состояние по умолчанию.

#### 3. Невалидная позиция окна

**Причины:**
- Пользователь отключил внешний монитор
- Изменилась конфигурация экранов
- Поврежденные данные состояния

**Обработка:**
```typescript
// Requirements: ui.5.6
private isPositionValid(x: number, y: number): boolean {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx && x < dx + width && y >= dy && y < dy + height;
  });
}
```

**Результат:** Если позиция невалидна, используется состояние по умолчанию на основном экране.

#### 4. Ошибка создания окна

**Причины:**
- Недостаточно системных ресурсов
- Проблемы с Electron API
- Некорректная конфигурация

**Обработка:**
```typescript
// Requirements: ui.1.1, ui.1.2, ui.2.1, ui.3.1
createWindow(): BrowserWindow {
  try {
    this.mainWindow = new BrowserWindow(windowConfig);
    return this.mainWindow;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to create window:', errorMessage);
    throw new Error(`Window creation failed: ${errorMessage}`);
  }
}
```

**Результат:** Ошибка пробрасывается выше, приложение не может продолжить работу без главного окна.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики:

```typescript
console.error('Failed to load window state:', error);
console.error('Failed to save window state:', error);
console.error('Failed to create window:', errorMessage);
```

## Стратегия Тестирования

### Двойной Подход к Тестированию

Система UI будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Property-based тесты**: Проверяют универсальные свойства на множестве входных данных

Оба подхода необходимы для комплексного покрытия.

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Избегать написания слишком большого количества модульных тестов - property-based тесты покрывают множество входных данных
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок
- Property-based тесты должны фокусироваться на:
  - Универсальных свойствах, которые истинны для всех входных данных
  - Комплексном покрытии входных данных через рандомизацию

### Конфигурация Property-Based Тестов

- **Библиотека**: `fast-check` для TypeScript/JavaScript
- **Минимум итераций**: 100 итераций на property-based тест
- **Тегирование**: Каждый тест должен ссылаться на свойство из документа дизайна
- **Формат тега**: `Feature: ui, Property {number}: {property_text}`

### Модульные Тесты

#### WindowManager Tests

```typescript
describe('WindowManager', () => {
  /* Preconditions: WindowManager created with DataManager mock
     Action: call createWindow()
     Assertions: window created with empty title, default titleBarStyle, not fullscreen
     Requirements: ui.1, ui.2, ui.3 */
  it('should create window with correct initial configuration', () => {
    // Тест создания окна с корректной конфигурацией
  });

  /* Preconditions: window created and shown
     Action: resize window
     Assertions: saveState called with new dimensions
     Requirements: ui.5.1 */
  it('should save state when window is resized', () => {
    // Тест сохранения состояния при изменении размера
  });

  /* Preconditions: window created
     Action: maximize window
     Assertions: saveState called with isMaximized: true
     Requirements: ui.5.3 */
  it('should save maximized state', () => {
    // Тест сохранения состояния maximized
  });

  /* Preconditions: BrowserWindow constructor throws error
     Action: call createWindow()
     Assertions: error thrown with descriptive message
     Requirements: ui.1 */
  it('should handle window creation errors', () => {
    // Тест обработки ошибок создания окна
  });
});
```

#### WindowStateManager Tests

```typescript
describe('WindowStateManager', () => {
  /* Preconditions: no saved state in database
     Action: call loadState()
     Assertions: returns default state with isMaximized: true, dimensions based on screen size
     Requirements: ui.4.1, ui.5.5 */
  it('should return default state when no saved state exists', () => {
    // Тест возврата состояния по умолчанию
  });

  /* Preconditions: valid state saved in database
     Action: call loadState()
     Assertions: returns saved state
     Requirements: ui.5.4 */
  it('should load saved state from database', () => {
    // Тест загрузки сохраненного состояния
  });

  /* Preconditions: saved state with position outside screen bounds
     Action: call loadState()
     Assertions: returns default state on primary screen
     Requirements: ui.5.6 */
  it('should return default state for invalid position', () => {
    // Тест обработки невалидной позиции
  });

  /* Preconditions: valid window state
     Action: call saveState()
     Assertions: state saved to database as JSON
     Requirements: ui.5.1, ui.5.2, ui.5.3 */
  it('should save state to database', () => {
    // Тест сохранения состояния
  });

  /* Preconditions: database write fails
     Action: call saveState()
     Assertions: error logged, no exception thrown
     Requirements: ui.5 */
  it('should handle save errors gracefully', () => {
    // Тест обработки ошибок сохранения
  });

  /* Preconditions: corrupted JSON in database
     Action: call loadState()
     Assertions: returns default state, error logged
     Requirements: ui.5 */
  it('should handle corrupted state data', () => {
    // Тест обработки поврежденных данных
  });
});
```

### Property-Based Тесты

```typescript
import fc from 'fast-check';

describe('WindowStateManager Property Tests', () => {
  /* Feature: ui, Property 5: Размер окна основан на размере экрана
     Preconditions: screen API returns various screen sizes
     Action: call getDefaultState() with different screen sizes
     Assertions: returned dimensions are proportional to screen size, not hardcoded
     Requirements: ui.4.1, ui.4.3 */
  it('should generate default state based on screen size', () => {
    fc.assert(
      fc.property(
        fc.record({
          width: fc.integer({ min: 800, max: 3840 }),
          height: fc.integer({ min: 600, max: 2160 }),
        }),
        (screenSize) => {
          // Mock screen API
          const mockScreen = {
            getPrimaryDisplay: () => ({
              workAreaSize: screenSize,
            }),
          };

          // Создать WindowStateManager с мocked screen
          const state = getDefaultStateWithScreen(mockScreen);

          // Проверить, что размеры основаны на размере экрана
          expect(state.width).toBeLessThanOrEqual(screenSize.width);
          expect(state.height).toBeLessThanOrEqual(screenSize.height);
          expect(state.width).toBeGreaterThan(0);
          expect(state.height).toBeGreaterThan(0);
          
          // Проверить, что размеры не хардкожены
          expect(state.width).not.toBe(1920);
          expect(state.height).not.toBe(1080);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 7: Round-trip сохранения и загрузки состояния
     Preconditions: valid window state with various values
     Action: save state then load state
     Assertions: loaded state equals saved state (for valid positions)
     Requirements: ui.5.4 */
  it('should preserve state through save/load cycle', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: 0, max: 2000 }),
          y: fc.integer({ min: 0, max: 2000 }),
          width: fc.integer({ min: 400, max: 3000 }),
          height: fc.integer({ min: 300, max: 2000 }),
          isMaximized: fc.boolean(),
        }),
        (state) => {
          // Mock screen to make position valid
          mockScreenWithBounds(state.x, state.y);

          // Сохранить состояние
          windowStateManager.saveState(state);

          // Загрузить состояние
          const loadedState = windowStateManager.loadState();

          // Проверить эквивалентность
          expect(loadedState).toEqual(state);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 6: Изменения состояния окна сохраняются
     Preconditions: window created with various initial states
     Action: trigger resize/move/maximize events
     Assertions: DataManager.set called with updated state
     Requirements: ui.5.1, ui.5.2, ui.5.3 */
  it('should save state on any window state change', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: 0, max: 2000 }),
          y: fc.integer({ min: 0, max: 2000 }),
          width: fc.integer({ min: 400, max: 3000 }),
          height: fc.integer({ min: 300, max: 2000 }),
          isMaximized: fc.boolean(),
        }),
        (newState) => {
          // Создать окно
          const window = windowManager.createWindow();

          // Изменить состояние окна
          window.setBounds({
            x: newState.x,
            y: newState.y,
            width: newState.width,
            height: newState.height,
          });
          
          if (newState.isMaximized) {
            window.maximize();
          }

          // Триггернуть события
          window.emit('resize');
          window.emit('move');

          // Проверить, что состояние сохранено
          expect(mockDataManager.set).toHaveBeenCalledWith(
            'window_state',
            expect.stringContaining(JSON.stringify(newState))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Интеграционные Тесты

```typescript
describe('Window UI Integration', () => {
  /* Preconditions: fresh application start, no saved state
     Action: create window, modify state, restart application
     Assertions: window opens with saved state
     Requirements: ui.1, ui.4, ui.5 */
  it('should persist and restore window state across restarts', async () => {
    // Первый запуск
    const windowManager1 = new WindowManager(dataManager);
    const window1 = windowManager1.createWindow();
    
    // Изменить состояние
    window1.setBounds({ x: 100, y: 100, width: 800, height: 600 });
    window1.emit('resize');
    
    // Закрыть окно
    windowManager1.closeWindow();
    
    // Второй запуск
    const windowManager2 = new WindowManager(dataManager);
    const window2 = windowManager2.createWindow();
    
    // Проверить, что состояние восстановлено
    const bounds = window2.getBounds();
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(100);
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(600);
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('Window UI Functional Tests', () => {
  /* Preconditions: fresh application start, no saved state
     Action: launch application, verify window state
     Assertions: window opens maximized, has empty title, uses native macOS controls
     Requirements: ui.1.1, ui.1.2, ui.2.1, ui.3.1 */
  it('should open application with correct initial window state', async () => {
    // Запустить приложение
    const app = await launchApp();
    
    // Получить главное окно
    const window = app.getMainWindow();
    
    // Проверить состояние maximized
    expect(window.isMaximized()).toBe(true);
    
    // Проверить пустой заголовок
    expect(window.getTitle()).toBe('');
    
    // Проверить, что не в fullscreen
    expect(window.isFullScreen()).toBe(false);
    
    // Закрыть приложение
    await app.close();
  });

  /* Preconditions: application running with default state
     Action: resize window, close app, reopen app
     Assertions: window opens with saved size and position
     Requirements: ui.5.1, ui.5.2, ui.5.4 */
  it('should persist window state across restarts', async () => {
    // Первый запуск
    const app1 = await launchApp();
    const window1 = app1.getMainWindow();
    
    // Изменить размер и позицию
    window1.setBounds({ x: 100, y: 100, width: 800, height: 600 });
    await wait(500); // Дать время на сохранение
    
    // Закрыть приложение
    await app1.close();
    
    // Второй запуск
    const app2 = await launchApp();
    const window2 = app2.getMainWindow();
    
    // Проверить восстановленное состояние
    const bounds = window2.getBounds();
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(100);
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(600);
    
    // Закрыть приложение
    await app2.close();
  });

  /* Preconditions: application running
     Action: maximize window, close app, reopen app
     Assertions: window opens in maximized state
     Requirements: ui.5.3, ui.5.4 */
  it('should persist maximized state across restarts', async () => {
    // Первый запуск
    const app1 = await launchApp();
    const window1 = app1.getMainWindow();
    
    // Развернуть окно
    window1.unmaximize(); // Сначала свернуть
    await wait(100);
    window1.maximize(); // Затем развернуть
    await wait(500); // Дать время на сохранение
    
    // Закрыть приложение
    await app1.close();
    
    // Второй запуск
    const app2 = await launchApp();
    const window2 = app2.getMainWindow();
    
    // Проверить состояние maximized
    expect(window2.isMaximized()).toBe(true);
    
    // Закрыть приложение
    await app2.close();
  });

  /* Preconditions: application running on small screen
     Action: launch application on screen smaller than 1920x1080
     Assertions: window adapts to screen size, does not exceed screen bounds
     Requirements: ui.4.1, ui.4.4 */
  it('should adapt window size to small screens', async () => {
    // Эмулировать маленький экран (например, 1366x768)
    const app = await launchApp({ screenSize: { width: 1366, height: 768 } });
    const window = app.getMainWindow();
    
    // Получить размеры окна
    const bounds = window.getBounds();
    
    // Проверить, что окно не превышает размер экрана
    expect(bounds.width).toBeLessThanOrEqual(1366);
    expect(bounds.height).toBeLessThanOrEqual(768);
    
    // Проверить, что размеры не хардкожены
    expect(bounds.width).not.toBe(1920);
    expect(bounds.height).not.toBe(1080);
    
    // Закрыть приложение
    await app.close();
  });
});
```

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| ui.1.1 | ✓ | ✓ | ✓ |
| ui.1.2 | ✓ | ✓ | ✓ |
| ui.1.3 | ✓ | - | - |
| ui.1.4 | ✓ | - | - |
| ui.2.1 | ✓ | - | ✓ |
| ui.2.2 | ✓ | - | - |
| ui.2.3 | ✓ | - | - |
| ui.3.1 | ✓ | - | ✓ |
| ui.3.2 | ✓ | - | - |
| ui.3.3 | ✓ | - | - |
| ui.3.4 | ✓ | - | - |
| ui.3.5 | ✓ | - | - |
| ui.4.1 | ✓ | ✓ | ✓ |
| ui.4.2 | ✓ | - | - |
| ui.4.3 | - | ✓ | - |
| ui.4.4 | ✓ | - | ✓ |
| ui.5.1 | ✓ | ✓ | ✓ |
| ui.5.2 | ✓ | ✓ | ✓ |
| ui.5.3 | ✓ | ✓ | ✓ |
| ui.5.4 | ✓ | ✓ | ✓ |
| ui.5.5 | ✓ | - | - |
| ui.5.6 | ✓ | - | - |

### Критерии Успеха

- Все модульные тесты проходят
- Все property-based тесты проходят (минимум 100 итераций каждый)
- Покрытие кода минимум 85%
- Все требования покрыты тестами
- Все граничные случаи обработаны корректно

## Технические Решения и Обоснование

### Решение 1: Использование DataManager для Персистентности

**Решение:** Использовать существующий `DataManager` с key-value хранилищем для сохранения состояния окна.

**Альтернативы:**
- Создать отдельную таблицу в SQLite
- Использовать файловую систему (JSON файл)
- Использовать Electron's `electron-store`

**Обоснование:**
- Единая точка доступа к данным
- Не требуется создание новых таблиц
- Транзакционность и надежность SQLite
- Простая интеграция с существующей инфраструктурой
- Меньше зависимостей

### Решение 2: Хранение Состояния в JSON

**Решение:** Сериализовать `WindowState` в JSON для хранения в базе данных.

**Альтернативы:**
- Хранить каждое поле в отдельной записи
- Использовать бинарную сериализацию

**Обоснование:**
- Простота реализации
- Читаемость данных для отладки
- Легкость расширения (добавление новых полей)
- Стандартный формат данных

### Решение 3: Валидация Позиции при Загрузке

**Решение:** Проверять валидность позиции окна при загрузке состояния и использовать состояние по умолчанию для невалидных позиций.

**Альтернативы:**
- Пытаться скорректировать позицию к ближайшему валидному экрану
- Игнорировать валидацию и полагаться на Electron

**Обоснование:**
- Гарантирует, что окно всегда видимо пользователю
- Простая и предсказуемая логика
- Обрабатывает случаи отключения мониторов
- Соответствует требованию ui.5.6

### Решение 4: Состояние по Умолчанию - Maximized

**Решение:** По умолчанию окно открывается в развернутом состоянии (maximized).

**Альтернативы:**
- Открывать окно в нормальном состоянии с фиксированным размером
- Открывать окно в полноэкранном режиме

**Обоснование:**
- Максимизирует использование экранного пространства (ui.1.1)
- Сохраняет видимость системных элементов macOS (ui.1.4)
- Позволяет пользователю легко изменить размер (ui.1.3)
- Не использует полноэкранный режим (ui.1.2)

### Решение 5: Адаптивные Размеры на Основе Экрана

**Решение:** Вычислять размеры окна по умолчанию как процент от размера экрана (90%).

**Альтернативы:**
- Использовать фиксированные размеры (например, 1920x1080)
- Использовать 100% размера экрана

**Обоснование:**
- Адаптируется к любому размеру экрана (ui.4.1, ui.4.4)
- Не использует хардкоженные размеры (ui.4.3)
- Оставляет небольшой отступ для эстетики
- Работает корректно на маленьких экранах

### Решение 6: Отслеживание Событий для Автосохранения

**Решение:** Подписываться на события `resize`, `move`, `maximize`, `unmaximize` для автоматического сохранения состояния.

**Альтернативы:**
- Сохранять состояние только при закрытии окна
- Использовать polling для проверки изменений

**Обоснование:**
- Гарантирует актуальность сохраненного состояния
- Обрабатывает все типы изменений состояния (ui.5.1, ui.5.2, ui.5.3)
- Эффективно - сохранение только при изменениях
- Использует нативные события Electron

## Заключение

Данный дизайн обеспечивает надежное управление UI приложения с фокусом на нативный macOS опыт, персистентность состояния и адаптивность к различным конфигурациям экранов. Архитектура разделяет ответственность между `WindowManager` (управление жизненным циклом окна) и `WindowStateManager` (управление персистентностью состояния), обеспечивая чистоту кода и легкость тестирования.
