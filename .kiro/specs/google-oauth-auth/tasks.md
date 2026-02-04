# Задачи: Google OAuth Авторизация

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
- [x] Property тест: Token Storage Round Trip (Property 9)
- [x] Property тест: Token Deletion Completeness (Property 10)
- [x] Создать генератор `tokenDataArb` для случайных токенов
- **Requirements:** google-oauth-auth.4.1, google-oauth-auth.4.3, google-oauth-auth.4.4

### 2.4 Создать property-based тесты для Token Refresh
- [x] Создать файл `tests/property/auth/TokenRefresh.property.test.ts`
- [x] Property тест: Token Update After Refresh (Property 13)
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
- [x] Добавление параметров: code, client_id, redirect_uri, code_verifier, grant_type
- [x] НЕ включать client_secret в запрос
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
- [x] НЕ включать client_secret в запрос
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
- [x] Тест: формирование token exchange request без client_secret
- [x] Тест: парсинг token response
- [x] Тест: вычисление времени истечения токена
- [x] Тест: определение статуса авторизации для разных состояний
- [x] Тест: формирование refresh token request без client_secret
- [x] Тест: обработка успешного refresh
- [x] Тест: обработка invalid_grant при refresh
- [x] Тест: logout с успешным revoke
- [x] Тест: logout с неуспешным revoke
- [x] Тест: обработка сетевых ошибок
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.9.2

### 3.9 Создать property-based тесты для OAuth Client Manager
- [x] Создать файл `tests/property/auth/OAuthClientManager.property.test.ts`
- [x] Property тест: PKCE Parameters Generation (Property 1)
- [x] Property тест: PKCE Parameters Persistence (Property 2)
- [x] Property тест: Authorization URL Formation (Property 3)
- [x] Property тест: Deep Link Parameter Extraction (Property 4)
- [x] Property тест: State Validation (Property 5)
- [x] Property тест: Token Exchange Request Formation (Property 6)
- [x] Property тест: Token Response Parsing (Property 7)
- [x] Property тест: Token Expiration Calculation (Property 8)
- [x] Property тест: Auth Status Determination (Property 11)
- [x] Property тест: Token Refresh Request Formation (Property 12)
- [x] Property тест: Token Update After Refresh (Property 13)
- [x] Property тест: Logout Token Cleanup (Property 14)
- [x] Property тест: Error Propagation (Property 16)
- [x] Создать генераторы: `codeVerifierArb`, `deepLinkUrlArb`, `oauthErrorArb`
- **Requirements:** google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.7.2, google-oauth-auth.9.3, google-oauth-auth.9.4

## 4. Реализация Deep Link Handler

### 4.1 Создать Deep Link Handler
- [x] Добавить регистрацию custom protocol handler в `src/main/index.ts`
- [x] Зарегистрировать схему "clerkly://" при запуске приложения
- [x] Добавить обработчик события `open-url` (macOS) и `second-instance` (Windows/Linux)
- [x] Передать URL в OAuthClientManager.handleDeepLink()
- [x] Активировать окно приложения после обработки deep link
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.2.2, google-oauth-auth.2.5

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
- [x] Property тест: IPC Response Structure (Property 15)
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
- **Requirements:** google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.12.5, google-oauth-auth.12.6

### 6.2 Создать Login Error Component
- [x] Создать файл `src/renderer/components/auth/LoginError.tsx`
- [x] Добавить все элементы Login Screen
- [x] Добавить красный блок ошибки (bg-red-50 border-red-200) с иконкой AlertCircle
- [x] Реализовать функцию `getErrorDetails(errorCode, errorMessage)` для маппинга ошибок
- [x] Добавить маппинг для всех типов ошибок (popup_closed_by_user, access_denied, network_error, и т.д.)
- [x] Отображать заголовок, сообщение и предложение из маппинга
- [x] Добавить обработчик retry (вызов onRetry prop)
- **Requirements:** google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6, google-oauth-auth.13.7, google-oauth-auth.9.6

### 6.3 Создать модульные тесты для UI Components
- [x] Создать файл `tests/unit/auth/LoginScreen.test.tsx`
- [x] Тест: отображение всех элементов Login Screen
- [x] Тест: клик на кнопку "Continue with Google" вызывает onLogin
- [x] Создать файл `tests/unit/auth/LoginError.test.tsx`
- [x] Тест: отображение всех элементов Login Screen
- [x] Тест: отображение блока ошибки
- [x] Тест: корректный маппинг для каждого типа ошибки
- [x] Тест: клик на retry вызывает onRetry
- **Requirements:** google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6

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
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.11.5

### 7.2 Создать модульные тесты для Auth Window Manager
- [x] Создать файл `tests/unit/auth/AuthWindowManager.test.ts`
- [x] Тест: проверка статуса авторизации при запуске
- [x] Тест: показ Login Window при отсутствии авторизации
- [x] Тест: показ Main Window при наличии авторизации
- [x] Тест: закрытие Login Window и открытие Main Window при успешной авторизации
- [x] Тест: обновление содержимого окна на Login Error Screen при ошибке
- [x] Тест: обновление содержимого окна на Login Screen при retry
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.11.5

### 7.3 Создать property-based тесты для Auth Window Manager
- [x] Создать файл `tests/property/auth/AuthWindowManager.property.test.ts`
- [x] Property тест: Window State Based on Auth Status (Property 17)
- [x] Property тест: Error Screen Display (Property 18)
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.5

## 8. Обработка Ошибок

### 8.1 Реализовать централизованную обработку ошибок
- [x] Создать файл `src/main/auth/ErrorHandler.ts`
- [x] Реализовать функцию `getErrorDetails(errorCode?: string, errorMessage?: string): ErrorDetails`
- [x] Добавить маппинг для всех типов ошибок
- [x] Реализовать функцию логирования ошибок с контекстом
- [x] Добавить интерфейсы `ErrorDetails` и `ErrorResponse`
- **Requirements:** google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6

### 8.2 Создать модульные тесты для обработки ошибок
- [x] Создать файл `tests/unit/auth/ErrorHandler.test.ts`
- [x] Тест: маппинг для каждого типа ошибки
- [x] Тест: возврат default ошибки для неизвестного кода
- [x] Тест: использование errorMessage для default ошибки
- [x] Тест: структура ErrorResponse
- [x] Тест: логирование ошибок с контекстом
- **Requirements:** google-oauth-auth.9.1, google-oauth-auth.9.2, google-oauth-auth.9.3, google-oauth-auth.9.4, google-oauth-auth.9.5, google-oauth-auth.9.6

### 8.3 Создать property-based тесты для обработки ошибок
- [x] Создать файл `tests/property/auth/ErrorHandler.property.test.ts`
- [x] Property тест: Error Propagation (Property 16)
- **Requirements:** google-oauth-auth.9.3

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
- [ ] Создать файл `tests/unit/auth/Integration.test.ts`
- [ ] Тест: инициализация всех OAuth компонентов
- [ ] Тест: регистрация deep link handler
- [ ] Тест: регистрация IPC handlers
- [ ] Тест: доступность auth API в preload
- **Requirements:** google-oauth-auth.2.1, google-oauth-auth.8.1

## 10. Функциональные Тесты

### 10.1 Создать функциональные тесты для OAuth flow
- [x] Создать файл `tests/functional/auth/OAuthFlow.functional.test.ts`
- [x] Тест: полный OAuth flow от клика на кнопку до получения токенов
- [x] Тест: отображение Login Screen при первом запуске
- [x] Тест: отображение Main App при наличии валидных токенов
- [x] Тест: отображение Login Error Screen при ошибке авторизации
- [x] Тест: logout flow с очисткой токенов
- [x] Тест: обработка отмены авторизации пользователем
- [x] Тест: обработка сетевых ошибок
- [x] Тест: автоматическое обновление токена при истечении
- **Requirements:** google-oauth-auth.11.1, google-oauth-auth.11.2, google-oauth-auth.11.3, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4, google-oauth-auth.12.5, google-oauth-auth.12.6, google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6, google-oauth-auth.13.7, google-oauth-auth.7.3, google-oauth-auth.7.4, google-oauth-auth.7.5, google-oauth-auth.8.1, google-oauth-auth.8.3

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
- [x] Документировать процесс получения Google Client ID и обновления константы в коде
- **Requirements:** google-oauth-auth.10.1

## Примечания

- Все задачи должны выполняться последовательно
- Каждая задача должна быть завершена с прохождением всех тестов
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все компоненты должны иметь комментарии с ссылками на требования
- Все тесты должны иметь структурированные комментарии (Preconditions, Action, Assertions, Requirements)
