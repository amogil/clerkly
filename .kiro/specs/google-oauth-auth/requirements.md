# Документ Требований: Google OAuth Авторизация

## Введение

Данная спецификация описывает функциональность авторизации пользователей через Google OAuth в Electron приложении Clerkly. Авторизация реализуется с использованием PKCE (Proof Key for Code Exchange) flow без использования client secret, что соответствует требованиям безопасности для публичных desktop приложений.

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

## Требования

### Требование 1: Инициализация OAuth Flow

**User Story:** Как пользователь, я хочу начать процесс авторизации через Google, чтобы получить доступ к функциям приложения.

#### Критерии Приемки

1. КОГДА пользователь инициирует авторизацию, ТО "OAuth Client" ДОЛЖЕН сгенерировать уникальный Code Verifier длиной 43-128 символов
2. КОГДА Code Verifier сгенерирован, ТО "OAuth Client" ДОЛЖЕН вычислить Code Challenge используя SHA-256 хеширование
3. КОГДА Code Challenge вычислен, ТО "OAuth Client" ДОЛЖЕН сгенерировать случайный state параметр для защиты от CSRF атак
4. КОГДА все параметры подготовлены, ТО "OAuth Client" ДОЛЖЕН сохранить Code Verifier и state во временном хранилище
5. КОГДА параметры сохранены, ТО "OAuth Client" ДОЛЖЕН открыть системный браузер с authorization URL содержащим client_id, redirect_uri, code_challenge, code_challenge_method=S256, state и scope

### Требование 2: Регистрация Deep Link Handler

**User Story:** Как система, я хочу перехватывать ответы от Google OAuth, чтобы завершить процесс авторизации без использования localhost сервера.

#### Критерии Приемки

1. КОГДА приложение запускается, ТО "Main Process" ДОЛЖЕН зарегистрировать custom protocol handler для схемы "clerkly://"
2. КОГДА deep link получен, ТО "Main Process" ДОЛЖЕН извлечь параметры code и state из URL
3. ЕСЛИ state параметр не совпадает с сохраненным значением, ТО "OAuth Client" ДОЛЖЕН отклонить запрос и вернуть ошибку
4. ЕСЛИ state параметр совпадает, ТО "OAuth Client" ДОЛЖЕН продолжить обработку authorization code
5. КОГДА deep link обработан, ТО "Main Process" ДОЛЖЕН активировать окно приложения

### Требование 3: Обмен Authorization Code на Токены

**User Story:** Как система, я хочу обменять authorization code на access token и refresh token, чтобы получить доступ к Google API.

#### Критерии Приемки

1. КОГДА authorization code получен, ТО "OAuth Client" ДОЛЖЕН отправить POST запрос на token endpoint с параметрами: code, client_id, redirect_uri, code_verifier
2. КОГДА запрос отправлен, ТО "OAuth Client" ДОЛЖЕН НЕ включать client_secret в запрос
3. ЕСЛИ Google возвращает успешный ответ, ТО "OAuth Client" ДОЛЖЕН извлечь access_token, refresh_token, expires_in и token_type
4. ЕСЛИ Google возвращает ошибку, ТО "OAuth Client" ДОЛЖЕН вернуть описательное сообщение об ошибке
5. КОГДА токены получены, ТО "OAuth Client" ДОЛЖЕН вычислить время истечения access token (текущее время + expires_in)

### Требование 4: Безопасное Хранение Токенов

**User Story:** Как система, я хочу безопасно хранить токены доступа, чтобы пользователь оставался авторизованным между сессиями.

#### Критерии Приемки

1. КОГДА токены получены, ТО "Token Storage" ДОЛЖЕН сохранить access_token, refresh_token, expires_at и token_type в SQLite базе данных
2. КОГДА токены сохраняются, ТО "Token Storage" ДОЛЖЕН использовать существующий DataManager для работы с базой данных
3. КОГДА токены запрашиваются, ТО "Token Storage" ДОЛЖЕН вернуть все сохраненные токены
4. КОГДА токены удаляются (logout), ТО "Token Storage" ДОЛЖЕН полностью очистить все данные авторизации из базы
5. ЕСЛИ база данных недоступна, ТО "Token Storage" ДОЛЖЕН вернуть ошибку с описанием проблемы

### Требование 5: Проверка Статуса Авторизации

**User Story:** Как приложение, я хочу проверять статус авторизации пользователя, чтобы показывать соответствующий UI.

#### Критерии Приемки

1. КОГДА приложение запрашивает статус авторизации, ТО "OAuth Client" ДОЛЖЕН проверить наличие токенов в "Token Storage"
2. ЕСЛИ токены отсутствуют, ТО "OAuth Client" ДОЛЖЕН вернуть статус "не авторизован"
3. ЕСЛИ access token существует и не истек, ТО "OAuth Client" ДОЛЖЕН вернуть статус "авторизован"
4. ЕСЛИ access token истек, но refresh token существует, ТО "OAuth Client" ДОЛЖЕН попытаться обновить токен
5. ЕСЛИ обновление токена успешно, ТО "OAuth Client" ДОЛЖЕН вернуть статус "авторизован"
6. ЕСЛИ обновление токена неуспешно, ТО "OAuth Client" ДОЛЖЕН вернуть статус "не авторизован" и очистить токены

### Требование 6: Обновление Access Token

**User Story:** Как система, я хочу автоматически обновлять истекшие access tokens, чтобы пользователь не терял доступ к функциям.

#### Критерии Приемки

1. КОГДА access token истек, ТО "OAuth Client" ДОЛЖЕН отправить POST запрос на token endpoint с параметрами: refresh_token, client_id, grant_type=refresh_token
2. КОГДА запрос отправлен, ТО "OAuth Client" ДОЛЖЕН НЕ включать client_secret в запрос
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
5. ВСЕ ошибки ДОЛЖНЫ логироваться в консоль с достаточным контекстом для отладки
6. ДЛЯ распространенных ошибок "OAuth Client" ДОЛЖЕН предоставлять человекочитаемые тексты:
   - "popup_closed_by_user": заголовок "Sign in cancelled", сообщение "You closed the sign-in window before completing authentication.", предложение "Please try again and complete the sign-in process."
   - "access_denied": заголовок "Access denied", сообщение "You denied access to your Google account.", предложение "Clerkly needs access to your Google account to function properly."
   - "network_error": заголовок "Network error", сообщение "Unable to connect to Google authentication servers.", предложение "Please check your internet connection and try again."
   - "invalid_grant": заголовок "Session expired", сообщение "Your authentication session has expired.", предложение "Please sign in again to continue."
   - "invalid_request": заголовок "Invalid request", сообщение "The authentication request was malformed.", предложение "Please try again or contact support if the problem persists."
   - "server_error": заголовок "Server error", сообщение "Google authentication servers are experiencing issues.", предложение "Please try again in a few moments."
   - "temporarily_unavailable": заголовок "Service unavailable", сообщение "Google authentication service is temporarily unavailable.", предложение "Please try again in a few moments."
   - default (неизвестная ошибка): заголовок "Authentication failed", сообщение из errorMessage, предложение "Please try signing in again or contact support if the problem persists."

### Требование 10: Конфигурация OAuth

**User Story:** Как разработчик, я хочу иметь централизованную конфигурацию OAuth параметров, чтобы легко управлять настройками для разных окружений.

#### Критерии Приемки

1. "OAuth Client" ДОЛЖЕН хранить client_id в конфигурационном файле или переменных окружения
2. "OAuth Client" ДОЛЖЕН использовать redirect_uri в формате "clerkly://oauth/callback"
3. "OAuth Client" ДОЛЖЕН запрашивать следующие scopes: "openid", "email", "profile"
4. "OAuth Client" ДОЛЖЕН использовать authorization endpoint: "https://accounts.google.com/o/oauth2/v2/auth"
5. "OAuth Client" ДОЛЖЕН использовать token endpoint: "https://oauth2.googleapis.com/token"
6. "OAuth Client" ДОЛЖЕН использовать revoke endpoint: "https://oauth2.googleapis.com/revoke"

### Требование 11: UI Flow Авторизации

**User Story:** Как пользователь, я хочу видеть понятный интерфейс авторизации при первом запуске приложения, чтобы легко войти через Google аккаунт.

#### Критерии Приемки

1. КОГДА приложение запускается и пользователь не авторизован, ТО "Window Manager" ДОЛЖЕН открыть окно с "Login Screen"
2. КОГДА "Login Screen" отображается, ТО пользователь ДОЛЖЕН видеть кнопку "Continue with Google" и описание функций приложения
3. КОГДА пользователь нажимает кнопку "Continue with Google", ТО "OAuth Client" ДОЛЖЕН инициировать OAuth flow
4. ЕСЛИ авторизация успешна, ТО "Window Manager" ДОЛЖЕН закрыть "Login Screen" и открыть главное окно приложения
5. ЕСЛИ авторизация неуспешна, ТО "Window Manager" ДОЛЖЕН показать "Login Error Screen" с описанием ошибки и кнопкой повтора

### Требование 12: Login Screen Компонент

**User Story:** Как пользователь, я хочу видеть привлекательный экран входа, чтобы понимать возможности приложения перед авторизацией.

#### Критерии Приемки

1. "Login Screen" ДОЛЖЕН отображать логотип Clerkly и заголовок "Clerkly" размером text-4xl
2. "Login Screen" ДОЛЖЕН отображать заголовок карты "Welcome" и описание "Your autonomous AI agent that listens, organizes, and acts"
3. "Login Screen" ДОЛЖЕН отображать кнопку с текстом "Continue with Google" и иконкой Google
4. "Login Screen" ДОЛЖЕН отображать превью функций с иконками и текстами:
   - "Listen & Transcribe" с иконкой микрофона
   - "Extract Tasks" с иконкой чеклиста
   - "Automate Actions" с иконкой обновления
   - "Auto-Sync" с иконкой молнии
5. "Login Screen" ДОЛЖЕН отображать текст "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
6. "Login Screen" ДОЛЖЕН использовать дизайн из прототипа `figma/src/app/components/login-screen.tsx`

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

### Требование 14: Управление Окнами Авторизации

**User Story:** Как система, я хочу правильно управлять окнами во время процесса авторизации, чтобы пользователь видел соответствующий UI на каждом этапе.

#### Критерии Приемки

1. КОГДА приложение запускается, ТО "Window Manager" ДОЛЖЕН проверить статус авторизации через "OAuth Client"
2. ЕСЛИ пользователь не авторизован, ТО "Window Manager" ДОЛЖЕН создать окно с "Login Screen" размером 600x800 пикселей
3. ЕСЛИ пользователь авторизован, ТО "Window Manager" ДОЛЖЕН создать главное окно приложения
4. КОГДА авторизация завершается успешно, ТО "Window Manager" ДОЛЖЕН закрыть окно "Login Screen" и создать главное окно
5. КОГДА авторизация завершается с ошибкой, ТО "Window Manager" ДОЛЖЕН обновить содержимое окна на "Login Error Screen" без создания нового окна
6. КОГДА пользователь нажимает "retry" на "Login Error Screen", ТО "Window Manager" ДОЛЖЕН обновить содержимое окна на "Login Screen"
