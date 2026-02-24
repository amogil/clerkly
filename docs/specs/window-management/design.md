# Документ Дизайна: Управление Окнами

## Обзор

Данный документ описывает архитектуру и дизайн системы управления главным окном приложения Clerkly, включая его конфигурацию при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DatabaseManager) является единственным источником истины для всех данных приложения**.

**Ключевые аспекты:**

1. **UI отображает данные из базы**: Все компоненты интерфейса читают данные из базы данных, а не хранят собственное состояние данных
2. **Реактивное обновление**: При изменении данных в базе UI автоматически обновляется через систему событий (IPC)
3. **Фоновая синхронизация**: Фоновые процессы обновляют базу данных, изменения автоматически попадают в UI

**Поток данных:**
```
External API → Main Process → Database → IPC Event → Renderer → UI Update
```

Этот принцип обеспечивает:
- Консистентность данных во всем приложении
- Offline-first подход (приложение работает с локальными данными)
- Плавный UX без мерцания пустых состояний
- Простоту отладки и тестирования
- Надежность (данные персистентны)

### Цели Дизайна

- Обеспечить нативный macOS опыт использования приложения
- Использовать компактный размер окна при первом запуске для фокуса на чатах с агентами
- Обеспечить возможность изменения размера окна сразу после запуска
- Сохранять предпочтения пользователя по размеру и позиции окна
- Адаптироваться к различным размерам экранов
- Поддерживать минималистичный интерфейс без лишних элементов
- Следовать принципу единого источника истины (база данных)

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **BrowserWindow API**: Electron API для управления окнами
- **screen API**: Electron API для получения информации об экранах
- **SQLite**: База данных для хранения состояния окна (через DatabaseManager)

## Архитектура

### Компоненты Системы

Система управления окнами состоит из следующих основных компонентов:

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
│  │  BrowserWindow   │         │   DatabaseManager   │       │
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
   - `WindowStateManager` загружает состояние из базы данных через `DatabaseManager`
   - Если состояние отсутствует, используются значения по умолчанию
   - `WindowManager` создает `BrowserWindow` с полученной конфигурацией

2. **Изменение состояния окна**:
   - Пользователь изменяет размер, позицию или состояние окна
   - `BrowserWindow` генерирует события (resize, move, maximize, unmaximize)
   - `WindowStateManager` слушает эти события и сохраняет новое состояние
   - Состояние записывается в базу данных через `DatabaseManager`

3. **Закрытие приложения**:
   - Финальное состояние окна сохраняется перед закрытием
   - При следующем запуске состояние будет восстановлено

## Компоненты и Интерфейсы

### WindowManager (Существующий, Расширенный)

Класс `WindowManager` управляет жизненным циклом главного окна приложения.

**Расширения для новых требований:**

```typescript
// Requirements: window-management.1, window-management.2, window-management.3, window-management.4, window-management.5
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private windowStateManager: WindowStateManager;

  constructor(dbManager: DatabaseManager) {
    this.windowStateManager = new WindowStateManager(dbManager);
  }

  // Requirements: window-management.1.1, window-management.1.2, window-management.2.1, 
  // window-management.3.1, window-management.4.1, window-management.4.2, 
  // window-management.5.4, window-management.5.5
  createWindow(): BrowserWindow {
    // Requirements: window-management.5.4, window-management.5.5
    const windowState = this.windowStateManager.loadState();
    
    // Requirements: window-management.1.3, window-management.1.4, window-management.2.1, window-management.3.1
    const windowConfig: BrowserWindowConstructorOptions = {
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      title: '', // Requirements: window-management.2.1
      show: false,
      resizable: true, // Requirements: window-management.1.3
      
      // Requirements: window-management.3.1, window-management.3.2
      titleBarStyle: 'default',
      
      // Requirements: window-management.3.1, window-management.3.2, window-management.3.3, window-management.3.4
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    };

    // Requirements: window-management.1.1, window-management.1.2, window-management.1.3
    this.mainWindow = new BrowserWindow(windowConfig);

    // Note: We don't call maximize() here even if windowState.isMaximized is true
    // because on macOS, maximized windows cannot be resized by dragging edges.
    // The window will open with the saved size (or compact 800x600 by default),
    // which provides a focused window that is still resizable.
    // If the user previously maximized the window and closed it in that state,
    // we restore the maximized state after showing.
    // Requirements: window-management.1.1, window-management.1.3

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // Requirements: window-management.5.3, window-management.5.4 - Restore maximized state if it was saved
      if (windowState.isMaximized) {
        this.mainWindow?.maximize();
      }
    });

    // Requirements: window-management.5.1, window-management.5.2, window-management.5.3
    this.setupStateTracking();
    
    return this.mainWindow;
  }

  /**
   * Настраивает отслеживание изменений состояния окна
   * Requirements: window-management.5
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
   * Requirements: window-management.5
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

**Важно:** Состояние окна является глобальным и не изолируется по пользователям (window-management.5.7). Это отличается от других данных приложения (настройки, профиль, токены), которые изолированы по пользователям. Причина: состояние окна - это свойство физического приложения на устройстве, а не данные конкретного пользователя. Окно должно открываться в том же месте и размере независимо от того, какой пользователь вошел в систему.

```typescript
interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Requirements: window-management.5, drizzle-migration.6
class WindowStateManager {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  // Requirements: window-management.1.1, window-management.4.1, window-management.4.2, window-management.5.4, window-management.5.5, window-management.5.6, drizzle-migration.6.1
  loadState(): WindowState {
    try {
      // Requirements: window-management.5.4, user-data-isolation.6.10, drizzle-migration.6.1
      // Использует глобальный репозиторий (без user_id) — состояние окна глобальное
      const savedState = this.dbManager.global.windowState.get();
      
      if (savedState) {
        // Requirements: window-management.5.6
        if (this.isPositionValid(savedState.x, savedState.y)) {
          return savedState;
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error);
    }

    // Requirements: window-management.5.5
    return this.getDefaultState();
  }

  // Requirements: window-management.5.1, window-management.5.2, window-management.5.3, drizzle-migration.6.1
  saveState(state: WindowState): void {
    try {
      // Requirements: user-data-isolation.6.10, drizzle-migration.6.1
      // Использует глобальный репозиторий (без user_id) — состояние окна глобальное
      this.dbManager.global.windowState.set(state);
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  // Requirements: window-management.1.1, window-management.1.3, window-management.4.1, window-management.4.2, window-management.4.4
  private getDefaultState(): WindowState {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Requirements: window-management.1.1, window-management.4.2, window-management.4.4
    // Window opens with size min(800, screenWidth) x min(600, screenHeight) on first launch
    // This provides a focused interface for agent chats while allowing immediate resizing
    const width = Math.min(800, screenWidth);
    const height = Math.min(600, screenHeight);
    
    // Requirements: window-management.4.4 - Center window on screen
    const x = Math.floor((screenWidth - width) / 2);
    const y = Math.floor((screenHeight - height) / 2);
    
    return {
      x: x,
      y: y,
      width: width,
      height: height,
      isMaximized: false, // NOT maximized - window is resizable from the start
    };
  }

  // Requirements: window-management.5.6
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
- Использует `DatabaseManager` для доступа к базе данных (глобальные данные, без user_id фильтрации)
- Хранит состояние в формате JSON
- Валидирует позицию окна относительно доступных экранов
- Возвращает адаптивное состояние по умолчанию на основе размера экрана
- По умолчанию окно НЕ максимизировано (isMaximized: false)

### Интеграция с DatabaseManager

`WindowStateManager` использует `DatabaseManager` для хранения состояния окна в SQLite базе данных.

**Важно:** WindowStateManager является исключением из правила изоляции данных по user_id (см. user-data-isolation.6.8). Он работает с глобальными данными и использует DatabaseManager только для доступа к БД, без фильтрации по user_id.

**Схема данных:**

```sql
-- Таблица window_state для глобального состояния окна (не изолируется по user_id)
-- Используется ключ 'window_state' для хранения JSON состояния

key: 'window_state'
value: '{"x":100,"y":100,"width":1200,"height":800,"isMaximized":true}'
```

**Преимущества использования DatabaseManager:**
- Единая точка доступа к базе данных
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
// Requirements: window-management.1, window-management.2, window-management.3, window-management.4, window-management.5
{
  x: number,              // Requirements: window-management.5.2, window-management.5.4
  y: number,              // Requirements: window-management.5.2, window-management.5.4
  width: number,          // Requirements: window-management.4.1, window-management.4.2, window-management.5.1, window-management.5.4
  height: number,         // Requirements: window-management.4.1, window-management.4.2, window-management.5.1, window-management.5.4
  title: string,          // Requirements: window-management.2.1
  show: boolean,
  titleBarStyle: string,  // Requirements: window-management.3.1, window-management.3.2
  resizable: boolean,     // Requirements: window-management.1.3
  fullscreen: boolean,    // Requirements: window-management.1.2
  webPreferences: {       // Requirements: window-management.3.1, window-management.3.2, window-management.3.3, window-management.3.4
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

### Property 1: Окно открывается с адаптивным размером при первом запуске

*Для любого* первого запуска приложения (когда сохраненное состояние отсутствует), окно должно иметь размер min(800, ширина экрана) x min(600, высота экрана), быть центрировано на экране, но НЕ находиться в maximized состоянии (isMaximized: false), чтобы пользователь мог сразу изменять его размер через перетаскивание краев окна.

**Validates: Requirements window-management.1.1, window-management.1.3**

### Property 2: Окно можно изменять в размере и максимизировать

*Для любого* созданного главного окна, флаг `resizable` должен быть установлен в `true`, позволяя пользователю изменять размер окна и максимизировать его через стандартные элементы управления macOS.

**Validates: Requirements window-management.1.3, window-management.1.4**

### Property 3: Окно имеет пустой заголовок

*Для любого* созданного главного окна, заголовок окна должен быть пустой строкой (`title: ''`).

**Validates: Requirements window-management.2.1**

### Property 4: Окно использует нативные macOS элементы управления

*Для любого* созданного главного окна, параметр `titleBarStyle` должен быть установлен в `'default'`, обеспечивая использование стандартных элементов управления окном macOS.

**Validates: Requirements window-management.2.3, window-management.3.1**

### Property 5: Размер окна адаптируется к экрану при первом запуске

*Для любого* первого запуска приложения (когда сохраненное состояние отсутствует), размеры окна по умолчанию должны быть min(800, ширина экрана) x min(600, высота экрана), адаптируясь к размеру экрана.

**Validates: Requirements window-management.4.1, window-management.4.2**

### Property 6: Изменения состояния окна сохраняются

*Для любого* изменения состояния окна (размер, позиция, состояние maximized), новое состояние должно быть сохранено в постоянное хранилище через `DatabaseManager`. Если пользователь закрывает окно в maximized состоянии, при следующем запуске окно должно открыться максимизированным.

**Validates: Requirements window-management.5.1, window-management.5.2, window-management.5.3, window-management.5.4**

### Property 7: Round-trip сохранения и загрузки состояния

*Для любого* валидного состояния окна, сохранение состояния с последующей загрузкой должно возвращать эквивалентное состояние (с учетом валидации позиции).

**Validates: Requirements window-management.5.4**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Маленький экран (window-management.4.2)**: Когда размер экрана меньше 800x600, размеры окна должны адаптироваться: min(800, ширина экрана) x min(600, высота экрана).

2. **Первый запуск (window-management.5.5)**: Когда сохраненное состояние отсутствует, должно использоваться состояние по умолчанию с размером min(800, ширина экрана) x min(600, высота экрана), центрированным на экране, но НЕ в maximized состоянии.

3. **Невалидная позиция (window-management.5.6)**: Когда сохраненная позиция находится за пределами доступных экранов, должно использоваться состояние по умолчанию на основном экране.

## Обработка Ошибок

### Стратегия Обработки Ошибок

Система управления окнами должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка загрузки состояния окна

**Причины:**
- Поврежденные данные в базе данных
- Ошибка парсинга JSON
- Отсутствие доступа к базе данных

**Обработка:**
```typescript
// Requirements: window-management.5.4, window-management.5.5, window-management.5.6, user-data-isolation.6.10, drizzle-migration.6.1
loadState(): WindowState {
  try {
    // Использует глобальный репозиторий (без user_id) — состояние окна глобальное
    const savedState = this.dbManager.global.windowState.get();
    if (savedState) {
      if (this.isPositionValid(savedState.x, savedState.y)) {
        return savedState;
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
// Requirements: window-management.5.1, window-management.5.2, window-management.5.3, user-data-isolation.6.10, drizzle-migration.6.1
saveState(state: WindowState): void {
  try {
    // Использует глобальный репозиторий (без user_id) — состояние окна глобальное
    this.dbManager.global.windowState.set(state);
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
// Requirements: window-management.5.6
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
// Requirements: window-management.1.1, window-management.1.2, window-management.2.1, window-management.3.1
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

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс (clerkly.3):

```typescript
// Window management errors
console.error('Failed to load window state:', error);
console.error('Failed to save window state:', error);
console.error('Failed to create window:', errorMessage);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace

## Стратегия Тестирования

### Подход к Тестированию

Система управления окнами будет тестироваться с использованием модульных и функциональных тестов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют пользовательские сценарии в реальном приложении

Оба подхода необходимы для комплексного покрытия.

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок

### Модульные Тесты

#### WindowManager Tests

```typescript
describe('WindowManager', () => {
  /* Preconditions: WindowManager created with DatabaseManager mock
     Action: call createWindow()
     Assertions: window created with empty title, default titleBarStyle, not fullscreen
     Requirements: window-management.1, window-management.2, window-management.3 */
  it('should create window with correct initial configuration', () => {
    // Тест создания окна с корректной конфигурацией
  });

  /* Preconditions: window created and shown
     Action: resize window
     Assertions: saveState called with new dimensions
     Requirements: window-management.5.1 */
  it('should save state when window is resized', () => {
    // Тест сохранения состояния при изменении размера
  });

  /* Preconditions: window created
     Action: maximize window
     Assertions: saveState called with isMaximized: true
     Requirements: window-management.5.3 */
  it('should save maximized state', () => {
    // Тест сохранения состояния maximized
  });

  /* Preconditions: BrowserWindow constructor throws error
     Action: call createWindow()
     Assertions: error thrown with descriptive message
     Requirements: window-management.1 */
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
     Assertions: returns default state with isMaximized: false, dimensions min(800, screenWidth) x min(600, screenHeight)
     Requirements: window-management.4.1, window-management.4.2, window-management.5.5 */
  it('should return default state when no saved state exists', () => {
    // Тест возврата состояния по умолчанию
  });

  /* Preconditions: valid state saved in database
     Action: call loadState()
     Assertions: returns saved state
     Requirements: window-management.5.4 */
  it('should load saved state from database', () => {
    // Тест загрузки сохраненного состояния
  });

  /* Preconditions: saved state with position outside screen bounds
     Action: call loadState()
     Assertions: returns default state on primary screen
     Requirements: window-management.5.6 */
  it('should return default state for invalid position', () => {
    // Тест обработки невалидной позиции
  });

  /* Preconditions: valid window state
     Action: call saveState()
     Assertions: state saved to database as JSON
     Requirements: window-management.5.1, window-management.5.2, window-management.5.3 */
  it('should save state to database', () => {
    // Тест сохранения состояния
  });

  /* Preconditions: database write fails
     Action: call saveState()
     Assertions: error logged, no exception thrown
     Requirements: window-management.5 */
  it('should handle save errors gracefully', () => {
    // Тест обработки ошибок сохранения
  });

  /* Preconditions: corrupted JSON in database
     Action: call loadState()
     Assertions: returns default state, error logged
     Requirements: window-management.5 */
  it('should handle corrupted state data', () => {
    // Тест обработки поврежденных данных
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('Window Management Functional Tests', () => {
  /* Preconditions: fresh application start, no saved state
     Action: launch application, verify window state
     Assertions: window opens with size min(800, screenWidth) x min(600, screenHeight), not maximized, has empty title, uses native macOS controls
     Requirements: window-management.1.1, window-management.1.2, window-management.2.1, window-management.3.1 */
  it('should open application with correct initial window state', async () => {
    // Запустить приложение
    const app = await launchApp();
    
    // Получить главное окно
    const window = app.getMainWindow();
    
    // Проверить размеры (должны быть компактными: 800x600 или адаптированы к меньшему экрану)
    const bounds = window.getBounds();
    const screenSize = screen.getPrimaryDisplay().workAreaSize;
    const expectedWidth = Math.min(800, screenSize.width);
    const expectedHeight = Math.min(600, screenSize.height);
    expect(bounds.width).toBe(expectedWidth);
    expect(bounds.height).toBe(expectedHeight);
    
    // Проверить, что НЕ maximized
    expect(window.isMaximized()).toBe(false);
    
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
     Requirements: window-management.5.1, window-management.5.2, window-management.5.4 */
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
     Assertions: window opens in maximized state (user closed it maximized, so it reopens maximized)
     Requirements: window-management.5.3, window-management.5.4 */
  it('should persist maximized state across restarts', async () => {
    // Первый запуск
    const app1 = await launchApp();
    const window1 = app1.getMainWindow();
    
    // Развернуть окно
    window1.maximize();
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
     Requirements: window-management.4.1, window-management.4.4 */
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

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| window-management.1.1 | ✓ | ✓ |
| window-management.1.2 | ✓ | ✓ |
| window-management.1.3 | ✓ | ✓ |
| window-management.1.4 | ✓ | ✓ |
| window-management.1.5 | ✓ | - |
| window-management.2.1 | ✓ | ✓ |
| window-management.2.2 | ✓ | - |
| window-management.2.3 | ✓ | - |
| window-management.3.1 | ✓ | ✓ |
| window-management.3.2 | ✓ | - |
| window-management.3.3 | ✓ | - |
| window-management.3.4 | ✓ | - |
| window-management.4.1 | ✓ | ✓ |
| window-management.4.2 | ✓ | - |
| window-management.4.3 | ✓ | - |
| window-management.4.4 | ✓ | ✓ |
| window-management.5.1 | ✓ | ✓ |
| window-management.5.2 | ✓ | ✓ |
| window-management.5.3 | ✓ | ✓ |
| window-management.5.4 | ✓ | ✓ |
| window-management.5.5 | ✓ | - |
| window-management.5.6 | ✓ | - |
| window-management.5.7 | ✓ | - |
| window-management.6.1 | - | ✓ |
| window-management.6.2 | - | ✓ |
| window-management.6.3 | - | ✓ |

### Критерии Успеха

- Все модульные тесты проходят
- Покрытие кода минимум 85%
- Все требования покрыты тестами
- Все граничные случаи обработаны корректно

## Технические Решения и Обоснование

### Решение 1: Использование DatabaseManager для Персистентности

**Решение:** Использовать `DatabaseManager` для доступа к базе данных и сохранения состояния окна в отдельной таблице `window_state`.

**Альтернативы:**
- Использовать UserSettingsManager (но это для пользовательских данных с изоляцией по user_id)
- Использовать файловую систему (JSON файл)
- Использовать Electron's `electron-store`

**Обоснование:**
- Единая точка доступа к базе данных через DatabaseManager
- Состояние окна глобальное (не изолируется по user_id) — см. user-data-isolation.6.8
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
- Соответствует требованию window-management.5.6

### Решение 4: Состояние по Умолчанию - Не Максимизировано

**Решение:** По умолчанию окно открывается с компактным размером 800x600, но НЕ в maximized состоянии.

**Альтернативы:**
- Открывать окно в maximized состоянии
- Открывать окно в нормальном состоянии с фиксированным размером
- Открывать окно в полноэкранном режиме

**Обоснование:**
- Компактный размер оптимизирован для чатов с агентами (window-management.1.1)
- Позволяет пользователю сразу изменять размер окна (window-management.1.3)
- Позволяет пользователю максимизировать окно при желании (window-management.1.4)
- Сохраняет видимость системных элементов macOS (window-management.1.5)
- Не использует полноэкранный режим (window-management.1.2)

### Решение 5: Компактный Размер с Адаптацией

**Решение:** Использовать компактный размер 800x600 пикселей по умолчанию, с адаптацией к меньшим экранам: min(800, ширина) x min(600, высота).

**Альтернативы:**
- Использовать workAreaSize (весь экран)
- Использовать процент от размера экрана (например, 50%)

**Обоснование:**
- Адаптируется к любому размеру экрана (window-management.4.1, window-management.4.3)
- Компактный размер оптимален для фокуса на чатах (window-management.4.2)
- Центрирование обеспечивает хороший UX (window-management.4.4)
- Работает корректно на маленьких экранах

### Решение 6: Отслеживание Событий для Автосохранения

**Решение:** Подписываться на события `resize`, `move`, `maximize`, `unmaximize` для автоматического сохранения состояния.

**Альтернативы:**
- Сохранять состояние только при закрытии окна
- Использовать polling для проверки изменений

**Обоснование:**
- Гарантирует актуальность сохраненного состояния
- Обрабатывает все типы изменений состояния (window-management.5.1, window-management.5.2, window-management.5.3)
- Эффективно - сохранение только при изменениях
- Использует нативные события Electron

### Решение 7: Завершение Приложения при Закрытии Окна

**Решение:** Приложение завершается при закрытии всех окон независимо от платформы (macOS, Windows, Linux).

**Альтернативы:**
- Следовать стандартной конвенции macOS (приложение остается активным при закрытии окна)
- Добавить настройку для выбора поведения

**Обоснование:**
- Упрощает UX - пользователь ожидает, что закрытие окна завершает приложение (window-management.6.1)
- Предотвращает фоновые процессы после закрытия окна (window-management.6.2)
- Обеспечивает консистентное поведение на всех платформах
- Соответствует ожиданиям пользователей для однооконных приложений
- Гарантирует корректное сохранение данных перед выходом (window-management.6.3)
