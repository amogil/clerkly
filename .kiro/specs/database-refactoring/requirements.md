# Документ Требований: Рефакторинг Database Layer

## Введение

Данный документ описывает требования к рефакторингу слоя доступа к базе данных в приложении Clerkly. Основная цель - разделение ответственности между инициализацией БД и управлением пользовательскими настройками.

## Глоссарий

- **DatabaseManager** - Единая точка входа для доступа к базе данных, инициализации и получения текущего user_id
- **UserSettingsManager** - Класс для управления пользовательскими настройками (key-value в таблице user_data) с автоматической фильтрацией по user_id (ранее DataManager)
- **user_id** - Уникальный идентификатор пользователя для изоляции данных

## Связь с Другими Спецификациями

Данная спецификация является реализационной задачей для:
- `user-data-isolation` (требование 6) - DatabaseManager как единая точка доступа
- `clerkly` - базовая архитектура приложения
- `settings` - настройки AI Agent
- `google-oauth-auth` - хранение токенов
- `account-profile` - хранение профиля пользователя
- `window-management` - WindowStateManager как исключение

---

## Требования

### Требование 1: Создание DatabaseManager

**ID:** database-refactoring.1

**User Story:** Как разработчик, я хочу иметь единую точку входа для доступа к базе данных, чтобы упростить управление соединением и изоляцией данных.

**Зависимости:** user-data-isolation.6

#### Критерии Приемки

1.1. Система ДОЛЖНА иметь класс DatabaseManager с методами:
   - `initialize(storagePath: string): void` - инициализация БД и миграций
   - `setUserManager(userManager: UserManager): void` - установка UserManager
   - `getDatabase(): Database` - получение SQLite instance
   - `getCurrentUserId(): string` - получение текущего user_id
   - `close(): void` - закрытие соединения

1.2. Метод `getCurrentUserId()` ДОЛЖЕН выбрасывать ошибку "No user logged in" если пользователь не авторизован

1.3. DatabaseManager ДОЛЖЕН инициализироваться первым при старте приложения

**Тестируемость:** Да - через модульные тесты DatabaseManager

---

### Требование 2: Переименование DataManager в UserSettingsManager

**ID:** database-refactoring.2

**User Story:** Как разработчик, я хочу чтобы название класса точно отражало его назначение (управление пользовательскими настройками).

**Зависимости:** user-data-isolation.6.5

#### Критерии Приемки

2.1. Класс DataManager ДОЛЖЕН быть переименован в UserSettingsManager

2.2. Файл `src/main/DataManager.ts` ДОЛЖЕН быть переименован в `src/main/UserSettingsManager.ts`

2.3. Все импорты DataManager в проекте ДОЛЖНЫ быть обновлены на UserSettingsManager

2.4. UserSettingsManager ДОЛЖЕН принимать DatabaseManager в конструкторе

2.5. UserSettingsManager НЕ ДОЛЖЕН содержать логику инициализации БД (перенесена в DatabaseManager)

**Тестируемость:** Да - через модульные тесты и проверку компиляции

---

### Требование 3: Обновление Зависимых Компонентов

**ID:** database-refactoring.3

**User Story:** Как разработчик, я хочу чтобы все компоненты использовали новую архитектуру для консистентности.

**Зависимости:** database-refactoring.1, database-refactoring.2

#### Критерии Приемки

3.1. IPCHandlers ДОЛЖЕН использовать UserSettingsManager вместо DataManager

3.2. AIAgentSettingsManager ДОЛЖЕН использовать UserSettingsManager вместо DataManager

3.3. TokenStorageManager ДОЛЖЕН использовать UserSettingsManager вместо DataManager

3.4. UserProfileManager ДОЛЖЕН использовать UserSettingsManager вместо DataManager

3.5. LifecycleManager ДОЛЖЕН использовать DatabaseManager для инициализации

3.6. WindowStateManager ДОЛЖЕН использовать DatabaseManager.getDatabase() напрямую (без user_id фильтрации)

3.7. main/index.ts ДОЛЖЕН создавать компоненты в правильном порядке:
   - DatabaseManager → initialize() → UserSettingsManager → другие менеджеры → setUserManager()

**Тестируемость:** Да - через модульные и функциональные тесты

---

## Нефункциональные Требования

### Обратная Совместимость

- Все существующие данные ДОЛЖНЫ оставаться доступными после рефакторинга
- API методов saveData/loadData/deleteData НЕ ДОЛЖЕН измениться

### Производительность

- Рефакторинг НЕ ДОЛЖЕН негативно влиять на производительность операций с данными

---

## Вне Области Применения

- Изменение схемы базы данных
- Изменение логики изоляции данных по user_id
- Добавление новых таблиц или полей

