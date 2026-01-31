# Документ Дизайна - Google OAuth Аутентификация

## Введение

Этот документ описывает техническую архитектуру системы аутентификации Google OAuth 2.0 с поддержкой PKCE, включая безопасное управление токенами, обработку потоков авторизации и управление пользовательскими сессиями.

## Архитектурный Обзор

### Поток Аутентификации OAuth 2.0 + PKCE

```
┌─────────────┐    1. Клик     ┌─────────────┐
│   Renderer  │──────────────►│ Main Process│
│  (AuthGate) │               │             │
└─────────────┘               └─────────────┘
                                      │
                              2. Генерация PKCE
                                      │
                                      ▼
┌─────────────┐    3. Открытие ┌─────────────┐
│   Browser   │◄──────────────│ HTTP Server │
│   (Google)  │               │ (127.0.0.1) │
└─────────────┘               └─────────────┘
       │                              ▲
       │ 4. Callback                  │
       └──────────────────────────────┘
                                      │
                              5. Обмен токенов
                                      │
                                      ▼
┌─────────────┐               ┌─────────────┐
│   SQLite    │◄──────────────│ Token Store │
│ (encrypted) │  6. Сохранение│ (AES-256)   │
└─────────────┘               └─────────────┘
```

## Компонентная Архитектура

### 1. OAuth Конфигурация (src/auth/auth_google.ts)

**Константы**:

```typescript
export const authGoogleConfig = {
  clientId: "100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com",
  clientSecret: "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",
  scopes: ["openid", "email", "profile"],
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};
```

**PKCE Функции**:

```typescript
export const generatePkceVerifier = (): string => {
  return base64UrlEncode(crypto.randomBytes(32));
};

export const generatePkceChallenge = (verifier: string): string => {
  const hash = crypto.createHash("sha256").update(verifier, "ascii").digest();
  return base64UrlEncode(hash);
};
```

### 2. Управление Токенами (src/auth/token_store.ts)

**Структура Токенов**:

```typescript
export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};
```

**Шифрование AES-256-GCM**:

```typescript
const encryptPayload = (payload: string, key: Buffer): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};
```

**Ключ Шифрования**:

- Генерируется один раз: `crypto.randomBytes(32)`
- Сохраняется в файле: `{userData}/auth.key`
- Загружается при каждом использовании

### 3. HTTP Сервер для Callback (main.ts)

**Инициализация**:

```typescript
const startAuthServer = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    authServer = http.createServer(handleAuthCallback);
    authServer.listen(0, "127.0.0.1", () => {
      const address = authServer!.address() as AddressInfo;
      authServerPort = address.port;
      resolve(authServerPort);
    });
  });
};
```

**Обработка Callback**:

```typescript
const handleAuthCallback = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = new URL(req.url!, `http://127.0.0.1:${authServerPort}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Валидация state для CSRF защиты
  if (state !== pendingAuthState) {
    // Ошибка CSRF
  }

  // Отправка HTML страницы с результатом
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(getAuthorizationCompletionPage(!!code, error));
};
```

### 4. Обмен Кода на Токены (main.ts)

**Запрос к Google**:

```typescript
const exchangeCodeForTokens = async (code: string): Promise<OAuthTokens> => {
  const body = new URLSearchParams({
    client_id: authGoogleConfig.clientId,
    client_secret: authGoogleConfig.clientSecret,
    code,
    code_verifier: pendingCodeVerifier!,
    grant_type: "authorization_code",
    redirect_uri: `http://127.0.0.1:${authServerPort}`,
  });

  const response = await fetch(authGoogleConfig.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
};
```

### 5. Автоматическое Обновление Токенов (main.ts)

**Планирование Обновления**:

```typescript
const scheduleTokenRefresh = (tokens: OAuthTokens): void => {
  if (authRefreshTimer) {
    clearTimeout(authRefreshTimer);
  }

  // Обновляем за 60 секунд до истечения
  const refreshIn = tokens.expiresAt - Date.now() - 60000;

  if (refreshIn > 0) {
    authRefreshTimer = setTimeout(() => {
      refreshTokens(tokens.refreshToken!);
    }, refreshIn);
  }
};
```

**TODO: Обработка Истекших Refresh Tokens**:

- Если refresh_token истек, принудительно разлогинивать пользователя
- Показывать уведомление о необходимости повторной авторизации
- Очищать сохраненные токены из БД

## Обработка Ошибок

### Расширенная Карта Ошибок OAuth

```typescript
const mapAuthErrorMessage = (error?: string | null): string | null => {
  if (!error) return null;

  const errorMap: Record<string, string> = {
    access_denied: "Авторизация была отменена. Попробуйте снова.",
    invalid_request: "Неверный запрос авторизации. Попробуйте снова.",
    unauthorized_client: "Приложение не авторизовано. Обратитесь в поддержку.",
    unsupported_response_type: "Ошибка конфигурации. Обратитесь в поддержку.",
    invalid_scope: "Неверные разрешения. Обратитесь в поддержку.",
    server_error: "Ошибка сервера Google. Попробуйте позже.",
    temporarily_unavailable: "Сервис временно недоступен. Попробуйте позже.",
    invalid_grant: "Сессия истекла. Войдите заново.",
    unsupported_grant_type: "Ошибка конфигурации. Обратитесь в поддержку.",
  };

  const normalized = error.trim().toLowerCase();
  return errorMap[normalized] || error;
};
```

## UI Компоненты

### 1. AuthGate (renderer/src/app/components/auth-gate.tsx)

**Состояния**:

```typescript
type AuthGateState = "idle" | "authorizing" | "error";
```

**Структура**:

```tsx
<div className="flex flex-col items-center justify-center min-h-screen">
  <Logo size="md" showText={true} />
  <h1>Добро пожаловать в Clerkly</h1>

  {errorMessage && <div className="error-message">{errorMessage}</div>}

  <button onClick={handleGoogleSignIn} disabled={isAuthorizing}>
    {isAuthorizing ? "Авторизация..." : "Войти через Google"}
  </button>
</div>
```

### 2. Authorization Completion Page (src/auth/authorization_completion_page.ts)

**HTML Шаблон**:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Clerkly - Авторизация</title>
    <style>
      /* Стили для брендинга */
    </style>
  </head>
  <body>
    <div class="card">
      <svg><!-- Логотип Clerkly --></svg>
      <h1>${success ? "Успешно!" : "Авторизация отменена"}</h1>
      <p>${success ? "Возвращайтесь в приложение" : "Попробуйте снова"}</p>
    </div>
    <script>
      setTimeout(() => window.close(), 300);
    </script>
  </body>
</html>
```

## Безопасность

### 1. PKCE (Proof Key for Code Exchange)

- **Code Verifier**: 32 случайных байта, base64url кодирование
- **Code Challenge**: SHA256 хеш от verifier, base64url кодирование
- **Challenge Method**: S256
- **Хранение**: Verifier только в памяти, очищается после использования

### 2. CSRF Защита

- **State Parameter**: 32 случайных байта, base64url кодирование
- **Валидация**: Проверка соответствия state в callback
- **Хранение**: Только в памяти main процесса

### 3. Шифрование Токенов

- **Алгоритм**: AES-256-GCM
- **IV**: 12 случайных байт для каждого шифрования
- **Ключ**: 32 байта, генерируется один раз, хранится в файле
- **Формат**: IV (12) + AuthTag (16) + Ciphertext (N), base64 кодирование

## Свойства Корректности

### Свойство 1: PKCE Безопасность

**Описание**: Каждый OAuth запрос должен использовать уникальный PKCE verifier

**Формальное Свойство**:

```
∀ auth_request : OAuthRequest
  WHEN auth_request.initiate()
  THEN ∃! verifier : String
    WHERE verifier = generatePkceVerifier()
    AND auth_request.challenge = sha256(verifier)
    AND auth_request.challenge_method = "S256"
```

### Свойство 2: Шифрование Токенов

**Описание**: Все токены должны быть зашифрованы перед сохранением в БД

**Формальное Свойство**:

```
∀ tokens : OAuthTokens
  WHEN writeTokens(db, rootDir, tokens)
  THEN ∃ encrypted_data : String
    WHERE encrypted_data = encrypt_aes256gcm(JSON.stringify(tokens), key)
    AND db.contains(encrypted_data)
    AND ¬db.contains(tokens.accessToken)
```

### Свойство 3: State Валидация

**Описание**: OAuth callback должен валидировать state параметр

**Формальное Свойство**:

```
∀ callback : OAuthCallback
  WHEN callback.state ≠ pendingAuthState
  THEN callback.result = "CSRF_ERROR"
    AND ¬exchangeCodeForTokens(callback.code)
```

### Свойство 4: Автоматическое Обновление

**Описание**: Токены должны обновляться до истечения срока действия

**Формальное Свойство**:

```
∀ tokens : OAuthTokens
  WHEN tokens.expiresAt - now() ≤ 60000
  THEN scheduleTokenRefresh(tokens.refreshToken)
    AND new_tokens.expiresAt > tokens.expiresAt
```

## Тестирование

### E2E Тестирование с Моками

**Переменные Окружения**:

- `CLERKLY_E2E_AUTH_MODE`: "success" | "failure"
- `CLERKLY_E2E_AUTH_SEQUENCE`: "failure,success" (последовательность)

**Логика Моков в main.ts**:

```typescript
if (process.env.CLERKLY_E2E_AUTH_MODE) {
  // Имитация OAuth ответа без реального HTTP запроса
  const mockResult = process.env.CLERKLY_E2E_AUTH_MODE === "success";
  sendAuthResultToRenderer({
    success: mockResult,
    error: mockResult ? undefined : "access_denied",
  });
  return;
}
```

### Unit Tests

- Тестирование PKCE генерации
- Валидация шифрования/дешифрования
- Проверка маппинга ошибок
- Тестирование URL генерации

### Property-Based Tests

- Генерация различных OAuth ошибок
- Тестирование PKCE с различными verifier
- Проверка шифрования с различными ключами
- Валидация state параметров

## Интеграционные Точки

### IPC Каналы

- `auth:open-google` - инициация OAuth потока
- `auth:get-state` - получение статуса авторизации
- `auth:sign-out` - выход из системы
- `auth:result` - отправка результата авторизации в renderer

### Зависимости

- **platform-foundation**: IPC инфраструктура, управление окнами
- **data-storage**: SQLite для хранения зашифрованных токенов

### Предоставляемые Интерфейсы

- Состояние аутентификации для других фич
- Безопасное хранение токенов
- Автоматическое обновление сессии
