# Документ Дизайна: Token Management UI

## Обзор

Данный документ описывает архитектуру и дизайн пользовательского интерфейса управления токенами авторизации в приложении Clerkly, включая автоматическое обновление токенов и обработку ошибок авторизации.

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
- **Безопасность**: Немедленное прекращение доступа при невалидных токенах
- **Прозрачность**: Автоматическое обновление токенов без прерывания работы пользователя
- **Понятность**: Четкое сообщение пользователю о необходимости повторной авторизации
- **Консистентность**: Единый подход к обработке ошибок авторизации во всем приложении

### Цели Дизайна

- Обеспечить автоматическое обновление токенов без прерывания работы пользователя
- Корректно обрабатывать ситуации истечения сессии (HTTP 401)
- Предоставлять понятную обратную связь при ошибках авторизации
- Централизовать обработку ошибок авторизации для консистентности
- Логировать события авторизации с достаточным контекстом для отладки

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **React**: Библиотека для построения UI компонентов
- **IPC (Inter-Process Communication)**: Electron API для связи между процессами
- **SQLite**: База данных для хранения токенов (через TokenStorageManager)

### Зависимости

- **google-oauth-auth**: Спецификация, реализующая backend логику управления токенами OAuth (автоматическое обновление, хранение, обмен кодов)

## Архитектура

### Компоненты Системы

Система управления токенами в UI состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐                                    │
│  │  APIRequestHandler   │                                    │
│  │                      │                                    │
│  │  - handleRequest()   │                                    │
│  │  - checkAuth()       │                                    │
│  │  - clearSession()    │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │  External API        │       │  TokenStorage       │     │
│  │  (Google, etc)       │       │  Manager            │     │
│  └──────────────────────┘       └─────────────────────┘     │
│           │                                │                 │
└───────────┼────────────────────────────────┼─────────────────┘
            │ HTTP 401                       │ Clear tokens
            ▼                                ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │  LoginError Component          │         │
   │  │  (errorCode: 'invalid_grant')  │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Данных

1. **Автоматическое обновление токена**:
   - Access token приближается к истечению (expires_in)
   - `OAuthClientManager` автоматически вызывает `refreshAccessToken()`
   - Новые токены сохраняются в `TokenStorageManager`
   - Пользователь продолжает работу без прерываний

2. **Обработка ошибки авторизации (HTTP 401)**:
   - API запрос возвращает HTTP 401 Unauthorized
   - `APIRequestHandler` перехватывает ошибку
   - Вызывается `handleAuthError()` для очистки токенов
   - `TokenStorageManager` удаляет все токены
   - IPC событие `auth:error` отправляется в renderer
   - `LoginError` компонент отображается с errorCode 'invalid_grant'
   - Пользователь может повторно авторизоваться

3. **Множественные одновременные ошибки 401**:
   - Несколько API запросов одновременно получают HTTP 401
   - `APIRequestHandler` использует флаг `clearingSession` для предотвращения race conditions
   - Очистка токенов выполняется только один раз
   - Все запросы получают одинаковую ошибку

## Компоненты и Интерфейсы

### APIRequestHandler

Класс для централизованной обработки API запросов с автоматической проверкой ошибок авторизации.

```typescript
// Requirements: token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5

class APIRequestHandler {
  private tokenStorageManager: TokenStorageManager;
  private windowManager: WindowManager;
  private clearingSession: boolean = false;

  constructor(
    tokenStorageManager: TokenStorageManager,
    windowManager: WindowManager
  ) {
    this.tokenStorageManager = tokenStorageManager;
    this.windowManager = windowManager;
  }

  /**
   * Handle API request with automatic 401 checking
   * Requirements: token-management-ui.1.3, token-management-ui.1.4
   */
  async handleRequest(url: string, options: RequestInit): Promise<Response> {
    try {
      const response = await fetch(url, options);

      // Requirements: token-management-ui.1.3, token-management-ui.1.4 - Check for authorization error
      if (response.status === 401) {
        await this.handleAuthError(url);
        throw new Error('Authorization failed: Session expired');
      }

      return response;
    } catch (error) {
      // Requirements: token-management-ui.1.5 - Log with context
      console.error('[APIRequestHandler] Request failed:', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Handle authorization error (HTTP 401)
   * Requirements: token-management-ui.1.3
   */
  private async handleAuthError(url: string): Promise<void> {
    // Prevent multiple simultaneous session clears
    if (this.clearingSession) {
      console.log('[APIRequestHandler] Session clear already in progress, skipping');
      return;
    }

    this.clearingSession = true;

    try {
      // Requirements: token-management-ui.1.5 - Log with context
      console.error('[APIRequestHandler] Authorization error (401):', {
        url,
        action: 'clearing tokens and showing login',
        timestamp: new Date().toISOString()
      });

      // Requirements: token-management-ui.1.3 - Clear all tokens
      await this.tokenStorageManager.clearTokens();

      // Requirements: token-management-ui.1.3 - Show LoginError component
      const mainWindow = this.windowManager.getWindow();
      if (mainWindow) {
        mainWindow.webContents.send('auth:error', {
          message: 'Session expired',
          errorCode: 'invalid_grant'
        });
      }
    } finally {
      // Reset flag after a short delay to allow event propagation
      setTimeout(() => {
        this.clearingSession = false;
      }, 1000);
    }
  }
}
```

**Ключевые особенности:**
- Централизованная обработка всех API запросов
- Автоматическая проверка HTTP 401 статуса
- Предотвращение race conditions при множественных одновременных ошибках 401
- Логирование с контекстом для отладки
- Интеграция с существующими компонентами (TokenStorageManager, WindowManager)

### Использование в Других Компонентах

```typescript
// Requirements: token-management-ui.1.4

// In UserProfileManager
async fetchProfile(): Promise<UserProfile | null> {
  try {
    const authStatus = await this.oauthClient.getAuthStatus();
    if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
      return null;
    }

    // Use centralized handler that checks for 401
    const response = await this.apiRequestHandler.handleRequest(
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

// In CalendarManager (example)
async fetchCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const authStatus = await this.oauthClient.getAuthStatus();
    if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
      return [];
    }

    // Use centralized handler
    const response = await this.apiRequestHandler.handleRequest(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { 'Authorization': `Bearer ${authStatus.tokens.accessToken}` }
      }
    );

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    if (error.message?.includes('Authorization failed')) {
      return [];
    }
    throw error;
  }
}
```

### LoginError Component

React компонент для отображения ошибок авторизации.

```typescript
// Requirements: token-management-ui.1.3, token-management-ui.1.6

import { useState, useEffect } from 'react';

interface LoginErrorProps {
  errorCode: string;
  message?: string;
}

export function LoginError({ errorCode, message }: LoginErrorProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRetry = async () => {
    setIsLoading(true);
    try {
      // Requirements: token-management-ui.1.3 - Trigger OAuth flow
      await window.api.auth.startOAuthFlow();
    } catch (error) {
      console.error('[LoginError] Failed to start OAuth flow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Requirements: token-management-ui.1.6 - Display user-friendly message
  const getErrorMessage = () => {
    if (errorCode === 'invalid_grant') {
      return 'Your session has expired. Please sign in again to continue.';
    }
    return message || 'An error occurred during authentication. Please try again.';
  };

  return (
    <div className="login-error">
      <div className="error-content">
        <h2>Authentication Required</h2>
        <p className="error-message">{getErrorMessage()}</p>
        <button
          className="retry-button"
          onClick={handleRetry}
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>
    </div>
  );
}
```

### Loader Component

React компонент для отображения состояния загрузки при обновлении токенов.

```typescript
// Requirements: token-management-ui.1.2

import { useState, useEffect } from 'react';

interface LoaderProps {
  message?: string;
}

export function Loader({ message = 'Loading...' }: LoaderProps) {
  return (
    <div className="loader-overlay">
      <div className="loader-content">
        <div className="spinner" />
        <p className="loader-message">{message}</p>
      </div>
    </div>
  );
}

// Usage in App component
export function App() {
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  useEffect(() => {
    // Listen for token refresh events
    const unsubscribe = window.api.auth.onTokenRefresh((isRefreshing: boolean) => {
      setIsRefreshingToken(isRefreshing);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="app">
      {/* Requirements: token-management-ui.1.2 - Show loader during token refresh */}
      {isRefreshingToken && <Loader message="Refreshing session..." />}
      
      {/* Main app content */}
      <MainContent />
    </div>
  );
}
```

**Примечание**: В текущей реализации автоматическое обновление токенов происходит настолько быстро, что loader может не потребоваться. Однако компонент готов к использованию, если в будущем потребуется визуальная индикация процесса обновления.

## Модели Данных

### AuthError

Интерфейс для представления ошибки авторизации.

```typescript
interface AuthError {
  /**
   * Код ошибки для идентификации типа проблемы
   */
  errorCode: string;

  /**
   * Человекочитаемое сообщение об ошибке
   */
  message: string;

  /**
   * Timestamp когда произошла ошибка
   */
  timestamp: number;

  /**
   * URL API запроса, который вызвал ошибку (опционально)
   */
  url?: string;
}
```

**Валидация:**
- `errorCode`: Должен быть одним из предопределенных значений ('invalid_grant', 'network_error', и т.д.)
- `message`: Не должен содержать технических деталей, только понятное пользователю описание
- `timestamp`: Unix timestamp в миллисекундах

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Автоматическое обновление токена при истечении

*Для любого* access token, который истекает (expires_in), система должна автоматически обновить его через refresh token в фоновом режиме без участия пользователя, и пользователь должен продолжать работу без прерываний.

**Validates: Requirements token-management-ui.1.1, token-management-ui.1.2**

### Property 2: Очистка токенов при ошибке авторизации

*Для любого* API запроса, который возвращает HTTP 401 Unauthorized, система должна немедленно очистить все токены из хранилища и показать экран логина (LoginError компонент с errorCode 'invalid_grant'). Данные пользователя в базе данных НЕ очищаются и сохраняются для отображения при следующей авторизации.

**Validates: Requirements token-management-ui.1.3**

### Property 3: Централизованная обработка ошибок авторизации

*Для любого* API запроса к внешним сервисам (Google UserInfo, Calendar, Tasks и т.д.), запрос должен проходить через централизованный обработчик, который проверяет статус HTTP 401 и выполняет необходимые действия по очистке сессии.

**Validates: Requirements token-management-ui.1.4**

### Property 4: Логирование ошибок авторизации с контекстом

*Для любой* ошибки авторизации (HTTP 401), система должна залогировать событие с контекстом (какой API запрос вызвал ошибку, timestamp, URL) через централизованный Logger класс, но показать пользователю только понятное сообщение без технических деталей.

**Validates: Requirements token-management-ui.1.5, token-management-ui.1.6**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Истечение access token (token-management-ui.1.1, token-management-ui.1.2)**: Когда access token истекает во время работы приложения, система должна автоматически обновить его через refresh token в фоновом режиме. Пользователь продолжает работу без прерываний, уведомлений или видимых изменений в UI.

2. **Истечение refresh token (token-management-ui.1.3)**: Когда refresh token также становится невалидным (истек или был отозван), любой API запрос вернет HTTP 401. Система должна немедленно очистить все токены, показать экран логина (LoginError компонент с errorCode 'invalid_grant') и пользователь может повторно авторизоваться через кнопку "Continue with Google". Данные пользователя в базе данных НЕ очищаются и сохраняются для отображения при следующей авторизации.

3. **Ошибка 401 во время фоновой операции (token-management-ui.1.3, token-management-ui.1.4)**: Когда фоновый процесс (например, автоматическая синхронизация календаря) получает HTTP 401, система должна обработать это так же, как и для пользовательских запросов: очистить токены, показать экран логина (LoginError компонент) с ошибкой, перенаправить на авторизацию. Данные пользователя в базе данных сохраняются.

4. **Множественные одновременные запросы с ошибкой 401 (token-management-ui.1.4)**: Когда несколько API запросов одновременно получают HTTP 401 (например, при загрузке профиля, календаря и задач), централизованный обработчик должен выполнить очистку токенов только один раз, избегая дублирования действий и race conditions. Данные пользователя в базе данных сохраняются.

## Обработка Ошибок

### Стратегия Обработки Ошибок

Система управления токенами должна обрабатывать ошибки gracefully, обеспечивая понятную обратную связь пользователю и достаточное логирование для отладки.

### Сценарии Ошибок

#### 1. Ошибка автоматического обновления токена

**Причины:**
- Refresh token истек или был отозван
- Ошибка сети при запросе к Google OAuth API
- Некорректный ответ от сервера

**Обработка:**
```typescript
// Requirements: token-management-ui.1.1, token-management-ui.1.3
async refreshAccessToken(): Promise<boolean> {
  try {
    // Attempt to refresh token
    const newTokens = await this.oauthClient.refreshAccessToken();
    if (newTokens) {
      await this.tokenStorageManager.saveTokens(newTokens);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[TokenRefresh] Failed to refresh access token:', error);
    
    // If refresh fails, clear all tokens and show login
    await this.tokenStorageManager.clearTokens();
    
    const mainWindow = this.windowManager.getWindow();
    if (mainWindow) {
      mainWindow.webContents.send('auth:error', {
        message: 'Session expired',
        errorCode: 'invalid_grant'
      });
    }
    
    return false;
  }
}
```

**Результат:** Токены очищены, пользователь видит LoginError компонент с возможностью повторной авторизации.

#### 2. Ошибка API запроса (HTTP 401)

**Причины:**
- Access token истек и не был обновлен вовремя
- Токен был отозван пользователем в настройках Google аккаунта
- Токен стал невалидным по другим причинам

**Обработка:**
```typescript
// Requirements: token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5
async handleRequest(url: string, options: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      await this.handleAuthError(url);
      throw new Error('Authorization failed: Session expired');
    }
    
    return response;
  } catch (error) {
    console.error('[APIRequestHandler] Request failed:', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}
```

**Результат:** Токены очищены, ошибка залогирована с контекстом, пользователь видит LoginError компонент.

#### 3. Race condition при множественных ошибках 401

**Причины:**
- Несколько API запросов одновременно получают HTTP 401
- Каждый запрос пытается очистить токены и показать LoginError

**Обработка:**
```typescript
// Requirements: token-management-ui.1.4
private clearingSession: boolean = false;

private async handleAuthError(url: string): Promise<void> {
  // Prevent multiple simultaneous session clears
  if (this.clearingSession) {
    console.log('[APIRequestHandler] Session clear already in progress, skipping');
    return;
  }

  this.clearingSession = true;

  try {
    console.error('[APIRequestHandler] Authorization error (401):', {
      url,
      action: 'clearing tokens and showing login',
      timestamp: new Date().toISOString()
    });

    await this.tokenStorageManager.clearTokens();

    const mainWindow = this.windowManager.getWindow();
    if (mainWindow) {
      mainWindow.webContents.send('auth:error', {
        message: 'Session expired',
        errorCode: 'invalid_grant'
      });
    }
  } finally {
    setTimeout(() => {
      this.clearingSession = false;
    }, 1000);
  }
}
```

**Результат:** Очистка токенов выполняется только один раз, избегая race conditions и дублирования действий.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс:

```typescript
// Requirements: token-management-ui.1.5

// Authorization errors
console.error('[APIRequestHandler] Authorization error (401):', {
  url,
  action: 'clearing tokens and showing login',
  timestamp: new Date().toISOString()
});

// Token refresh errors
console.error('[TokenRefresh] Failed to refresh access token:', error);

// API request errors
console.error('[APIRequestHandler] Request failed:', {
  url,
  error: error instanceof Error ? error.message : 'Unknown error',
  timestamp: new Date().toISOString()
});
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект с контекстом (url, timestamp, action)
- Объект ошибки для stack trace (когда доступен)

## Стратегия Тестирования

### Двойной Подход к Тестированию

Система управления токенами в UI будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют end-to-end сценарии с реальным Electron и UI

### Модульные Тесты

#### APIRequestHandler Tests

```typescript
describe('APIRequestHandler', () => {
  /* Preconditions: APIRequestHandler created with mocked TokenStorageManager and WindowManager
     Action: call handleRequest() with URL that returns 401
     Assertions: clearTokens called, auth:error event sent, error thrown
     Requirements: token-management-ui.1.3, token-management-ui.1.4 */
  it('should clear tokens and show login on 401 error', async () => {
    // Test handling of HTTP 401 error
  });

  /* Preconditions: multiple simultaneous requests return 401
     Action: call handleRequest() multiple times concurrently
     Assertions: clearTokens called only once, no race conditions
     Requirements: token-management-ui.1.4 */
  it('should handle multiple simultaneous 401 errors without race conditions', async () => {
    // Test race condition prevention
  });

  /* Preconditions: API request succeeds with 200
     Action: call handleRequest()
     Assertions: response returned, no tokens cleared
     Requirements: token-management-ui.1.4 */
  it('should pass through successful requests without interference', async () => {
    // Test normal operation
  });

  /* Preconditions: API request fails with network error
     Action: call handleRequest()
     Assertions: error logged with context, error thrown
     Requirements: token-management-ui.1.5 */
  it('should log errors with context', async () => {
    // Test error logging
  });
});
```

#### LoginError Component Tests

```typescript
describe('LoginError Component', () => {
  /* Preconditions: LoginError rendered with errorCode 'invalid_grant'
     Action: render component
     Assertions: user-friendly message displayed, no technical details
     Requirements: token-management-ui.1.6 */
  it('should display user-friendly error message', () => {
    // Test error message display
  });

  /* Preconditions: LoginError rendered
     Action: click "Continue with Google" button
     Assertions: OAuth flow started
     Requirements: token-management-ui.1.3 */
  it('should trigger OAuth flow on retry button click', async () => {
    // Test retry functionality
  });

  /* Preconditions: OAuth flow in progress
     Action: button clicked
     Assertions: button disabled, loading state shown
     Requirements: token-management-ui.1.3 */
  it('should show loading state during OAuth flow', async () => {
    // Test loading state
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('Token Management UI Functional Tests', () => {
  /* Preconditions: user authenticated, access token about to expire
     Action: wait for token expiration, continue using app
     Assertions: token automatically refreshed, no interruption to user, no visible changes
     Requirements: token-management-ui.1.1, token-management-ui.1.2 */
  it('should automatically refresh expired access token', async () => {
    // Launch app, authenticate user
    // Mock token expiration
    // Verify automatic refresh
    // Verify no UI changes or interruptions
  });

  /* Preconditions: user authenticated, API returns 401
     Action: trigger API request that returns 401
     Assertions: tokens cleared, LoginError shown with errorCode 'invalid_grant', user data preserved
     Requirements: token-management-ui.1.3 */
  it('should clear session and show login on 401 error', async () => {
    // Launch app, authenticate user
    // Mock API 401 response
    // Verify tokens cleared
    // Verify LoginError displayed
    // Verify user data in database preserved
  });

  /* Preconditions: user authenticated, multiple APIs return 401
     Action: trigger multiple simultaneous API requests that return 401
     Assertions: tokens cleared once, LoginError shown once, no race conditions
     Requirements: token-management-ui.1.4 */
  it('should handle 401 from any API endpoint consistently', async () => {
    // Launch app, authenticate user
    // Mock multiple API 401 responses
    // Verify single token clear
    // Verify single LoginError display
  });

  /* Preconditions: API returns 401
     Action: check logs
     Assertions: error logged with url, timestamp, action context
     Requirements: token-management-ui.1.5 */
  it('should log authorization errors with context', async () => {
    // Launch app, authenticate user
    // Mock API 401 response
    // Verify log contains context
  });

  /* Preconditions: session expired (401 error)
     Action: view LoginError component
     Assertions: user-friendly message displayed, no technical details
     Requirements: token-management-ui.1.6 */
  it('should show user-friendly error message on session expiry', async () => {
    // Launch app, authenticate user
    // Mock API 401 response
    // Verify LoginError message is user-friendly
    // Verify no technical details shown
  });
});
```

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| token-management-ui.1.1 | ✓ | - | ✓ |
| token-management-ui.1.2 | ✓ | - | ✓ |
| token-management-ui.1.3 | ✓ | - | ✓ |
| token-management-ui.1.4 | ✓ | - | ✓ |
| token-management-ui.1.5 | ✓ | - | ✓ |
| token-management-ui.1.6 | ✓ | - | ✓ |

**Примечание**: Property-based тесты не применяются к данной спецификации, так как она описывает UI-поведение и обработку конкретных HTTP статусов, которые лучше тестируются через модульные и функциональные тесты.

## Технические Решения

### Интеграция с Существующими Компонентами

#### OAuthClientManager

Существующий класс `OAuthClientManager` (из спецификации google-oauth-auth) уже реализует автоматическое обновление токенов. Интеграция с UI требует только добавления IPC событий для уведомления renderer процесса.

```typescript
// Requirements: token-management-ui.1.1, token-management-ui.1.2

// In OAuthClientManager
async refreshAccessToken(): Promise<boolean> {
  console.log('[OAuthClientManager] Refreshing access token');
  
  // Notify renderer about token refresh start (optional)
  const mainWindow = this.windowManager.getWindow();
  if (mainWindow) {
    mainWindow.webContents.send('auth:token-refresh', { isRefreshing: true });
  }
  
  // ... existing token refresh logic ...
  
  if (refreshed) {
    console.log('[OAuthClientManager] Token refreshed successfully');
    
    // Notify renderer about token refresh completion (optional)
    if (mainWindow) {
      mainWindow.webContents.send('auth:token-refresh', { isRefreshing: false });
    }
  }
  
  return refreshed;
}
```

#### TokenStorageManager

Существующий класс `TokenStorageManager` (из спецификации google-oauth-auth) уже реализует хранение и очистку токенов. Никаких изменений не требуется.

#### WindowManager

Существующий класс `WindowManager` используется для получения главного окна и отправки IPC событий. Никаких изменений не требуется.

### IPC Events

Система использует следующие IPC события для связи между main и renderer процессами:

```typescript
// Requirements: token-management-ui.1.3

// Main → Renderer: Authorization error occurred
mainWindow.webContents.send('auth:error', {
  message: string,
  errorCode: string
});

// Main → Renderer: Token refresh status (optional)
mainWindow.webContents.send('auth:token-refresh', {
  isRefreshing: boolean
});

// Renderer → Main: Start OAuth flow
ipcRenderer.invoke('auth:start-oauth-flow');
```

### Preload Script

Расширение preload script для поддержки token management событий:

```typescript
// Requirements: token-management-ui.1.3

// In preload script
contextBridge.exposeInMainWorld('api', {
  auth: {
    // Listen for authorization errors
    onAuthError: (callback: (error: { message: string; errorCode: string }) => void) => {
      ipcRenderer.on('auth:error', (_event, error) => {
        callback(error);
      });
      return () => ipcRenderer.removeAllListeners('auth:error');
    },
    
    // Listen for token refresh status (optional)
    onTokenRefresh: (callback: (status: { isRefreshing: boolean }) => void) => {
      ipcRenderer.on('auth:token-refresh', (_event, status) => {
        callback(status);
      });
      return () => ipcRenderer.removeAllListeners('auth:token-refresh');
    },
    
    // Start OAuth flow
    startOAuthFlow: () => ipcRenderer.invoke('auth:start-oauth-flow')
  }
});
```

### App Component Integration

Интеграция с главным App компонентом для обработки auth:error событий:

```typescript
// Requirements: token-management-ui.1.3, token-management-ui.1.6

import { useState, useEffect } from 'react';
import { LoginError } from './components/auth/LoginError';

export function App() {
  const [authError, setAuthError] = useState<{ message: string; errorCode: string } | null>(null);

  useEffect(() => {
    // Listen for authorization errors
    const unsubscribe = window.api.auth.onAuthError((error) => {
      console.log('[App] Authorization error received:', error);
      setAuthError(error);
    });

    return unsubscribe;
  }, []);

  // Show LoginError if there's an auth error
  if (authError) {
    return <LoginError errorCode={authError.errorCode} message={authError.message} />;
  }

  // Normal app content
  return (
    <div className="app">
      <MainContent />
    </div>
  );
}
```

## Заключение

Данный дизайн обеспечивает надежное управление токенами авторизации в UI приложения Clerkly с автоматическим обновлением и корректной обработкой ошибок.

### Ключевые Архитектурные Решения

**Централизованная Обработка API Запросов:**
`APIRequestHandler` обеспечивает единую точку обработки всех внешних API запросов с автоматической проверкой HTTP 401 статуса. Это гарантирует консистентное поведение при истечении сессии во всем приложении.

**Предотвращение Race Conditions:**
Использование флага `clearingSession` предотвращает множественные одновременные очистки токенов при получении нескольких ошибок 401, обеспечивая стабильность системы.

**Понятная Обратная Связь:**
`LoginError` компонент предоставляет пользователю понятное сообщение о необходимости повторной авторизации без технических деталей, улучшая пользовательский опыт.

**Логирование с Контекстом:**
Все ошибки авторизации логируются с достаточным контекстом (url, timestamp, action) для эффективной отладки, но пользователю показываются только понятные сообщения.

**Интеграция с Существующими Компонентами:**
Дизайн минимально инвазивен и интегрируется с существующими компонентами (OAuthClientManager, TokenStorageManager, WindowManager) без необходимости их значительной модификации.

### Покрытие Требований

Дизайн полностью покрывает все требования из requirements.md:

- ✅ **token-management-ui.1.1** - Автоматическое обновление токена при истечении
- ✅ **token-management-ui.1.2** - Продолжение работы без прерываний при успешном обновлении
- ✅ **token-management-ui.1.3** - Очистка токенов и показ LoginError при HTTP 401
- ✅ **token-management-ui.1.4** - Централизованный обработчик для всех API запросов
- ✅ **token-management-ui.1.5** - Логирование ошибок с контекстом
- ✅ **token-management-ui.1.6** - Понятные сообщения пользователю

**Итого: 6 критериев приемки полностью покрыты дизайном**

### Свойства Корректности

Дизайн определяет 4 свойства корректности:
- Property 1: Автоматическое обновление токена при истечении
- Property 2: Очистка токенов при ошибке авторизации
- Property 3: Централизованная обработка ошибок авторизации
- Property 4: Логирование ошибок авторизации с контекстом

### Стратегия Тестирования

Комплексная стратегия тестирования включает:
- **Модульные тесты**: Конкретные примеры, граничные случаи, условия ошибок
- **Функциональные тесты**: End-to-end проверка пользовательских сценариев с реальным Electron

Все 6 критериев приемки покрыты тестами согласно таблице покрытия требований.

### Зависимости

- **google-oauth-auth**: Спецификация, реализующая backend логику управления токенами OAuth (OAuthClientManager, TokenStorageManager)

### Следующие Шаги

1. **Создать tasks.md** с задачами для реализации
2. **Реализовать APIRequestHandler** с централизованной обработкой ошибок
3. **Реализовать LoginError компонент** для отображения ошибок авторизации
4. **Интегрировать с App компонентом** для обработки auth:error событий
5. **Написать модульные тесты** для APIRequestHandler и LoginError
6. **Написать функциональные тесты** для end-to-end сценариев
7. **Обновить существующие компоненты** для использования APIRequestHandler
8. **Валидировать** через `npm run validate`

### Заключительные Замечания

Данный дизайн обеспечивает:
- ✅ Полное покрытие всех требований (token-management-ui.1)
- ✅ Четкую архитектуру с разделением ответственности
- ✅ Комплексную стратегию тестирования
- ✅ Обработку всех граничных случаев и ошибок
- ✅ Безопасность (немедленная очистка токенов при ошибках)
- ✅ Понятную обратную связь пользователю
- ✅ Предотвращение race conditions
- ✅ Логирование с контекстом для отладки
- ✅ Минимальную инвазивность в существующий код

Дизайн готов к реализации.
