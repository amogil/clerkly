# Документ Дизайна: Google OAuth Авторизация

## Обзор

Данный документ описывает архитектуру и дизайн системы авторизации через Google OAuth для Electron приложения Clerkly. Система реализует PKCE (Proof Key for Code Exchange) flow с использованием client secret, что требуется Google OAuth API даже для Desktop приложений. Несмотря на то, что client secret не может быть полностью защищен в публичных desktop приложениях, Google требует его наличия для всех типов OAuth клиентов. Авторизация использует deep link схему с reverse client ID format для перехвата ответа от OAuth провайдера вместо локального сервера.

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
     │    - redirect_uri=com.googleusercontent.apps.CLIENT_ID:/oauth2redirect │
     │    - response_type=code                                     │
     │    - scope=openid email profile                             │
     │    - code_challenge                                         │
     │    - code_challenge_method=S256                             │
     │    - state                                                  │
     │    - access_type=offline                                    │
     │    - prompt=consent select_account                          │
     │────────────────────────────────────────────────────────────▶│
     │                                                              │
     │                    User authenticates                        │
     │◀────────────────────────────────────────────────────────────│
     │                                                              │
     │ 7. Google redirects to: com.googleusercontent.apps.CLIENT_ID:/oauth2redirect? │
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
     │     - client_secret                                         │
     │     - redirect_uri=com.googleusercontent.apps.CLIENT_ID:/oauth2redirect │
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
     │ 14. Fetch user profile from Google UserInfo API (synchronous)│
     │     - If profile fetch fails: clear tokens, show LoginError │
     │     - If profile fetch succeeds: save profile to database   │
     │ 15. Open main application window (Agents)                │
     │                                                              │
```

### Sign Out Flow

```
User                    Renderer Process         Main Process          Google OAuth
 │                            │                        │                      │
 │ 1. Click "Sign Out"        │                        │                      │
 │───────────────────────────▶│                        │                      │
 │                            │                        │                      │
 │                            │ 2. IPC: auth:logout    │                      │
 │                            │───────────────────────▶│                      │
 │                            │                        │                      │
 │                            │                        │ 3. Revoke token      │
 │                            │                        │─────────────────────▶│
 │                            │                        │                      │
 │                            │                        │ 4. Revoke response   │
 │                            │                        │◀─────────────────────│
 │                            │                        │                      │
 │                            │                        │ 5. Delete tokens     │
 │                            │                        │    from SQLite       │
 │                            │                        │                      │
 │                            │ 6. Event: user.logout (EventBus)            │
 │                            │◀───────────────────────│                      │
 │                            │                        │                      │
 │                            │ 7. Update state:       │                      │
 │                            │    isAuthorized=false  │                      │
 │                            │                        │                      │
 │ 8. Show Login Screen       │                        │                      │
 │◀───────────────────────────│                        │                      │
 │                            │                        │                      │
```

**Примечание:** Если revoke запрос к Google не удается (шаг 3-4), приложение все равно удаляет локальные токены (шаг 5) и показывает Login Screen (шаг 8).


### Система Событий Авторизации

Авторизация использует event-driven архитектуру для коммуникации между Main и Renderer процессами. Все события публикуются через MainEventBus (Main) и RendererEventBus (Renderer).

#### События

| Событие | Направление | Payload | Описание |
|---------|-------------|---------|----------|
| `auth.started` | Renderer → Main | `{}` | Пользователь нажал "Continue with Google" |
| `auth.callback-received` | Main → Renderer | `{}` | Получен deep link от Google |
| `auth.completed` | Main → Renderer | `{ userId: string, profile: UserProfile }` | Авторизация успешна |
| `auth.failed` | Main → Renderer | `{ code: string, message: string }` | Ошибка авторизации |
| `auth.cancelled` | Main → Renderer | `{}` | Пользователь отменил в Google |
| `auth.signed-out` | Main → Renderer | `{}` | Пользователь вышел из системы |

#### UI Состояния

| Состояние | Кнопка | Текст | Loader | Ошибка |
|-----------|--------|-------|--------|--------|
| Начальное | Enabled | "Continue with Google" | Нет | Нет |
| После `auth.callback-received` | Disabled | "Signing in..." | Да | Нет |
| После `auth.completed` | - | - | - | Redirect to Agents |
| После `auth.failed` | Enabled | "Continue with Google" | Нет | Да (сообщение) |
| После `auth.cancelled` | Enabled | "Continue with Google" | Нет | Да ("Аутентификация отменена") |

#### Диаграмма Последовательности: Успешный Вход

```
┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  User    │          │ Renderer │          │   Main   │          │  Google  │
└────┬─────┘          └────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │                     │
     │  Click Login        │                     │                     │
     │────────────────────>│                     │                     │
     │                     │                     │                     │
     │                     │  publish            │                     │
     │                     │  auth.started       │                     │
     │                     │────────────────────>│                     │
     │                     │                     │                     │
     │                     │                     │  Open browser       │
     │                     │                     │────────────────────>│
     │                     │                     │                     │
     │                     │                     │                     │  User logs in
     │                     │                     │                     │<─ ─ ─ ─ ─ ─ ─
     │                     │                     │                     │
     │                     │                     │  Deep link          │
     │                     │                     │  ?code=XXX&state=YY │
     │                     │                     │<────────────────────│
     │                     │                     │                     │
     │                     │  auth.callback-     │                     │
     │                     │  received           │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │  [Disable button]   │                     │                     │
     │  [Show loader]      │                     │                     │
     │  ["Signing in..."]  │                     │                     │
     │<────────────────────│                     │                     │
     │                     │                     │                     │
     │                     │                     │  POST /token        │
     │                     │                     │────────────────────>│
     │                     │                     │                     │
     │                     │                     │  tokens             │
     │                     │                     │<────────────────────│
     │                     │                     │                     │
     │                     │  auth.profile-      │                     │
     │                     │  fetching           │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │                     │                     │  GET /userinfo      │
     │                     │                     │────────────────────>│
     │                     │                     │                     │
     │                     │                     │  profile            │
     │                     │                     │<────────────────────│
     │                     │                     │                     │
     │                     │                     │  Save tokens &      │
     │                     │                     │  profile            │
     │                     │                     │─────────┐           │
     │                     │                     │         │           │
     │                     │                     │<────────┘           │
     │                     │                     │                     │
     │                     │  auth.completed     │                     │
     │                     │  {userId, profile}  │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │  [Hide loader]      │                     │                     │
     │  [Redirect Agents]  │                     │                     │
     │<────────────────────│                     │                     │
     │                     │                     │                     │
```

#### Диаграмма Последовательности: Ошибка Загрузки Профиля

```
┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  User    │          │ Renderer │          │   Main   │          │  Google  │
└────┬─────┘          └────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │                     │
     │  ... (same as above until token exchange) │                     │
     │                     │                     │                     │
     │                     │  auth.profile-      │                     │
     │                     │  fetching           │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │                     │                     │  GET /userinfo      │
     │                     │                     │────────────────────>│
     │                     │                     │                     │
     │                     │                     │  500 Error          │
     │                     │                     │<────────────────────│
     │                     │                     │                     │
     │                     │  auth.failed        │                     │
     │                     │  {code, message}    │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │  [Hide loader]      │                     │                     │
     │  [Enable button]    │                     │                     │
     │  [Show error]       │                     │                     │
     │<────────────────────│                     │                     │
     │                     │                     │                     │
```

#### Диаграмма Последовательности: Отмена Пользователем

```
┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  User    │          │ Renderer │          │   Main   │          │  Google  │
└────┬─────┘          └────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │                     │
     │  ... (auth.started, browser opens)        │                     │
     │                     │                     │                     │
     │                     │                     │                     │  User clicks
     │                     │                     │                     │  "Cancel"
     │                     │                     │                     │<─ ─ ─ ─ ─ ─ ─
     │                     │                     │                     │
     │                     │                     │  Deep link          │
     │                     │                     │  ?error=access_     │
     │                     │                     │  denied             │
     │                     │                     │<────────────────────│
     │                     │                     │                     │
     │                     │  auth.cancelled     │                     │
     │                     │<────────────────────│                     │
     │                     │                     │                     │
     │  [Enable button]    │                     │                     │
     │  [Show "Cancelled"] │                     │                     │
     │<────────────────────│                     │                     │
     │                     │                     │                     │
```

#### Классы Событий

```typescript
// src/shared/events/AuthEvents.ts

// Renderer → Main: Пользователь начал авторизацию
class AuthStartedEvent extends BaseEvent {
  type = 'auth.started';
  payload = {};
}

// Main → Renderer: Получен callback от Google
class AuthCallbackReceivedEvent extends BaseEvent {
  type = 'auth.callback-received';
  payload = {};
}

// Main → Renderer: Авторизация успешна
interface AuthCompletedPayload {
  userId: string;
  profile: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
}
class AuthCompletedEvent extends BaseEvent {
  type = 'auth.completed';
  constructor(public payload: AuthCompletedPayload) { super(); }
}

// Main → Renderer: Ошибка авторизации
interface AuthFailedPayload {
  code: string;   // Код ошибки (token_exchange_failed, profile_fetch_failed, etc.)
  message: string; // Человекочитаемое сообщение
}
class AuthFailedEvent extends BaseEvent {
  type = 'auth.failed';
  constructor(public payload: AuthFailedPayload) { super(); }
}

// Main → Renderer: Пользователь отменил авторизацию
class AuthCancelledEvent extends BaseEvent {
  type = 'auth.cancelled';
  payload = {};
}

// Main → Renderer: Пользователь вышел из системы
class AuthSignedOutEvent extends BaseEvent {
  type = 'auth.signed-out';
  payload = {};
}
```

#### Правила Использования EVENT_TYPES

**КРИТИЧЕСКИ ВАЖНО**: Все идентификаторы событий ДОЛЖНЫ использовать константы из `EVENT_TYPES` вместо захардкоженных строк.

**Источник истины:** `src/shared/events/constants.ts`

```typescript
// src/shared/events/constants.ts
export const EVENT_TYPES = {
  // Auth events
  AUTH_STARTED: 'auth.started',
  AUTH_CALLBACK_RECEIVED: 'auth.callback-received',
  AUTH_COMPLETED: 'auth.completed',
  AUTH_FAILED: 'auth.failed',
  AUTH_CANCELLED: 'auth.cancelled',
  AUTH_SIGNED_OUT: 'auth.signed-out',
  // ... other events
} as const;
```

**Правила:**

1. **Импорт констант**: Всегда импортировать `EVENT_TYPES` из `src/shared/events/constants.ts`
2. **Подписка на события**: Использовать `EVENT_TYPES.AUTH_COMPLETED` вместо `'auth.completed'`
3. **Публикация событий**: Классы событий уже используют `EVENT_TYPES` внутри
4. **Типизация**: `ClerklyEvents` интерфейс использует `EVENT_TYPES` для ключей

**Примеры:**

```typescript
// ✅ ПРАВИЛЬНО
import { EVENT_TYPES } from '../shared/events/constants';
useEventSubscription(EVENT_TYPES.AUTH_COMPLETED, handleAuthCompleted);

// ❌ НЕПРАВИЛЬНО
useEventSubscription('auth.completed', handleAuthCompleted);
```

**Исключение:** В `src/preload/index.ts` константы дублируются из-за ограничения `rootDir` в TypeScript конфигурации. При добавлении новых событий необходимо обновить оба файла.


## Компоненты и Интерфейсы

### 1. OAuth Client Manager

Центральный компонент для управления OAuth flow.

**Интерфейсы:**

```typescript
// OAuth configuration
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
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
  
  // Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8
  // Note: Integrates with UserProfileManager (account-profile spec) for synchronous profile fetch
  private async handleAuthorizationCode(code: string): Promise<AuthStatus>;
  
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

  // Requirements: google-oauth-auth.11.1, google-oauth-auth.11.8
  async initializeApp(): Promise<void>;
  
  // Requirements: google-oauth-auth.11.1
  private async showLoginWindow(): Promise<void>;
  
  // Requirements: google-oauth-auth.11.8
  private async showMainWindow(): Promise<void>;
  
  // Requirements: google-oauth-auth.11.9
  private async showLoginError(error: string, errorCode?: string): Promise<void>;
  
  // Requirements: google-oauth-auth.11.8, google-oauth-auth.15.5
  private async handleAuthSuccess(): Promise<void>;
  
  // Requirements: google-oauth-auth.11.9, google-oauth-auth.15.6
  private async handleAuthError(error: string, errorCode?: string): Promise<void>;
  
  // Requirements: google-oauth-auth.15.1, google-oauth-auth.15.2
  private async showLoader(): Promise<void>;
  
  // Requirements: google-oauth-auth.15.5, google-oauth-auth.15.6
  private async hideLoader(): Promise<void>;
}
```

### 5. UI Components

React компоненты для отображения экранов авторизации.

**Login Screen Component:**

```typescript
// Requirements: google-oauth-auth.12, google-oauth-auth.15
interface LoginScreenProps {
  onLogin: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function LoginScreen({ onLogin, isLoading, isDisabled }: LoginScreenProps): JSX.Element;

// Содержимое компонента:
// - Логотип Clerkly (Logo component, size="lg", showText=false)
// - Заголовок "Clerkly" (text-4xl font-semibold)
// - Карта с заголовком "Welcome" (text-2xl font-semibold)
// - Описание "Your autonomous AI agent that listens, organizes, and acts"
// - Кнопка "Continue with Google" с иконкой Google
//   * Кнопка активна по умолчанию (google-oauth-auth.11.4)
//   * Кнопка неактивна (disabled) когда isDisabled=true (google-oauth-auth.11.7, google-oauth-auth.15.2)
// - Loader (spinner) с текстом "Signing in..." когда isLoading=true (google-oauth-auth.15.1, google-oauth-auth.15.7)
// - Превью функций (4 колонки):
//   * "Listen & Transcribe" с иконкой микрофона
//   * "Extract Tasks" с иконкой чеклиста
//   * "Automate Actions" с иконкой обновления
//   * "Auto-Sync" с иконкой молнии
// - Текст "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
// - Все элементы остаются видимыми во время отображения loader (google-oauth-auth.15.3)
```

**Login Error Component:**

```typescript
// Requirements: google-oauth-auth.13, google-oauth-auth.15
interface LoginErrorProps {
  errorMessage?: string;
  errorCode?: string;
  onRetry: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function LoginError({ 
  errorMessage, 
  errorCode, 
  onRetry,
  isLoading,
  isDisabled
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
//   * profile_fetch_failed: "Profile loading failed" + детали (ui.6.4, ui.6.5)
//   * default: "Authentication failed" + errorMessage
// - Кнопка "Continue with Google" неактивна (disabled) когда isDisabled=true (google-oauth-auth.15.2)
// - Loader отображается когда isLoading=true (google-oauth-auth.15.1)
```

**Settings Component with Sign Out:**

```typescript
// Requirements: google-oauth-auth.14.1
interface SettingsProps {
  onSignOut?: () => void;
}

export function Settings({ onSignOut }: SettingsProps): JSX.Element;

// Содержимое компонента:
// - Различные настройки приложения (автоматическое присоединение к встречам, транскрипция и т.д.)
// - Кнопка "Sign out" с иконкой LogOut
// - При клике на кнопку вызывается onSignOut callback
// - onSignOut в App.tsx вызывает window.api.auth.logout()
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

Конфигурация OAuth хранится как константы в конфигурационном файле кода:

```typescript
// src/main/auth/OAuthConfig.ts
export const OAUTH_CONFIG = {
  clientId: 'YOUR_GOOGLE_CLIENT_ID_HERE', // Replace with your actual Google OAuth Client ID
  clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET_HERE', // Replace with your actual Google OAuth Client Secret
  redirectUri: 'com.googleusercontent.apps.YOUR_CLIENT_ID:/oauth2redirect', // Reverse client ID format
  scopes: ['openid', 'email', 'profile'],
} as const;
```

**Важно:** При формировании `redirect_uri` из Client ID, функция `getOAuthConfig()` автоматически удаляет суффикс `.apps.googleusercontent.com` если он присутствует в Client ID, чтобы избежать дублирования в итоговом URL:

```typescript
// Пример:
// Client ID: 100365225505-xxx.apps.googleusercontent.com
// Redirect URI: com.googleusercontent.apps.100365225505-xxx:/oauth2redirect
// (без дублирования .apps.googleusercontent.com)

const clientIdWithoutSuffix = effectiveClientId.replace('.apps.googleusercontent.com', '');
const effectiveRedirectUri = `com.googleusercontent.apps.${clientIdWithoutSuffix}:/oauth2redirect`;
```


## Свойства Корректности

Свойство (property) - это характеристика или поведение, которое должно выполняться для всех валидных выполнений системы - по сути, формальное утверждение о том, что система должна делать. Свойства служат мостом между человеко-читаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Анализ Критериев Приемки (Prework)

Перед формулированием свойств корректности необходимо проанализировать каждый критерий приемки на предмет тестируемости:

**Требование 1: Инициализация OAuth Flow**

1.1 Генерация Code Verifier
  Мысли: Это генерация случайной строки с определенными ограничениями длины. Можно тестировать генерацией множества code verifiers и проверкой соответствия требованиям длины и криптографической случайности.
  Тестируемость: да - property

1.2 Вычисление Code Challenge
  Мысли: Это детерминированное преобразование (SHA-256 хеш). Можно тестировать генерацией случайных code verifiers, вычислением challenge и проверкой соответствия ожидаемому SHA-256 хешу.
  Тестируемость: да - property

1.3 Генерация state параметра
  Мысли: Это генерация случайного state параметра с достаточной энтропией. Можно тестировать генерацией множества state параметров и проверкой достаточной длины и случайности.
  Тестируемость: да - property

1.4 Сохранение параметров
  Мысли: Это персистентность. Можно тестировать round-trip свойством: сохранить параметры, загрузить их обратно и проверить совпадение.
  Тестируемость: да - property

1.5 Формирование authorization URL
  Мысли: Это формирование URL. Можно тестировать генерацией случайных параметров и проверкой наличия всех требуемых параметров с правильным кодированием.
  Тестируемость: да - property

**Требование 2: Регистрация Deep Link Handler**

2.1 Регистрация protocol handler
  Мысли: Это инициализация системы. Это конкретное действие при запуске, не общее свойство.
  Тестируемость: да - example

2.2 Извлечение параметров из deep link
  Мысли: Это парсинг URL. Можно тестировать генерацией случайных валидных deep link URL и проверкой извлеченных параметров.
  Тестируемость: да - property

2.3 Валидация state (несовпадение)
  Мысли: Это логика валидации. Можно тестировать генерацией случайных несовпадающих state значений и проверкой отклонения.
  Тестируемость: да - property

2.4 Валидация state (совпадение)
  Мысли: Это позитивный случай валидации state. Можно тестировать генерацией совпадающих state значений и проверкой продолжения обработки.
  Тестируемость: да - property (объединяется с 2.3)

2.5 Активация окна
  Мысли: Это UI поведение после обработки. Это конкретное действие.
  Тестируемость: да - example

**Требование 3: Обмен Authorization Code на Токены**

3.1 Формирование token request
  Мысли: Это формирование запроса. Можно тестировать генерацией случайных authorization codes и verifiers и проверкой наличия всех требуемых параметров.
  Тестируемость: да - property

3.2 Отсутствие client_secret
  Мысли: Это проверка отсутствия конкретного поля. Можно тестировать проверкой всех сгенерированных запросов на отсутствие client_secret.
  Тестируемость: да - property (объединяется с 3.1)

3.3 Парсинг token response
  Мысли: Это парсинг ответов. Можно тестировать генерацией случайных валидных token responses и проверкой корректного извлечения всех полей.
  Тестируемость: да - property

3.4 Обработка ошибок от Google
  Мысли: Это обработка ошибок. Можно тестировать генерацией случайных error responses и проверкой возврата описательных сообщений.
  Тестируемость: да - property

3.5 Вычисление времени истечения
  Мысли: Это вычисление. Можно тестировать генерацией случайных expires_in значений и проверкой правильности вычисленного времени истечения.
  Тестируемость: да - property

**Требование 4: Безопасное Хранение Токенов**

4.1 Сохранение токенов
  Мысли: Это персистентность. Можно тестировать round-trip свойством: сохранить токены, загрузить их обратно, проверить совпадение.
  Тестируемость: да - property

4.2 Использование DataManager
  Мысли: Это детали реализации (какой компонент использовать). Это не функциональное требование, которое можно тестировать извне.
  Тестируемость: нет

4.3 Загрузка токенов
  Мысли: Это часть round-trip свойства из 4.1. Вместе с 4.1 тестирует персистентность.
  Тестируемость: да - property (объединяется с 4.1)

4.4 Удаление токенов
  Мысли: Это полнота удаления. Можно тестировать сохранением токенов, удалением, затем проверкой возврата null/empty при загрузке.
  Тестируемость: да - property

4.5 Обработка недоступности БД
  Мысли: Это обработка ошибок для конкретного случая сбоя. Это краевой случай.
  Тестируемость: edge-case

**Требование 5: Проверка Статуса Авторизации**

5.1-5.6 Определение статуса авторизации
  Мысли: Все эти критерии описывают различные случаи определения статуса авторизации (нет токенов, валидные токены, истекшие токены с/без refresh token). Можно объединить в одно комплексное свойство, тестирующее все случаи.
  Тестируемость: да - property (объединенное)

**Требование 6: Обновление Access Token**

6.1 Формирование refresh request
  Мысли: Это формирование запроса для обновления токена. Можно тестировать генерацией случайных refresh tokens и проверкой наличия всех требуемых параметров.
  Тестируемость: да - property

6.2 Отсутствие client_secret
  Мысли: Это проверка отсутствия client_secret в refresh запросах. Можно тестировать проверкой всех сгенерированных refresh запросов.
  Тестируемость: да - property (объединяется с 6.1)

6.3 Обновление access token в storage
  Мысли: Это обновление хранилища после refresh. Можно тестировать выполнением refresh и проверкой корректного обновления storage.
  Тестируемость: да - property

6.4 Обновление refresh token в storage
  Мысли: Это обновление refresh token в storage. Можно тестировать выполнением refresh с новым refresh token и проверкой обновления storage.
  Тестируемость: да - property (объединяется с 6.3)

6.5 Обработка invalid_grant
  Мысли: Это обработка конкретного случая ошибки. Это важный краевой случай.
  Тестируемость: edge-case

**Требование 7: Выход из Системы**

7.1 Отправка revoke request
  Мысли: Это формирование revoke запроса. Можно тестировать генерацией случайных токенов и проверкой корректного формирования revoke запроса.
  Тестируемость: да - property

7.2 Удаление токенов независимо от результата
  Мысли: Это очистка независимо от результата revoke. Можно тестировать выполнением logout и проверкой всегда происходящего удаления токенов.
  Тестируемость: да - property

7.3-7.5 Результаты logout
  Мысли: Это конкретные примеры успешного/неуспешного logout и обновления UI.
  Тестируемость: да - example

**Требование 8: IPC Коммуникация**

8.1 IPC для начала авторизации
  Мысли: Это IPC коммуникация. Это функциональный тестовый сценарий.
  Тестируемость: да - example

8.2 IPC для статуса авторизации
  Мысли: Это IPC коммуникация для статуса. Можно тестировать с различными auth состояниями и проверкой возврата корректного статуса.
  Тестируемость: да - property

8.3 IPC для logout
  Мысли: Это IPC коммуникация для logout. Это функциональный тестовый сценарий.
  Тестируемость: да - example

8.4 Отправка событий
  Мысли: Это event коммуникация. Можно тестировать завершением auth flows и проверкой отправки событий с корректными результатами.
  Тестируемость: да - property

8.5 Структура IPC ответов
  Мысли: Это структура ответов. Можно тестировать вызовом IPC handlers с различными входными данными и проверкой корректной структуры всех ответов.
  Тестируемость: да - property

**Требование 9: Обработка Ошибок**

9.1-9.2 Конкретные ошибки
  Мысли: Это обработка конкретных случаев ошибок. Это краевые случаи.
  Тестируемость: edge-case

9.3 Пропагация ошибок от Google
  Мысли: Это пропагация ошибок. Можно тестировать генерацией случайных Google error responses и проверкой корректной пропагации.
  Тестируемость: да - property

9.4 CSRF ошибка
  Мысли: Это то же самое, что 2.3, валидация state. Уже покрыто.
  Тестируемость: да - property (дубликат 2.3)

9.5 Логирование ошибок
  Мысли: Это поведение логирования. Это не функциональное требование, которое легко тестировать автоматически.
  Тестируемость: нет

9.6 Человекочитаемые сообщения об ошибках
  Мысли: Это маппинг сообщений об ошибках. Можно тестировать генерацией различных error codes и проверкой возврата корректных человекочитаемых сообщений.
  Тестируемость: да - example

**Требование 10: Конфигурация OAuth**

10.1-10.6 Конфигурационные параметры
  Мысли: Это управление конфигурацией. Это детали реализации.
  Тестируемость: нет

**Требование 11: UI Flow Авторизации**

11.1 Отображение Login Screen при отсутствии авторизации
  Мысли: Это состояние окна на основе auth статуса. Можно тестировать запуском приложения с различными auth состояниями и проверкой отображения корректного окна.
  Тестируемость: да - property

11.2-11.4 UI взаимодействия
  Мысли: Это конкретные UI сценарии и переходы.
  Тестируемость: да - example

11.5 Отображение Login Error Screen
  Мысли: Это отображение error screen. Можно тестировать триггерингом различных auth ошибок и проверкой отображения error screen с корректными деталями.
  Тестируемость: да - property

**Требование 12: Login Screen Компонент**

12.1-12.5 Содержимое Login Screen
  Мысли: Это UI контент. Это функциональные тестовые сценарии.
  Тестируемость: да - example

12.6 Соответствие дизайну
  Мысли: Это консистентность дизайна. Это не функциональное требование.
  Тестируемость: нет

**Требование 13: Login Error Screen Компонент**

13.1-13.6 Содержимое Login Error Screen
  Мысли: Это UI контент для различных ошибок. Это функциональные тестовые сценарии.
  Тестируемость: да - example

13.7 Соответствие дизайну
  Мысли: Это консистентность дизайна. Это не функциональное требование.
  Тестируемость: нет

13.8 Повторная попытка через кнопку "Continue with Google"
  Мысли: Login Error Screen использует ту же кнопку "Continue with Google", что и Login Screen, для повторной попытки авторизации. Это логично и консистентно с UX.
  Тестируемость: да - example

**Требование 14: Sign Out Flow**

14.1-14.7 Sign Out Flow
  Мысли: Это конкретные UI сценарии и переходы для выхода из системы.
  Тестируемость: да - example

**Требование 15: Loader во Время Авторизации**

15.1 Отображение loader при получении authorization code
  Мысли: Это UI состояние на основе события (получение deep link). Можно тестировать триггерингом получения authorization code и проверкой отображения loader.
  Тестируемость: да - property

15.2 Деактивация кнопки во время loader
  Мысли: Это UI состояние. Можно тестировать проверкой disabled состояния кнопки когда loader отображается.
  Тестируемость: да - property

15.3 Видимость элементов во время loader
  Мысли: Это UI требование. Можно тестировать проверкой видимости всех элементов Login Screen во время отображения loader.
  Тестируемость: да - example

15.4 Операции во время loader
  Мысли: Это временной интервал отображения loader. Можно тестировать проверкой отображения loader во время обмена токенов и загрузки профиля.
  Тестируемость: да - property

15.5 Скрытие loader при успехе
  Мысли: Это переход состояния UI. Можно тестировать успешным завершением авторизации и проверкой скрытия loader и отображения Agents.
  Тестируемость: да - example

15.6 Скрытие loader при ошибке
  Мысли: Это переход состояния UI при ошибке. Можно тестировать триггерингом ошибки и проверкой скрытия loader и отображения Login Error Screen.
  Тестируемость: да - example

15.7 Внешний вид loader
  Мысли: Это UI детали (spinner, текст). Это функциональный тестовый сценарий.
  Тестируемость: да - example

15.8 Отсутствие loader при закрытии браузера
  Мысли: Это негативный случай (loader НЕ должен отображаться). Можно тестировать закрытием браузера до получения authorization code и проверкой отсутствия loader.
  Тестируемость: да - example

### Рефлексия Свойств

После анализа критериев приемки необходимо проверить свойства на избыточность:

**Анализ избыточности:**

1. **Свойства 1-3** (PKCE генерация, персистентность, URL формирование) - Все уникальны, покрывают разные аспекты OAuth flow
2. **Свойства 4-5** (Deep link парсинг, state валидация) - Уникальны, Property 5 корректно объединяет 2.3 и 9.4
3. **Свойства 6-8** (Token exchange, парсинг, вычисление expiration) - Все уникальны
4. **Свойства 9-10** (Token storage round trip, deletion) - Уникальны, Property 9 корректно объединяет 4.1 и 4.3
5. **Свойство 11** (Auth status determination) - Корректно объединяет множественные случаи (5.1-5.6) в одно комплексное свойство
6. **Свойства 12-13** (Token refresh) - Уникальны, Property 13 корректно объединяет обновление access и refresh tokens
7. **Свойство 14** (Logout cleanup) - Уникально
8. **Свойство 15** (IPC response structure) - Уникально
9. **Свойство 16** (Error propagation) - Уникально
10. **Свойства 17-18** (Window state, error screen) - Уникальны

**Вывод:** Все 19 свойств уникальны и предоставляют различную валидационную ценность. Избыточности не обнаружено. Свойства хорошо спроектированы и комплексны.

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

*For any* authorization code and code verifier, the token exchange request must include all required parameters (code, client_id, client_secret, redirect_uri, code_verifier, grant_type).

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

*For any* refresh token, the token refresh request must include all required parameters (refresh_token, client_id, client_secret, grant_type=refresh_token).

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

**Validates: Requirements 11.9**

### Property 19: Loader Display During Authorization

*For any* authorization flow where authorization code is received, the loader must be displayed on Login Screen with disabled login button until token exchange and profile fetch complete (success or error). Loader must NOT be displayed immediately on button click - only after deep link is received.

**Validates: Requirements 15.1, 15.2, 15.4, 15.9**

### Property 20: Loader State Consistency (Optional)

*For any* combination of isLoading and isDisabled props, the button state and loader visibility must be consistent:
- When isLoading=true: loader is visible AND button is disabled
- When isDisabled=true: button is disabled (regardless of loader state)
- When both false: button is enabled AND loader is hidden

**Validates: Requirements 15.1, 15.2, 15.3**

**Note:** This is an optional property test for additional validation of loader functionality invariants.

### Property 21: Loader Visibility Invariant (Optional)

*For any* sequence of show/hide loader actions, the isLoaderVisible state should match the last action performed (show → true, hide → false).

**Validates: Requirements 15.5, 15.6**

**Note:** This is an optional property test for additional validation of loader state management.

### Property 22: Button State Invariant (Optional)

*For any* combination of isLoading and isDisabled states, the button disabled state should equal (isLoading || isDisabled).

**Validates: Requirements 15.1, 15.2**

**Note:** This is an optional property test for additional validation of button state logic.


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

**10. Profile Fetch Failed Errors:**
- Код: `profile_fetch_failed`
- Заголовок: "Profile loading failed"
- Сообщение: "Unable to load your Google profile information."
- Предложение: "Please check your internet connection and try signing in again."
- Обработка: Очистить токены, показать Login Error Screen

**11. Unknown Errors:**
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
    },
    profile_fetch_failed: {
      title: 'Profile loading failed',
      message: 'Unable to load your Google profile information.',
      suggestion: 'Please check your internet connection and try signing in again.'
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

Все ошибки логируются с контекстом через централизованный Logger класс (clerkly.3):

```typescript
// Requirements: clerkly.3.1, clerkly.3.5, clerkly.3.6
const logger = Logger.create('OAuth');

logger.error(`${operation} failed: ${error.message}`, {
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

Всего определено **22 свойства корректности** (19 обязательных + 3 опциональных), которые проверяются через property-based тесты.

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
6. **Проверка таймингов loader: НЕ показывается сразу при клике, показывается только после deep link** - `tests/functional/auth-flow.spec.ts` - "should NOT show loader immediately after login click, only after deep link"

**Инструменты:**
- Playwright для Electron
- Mock OAuth server для симуляции Google OAuth API

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
| google-oauth-auth.9.6 | ✓ | - | ✓ |
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
| google-oauth-auth.11.5 | ✓ | - | ✓ |
| google-oauth-auth.11.6 | ✓ | - | ✓ |
| google-oauth-auth.11.7 | ✓ | - | ✓ |
| google-oauth-auth.11.8 | ✓ | - | ✓ |
| google-oauth-auth.11.9 | ✓ | ✓ | ✓ |
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
| google-oauth-auth.13.8 | ✓ | - | ✓ |
| google-oauth-auth.14.1 | ✓ | - | ✓ |
| google-oauth-auth.14.2 | ✓ | - | ✓ |
| google-oauth-auth.14.3 | ✓ | - | ✓ |
| google-oauth-auth.14.4 | ✓ | - | ✓ |
| google-oauth-auth.14.5 | ✓ | - | ✓ |
| google-oauth-auth.14.6 | ✓ | - | ✓ |
| google-oauth-auth.14.7 | ✓ | - | ✓ |
| google-oauth-auth.15.1 | ✓ | ✓ | ✓ |
| google-oauth-auth.15.2 | ✓ | ✓ | ✓ |
| google-oauth-auth.15.3 | ✓ | - | ✓ |
| google-oauth-auth.15.4 | ✓ | ✓ | ✓ |
| google-oauth-auth.15.5 | ✓ | - | ✓ |
| google-oauth-auth.15.6 | ✓ | - | ✓ |
| google-oauth-auth.15.7 | ✓ | - | ✓ |
| google-oauth-auth.15.8 | ✓ | - | ✓ |
| google-oauth-auth.15.9 | - | - | ✓ |

### Критерии Успеха

Реализация считается успешной когда:
- ✅ Все модульные тесты проходят
- ✅ Все property-based тесты проходят (минимум 100 итераций каждый, всего 22 свойства: 19 обязательных + 3 опциональных)
- ✅ Все функциональные тесты проходят
- ✅ Покрытие кода минимум 85%
- ✅ Все требования покрыты тестами
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Все компоненты имеют комментарии с ссылками на требования
- ✅ Все тесты имеют структурированные комментарии (Preconditions, Action, Assertions, Requirements)
