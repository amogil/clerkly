# Список Задач: Изоляция Данных Пользователей

## Обзор

Данный документ содержит список задач для реализации изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по email пользователя из Google OAuth профиля.

## Задачи

### 1. Обновление Схемы Базы Данных

- [x] 1.1 Обновить схему таблицы user_data
  - Добавить колонку `user_email TEXT NOT NULL`
  - Изменить PRIMARY KEY на `(key, user_email)`
  - Создать индекс `idx_user_email` на колонке `user_email`
  - Выполнить миграцию вручную (пересоздание базы данных)
  - _Requirements: user-data-isolation.1.2, user-data-isolation.1.10_

### 2. Расширение UserProfileManager

- [x] 2.1 Добавить кэширование email в UserProfileManager
  - Добавить приватное свойство `currentUserEmail: string | null = null`
  - Реализовать метод `getCurrentEmail(): string | null`
  - _Requirements: user-data-isolation.1.11, user-data-isolation.1.15_

- [x] 2.2 Обновить метод fetchProfile для кэширования email
  - После успешного получения профиля установить `this.currentUserEmail = profile.email`
  - Добавить логирование кэширования email
  - _Requirements: user-data-isolation.1.16_

- [x] 2.3 Реализовать метод initialize для восстановления email
  - Загрузить профиль из базы данных при запуске приложения
  - Установить `currentUserEmail` из загруженного профиля
  - Добавить обработку ошибок
  - _Requirements: user-data-isolation.1.17_

- [x] 2.4 Обновить метод clearSession для очистки email
  - Установить `currentUserEmail = null` при logout
  - Добавить логирование очистки email
  - _Requirements: user-data-isolation.1.18_

- [x] 2.5 Написать модульные тесты для UserProfileManager
  - Тест: кэширование email после успешного login
  - Тест: восстановление email из базы данных при запуске
  - Тест: очистка email при logout
  - Тест: getCurrentEmail возвращает корректный email
  - _Requirements: user-data-isolation.1.15, user-data-isolation.1.16, user-data-isolation.1.17, user-data-isolation.1.18_

### 3. Расширение DataManager

- [x] 3.1 Добавить интеграцию с UserProfileManager
  - Добавить приватное свойство `userProfileManager: UserProfileManager`
  - Обновить конструктор для принятия UserProfileManager
  - _Requirements: user-data-isolation.1.11_

- [x] 3.2 Обновить метод saveData для автоматической изоляции
  - Получить `userEmail` через `this.userProfileManager.getCurrentEmail()`
  - Проверить наличие email, выбросить ошибку "No user logged in" если null
  - Обновить SQL запрос: `INSERT OR REPLACE INTO user_data (key, value, user_email) VALUES (?, ?, ?)`
  - Добавить логирование с user_email
  - _Requirements: user-data-isolation.1.3, user-data-isolation.1.11, user-data-isolation.1.12, user-data-isolation.1.14_

- [x] 3.3 Обновить метод loadData для автоматической фильтрации
  - Получить `userEmail` через `this.userProfileManager.getCurrentEmail()`
  - Вернуть `{ success: false, error: 'No user logged in' }` если email null
  - Обновить SQL запрос: `SELECT value FROM user_data WHERE key = ? AND user_email = ?`
  - Добавить логирование с user_email
  - _Requirements: user-data-isolation.1.4, user-data-isolation.1.13, user-data-isolation.1.14_

- [x] 3.4 Обновить метод deleteData для автоматической фильтрации
  - Получить `userEmail` через `this.userProfileManager.getCurrentEmail()`
  - Выбросить ошибку "No user logged in" если email null
  - Обновить SQL запрос: `DELETE FROM user_data WHERE key = ? AND user_email = ?`
  - Добавить логирование с user_email
  - _Requirements: user-data-isolation.1.4, user-data-isolation.1.14_

- [x] 3.5 Написать модульные тесты для DataManager
  - Тест: автоматическое добавление user_email при сохранении
  - Тест: автоматическая фильтрация по user_email при загрузке
  - Тест: автоматическая фильтрация по user_email при удалении
  - Тест: ошибка "No user logged in" при отсутствии пользователя
  - _Requirements: user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.11, user-data-isolation.1.12, user-data-isolation.1.13, user-data-isolation.1.14_

### 4. Обработка Ошибок "No user logged in"

- [x] 4.1 Реализовать обработку ошибки при отсутствии авторизации
  - Перенаправить на экран логина
  - Очистить все кэши
  - _Requirements: user-data-isolation.1.19_

- [x] 4.2 Реализовать обработку ошибки при истечении сессии
  - Применить процедуру восстановления сессии (token-management-ui.1.1, token-management-ui.1.3)
  - При успехе повторить операцию без уведомления пользователю
  - _Requirements: user-data-isolation.1.20_

- [x] 4.3 Реализовать обработку race condition при logout
  - Молча игнорировать ошибку "No user logged in" во время logout
  - Логировать через Logger класс для отладки
  - _Requirements: user-data-isolation.1.21_

- [x] 4.4 Написать модульные тесты для обработки ошибок
  - Тест: перенаправление на логин при отсутствии авторизации
  - Тест: повторная попытка после восстановления сессии
  - Тест: игнорирование ошибки при race condition во время logout
  - _Requirements: user-data-isolation.1.19, user-data-isolation.1.20, user-data-isolation.1.21_

### 5. Интеграция с Main Process

- [x] 5.1 Обновить инициализацию DataManager в main process
  - Передать экземпляр UserProfileManager в конструктор DataManager
  - Вызвать `userProfileManager.initialize()` при запуске приложения
  - _Requirements: user-data-isolation.1.11, user-data-isolation.1.17_

- [x] 5.2 Обновить процедуру logout
  - Вызвать `userProfileManager.clearSession()` при logout
  - Обработать ошибки "No user logged in" согласно требованиям
  - _Requirements: user-data-isolation.1.18, user-data-isolation.1.21_

### 6. Property-Based Тесты

- [x] 6.1 Написать property test: автоматическое добавление user_email
  - **Property 44: Автоматическое добавление user_email при сохранении**
  - **Validates: Requirements 1.3, 1.11, 1.12**
  - Генерировать случайные key, value, email
  - Проверить, что DB содержит запись с user_email = email
  - _Requirements: user-data-isolation.1.3, user-data-isolation.1.11, user-data-isolation.1.12_

- [x] 6.2 Написать property test: автоматическая фильтрация по user_email
  - **Property 45: Автоматическая фильтрация по user_email при загрузке**
  - **Validates: Requirements 1.4, 1.13**
  - Генерировать случайные key, email
  - Сохранить данные для нескольких пользователей
  - Проверить, что loadData возвращает только данные для конкретного пользователя
  - _Requirements: user-data-isolation.1.4, user-data-isolation.1.13_

- [x] 6.3 Написать property test: изоляция данных между пользователями
  - **Property 46: Изоляция данных между пользователями**
  - **Validates: Requirements 1.6, 1.8**
  - Генерировать два разных email (userA, userB)
  - Сохранить данные как userA
  - Проверить, что userB не может видеть данные userA
  - _Requirements: user-data-isolation.1.6, user-data-isolation.1.8_

- [x] 6.4 Написать property test: восстановление данных при повторном входе
  - **Property 47: Восстановление данных при повторном входе**
  - **Validates: Requirements 1.5, 1.7**
  - Генерировать случайные key, value, email
  - Сохранить данные, выполнить logout, выполнить login снова
  - Проверить, что данные восстановлены в неизменном виде
  - _Requirements: user-data-isolation.1.5, user-data-isolation.1.7_

- [x] 6.5 Написать property test: определение пользователя по OAuth email
  - **Property 48: Определение пользователя по OAuth email**
  - **Validates: Requirements 1.1, 1.16**
  - Генерировать случайный OAuth профиль с email
  - Проверить, что система корректно извлекает email
  - _Requirements: user-data-isolation.1.1, user-data-isolation.1.16_

- [x] 6.6 Написать property test: очистка email при logout
  - **Property 49: Очистка email при logout**
  - **Validates: Requirements 1.18**
  - Генерировать случайный email
  - Установить currentUserEmail, выполнить logout
  - Проверить, что currentUserEmail = null
  - _Requirements: user-data-isolation.1.18_

- [x] 6.7 Написать property test: изоляция применяется ко всем типам данных
  - **Property 50: Изоляция применяется ко всем типам данных**
  - **Validates: Requirements 1.8**
  - Генерировать случайные данные разных типов (настройки, профиль, токены, задачи)
  - Проверить, что изоляция применяется автоматически для всех типов
  - _Requirements: user-data-isolation.1.8_

### 7. Функциональные Тесты

- [x] 7.1 Написать функциональный тест: изоляция данных между пользователями
  - Авторизовать пользователя A, сохранить данные
  - Выполнить logout, авторизовать пользователя B
  - Проверить, что пользователь B не видит данные пользователя A
  - _Requirements: user-data-isolation.1.5, user-data-isolation.1.6, user-data-isolation.1.8_

- [x] 7.2 Написать функциональный тест: восстановление данных после повторного входа
  - Авторизовать пользователя A, сохранить данные
  - Выполнить logout, авторизовать пользователя A снова
  - Проверить, что все данные восстановлены
  - _Requirements: user-data-isolation.1.7, user-data-isolation.1.17_

- [x] 7.3 Написать функциональный тест: сохранность данных после logout
  - Авторизовать пользователя A, сохранить данные
  - Выполнить logout
  - Проверить, что данные остались в базе данных
  - _Requirements: user-data-isolation.1.5, user-data-isolation.1.8_

- [x] 7.4 Написать функциональный тест: фильтрация данных по user email
  - Создать данные для нескольких пользователей
  - Авторизоваться как каждый пользователь
  - Проверить, что каждый пользователь видит только свои данные
  - _Requirements: user-data-isolation.1.4, user-data-isolation.1.6_

- [x] 7.5 Написать функциональный тест: обработка ошибки "No user logged in"
  - Попытаться сохранить данные без авторизации
  - Проверить перенаправление на экран логина
  - Проверить очистку кэшей
  - _Requirements: user-data-isolation.1.14, user-data-isolation.1.19_

- [x] 7.6 Написать функциональный тест: повторная попытка после обновления токена
  - Авторизоваться, дождаться истечения токена
  - Попытаться выполнить операцию с данными
  - Проверить автоматическое обновление токена и успешное выполнение операции
  - _Requirements: user-data-isolation.1.20_

### 8. Checkpoint - Валидация и Финализация

- [x] 8.1 Запустить полную валидацию
  - Выполнить `npm run validate`
  - Убедиться, что все проверки проходят (TypeScript, ESLint, Prettier, модульные и property-based тесты)
  - Проверить покрытие кода (минимум 85%)

- [x] 8.2 Проверить комментарии с требованиями
  - Убедиться, что все функции содержат комментарии с Requirements
  - Убедиться, что все тесты содержат структуру (Preconditions, Action, Assertions, Requirements)

- [x] 8.3 Обновить таблицу покрытия требований в design.md
  - Проверить, что все требования покрыты тестами
  - Обновить таблицу покрытия в документе дизайна

## Примечания

- Задачи, помеченные `*`, являются опциональными (тесты) и могут быть пропущены для быстрого MVP
- Все задачи ссылаются на конкретные требования для трассируемости
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде должны быть на английском языке
- Каждая задача должна быть провалидирована перед переходом к следующей
