# Список Задач: UI Управления Токенами

## Обзор

Данный документ содержит список задач для реализации UI компонентов управления токенами в приложении Clerkly.

## Задачи

### 1. Автоматический Refresh Токенов

- [x] 1.1 Реализовать автоматический refresh при HTTP 401
  - Добавить перехватчик HTTP запросов в Renderer
  - При получении 401 ошибки вызывать `window.api.auth.refreshAccessToken()`
  - Повторять оригинальный запрос с новым токеном
  - **Requirements:** token-management-ui.1.1, token-management-ui.1.2

- [x] 1.2 Добавить обработку ошибок refresh
  - При ошибке refresh перенаправлять на экран логина
  - Очищать токены через `window.api.auth.logout()`
  - Показывать уведомление об ошибке
  - **Requirements:** token-management-ui.1.3

### 2. Loader для Refresh Токенов

- [x] 2.1 Создать компонент TokenRefreshLoader
  - Показывать индикатор загрузки во время refresh
  - Скрывать после успешного refresh
  - **Requirements:** token-management-ui.1.2

- [x] 2.2 Интегрировать TokenRefreshLoader с App.tsx
  - Добавить компонент в главный компонент
  - Управлять видимостью через состояние
  - **Requirements:** token-management-ui.1.2

### 3. Модульные Тесты

- [x] 3.1 Тест: HTTP interceptor вызывает refresh при 401
- [x] 3.2 Тест: HTTP interceptor повторяет запрос после refresh
- [x] 3.3 Тест: HTTP interceptor перенаправляет на login при ошибке refresh
- [x] 3.4 Тест: TokenRefreshLoader показывается во время refresh
- [x] 3.5 Тест: TokenRefreshLoader скрывается после refresh

### 4. Функциональные Тесты

- [x] 4.1 Тест: should automatically refresh token on 401 error
- [x] 4.2 Тест: should show loader during token refresh
- [x] 4.3 Тест: should redirect to login on refresh failure

### 5. Валидация и Финализация

- [x] 5.1 Запустить автоматическую валидацию
- [x] 5.2 Проверить покрытие тестами
- [x] 5.3 Проверить комментарии с требованиями

## Примечания

- Все задачи должны выполняться последовательно в указанном порядке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде должны быть на английском языке
