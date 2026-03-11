# Документ Требований: Google OAuth Авторизация

## Введение

Данная спецификация описывает функциональность авторизации пользователей через Google OAuth в Electron приложении Clerkly. Авторизация реализуется с использованием PKCE (Proof Key for Code Exchange) flow с использованием client secret, что требуется Google OAuth API даже для Desktop приложений. Несмотря на то, что client secret не может быть полностью защищен в публичных desktop приложениях, Google требует его наличия для всех типов OAuth клиентов.

## Глоссарий

- **OAuth Client**: Компонент системы, отвечающий за взаимодействие с Google OAuth API
- **PKCE**: Proof Key for Code Exchange - механизм безопасности для OAuth без client secret
- **Code Verifier**: Случайная строка, генерируемая клиентом для PKCE flow
- **Code Challenge**: Хеш от Code Verifier, отправляемый в authorization request
- **Authorization Code**: Временный код, получаемый от Google после успешной авторизации
- **Access Token**: Токен доступа для выполнения API запросов от имени пользователя
- **Refresh Token**: Токен для обновления Access Token без повторной авторизации
- **Token Storage**: Компонент для безопасного хранения токенов в SQLite
- **Main Process**: Главный процесс Electron приложения
- **Renderer Process**: Процесс рендеринга UI Electron приложения
- **IPC Handler**: Обработчик межпроцессного взаимодействия в Electron
- **Deep Link**: URL схема для перехвата ответа от OAuth провайдера

## Архитектурный Принцип: Управление Токенами и Авторизацией

Приложение следует строгим правилам управления токенами авторизации и обработки ошибок авторизации для обеспечения безопасности и плавного пользовательского опыта.

**Ключевые правила:**

1. **Автоматическое обновление токенов**: Когда access token истекает (expires_in), система автоматически обновляет его через refresh token без участия пользователя. Это происходит в фоновом режиме через `OAuthClientManager.refreshAccessToken()`. Пользователь продолжает работу без прерываний.

2. **Обработка ошибок авторизации (HTTP 401)**: При получении ошибки HTTP 401 Unauthorized от любого API (Google UserInfo, Calendar, Tasks и т.д.), система должна:
   - Немедленно очистить все токены из хранилища
   - Показать экран логина (LoginScreen с панелью ошибки, errorCode 'invalid_grant') с сообщением об истечении сессии
   - Пользователь может повторно авторизоваться через кнопку "Continue with Google"
   - **Примечание**: Данные пользователя в базе данных НЕ очищаются - они сохраняются для отображения при следующей авторизации

3. **Централизованная обработка**: Все API запросы должны проходить через централизованный обработчик ошибок, который проверяет статус авторизации (HTTP 401) и выполняет необходимые действия при ошибках авторизации.

4. **Логирование**: Все ошибки авторизации должны логироваться через централизованный "Logger" класс (см. clerkly.3) с контекстом (какой API запрос вызвал ошибку), но пользователю показываются только понятные сообщения без технических деталей.

**Поток обработки ошибки авторизации:**
```
API Request → HTTP 401 → Clear Tokens → Show LoginScreen with error panel → Redirect to OAuth
```

**Поток автоматического обновления токена:**
```
Token Expiring → OAuthClientManager.refreshAccessToken() → Update Tokens in Storage → Continue Operation
```

**Преимущества этого подхода:**

- **Безопасность**: Немедленное прекращение доступа при невалидных токенах
- **Прозрачность**: Автоматическое обновление токенов без прерывания работы пользователя
- **Понятность**: Четкое сообщение пользователю о необходимости повторной авторизации
- **Консистентность**: Единый подход к обработке ошибок авторизации во всем приложении
- **Надежность**: Централизованная обработка предотвращает утечки токенов и несогласованное состояние

## Требования

### Требование 1: Инициализация OAuth Flow

**User Story:** Как пользователь, я хочу начать процесс авторизации через Google, чтобы получить доступ к функциям приложения.

#### Критерии Приемки

1. КОГДА пользователь инициирует авторизацию, ТО "OAuth Client" ДОЛЖЕН сгенерировать уникальный Code Verifier длиной 43-128 символов
2. КОГДА Code Verifier сгенерирован, ТО "OAuth Client" ДОЛЖЕН вычислить Code Challenge используя SHA-256 хеширование
3. КОГДА Code Challenge вычислен, ТО "OAuth Client" ДОЛЖЕН сгенерировать случайный state параметр для защиты от CSRF атак
4. КОГДА все параметры подготовлены, ТО "OAuth Client" ДОЛЖЕН сохранить Code Verifier и state во временном хранилище
5. КОГДА параметры сохранены, ТО "OAuth Client" ДОЛЖЕН открыть системный браузер с authorization URL содержащим client_id, redirect_uri, code_challenge, code_challenge_method=S256, state, scope, access_type=offline, и prompt=consent select_account
6. КОГДА браузер открывается, ТО пользователь ДОЛЖЕН видеть экран выбора Google аккаунта (благодаря параметру prompt=select_account)

#### Функциональные Тесты

- `tests/functional/auth-flow.spec.ts` - "should initiate OAuth flow when clicking login button"
- `tests/functional/oauth-flow.spec.ts` - "should register custom protocol handler on startup"
- `tests/functional/oauth-complete-flow.spec.ts` - "should complete full OAuth flow with authorization code exchange"
- `tests/functional/oauth-complete-flow.spec.ts` - "should verify mock OAuth server generates authorization codes"

### Требование 2: Регистрация Deep Link Handler

**User Story:** Как система, я хочу перехватывать ответы от Google OAuth, чтобы завершить процесс авторизации без использования localhost сервера.

#### Критерии Приемки

1. КОГДА приложение запускается, ТО "Main Process" ДОЛЖЕН запросить single instance lock ПЕРЕД регистрацией protocol handler
2. КОГДА single instance lock получен, ТО "Main Process" ДОЛЖЕН зарегистрировать custom protocol handler для схемы в формате "com.googleusercontent.apps.CLIENT_ID"
3. КОГДА deep link получен, ТО "Main Process" ДОЛЖЕН извлечь параметры code и state из URL
4. ЕСЛИ state параметр не совпадает с сохраненным значением, ТО "OAuth Client" ДОЛЖЕН отклонить запрос и вернуть ошибку
5. ЕСЛИ state параметр совпадает, ТО "OAuth Client" ДОЛЖЕН продолжить обработку authorization code
6. КОГДА deep link обработан, ТО "Main Process" ДОЛЖЕН активировать окно приложения

#### Функциональные Тесты

- `tests/functional/deep-link-validation.spec.ts` - "should register custom protocol handler on startup"
- `tests/functional/deep-link-validation.spec.ts` - "should extract code and state parameters from deep link"
- `tests/functional/deep-link-validation.spec.ts` - "should reject deep link with invalid state parameter"
- `tests/functional/deep-link-validation.spec.ts` - "should continue processing after valid state validation"
- `tests/functional/deep-link-validation.spec.ts` - "should activate application window after deep link"
- `tests/functional/deep-link-validation.spec.ts` - "should handle deep link during app initialization"
- `tests/functional/deep-link-validation.spec.ts` - "should handle malformed deep link gracefully"
- `tests/functional/deep-link-validation.spec.ts` - "should correctly decode URL-encoded parameters"

### Требование 3: Обмен Authorization Code на Токены

**User Story:** Как система, я хочу обменять authorization code на access token и refresh token, чтобы получить доступ к Google API.

#### Критерии Приемки

1. КОГДА authorization code получен, ТО "OAuth Client" ДОЛЖЕН отправить POST запрос на token endpoint с параметрами: code, client_id, client_secret, redirect_uri, code_verifier
2. КОГДА запрос отправлен, ТО "OAuth Client" ДОЛЖЕН включать client_secret в запрос (требование Google OAuth API)
3. ЕСЛИ Google возвращает успешный ответ, ТО "OAuth Client" ДОЛЖЕН извлечь access_token, refresh_token, expires_in и token_type
4. ЕСЛИ Google возвращает ошибку, ТО "OAuth Client" ДОЛЖЕН вернуть описательное сообщение об ошибке
5. КОГДА токены получены, ТО "OAuth Client" ДОЛЖЕН вычислить время истечения access token (текущее время + expires_in)
6. КОГДА токены сохранены, ТО система ДОЛЖНА синхронно получить профиль пользователя из Google UserInfo API (во время отображения loader, см. требование 15)
7. ЕСЛИ получение профиля не удается, ТО система ДОЛЖНА очистить токены И показать LoginScreen с панелью ошибки, errorCode 'profile_fetch_failed'
8. ЕСЛИ получение профиля успешно, ТО система ДОЛЖНА показать главный интерфейс приложения (Agents)

#### Функциональные Тесты

- `tests/functional/oauth-complete-flow.spec.ts` - "should simulate token exchange and storage"
- `tests/functional/oauth-complete-flow.spec.ts` - "should handle OAuth errors gracefully"
- `tests/functional/oauth-complete-flow.spec.ts` - "should correctly calculate token expiration time"

### Требование 4: Безопасное Хранение Токенов

**User Story:** Как система, я хочу безопасно хранить токены доступа, чтобы пользователь оставался авторизованным между сессиями.

#### Критерии Приемки

1. КОГДА токены получены, ТО "Token Storage" ДОЛЖЕН сохранить access_token, refresh_token, expires_at и token_type в SQLite базе данных
2. КОГДА токены сохраняются, ТО "Token Storage" ДОЛЖЕН использовать DatabaseManager для доступа к базе данных
3. КОГДА токены запрашиваются, ТО "Token Storage" ДОЛЖЕН вернуть все сохраненные токены
4. КОГДА токены удаляются (logout), ТО "Token Storage" ДОЛЖЕН полностью очистить все данные авторизации из базы
5. ЕСЛИ база данных недоступна, ТО "Token Storage" ДОЛЖЕН вернуть ошибку с описанием проблемы
6. OAuth токены ДОЛЖНЫ быть изолированы по пользователям (см. user-data-isolation.2) - каждый пользователь имеет свои токены в базе данных

**Примечание:** Изоляция токенов обеспечивается автоматически через UserSettingsManager, который фильтрует данные по `user_id` текущего авторизованного пользователя.

#### Функциональные Тесты

- `tests/functional/oauth-flow.spec.ts` - "should have no tokens on first launch"
- `tests/functional/oauth-flow.spec.ts` - "should load tokens from database on startup"

### Требование 5: Проверка Статуса Авторизации

**User Story:** Как приложение, я хочу проверять статус авторизации пользователя, чтобы показывать соответствующий UI.

#### Критерии Приемки

1. КОГДА приложение запрашивает статус авторизации, ТО "OAuth Client" ДОЛЖЕН проверить наличие токенов в "Token Storage"
2. ЕСЛИ токены отсутствуют, ТО "OAuth Client" ДОЛЖЕН вернуть статус "не авторизован"
3. ЕСЛИ access token существует и не истек, ТО "OAuth Client" ДОЛЖЕН вернуть статус "авторизован"
4. ЕСЛИ access token истек, но refresh token существует, ТО "OAuth Client" ДОЛЖЕН попытаться обновить токен
5. ЕСЛИ обновление токена успешно, ТО "OAuth Client" ДОЛЖЕН вернуть статус "авторизован"
6. ЕСЛИ обновление токена неуспешно, ТО "OAuth Client" ДОЛЖЕН вернуть статус "не авторизован" и очистить токены

#### Функциональные Тесты

- `tests/functional/oauth-flow.spec.ts` - "should detect expired tokens"

### Требование 6: Обновление Access Token

**User Story:** Как система, я хочу автоматически обновлять истекшие access tokens, чтобы пользователь не терял доступ к функциям.

#### Критерии Приемки

1. КОГДА access token истек, ТО "OAuth Client" ДОЛЖЕН отправить POST запрос на token endpoint с параметрами: refresh_token, client_id, client_secret, grant_type=refresh_token
2. КОГДА запрос отправлен, ТО "OAuth Client" ДОЛЖЕН включать client_secret в запрос (требование Google OAuth API)
3. ЕСЛИ Google возвращает новый access token, ТО "OAuth Client" ДОЛЖЕН обновить access_token и expires_at в "Token Storage"
4. ЕСЛИ Google возвращает новый refresh token, ТО "OAuth Client" ДОЛЖЕН также обновить refresh_token в "Token Storage"
5. ЕСЛИ Google возвращает ошибку invalid_grant, ТО "OAuth Client" ДОЛЖЕН очистить все токены и вернуть статус "требуется повторная авторизация"

### Требование 7: Выход из Системы

**User Story:** Как пользователь, я хочу выйти из системы, чтобы отозвать доступ приложения к моему Google аккаунту.

#### Критерии Приемки

1. КОГДА пользователь инициирует выход, ТО "OAuth Client" ДОЛЖЕН отправить запрос на revoke endpoint Google с параметром token (access_token или refresh_token)
2. КОГДА запрос на revoke отправлен, ТО "OAuth Client" ДОЛЖЕН удалить все токены из "Token Storage" независимо от результата
3. ЕСЛИ запрос на revoke успешен, ТО "OAuth Client" ДОЛЖЕН вернуть статус "успешный выход"
4. ЕСЛИ запрос на revoke неуспешен, ТО "OAuth Client" ДОЛЖЕН все равно удалить локальные токены и вернуть статус "локальный выход"
5. КОГДА выход завершен, ТО приложение ДОЛЖНО обновить UI для отображения неавторизованного состояния

#### Функциональные Тесты

- `tests/functional/oauth-flow.spec.ts` - "should delete tokens on logout"

### Требование 8: IPC Коммуникация

**User Story:** Как разработчик, я хочу иметь четкий API для взаимодействия между renderer и main процессами, чтобы управлять авторизацией из UI.

#### Критерии Приемки

1. КОГДА "Renderer Process" запрашивает начало авторизации, ТО "IPC Handler" ДОЛЖЕН вызвать метод инициализации OAuth flow в "Main Process"
2. КОГДА "Renderer Process" запрашивает статус авторизации, ТО "IPC Handler" ДОЛЖЕН вернуть текущий статус (авторизован/не авторизован)
3. КОГДА "Renderer Process" запрашивает выход, ТО "IPC Handler" ДОЛЖЕН вызвать метод logout в "Main Process"
4. КОГДА авторизация завершается (успешно или с ошибкой), ТО "Main Process" ДОЛЖЕН отправить событие в "Renderer Process" с результатом
5. ВСЕ IPC handlers ДОЛЖНЫ обрабатывать ошибки и возвращать структурированные ответы с полями success и error

### Требование 9: Обработка Ошибок

**User Story:** Как пользователь, я хочу получать понятные сообщения об ошибках, чтобы понимать что пошло не так при авторизации.

#### Критерии Приемки

1. ЕСЛИ пользователь отменяет авторизацию в браузере, ТО "OAuth Client" ДОЛЖЕН вернуть ошибку "authorization_cancelled"
2. ЕСЛИ сетевой запрос к Google API не удается, ТО "OAuth Client" ДОЛЖЕН вернуть ошибку "network_error" с деталями
3. ЕСЛИ Google возвращает ошибку, ТО "OAuth Client" ДОЛЖЕН вернуть код ошибки и описание от Google
4. ЕСЛИ state параметр не совпадает, ТО "OAuth Client" ДОЛЖЕН вернуть ошибку "csrf_attack_detected"
5. ВСЕ ошибки ДОЛЖНЫ логироваться через централизованный "Logger" класс (см. clerkly.3) с достаточным контекстом для отладки
6. ДЛЯ распространенных ошибок "OAuth Client" ДОЛЖЕН предоставлять человекочитаемые тексты:
   - "popup_closed_by_user": заголовок "Sign in cancelled", сообщение "You closed the sign-in window before completing authentication.", предложение "Please try again and complete the sign-in process."
   - "access_denied": заголовок "Access denied", сообщение "You denied access to your Google account.", предложение "Clerkly needs access to your Google account to function properly."
   - "network_error": заголовок "Network error", сообщение "Unable to connect to Google authentication servers.", предложение "Please check your internet connection and try again."
   - "invalid_grant": заголовок "Session expired", сообщение "Your authentication session has expired.", предложение "Please sign in again to continue."
   - "invalid_request": заголовок "Invalid request", сообщение "The authentication request was malformed.", предложение "Please try again or contact support if the problem persists."
   - "server_error": заголовок "Server error", сообщение "Google authentication servers are experiencing issues.", предложение "Please try again in a few moments."
   - "temporarily_unavailable": заголовок "Service unavailable", сообщение "Google authentication service is temporarily unavailable.", предложение "Please try again in a few moments."
   - "profile_fetch_failed": заголовок "Profile loading failed", сообщение "Unable to load your Google profile information.", предложение "Please check your internet connection and try signing in again." (ui.6.4, ui.6.5)
   - default (неизвестная ошибка): заголовок "Authentication failed", сообщение из errorMessage, предложение "Please try signing in again or contact support if the problem persists."

### Требование 10: Конфигурация OAuth

**User Story:** Как разработчик, я хочу иметь централизованную конфигурацию OAuth параметров, чтобы легко управлять настройками для разных окружений.

#### Критерии Приемки

1. "OAuth Client" ДОЛЖЕН хранить client_id как константу в конфигурационном файле кода И ДОЛЖЕН загружать client_secret из переменной окружения `CLERKLY_OAUTH_CLIENT_SECRET` (на этапе сборки приложения)
2. "OAuth Client" ДОЛЖЕН использовать redirect_uri в формате "com.googleusercontent.apps.CLIENT_ID:/oauth2redirect" (reverse client ID format), где CLIENT_ID - это числовая часть Client ID без суффикса ".apps.googleusercontent.com"
3. "OAuth Client" ДОЛЖЕН запрашивать следующие scopes: "openid", "email", "profile"
4. "OAuth Client" ДОЛЖЕН использовать authorization endpoint: "https://accounts.google.com/o/oauth2/v2/auth"
5. "OAuth Client" ДОЛЖЕН использовать token endpoint: "https://oauth2.googleapis.com/token"
6. "OAuth Client" ДОЛЖЕН использовать revoke endpoint: "https://oauth2.googleapis.com/revoke"
7. "OAuth Client" ДОЛЖЕН включать параметры access_type=offline и prompt=consent для получения refresh token

**Примечание:** При формировании redirect_uri из Client ID, необходимо удалить суффикс ".apps.googleusercontent.com" если он присутствует, чтобы избежать дублирования в итоговом URL. Например:
- Client ID: `100365225505-xxx.apps.googleusercontent.com`
- Redirect URI: `com.googleusercontent.apps.100365225505-xxx:/oauth2redirect` (без дублирования суффикса)

#### Функциональные Тесты

- `tests/functional/oauth-flow.spec.ts` - "should have correct OAuth configuration"

### Требование 11: UI Flow Авторизации

**User Story:** Как пользователь, я хочу видеть понятный интерфейс авторизации при первом запуске приложения, чтобы легко войти через Google аккаунт.

#### Критерии Приемки

1. КОГДА приложение запускается и пользователь не авторизован, ТО "Window Manager" ДОЛЖЕН открыть окно с "Login Screen"
2. КОГДА "Login Screen" отображается, ТО пользователь ДОЛЖЕН видеть кнопку "Continue with Google" и описание функций приложения
3. КОГДА пользователь нажимает кнопку "Continue with Google", ТО "OAuth Client" ДОЛЖЕН инициировать OAuth flow И открыть системный браузер
4. КОГДА браузер открыт, ТО кнопка "Continue with Google" ДОЛЖНА оставаться активной (пользователь может нажать повторно)
5. КОГДА пользователь нажимает кнопку "Continue with Google" повторно ДО завершения авторизации, ТО ДОЛЖНА открыться еще одна вкладка браузера с OAuth страницей
6. КОГДА пользователь завершает авторизацию в браузере И deep link получен (authorization code), ТО приложение ДОЛЖНО показать loader (см. требование 15)
7. КОГДА loader отображается, ТО кнопка "Continue with Google" ДОЛЖНА быть неактивной (disabled)
8. ЕСЛИ авторизация успешна (токены получены И профиль загружен), ТО "Window Manager" ДОЛЖЕН закрыть "Login Screen" и открыть главное окно приложения (Agents)
9. ЕСЛИ авторизация неуспешна (ошибка обмена токенов ИЛИ ошибка загрузки профиля), ТО "Window Manager" ДОЛЖЕН показать "Login Error Screen" с описанием ошибки и той же кнопкой "Continue with Google" для повторной попытки

#### Функциональные Тесты

- `tests/functional/auth-flow.spec.ts` - "should show login screen on first launch"
- `tests/functional/auth-flow.spec.ts` - "should show main app when already authorized"
- `tests/functional/auth-flow.spec.ts` - "should show main app after successful authentication"
- `tests/functional/auth-flow.spec.ts` - "should allow multiple login button clicks before authorization completes"

### Требование 12: Login Screen Компонент

**User Story:** Как пользователь, я хочу видеть привлекательный экран входа, чтобы понимать возможности приложения перед авторизацией.

#### Критерии Приемки

1. "Login Screen" ДОЛЖЕН отображать логотип Clerkly и заголовок "Clerkly" в одном горизонтальном ряду
2. "Login Screen" ДОЛЖЕН отображать заголовок карты "Welcome" и описание "Your autonomous AI agent that listens, organizes, and acts"
3. "Login Screen" ДОЛЖЕН отображать кнопку с текстом "Continue with Google" и иконкой Google
4. "Login Screen" ДОЛЖЕН отображать превью функций с иконками и текстами:
   - "Listen & Transcribe" с иконкой микрофона
   - "Extract Tasks" с иконкой чеклиста
   - "Automate Actions" с иконкой обновления
   - "Auto-Sync" с иконкой молнии
5. "Login Screen" ДОЛЖЕН отображать текст "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
6. "Login Screen" ДОЛЖЕН использовать дизайн из прототипа `figma/src/app/components/login-screen.tsx`

#### Функциональные Тесты

- `tests/functional/login-ui.spec.ts` - "should display all Login Screen elements correctly"

### Требование 13: Login Error Screen Компонент

**User Story:** Как пользователь, я хочу видеть понятное сообщение об ошибке, чтобы понимать что пошло не так и как это исправить.

#### Критерии Приемки

1. "Login Error Screen" ДОЛЖЕН отображать все элементы "Login Screen" (логотип, заголовок "Clerkly", заголовок карты "Welcome", описание, кнопку "Continue with Google", превью функций)
2. "Login Error Screen" ДОЛЖЕН отображать красный блок ошибки (bg-red-50 border-red-200) с иконкой AlertCircle
3. КОГДА ошибка "popup_closed_by_user", ТО "Login Error Screen" ДОЛЖЕН показать заголовок "Sign in cancelled" и текст "You closed the sign-in window before completing authentication." с предложением "Please try again and complete the sign-in process."
4. КОГДА ошибка "access_denied", ТО "Login Error Screen" ДОЛЖЕН показать заголовок "Access denied" и текст "You denied access to your Google account." с предложением "Clerkly needs access to your Google account to function properly."
5. КОГДА ошибка "network_error", ТО "Login Error Screen" ДОЛЖЕН показать заголовок "Network error" и текст "Unable to connect to Google authentication servers." с предложением "Please check your internet connection and try again."
6. КОГДА ошибка неизвестна, ТО "Login Error Screen" ДОЛЖЕН показать заголовок "Authentication failed" и переданное сообщение об ошибке с предложением "Please try signing in again or contact support if the problem persists."
7. "Login Error Screen" ДОЛЖЕН использовать дизайн из прототипа `figma/src/app/components/login-error.tsx`
8. КОГДА пользователь нажимает кнопку "Continue with Google" на "Login Error Screen", ТО приложение ДОЛЖНО повторить попытку авторизации (вызвать onRetry callback)

#### Функциональные Тесты

- `tests/functional/login-ui.spec.ts` - "should display error block with correct styling"
- `tests/functional/login-ui.spec.ts` - "should maintain all Login Screen elements in error state"

### Требование 14: Sign Out Flow

**User Story:** Как пользователь, я хочу выйти из приложения через кнопку Sign Out, чтобы завершить сессию и вернуться к экрану входа.

#### Критерии Приемки

1. КОГДА пользователь нажимает кнопку "Sign Out" в настройках, ТО приложение ДОЛЖНО вызвать метод logout через IPC
2. КОГДА logout вызван, ТО "OAuth Client" ДОЛЖЕН отозвать токены через Google revoke endpoint
3. КОГДА токены отозваны, ТО "Token Storage" ДОЛЖЕН удалить все токены из базы данных
4. КОГДА токены удалены, ТО "Main Process" ДОЛЖЕН опубликовать событие "user.logout" через EventBus
5. КОГДА "Renderer Process" получает событие logout, ТО приложение ДОЛЖНО обновить состояние авторизации на "не авторизован"
6. КОГДА состояние обновлено, ТО приложение ДОЛЖНО показать "Login Screen" вместо главного интерфейса
7. ЕСЛИ отзыв токенов через Google API не удается, ТО приложение ВСЕ РАВНО ДОЛЖНО удалить локальные токены и показать "Login Screen"

#### Функциональные Тесты

- `tests/functional/sign-out-flow.spec.ts` - "should show login screen after sign out"
- `tests/functional/sign-out-flow.spec.ts` - "should clear tokens after sign out"
- `tests/functional/sign-out-flow.spec.ts` - "should handle sign out when revoke fails"

### Требование 15: Loader во Время Авторизации

**User Story:** Как пользователь, я хочу видеть индикатор загрузки во время процесса авторизации, чтобы понимать что приложение обрабатывает мой запрос.

#### Критерии Приемки

1. КОГДА deep link получен (authorization code получен от Google), ТО приложение ДОЛЖНО показать loader на "Login Screen"
2. КОГДА loader отображается, ТО кнопка "Continue with Google" ДОЛЖНА быть неактивной (disabled)
3. КОГДА loader отображается, ТО все элементы "Login Screen" (логотип, заголовок, описание, превью функций) ДОЛЖНЫ оставаться видимыми
4. Loader ДОЛЖЕН отображаться во время следующих операций:
   - Обмен authorization code на токены (POST запрос к Google token endpoint)
   - Загрузка профиля пользователя из Google UserInfo API (синхронный запрос)
5. КОГДА токены получены И профиль загружен успешно, ТО loader ДОЛЖЕН исчезнуть И приложение ДОЛЖНО показать Agents
6. КОГДА происходит ошибка (обмен токенов ИЛИ загрузка профиля), ТО loader ДОЛЖЕН исчезнуть И приложение ДОЛЖНО показать "Login Error Screen" с описанием ошибки
7. Loader ДОЛЖЕН использовать стандартный компонент загрузки (spinner) с текстом "Signing in..."
8. ЕСЛИ пользователь закрывает браузер до завершения авторизации (не получен authorization code), ТО loader НЕ ДОЛЖЕН отображаться
9. КОГДА пользователь кликает кнопку "Continue with Google", ТО loader НЕ ДОЛЖЕН показываться сразу - loader показывается ТОЛЬКО после получения deep link от Google

#### Функциональные Тесты

- `tests/functional/auth-flow.spec.ts` - "should show loader after receiving authorization code"
- `tests/functional/auth-flow.spec.ts` - "should show loader during token exchange and profile fetch"
- `tests/functional/auth-flow.spec.ts` - "should disable login button when loader is shown"
- `tests/functional/auth-flow.spec.ts` - "should hide loader and show agents on success"
- `tests/functional/auth-flow.spec.ts` - "should hide loader and show error on failure"
- `tests/functional/auth-flow.spec.ts` - "should NOT show loader immediately after login click, only after deep link"


### Требование 16: Тестовое Окружение - Отключение Браузера

**User Story:** Как разработчик, я хочу чтобы функциональные тесты не открывали браузер, чтобы тесты выполнялись быстрее и не мешали работе.

#### Критерии Приемки

1. КОГДА приложение запущено в тестовом окружении (NODE_ENV=test ИЛИ PLAYWRIGHT_TEST=1), ТО "OAuth Client" НЕ ДОЛЖЕН открывать системный браузер при вызове `startAuthFlow()`
2. КОГДА браузер не открывается, ТО "OAuth Client" ВСЕ РАВНО ДОЛЖЕН сгенерировать PKCE параметры (code_verifier, code_challenge, state)
3. КОГДА PKCE параметры сгенерированы, ТО они ДОЛЖНЫ быть сохранены в `pkceStorage` для использования в тестах
4. КОГДА тест вызывает `completeOAuthFlow()` helper, ТО helper ДОЛЖЕН:
   - Вызвать `auth:start-login` для генерации PKCE параметров
   - Прочитать `state` из `pkceStorage` напрямую из памяти Main Process
   - Сгенерировать тестовый authorization code локально
   - Вызвать `test:handle-deep-link` для симуляции OAuth callback
5. КОГДА `test:handle-deep-link` вызван, ТО Mock OAuth Server ДОЛЖЕН обработать:
   - POST запрос к `/token` endpoint для обмена code на tokens
   - GET запрос к `/oauth2/v2/userinfo` для загрузки профиля
6. В production окружении (NODE_ENV != test), ТО браузер ДОЛЖЕН открываться как обычно
7. КОГДА браузер не открывается в тестах, ТО в логах ДОЛЖНО быть сообщение "Test environment detected, skipping browser launch"

#### Функциональные Тесты

- Все существующие функциональные тесты OAuth flow должны продолжать работать без изменений
- `tests/functional/navigation.spec.ts` - "should redirect to agents after successful authentication"
- `tests/functional/agent-date-update.spec.ts` - "should update agent timestamp when new message is sent"
- `tests/functional/auth-flow.spec.ts` - все тесты авторизации

#### Техническая Реализация

**Файл:** `src/main/auth/OAuthClientManager.ts`

**Метод:** `startAuthFlow()`

**Изменение:**
```typescript
// Open system browser with authorization URL (skip in test environment)
// Requirements: google-oauth-auth.16.1, google-oauth-auth.16.7
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
if (!isTestEnv) {
  await shell.openExternal(authUrl.toString());
} else {
  this.logger.info('Test environment detected, skipping browser launch');
}
```

**Обоснование:**
- Функциональные тесты используют Mock OAuth Server через переменную окружения `CLERKLY_GOOGLE_API_URL`
- Тесты симулируют OAuth callback напрямую через `test:handle-deep-link` IPC handler
- Браузер не нужен в тестах, т.к. authorization code генерируется локально
- PKCE параметры все равно генерируются для корректной работы flow
- В production окружении поведение не меняется
