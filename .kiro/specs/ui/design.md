# Документ Дизайна: UI Приложения

## Обзор

Данный документ описывает архитектуру и дизайн пользовательского интерфейса приложения Clerkly, включая управление главным окном, его конфигурацию при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DataManager) является единственным источником истины для всех данных приложения**.

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

### Архитектурный Принцип: Управление Токенами и Авторизацией

Приложение следует строгим правилам управления токенами авторизации и обработки ошибок авторизации:

**Ключевые правила:**

1. **Автоматическое обновление токенов**: Когда access token истекает (expires_in), система автоматически обновляет его через refresh token без участия пользователя. Это происходит в фоновом режиме через `OAuthClientManager.refreshAccessToken()`.

2. **Обработка ошибок авторизации**: При получении ошибки авторизации (HTTP 401 Unauthorized) от любого API (Google UserInfo, Calendar, Tasks и т.д.), система должна:
   - Немедленно очистить все токены из хранилища
   - Показать экран логина (LoginError компонент с errorCode 'invalid_grant')
   - Пользователь может повторно авторизоваться через кнопку "Continue with Google"
   - **Примечание**: Данные пользователя в базе данных НЕ очищаются - они сохраняются для отображения при следующей авторизации

3. **Централизованная обработка**: Все API запросы должны проходить через централизованный обработчик ошибок, который проверяет статус авторизации и выполняет необходимые действия при ошибках 401.

**Поток обработки ошибки авторизации:**
```
API Request → HTTP 401 → Clear Tokens → Show LoginError Component → Redirect to OAuth
```

**Поток автоматического обновления токена:**
```
Token Expiring → OAuthClientManager.refreshAccessToken() → Update Tokens in Storage → Continue Operation
```

Эти правила обеспечивают:
- Безопасность: Немедленное прекращение доступа при невалидных токенах
- Прозрачность: Автоматическое обновление токенов без прерывания работы пользователя
- Понятность: Четкое сообщение пользователю о необходимости повторной авторизации
- Консистентность: Единый подход к обработке ошибок авторизации во всем приложении

### Цели Дизайна

- Обеспечить нативный macOS опыт использования приложения
- Максимизировать использование экранного пространства при запуске (окно размером с workAreaSize)
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

### Property 8: Показ экрана логина для неавторизованных пользователей

*Для любого* пользователя, который не авторизован, приложение должно показывать экран логина, и пользователь НЕ МОЖЕТ попасть в Settings (где находится Account Block) без авторизации.

**Validates: Requirements ui.8.1, ui.8.2**

### Property 9: Показ Dashboard после успешной авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, приложение должно показывать Dashboard (главный экран), а не Account Block или Settings.

**Validates: Requirements ui.8.3**

### Property 10: Фоновая загрузка профиля после авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, система должна автоматически начать загрузку данных профиля из Google UserInfo API в фоновом режиме.

**Validates: Requirements ui.6.3**

### Property 11: Отображение сохраненных данных во время загрузки

*Для любого* запроса данных профиля, пока данные загружаются, Account Block должен отображать предыдущие значения профиля (если они существуют в локальной базе данных) или пустые поля (если это первая авторизация).

**Validates: Requirements ui.6.1**

### Property 12: Отображение актуальных данных профиля при успешной загрузке

*Для любого* успешного запроса к UserInfo API, полученные данные профиля должны быть отображены в Account Block (имя, email).

**Validates: Requirements ui.6.1**

### Property 13: Сохранение данных профиля при успешной загрузке

*Для любого* успешного запроса к UserInfo API, полученные данные профиля должны быть сохранены в локальную базу данных (SQLite через DataManager).

**Validates: Requirements ui.6.3**

### Property 14: Сохранение данных из базы при ошибке загрузки

*Для любого* неудачного запроса к UserInfo API (ошибка сети, таймаут, ошибка сервера), Account Block должен показать сообщение об ошибке и сохранить данные из локальной базы данных (предыдущие значения или пустые поля), НЕ очищая существующие данные профиля.

**Validates: Requirements ui.6.1**

### Property 15: Отображение обязательных полей профиля

*Для любого* профиля пользователя, Account Block должен отображать поля "Name" (имя пользователя) и "Email" (email адрес).

**Validates: Requirements ui.6.1**

### Property 16: Read-only поля профиля

*Для любого* отображаемого профиля, все поля в Account Block должны иметь атрибут `readOnly` и не позволять пользователю редактировать данные.

**Validates: Requirements ui.6.2**

### Property 17: Автоматическое обновление при refresh token

*Для любого* авторизованного пользователя, при каждом успешном обновлении access token (refresh token operation), система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API и обновлять отображение в Account Block.

**Validates: Requirements ui.6.3**

### Property 18: Автоматическое обновление при запуске приложения

*Для любого* авторизованного пользователя, при запуске приложения система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API и отображать их в Account Block.

**Validates: Requirements ui.6.3**

### Property 19: Очистка токенов и показ экрана логина при logout

*Для любого* авторизованного пользователя, при выходе из системы (logout) приложение должно показать экран логина, очистить все данные профиля из памяти (UI state), и очистить все токены авторизации. Данные профиля в базе данных сохраняются для отображения при следующей авторизации.

**Validates: Requirements ui.8.4, google-oauth-auth.15**

### Property 20: Показ уведомления при ошибке фонового процесса

*Для любой* ошибки, возникающей в фоновом процессе (загрузка данных, синхронизация, API запрос), приложение должно показать уведомление об ошибке пользователю.

**Validates: Requirements ui.7.1**

### Property 21: Содержимое уведомления об ошибке

*Для любого* уведомления об ошибке, оно должно содержать краткое описание проблемы И контекст операции (что пыталось выполниться).

**Validates: Requirements ui.7.2**

### Property 22: Автоматическое исчезновение уведомления

*Для любого* показанного уведомления об ошибке, оно должно автоматически исчезнуть через 15 секунд ИЛИ при клике пользователя на уведомление.

**Validates: Requirements ui.7.3**

### Property 23: Логирование ошибок в консоль

*Для любой* ошибки в приложении, она должна быть залогирована в консоль с достаточным контекстом для отладки.

**Validates: Requirements ui.7.4**

### Property 24: Показ экрана логина для неавторизованных пользователей

*Для любого* пользователя, который не авторизован, приложение должно показывать экран логина при запуске или при попытке доступа к приложению.

**Validates: Requirements ui.8.1**

### Property 25: Блокировка доступа к защищенным экранам

*Для любого* неавторизованного пользователя, попытка доступа к защищенным экранам (Dashboard, Settings, Tasks, Calendar, Contacts) должна быть заблокирована, и пользователь должен быть перенаправлен на экран логина.

**Validates: Requirements ui.8.2**

### Property 26: Перенаправление на Dashboard после успешной авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, приложение должно автоматически перенаправить пользователя на Dashboard (главный экран приложения).

**Validates: Requirements ui.8.3**

### Property 27: Перенаправление на Login после logout

*Для любого* авторизованного пользователя, при выходе из системы (logout) приложение должно автоматически перенаправить пользователя на экран логина.

**Validates: Requirements ui.8.4**

### Property 28: Автоматическое обновление токена при истечении

*Для любого* access token, который истекает (expires_in), система должна автоматически обновить его через refresh token в фоновом режиме без участия пользователя, и пользователь должен продолжать работу без прерываний.

**Validates: Requirements ui.9.1, ui.9.2**

### Property 29: Очистка токенов при ошибке авторизации

*Для любого* API запроса, который возвращает HTTP 401 Unauthorized, система должна немедленно очистить все токены из хранилища и показать экран логина (LoginError компонент с errorCode 'invalid_grant'). Данные пользователя в базе данных НЕ очищаются и сохраняются для отображения при следующей авторизации.

**Validates: Requirements ui.9.3**

### Property 30: Централизованная обработка ошибок авторизации

*Для любого* API запроса к внешним сервисам (Google UserInfo, Calendar, Tasks и т.д.), запрос должен проходить через централизованный обработчик, который проверяет статус HTTP 401 и выполняет необходимые действия по очистке сессии.

**Validates: Requirements ui.9.4**

### Property 31: Логирование ошибок авторизации с контекстом

*Для любой* ошибки авторизации (HTTP 401), система должна залогировать событие с контекстом (какой API запрос вызвал ошибку, timestamp, URL), но показать пользователю только понятное сообщение без технических деталей.

**Validates: Requirements ui.9.5, ui.9.6**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Маленький экран (ui.4.4)**: Когда размер экрана меньше стандартного, размеры окна должны адаптироваться к доступному пространству (workAreaSize) и не превышать размер экрана.

2. **Первый запуск (ui.5.5)**: Когда сохраненное состояние отсутствует, должно использоваться состояние по умолчанию с окном размером workAreaSize, но НЕ в maximized состоянии.

3. **Невалидная позиция (ui.5.6)**: Когда сохраненная позиция находится за пределами доступных экранов, должно использоваться состояние по умолчанию на основном экране.

4. **Не авторизован (ui.8.1, ui.8.2)**: Когда пользователь не авторизован, приложение показывает экран логина, и пользователь НЕ МОЖЕТ попасть в Settings (где находится Account Block). Это не edge case для Account компонента, так как компонент не должен быть доступен неавторизованным пользователям.

5. **Первая авторизация (ui.6.1, ui.6.3)**: Когда пользователь авторизуется впервые и в локальной базе данных нет данных профиля, Account Block должен отображать пустые поля во время загрузки данных профиля, затем заполниться актуальными данными после успешной загрузки.

6. **Ошибка загрузки профиля (ui.6.1, ui.6.3)**: Когда загрузка данных профиля не удается (ошибка сети, таймаут, ошибка API), Account Block должен показать сообщение об ошибке и сохранить данные из локальной базы данных (предыдущие значения или пустые поля), НЕ очищая существующие данные.

7. **Повторная авторизация с сохраненными данными (ui.6.1, ui.6.3)**: Когда пользователь авторизуется повторно и в локальной базе данных есть данные профиля, Account Block должен отображать сохраненные данные во время загрузки новых данных, затем обновиться актуальными данными после успешной загрузки.

8. **Истечение access token (ui.9.1, ui.9.2)**: Когда access token истекает во время работы приложения, система должна автоматически обновить его через refresh token в фоновом режиме. Пользователь продолжает работу без прерываний, уведомлений или видимых изменений в UI.

9. **Истечение refresh token (ui.9.3)**: Когда refresh token также становится невалидным (истек или был отозван), любой API запрос вернет HTTP 401. Система должна немедленно очистить все токены, показать экран логина (LoginError компонент с errorCode 'invalid_grant') и пользователь может повторно авторизоваться через кнопку "Continue with Google". Данные пользователя в базе данных НЕ очищаются и сохраняются для отображения при следующей авторизации.

10. **Ошибка 401 во время фоновой операции (ui.9.3, ui.9.4)**: Когда фоновый процесс (например, автоматическая синхронизация календаря) получает HTTP 401, система должна обработать это так же, как и для пользовательских запросов: очистить токены, показать экран логина (LoginError компонент) с ошибкой, перенаправить на авторизацию. Данные пользователя в базе данных сохраняются.

11. **Множественные одновременные запросы с ошибкой 401 (ui.9.4)**: Когда несколько API запросов одновременно получают HTTP 401 (например, при загрузке профиля, календаря и задач), централизованный обработчик должен выполнить очистку токенов только один раз, избегая дублирования действий и race conditions. Данные пользователя в базе данных сохраняются.

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
// Requirements: ui.6.1, ui.6.3
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
// Requirements: ui.6.1
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

#### 8. Ошибка авторизации (HTTP 401 Unauthorized)

**Причины:**
- Access token истек и refresh token также невалиден
- Токены были отозваны пользователем в настройках Google аккаунта
- Токены были удалены или повреждены в локальном хранилище
- Изменились права доступа приложения в Google

**Обработка:**
```typescript
// Централизованный обработчик API запросов
async function handleAPIRequest(url: string, options: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    // Check for authorization error
    if (response.status === 401) {
      console.error('[API] Authorization error (401), clearing tokens and showing login');
      
      // Clear all tokens
      await window.api.auth.clearTokens();
      
      // Show LoginError component with session expired message
      // This will trigger the App component to show LoginError with:
      // errorCode: 'invalid_grant' (maps to "Session expired" message in English)
      window.api.auth.emitAuthError('Session expired', 'invalid_grant');
      
      throw new Error('Authorization failed: Session expired');
    }
    
    return response;
  } catch (error) {
    console.error('[API] Request failed:', error);
    throw error;
  }
}

// В UserProfileManager
async fetchProfile(): Promise<UserProfile | null> {
  try {
    const authStatus = await this.oauthClient.getAuthStatus();
    if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
      return null;
    }

    // Use centralized handler that checks for 401
    const response = await handleAPIRequest(
      'https://www.googleapis.com/oauth2/v1/userinfo',
      {
        headers: { 'Authorization': `Bearer ${authStatus.tokens.accessToken}` }
      }
    );

    const profile = await response.json();
    await this.saveProfile(profile);
    return profile;
  } catch (error) {
    // If it's an auth error, tokens are already cleared
    // Return cached profile for other errors
    if (error.message?.includes('Authorization failed')) {
      return null;
    }
    return await this.loadProfile();
  }
}
```

**Результат:** 
- Все токены очищены из хранилища
- Пользователь перенаправлен на экран логина (LoginError компонент) с понятным сообщением об ошибке
- Данные пользователя в базе данных сохраняются и будут отображены при следующей авторизации
- Приложение готово к новой авторизации

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
| ui.6.1 | ✓ | - | ✓ |
| ui.6.2 | ✓ | - | ✓ |
| ui.6.3 | ✓ | - | ✓ |
| ui.7.1 | ✓ | - | ✓ |
| ui.7.2 | ✓ | - | ✓ |
| ui.7.3 | ✓ | - | ✓ |
| ui.7.4 | ✓ | - | - |
| ui.8.1 | ✓ | - | ✓ |
| ui.8.2 | ✓ | - | ✓ |
| ui.8.3 | ✓ | - | ✓ |
| ui.8.4 | ✓ | - | ✓ |
| ui.9.1 | ✓ | - | ✓ |
| ui.9.2 | ✓ | - | ✓ |
| ui.9.3 | ✓ | - | ✓ |
| ui.9.4 | ✓ | - | ✓ |
| ui.9.5 | ✓ | - | - |
| ui.9.6 | ✓ | - | ✓ |

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
     Requirements: ui.6.1, ui.6.3 */
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
     Requirements: ui.6.1 */
  it('should load profile from DataManager', async () => {
    // Тест загрузки профиля
  });

  /* Preconditions: profile exists in DataManager
     Action: call clearProfile()
     Assertions: DataManager.deleteData called with correct key
     Requirements: N/A (method exists but not currently used in application flow) */
  it('should clear profile from DataManager', async () => {
    // Тест очистки профиля (метод существует, но не используется в текущем flow)
  });

  /* Preconditions: UserProfileManager initialized
     Action: call updateProfileAfterTokenRefresh()
     Assertions: fetchProfile() called
     Requirements: ui.6.3 */
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
     Requirements: ui.6.1 */
  it('should handle get-profile errors', async () => {
    // Тест обработки ошибок получения профиля
  });

  /* Preconditions: UserProfileManager.fetchProfile() returns updated profile
     Action: invoke 'auth:refresh-profile' handler
     Assertions: returns success response with fresh profile data
     Requirements: ui.6.3 */
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
     Requirements: ui.6.1 
     Note: В реальном приложении пользователь не может попасть в Settings без авторизации,
     но компонент должен корректно обрабатывать случай отсутствия профиля */
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
     Requirements: ui.6.2 */
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
     Assertions: component returns to empty state (UI state cleared), profile data in database persists
     Requirements: ui.8.4, google-oauth-auth.15 */
  it('should clear profile from UI on logout', () => {
    // Тест очистки профиля из UI при logout
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
     Requirements: ui.6.3 */
  it('should update profile after token refresh', async () => {
    // Тест автоматического обновления при refresh token
  });

  /* Preconditions: authenticated user, LifecycleManager initialized
     Action: call LifecycleManager.initialize()
     Assertions: profile automatically fetched on startup
     Requirements: ui.6.3 */
  it('should fetch profile on app startup', async () => {
    // Тест загрузки профиля при запуске
  });

  /* Preconditions: cached profile in DataManager, Google API returns error
     Action: call fetchProfile()
     Assertions: returns cached data, no exception thrown
     Requirements: ui.6.1, ui.6.3 */
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
     Requirements: ui.6.2 */
  it('should not allow editing profile fields', async () => {
    // Функциональный тест read-only полей
  });

  /* Preconditions: authenticated user, profile data changed in Google (mocked)
     Action: wait for token refresh or trigger manually
     Assertions: Account block displays updated data
     Requirements: ui.6.3 */
  it('should update profile when changed in Google', async () => {
    // Функциональный тест обновления профиля
  });

  /* Preconditions: authenticated user with profile displayed
     Action: perform logout
     Assertions: Account block cleared from UI, returns to empty state, profile data in database persists
     Requirements: ui.8.4, google-oauth-auth.15 */
  it('should clear profile from UI on logout', async () => {
    // Функциональный тест очистки UI при logout
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

### Решение 11: Архитектура Навигации

**Решение:** Использовать комбинацию NavigationManager + AuthGuard + Router для управления навигацией и защиты маршрутов.

**Альтернативы:**
- Использовать только React Router с custom hooks
- Использовать глобальное состояние (Redux/Zustand) для навигации
- Проверять авторизацию в каждом компоненте отдельно

**Обоснование:**
- Централизованная логика навигации упрощает поддержку
- AuthGuard обеспечивает единую точку проверки авторизации (ui.8.2)
- Легко добавлять новые защищенные маршруты
- Явное разделение ответственности между компонентами
- Упрощает тестирование (можно мокировать NavigationManager)
- Интегрируется с OAuth событиями (auth:success, logout)

### Решение 12: Система Уведомлений об Ошибках

**Решение:** Использовать централизованный ErrorNotificationManager с IPC интеграцией для отображения ошибок из main process.

**Альтернативы:**
- Использовать готовую библиотеку toast notifications (react-toastify, sonner)
- Использовать глобальное состояние (Redux) для уведомлений
- Отображать ошибки только в консоли без UI уведомлений

**Обоснование:**
- Полный контроль над поведением уведомлений (ui.7.3 - автоматическое исчезновение через 15 секунд)
- Легко интегрируется с IPC для ошибок из main process (ui.7.1)
- Не добавляет внешних зависимостей
- Простая реализация с подпиской на изменения
- Легко тестировать (можно мокировать manager)
- Соответствует всем требованиям ui.7.x без необходимости адаптации сторонней библиотеки

### Решение 13: Формат Уведомлений об Ошибках

**Решение:** Уведомления содержат два поля: context (контекст операции) и message (описание ошибки).

**Альтернативы:**
- Только message без контекста
- Детальный stack trace в уведомлении
- Категоризация ошибок (error, warning, info)

**Обоснование:**
- Соответствует требованию ui.7.2 (контекст + описание)
- Контекст помогает пользователю понять, что пошло не так
- Message дает конкретное описание проблемы
- Не перегружает пользователя техническими деталями
- Stack trace логируется в консоль (ui.7.4), но не показывается пользователю
- Простой и понятный формат для пользователя

### Решение 14: Централизованный Обработчик API Запросов

**Решение:** Использовать централизованную функцию `handleAPIRequest()` для всех внешних API запросов, которая проверяет HTTP 401 и выполняет очистку сессии.

**Альтернативы:**
- Проверять статус 401 в каждом API вызове отдельно
- Использовать HTTP interceptors (axios/fetch interceptors)
- Обрабатывать ошибки авторизации на уровне компонентов

**Обоснование:**
- Единая точка обработки ошибок авторизации (ui.9.4)
- Гарантирует консистентное поведение для всех API запросов
- Предотвращает дублирование логики очистки сессии
- Легко тестировать (один обработчик вместо множества)
- Упрощает добавление новых API endpoints
- Предотвращает race conditions при множественных одновременных 401 ошибках
- Централизованное логирование всех ошибок авторизации (ui.9.5)

### Решение 15: Автоматическое Обновление Токенов

**Решение:** Использовать проактивное обновление токенов через `OAuthClientManager.refreshAccessToken()` перед истечением срока действия (за 5 минут до expires_in).

**Альтернативы:**
- Обновлять токен только при получении 401 ошибки (реактивный подход)
- Обновлять токен при каждом API запросе
- Использовать фиксированный интервал обновления (например, каждые 30 минут)

**Обоснование:**
- Проактивный подход предотвращает ошибки 401 во время работы пользователя (ui.9.1, ui.9.2)
- Пользователь не испытывает прерываний в работе
- Уменьшает количество ошибок и повторных запросов
- Обновление за 5 минут до истечения дает запас времени на случай сетевых задержек
- Интегрируется с существующим механизмом refresh в OAuthClientManager
- Не создает избыточной нагрузки на Google Token API

### Решение 16: Сообщение об Истечении Сессии

**Решение:** Показывать пользователю понятное сообщение "Сессия истекла. Пожалуйста, войдите снова." вместо технических деталей ошибки.

**Альтернативы:**
- Показывать полный текст ошибки HTTP 401
- Показывать код ошибки и stack trace
- Не показывать сообщение, только перенаправлять на логин

**Обоснование:**
- Соответствует требованию ui.9.6 (не показывать технические детали)
- Понятно обычному пользователю без технических знаний
- Объясняет, что произошло и что нужно делать
- Не пугает пользователя техническими терминами
- Технические детали логируются в консоль для отладки (ui.9.5)
- Соответствует best practices UX для сообщений об ошибках

## Навигация и Авторизация

### Обзор

Система навигации управляет переходами между экранами приложения в зависимости от статуса авторизации пользователя. Неавторизованные пользователи видят только экран логина, авторизованные получают доступ ко всем функциям приложения.

### Архитектура Навигации

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐                                    │
│  │ OAuthClientManager   │                                    │
│  │                      │                                    │
│  │ - getAuthStatus()    │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │ IPC: auth:status
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │     NavigationManager          │         │
   │  │                                │         │
   │  │  - checkAuthStatus()           │         │
   │  │  - redirectToLogin()           │         │
   │  │  - redirectToDashboard()       │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │        AuthGuard               │         │
   │  │                                │         │
   │  │  - canActivate()               │         │
   │  │  - protectedRoutes[]           │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │         Router                 │         │
   │  │                                │         │
   │  │  - /login                      │         │
   │  │  - /dashboard (protected)      │         │
   │  │  - /settings (protected)       │         │
   │  │  - /tasks (protected)          │         │
   │  │  - /calendar (protected)       │         │
   │  │  - /contacts (protected)       │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Компоненты Навигации

#### NavigationManager

Класс для управления навигацией и перенаправлениями.

```typescript
// Requirements: ui.8.1, ui.8.3, ui.8.4

class NavigationManager {
  private router: Router;
  
  constructor(router: Router) {
    this.router = router;
  }

  /**
   * Check authentication status and redirect if needed
   * Requirements: ui.8.1
   */
  async checkAuthStatus(): Promise<boolean> {
    try {
      const result = await window.api.auth.getAuthStatus();
      return result.authorized;
    } catch (error) {
      console.error('[NavigationManager] Failed to check auth status:', error);
      return false;
    }
  }

  /**
   * Redirect to login screen
   * Requirements: ui.8.1, ui.8.4
   */
  redirectToLogin(): void {
    console.log('[NavigationManager] Redirecting to login');
    this.router.navigate('/login');
  }

  /**
   * Redirect to dashboard
   * Requirements: ui.8.3
   */
  redirectToDashboard(): void {
    console.log('[NavigationManager] Redirecting to dashboard');
    this.router.navigate('/dashboard');
  }

  /**
   * Initialize navigation on app start
   * Requirements: ui.8.1, ui.8.3
   */
  async initialize(): Promise<void> {
    const isAuthenticated = await this.checkAuthStatus();
    
    if (!isAuthenticated) {
      this.redirectToLogin();
    } else {
      // If already on login screen, redirect to dashboard
      if (this.router.currentRoute === '/login') {
        this.redirectToDashboard();
      }
    }
  }
}
```

#### AuthGuard

Компонент для защиты маршрутов от неавторизованного доступа.

```typescript
// Requirements: ui.8.2

class AuthGuard {
  private navigationManager: NavigationManager;
  private protectedRoutes: string[] = [
    '/dashboard',
    '/settings',
    '/tasks',
    '/calendar',
    '/contacts'
  ];

  constructor(navigationManager: NavigationManager) {
    this.navigationManager = navigationManager;
  }

  /**
   * Check if route can be activated
   * Requirements: ui.8.2
   */
  async canActivate(route: string): Promise<boolean> {
    // Public routes are always accessible
    if (!this.isProtectedRoute(route)) {
      return true;
    }

    // Check authentication for protected routes
    const isAuthenticated = await this.navigationManager.checkAuthStatus();
    
    if (!isAuthenticated) {
      console.log('[AuthGuard] Access denied to protected route:', route);
      this.navigationManager.redirectToLogin();
      return false;
    }

    return true;
  }

  /**
   * Check if route is protected
   */
  private isProtectedRoute(route: string): boolean {
    return this.protectedRoutes.some(protected => route.startsWith(protected));
  }
}
```

#### Интеграция с OAuth Events

```typescript
// Requirements: ui.8.3, ui.8.4

// In App.tsx or main application component
useEffect(() => {
  // Requirements: ui.8.3 - Redirect to dashboard after successful auth
  const unsubscribeAuthSuccess = window.api.auth.onAuthSuccess(() => {
    console.log('[App] Auth success event received, redirecting to dashboard');
    navigationManager.redirectToDashboard();
  });

  // Requirements: ui.8.4 - Redirect to login after logout
  const unsubscribeLogout = window.api.auth.onLogout(() => {
    console.log('[App] Logout event received, redirecting to login');
    navigationManager.redirectToLogin();
  });

  return () => {
    unsubscribeAuthSuccess();
    unsubscribeLogout();
  };
}, []);
```

### Поток Навигации

**1. Запуск приложения (неавторизованный пользователь):**
```
App Start → NavigationManager.initialize() → checkAuthStatus() → not authorized → redirectToLogin()
```

**2. Запуск приложения (авторизованный пользователь):**
```
App Start → NavigationManager.initialize() → checkAuthStatus() → authorized → stay on current route or redirectToDashboard()
```

**3. Успешная авторизация:**
```
OAuth Success → auth:success event → onAuthSuccess() → redirectToDashboard()
```

**4. Попытка доступа к защищенному маршруту:**
```
Navigate to /settings → AuthGuard.canActivate() → checkAuthStatus() → not authorized → redirectToLogin()
```

**5. Выход из системы:**
```
Logout → auth:logout event → onLogout() → redirectToLogin()
```

## Система Уведомлений об Ошибках

### Обзор

Система уведомлений отображает пользователю понятные сообщения об ошибках, возникающих в фоновых процессах (загрузка данных, синхронизация, API запросы). Уведомления автоматически исчезают через 15 секунд или при клике пользователя.

### Архитектура Уведомлений

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐                                    │
│  │  Background Process  │                                    │
│  │  (API, Sync, etc)    │                                    │
│  └──────────────────────┘                                    │
│           │ Error occurs                                     │
│           ▼                                                   │
│  ┌──────────────────────┐                                    │
│  │  Error Handler       │                                    │
│  │                      │                                    │
│  │  - captureError()    │                                    │
│  │  - logError()        │                                    │
│  └──────────────────────┘                                    │
│           │ IPC: error:notify                                │
└───────────┼───────────────────────────────────────────────────┘
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │ ErrorNotificationManager       │         │
   │  │                                │         │
   │  │  - showNotification()          │         │
   │  │  - dismissNotification()       │         │
   │  │  - notifications[]             │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │    NotificationUI              │         │
   │  │                                │         │
   │  │  - Display error message       │         │
   │  │  - Display context             │         │
   │  │  - Auto-dismiss timer          │         │
   │  │  - Click to dismiss            │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Компоненты Уведомлений

#### ErrorNotificationManager

Класс для управления уведомлениями об ошибках.

```typescript
// Requirements: ui.7.1, ui.7.2, ui.7.3

interface ErrorNotification {
  id: string;
  message: string;
  context: string;
  timestamp: number;
}

class ErrorNotificationManager {
  private notifications: ErrorNotification[] = [];
  private listeners: ((notifications: ErrorNotification[]) => void)[] = [];
  private readonly AUTO_DISMISS_DELAY = 15000; // 15 seconds

  /**
   * Show error notification
   * Requirements: ui.7.1, ui.7.2
   */
  showNotification(message: string, context: string): string {
    const notification: ErrorNotification = {
      id: `error-${Date.now()}-${Math.random()}`,
      message,
      context,
      timestamp: Date.now()
    };

    this.notifications.push(notification);
    this.notifyListeners();

    // Requirements: ui.7.3 - Auto-dismiss after 15 seconds
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, this.AUTO_DISMISS_DELAY);

    console.log('[ErrorNotificationManager] Notification shown:', notification);
    return notification.id;
  }

  /**
   * Dismiss notification
   * Requirements: ui.7.3
   */
  dismissNotification(id: string): void {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.notifyListeners();
      console.log('[ErrorNotificationManager] Notification dismissed:', id);
    }
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: (notifications: ErrorNotification[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }
}
```

#### NotificationUI Component

React компонент для отображения уведомлений.

```typescript
// Requirements: ui.7.1, ui.7.2, ui.7.3

import { useState, useEffect } from 'react';

interface NotificationUIProps {
  notificationManager: ErrorNotificationManager;
}

export function NotificationUI({ notificationManager }: NotificationUIProps) {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe(setNotifications);
    return unsubscribe;
  }, [notificationManager]);

  const handleDismiss = (id: string) => {
    notificationManager.dismissNotification(id);
  };

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className="error-notification"
          onClick={() => handleDismiss(notification.id)}
        >
          <div className="notification-content">
            {/* Requirements: ui.7.2 - Display context */}
            <div className="notification-context">
              {notification.context}
            </div>
            {/* Requirements: ui.7.2 - Display message */}
            <div className="notification-message">
              {notification.message}
            </div>
          </div>
          <button
            className="notification-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss(notification.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

#### Интеграция с IPC

```typescript
// Requirements: ui.7.1, ui.7.4

// In preload script
contextBridge.exposeInMainWorld('api', {
  error: {
    onNotify: (callback: (message: string, context: string) => void) => {
      ipcRenderer.on('error:notify', (_event, message, context) => {
        callback(message, context);
      });
      return () => ipcRenderer.removeAllListeners('error:notify');
    }
  }
});

// In renderer
useEffect(() => {
  const unsubscribe = window.api.error.onNotify((message, context) => {
    notificationManager.showNotification(message, context);
  });
  return unsubscribe;
}, []);

// In main process - error handler
function handleBackgroundError(error: Error, context: string): void {
  // Requirements: ui.7.4 - Log to console
  console.error(`[${context}] Error:`, error);
  
  // Requirements: ui.7.1 - Notify renderer
  const mainWindow = windowManager.getWindow();
  if (mainWindow) {
    mainWindow.webContents.send('error:notify', error.message, context);
  }
}
```

### Примеры Использования

**1. Ошибка загрузки профиля:**
```typescript
try {
  await fetchProfile();
} catch (error) {
  handleBackgroundError(error, 'Profile Loading');
  // User sees: "Profile Loading: Failed to fetch user profile"
}
```

**2. Ошибка синхронизации:**
```typescript
try {
  await syncData();
} catch (error) {
  handleBackgroundError(error, 'Data Synchronization');
  // User sees: "Data Synchronization: Network connection failed"
}
```

**3. Ошибка API запроса:**
```typescript
try {
  await apiRequest();
} catch (error) {
  handleBackgroundError(error, 'API Request');
  // User sees: "API Request: Server returned error 500"
}
```

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
      // Requirements: ui.6.3 - Check authentication status
      const authStatus = await this.oauthClient.getAuthStatus();
      if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
        console.log('[UserProfileManager] Not authenticated, cannot fetch profile');
        return null;
      }

      // Requirements: ui.6.3 - Use Google UserInfo API endpoint
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
      // Requirements: ui.6.1 - Return cached profile on error
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
   * Requirements: ui.6.1
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
   * 
   * @deprecated This method is not currently used in the application flow.
   * Profile data persists in database even after logout or session expiry (HTTP 401)
   * to provide better UX when user re-authenticates. Only tokens are cleared on
   * logout/401 errors, not profile data. This allows the UI to display cached
   * profile information immediately upon re-authentication.
   * 
   * Requirements: N/A (method exists for potential future use)
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
   * Requirements: ui.6.3
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
   * Requirements: ui.6.3
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

    // Requirements: ui.8.4, google-oauth-auth.15 - Listen for logout to clear profile from UI
    const unsubscribeLogout = window.api.auth.onLogout(() => {
      console.log('[Account] Logout event received, clearing profile from UI');
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
// Requirements: ui.6.3
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
    
    // Requirements: ui.6.3 - Fetch profile on startup if authenticated
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
// Requirements: ui.6.3
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
      
      // Requirements: ui.6.3 - Automatically update profile after token refresh
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
// Requirements: ui.6.3
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

Система навигации обеспечивает защиту маршрутов и автоматическое перенаправление пользователей в зависимости от статуса авторизации. NavigationManager и AuthGuard работают совместно для предотвращения несанкционированного доступа к защищенным экранам.

Система уведомлений об ошибках предоставляет пользователю понятную обратную связь о проблемах в фоновых процессах, автоматически скрывая уведомления через 15 секунд для минимизации отвлечения.

Система управления токенами обеспечивает автоматическое обновление access token в фоновом режиме и корректную обработку ошибок авторизации (HTTP 401). Централизованный обработчик API запросов гарантирует консистентное поведение при истечении сессии, немедленно очищая токены и данные пользователя, и показывая понятное сообщение о необходимости повторной авторизации.

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

**Фаза 4 (Навигация и Авторизация):**
- ⏳ В стадии планирования
- 📋 Требования ui.8.x определены
- 📐 Дизайн детализирован
- 📝 Задачи будут добавлены в tasks.md
- ⏸️ Ожидает начала реализации

**Фаза 5 (Система Уведомлений об Ошибках):**
- ⏳ В стадии планирования
- 📋 Требования ui.7.x определены
- 📐 Дизайн детализирован
- 📝 Задачи будут добавлены в tasks.md
- ⏸️ Ожидает начала реализации

**Фаза 6 (Управление Токенами и Обработка Ошибок Авторизации):**
- ⏳ В стадии планирования
- 📋 Требования ui.9.x определены
- 📐 Дизайн детализирован
- 📝 Задачи будут добавлены в tasks.md
- ⏸️ Ожидает начала реализации

### Следующие Шаги

1. Начать реализацию Фазы 3 согласно tasks.md (задачи 10-20)
2. Создать UserProfileManager с интеграцией в OAuth инфраструктуру
3. Расширить IPC handlers для работы с профилем
4. Создать Account React компонент
5. Написать модульные и функциональные тесты
6. После завершения Фазы 3, перейти к Фазе 4 (Навигация)
7. Создать NavigationManager, AuthGuard и интегрировать с Router
8. После завершения Фазы 4, перейти к Фазе 5 (Уведомления)
9. Создать ErrorNotificationManager и NotificationUI компонент
10. После завершения Фазы 5, перейти к Фазе 6 (Управление Токенами)
11. Реализовать централизованный обработчик API запросов с проверкой HTTP 401
12. Интегрировать автоматическое обновление токенов в фоновом режиме
13. Обновить таблицу покрытия требований после реализации каждой фазы
