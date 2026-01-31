# Документ Дизайна - Основа Платформы

## Введение

Этот документ описывает техническую архитектуру и дизайн основы платформы Clerkly, включая Electron оболочку приложения, инструментарий разработки и архитектуру межпроцессного взаимодействия.

## Архитектурный Обзор

### Технологический Стек

- **Electron**: 40.0.0 (оболочка приложения)
- **Node.js**: 25.5.0 (runtime для main процесса)
- **TypeScript**: 5.9.3 (язык разработки)
- **React**: 18.3.1 (UI фреймворк)
- **Vite**: 6.3.5 (сборщик для renderer)
- **Tailwind CSS**: 4.1.12 (стили)

### Архитектура Процессов

```
┌─────────────────┐    IPC     ┌─────────────────┐
│   Main Process  │◄──────────►│ Renderer Process│
│   (main.ts)     │            │   (React App)   │
└─────────────────┘            └─────────────────┘
         ▲                              ▲
         │                              │
         ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│  Preload Script │            │   Context API   │
│  (preload.ts)   │            │ (window.clerkly)│
└─────────────────┘            └─────────────────┘
```

## Компонентная Архитектура

### 1. Main Process (main.ts)

**Ответственность**: Управление жизненным циклом приложения, создание окон, обработка системных событий

**Ключевые Функции**:

```typescript
// Инициализация приложения
app.setName("Clerkly");
app.name = "Clerkly";

// Создание главного окна
const mainWindow = new BrowserWindow({
  width: 900,
  height: 600,
  show: false, // Показывается после готовности
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, "preload.js"),
  },
});
```

**IPC Обработчики**:

- `auth:open-google` - инициация OAuth
- `auth:get-state` - получение статуса авторизации
- `auth:sign-out` - выход из системы
- `sidebar:get-state` - получение состояния сайдбара
- `sidebar:set-state` - сохранение состояния сайдбара

### 2. Preload Script (preload.ts)

**Ответственность**: Безопасный мост между renderer и main процессами

**Паттерн**: Context Isolation + contextBridge

```typescript
const api = {
  openGoogleAuth: (): Promise<AuthResult> => ipcRenderer.invoke("auth:open-google"),
  getAuthState: (): Promise<{ authorized: boolean }> => ipcRenderer.invoke("auth:get-state"),
  // ... другие методы
};

contextBridge.exposeInMainWorld("clerkly", api);
```

### 3. Renderer Process (React App)

**Ответственность**: Пользовательский интерфейс и взаимодействие с пользователем

**Точка входа**: `renderer/src/main.tsx` → `renderer/src/app/App.tsx`

**Управление состоянием**:

```typescript
type AuthState = "unauthorized" | "authorizing" | "authorized" | "error";

const [authState, setAuthState] = useState<AuthState>("authorizing");
const [currentScreen, setCurrentScreen] = useState<string>("dashboard");
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
```

## Система Сборки и Разработки

### Конфигурация TypeScript

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["main.ts", "preload.ts", "src/**/*.ts"]
}
```

### Скрипты Сборки

```json
{
  "build:main": "tsc",
  "build:renderer": "vite build --config renderer/vite.config.mts",
  "build": "npm run build:main && npm run build:renderer",
  "start": "npm run build && electron .",
  "dev": "npm run build && electron ."
}
```

### Система Качества Кода

**ESLint Конфигурация**:

- TypeScript parser и правила
- React hooks правила
- Prettier интеграция
- Область: main.ts, preload.ts, renderer/src/**, tests/**

**Prettier Конфигурация**:

- Автоматическое форматирование
- Интеграция с ESLint

## Безопасность

### Context Isolation

- `nodeIntegration: false` - отключение Node.js в renderer
- `contextIsolation: true` - изоляция контекста
- Все взаимодействие через preload script

### IPC Безопасность

- Валидация всех IPC сообщений
- Типизированные интерфейсы для всех каналов
- Отсутствие прямого доступа к Electron API из renderer

## Свойства Корректности

### Свойство 1: Инициализация Приложения

**Описание**: Приложение должно корректно инициализироваться с правильным именем и окном

**Формальное Свойство**:

```
∀ app_instance : Application
  WHEN app_instance.initialize()
  THEN app_instance.name = "Clerkly"
    AND app_instance.mainWindow.isVisible() = true
    AND app_instance.mainWindow.width = 900
    AND app_instance.mainWindow.height = 600
```

### Свойство 2: IPC Канал Стабильность

**Описание**: Все зарегистрированные IPC каналы должны быть доступны и отвечать

**Формальное Свойство**:

```
∀ channel ∈ ["auth:open-google", "auth:get-state", "auth:sign-out", "sidebar:get-state", "sidebar:set-state"]
  WHEN renderer.invoke(channel, valid_params)
  THEN response.success = true OR response.error ≠ null
```

### Свойство 3: Context Isolation

**Описание**: Renderer процесс не должен иметь прямого доступа к Node.js API

**Формальное Свойство**:

```
∀ renderer_context : RendererContext
  THEN renderer_context.require = undefined
    AND renderer_context.process = undefined
    AND renderer_context.global = undefined
    AND typeof renderer_context.clerkly = "object"
```

### Свойство 4: TypeScript Компиляция

**Описание**: Весь код должен компилироваться без ошибок TypeScript

**Формальное Свойство**:

```
∀ source_file ∈ [main.ts, preload.ts, src/**/*.ts]
  WHEN tsc.compile(source_file)
  THEN compilation.errors.length = 0
```

## Интеграционные Точки

### Предоставляемые Интерфейсы

1. **IPC Infrastructure**: Базовые каналы для межпроцессного взаимодействия
2. **Window Management**: Управление главным окном приложения
3. **App Lifecycle**: События запуска, закрытия, активации
4. **Security Context**: Безопасная среда выполнения

### Зависимости

- **Операционная система**: macOS (указано в package.json)
- **Node.js**: v25.5.0 (точная версия)
- **npm**: v11.8.0 (точная версия)

## Конфигурация Среды

### Переменные Окружения

- `CLERKLY_E2E_USER_DATA` - переопределение userData директории для тестов
- `CLERKLY_LOG_LEVEL` - уровень логирования (DEBUG, INFO, WARN, ERROR), по умолчанию INFO

### Файловая Структура

```
dist/
├── main.js          # Скомпилированный main process
├── preload.js       # Скомпилированный preload script
└── renderer/        # Собранное React приложение
    ├── index.html
    └── assets/
```

## Мониторинг и Логирование

### Система Логирования

- **Файл**: `{userData}/clerkly.log`
- **Ротация**: Максимум 1MB, 3 файла
- **Формат**: ISO timestamp + уровень + сообщение + stack trace
- **Уровни**: DEBUG, INFO, WARN, ERROR (по умолчанию INFO)
- **Конфигурация**: Через переменную окружения `CLERKLY_LOG_LEVEL` или программно через `setLogLevel()`

### Метрики

- Время запуска приложения
- Количество IPC вызовов
- Ошибки компиляции и runtime

## Тестирование

### Unit Tests

- Тестирование IPC обработчиков
- Валидация конфигурации TypeScript
- Проверка безопасности Context Isolation

### Integration Tests

- E2E тесты запуска приложения
- Тестирование взаимодействия main ↔ renderer
- Проверка системы сборки

### Property-Based Tests

- Генерация различных IPC сообщений
- Тестирование стабильности каналов связи
- Проверка корректности типизации
