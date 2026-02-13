# Список Задач: User Data Isolation

## Обзор

Данный документ содержит список задач для обновления системы изоляции данных пользователей. Основное изменение: переход с `user_email` на `user_id` (10-символьная случайная alphanumeric строка) с введением таблицы `users`.

**Статус:** Требуется обновление существующей реализации

**Оценка времени:** 6-8 дней

---

## Анализ Текущего Состояния

### Текущая Реализация (что есть сейчас):

**UserProfileManager (`src/main/auth/UserProfileManager.ts`):**
- ❌ Использует `currentUserEmail: string | null` (нужно `currentUserId`)
- ❌ Метод `getCurrentEmail()` (нужно `getCurrentUserId()`)
- ❌ Нет таблицы `users`
- ❌ Нет метода `generateUserId()`
- ❌ Нет метода `findOrCreateUser()`
- ❌ Ссылается на старые требования (user-data-isolation.1.14-1.18)

**DataManager (`src/main/DataManager.ts`):**
- ❌ Использует `user_email` для изоляции (нужно `user_id`)
- ❌ Вызывает `getCurrentEmail()` (нужно `getCurrentUserId()`)
- ❌ SQL запросы используют `user_email` (нужно `user_id`)
- ❌ Ссылается на старые требования

**Миграции (`migrations/001_initial_schema.sql`):**
- ❌ Нет таблицы `users`
- ❌ Таблица `user_data` использует `user_email` (нужно `user_id`)
- ❌ Таблица `user_data` имеет колонку `timestamp` (нужно удалить)

**Тесты:**
- ❌ Тесты UserProfileManager используют `getCurrentEmail()`
- ❌ Тесты DataManager используют `user_email`
- ❌ Нет тестов для `generateUserId()`, `findOrCreateUser()`

---

## Фаза 1: Создание Таблицы Users (1-2 дня)

### 1.1. Создать миграцию для таблицы users
- [x] Создать файл миграции `002_create_users_table.sql` в `migrations/`
- [x] Добавить UP секцию:
  ```sql
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  ```
- [x] Добавить DOWN секцию для отката
- [x] Запустить миграцию и проверить создание таблицы
- _Requirements: user-data-isolation.0.1, user-data-isolation.0.5_

### 1.2. Написать модульные тесты для миграции
- [x] Тест: таблица `users` создается с правильной структурой
- [x] Тест: индекс `idx_users_email` создается
- [x] Тест: DOWN миграция удаляет таблицу и индекс
- _Requirements: user-data-isolation.0.1, user-data-isolation.0.5_

### 1.3. Запустить валидацию Фазы 1
- [x] Выполнить `npm run validate`
- [x] Убедиться, что миграция применяется корректно

---

## Фаза 2: Расширение UserProfileManager (2 дня)

### 2.1. Добавить интерфейс User
- [x] Добавить интерфейс `User` в `src/main/auth/UserProfileManager.ts`:
  ```typescript
  interface User {
    user_id: string;
    name: string | null;
    email: string;
  }
  ```
- [x] Экспортировать интерфейс
- _Requirements: user-data-isolation.1_

### 2.2. Добавить метод generateUserId
- [x] Реализовать приватный метод `generateUserId(): string`:
  - Набор символов: A-Z, a-z, 0-9 (62 символа)
  - Длина: 10 символов
  - Использовать `Math.random()` для выбора символов
- [x] Добавить комментарий с Requirements
- _Requirements: user-data-isolation.0.2, user-data-isolation.1.1_

### 2.3. Добавить метод findOrCreateUser
- [x] Реализовать метод `findOrCreateUser(email: string, name: string | null): User`:
  - Искать пользователя по email: `SELECT user_id, name, email FROM users WHERE email = ?`
  - Если найден: обновить name при необходимости, вернуть существующего
  - Если не найден: вызвать `generateUserId()`, создать запись, вернуть нового
- [x] Добавить логирование через Logger
- [x] Добавить комментарий с Requirements
- _Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.2_

### 2.4. Заменить currentUserEmail на currentUserId
- [x] Заменить `private currentUserEmail: string | null` на `private currentUserId: string | null`
- [x] Заменить метод `getCurrentEmail()` на `getCurrentUserId()`
- [x] Заменить метод `clearCurrentEmail()` на `clearSession()` (уже есть, проверить)
- [x] Обновить все внутренние ссылки
- _Requirements: user-data-isolation.1.1, user-data-isolation.1.4, user-data-isolation.1.5_

### 2.5. Обновить метод fetchProfile
- [x] После получения профиля вызвать `findOrCreateUser(profile.email, profile.name)`
- [x] Установить `this.currentUserId = user.user_id`
- [x] Использовать `ErrorHandler.handleBackgroundError()` для ошибок
- [x] Обновить логирование
- _Requirements: user-data-isolation.1.2, error-notifications.1.4_

### 2.6. Обновить метод fetchProfileSynchronously
- [x] После получения профиля вызвать `findOrCreateUser(profile.email, profile.name)`
- [x] Установить `this.currentUserId = user.user_id`
- [x] Обновить логирование
- _Requirements: user-data-isolation.1.2_

### 2.7. Обновить метод initialize
- [x] Загрузить профиль из Google API (если есть токены)
- [x] Вызвать `findOrCreateUser(profile.email, profile.name)` через fetchProfile
- [x] Установить `this.currentUserId = user.user_id`
- [x] Использовать `ErrorHandler.handleBackgroundError()` для ошибок
- [x] Обновить логирование
- _Requirements: user-data-isolation.1.3_

### 2.8. Обновить метод loadProfile
- [x] Упростить метод - теперь не устанавливает currentUserId
- [x] currentUserId должен быть установлен до вызова loadProfile
- _Requirements: user-data-isolation.1.3_

### 2.9. Обновить метод clearSession
- [x] Установить `this.currentUserId = null`
- [x] Обновить логирование
- _Requirements: user-data-isolation.1.4_

### 2.10. Удалить устаревшие методы
- [x] Удалить `getCurrentEmail()` (заменен на `getCurrentUserId()`)
- [x] Удалить `clearCurrentEmail()` (заменен на `clearSession()`)
- [x] Обновить все вызовы в других файлах

### 2.11. Обновить комментарии Requirements
- [x] Заменить старые ID требований (user-data-isolation.1.14-1.18) на новые (user-data-isolation.0-5)
- [x] Добавить ссылки на error-notifications.1.4 где используется ErrorHandler

### 2.12. Написать/обновить модульные тесты UserProfileManager
- [x] Тест: `should generate valid 10-character alphanumeric user_id`
- [x] Тест: `should create new user on first login`
- [x] Тест: `should find existing user on re-login`
- [x] Тест: `should update user name if changed`
- [x] Тест: `should not update name if null passed`
- [x] Тест: `should cache user_id after successful login`
- [x] Тест: `should clear user_id on logout`
- [x] Тест: `getCurrentUserId returns correct user_id`
- [x] Тест: `should call ErrorHandler.handleBackgroundError on fetchProfile failure`
- [x] Тест: `should call ErrorHandler.handleBackgroundError on initialize failure`
- _Requirements: user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1-1.5, error-notifications.1.4_

### 2.13. Запустить валидацию Фазы 2
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят
- [x] Проверить покрытие кода UserProfileManager (минимум 85%)

---

## Фаза 3: Миграция user_data и обновление DataManager (2 дня)

### 3.1. Создать миграцию для изменения user_data
- [ ] Создать файл миграции `003_migrate_user_data_to_user_id.ts` в `migrations/` (код на TypeScript)
- [ ] Реализовать функцию `generateUserId()` - та же логика что в UserProfileManager:
  - Набор символов: A-Z, a-z, 0-9 (62 символа)
  - Длина: 10 символов
- [ ] Добавить UP секцию:
  - Получить все уникальные email из `user_data`
  - Создать записи в `users` с случайным alphanumeric user_id для каждого email
  - Создать новую таблицу `user_data_new` с `user_id` вместо `user_email` (без колонки `timestamp`)
  - Скопировать данные с преобразованием email → user_id через JOIN
  - Удалить старую таблицу, переименовать новую
  - Создать индекс `idx_user_id`
- [ ] Добавить DOWN секцию для отката
- [ ] Протестировать миграцию на тестовой базе
- _Requirements: user-data-isolation.5.1, user-data-isolation.5.2, user-data-isolation.5.3, user-data-isolation.5.4_

### 3.2. Удалить колонку timestamp из user_data
- [ ] Убедиться, что новая схема user_data НЕ содержит колонку `timestamp`
- [ ] Обновить все SQL запросы, использующие `timestamp`
- [ ] Использовать только `created_at` и `updated_at`
- _Requirements: user-data-isolation.2.1, user-data-isolation.2.2_

### 3.3. Обновить DataManager для использования user_id
- [ ] Изменить метод `saveData`:
  - Заменить `getCurrentEmail()` на `getCurrentUserId()`
  - Заменить `user_email` на `user_id` в SQL запросе
  - Удалить `timestamp` из INSERT
  - Обновить логирование
- [ ] Изменить метод `loadData`:
  - Заменить `getCurrentEmail()` на `getCurrentUserId()`
  - Заменить `user_email` на `user_id` в SQL запросе
  - Обновить логирование
- [ ] Изменить метод `deleteData`:
  - Заменить `getCurrentEmail()` на `getCurrentUserId()`
  - Заменить `user_email` на `user_id` в SQL запросе
  - Обновить логирование
- [ ] Обновить комментарии с Requirements (заменить старые ID на новые)
- _Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.3.1, user-data-isolation.3.2_

### 3.4. Обновить модульные тесты DataManager
- [ ] Обновить тест: `should automatically add user_id when saving`
- [ ] Обновить тест: `should automatically filter by user_id when loading`
- [ ] Обновить тест: `should automatically filter by user_id when deleting`
- [ ] Обновить тест: `should throw error when no user logged in`
- [ ] Обновить все моки для использования `getCurrentUserId()` вместо `getCurrentEmail()`
- [ ] Удалить тесты, связанные с `timestamp`
- _Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.3.2_

### 3.5. Написать тесты для миграции данных
- [ ] Тест: существующие данные с user_email мигрируются на user_id
- [ ] Тест: создаются записи в таблице users для каждого уникального email
- [ ] Тест: колонка timestamp удаляется
- [ ] Тест: DOWN миграция восстанавливает user_email
- _Requirements: user-data-isolation.5.1, user-data-isolation.5.2, user-data-isolation.5.3, user-data-isolation.5.4_

### 3.6. Запустить валидацию Фазы 3
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все тесты проходят

---

## Фаза 4: Property-Based и Функциональные Тесты (1-2 дня)

### 4.1. Обновить/создать property тесты
- [ ] Создать/обновить файл `tests/property/auth/UserDataIsolation.property.test.ts`
- [ ] Property: `should generate valid 10-character alphanumeric user_id` (100+ итераций)
- [ ] Property: `should return same user_id for same email on repeated findOrCreateUser calls`
- [ ] Property: `should isolate data between different users`
- [ ] Property: `should restore data after logout and re-login with same email`
- _Requirements: user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.4.4_

### 4.2. Обновить функциональные тесты
- [ ] Обновить `tests/functional/user-data-isolation.spec.ts`
- [ ] Тест: `should create user record on first login`
- [ ] Тест: `should find existing user on re-login`
- [ ] Тест: `should update user name if changed`
- [ ] Тест: `should isolate data between different users`
- [ ] Тест: `should persist data after logout`
- [ ] Тест: `should restore user data after re-login`
- [ ] Тест: `should filter data by user_id`
- [ ] Тест: `should handle No user logged in error`
- _Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.1_

### 4.3. Запустить валидацию Фазы 4
- [ ] Выполнить `npm run test:property`
- [ ] Убедиться, что все property тесты проходят

---

## Фаза 5: Обновление Связанных Компонентов (1 день)

### 5.1. Обновить AuthIPCHandlers
- [ ] Найти все использования `getCurrentEmail()`
- [ ] Заменить на `getCurrentUserId()`
- [ ] Обновить тесты

### 5.2. Обновить другие компоненты, использующие UserProfileManager
- [ ] Поиск: `grep -r "getCurrentEmail" src/`
- [ ] Поиск: `grep -r "currentUserEmail" src/`
- [ ] Заменить все вхождения на `getCurrentUserId()` / `currentUserId`
- [ ] Обновить соответствующие тесты

### 5.3. Обновить связанные спецификации
- [ ] Обновить `.kiro/specs/settings/requirements.md`:
  - Заменить упоминания `user_email` на `user_id`
  - Обновить ссылки на требования user-data-isolation
- [ ] Обновить `.kiro/specs/google-oauth-auth/requirements.md`:
  - Обновить ссылки на требования user-data-isolation
- [ ] Проверить другие спецификации на упоминания `user_email`
- _Requirements: документация_

### 5.4. Обновить существующие тесты
- [ ] Найти все тесты, использующие `getCurrentEmail()`
- [ ] Заменить на `getCurrentUserId()`
- [ ] Обновить моки для использования user_id вместо email
- [ ] Обновить тестовые данные (email → user_id)
- _Requirements: user-data-isolation.1.4, user-data-isolation.1.5_

---

## Фаза 6: Финализация (0.5 дня)

### 6.1. Запустить полную валидацию
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все проверки проходят:
  - ✅ TypeScript компиляция
  - ✅ ESLint
  - ✅ Prettier
  - ✅ Модульные тесты
  - ✅ Property-based тесты
  - ✅ Покрытие кода (минимум 85%)

### 6.2. Обновить документацию
- [ ] Проверить комментарии с Requirements в коде
- [ ] Обновить таблицу покрытия требований в design.md
- [ ] Убедиться, что все тесты имеют структуру (Preconditions, Action, Assertions, Requirements)

### 6.3. Запросить функциональные тесты
- [ ] Спросить пользователя: "Запустить функциональные тесты? (они покажут окна на экране)"

---

## Примечания

- Миграция данных должна быть обратно совместимой
- При миграции существующие данные привязываются к user_id через email
- Все комментарии в коде на английском языке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Каждая фаза должна быть провалидирована перед переходом к следующей
- FOREIGN KEY не используется - целостность поддерживается логикой приложения
- DataManager НЕ вызывает ErrorHandler напрямую - ошибки обрабатываются вызывающим кодом

## Риски

1. **Миграция данных** - существующие данные могут быть потеряны при некорректной миграции
   - Митигация: тестирование миграции на копии базы, DOWN миграция для отката

2. **Совместимость** - другие модули могут использовать getCurrentEmail()
   - Митигация: поиск всех использований, обновление вызовов

3. **Производительность** - дополнительный JOIN при миграции
   - Митигация: индексы на email и user_id

4. **Circular dependency** - UserProfileManager и DataManager зависят друг от друга
   - Митигация: использовать `setUserProfileManager()` после инициализации (уже реализовано)
