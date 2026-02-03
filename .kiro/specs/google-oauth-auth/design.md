# Документ Дизайна: Google OAuth Авторизация

## Обзор

Данный документ описывает архитектуру и дизайн системы авторизации через Google OAuth для Electron приложения Clerkly. Система реализует PKCE (Proof Key for Code Exchange) flow без использования client secret, что соответствует требованиям безопасности для публичных desktop приложений. Авторизация использует deep link схему для перехвата ответа от OAuth провайдера вместо локального сервера.

## Архитектура

### Общая Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Login Screen │  │ Login Error  │  │ Main App UI  │      │
│  │  Component   │  │  Component   │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                            │ IPC                             │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                     Main Process                             │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐     │
│  │              Auth IPC Handlers                      │     │
│  │  - auth:start-login                                 │     │
│  │  - auth:get-status                                  │     │
│  │  - auth:logout                                      │     │
│  └─────────────────────────┬──────────────────────────┘     │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐     │
│  │           OAuth Client Manager                      │     │
│  │  - Generate PKCE parameters                         │     │
│  │  - Open browser with auth URL                       │     │
│  │  - Handle deep link callback                        │     │
│  │  - Exchange code for tokens                         │     │
│  │  - Refresh tokens                                   │     │
│  │  - Revoke tokens                                    │     │
│  └─────────────────────────┬──────────────────────────┘     │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐     │
│  │            Token Storage Manager                    │     │
│  │  - Save tokens to SQLite                            │     │
│  │  - Load tokens from SQLite                          │     │
│  │  - Delete tokens                                    │     │
│  └─────────────────────────┬──────────────────────────┘     │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐     │
│  │              DataManager                            │     │
│  │  (Existing SQLite wrapper)                          │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Window Manager                             │   │
│  │  - Show Login Screen on startup if not authorized    │   │
│  │  - Show Main App if authorized                       │   │
│  │  - Handle window transitions                         │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                             │
                             │ HTTPS
                             ▼
                  ┌──────────────────────┐
                  │   Google OAuth API   │
                  │  - Authorization     │
                  │  - Token Exchange    │
                  │  - Token Refresh     │
                  │  - Token Revoke      │
                  └──────────────────────┘
```


### OAuth PKCE Flow

```
┌─────────┐                                                    ┌─────────┐
│  User   │                                                    │ Google  │
└────┬────┘                                                    └────┬────┘
     │                                                              │
     │ 1. Click "Continue with Google"                             │
     │────────────────────────────────────────────────────────────▶│
     │                                                              │
     │ 2. Generate code_verifier (random 43-128 chars)             │
     │ 3. Generate code_challenge = SHA256(code_verifier)          │
     │ 4. Generate state (random CSRF token)                       │
     │ 5. Save code_verifier and state temporarily                 │
     │                                                              │
     │ 6. Open browser with authorization URL:                     │
     │    - client_id                                              │
     │    - redirect_uri=clerkly://oauth/callback                  │
     │    - response_type=code                                     │
     │    - scope=openid email profile                             │
     │    - code_challenge                                         │
     │    - code_challenge_method=S256                             │
     │    - state                                                  │
     │────────────────────────────────────────────────────────────▶│
     │                                                              │
     │                    User authenticates                        │
     │◀────────────────────────────────────────────────────────────│
     │                                                              │
     │ 7. Google redirects to: clerkly://oauth/callback?           │
     │    code=AUTH_CODE&state=STATE                               │
     │◀────────────────────────────────────────────────────────────│
     │                                                              │
     │ 8. Deep link handler catches redirect                       │
     │ 9. Validate state matches saved value                       │
     │ 10. Extract authorization code                              │
     │                                                              │
     │ 11. Exchange code for tokens (POST to token endpoint):      │
     │     - code=AUTH_CODE                                        │
     │     - client_id                                             │
     │     - redirect_uri=clerkly://oauth/callback                 │
     │     - grant_type=authorization_code                         │
     │     - code_verifier (original random string)                │
     │────────────────────────────────────────────────────────────▶│
     │                                                              │
     │ 12. Receive tokens:                                         │
     │     - access_token                                          │
     │     - refresh_token                                         │
     │     - expires_in                                            │
     │     - token_type                                            │
     │◀────────────────────────────────────────────────────────────│
     │                                                              │
     │ 13. Save tokens to SQLite                                   │
     │ 14. Open main application window                            │
     │                                                              │
```


## Компоненты и Интерфейсы

### 1. OAuth Client Manager

Центральный компонент для управления OAuth flow.

**Интерфейсы:**

```typescript
// OAuth configuration
interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
  scopes: string[];
}

// PKCE parameters
interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

// Token response from Google
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// Stored token data
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  tokenType: string;
}

// Authorization status
interface AuthStatus {
  authorized: boolean;
  error?: string;
}
```

**Методы:**

```typescript
class OAuthClientManager {
  constructor(config: OAuthConfig, tokenStorage: TokenStorageManager);

  // Requirements: google-oauth-auth.1
  async startAuthFlow(): Promise<void>;
  
  // Requirements: google-oauth-auth.2
  handleDeepLink(url: string): Promise<AuthStatus>;
  
  // Requirements: google-oauth-auth.3
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse>;
  
  // Requirements: google-oauth-auth.5
  async getAuthStatus(): Promise<AuthStatus>;
  
  // Requirements: google-oauth-auth.6
  async refreshAccessToken(): Promise<boolean>;
  
  // Requirements: google-oauth-auth.7
  async logout(): Promise<void>;
  
  // Requirements: google-oauth-auth.1
  private generatePKCEParams(): PKCEParams;
  
  // Requirements: google-oauth-auth.1
  private generateCodeVerifier(): string;
  
  // Requirements: google-oauth-auth.1
  private generateCodeChallenge(verifier: string): string;
  
  // Requirements: google-oauth-auth.1
  private generateState(): string;
}
```


### 2. Token Storage Manager

Управляет безопасным хранением токенов в SQLite.

**Интерфейсы:**

```typescript
interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
}
```

**Методы:**

```typescript
class TokenStorageManager {
  constructor(dataManager: DataManager);

  // Requirements: google-oauth-auth.4
  async saveTokens(tokens: TokenData): Promise<void>;
  
  // Requirements: google-oauth-auth.4
  async loadTokens(): Promise<StoredTokens | null>;
  
  // Requirements: google-oauth-auth.4
  async deleteTokens(): Promise<void>;
  
  // Requirements: google-oauth-auth.5
  async hasValidTokens(): Promise<boolean>;
}
```

### 3. Auth IPC Handlers

Обрабатывает IPC коммуникацию между renderer и main процессами.

**IPC Каналы:**

```typescript
// Requirements: google-oauth-auth.8
interface AuthIPCChannels {
  'auth:start-login': () => Promise<{ success: boolean; error?: string }>;
  'auth:get-status': () => Promise<{ authorized: boolean; error?: string }>;
  'auth:logout': () => Promise<{ success: boolean; error?: string }>;
}
```

**Методы:**

```typescript
class AuthIPCHandlers {
  constructor(oauthClient: OAuthClientManager);

  // Requirements: google-oauth-auth.8
  registerHandlers(): void;
  
  // Requirements: google-oauth-auth.8
  unregisterHandlers(): void;
  
  // Requirements: google-oauth-auth.8
  private async handleStartLogin(event: IpcMainInvokeEvent): Promise<IPCResult>;
  
  // Requirements: google-oauth-auth.8
  private async handleGetStatus(event: IpcMainInvokeEvent): Promise<IPCResult>;
  
  // Requirements: google-oauth-auth.8
  private async handleLogout(event: IpcMainInvokeEvent): Promise<IPCResult>;
}
```


### 4. Auth Window Manager

Расширение WindowManager для управления окнами авторизации.

**Методы:**

```typescript
class AuthWindowManager {
  constructor(windowManager: WindowManager, oauthClient: OAuthClientManager);

  // Requirements: google-oauth-auth.14
  async initializeApp(): Promise<void>;
  
  // Requirements: google-oauth-auth.14
  private async showLoginWindow(): Promise<void>;
  
  // Requirements: google-oauth-auth.14
  private async showMainWindow(): Promise<void>;
  
  // Requirements: google-oauth-auth.14
  private async showLoginError(error: string, errorCode?: string): Promise<void>;
  
  // Requirements: google-oauth-auth.14
  private async handleAuthSuccess(): Promise<void>;
  
  // Requirements: google-oauth-auth.14
  private async handleAuthError(error: string, errorCode?: string): Promise<void>;
}
```

### 5. UI Components

React компоненты для отображения экранов авторизации.

**Login Screen Component:**

```typescript
// Requirements: google-oauth-auth.12
interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps): JSX.Element;

// Содержимое компонента:
// - Логотип Clerkly (Logo component, size="lg", showText=false)
// - Заголовок "Clerkly" (text-4xl font-semibold)
// - Карта с заголовком "Welcome" (text-2xl font-semibold)
// - Описание "Your autonomous AI agent that listens, organizes, and acts"
// - Кнопка "Continue with Google" с иконкой Google
// - Превью функций (4 колонки):
//   * "Listen & Transcribe" с иконкой микрофона
//   * "Extract Tasks" с иконкой чеклиста
//   * "Automate Actions" с иконкой обновления
//   * "Auto-Sync" с иконкой молнии
// - Текст "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
```

**Login Error Component:**

```typescript
// Requirements: google-oauth-auth.13
interface LoginErrorProps {
  errorMessage?: string;
  errorCode?: string;
  onRetry: () => void;
}

export function LoginError({ 
  errorMessage, 
  errorCode, 
  onRetry 
}: LoginErrorProps): JSX.Element;

// Содержимое компонента:
// - Все элементы Login Screen (логотип, заголовок "Clerkly", карта "Welcome", описание, кнопка, превью)
// - Дополнительно: красный блок ошибки (bg-red-50 border-red-200) с иконкой AlertCircle
// - Использует getErrorDetails() для маппинга errorCode на человекочитаемые тексты:
//   * popup_closed_by_user: "Sign in cancelled" + детали
//   * access_denied: "Access denied" + детали
//   * network_error: "Network error" + детали
//   * invalid_grant: "Session expired" + детали
//   * invalid_request: "Invalid request" + детали
//   * server_error: "Server error" + детали
//   * temporarily_unavailable: "Service unavailable" + детали
//   * csrf_attack_detected: "Security error" + детали
//   * database_error: "Storage error" + детали
//   * default: "Authentication failed" + errorMessage
```


## Модели Данных

### Database Schema

Токены хранятся в существующей SQLite базе данных через DataManager.

```sql
-- Используется существующая таблица key_value_store
-- Ключи для OAuth токенов:
-- 'oauth_access_token': string
-- 'oauth_refresh_token': string
-- 'oauth_expires_at': string (Unix timestamp)
-- 'oauth_token_type': string
```

### Временное Хранилище PKCE

PKCE параметры хранятся в памяти во время OAuth flow:

```typescript
interface PKCEStorage {
  codeVerifier: string;
  state: string;
  timestamp: number; // для очистки старых данных
}
```

### OAuth Configuration

Конфигурация OAuth хранится в переменных окружения или конфигурационном файле:

```typescript
// .env или config file
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
OAUTH_REDIRECT_URI=clerkly://oauth/callback
OAUTH_SCOPES=openid,email,profile
```


## Свойства Корректности

Свойство (property) - это характеристика или поведение, которое должно выполняться для всех валидных выполнений системы - по сути, формальное утверждение о том, что система должна делать. Свойства служат мостом между человеко-читаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: PKCE Parameters Generation

*For any* OAuth flow initialization, the generated PKCE parameters must satisfy:
- Code verifier length is between 43 and 128 characters
- Code challenge is a valid SHA-256 hash of the code verifier
- State parameter is unique and has sufficient entropy (minimum 32 characters)
- All generated parameters are cryptographically random

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: PKCE Parameters Persistence

*For any* generated PKCE parameters (code verifier and state), saving them to temporary storage and then loading them back should return the exact same values.

**Validates: Requirements 1.4**

### Property 3: Authorization URL Formation

*For any* set of OAuth parameters (client_id, redirect_uri, code_challenge, state, scopes), the generated authorization URL must contain all required parameters with correct values and proper URL encoding.

**Validates: Requirements 1.5**

### Property 4: Deep Link Parameter Extraction

*For any* valid deep link URL in format "clerkly://oauth/callback?code=CODE&state=STATE", extracting parameters should correctly parse both code and state values.

**Validates: Requirements 2.2**

### Property 5: State Validation

*For any* incoming state parameter, if it does not match the stored state value, the OAuth client must reject the request and return an error.

**Validates: Requirements 2.3, 9.4**

### Property 6: Token Exchange Request Formation

*For any* authorization code and code verifier, the token exchange request must include all required parameters (code, client_id, redirect_uri, code_verifier, grant_type) and must NOT include client_secret.

**Validates: Requirements 3.1, 3.2**

### Property 7: Token Response Parsing

*For any* valid token response from Google, the OAuth client must correctly extract access_token, refresh_token, expires_in, and token_type fields.

**Validates: Requirements 3.3**

### Property 8: Token Expiration Calculation

*For any* expires_in value from token response, the calculated expiration timestamp (expiresAt) must equal current timestamp plus expires_in seconds.

**Validates: Requirements 3.5**

### Property 9: Token Storage Round Trip

*For any* valid token data (access_token, refresh_token, expires_at, token_type), saving it to storage and then loading it back should return equivalent token data with all fields preserved.

**Validates: Requirements 4.1, 4.3**

### Property 10: Token Deletion Completeness

*For any* stored tokens, after calling delete operation, attempting to load tokens should return null or empty result.

**Validates: Requirements 4.4**

### Property 11: Auth Status Determination

*For any* token state (no tokens, valid tokens, expired tokens with refresh token, expired tokens without refresh token), the auth status check must return the correct authorization state:
- No tokens → not authorized
- Valid non-expired access token → authorized
- Expired access token with valid refresh token → attempt refresh
- Expired access token without refresh token → not authorized

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 12: Token Refresh Request Formation

*For any* refresh token, the token refresh request must include all required parameters (refresh_token, client_id, grant_type=refresh_token) and must NOT include client_secret.

**Validates: Requirements 6.1, 6.2**

### Property 13: Token Update After Refresh

*For any* successful token refresh response, the token storage must be updated with new access_token and expires_at, and if present, new refresh_token.

**Validates: Requirements 6.3, 6.4**

### Property 14: Logout Token Cleanup

*For any* logout operation (successful or failed revoke request), all tokens must be removed from storage regardless of the revoke endpoint response.

**Validates: Requirements 7.2**

### Property 15: IPC Response Structure

*For any* IPC handler response (success or error), the response must be a structured object containing a success boolean field and optionally an error string field.

**Validates: Requirements 8.5**

### Property 16: Error Propagation

*For any* error returned by Google OAuth API, the OAuth client must propagate the error code and description without modification.

**Validates: Requirements 9.3**

### Property 17: Window State Based on Auth Status

*For any* application startup, if the user is not authorized, the login window must be shown; if authorized, the main application window must be shown.

**Validates: Requirements 11.1**

### Property 18: Error Screen Display

*For any* authentication error, the login error screen must be displayed with the error message and appropriate error code mapping.

**Validates: Requirements 11.5**


## Обработка Ошибок

### Типы Ошибок и Человекочитаемые Сообщения

**1. User Cancellation Errors:**
- Код: `popup_closed_by_user`
- Заголовок: "Sign in cancelled"
- Сообщение: "You closed the sign-in window before completing authentication."
- Предложение: "Please try again and complete the sign-in process."
- Обработка: Показать Login Error Screen

**2. Access Denied Errors:**
- Код: `access_denied`
- Заголовок: "Access denied"
- Сообщение: "You denied access to your Google account."
- Предложение: "Clerkly needs access to your Google account to function properly."
- Обработка: Показать Login Error Screen

**3. Network Errors:**
- Код: `network_error`
- Заголовок: "Network error"
- Сообщение: "Unable to connect to Google authentication servers."
- Предложение: "Please check your internet connection and try again."
- Обработка: Показать Login Error Screen

**4. Session Expired Errors:**
- Код: `invalid_grant`
- Заголовок: "Session expired"
- Сообщение: "Your authentication session has expired."
- Предложение: "Please sign in again to continue."
- Обработка: Очистить токены, показать Login Error Screen

**5. Invalid Request Errors:**
- Код: `invalid_request`
- Заголовок: "Invalid request"
- Сообщение: "The authentication request was malformed."
- Предложение: "Please try again or contact support if the problem persists."
- Обработка: Логировать ошибку, показать Login Error Screen

**6. Server Errors:**
- Код: `server_error`
- Заголовок: "Server error"
- Сообщение: "Google authentication servers are experiencing issues."
- Предложение: "Please try again in a few moments."
- Обработка: Показать Login Error Screen

**7. Service Unavailable Errors:**
- Код: `temporarily_unavailable`
- Заголовок: "Service unavailable"
- Сообщение: "Google authentication service is temporarily unavailable."
- Предложение: "Please try again in a few moments."
- Обработка: Показать Login Error Screen

**8. Security Errors:**
- Код: `csrf_attack_detected`
- Заголовок: "Security error"
- Сообщение: "The authentication request failed security validation."
- Предложение: "Please try signing in again."
- Обработка: Отклонить запрос, логировать инцидент, показать Login Error Screen

**9. Storage Errors:**
- Код: `database_error`
- Заголовок: "Storage error"
- Сообщение: "Unable to save authentication data."
- Предложение: "Please check application permissions and try again."
- Обработка: Логировать ошибку, вернуть структурированный ответ

**10. Unknown Errors:**
- Код: любой другой или отсутствует
- Заголовок: "Authentication failed"
- Сообщение: значение из errorMessage или "An unexpected error occurred during authentication."
- Предложение: "Please try signing in again or contact support if the problem persists."
- Обработка: Логировать ошибку, показать Login Error Screen

### Error Mapping Implementation

```typescript
interface ErrorDetails {
  title: string;
  message: string;
  suggestion: string;
}

function getErrorDetails(errorCode?: string, errorMessage?: string): ErrorDetails {
  const errorMap: Record<string, ErrorDetails> = {
    popup_closed_by_user: {
      title: 'Sign in cancelled',
      message: 'You closed the sign-in window before completing authentication.',
      suggestion: 'Please try again and complete the sign-in process.'
    },
    access_denied: {
      title: 'Access denied',
      message: 'You denied access to your Google account.',
      suggestion: 'Clerkly needs access to your Google account to function properly.'
    },
    network_error: {
      title: 'Network error',
      message: 'Unable to connect to Google authentication servers.',
      suggestion: 'Please check your internet connection and try again.'
    },
    invalid_grant: {
      title: 'Session expired',
      message: 'Your authentication session has expired.',
      suggestion: 'Please sign in again to continue.'
    },
    invalid_request: {
      title: 'Invalid request',
      message: 'The authentication request was malformed.',
      suggestion: 'Please try again or contact support if the problem persists.'
    },
    server_error: {
      title: 'Server error',
      message: 'Google authentication servers are experiencing issues.',
      suggestion: 'Please try again in a few moments.'
    },
    temporarily_unavailable: {
      title: 'Service unavailable',
      message: 'Google authentication service is temporarily unavailable.',
      suggestion: 'Please try again in a few moments.'
    },
    csrf_attack_detected: {
      title: 'Security error',
      message: 'The authentication request failed security validation.',
      suggestion: 'Please try signing in again.'
    },
    database_error: {
      title: 'Storage error',
      message: 'Unable to save authentication data.',
      suggestion: 'Please check application permissions and try again.'
    }
  };

  if (errorCode && errorMap[errorCode]) {
    return errorMap[errorCode];
  }

  return {
    title: 'Authentication failed',
    message: errorMessage || 'An unexpected error occurred during authentication.',
    suggestion: 'Please try signing in again or contact support if the problem persists.'
  };
}
```

### Error Response Format

Все ошибки возвращаются в едином формате:

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  errorCode?: string;
  details?: any;
}
```

### Logging Strategy

Все ошибки логируются с контекстом:

```typescript
console.error(`[OAuth] ${operation} failed: ${error.message}`, {
  errorCode: error.code,
  timestamp: Date.now(),
  context: additionalContext
});
```


## Стратегия Тестирования

### Подход к Тестированию

Система тестирования использует двойной подход:
- **Модульные тесты**: Проверяют конкретные примеры, краевые случаи и условия ошибок
- **Property-based тесты**: Проверяют универсальные свойства на множестве входных данных

Оба типа тестов дополняют друг друга и необходимы для комплексного покрытия.

### Модульные Тесты

**Фокус модульных тестов:**
- Конкретные примеры корректного поведения
- Краевые случаи (пустые токены, истекшие токены, отсутствие сети)
- Условия ошибок (неправильный state, ошибки API, ошибки базы данных)
- Интеграционные точки между компонентами

**Примеры модульных тестов:**
- Проверка регистрации deep link handler при запуске
- Проверка отображения Login Screen при отсутствии токенов
- Проверка обработки конкретных кодов ошибок (popup_closed_by_user, access_denied, network_error)
- Проверка вызова правильных IPC методов

### Property-Based Тесты

**Библиотека:** fast-check (для TypeScript/JavaScript)

**Конфигурация:**
- Минимум 100 итераций на тест
- Каждый тест ссылается на свойство из документа дизайна
- Формат тега: `Feature: google-oauth-auth, Property N: [property text]`

**Генераторы данных:**

```typescript
// Code verifier generator (43-128 chars)
const codeVerifierArb = fc.stringOf(
  fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split('')),
  { minLength: 43, maxLength: 128 }
);

// Token data generator
const tokenDataArb = fc.record({
  accessToken: fc.string({ minLength: 20 }),
  refreshToken: fc.string({ minLength: 20 }),
  expiresAt: fc.integer({ min: Date.now() }),
  tokenType: fc.constant('Bearer')
});

// OAuth error generator
const oauthErrorArb = fc.record({
  error: fc.constantFrom('invalid_grant', 'access_denied', 'invalid_request'),
  error_description: fc.string()
});

// Deep link URL generator
const deepLinkUrlArb = fc.record({
  code: fc.string({ minLength: 10 }),
  state: fc.string({ minLength: 32 })
}).map(({ code, state }) => `clerkly://oauth/callback?code=${code}&state=${state}`);
```

**Примеры property-based тестов:**

```typescript
// Property 1: PKCE Parameters Generation
it('should generate valid PKCE parameters', () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      const params = oauthClient.generatePKCEParams();
      
      // Code verifier length check
      expect(params.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(params.codeVerifier.length).toBeLessThanOrEqual(128);
      
      // Code challenge is valid SHA-256
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(params.codeVerifier)
        .digest('base64url');
      expect(params.codeChallenge).toBe(expectedChallenge);
      
      // State has sufficient entropy
      expect(params.state.length).toBeGreaterThanOrEqual(32);
    }),
    { numRuns: 100 }
  );
});

// Property 9: Token Storage Round Trip
it('should preserve token data through save/load cycle', () => {
  fc.assert(
    fc.property(tokenDataArb, async (tokenData) => {
      await tokenStorage.saveTokens(tokenData);
      const loaded = await tokenStorage.loadTokens();
      
      expect(loaded).toEqual(tokenData);
    }),
    { numRuns: 100 }
  );
});
```

### Функциональные Тесты

**Сценарии end-to-end тестирования:**
1. Полный OAuth flow от клика на кнопку до получения токенов
2. Проверка отображения Login Screen при первом запуске
3. Проверка отображения Main App при наличии валидных токенов
4. Проверка отображения Login Error Screen при ошибке авторизации
5. Проверка logout flow с очисткой токенов

**Инструменты:**
- Spectron или Playwright для Electron
- Моки для Google OAuth API endpoints

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| google-oauth-auth.1.1 | ✓ | ✓ | - |
| google-oauth-auth.1.2 | ✓ | ✓ | - |
| google-oauth-auth.1.3 | ✓ | ✓ | - |
| google-oauth-auth.1.4 | ✓ | ✓ | - |
| google-oauth-auth.1.5 | ✓ | ✓ | - |
| google-oauth-auth.2.1 | ✓ | - | ✓ |
| google-oauth-auth.2.2 | ✓ | ✓ | - |
| google-oauth-auth.2.3 | ✓ | ✓ | - |
| google-oauth-auth.2.4 | ✓ | ✓ | - |
| google-oauth-auth.2.5 | ✓ | - | ✓ |
| google-oauth-auth.3.1 | ✓ | ✓ | - |
| google-oauth-auth.3.2 | ✓ | ✓ | - |
| google-oauth-auth.3.3 | ✓ | ✓ | - |
| google-oauth-auth.3.4 | ✓ | ✓ | - |
| google-oauth-auth.3.5 | ✓ | ✓ | - |
| google-oauth-auth.4.1 | ✓ | ✓ | - |
| google-oauth-auth.4.2 | ✓ | - | - |
| google-oauth-auth.4.3 | ✓ | ✓ | - |
| google-oauth-auth.4.4 | ✓ | ✓ | - |
| google-oauth-auth.4.5 | ✓ | - | - |
| google-oauth-auth.5.1 | ✓ | ✓ | - |
| google-oauth-auth.5.2 | ✓ | - | - |
| google-oauth-auth.5.3 | ✓ | ✓ | - |
| google-oauth-auth.5.4 | ✓ | ✓ | - |
| google-oauth-auth.5.5 | ✓ | ✓ | - |
| google-oauth-auth.5.6 | ✓ | ✓ | - |
| google-oauth-auth.6.1 | ✓ | ✓ | - |
| google-oauth-auth.6.2 | ✓ | ✓ | - |
| google-oauth-auth.6.3 | ✓ | ✓ | - |
| google-oauth-auth.6.4 | ✓ | ✓ | - |
| google-oauth-auth.6.5 | ✓ | - | - |
| google-oauth-auth.7.1 | ✓ | ✓ | - |
| google-oauth-auth.7.2 | ✓ | ✓ | - |
| google-oauth-auth.7.3 | ✓ | - | ✓ |
| google-oauth-auth.7.4 | ✓ | - | ✓ |
| google-oauth-auth.7.5 | - | - | ✓ |
| google-oauth-auth.8.1 | ✓ | - | ✓ |
| google-oauth-auth.8.2 | ✓ | ✓ | - |
| google-oauth-auth.8.3 | ✓ | - | ✓ |
| google-oauth-auth.8.4 | ✓ | ✓ | - |
| google-oauth-auth.8.5 | ✓ | ✓ | - |
| google-oauth-auth.9.1 | ✓ | - | - |
| google-oauth-auth.9.2 | ✓ | - | - |
| google-oauth-auth.9.3 | ✓ | ✓ | - |
| google-oauth-auth.9.4 | ✓ | ✓ | - |
| google-oauth-auth.9.5 | ✓ | - | - |
| google-oauth-auth.10.1 | ✓ | - | - |
| google-oauth-auth.10.2 | ✓ | - | - |
| google-oauth-auth.10.3 | ✓ | - | - |
| google-oauth-auth.10.4 | ✓ | - | - |
| google-oauth-auth.10.5 | ✓ | - | - |
| google-oauth-auth.10.6 | ✓ | - | - |
| google-oauth-auth.11.1 | ✓ | ✓ | ✓ |
| google-oauth-auth.11.2 | ✓ | - | ✓ |
| google-oauth-auth.11.3 | ✓ | - | ✓ |
| google-oauth-auth.11.4 | ✓ | - | ✓ |
| google-oauth-auth.11.5 | ✓ | ✓ | ✓ |
| google-oauth-auth.12.1 | ✓ | - | ✓ |
| google-oauth-auth.12.2 | ✓ | - | ✓ |
| google-oauth-auth.12.3 | ✓ | - | ✓ |
| google-oauth-auth.12.4 | ✓ | - | ✓ |
| google-oauth-auth.12.5 | ✓ | - | ✓ |
| google-oauth-auth.12.6 | ✓ | - | ✓ |
| google-oauth-auth.13.1 | ✓ | - | ✓ |
| google-oauth-auth.13.2 | ✓ | - | ✓ |
| google-oauth-auth.13.3 | ✓ | - | ✓ |
| google-oauth-auth.13.4 | ✓ | - | ✓ |
| google-oauth-auth.13.5 | ✓ | - | ✓ |
| google-oauth-auth.13.6 | ✓ | - | ✓ |
| google-oauth-auth.13.7 | ✓ | - | ✓ |
| google-oauth-auth.14.1 | ✓ | - | ✓ |
| google-oauth-auth.14.2 | ✓ | - | ✓ |
| google-oauth-auth.14.3 | ✓ | - | ✓ |
| google-oauth-auth.14.4 | ✓ | - | ✓ |
| google-oauth-auth.14.5 | ✓ | - | ✓ |
| google-oauth-auth.14.6 | ✓ | - | ✓ |

### Критерии Успеха

Реализация считается успешной когда:
- ✅ Все модульные тесты проходят
- ✅ Все property-based тесты проходят (минимум 100 итераций каждый)
- ✅ Все функциональные тесты проходят
- ✅ Покрытие кода минимум 85%
- ✅ Все требования покрыты тестами
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Все компоненты имеют комментарии с ссылками на требования
- ✅ Все тесты имеют структурированные комментарии (Preconditions, Action, Assertions, Requirements)
