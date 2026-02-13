# Список Задач: User Data Isolation

## Обзор

Данный документ содержит список задач для обновления системы изоляции данных пользователей. Основное изменение: переход с `user_email` на `user_id` (10-символьная случайная строка) с введением таблицы `users` и класса `UserManager`.

**Статус:** Требуется обновление существующей реализации

**Оценка времени:** 8-10 дней

---

## Фаза 1: Создание Таблицы Users и UserManager (2-3 дня)

### 1.1. Создать миграцию для таблицы users
- [ ] Создать файл миграции `XXX_create_users_table.sql` в `migrations/`
- [ ] Добавить UP секцию:
  ```sql
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  ```
- [ ] Добавить DOWN секцию для отката
- [ ] Запустить миграцию и проверить создание таблицы
- _Requirements: user-data-isolation.0.1, user-data-isolation.0.6_

### 1.2. Создать интерфейс User
- [ ] Добавить интерфейс `User` в `src/main/auth/UserManager.ts`:
  ```typescript
  interface User {
    user_id: string;
    name: string | null;
    email: string;
  }
  ```
- [ ] Экспортировать интерфейс для использования в других модулях
- _Requirements: user-data-isolation.1.4_

### 1.3. Создать класс UserManager
- [ ] Создать файл `src/main/auth/UserManager.ts`
- [ ] Реализовать конструктор с зависимостями (db: Database, logger: Logger)
- [ ] Реализовать приватный метод `generateUserId(): string`:
  - Генерировать 10-символьную alphanumeric строку (A-Z, a-z, 0-9)
  - Использовать `Math.random()` для генерации
- [ ] Реализовать публичный метод `findOrCreateUser(email: string, name: string | null): User`:
  - Искать пользователя по email в таблице `users`
  - Если найден - вернуть (обновив name при необходимости)
  - Если не найден - создать с новым user_id
- [ ] Добавить комментарии с Requirements к каждому методу
- _Requirements: user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.5_

### 1.4. Написать модульные тесты для UserManager
- [ ] Создать файл `tests/unit/auth/UserManager.test.ts`
- [ ] Тест: `should generate valid 10-character alphanumeric user_id`
  - Preconditions: нет
  - Action: вызвать generateUserId() 100 раз
  - Assertions: все ID имеют длину 10, содержат только alphanumeric
  - _Requirements: user-data-isolation.0.2, user-data-isolation.1.2_
- [ ] Тест: `should create new user on first login`
  - Preconditions: пустая таблица users
  - Action: вызвать findOrCreateUser('test@example.com', 'Test User')
  - Assertions: создан пользователь с 10-символьным user_id
  - _Requirements: user-data-isolation.0.3, user-data-isolation.1.3_
- [ ] Тест: `should find existing user on re-login`
  - Preconditions: пользователь существует в таблице users
  - Action: вызвать findOrCreateUser с тем же email
  - Assertions: возвращается существующий user_id
  - _Requirements: user-data-isolation.0.4, user-data-isolation.1.3_
- [ ] Тест: `should update user name if changed`
  - Preconditions: пользователь существует с именем 'Old Name'
  - Action: вызвать findOrCreateUser с тем же email, но именем 'New Name'
  - Assertions: имя обновлено в базе данных
  - _Requirements: user-data-isolation.0.5, user-data-isolation.1.3_
- [ ] Тест: `should not update name if null passed`
  - Preconditions: пользователь существует с именем 'Test'
  - Action: вызвать findOrCreateUser с тем же email, но name = null
  - Assertions: имя не изменилось
  - _Requirements: user-data-isolation.1.3_

### 1.5. Запустить валидацию Фазы 1
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все тесты проходят
- [ ] Проверить покрытие кода UserManager (минимум 85%)

---

## Фаза 2: Миграция user_data (2-3 дня)

### 2.1. Создать миграцию для изменения user_data
- [ ] Создать файл миграции `XXX_migrate_user_data_to_user_id.sql`
- [ ] Добавить UP секцию:
  - Создать записи в `users` для всех уникальных email из `user_data`
  - Создать новую таблицу `user_data_new` с `user_id` вместо `user_email`
  - Скопировать данные с преобразованием email → user_id
  - Удалить старую таблицу, переименовать новую
  - Создать индекс `idx_user_id`
- [ ] Добавить DOWN секцию для отката
- [ ] Протестировать миграцию на тестовой базе
- _Requirements: user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4, user-data-isolation.6.5_

### 2.2. Написать тесты для миграции
- [ ] Тест: миграция создает записи в users для всех email
- [ ] Тест: миграция корректно связывает данные с user_id
- [ ] Тест: миграция идемпотентна (повторный запуск безопасен)
- [ ] Тест: DOWN миграция откатывает изменения
- _Requirements: user-data-isolation.6.4, user-data-isolation.6.5_

### 2.3. Обновить DataManager для использования user_id
- [ ] Изменить метод `saveData`:
  - Заменить `user_email` на `user_id` в SQL запросе
  - Обновить логирование
- [ ] Изменить метод `loadData`:
  - Заменить `user_email` на `user_id` в SQL запросе
  - Обновить логирование
- [ ] Изменить метод `deleteData`:
  - Заменить `user_email` на `user_id` в SQL запросе
  - Обновить логирование
- [ ] Обновить комментарии с Requirements
- _Requirements: user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.2.7_

### 2.4. Обновить модульные тесты DataManager
- [ ] Обновить тест: `should automatically add user_id when saving`
- [ ] Обновить тест: `should automatically filter by user_id when loading`
- [ ] Обновить тест: `should automatically filter by user_id when deleting`
- [ ] Обновить тест: `should throw error when no user logged in`
- [ ] Обновить все моки для использования user_id вместо email
- _Requirements: user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.2.7, user-data-isolation.4.3_

### 2.5. Запустить валидацию Фазы 2
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все тесты проходят
- [ ] Проверить покрытие кода DataManager

---

## Фаза 3: Интеграция UserProfileManager (1-2 дня)

### 3.1. Добавить зависимость на UserManager
- [ ] Добавить `userManager: UserManager` в конструктор UserProfileManager
- [ ] Обновить инициализацию в main process
- _Requirements: user-data-isolation.3.1_

### 3.2. Заменить currentUserEmail на currentUserId
- [ ] Заменить `private currentUserEmail: string | null` на `private currentUserId: string | null`
- [ ] Заменить метод `getCurrentEmail()` на `getCurrentUserId()`
- [ ] Обновить все внутренние ссылки
- _Requirements: user-data-isolation.3.2, user-data-isolation.3.3_

### 3.3. Обновить метод fetchProfile
- [ ] После получения профиля вызвать `userManager.findOrCreateUser(profile.email, profile.name)`
- [ ] Установить `this.currentUserId = user.user_id`
- [ ] Обновить логирование
- _Requirements: user-data-isolation.3.4_

### 3.4. Обновить метод initialize
- [ ] Загрузить профиль из базы данных
- [ ] Вызвать `userManager.findOrCreateUser(profile.email, profile.name)`
- [ ] Установить `this.currentUserId = user.user_id`
- [ ] Обновить логирование
- _Requirements: user-data-isolation.3.5_

### 3.5. Обновить метод clearSession
- [ ] Установить `this.currentUserId = null`
- [ ] Обновить логирование
- _Requirements: user-data-isolation.3.6_

### 3.6. Обновить модульные тесты UserProfileManager
- [ ] Обновить тест: `should cache user_id after successful login`
- [ ] Обновить тест: `should restore user_id from database on startup`
- [ ] Обновить тест: `should clear user_id on logout`
- [ ] Обновить тест: `getCurrentUserId returns correct user_id`
- [ ] Обновить все моки для использования user_id
- _Requirements: user-data-isolation.3.2, user-data-isolation.3.3, user-data-isolation.3.4, user-data-isolation.3.5, user-data-isolation.3.6_

### 3.7. Запустить валидацию Фазы 3
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все тесты проходят

---

## Фаза 4: Property-Based Тесты (1 день)

### 4.1. Создать property тесты для UserManager
- [ ] Создать файл `tests/property/auth/UserManager.property.test.ts`
- [ ] Property: `generateUserId always produces 10-char alphanumeric string`
- [ ] Property: `findOrCreateUser is idempotent for same email`
- [ ] Property: `different emails always get different user_ids`
- _Requirements: user-data-isolation.0.2, user-data-isolation.0.4, user-data-isolation.1.2_

### 4.2. Обновить property тесты DataManager
- [ ] Обновить файл `tests/property/DataManagerUserIsolation.property.test.ts`
- [ ] Заменить email на user_id во всех тестах
- [ ] Property: `should always add user_id when saving data`
- [ ] Property: `should always filter by user_id when loading data`
- [ ] Property: `should isolate data between different users`
- [ ] Property: `should restore data after logout and re-login`
- _Requirements: user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.5.4_

### 4.3. Запустить валидацию Фазы 4
- [ ] Выполнить `npm run test:property`
- [ ] Убедиться, что все property тесты проходят

---

## Фаза 5: Функциональные Тесты (1-2 дня)

### 5.1. Обновить существующие функциональные тесты
- [ ] Обновить `tests/functional/user-data-isolation.spec.ts`
- [ ] Тест: `should create user record on first login`
- [ ] Тест: `should find existing user on re-login`
- [ ] Тест: `should update user name if changed`
- [ ] Тест: `should isolate data between different users`
- [ ] Тест: `should persist data after logout`
- [ ] Тест: `should restore user data after re-login`
- [ ] Тест: `should filter data by user_id`
- _Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.0.5, user-data-isolation.2.5, user-data-isolation.2.6_

### 5.2. Добавить тесты обработки ошибок
- [ ] Тест: `should handle No user logged in error`
- [ ] Тест: `should retry operation after token refresh`
- _Requirements: user-data-isolation.5.1, user-data-isolation.5.2_

---

## Фаза 6: Интеграция и Финализация (1 день)

### 6.1. Обновить инициализацию в main process
- [ ] Создать экземпляр UserManager
- [ ] Передать UserManager в UserProfileManager
- [ ] Обновить порядок инициализации:
  1. Database
  2. MigrationRunner (запуск миграций)
  3. UserManager
  4. UserProfileManager
  5. DataManager
- _Requirements: user-data-isolation.3.1, user-data-isolation.4.1_

### 6.2. Обновить процедуру logout
- [ ] Убедиться, что clearSession очищает currentUserId
- [ ] Обработать race conditions (логировать, не выбрасывать ошибку)
- _Requirements: user-data-isolation.3.6, user-data-isolation.5.3_

### 6.3. Запустить полную валидацию
- [ ] Выполнить `npm run validate`
- [ ] Убедиться, что все проверки проходят:
  - ✅ TypeScript компиляция
  - ✅ ESLint
  - ✅ Prettier
  - ✅ Модульные тесты
  - ✅ Property-based тесты
  - ✅ Покрытие кода (минимум 85%)

### 6.4. Обновить документацию
- [ ] Проверить комментарии с Requirements в коде
- [ ] Обновить таблицу покрытия требований в design.md
- [ ] Убедиться, что все тесты имеют структуру (Preconditions, Action, Assertions, Requirements)

---

## Примечания

- Миграция данных должна быть обратно совместимой
- При миграции существующие данные привязываются к user_id через email
- Все комментарии в коде на английском языке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Каждая фаза должна быть провалидирована перед переходом к следующей

## Риски

1. **Миграция данных** - существующие данные могут быть потеряны при некорректной миграции
   - Митигация: тестирование миграции на копии базы, DOWN миграция для отката

2. **Совместимость** - другие модули могут использовать getCurrentEmail()
   - Митигация: поиск всех использований, обновление вызовов

3. **Производительность** - дополнительный JOIN при миграции
   - Митигация: индексы на email и user_id
