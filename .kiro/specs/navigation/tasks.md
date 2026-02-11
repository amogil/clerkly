# Список Задач: Навигация и Роутинг

## Обзор

Данный документ содержит список задач для реализации системы навигации и защиты маршрутов в приложении Clerkly, включая интеграцию с OAuth авторизацией.

## Задачи

### 1. Создание NavigationManager

- [x] 1.1 Создать класс NavigationManager
  - Реализовать метод `checkAuthStatus()` для проверки статуса авторизации
  - Реализовать метод `redirectToLogin()` для перенаправления на экран логина
  - Реализовать метод `redirectToDashboard()` для перенаправления на Dashboard
  - Реализовать метод `initialize()` для инициализации навигации при запуске
  - Добавить зависимость от Router
  - **Requirements:** navigation.1.1, navigation.1.3, navigation.1.4
  - **Property:** 29, 30, 31, 32, 33

- [x] 1.2 Создать класс AuthGuard
  - Реализовать метод `canActivate()` для проверки доступа к маршруту
  - Определить список защищенных маршрутов (dashboard, settings, tasks, calendar, contacts)
  - Реализовать метод `isProtectedRoute()` для проверки типа маршрута
  - Добавить зависимость от NavigationManager
  - **Requirements:** navigation.1.2

- [x] 1.3 Интегрировать NavigationManager с OAuth events
  - Добавить слушатель события `auth:success` для перенаправления на Dashboard
  - Добавить слушатель события `auth:logout` для перенаправления на Login
  - Реализовать в App.tsx или главном компоненте приложения
  - Обеспечить очистку подписок при размонтировании
  - **Requirements:** navigation.1.3, navigation.1.4

### 2. Интеграция с Router

- [x] 2.1 Настроить маршруты приложения
  - Определить публичный маршрут `/login`
  - Определить защищенные маршруты: `/dashboard`, `/settings`, `/tasks`, `/calendar`, `/contacts`
  - Интегрировать AuthGuard для защиты маршрутов
  - **Requirements:** navigation.1.1, navigation.1.2

- [x] 2.2 Реализовать логику перенаправления
  - При попытке доступа к защищенному маршруту без авторизации → redirect to login
  - При успешной авторизации на экране логина → redirect to dashboard
  - При logout → redirect to login
  - **Requirements:** navigation.1.1, navigation.1.3, navigation.1.4

### 3. Модульные Тесты для NavigationManager

- [x] 3.1 Тест: checkAuthStatus() возвращает корректный статус
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: true
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается true
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: false
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается false
  - **Requirements:** navigation.1.1

- [x] 3.2 Тест: redirectToLogin() перенаправляет на /login
  - Создать mock Router
  - Вызвать redirectToLogin()
  - Проверить, что router.navigate() вызван с '/login'
  - **Requirements:** navigation.1.1, navigation.1.4

- [x] 3.3 Тест: redirectToDashboard() перенаправляет на /dashboard
  - Создать mock Router
  - Вызвать redirectToDashboard()
  - Проверить, что router.navigate() вызван с '/dashboard'
  - **Requirements:** navigation.1.3

- [x] 3.4 Тест: initialize() перенаправляет неавторизованного пользователя на login
  - Мокировать checkAuthStatus() для возврата false
  - Вызвать initialize()
  - Проверить, что redirectToLogin() был вызван
  - **Requirements:** navigation.1.1

- [x] 3.5 Тест: initialize() не перенаправляет авторизованного пользователя
  - Мокировать checkAuthStatus() для возврата true
  - Мокировать router.currentRoute = '/dashboard'
  - Вызвать initialize()
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** navigation.1.1

### 4. Модульные Тесты для AuthGuard

- [x] 4.1 Тест: canActivate() разрешает доступ к публичным маршрутам
  - Вызвать canActivate('/login')
  - Проверить, что возвращается true без проверки авторизации
  - **Requirements:** navigation.1.1

- [x] 4.2 Тест: canActivate() блокирует доступ к защищенным маршрутам без авторизации
  - Мокировать navigationManager.checkAuthStatus() для возврата false
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается false
  - Проверить, что navigationManager.redirectToLogin() был вызван
  - **Requirements:** navigation.1.2

- [x] 4.3 Тест: canActivate() разрешает доступ к защищенным маршрутам с авторизацией
  - Мокировать navigationManager.checkAuthStatus() для возврата true
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается true
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** navigation.1.2

- [x] 4.4 Тест: isProtectedRoute() корректно определяет защищенные маршруты
  - Проверить, что isProtectedRoute('/login') возвращает false
  - Проверить, что isProtectedRoute('/dashboard') возвращает true
  - Проверить, что isProtectedRoute('/settings') возвращает true
  - Проверить, что isProtectedRoute('/tasks') возвращает true
  - **Requirements:** navigation.1.2

### 5. Функциональные Тесты

- [x] 5.1 Функциональный тест: should show login screen when not authenticated
  - Запустить приложение без авторизации
  - Проверить, что показывается экран логина (/login)
  - Попытаться перейти на /dashboard
  - Проверить, что перенаправлен обратно на /login
  - Закрыть приложение
  - **Requirements:** navigation.1.1, navigation.1.2

- [x] 5.2 Функциональный тест: should redirect to dashboard after successful authentication
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth
  - Проверить, что автоматически перенаправлен на /dashboard
  - Проверить, что НЕ показывается экран логина
  - Закрыть приложение
  - **Requirements:** navigation.1.3

- [x] 5.3 Функциональный тест: should block access to protected routes without authentication
  - Запустить приложение без авторизации
  - Попытаться перейти на /settings
  - Проверить, что перенаправлен на /login
  - Попытаться перейти на /tasks
  - Проверить, что перенаправлен на /login
  - Попытаться перейти на /calendar
  - Проверить, что перенаправлен на /login
  - Закрыть приложение
  - **Requirements:** navigation.1.2

- [x] 5.4 Функциональный тест: should redirect to login after logout
  - Запустить приложение с авторизацией
  - Проверить, что находимся на /dashboard или другом защищенном маршруте
  - Выполнить logout
  - Проверить, что автоматически перенаправлен на /login
  - Попытаться вернуться на /dashboard
  - Проверить, что снова перенаправлен на /login
  - Закрыть приложение
  - **Requirements:** navigation.1.4

- [x] 5.5 Функциональный тест: should allow access to all routes when authenticated
  - Запустить приложение с авторизацией
  - Перейти на /dashboard
  - Проверить успешный доступ
  - Перейти на /settings
  - Проверить успешный доступ
  - Перейти на /tasks
  - Проверить успешный доступ
  - Закрыть приложение
  - **Requirements:** navigation.1.2

### 6. Обновление Документации

- [x] 6.1 Добавить JSDoc комментарии к NavigationManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** navigation.1

- [x] 6.2 Добавить JSDoc комментарии к AuthGuard
  - Документировать все публичные методы
  - Указать ссылки на требования в комментариях
  - **Requirements:** navigation.1

- [x] 6.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования navigation.1.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** navigation.1

### 7. Валидация и Финализация

- [x] 7.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** Все

- [x] 7.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования покрыты тестами
  - Проверить таблицу покрытия в design.md
  - **Requirements:** Все

- [x] 7.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** Все

## Примечания

- Все задачи должны выполняться последовательно в указанном порядке
- Каждая задача должна быть завершена и протестирована перед переходом к следующей
- Функциональные тесты (раздел 5) запускаются ТОЛЬКО при явной просьбе пользователя
- Автоматическая валидация (задача 7.1) НЕ включает функциональные тесты
- Все комментарии в коде должны быть на английском языке
- Все названия компонентов должны быть на английском языке
