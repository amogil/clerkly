# Документ Дизайна: UI Приложения

## Обзор

Данный документ описывает архитектуру и дизайн пользовательского интерфейса приложения Clerkly, включая управление главным окном, его конфигурацию при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

### Цели Дизайна

- Обеспечить нативный macOS опыт использования приложения
- Максимизировать использование экранного пространства при запуске (окно размером с workAreaSize)
- Обеспечить возможность изменения размера окна сразу после запуска
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
      resizable: true, // Requirements: ui.1.3
      
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

    // Note: We don't call maximize() here even if windowState.isMaximized is true
    // because on macOS, maximized windows cannot be resized by dragging edges.
    // The window will open with the saved size (or full workAreaSize by default),
    // which provides a large window that is still resizable.
    // If the user previously maximized the window, we restore that state after showing.
    // Requirements: ui.1.1, ui.1.3

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // Requirements: ui.5.4 - Restore maximized state if it was saved
      if (windowState.isMaximized) {
        this.mainWindow?.maximize();
      }
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

  // Requirements: ui.1.1, ui.1.3, ui.4.1, ui.4.2
  private getDefaultState(): WindowState {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Requirements: ui.1.1, ui.1.3, ui.4.1, ui.4.2, ui.4.3
    // Window opens at full workAreaSize but NOT in maximized state
    // This allows immediate resizing by dragging window edges
    return {
      x: 0,
      y: 0,
      width: width,
      height: height,
      isMaximized: false, // NOT maximized - window is resizable from the start
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

### Property 1: Окно открывается размером с workAreaSize, но не максимизировано

*Для любого* первого запуска приложения (когда сохраненное состояние отсутствует), окно должно иметь размер равный workAreaSize (весь экран минус системные элементы macOS), но НЕ находиться в maximized состоянии (isMaximized: false), чтобы пользователь мог сразу изменять его размер через перетаскивание краев окна.

**Validates: Requirements ui.1.1, ui.1.3**

### Property 2: Окно можно изменять в размере и максимизировать

*Для любого* созданного главного окна, флаг `resizable` должен быть установлен в `true`, позволяя пользователю изменять размер окна и максимизировать его через стандартные элементы управления macOS.

**Validates: Requirements ui.1.3, ui.1.4**

### Property 3: Окно имеет пустой заголовок

*Для любого* созданного главного окна, заголовок окна должен быть пустой строкой (`title: ''`).

**Validates: Requirements ui.2.1**

### Property 4: Окно использует нативные macOS элементы управления

*Для любого* созданного главного окна, параметр `titleBarStyle` должен быть установлен в `'default'`, обеспечивая использование стандартных элементов управления окном macOS.

**Validates: Requirements ui.2.3, ui.3.1**

### Property 5: Размер окна основан на размере экрана

*Для любого* первого запуска приложения (когда сохраненное состояние отсутствует), размеры окна по умолчанию должны быть равны workAreaSize (полный размер доступного экрана), а не использовать хардкоженные значения.

**Validates: Requirements ui.4.1, ui.4.3**

### Property 6: Изменения состояния окна сохраняются

*Для любого* изменения состояния окна (размер, позиция, состояние maximized), новое состояние должно быть сохранено в постоянное хранилище через `DataManager`.

**Validates: Requirements ui.5.1, ui.5.2, ui.5.3**

### Property 7: Round-trip сохранения и загрузки состояния

*Для любого* валидного состояния окна, сохранение состояния с последующей загрузкой должно возвращать эквивалентное состояние (с учетом валидации позиции).

**Validates: Requirements ui.5.4**

### Property 8: Автоматическое заполнение профиля после авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, Account Block должен автоматически заполниться данными профиля (имя, email), полученными из Google UserInfo API endpoint (`https://www.googleapis.com/oauth2/v1/userinfo`).

**Validates: Requirements ui.6.2, ui.6.6**

### Property 9: Отображение обязательных полей профиля

*Для любого* профиля пользователя, Account Block должен отображать поля "Name" (имя пользователя) и "Email" (email адрес).

**Validates: Requirements ui.6.3**

### Property 10: Read-only поля профиля

*Для любого* отображаемого профиля, все поля в Account Block должны иметь атрибут `readOnly` и не позволять пользователю редактировать данные.

**Validates: Requirements ui.6.4**

### Property 11: Автоматическое обновление при refresh token

*Для любого* авторизованного пользователя, при каждом успешном обновлении access token (refresh token operation), система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API и обновлять отображение в Account Block.

**Validates: Requirements ui.6.5**

### Property 12: Автоматическое обновление при запуске приложения

*Для любого* авторизованного пользователя, при запуске приложения система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API и отображать их в Account Block.

**Validates: Requirements ui.6.5**

### Property 13: Кэширование профиля при ошибках API

*Для любого* запроса к UserInfo API, если запрос не удается (ошибка сети, таймаут, ошибка сервера), Account Block должен продолжать отображать последние сохраненные данные профиля из локального кэша.

**Validates: Requirements ui.6.7**

### Property 14: Очистка профиля при logout

*Для любого* авторизованного пользователя, при выходе из системы (logout) Account Block должен очистить все данные профиля и вернуться к пустому состоянию.

**Validates: Requirements ui.6.8**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Маленький экран (ui.4.4)**: Когда размер экрана меньше стандартного, размеры окна должны адаптироваться к доступному пространству (workAreaSize) и не превышать размер экрана.

2. **Первый запуск (ui.5.5)**: Когда сохраненное состояние отсутствует, должно использоваться состояние по умолчанию с окном размером workAreaSize, но НЕ в maximized состоянии.

3. **Невалидная позиция (ui.5.6)**: Когда сохраненная позиция находится за пределами доступных экранов, должно использоваться состояние по умолчанию на основном экране.

4. **Не авторизован (ui.6.1)**: Когда пользователь не авторизован, Account Block должен отображать пустое состояние с сообщением "Not signed in".


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

#### 5. Ошибка получения профиля из Google API

**Причины:**
- Ошибка сети (нет интернета)
- Таймаут запроса
- Ошибка сервера Google (5xx)
- Невалидный access token
- Превышен лимит запросов API

**Обработка:**
```typescript
// Requirements: ui.6.7
async fetchProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`UserInfo API error: ${response.status}`);
    }
    
    const profile = await response.json();
    await this.saveProfile(profile);
    return profile;
  } catch (error) {
    console.error('[UserProfileManager] Failed to fetch profile:', error);
    // Return cached profile on error
    return await this.loadProfile();
  }
}
```

**Результат:** Возвращаются кэшированные данные профиля, пользователь продолжает видеть последние известные данные.

#### 6. Ошибка сохранения профиля

**Причины:**
- Ошибка записи в базу данных
- Недостаточно места на диске
- Проблемы с правами доступа

**Обработка:**
```typescript
// Requirements: ui.6.2
async saveProfile(profile: UserProfile): Promise<void> {
  try {
    await this.dataManager.saveData('user_profile', profile);
  } catch (error) {
    console.error('[UserProfileManager] Failed to save profile:', error);
    throw error; // Propagate error to caller
  }
}
```

**Результат:** Ошибка логируется и пробрасывается. Профиль не сохраняется в кэш, но текущая сессия продолжает работать с данными в памяти.

#### 7. Ошибка загрузки профиля из кэша

**Причины:**
- Поврежденные данные в базе данных
- Ошибка чтения из базы данных
- Несовместимый формат данных (после обновления приложения)

**Обработка:**
```typescript
// Requirements: ui.6.7
async loadProfile(): Promise<UserProfile | null> {
  try {
    const result = await this.dataManager.loadData('user_profile');
    if (result.success && result.data) {
      return result.data as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('[UserProfileManager] Failed to load profile:', error);
    return null; // Return null instead of throwing
  }
}
```

**Результат:** Возвращается null, компонент отображает пустое состояние. При следующем успешном запросе к API данные будут восстановлены.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики:

```typescript
// Window management errors
console.error('Failed to load window state:', error);
console.error('Failed to save window state:', error);
console.error('Failed to create window:', errorMessage);

// Profile management errors
console.error('[UserProfileManager] Failed to fetch profile:', error);
console.error('[UserProfileManager] Failed to save profile:', error);
console.error('[UserProfileManager] Failed to load profile:', error);
console.error('[UserProfileManager] Failed to clear profile:', error);

// IPC handler errors
console.error('[AuthIPCHandlers] Failed to get profile:', errorMessage);
console.error('[AuthIPCHandlers] Failed to refresh profile:', errorMessage);

// Component errors
console.error('[Account] Failed to load profile:', errorMessage);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace

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

### Функциональные Тесты (Window State)

```typescript
describe('Window UI Functional Tests - State Persistence', () => {
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
| ui.1.3 | ✓ | ✓ | ✓ |
| ui.1.4 | ✓ | - | ✓ |
| ui.1.5 | ✓ | - | - |
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
| ui.6.1 | ✓ (planned) | - | ✓ (planned) |
| ui.6.2 | ✓ (planned) | - | ✓ (planned) |
| ui.6.3 | ✓ (planned) | - | ✓ (planned) |
| ui.6.4 | ✓ (planned) | - | ✓ (planned) |
| ui.6.5 | ✓ (planned) | - | ✓ (planned) |
| ui.6.6 | ✓ (planned) | - | - |
| ui.6.7 | ✓ (planned) | - | - |
| ui.6.8 | ✓ (planned) | - | ✓ (planned) |

**Примечание:** Требования ui.6.x (Блок Account) находятся в стадии планирования. Детальная стратегия тестирования описана в секции "Тестирование Account Block" ниже.

### Критерии Успеха

- Все модульные тесты проходят
- Все property-based тесты проходят (минимум 100 итераций каждый)
- Покрытие кода минимум 85%
- Все требования покрыты тестами
- Все граничные случаи обработаны корректно

### Тестирование Account Block

#### Модульные Тесты для UserProfileManager

```typescript
describe('UserProfileManager', () => {
  /* Preconditions: OAuthClientManager returns valid tokens, Google UserInfo API mocked
     Action: call fetchProfile()
     Assertions: correct API request (URL, headers), profile data saved to DataManager
     Requirements: ui.6.2, ui.6.6 */
  it('should fetch profile from Google UserInfo API', async () => {
    // Тест успешного получения профиля
  });

  /* Preconditions: Google UserInfo API returns error, cached profile exists in DataManager
     Action: call fetchProfile()
     Assertions: returns cached profile data, error logged
     Requirements: ui.6.7 */
  it('should return cached profile on API error', async () => {
    // Тест возврата кэшированных данных при ошибке
  });

  /* Preconditions: OAuthClientManager returns null tokens
     Action: call fetchProfile()
     Assertions: returns null, no API request made
     Requirements: ui.6.1 */
  it('should return null when not authenticated', async () => {
    // Тест возврата null для неавторизованного пользователя
  });

  /* Preconditions: valid profile object
     Action: call saveProfile()
     Assertions: DataManager.saveData called with correct key and data
     Requirements: ui.6.2 */
  it('should save profile to DataManager', async () => {
    // Тест сохранения профиля
  });

  /* Preconditions: profile exists in DataManager
     Action: call loadProfile()
     Assertions: returns correct profile data
     Requirements: ui.6.7 */
  it('should load profile from DataManager', async () => {
    // Тест загрузки профиля
  });

  /* Preconditions: profile exists in DataManager
     Action: call clearProfile()
     Assertions: DataManager.deleteData called with correct key
     Requirements: ui.6.8 */
  it('should clear profile from DataManager', async () => {
    // Тест очистки профиля
  });

  /* Preconditions: UserProfileManager initialized
     Action: call updateProfileAfterTokenRefresh()
     Assertions: fetchProfile() called
     Requirements: ui.6.5 */
  it('should update profile after token refresh', async () => {
    // Тест обновления профиля после refresh token
  });
});
```

#### Модульные Тесты для IPC Handlers

```typescript
describe('AuthIPCHandlers - Profile', () => {
  /* Preconditions: UserProfileManager.loadProfile() returns profile
     Action: invoke 'auth:get-profile' handler
     Assertions: returns success response with profile data
     Requirements: ui.6.2 */
  it('should handle get-profile request', async () => {
    // Тест получения профиля через IPC
  });

  /* Preconditions: UserProfileManager.loadProfile() throws error
     Action: invoke 'auth:get-profile' handler
     Assertions: returns error response
     Requirements: ui.6.7 */
  it('should handle get-profile errors', async () => {
    // Тест обработки ошибок получения профиля
  });

  /* Preconditions: UserProfileManager.fetchProfile() returns updated profile
     Action: invoke 'auth:refresh-profile' handler
     Assertions: returns success response with fresh profile data
     Requirements: ui.6.5 */
  it('should handle refresh-profile request', async () => {
    // Тест обновления профиля через IPC
  });
});
```

#### Модульные Тесты для Account Component

```typescript
describe('Account Component', () => {
  /* Preconditions: window.api.auth.getProfile() returns null
     Action: render Account component
     Assertions: displays "Not signed in" message, no profile fields shown
     Requirements: ui.6.1 */
  it('should display empty state when not authenticated', () => {
    // Тест отображения пустого состояния
  });

  /* Preconditions: window.api.auth.getProfile() returns profile data
     Action: render Account component
     Assertions: displays name and email fields with correct values
     Requirements: ui.6.2, ui.6.3 */
  it('should display profile data after authentication', () => {
    // Тест отображения данных профиля
  });

  /* Preconditions: Account component rendered with profile data
     Action: inspect input fields
     Assertions: all input fields have readOnly attribute
     Requirements: ui.6.4 */
  it('should have read-only profile fields', () => {
    // Тест read-only полей
  });

  /* Preconditions: Account component mounted, auth:success event triggered
     Action: trigger auth:success event
     Assertions: getProfile() called again, UI updated with new data
     Requirements: ui.6.2 */
  it('should reload profile on auth success event', () => {
    // Тест перезагрузки профиля при успешной авторизации
  });

  /* Preconditions: Account component with profile data, logout triggered
     Action: trigger logout event
     Assertions: component returns to empty state, profile data cleared
     Requirements: ui.6.8 */
  it('should clear profile on logout', () => {
    // Тест очистки профиля при logout
  });
});
```

#### Функциональные Тесты (Profile Integration)

```typescript
describe('Account Functional Tests - Profile Integration', () => {
  /* Preconditions: real OAuthClientManager and UserProfileManager, mocked Google APIs
     Action: perform OAuth login, wait for profile fetch
     Assertions: profile automatically loaded, data saved to DataManager
     Requirements: ui.6.2, ui.6.6 */
  it('should load profile after OAuth login', async () => {
    // Тест полного цикла авторизации и загрузки профиля
  });

  /* Preconditions: expired access token, valid refresh token
     Action: trigger token refresh
     Assertions: profile automatically updated after refresh
     Requirements: ui.6.5 */
  it('should update profile after token refresh', async () => {
    // Тест автоматического обновления при refresh token
  });

  /* Preconditions: authenticated user, LifecycleManager initialized
     Action: call LifecycleManager.initialize()
     Assertions: profile automatically fetched on startup
     Requirements: ui.6.5 */
  it('should fetch profile on app startup', async () => {
    // Тест загрузки профиля при запуске
  });

  /* Preconditions: cached profile in DataManager, Google API returns error
     Action: call fetchProfile()
     Assertions: returns cached data, no exception thrown
     Requirements: ui.6.7 */
  it('should use cached profile on API error', async () => {
    // Тест использования кэша при ошибке API
  });
});
```

#### Функциональные Тесты

```typescript
describe('Account Functional Tests', () => {
  /* Preconditions: fresh app start, no authentication
     Action: launch app, navigate to Account block
     Assertions: displays empty state with "Not signed in"
     Requirements: ui.6.1 */
  it('should show empty profile when not authenticated', async () => {
    // Функциональный тест пустого состояния
  });

  /* Preconditions: fresh app start
     Action: perform Google OAuth login, check Account block
     Assertions: Account block populated with name and email from Google
     Requirements: ui.6.2, ui.6.3 */
  it('should populate profile after Google OAuth login', async () => {
    // Функциональный тест заполнения профиля
  });

  /* Preconditions: authenticated user with profile displayed
     Action: attempt to edit profile fields
     Assertions: fields are read-only, cannot be edited
     Requirements: ui.6.4 */
  it('should not allow editing profile fields', async () => {
    // Функциональный тест read-only полей
  });

  /* Preconditions: authenticated user, profile data changed in Google (mocked)
     Action: wait for token refresh or trigger manually
     Assertions: Account block displays updated data
     Requirements: ui.6.5 */
  it('should update profile when changed in Google', async () => {
    // Функциональный тест обновления профиля
  });

  /* Preconditions: authenticated user with profile displayed
     Action: perform logout
     Assertions: Account block cleared, returns to empty state
     Requirements: ui.6.8 */
  it('should clear profile on logout', async () => {
    // Функциональный тест очистки при logout
  });
});
```

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

### Решение 4: Состояние по Умолчанию - Не Максимизировано

**Решение:** По умолчанию окно открывается размером с workAreaSize, но НЕ в maximized состоянии.

**Альтернативы:**
- Открывать окно в maximized состоянии
- Открывать окно в нормальном состоянии с фиксированным размером
- Открывать окно в полноэкранном режиме

**Обоснование:**
- Максимизирует использование экранного пространства (ui.1.1)
- Позволяет пользователю сразу изменять размер окна (ui.1.3)
- Позволяет пользователю максимизировать окно при желании (ui.1.4)
- Сохраняет видимость системных элементов macOS (ui.1.5)
- Не использует полноэкранный режим (ui.1.2)

### Решение 5: Размеры на Основе workAreaSize

**Решение:** Использовать workAreaSize (полный размер доступного экрана) для размеров окна по умолчанию.

**Альтернативы:**
- Использовать фиксированные размеры (например, 1920x1080)
- Использовать процент от размера экрана (например, 90%)

**Обоснование:**
- Адаптируется к любому размеру экрана (ui.4.1, ui.4.4)
- Не использует хардкоженные размеры (ui.4.3)
- Максимизирует использование пространства (ui.1.1)
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

### Решение 7: Стратегия Обновления Профиля

**Решение:** Использовать **комбинированный подход** - обновление при запуске приложения И при каждом refresh token.

**Альтернативы:**
- Только при запуске приложения
- Только при refresh token
- Ручное обновление по кнопке
- Периодический polling (каждые N минут)

**Обоснование:**
- Соответствует требованию ui.6.5 о автоматическом обновлении
- Обеспечивает максимальную актуальность данных
- Покрывает оба сценария: длительная работа приложения (обновление каждый час) и перезапуски (обновление при старте)
- Не требует действий от пользователя
- Дополнительные API запросы (при старте + каждый час) - приемлемая нагрузка для актуальности данных
- Интегрируется с существующими механизмами (lifecycle и token refresh)
- Оптимальный баланс между актуальностью и нагрузкой на Google API

### Решение 8: Хранение Данных Профиля

**Решение:** Хранить данные профиля в SQLite через существующий DataManager с ключом `user_profile`.

**Альтернативы:**
- Создать отдельную таблицу для профилей
- Хранить в файловой системе (JSON файл)
- Хранить только в памяти (без персистентности)

**Обоснование:**
- Использует существующую инфраструктуру
- Обеспечивает персистентность между запусками
- Позволяет отображать кэшированные данные при ошибках API (ui.6.7)
- Легко очищается при logout (ui.6.8)
- Транзакционность и надежность SQLite
- Не требуется создание новых таблиц
- Единая точка доступа к данным

### Решение 9: Read-Only Поля

**Решение:** Использовать HTML атрибут `readOnly` для полей ввода.

**Альтернативы:**
- Использовать disabled атрибут
- Отображать данные как обычный текст (не input)
- Использовать CSS pointer-events: none

**Обоснование:**
- Соответствует требованию ui.6.4
- Визуально показывает, что поля не редактируемые
- Позволяет копировать текст из полей (в отличие от disabled)
- Поля остаются доступными для screen readers
- Стандартный HTML подход
- Лучшая accessibility по сравнению с disabled

### Решение 10: Интеграция с OAuth через Dependency Injection

**Решение:** Передавать OAuthClientManager в конструктор UserProfileManager и использовать метод `setProfileManager()` для обратной связи.

**Альтернативы:**
- Использовать глобальный singleton
- Использовать event emitter для связи компонентов
- Прямой импорт и использование модулей

**Обоснование:**
- Явные зависимости упрощают тестирование
- Легко мокировать зависимости в тестах
- Избегает циклических зависимостей
- Следует принципам SOLID (Dependency Inversion)
- Упрощает понимание потока данных
- Позволяет легко заменить реализацию

## Блок Account (Профиль Пользователя)

### Обзор

Блок Account отображает информацию о профиле пользователя, полученную из Google OAuth. Данные профиля автоматически синхронизируются с Google аккаунтом и не могут быть отредактированы пользователем в приложении.

### Архитектура Компонента

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ OAuthClientManager   │──────▶│ UserProfileManager  │     │
│  │                      │       │                     │     │
│  │ - refreshAccessToken()│       │ - fetchProfile()    │     │
│  │ - getAuthStatus()    │       │ - saveProfile()     │     │
│  └──────────────────────┘       │ - loadProfile()     │     │
│           │                      │ - clearProfile()    │     │
│           │                      └─────────────────────┘     │
│           │                                │                 │
│           ▼                                ▼                 │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ Google UserInfo API  │       │    DataManager      │     │
│  │ (HTTPS Request)      │       │     (SQLite)        │     │
│  └──────────────────────┘       └─────────────────────┘     │
│           │                                │                 │
└───────────┼────────────────────────────────┼─────────────────┘
            │                                │
            ▼                                ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │     Account Component          │         │
   │  │                                │         │
   │  │  - Display name                │         │
   │  │  - Display email               │         │
   │  │  - Read-only fields            │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Компоненты

#### UserProfileManager

Новый класс для управления данными профиля пользователя.

```typescript
// Requirements: ui.6.2, ui.6.3, ui.6.5, ui.6.6, ui.6.7, ui.6.8

interface UserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  locale: string;
  picture?: string; // Optional: URL to profile picture
  lastUpdated: number; // Unix timestamp
}

class UserProfileManager {
  private dataManager: DataManager;
  private oauthClient: OAuthClientManager;
  private readonly profileKey = 'user_profile';
  
  constructor(dataManager: DataManager, oauthClient: OAuthClientManager) {
    this.dataManager = dataManager;
    this.oauthClient = oauthClient;
  }

  /**
   * Fetch user profile from Google UserInfo API
   * Requirements: ui.6.2, ui.6.6
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      // Requirements: ui.6.6 - Check authentication status
      const authStatus = await this.oauthClient.getAuthStatus();
      if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
        console.log('[UserProfileManager] Not authenticated, cannot fetch profile');
        return null;
      }

      // Requirements: ui.6.6 - Use Google UserInfo API endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${authStatus.tokens.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`UserInfo API error: ${response.status} ${response.statusText}`);
      }

      const profileData = await response.json();
      const profile: UserProfile = {
        ...profileData,
        lastUpdated: Date.now()
      };

      // Requirements: ui.6.2 - Save to local storage
      await this.saveProfile(profile);
      
      console.log('[UserProfileManager] Profile fetched and saved successfully');
      return profile;
    } catch (error) {
      console.error('[UserProfileManager] Failed to fetch profile:', error);
      // Requirements: ui.6.7 - Return cached profile on error
      return await this.loadProfile();
    }
  }

  /**
   * Save user profile to local storage
   * Requirements: ui.6.2
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    try {
      await this.dataManager.saveData(this.profileKey, profile);
      console.log('[UserProfileManager] Profile saved to local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to save profile:', error);
      throw error;
    }
  }

  /**
   * Load user profile from local storage
   * Requirements: ui.6.7
   */
  async loadProfile(): Promise<UserProfile | null> {
    try {
      const result = await this.dataManager.loadData(this.profileKey);
      if (result.success && result.data) {
        console.log('[UserProfileManager] Profile loaded from local storage');
        return result.data as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('[UserProfileManager] Failed to load profile:', error);
      return null;
    }
  }

  /**
   * Clear user profile from local storage
   * Requirements: ui.6.8
   */
  async clearProfile(): Promise<void> {
    try {
      await this.dataManager.deleteData(this.profileKey);
      console.log('[UserProfileManager] Profile cleared from local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to clear profile:', error);
      throw error;
    }
  }

  /**
   * Update profile after token refresh
   * Called automatically by OAuthClientManager after successful token refresh
   * Requirements: ui.6.5
   */
  async updateProfileAfterTokenRefresh(): Promise<void> {
    console.log('[UserProfileManager] Updating profile after token refresh');
    await this.fetchProfile();
  }
}
```

#### IPC Handlers для Profile

Расширение `AuthIPCHandlers` для работы с профилем пользователя.

```typescript
// Requirements: ui.6.2, ui.6.5, ui.6.8

interface IPCResult {
  success: boolean;
  profile?: UserProfile | null;
  error?: string;
}

class AuthIPCHandlers {
  private profileManager: UserProfileManager;

  constructor(profileManager: UserProfileManager) {
    this.profileManager = profileManager;
  }

  /**
   * Register profile-related IPC handlers
   * Should be called during app initialization
   */
  registerProfileHandlers(): void {
    ipcMain.handle('auth:get-profile', this.handleGetProfile.bind(this));
    ipcMain.handle('auth:refresh-profile', this.handleRefreshProfile.bind(this));
    console.log('[AuthIPCHandlers] Profile handlers registered');
  }

  /**
   * Handle get profile request
   * Returns cached profile from local storage
   * Requirements: ui.6.2, ui.6.7
   */
  private async handleGetProfile(): Promise<IPCResult> {
    try {
      const profile = await this.profileManager.loadProfile();
      return {
        success: true,
        profile: profile
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to get profile:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Handle refresh profile request
   * Fetches fresh profile data from Google API
   * Requirements: ui.6.5
   */
  private async handleRefreshProfile(): Promise<IPCResult> {
    try {
      const profile = await this.profileManager.fetchProfile();
      return {
        success: true,
        profile: profile
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to refresh profile:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
```

#### Account Component (Renderer)

React компонент для отображения профиля пользователя.

```typescript
// Requirements: ui.6.1, ui.6.2, ui.6.3, ui.6.4, ui.6.8

import { useState, useEffect } from 'react';

interface UserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  locale: string;
  picture?: string;
  lastUpdated: number;
}

interface AccountProps {
  className?: string;
}

export function Account({ className }: AccountProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load profile on mount
    loadProfile();
    
    // Requirements: ui.6.2 - Listen for auth success to reload profile
    const unsubscribeAuthSuccess = window.api.auth.onAuthSuccess(() => {
      console.log('[Account] Auth success event received, reloading profile');
      loadProfile();
    });

    // Requirements: ui.6.8 - Listen for logout to clear profile
    const unsubscribeLogout = window.api.auth.onLogout(() => {
      console.log('[Account] Logout event received, clearing profile');
      setProfile(null);
      setError(null);
    });

    return () => {
      unsubscribeAuthSuccess();
      unsubscribeLogout();
    };
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.auth.getProfile();
      if (result.success && result.profile) {
        setProfile(result.profile);
        console.log('[Account] Profile loaded successfully');
      } else if (result.error) {
        setError(result.error);
        console.error('[Account] Failed to load profile:', result.error);
      } else {
        // Not authenticated
        setProfile(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[Account] Failed to load profile:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Requirements: ui.6.1 - Display empty state when not authenticated
  if (loading) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-loading">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-error">
          <p>Error loading profile: {error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-empty">
          <p>Not signed in</p>
        </div>
      </div>
    );
  }

  // Requirements: ui.6.3, ui.6.4 - Display name and email as read-only fields
  return (
    <div className={`account-block ${className || ''}`}>
      <div className="profile-info">
        {profile.picture && (
          <div className="profile-picture">
            <img src={profile.picture} alt={profile.name} />
          </div>
        )}
        <div className="profile-fields">
          <div className="profile-field">
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              readOnly
              className="profile-input"
            />
          </div>
          <div className="profile-field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="text"
              value={profile.email}
              readOnly
              className="profile-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Ключевые особенности:**
- Автоматическая загрузка профиля при монтировании компонента
- Слушатели событий для auth:success и logout
- Отображение состояний: loading, error, empty (не авторизован), filled (с данными)
- Read-only поля для имени и email (ui.6.4)
- Опциональное отображение аватара пользователя
- Очистка подписок при размонтировании компонента
```

### Стратегии Обновления Профиля

**Важное ограничение:** Google не предоставляет webhook/push notifications для изменений профиля обычных пользователей. Push notifications доступны только в Google Workspace Admin API для корпоративных аккаунтов. Для личных Google аккаунтов необходимо использовать polling (периодические запросы к API).

#### Комбинированный подход: Обновление при запуске + при refresh token (Выбранная стратегия)

**Реализация:**

**1. Интеграция с LifecycleManager (обновление при запуске):**

```typescript
// Requirements: ui.6.5
// In src/main/LifecycleManager.ts

class LifecycleManager {
  private profileManager: UserProfileManager;
  private oauthClient: OAuthClientManager;

  constructor(
    dataManager: DataManager,
    oauthClient: OAuthClientManager,
    // ... other dependencies
  ) {
    this.oauthClient = oauthClient;
    this.profileManager = new UserProfileManager(dataManager, oauthClient);
    // ... other initializations
  }

  async initialize(): Promise<void> {
    console.log('[LifecycleManager] Initializing application');
    
    // ... existing initialization logic ...
    
    // Requirements: ui.6.5 - Fetch profile on startup if authenticated
    const authStatus = await this.oauthClient.getAuthStatus();
    if (authStatus.authorized) {
      console.log('[LifecycleManager] User authenticated, fetching profile');
      await this.profileManager.fetchProfile();
    } else {
      console.log('[LifecycleManager] User not authenticated, skipping profile fetch');
    }
    
    console.log('[LifecycleManager] Initialization complete');
  }
}
```

**2. Интеграция с OAuthClientManager (обновление при refresh token):**

```typescript
// Requirements: ui.6.5
// In src/main/auth/OAuthClientManager.ts

class OAuthClientManager {
  private profileManager: UserProfileManager | null = null;

  /**
   * Set profile manager for automatic profile updates
   * Should be called during initialization
   */
  setProfileManager(profileManager: UserProfileManager): void {
    this.profileManager = profileManager;
    console.log('[OAuthClientManager] Profile manager set for automatic updates');
  }

  async refreshAccessToken(): Promise<boolean> {
    console.log('[OAuthClientManager] Refreshing access token');
    
    // ... existing token refresh logic ...
    
    if (refreshed) {
      console.log('[OAuthClientManager] Token refreshed successfully');
      
      // Requirements: ui.6.5 - Automatically update profile after token refresh
      if (this.profileManager) {
        console.log('[OAuthClientManager] Triggering profile update after token refresh');
        await this.profileManager.updateProfileAfterTokenRefresh();
      }
    }
    
    return refreshed;
  }
}
```

**3. Инициализация в Main Process:**

```typescript
// Requirements: ui.6.5
// In src/main/index.ts

async function initializeApp() {
  const dataManager = new DataManager(/* ... */);
  const oauthClient = new OAuthClientManager(/* ... */);
  const profileManager = new UserProfileManager(dataManager, oauthClient);
  
  // Connect profile manager to oauth client for automatic updates
  oauthClient.setProfileManager(profileManager);
  
  const lifecycleManager = new LifecycleManager(
    dataManager,
    oauthClient,
    profileManager,
    // ... other dependencies
  );
  
  await lifecycleManager.initialize();
}
```

**Преимущества:**
- Данные всегда актуальны (обновляются при запуске и каждый час)
- Не требует действий от пользователя
- Минимальная задержка при отображении (данные в кэше)
- Покрывает случаи длительной работы приложения и перезапусков
- Оптимальный баланс между актуальностью и нагрузкой на API

**Недостатки:**
- Дополнительный API запрос при запуске
- Дополнительный API запрос каждый час
- Небольшое увеличение времени запуска и refresh операции

**Частота обновлений:**
- При запуске приложения: 1 раз
- При работе приложения: каждый час (при refresh token)
- Итого: ~25 запросов в день при непрерывной работе приложения 24 часа

#### Альтернативный вариант: Ручное обновление (Не выбран)

**Реализация:**
```typescript
// Добавить кнопку "Refresh Profile" в UI
<button onClick={handleRefreshProfile}>
  Refresh Profile
</button>

const handleRefreshProfile = async () => {
  await window.api.auth.refreshProfile();
  await loadProfile();
};
```

**Преимущества:**
- Полный контроль пользователя
- Минимум API запросов
- Простая реализация

**Недостатки:**
- Требует действий от пользователя
- Данные могут быть устаревшими

### Решения по Дизайну Account Block

#### Решение 7: Стратегия Обновления Профиля

**Решение:** Использовать **комбинированный подход** - обновление при запуске приложения И при каждом refresh token.

**Обоснование:**
- Соответствует требованию ui.6.5 о автоматическом обновлении
- Обеспечивает максимальную актуальность данных
- Покрывает оба сценария: длительная работа приложения (обновление каждый час) и перезапуски (обновление при старте)
- Не требует действий от пользователя
- Дополнительные API запросы (при старте + каждый час) - приемлемая нагрузка для актуальности данных
- Интегрируется с существующими механизмами (lifecycle и token refresh)

#### Решение 8: Хранение Данных Профиля

**Решение:** Хранить данные профиля в SQLite через существующий DataManager с ключом `user_profile`.

**Обоснование:**
- Использует существующую инфраструктуру
- Обеспечивает персистентность между запусками
- Позволяет отображать кэшированные данные при ошибках API (ui.6.7)
- Легко очищается при logout (ui.6.8)

#### Решение 9: Read-Only Поля

**Решение:** Использовать HTML атрибут `readOnly` для полей ввода.

**Обоснование:**
- Соответствует требованию ui.6.4
- Визуально показывает, что поля не редактируемые
- Позволяет копировать текст из полей
- Стандартный HTML подход

## Заключение

Данный дизайн обеспечивает надежное управление UI приложения с фокусом на нативный macOS опыт, персистентность состояния и адаптивность к различным конфигурациям экранов. Архитектура разделяет ответственность между `WindowManager` (управление жизненным циклом окна) и `WindowStateManager` (управление персистентностью состояния), обеспечивая чистоту кода и легкость тестирования.

Блок Account интегрируется с существующей OAuth инфраструктурой и обеспечивает автоматическую синхронизацию данных профиля с Google аккаунтом пользователя. Комбинированная стратегия обновления (при запуске + при refresh token) гарантирует актуальность данных без необходимости действий от пользователя.

### Статус Реализации

**Фазы 1-2 (WindowManager, WindowStateManager):**
- ✅ Полностью реализованы
- ✅ Покрыты модульными, property-based и функциональными тестами
- ✅ Все требования ui.1.x - ui.5.x выполнены

**Фаза 3 (Account Block):**
- ⏳ В стадии планирования
- 📋 Требования ui.6.x определены
- 📐 Дизайн детализирован
- 📝 Задачи сформированы в tasks.md
- ⏸️ Ожидает начала реализации

### Следующие Шаги

1. Начать реализацию Фазы 3 согласно tasks.md (задачи 10-20)
2. Создать UserProfileManager с интеграцией в OAuth инфраструктуру
3. Расширить IPC handlers для работы с профилем
4. Создать Account React компонент
5. Написать модульные и функциональные тесты
6. Обновить таблицу покрытия требований после реализации
