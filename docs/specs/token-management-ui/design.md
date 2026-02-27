# Документ Дизайна: Token Management UI

## Обзор

Данный документ описывает архитектуру и дизайн пользовательского интерфейса управления токенами авторизации в приложении Clerkly, включая автоматическое обновление токенов и обработку ошибок авторизации.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DatabaseManager и UserSettingsManager) является единственным источником истины для всех данных приложения**.

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
│  │  handleAPIRequest()  │                                    │
│  │                      │                                    │
│  │  - Auto token refresh│                                    │
│  │  - Check 401 status  │                                    │
│  │  - Clear tokens      │                                    │
│  │  - Send IPC event    │                                    │
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
   - `handleAPIRequest()` перехватывает ошибку
   - Проверяется флаг `isClearing401` для предотвращения race conditions
   - Вызывается `tokenStorage.deleteTokens()` для очистки токенов
   - IPC событие `auth:error` отправляется в renderer
   - `LoginError` компонент отображается с errorCode 'invalid_grant'
   - Пользователь может повторно авторизоваться

3. **Множественные одновременные ошибки 401**:
   - Несколько API запросов одновременно получают HTTP 401
   - `handleAPIRequest()` использует флаг `isClearing401` для предотвращения race conditions
   - Очистка токенов выполняется только один раз
   - Все запросы получают одинаковую ошибку

## Компоненты и Интерфейсы

### handleAPIRequest Function

Функция для централизованной обработки API запросов с автоматической проверкой ошибок авторизации и автоматическим обновлением токенов.

```typescript
// Requirements: token-management-ui.1.1, token-management-ui.1.2, token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5

/**
 * Centralized API Request Handler
 * Handles all API requests with automatic HTTP 401 detection and token management
 * 
 * This handler wraps fetch() to provide:
 * - Automatic token refresh when access token is expired (token-management-ui.1.1, token-management-ui.1.2)
 * - Automatic detection of HTTP 401 Unauthorized errors
 * - Centralized token clearing on authorization failures
 * - Protection against race conditions when multiple requests fail simultaneously
 * - Consistent error logging with context
 *
 * @param url API endpoint URL
 * @param options Fetch options (headers, method, body, etc.)
 * @param tokenStorage TokenStorageManager instance for clearing tokens
 * @param context Optional context string for logging (e.g., "UserInfo API", "Calendar API")
 * @returns Response from the API
 * @throws Error if request fails or authorization error occurs
 */
async function handleAPIRequest(
  url: string,
  options: RequestInit,
  tokenStorage: TokenStorageManager,
  context?: string
): Promise<Response> {
  logger.info(`Making API request: ${JSON.stringify({ url, context })}`);

  try {
    // Requirements: token-management-ui.1.1, token-management-ui.1.2 - Check if access token is expired and refresh if needed
    if (oauthClientManager) {
      const tokens = await tokenStorage.loadTokens();
      if (tokens && tokens.expiresAt) {
        const now = Date.now();
        const isExpired = tokens.expiresAt <= now;

        if (isExpired) {
          logger.info('Access token expired, refreshing automatically');
          const refreshed = await oauthClientManager.refreshAccessToken();

          if (refreshed) {
            logger.info('Token refreshed successfully');
            // Reload tokens to get the new access token
            const newTokens = await tokenStorage.loadTokens();
            if (newTokens && options.headers) {
              // Update Authorization header with new token
              if (options.headers instanceof Headers) {
                options.headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
              } else {
                (options.headers as Record<string, string>)['Authorization'] =
                  `Bearer ${newTokens.accessToken}`;
              }
            }
          }
        }
      }
    }

    // Requirements: token-management-ui.1.4 - Make the API request
    const response = await fetch(url, options);
    logger.info(`Response received: ${JSON.stringify({ status: response.status, url })}`);

    // Requirements: token-management-ui.1.3, token-management-ui.1.4 - Check for authorization error
    if (response.status === 401) {
      // Requirements: token-management-ui.1.4 - Prevent race conditions with multiple simultaneous 401 errors
      if (!isClearing401) {
        isClearing401 = true;

        try {
          // Requirements: token-management-ui.1.5 - Log error with context
          const logContext = context || 'API Request';
          logger.error(
            `Authorization error (401) from ${logContext}: ${JSON.stringify({
              url,
              timestamp: DateTimeFormatter.formatLogTimestamp(Date.now()),
              context: logContext,
            })}`
          );

          // Requirements: token-management-ui.1.3 - Clear all tokens from storage
          logger.info('Clearing all tokens due to 401 error');
          await tokenStorage.deleteTokens();

          // Requirements: token-management-ui.1.3 - Emit auth error event to show LoginError component
          const allWindows = BrowserWindow.getAllWindows();
          const mainWindow = allWindows[0];
          if (mainWindow) {
            logger.info('Sending auth:error event to renderer');
            mainWindow.webContents.send('auth:error', {
              error: 'Session expired',
              errorCode: 'invalid_grant',
            });
          }
        } finally {
          // Reset flag after a short delay to allow other requests to see the cleared state
          setTimeout(() => {
            isClearing401 = false;
          }, 100);
        }
      }

      // Requirements: token-management-ui.1.3, token-management-ui.1.6 - Throw error with user-friendly message
      throw new Error('Your session has expired. Please sign in again.');
    }

    return response;
  } catch (error) {
    // Requirements: token-management-ui.1.5 - Log all errors with context
    const logContext = context || 'API Request';
    logger.error(
      `Request failed for ${logContext}: ${error instanceof Error ? error.message : String(error)}`
    );

    // Re-throw the error for caller to handle
    throw error;
  }
}

/**
 * Set the OAuth Client Manager instance for automatic token refresh
 * Requirements: token-management-ui.1.1, token-management-ui.1.2
 */
function setOAuthClientManager(manager: OAuthClientManager): void {
  oauthClientManager = manager;
}
```

**Ключевые особенности:**
- **Автоматическое обновление токенов**: Проверяет `expiresAt` перед каждым запросом и автоматически обновляет токен если он истек
- **Централизованная обработка**: Единая точка для всех API запросов с автоматической проверкой HTTP 401
- **Предотвращение race conditions**: Использует флаг `isClearing401` для предотвращения множественных одновременных очисток токенов
- **Логирование с контекстом**: Все события логируются через централизованный Logger с контекстом (url, timestamp, action)
- **Интеграция с OAuthClientManager**: Использует `setOAuthClientManager()` для получения доступа к методу `refreshAccessToken()`

### Использование в Других Компонентах

```typescript
// Requirements: token-management-ui.1.4

// In UserProfileManager
import { handleAPIRequest } from './APIRequestHandler';

async fetchProfile(): Promise<UserProfile | null> {
  try {
    const authStatus = await this.oauthClient.getAuthStatus();
    if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
      return null;
    }

    // Use centralized handler that checks for 401 and auto-refreshes tokens
    const response = await handleAPIRequest(
      'https://www.googleapis.com/oauth2/v1/userinfo',
      {
        headers: { 'Authorization': `Bearer ${authStatus.tokens.accessToken}` }
      },
      this.tokenStorage,
      'UserInfo API'  // Context for logging
    );

    const profile = await response.json();
    await this.saveProfile(profile);
    return profile;
  } catch (error) {
    // If it's an auth error, tokens are already cleared
    // Return cached profile for other errors
    if (error.message?.includes('session has expired')) {
      return null;
    }
    return await this.loadProfile();
  }
}

// In CalendarManager (example)
import { handleAPIRequest } from './auth/APIRequestHandler';

async fetchCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const authStatus = await this.oauthClient.getAuthStatus();
    if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
      return [];
    }

    // Use centralized handler
    const response = await handleAPIRequest(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { 'Authorization': `Bearer ${authStatus.tokens.accessToken}` }
      },
      this.tokenStorage,
      'Calendar API'  // Context for logging
    );

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    if (error.message?.includes('session has expired')) {
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

import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface LoginErrorProps {
  errorMessage?: string;
  errorCode?: string;
  onRetry: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

interface ErrorDetails {
  title: string;
  message: string;
  suggestion: string;
}

/**
 * Maps error codes to user-friendly error messages
 * Requirements: token-management-ui.1.6
 */
function getErrorDetails(errorCode?: string, errorMessage?: string): ErrorDetails {
  // Requirements: token-management-ui.1.6 - Session expired
  if (errorCode === 'invalid_grant') {
    return {
      title: 'Session expired',
      message: 'Your authentication session has expired.',
      suggestion: 'Please sign in again to continue.',
    };
  }

  // Other error codes...
  
  // Default error
  return {
    title: 'Authentication failed',
    message: errorMessage || 'An unexpected error occurred during authentication.',
    suggestion: 'Please try signing in again or contact support if the problem persists.',
  };
}

/**
 * Login Error Component
 * 
 * Displays the authentication error screen with detailed error information
 * and retry option. Shows all elements from LoginScreen plus error message.
 * Supports loading state with spinner during retry.
 * 
 * Requirements: token-management-ui.1.3, token-management-ui.1.6
 */
export function LoginError({
  errorMessage,
  errorCode,
  onRetry,
  isLoading = false,
  isDisabled = false,
}: LoginErrorProps) {
  const errorDetails = getErrorDetails(errorCode, errorMessage);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center">
            <Logo size="lg" showText={true} />
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome</h2>
            <p className="text-sm text-muted-foreground">
              Your autonomous AI agent that listens, organizes, and acts
            </p>
          </div>

          {/* Error Message - Requirements: token-management-ui.1.6 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900 mb-1">{errorDetails.message}</p>
                <p className="text-xs text-red-700">{errorDetails.suggestion}</p>
              </div>
            </div>
          </div>

          {/* Google Sign In Button - Requirements: token-management-ui.1.3 */}
          <button
            onClick={onRetry}
            disabled={isDisabled || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium py-3.5 px-6 rounded-lg border border-gray-300 shadow-sm transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                {/* Google Icon */}
                <svg width="20" height="20" viewBox="0 0 24 24">
                  {/* Google logo paths */}
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Ключевые особенности:**
- **Понятные сообщения**: Отображает user-friendly сообщения без технических деталей (token-management-ui.1.6)
- **Поддержка различных ошибок**: Обрабатывает различные errorCode (invalid_grant, network_error, и т.д.)
- **Состояние загрузки**: Показывает spinner во время повторной авторизации
- **Retry функциональность**: Кнопка "Continue with Google" для повторной авторизации (token-management-ui.1.3)

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

**Реализация:** `handleAPIRequest()` проверяет `tokens.expiresAt` перед каждым запросом. Если токен истек, автоматически вызывается `oauthClientManager.refreshAccessToken()`, и Authorization header обновляется с новым токеном. Весь процесс происходит прозрачно для пользователя.

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

// In handleAPIRequest()
if (oauthClientManager) {
  const tokens = await tokenStorage.loadTokens();
  if (tokens && tokens.expiresAt) {
    const isExpired = tokens.expiresAt <= Date.now();

    if (isExpired) {
      logger.info('Access token expired, refreshing automatically');
      const refreshed = await oauthClientManager.refreshAccessToken();

      if (refreshed) {
        logger.info('Token refreshed successfully');
        // Update Authorization header with new token
        const newTokens = await tokenStorage.loadTokens();
        if (newTokens && options.headers) {
          // Update header with new token
        }
      } else {
        logger.info('Token refresh failed, continuing with expired token');
        // Request will likely return 401, which will be handled below
      }
    }
  }
}
```

**Результат:** Если refresh не удался, запрос продолжается с истекшим токеном. API вернет 401, что будет обработано централизованным обработчиком (очистка токенов, показ LoginError).

#### 2. Ошибка API запроса (HTTP 401)

**Причины:**
- Access token истек и не был обновлен вовремя
- Токен был отозван пользователем в настройках Google аккаунта
- Токен стал невалидным по другим причинам

**Обработка:**
```typescript
// Requirements: token-management-ui.1.3, token-management-ui.1.4, token-management-ui.1.5

// In handleAPIRequest()
const response = await fetch(url, options);

if (response.status === 401) {
  // Requirements: token-management-ui.1.4 - Prevent race conditions
  if (!isClearing401) {
    isClearing401 = true;

    try {
      // Requirements: token-management-ui.1.5 - Log error with context
      const logContext = context || 'API Request';
      logger.error(
        `Authorization error (401) from ${logContext}: ${JSON.stringify({
          url,
          timestamp: DateTimeFormatter.formatLogTimestamp(Date.now()),
          context: logContext,
        })}`
      );

      // Requirements: token-management-ui.1.3 - Clear all tokens
      logger.info('Clearing all tokens due to 401 error');
      await tokenStorage.deleteTokens();

      // Requirements: token-management-ui.1.3 - Emit auth error event
      const allWindows = BrowserWindow.getAllWindows();
      const mainWindow = allWindows[0];
      if (mainWindow) {
        mainWindow.webContents.send('auth:error', {
          error: 'Session expired',
          errorCode: 'invalid_grant',
        });
      }
    } finally {
      setTimeout(() => {
        isClearing401 = false;
      }, 100);
    }
  }

  // Requirements: token-management-ui.1.3, token-management-ui.1.6 - Throw user-friendly error
  throw new Error('Your session has expired. Please sign in again.');
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

// Global flag to prevent race conditions
let isClearing401 = false;

// In handleAPIRequest()
if (response.status === 401) {
  // Prevent multiple simultaneous session clears
  if (!isClearing401) {
    isClearing401 = true;

    try {
      logger.error(`Authorization error (401) from ${context}`);
      
      // Clear tokens only once
      await tokenStorage.deleteTokens();

      // Send auth:error event only once
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('auth:error', {
          error: 'Session expired',
          errorCode: 'invalid_grant',
        });
      }
    } finally {
      // Reset flag after a short delay
      setTimeout(() => {
        isClearing401 = false;
      }, 100);
    }
  }

  throw new Error('Your session has expired. Please sign in again.');
}
```

**Результат:** Очистка токенов выполняется только один раз, избегая race conditions и дублирования действий.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс:

```typescript
// Requirements: token-management-ui.1.5

// Create parameterized logger for APIRequestHandler module
const logger = Logger.create('APIRequestHandler');

// Authorization errors
logger.error(
  `Authorization error (401) from ${logContext}: ${JSON.stringify({
    url,
    timestamp: DateTimeFormatter.formatLogTimestamp(Date.now()),
    context: logContext,
  })}`
);

// Token refresh events
logger.info('Access token expired, refreshing automatically');
logger.info('Token refreshed successfully');

// API request errors
logger.error(
  `Request failed for ${logContext}: ${error instanceof Error ? error.message : String(error)}`
);
```

**Формат логов:**
- Использование централизованного Logger класса (см. clerkly.3)
- Параметризованный logger с модулем 'APIRequestHandler'
- Описательное сообщение об ошибке
- JSON объект с контекстом (url, timestamp, context)
- Фиксированный формат timestamp через DateTimeFormatter (см. settings.2.3)

## Стратегия Тестирования

### Двойной Подход к Тестированию

Система управления токенами в UI будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют end-to-end сценарии с реальным Electron и UI

### Модульные Тесты

#### handleAPIRequest Tests

```typescript
describe('handleAPIRequest', () => {
  /* Preconditions: handleAPIRequest called with URL that returns 401
     Action: call handleAPIRequest() with mocked 401 response
     Assertions: deleteTokens called, auth:error event sent, error thrown
     Requirements: token-management-ui.1.3, token-management-ui.1.4 */
  it('should clear tokens and show login on 401 error', async () => {
    // Test handling of HTTP 401 error
  });

  /* Preconditions: multiple simultaneous requests return 401
     Action: call handleAPIRequest() multiple times concurrently
     Assertions: deleteTokens called only once, no race conditions
     Requirements: token-management-ui.1.4 */
  it('should handle multiple simultaneous 401 errors without race conditions', async () => {
    // Test race condition prevention
  });

  /* Preconditions: API request succeeds with 200
     Action: call handleAPIRequest()
     Assertions: response returned, no tokens cleared
     Requirements: token-management-ui.1.4 */
  it('should pass through successful requests without interference', async () => {
    // Test normal operation
  });

  /* Preconditions: access token expired, OAuthClientManager set
     Action: call handleAPIRequest() with expired token
     Assertions: refreshAccessToken called, Authorization header updated
     Requirements: token-management-ui.1.1, token-management-ui.1.2 */
  it('should automatically refresh expired access token', async () => {
    // Test automatic token refresh
  });

  /* Preconditions: API request fails with network error
     Action: call handleAPIRequest()
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

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| token-management-ui.1.1 | ✓ | ✓ |
| token-management-ui.1.2 | ✓ | ✓ |
| token-management-ui.1.3 | ✓ | ✓ |
| token-management-ui.1.4 | ✓ | ✓ |
| token-management-ui.1.5 | ✓ | ✓ |
| token-management-ui.1.6 | ✓ | ✓ |

## Технические Решения

### Интеграция с Существующими Компонентами

#### OAuthClientManager

Существующий класс `OAuthClientManager` (из спецификации google-oauth-auth) уже реализует автоматическое обновление токенов. Интеграция с `handleAPIRequest()` выполняется через функцию `setOAuthClientManager()`.

```typescript
// Requirements: token-management-ui.1.1, token-management-ui.1.2

// In main/index.ts - Initialize OAuth Client Manager
import { setOAuthClientManager } from './auth/APIRequestHandler';

const oauthClient = new OAuthClientManager(
  tokenStorage,
  windowManager,
  userSettingsManager
);

// Set OAuth Client Manager for automatic token refresh in API requests
setOAuthClientManager(oauthClient);
```

**Как работает автоматическое обновление:**

1. **Проверка истечения токена**: `handleAPIRequest()` проверяет `tokens.expiresAt` перед каждым запросом
2. **Автоматический refresh**: Если токен истек, вызывается `oauthClientManager.refreshAccessToken()`
3. **Обновление заголовка**: После успешного refresh, Authorization header обновляется с новым токеном
4. **Прозрачность для пользователя**: Весь процесс происходит в фоне, пользователь не видит никаких изменений

```typescript
// In handleAPIRequest()
if (oauthClientManager) {
  const tokens = await tokenStorage.loadTokens();
  if (tokens && tokens.expiresAt) {
    const now = Date.now();
    const isExpired = tokens.expiresAt <= now;

    if (isExpired) {
      logger.info('Access token expired, refreshing automatically');
      const refreshed = await oauthClientManager.refreshAccessToken();

      if (refreshed) {
        logger.info('Token refreshed successfully');
        // Update Authorization header with new token
        const newTokens = await tokenStorage.loadTokens();
        if (newTokens && options.headers) {
          if (options.headers instanceof Headers) {
            options.headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
          } else {
            (options.headers as Record<string, string>)['Authorization'] =
              `Bearer ${newTokens.accessToken}`;
          }
        }
      }
    }
  }
}
```ed;
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
`handleAPIRequest()` обеспечивает единую точку обработки всех внешних API запросов с автоматической проверкой HTTP 401 статуса и автоматическим обновлением истекших токенов. Это гарантирует консистентное поведение при истечении сессии во всем приложении.

**Предотвращение Race Conditions:**
Использование флага `isClearing401` предотвращает множественные одновременные очистки токенов при получении нескольких ошибок 401, обеспечивая стабильность системы.

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

### Статус Реализации

Все компоненты системы управления токенами в UI уже реализованы:

1. ✅ **handleAPIRequest функция** - Реализована с централизованной обработкой ошибок и автоматическим обновлением токенов
2. ✅ **LoginError компонент** - Реализован для отображения ошибок авторизации с понятными сообщениями
3. ✅ **Интеграция с App компонентом** - Реализована обработка auth:error событий
4. ✅ **Модульные тесты** - Написаны для handleAPIRequest и LoginError
5. ✅ **Функциональные тесты** - Написаны для end-to-end сценариев
6. ✅ **Интеграция с OAuthClientManager** - Реализована через setOAuthClientManager()
7. ✅ **Валидация** - Все тесты проходят успешно

### Ключевые Файлы Реализации

- `src/main/auth/APIRequestHandler.ts` - Централизованный обработчик API запросов
- `src/renderer/components/auth/LoginError.tsx` - Компонент отображения ошибок
- `tests/unit/auth/APIRequestHandler.test.ts` - Модульные тесты
- `tests/unit/auth/LoginError.test.tsx` - Модульные тесты компонента
- `tests/functional/token-management.spec.ts` - Функциональные тесты

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
