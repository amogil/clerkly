# Задачи: Google OAuth Авторизация

## Обзор

Данный документ содержит план реализации системы авторизации через Google OAuth для Electron приложения Clerkly. Система включает 22 свойства корректности (19 обязательных + 3 опциональных), которые проверяются через property-based тесты, а также полный набор модульных и функциональных тестов.

## Статус Реализации

✅ **Все задачи выполнены** - Полная реализация Google OAuth авторизации завершена со всеми тестами и документацией.

## 1. Настройка Инфраструктуры OAuth

### 1.1 Создать конфигурацию OAuth
- [x] Создать файл `src/main/auth/OAuthConfig.ts` с интерфейсами и константами
- [x] Определить интерфейсы: `OAuthConfig`, `PKCEParams`, `TokenResponse`, `TokenData`, `AuthStatus`
- [x] Добавить константы для Google OAuth endpoints (authorization, token, revoke)
- [x] Добавить константу `clientId` в `OAUTH_CONFIG` для настройки Client ID
- [x] Добавить конфигурацию redirect_uri, scopes
- **Requirements:** google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6

### 1.2 Создать модульные тесты для конфигурации OAuth
- [x] Создать файл `tests/unit/auth/OAuthConfig.test.ts`
- [x] Тест: проверка наличия всех обязательных полей конфигурации
- [x] Тест: проверка корректности формата redirect_uri
- [x] Тест: проверка наличия всех необходимых scopes
- [x] Тест: проверка удаления дублирующегося суффикса `.apps.googleusercontent.com` из redirect_uri
- [x] Тест: проверка обработки различных форматов Client ID (с суффиксом и без)
- **Requirements:** google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3

### 1.3 Создать property-based тесты для конфигурации OAuth
- [x] Создать файл `tests/property/auth/OAuthConfig.property.test.ts`
- [x] Property тест: проверка валидности конфигурации
- **Requirements:** google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3

## 2. Реализация Token Storage Manager

### 2.1 Создать Token Storage Manager
- [x] Создать файл `src/main/auth/TokenStorageManager.ts`
- [x] Реализовать класс `TokenStorageManager` с конструктором, принимающим `DataManager`
- [x] Реализовать метод `saveTokens(tokens: TokenData): Promise<void>`
- [x] Реализовать метод `loadTokens(): Promise<StoredTokens | null>`
- [x] Реализовать метод `deleteTokens(): Promise<void>`
- [x] Реализовать метод `hasValidTokens(): Promise<boolean>`
- [x] Добавить обработку ошибок базы данных
- **Requirements:** google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.4.5

### 2.2 Создать модульные тесты для Token Storage Manager
- [x] Создать файл `tests/unit/auth/TokenStorageManager.test.ts`
- [x] Тест: сохранение токенов в базу данных
- [x] Тест: загрузка токенов из базы данных
- [x] Тест: удаление токенов из базы данных
- [x] Тест: проверка наличия валидных токенов (не истекших)
- [x] Тест: проверка наличия истекших токенов
- [x] Тест: обработка ошибок базы данных
- [x] Тест: возврат null при отсутствии токенов
- **Requirements:** google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.4.5

### 2.3 Создать property-based тесты для Token Storage Manager
- [x] Создать файл `tests/property/auth/TokenStorageManager.property.test.ts`
- [x] Property тест: **Property 9 - Token Storage Round Trip**
  - *For any* valid token data, saving and loading should preserve all fields
- [x] Property тест: **Property 10 - Token Deletion Completeness**
  - *For any* stored tokens, deletion should result in null on load
- [x] Создать генератор `tokenDataArb` для случайных токенов
- **Requirements:** google-oauth-auth.4.1, google-oauth-auth.4.3, google-oauth-auth.4.4

### 2.4 Создать property-based тесты для Token Refresh
- [x] Создать файл `tests/property/auth/TokenRefresh.property.test.ts`
- [x] Property тест: **Property 13 - Token Update After Refresh**
  - *For any* successful refresh response, storage must update with new tokens
- [x] Создать генератор для refresh token responses
- **Requirements:** google-oauth-auth.6.3, google-oauth-auth.6.4

## 3. Реализация OAuth Client Manager

### 3.1 Создать базовую структуру OAuth Client Manager
- [x] Создать файл `src/main/auth/OAuthClientManager.ts`
- [x] Реализовать класс `OAuthClientManager` с конструктором
- [x] Добавить приватные поля для хранения конфигурации и PKCE параметров
- [x] Реализовать метод `generateCodeVerifier(): string` (43-128 символов)
- [x] Реализовать метод `generateCodeChallenge(verifier: string): string` (SHA-256)
- [x] Реализовать метод `generateState(): string` (минимум 32 символа)
- [x] Реализовать метод `generatePKCEParams(): PKCEParams`
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4

### 3.2 Реализовать инициализацию OAuth flow
- [x] Реализовать метод `startAuthFlow(): Promise<void>`
- [x] Генерация PKCE параметров
- [x] Сохранение code_verifier и state во временное хранилище
- [x] Формирование authorization URL с всеми параметрами
- [x] Открытие системного браузера с authorization URL
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5

### 3.3 Реализовать обработку deep link callback
- [x] Реализовать метод `handleDeepLink(url: string): Promise<AuthStatus>`
- [x] Извлечение параметров code и state из URL
- [x] Валидация state параметра
- [x] Вызов метода обмена кода на токены
- [x] Возврат статуса авторизации
- **Requirements:** google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4

### 3.4 Реализовать обмен кода на токены
- [x] Реализовать приватный метод `exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse>`
- [x] Формирование POST запроса на token endpoint
- [x] Добавление параметров: code, client_id, client_secret, redirect_uri, code_verifier, grant_type
- [x] Включить client_secret в запрос (требование Google OAuth API)
- [x] Обработка успешного ответа от Google
- [x] Обработка ошибок от Google
- [x] Вычисление времени истечения токена
- [x] Сохранение токенов через TokenStorageManager
- **Requirements:** google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.4, google-oauth-auth.3.5

### 3.5 Реализовать проверку статуса авторизации
- [x] Реализовать метод `getAuthStatus(): Promise<AuthStatus>`
- [x] Проверка наличия токенов в TokenStorage
- [x] Проверка срока действия access token
- [x] Попытка обновления токена при истечении
- [x] Возврат корректного статуса авторизации
- **Requirements:** google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.5.5, google-oauth-auth.5.6

### 3.6 Реализовать обновление access token
- [x] Реализовать метод `refreshAccessToken(): Promise<boolean>`
- [x] Формирование POST запроса на token endpoint с refresh_token
- [x] Включить client_secret в запрос (требование Google OAuth API)
- [x] Обработка успешного ответа (обновление access_token и expires_at)
- [x] Обработка нового refresh_token если предоставлен
- [x] Обработка ошибки invalid_grant (очистка токенов)
- **Requirements:** google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5

### 3.7 Реализовать выход из системы
- [x] Реализовать метод `logout(): Promise<void>`
- [x] Отправка запроса на revoke endpoint Google
- [x] Удаление токенов из TokenStorage независимо от результата
- [x] Возврат статуса выхода
- **Requirements:** google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.7.3, google-oauth-auth.7.4

### 3.8 Создать модульные тесты для OAuth Client Manager
- [x] Создать файл `tests/unit/auth/OAuthClientManager.test.ts`
- [x] Тест: генерация code verifier корректной длины
- [x] Тест: генерация code challenge как SHA-256 от verifier
- [x] Тест: генерация state достаточной длины
- [x] Тест: формирование authorization URL с всеми параметрами
- [x] Тест: извлечение параметров из deep link URL
- [x] Тест: валидация state параметра (успех и отказ)
- [x] Тест: формирование token exchange request с client_secret
- [x] Тест: парсинг token response
- [x] Тест: вычисление времени истечения токена
- [x] Тест: определение статуса авторизации для разных состояний
- [x] Тест: формирование refresh token request с client_secret
- [x] Тест: обработка успешного refresh
- [x] Тест: обработка invalid_grant при refresh
- [x] Тест: logout с успешным revoke
- [x] Тест: logout с неуспешным revoke
- [x] Тест: обработка сетевых ошибок
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.9.2

### 3.9 Создать property-based тесты для OAuth Client Manager
- [x] Создать файл `tests/property/auth/OAuthClientManager.property.test.ts`
- [x] Property тест: **Property 1 - PKCE Parameters Generation**
  - *For any* OAuth flow initialization, PKCE parameters must be valid
- [x] Property тест: **Property 2 - PKCE Parameters Persistence**
  - *For any* generated PKCE parameters, save/load should preserve values
- [x] Property тест: **Property 3 - Authorization URL Formation**
  - *For any* OAuth parameters, URL must contain all required fields
- [x] Property тест: **Property 4 - Deep Link Parameter Extraction**
  - *For any* valid deep link URL, parameters should be correctly parsed
- [x] Property тест: **Property 5 - State Validation**
  - *For any* incoming state, mismatches must be rejected
- [x] Property тест: **Property 6 - Token Exchange Request Formation**
  - *For any* authorization code, request must include all required parameters
- [x] Property тест: **Property 7 - Token Response Parsing**
  - *For any* valid token response, all fields must be correctly extracted
- [x] Property тест: **Property 8 - Token Expiration Calculation**
  - *For any* expires_in value, expiration timestamp must be correct
- [x] Property тест: **Property 11 - Auth Status Determination**
  - *For any* token state, auth status must be correctly determined
- [x] Property тест: **Property 12 - Token Refresh Request Formation**
  - *For any* refresh token, request must include all required parameters
- [x] Property тест: **Property 14 - Logout Token Cleanup**
  - *For any* logout operation, all tokens must be removed
- [x] Property тест: **Property 16 - Error Propagation**
  - *For any* Google OAuth error, error must be propagated without modification
- [x] Создать генераторы: `codeVerifierArb`, `deepLinkUrlArb`, `oauthErrorArb`
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.7.2, google-oauth-auth.9.3, google-oauth-auth.9.4

## 4. Реализация Deep Link Handler

### 4.1 Создать Deep Link Handler
- [x] Добавить регистрацию custom protocol handler в `src/main/index.ts`
- [x] Запросить single instance lock ПЕРЕД регистрацией protocol handler
- [x] Зарегистрировать схему в формате "com.googleusercontent.apps.CLIENT_ID" при запуске приложения
- [x] Добавить обработчик события `open-url` (macOS) и `second-instance` (Windows/Linux)
- [x] Передать URL в OAuthClientManager.handleDeepLink()
- [x] Активировать окно приложения после обработки deep link
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.5, google-oauth-auth.2.6

### 4.2 Создать модульные тесты для Deep Link Handler
- [x] Создать файл `tests/unit/auth/DeepLinkHandler.test.ts`
- [x] Тест: регистрация protocol handler при запуске
- [x] Тест: обработка deep link с валидными параметрами
- [x] Тест: активация окна после обработки deep link
- [x] Тест: обработка deep link с невалидными параметрами
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.5

## 5. Реализация Auth IPC Handlers

### 5.1 Создать Auth IPC Handlers
- [x] Создать файл `src/main/auth/AuthIPCHandlers.ts`
- [x] Реализовать класс `AuthIPCHandlers` с конструктором
- [x] Реализовать метод `registerHandlers(): void`
- [x] Реализовать метод `unregisterHandlers(): void`
- [x] Реализовать handler `auth:start-login`
- [x] Реализовать handler `auth:get-status`
- [x] Реализовать handler `auth:logout`
- [x] Добавить обработку ошибок и структурированные ответы
- [x] Добавить отправку событий в renderer process при завершении авторизации
- **Requirements:** google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5

### 5.2 Создать модульные тесты для Auth IPC Handlers
- [x] Создать файл `tests/unit/auth/AuthIPCHandlers.test.ts`
- [x] Тест: регистрация всех IPC handlers
- [x] Тест: handler auth:start-login вызывает startAuthFlow
- [x] Тест: handler auth:get-status возвращает статус авторизации
- [x] Тест: handler auth:logout вызывает logout
- [x] Тест: структура ответов (success и error поля)
- [x] Тест: обработка ошибок в handlers
- [x] Тест: отправка событий в renderer process
- **Requirements:** google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5

### 5.3 Создать property-based тесты для Auth IPC Handlers
- [x] Создать файл `tests/property/auth/AuthIPCHandlers.property.test.ts`
- [x] Property тест: **Property 15 - IPC Response Structure**
  - *For any* IPC handler response, must contain success boolean and optional error string
- **Requirements:** google-oauth-auth.8.5

## 6. Реализация UI Components

### 6.1 Создать Login Screen Component
- [x] Создать файл `src/renderer/components/auth/LoginScreen.tsx`
- [x] Добавить логотип Clerkly (Logo component, size="lg", showText=false)
- [x] Добавить заголовок "Clerkly" (text-4xl font-semibold)
- [x] Добавить карту с заголовком "Welcome" (text-2xl font-semibold)
- [x] Добавить описание "Your autonomous AI agent that listens, organizes, and acts"
- [x] Добавить кнопку "Continue with Google" с иконкой Google
- [x] Добавить превью функций (4 колонки): Listen & Transcribe, Extract Tasks, Automate Actions, Auto-Sync
- [x] Добавить текст "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
- [x] Добавить обработчик клика на кнопку (вызов IPC auth:start-login)
- [x] Добавить props `isLoading` и `isDisabled` в интерфейс LoginScreenProps
- [x] Добавить loader (spinner) с текстом "Signing in..." когда isLoading=true
- [x] Деактивировать кнопку "Continue with Google" когда isDisabled=true
- [x] Обеспечить видимость всех элементов Login Screen во время отображения loader
- **Requirements:** google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.12.5, google-oauth-auth.12.6, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.7

### 6.2 Создать Login Error Component
- [x] Создать файл `src/renderer/components/auth/LoginError.tsx`
- [x] Добавить все элементы Login Screen
- [x] Добавить красный блок ошибки (bg-red-50 border-red-200) с иконкой AlertCircle
- [x] Реализовать функцию `getErrorDetails(errorCode, errorMessage)` для маппинга ошибок
- [x] Добавить маппинг для всех типов ошибок (popup_closed_by_user, access_denied, network_error, и т.д.)
- [x] Отображать заголовок, сообщение и предложение из маппинга
- [x] Добавить обработчик retry (вызов onRetry prop при клике на кнопку "Continue with Google")
- [x] Добавить props `isLoading` и `isDisabled` в интерфейс LoginErrorProps
- [x] Деактивировать кнопку "Continue with Google" когда isDisabled=true
- [x] Отображать loader когда isLoading=true
- **Примечание:** LoginError использует ту же кнопку "Continue with Google", что и LoginScreen, для повторной попытки авторизации
- **Requirements:** google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6, google-oauth-auth.13.7, google-oauth-auth.13.8, google-oauth-auth.9.6, google-oauth-auth.15.1, google-oauth-auth.15.2

### 6.3 Создать модульные тесты для UI Components
- [x] Создать файл `tests/unit/auth/LoginScreen.test.tsx`
- [x] Тест: отображение всех элементов Login Screen
- [x] Тест: клик на кнопку "Continue with Google" вызывает onLogin
- [x] Тест: отображение loader когда isLoading=true
- [x] Тест: деактивация кнопки когда isDisabled=true
- [x] Тест: видимость всех элементов во время отображения loader
- [x] Создать файл `tests/unit/auth/LoginError.test.tsx`
- [x] Тест: отображение всех элементов Login Screen
- [x] Тест: отображение блока ошибки
- [x] Тест: корректный маппинг для каждого типа ошибки
- [x] Тест: клик на retry вызывает onRetry
- [x] Тест: отображение loader когда isLoading=true (LoginError)
- [x] Тест: деактивация кнопки когда isDisabled=true (LoginError)
- **Requirements:** google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3

### 6.4 Добавить кнопку Sign Out в Settings
- [x] Обновить `src/renderer/components/settings.tsx` для добавления кнопки Sign Out
- [x] Добавить prop `onSignOut` в интерфейс SettingsProps
- [x] Добавить кнопку с иконкой LogOut и текстом "Sign out"
- [x] Обработчик клика вызывает onSignOut callback
- [x] Обновить `src/renderer/App.tsx` для добавления handleSignOut функции
- [x] handleSignOut вызывает window.api.auth.logout()
- [x] Передать handleSignOut в Settings компонент через prop onSignOut
- **Requirements:** google-oauth-auth.14.1

## 7. Реализация Auth Window Manager

### 7.1 Создать Auth Window Manager
- [x] Создать файл `src/main/auth/AuthWindowManager.ts`
- [x] Реализовать класс `AuthWindowManager` с конструктором
- [x] Реализовать метод `initializeApp(): Promise<void>`
- [x] Реализовать приватный метод `showLoginWindow(): Promise<void>`
- [x] Реализовать приватный метод `showMainWindow(): Promise<void>`
- [x] Реализовать приватный метод `showLoginError(error: string, errorCode?: string): Promise<void>`
- [x] Реализовать приватный метод `handleAuthSuccess(): Promise<void>`
- [x] Реализовать приватный метод `handleAuthError(error: string, errorCode?: string): Promise<void>`
- [x] Интегрировать с существующим WindowManager
- [x] Реализовать приватный метод `showLoader(): Promise<void>` для отображения loader на Login Screen
- [x] Реализовать приватный метод `hideLoader(): Promise<void>` для скрытия loader
- [x] Обновить `handleAuthSuccess()` для вызова hideLoader() перед показом Agents
- [x] Обновить `handleAuthError()` для вызова hideLoader() перед показом Login Error Screen
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.11.8, google-oauth-auth.11.9, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.5, google-oauth-auth.15.6

### 7.2 Создать модульные тесты для Auth Window Manager
- [x] Создать файл `tests/unit/auth/AuthWindowManager.test.ts`
- [x] Тест: проверка статуса авторизации при запуске
- [x] Тест: показ Login Window при отсутствии авторизации
- [x] Тест: показ Main Window при наличии авторизации
- [x] Тест: закрытие Login Window и открытие Main Window при успешной авторизации
- [x] Тест: обновление содержимого окна на Login Error Screen при ошибке
- [x] Тест: обновление содержимого окна на Login Screen при retry
- [x] Тест: вызов showLoader() при получении authorization code
- [x] Тест: вызов hideLoader() при успешной авторизации
- [x] Тест: вызов hideLoader() при ошибке авторизации
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.5, google-oauth-auth.15.6

### 7.3 Создать property-based тесты для Auth Window Manager
- [x] Создать файл `tests/property/auth/AuthWindowManager.property.test.ts`
- [x] Property тест: **Property 17 - Window State Based on Auth Status**
  - *For any* application startup, correct window must be shown based on auth status
- [x] Property тест: **Property 18 - Error Screen Display**
  - *For any* authentication error, error screen must display with correct mapping
- [x] Property тест: **Property 19 - Loader Display During Authorization**
  - *For any* authorization flow where authorization code is received, loader must be displayed on Login Screen with disabled login button until token exchange and profile fetch complete
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.5, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.4

## 8. Обработка Ошибок

### 8.1 Реализовать централизованную обработку ошибок
- [x] Создать файл `src/main/auth/ErrorHandler.ts`
- [x] Реализовать функцию `getErrorDetails(errorCode?: string, errorMessage?: string): ErrorDetails`
- [x] Добавить маппинг для всех типов ошибок (popup_closed_by_user, access_denied, network_error, invalid_grant, invalid_request, server_error, temporarily_unavailable, csrf_attack_detected, database_error, profile_fetch_failed)
- [x] Реализовать функцию логирования ошибок с контекстом через Logger класс (clerkly.3)
- [x] Добавить интерфейсы `ErrorDetails` и `ErrorResponse`
- **Requirements:** google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6
- **Примечание:** Задача зависит от clerkly.3.1 (создание Logger класса)

### 8.2 Создать модульные тесты для обработки ошибок
- [x] Создать файл `tests/unit/auth/ErrorHandler.test.ts`
- [x] Тест: маппинг для каждого типа ошибки
- [x] Тест: возврат default ошибки для неизвестного кода
- [x] Тест: использование errorMessage для default ошибки
- [x] Тест: структура ErrorResponse
- [x] Тест: логирование ошибок с контекстом через Logger класс
- **Requirements:** google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6
- **Примечание:** Задача зависит от clerkly.3.1 и clerkly.3.2 (создание Logger класса и тестов)

### 8.3 Создать property-based тесты для обработки ошибок
- [x] Создать файл `tests/property/auth/ErrorHandler.property.test.ts`
- [x] Property тест: **Property 16 - Error Propagation** (дубликат из 3.9, проверка централизованной обработки)
  - *For any* error code, error details must be correctly mapped
- **Requirements:** google-oauth-auth.9.3

### 8.4 Создать property-based тесты для Loader Functionality
- [x] Создать файл `tests/property/auth/LoaderState.property.test.tsx`
- [x] Property тест: **Property 20 - Loader State Consistency**
  - *For any* combination of isLoading and isDisabled, button state and loader visibility must be consistent
- [x] Property тест: **Property 21 - Loader Visibility Invariant**
  - *For any* sequence of show/hide actions, isLoaderVisible should match the last action
- [x] Property тест: **Property 22 - Button State Invariant**
  - *For any* combination of isLoading and isDisabled, button disabled state should be (isLoading || isDisabled)
- **Requirements:** google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.5, google-oauth-auth.15.6
- **Примечание:** Опциональные тесты для дополнительной проверки инвариантов loader functionality. Эти тесты не являются обязательными для завершения задачи, но рекомендуются для повышения уверенности в корректности реализации.

## 9. Интеграция с Существующей Системой

### 9.1 Интегрировать OAuth в main process
- [x] Обновить `src/main/index.ts` для инициализации OAuth компонентов
- [x] Создать экземпляры TokenStorageManager, OAuthClientManager, AuthIPCHandlers
- [x] Зарегистрировать deep link handler
- [x] Зарегистрировать IPC handlers
- [x] Инициализировать AuthWindowManager
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.8.1, google-oauth-auth.11.1

### 9.2 Обновить preload script
- [x] Обновить `src/preload/index.ts` для экспорта auth API
- [x] Добавить методы: startLogin, getAuthStatus, logout
- [x] Добавить типы для auth API
- **Requirements:** google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3

### 9.3 Создать модульные тесты для интеграции
- [x] Создать файл `tests/unit/auth/Integration.test.ts`
- [x] Тест: инициализация всех OAuth компонентов
- [x] Тест: регистрация deep link handler
- [x] Тест: регистрация IPC handlers
- [x] Тест: доступность auth API в preload
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.8.1

## 10. Функциональные Тесты

### 10.1 Создать функциональные тесты для OAuth flow
- [x] Создать файл `tests/functional/oauth-flow.spec.ts`
- [x] Тест: отсутствие токенов при первом запуске
- [x] Тест: загрузка токенов из базы данных при запуске
- [x] Тест: обнаружение истекших токенов
- [x] Тест: удаление токенов при logout
- [x] Тест: корректная конфигурация OAuth
- **Requirements:** google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.5.3, google-oauth-auth.7.2, google-oauth-auth.10.1

### 10.2 Создать функциональные тесты для auth flow
- [x] Создать файл `tests/functional/auth-flow.spec.ts`
- [x] Тест: показ Login Screen при первом запуске
- [x] Тест: показ Main App при наличии авторизации
- [x] Тест: инициация OAuth flow при клике на кнопку login
- [x] Тест: показ Main App после успешной авторизации
- [x] Тест: разрешение множественных кликов на кнопку login до завершения авторизации
- [x] Тест: показ loader после получения authorization code
- [x] Тест: показ loader во время обмена токенов и загрузки профиля
- [x] Тест: деактивация кнопки login когда loader отображается
- [x] Тест: скрытие loader и показ agents при успехе
- [x] Тест: скрытие loader и показ ошибки при неудаче
- [x] **Тест: loader показывается НА странице логина (не отдельная страница)** - проверка видимости всех элементов Login Screen во время отображения loader
- [x] **Тест: loader показывается НА странице ошибки при повторной попытке (не отдельная страница)** - проверка видимости всех элементов Login Error Screen во время отображения loader при retry (кнопка "Continue with Google")
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.2, google-oauth-auth.11.3, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.13.8, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.4, google-oauth-auth.15.5, google-oauth-auth.15.6, google-oauth-auth.15.7

### 10.3 Создать функциональные тесты для Login UI
- [x] Создать файл `tests/functional/login-ui.spec.ts`
- [x] Тест: отображение всех элементов Login Screen корректно
- [x] Тест: отображение блока ошибки с корректным стилем
- [x] Тест: сохранение всех элементов Login Screen в состоянии ошибки
- **Requirements:** google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.12.5, google-oauth-auth.13.1, google-oauth-auth.13.2

### 10.4 Создать функциональные тесты для Deep Link Validation
- [x] Создать файл `tests/functional/deep-link-validation.spec.ts`
- [x] Тест: регистрация custom protocol handler при запуске
- [x] Тест: извлечение параметров code и state из deep link
- [x] Тест: отклонение deep link с невалидным state параметром
- [x] Тест: продолжение обработки после валидации state
- [x] Тест: активация окна приложения после deep link
- [x] Тест: обработка deep link во время инициализации приложения
- [x] Тест: корректная обработка некорректного deep link
- [x] Тест: корректное декодирование URL-encoded параметров
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4, google-oauth-auth.2.5

### 10.5 Создать функциональные тесты для полного OAuth flow
- [x] Создать файл `tests/functional/oauth-complete-flow.spec.ts`
- [x] Тест: завершение полного OAuth flow с обменом authorization code
- [x] Тест: проверка генерации authorization codes mock OAuth сервером
- [x] Тест: симуляция обмена токенов и сохранения
- [x] Тест: корректная обработка OAuth ошибок
- [x] Тест: корректное вычисление времени истечения токена
- **Requirements:** google-oauth-auth.1.5, google-oauth-auth.3.1, google-oauth-auth.3.3, google-oauth-auth.3.4, google-oauth-auth.3.5

### 10.6 Создать дополнительные функциональные тесты для OAuth
- [x] Создать файл `tests/functional/oauth-full-flow.spec.ts`
- [x] Дополнительные end-to-end тесты для полного OAuth flow
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5

### 10.7 Создать функциональные тесты для Sign Out flow
- [x] Создать файл `tests/functional/sign-out-flow.spec.ts`
- [x] Тест: показ Login Screen после Sign Out
- [x] Тест: очистка токенов после Sign Out
- [x] Тест: обработка Sign Out когда revoke не удается
- **Requirements:** google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6, google-oauth-auth.14.7

## 11. Документация и Финализация

### 11.1 Добавить комментарии с требованиями
- [x] Добавить комментарии `// Requirements: ...` ко всем функциям и классам
- [x] Проверить наличие комментариев во всех файлах OAuth
- **Requirements:** Все требования google-oauth-auth

### 11.2 Добавить структурированные комментарии к тестам
- [x] Добавить комментарии `/* Preconditions: ... Action: ... Assertions: ... Requirements: ... */` ко всем тестам
- [x] Проверить наличие структурированных комментариев во всех тестовых файлах
- **Requirements:** Все требования google-oauth-auth

### 11.3 Валидация и проверка покрытия
- [x] Запустить `npm run validate` для проверки всех тестов и линтеров
- [x] Проверить покрытие кода (минимум 85%)
- [x] Проверить покрытие всех требований тестами
- [x] Исправить все ошибки TypeScript, ESLint, Prettier
- **Requirements:** Все требования google-oauth-auth

### 11.4 Обновить документацию
- [x] Обновить README.md с инструкциями по настройке Google OAuth
- [x] Добавить примеры использования auth API
- [x] Документировать процесс получения Google Client ID и Client Secret
- [x] Документировать процесс обновления констант в коде
- **Requirements:** google-oauth-auth.10.1, google-oauth-auth.10.2

## Сводка Покрытия

### Свойства Корректности (Property-Based Tests)

Все 22 свойства корректности (19 обязательных + 3 опциональных) покрыты property-based тестами:

**Обязательные свойства (1-19):**

1. **Property 1**: PKCE Parameters Generation - `tests/property/auth/OAuthClientManager.property.test.ts`
2. **Property 2**: PKCE Parameters Persistence - `tests/property/auth/OAuthClientManager.property.test.ts`
3. **Property 3**: Authorization URL Formation - `tests/property/auth/OAuthClientManager.property.test.ts`
4. **Property 4**: Deep Link Parameter Extraction - `tests/property/auth/OAuthClientManager.property.test.ts`
5. **Property 5**: State Validation - `tests/property/auth/OAuthClientManager.property.test.ts`
6. **Property 6**: Token Exchange Request Formation - `tests/property/auth/OAuthClientManager.property.test.ts`
7. **Property 7**: Token Response Parsing - `tests/property/auth/OAuthClientManager.property.test.ts`
8. **Property 8**: Token Expiration Calculation - `tests/property/auth/OAuthClientManager.property.test.ts`
9. **Property 9**: Token Storage Round Trip - `tests/property/auth/TokenStorageManager.property.test.ts`
10. **Property 10**: Token Deletion Completeness - `tests/property/auth/TokenStorageManager.property.test.ts`
11. **Property 11**: Auth Status Determination - `tests/property/auth/OAuthClientManager.property.test.ts`
12. **Property 12**: Token Refresh Request Formation - `tests/property/auth/OAuthClientManager.property.test.ts`
13. **Property 13**: Token Update After Refresh - `tests/property/auth/TokenRefresh.property.test.ts`
14. **Property 14**: Logout Token Cleanup - `tests/property/auth/OAuthClientManager.property.test.ts`
15. **Property 15**: IPC Response Structure - `tests/property/auth/AuthIPCHandlers.property.test.ts`
16. **Property 16**: Error Propagation - `tests/property/auth/ErrorHandler.property.test.ts`
17. **Property 17**: Window State Based on Auth Status - `tests/property/auth/AuthWindowManager.property.test.ts`
18. **Property 18**: Error Screen Display - `tests/property/auth/AuthWindowManager.property.test.ts`
19. **Property 19**: Loader Display During Authorization - `tests/property/auth/AuthWindowManager.property.test.ts`

**Опциональные свойства (20-22):**

20. **Property 20**: Loader State Consistency - `tests/property/auth/LoaderState.property.test.tsx`
21. **Property 21**: Loader Visibility Invariant - `tests/property/auth/LoaderState.property.test.tsx`
22. **Property 22**: Button State Invariant - `tests/property/auth/LoaderState.property.test.tsx`

### Функциональные Тесты (End-to-End)

Все пользовательские сценарии покрыты функциональными тестами:

- **Требование 1**: OAuth Flow Initialization - `tests/functional/oauth-full-flow.spec.ts`, `tests/functional/oauth-complete-flow.spec.ts`
- **Требование 2**: Deep Link Handler - `tests/functional/deep-link-validation.spec.ts`, `tests/functional/oauth-flow.spec.ts`
- **Требование 3**: Token Exchange - `tests/functional/oauth-complete-flow.spec.ts`
- **Требование 4**: Token Storage - `tests/functional/oauth-flow.spec.ts`
- **Требование 5**: Auth Status Check - `tests/functional/oauth-flow.spec.ts`
- **Требование 7**: Logout - `tests/functional/oauth-flow.spec.ts`, `tests/functional/sign-out-flow.spec.ts`
- **Требование 10**: OAuth Configuration - `tests/functional/oauth-flow.spec.ts`
- **Требование 11**: UI Flow - `tests/functional/auth-flow.spec.ts`
- **Требование 12**: Login Screen - `tests/functional/login-ui.spec.ts`
- **Требование 13**: Login Error Screen - `tests/functional/login-ui.spec.ts`
- **Требование 14**: Sign Out Flow - `tests/functional/sign-out-flow.spec.ts`
- **Требование 15**: Loader During Authorization - `tests/functional/auth-flow.spec.ts`

### Модульные Тесты

Все компоненты покрыты модульными тестами:

- `tests/unit/auth/OAuthConfig.test.ts` - Конфигурация OAuth
- `tests/unit/auth/TokenStorageManager.test.ts` - Хранение токенов
- `tests/unit/auth/OAuthClientManager.test.ts` - OAuth клиент
- `tests/unit/auth/DeepLinkHandler.test.ts` - Deep link обработка
- `tests/unit/auth/AuthIPCHandlers.test.ts` - IPC handlers
- `tests/unit/auth/LoginScreen.test.tsx` - Login Screen компонент
- `tests/unit/auth/LoginError.test.tsx` - Login Error компонент
- `tests/unit/auth/AuthWindowManager.test.ts` - Window Manager
- `tests/unit/auth/ErrorHandler.test.ts` - Обработка ошибок
- `tests/unit/auth/Integration.test.ts` - Интеграция компонентов

## Примечания

✅ **Все задачи выполнены** - Реализация завершена полностью
✅ Все 22 свойства корректности (19 обязательных + 3 опциональных) покрыты property-based тестами
✅ Все пользовательские сценарии покрыты функциональными тестами
✅ Все компоненты имеют модульные тесты
✅ Все компоненты имеют комментарии с ссылками на требования
✅ Все тесты имеют структурированные комментарии (Preconditions, Action, Assertions, Requirements)
✅ Покрытие кода превышает 85%
✅ Все проверки TypeScript, ESLint, Prettier проходят

**Важно:** Функциональные тесты используют реальный Electron и показывают окна на экране. Они запускаются ТОЛЬКО при явной просьбе пользователя.

## Итоговая Статистика

- **Всего задач:** 11 основных разделов
- **Всего подзадач:** 60+ индивидуальных задач
- **Property-based тесты:** 22 свойства (19 обязательных + 3 опциональных)
- **Модульные тесты:** 10 тестовых файлов
- **Функциональные тесты:** 7 тестовых файлов
- **Покрытие требований:** 100% (все 15 требований)
- **Покрытие кода:** >85%

## Ключевые Реализованные Компоненты

1. **OAuth Client Manager** - Управление OAuth flow с PKCE
2. **Token Storage Manager** - Безопасное хранение токенов в SQLite
3. **Auth IPC Handlers** - Межпроцессная коммуникация
4. **Auth Window Manager** - Управление окнами авторизации
5. **Login Screen Component** - UI для входа
6. **Login Error Component** - UI для ошибок авторизации
7. **Deep Link Handler** - Обработка OAuth callback
8. **Error Handler** - Централизованная обработка ошибок
9. **Loader Functionality** - Индикация процесса авторизации
10. **Sign Out Flow** - Полный цикл выхода из системы

---

## 12. Рефакторинг: DataManager → UserSettingsManager

### Обзор

В рамках рефакторинга системы хранения данных (см. `.kiro/specs/database-refactoring/tasks.md`), необходимо обновить TokenStorageManager для использования UserSettingsManager вместо DataManager.

**Статус:** ✅ Выполнено

### 12.1 Обновить TokenStorageManager
- [x] Обновить `src/main/auth/TokenStorageManager.ts`:
  - Заменить `DataManager` на `UserSettingsManager` в конструкторе
  - Обновить импорты
  - Обновить комментарии с Requirements
- _Requirements: google-oauth-auth.4, user-data-isolation.6.5_

### 12.2 Обновить тесты TokenStorageManager
- [x] Обновить `tests/unit/auth/TokenStorageManager.test.ts`:
  - Заменить моки DataManager на UserSettingsManager
  - Обновить описания тестов
- [x] Обновить `tests/property/auth/TokenStorageManager.property.test.ts`:
  - Заменить моки DataManager на UserSettingsManager
- _Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3_

### 12.3 Валидация
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят
- _Requirements: google-oauth-auth.4_

### Примечания

- TokenStorageManager использует UserSettingsManager для хранения токенов в таблице user_data
- Токены автоматически изолируются по user_id через UserSettingsManager
- Изменения минимальны: только переименование зависимости и обновление импортов
