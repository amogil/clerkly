# Список Задач: Профиль Пользователя

## Обзор

Данный документ содержит список задач для реализации блока Account (профиль пользователя) в приложении Clerkly.

## Задачи

### 1. Создание UserProfileManager

- [x] 1.1 Создать интерфейс UserProfile
  - Определить структуру данных профиля (id, email, name, given_name, family_name, locale, etc.)
  - Добавить поле lastUpdated для отслеживания времени обновления
  - **Requirements:** account-profile.1.2, account-profile.1.3

- [x] 1.2 Создать класс UserProfileManager
  - Реализовать метод `fetchProfile()` для запроса данных из Google UserInfo API
  - Реализовать метод `saveProfile()` для сохранения в DataManager
  - Реализовать метод `loadProfile()` для загрузки из DataManager
  - Реализовать метод `clearProfile()` для очистки данных
  - Реализовать метод `updateProfileAfterTokenRefresh()` для автоматического обновления
  - **Requirements:** account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8

- [x] 1.3 Интегрировать UserProfileManager с OAuthClientManager и LifecycleManager
  - Добавить метод `setProfileManager()` в OAuthClientManager для установки связи с UserProfileManager
  - Добавить вызов `updateProfileAfterTokenRefresh()` в метод `refreshAccessToken()` OAuthClientManager
  - Добавить инициализацию UserProfileManager в LifecycleManager конструкторе
  - Добавить вызов `fetchProfile()` в метод `LifecycleManager.initialize()` при авторизованном пользователе
  - Передать OAuthClientManager в конструктор UserProfileManager
  - Связать компоненты через `oauthClient.setProfileManager(profileManager)` в main/index.ts
  - **Requirements:** account-profile.1.5

- [x] 1.4 Имплементировать синхронный процесс получения профиля при авторизации
  - Добавить метод `fetchProfileSynchronously()` в UserProfileManager для синхронного получения профиля
  - Интегрировать вызов `fetchProfileSynchronously()` в метод `handleAuthorizationCode()` OAuthClientManager после успешного обмена code на токены
  - При успешной загрузке профиля: сохранить профиль в базу данных И вернуть success
  - При ошибке загрузки профиля: очистить токены через TokenStorageManager И вернуть ошибку с errorCode 'profile_fetch_failed'
  - Обеспечить, что процесс блокирующий (await) - Dashboard показывается только после успешной загрузки профиля
  - **Requirements:** google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8, account-profile.1.3, account-profile.1.4, account-profile.1.5
  - **Property:** 15, 16, 17, 18

### 2. Расширение IPC Handlers

- [x] 2.1 Добавить IPC handler для получения профиля
  - Реализовать `auth:get-profile` handler
  - Возвращать кэшированные данные из DataManager
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** account-profile.1.2, account-profile.1.7

- [x] 2.2 Добавить IPC handler для обновления профиля
  - Реализовать `auth:refresh-profile` handler в AuthIPCHandlers
  - Вызывать `fetchProfile()` для получения свежих данных из Google API
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** account-profile.1.5

- [x] 2.3 Расширить preload API
  - Добавить метод `window.api.auth.getProfile()` в preload/index.ts
  - Добавить метод `window.api.auth.refreshProfile()` в preload/index.ts
  - Обновить TypeScript типы для API в src/types/index.ts
  - **Requirements:** account-profile.1.2, account-profile.1.5

### 3. Создание Account Component

- [x] 3.1 Создать React компонент Account
  - Создать файл `src/renderer/components/account.tsx`
  - Реализовать отображение пустого состояния (не авторизован)
  - Реализовать отображение данных профиля (имя, email)
  - Использовать read-only поля для данных профиля
  - **Requirements:** account-profile.1.1, account-profile.1.2, account-profile.1.3, account-profile.1.4

- [x] 3.2 Добавить загрузку профиля при монтировании компонента
  - Вызывать `window.api.auth.getProfile()` в useEffect
  - Обрабатывать состояние загрузки
  - Обрабатывать ошибки загрузки
  - **Requirements:** account-profile.1.2, account-profile.1.7

- [x] 3.3 Добавить loader для синхронной загрузки профиля при авторизации
  - Создать состояние loading в компоненте авторизации (или использовать существующий loader)
  - Показывать loader во время синхронной загрузки профиля (после обмена code на токены)
  - При успехе: скрыть loader И показать Dashboard
  - При ошибке: скрыть loader И показать LoginError компонент с errorCode 'profile_fetch_failed'
  - **Requirements:** account-profile.1.4
  - **Property:** 16, 17, 18

- [x] 3.4 Расширить LoginError компонент для обработки ошибки profile_fetch_failed
  - Добавить обработку errorCode 'profile_fetch_failed' в LoginError компоненте
  - Показывать сообщение: "Failed to load your profile. Please try again."
  - Показывать кнопку "Continue with Google" для повторной авторизации
  - **Requirements:** google-oauth-auth.3.7, account-profile.1.4, account-profile.1.5
  - **Property:** 18

- [x] 3.5 Добавить слушатель события auth:success
  - Автоматически перезагружать профиль после успешной авторизации
  - Обновлять UI с новыми данными
  - **Requirements:** account-profile.1.2

- [x] 3.6 Добавить очистку профиля при logout
  - Слушать событие logout
  - Очищать состояние компонента
  - Возвращаться к пустому состоянию
  - **Requirements:** account-profile.1.8

### 4. Стилизация Account Component

- [x] 4.1 Создать стили для Account блока
  - Добавить стили для пустого состояния
  - Добавить стили для полей профиля (read-only)
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** account-profile.1.1, account-profile.1.3, account-profile.1.4

- [x] 4.2 Интегрировать с существующей темой
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю приложения
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** account-profile.1.3

### 5. Модульные Тесты для UserProfileManager

- [x] 5.1 Тест: fetchProfile() успешно получает данные из Google API
- [x] 5.2 Тест: fetchProfile() возвращает кэшированные данные при ошибке API
- [x] 5.3 Тест: fetchProfile() возвращает null если нет токенов
- [x] 5.4 Тест: saveProfile() корректно сохраняет данные
- [x] 5.5 Тест: loadProfile() корректно загружает данные
- [x] 5.6 Тест: clearProfile() удаляет данные
- [x] 5.7 Тест: updateProfileAfterTokenRefresh() вызывает fetchProfile()
- [x] 5.8 Тест: fetchProfileSynchronously() успешно получает профиль при авторизации
- [x] 5.9 Тест: fetchProfileSynchronously() очищает токены при ошибке

### 6. Модульные Тесты для IPC Handlers

- [x] 6.1 Тест: auth:get-profile возвращает профиль
- [x] 6.2 Тест: auth:get-profile обрабатывает ошибки
- [x] 6.3 Тест: auth:refresh-profile обновляет профиль

### 7. Модульные Тесты для Account Component

- [x] 7.1 Тест: отображает пустое состояние когда не авторизован
- [x] 7.2 Тест: отображает данные профиля после авторизации
- [x] 7.3 Тест: поля профиля read-only
- [x] 7.4 Тест: перезагружает профиль при событии auth:success
- [x] 7.5 Тест: очищает профиль при logout

### 8. Функциональные Тесты

- [x] 8.1 Тест: полный цикл авторизации и загрузки профиля
- [x] 8.2 Тест: автоматическое обновление профиля при refresh token
- [x] 8.3 Тест: автоматическое обновление профиля при запуске приложения
- [x] 8.4 Тест: кэширование профиля при ошибке API
- [x] 8.5 Тест: синхронная загрузка профиля при авторизации (успех)
- [x] 8.6 Тест: синхронная загрузка профиля при авторизации (ошибка)
- [x] 8.7 Тест: should show login screen when not authenticated
- [x] 8.8 Тест: should show dashboard after successful authentication
- [x] 8.9 Тест: should load profile in background after authentication
- [x] 8.10 Тест: should show cached data while loading profile
- [x] 8.11 Тест: should show empty fields on first authentication
- [x] 8.12 Тест: should populate profile data when fetch succeeds
- [x] 8.13 Тест: should show loader during synchronous profile fetch
- [x] 8.14 Тест: should show LoginError when profile fetch fails

### 9. Валидация и Финализация

- [x] 9.1 Запустить автоматическую валидацию
- [x] 9.2 Проверить покрытие тестами
- [x] 9.3 Проверить комментарии с требованиями

## Примечания

- Все задачи должны выполняться последовательно в указанном порядке
- Каждая задача должна быть завершена и протестирована перед переходом к следующей
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде должны быть на английском языке
