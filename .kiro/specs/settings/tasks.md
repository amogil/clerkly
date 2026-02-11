# Список Задач: Настройки Приложения

## Обзор

Данный документ содержит список задач для реализации настроек приложения Clerkly, включая настройки AI Agent и форматирование даты/времени.

## Задачи

### 1. Создание AIAgentSettingsManager

- [x] 1.1 Создать интерфейс AIAgentSettings
  - Определить структуру данных (provider, apiKey, model, etc.)
  - **Requirements:** settings.1.1

- [x] 1.2 Создать класс AIAgentSettingsManager
  - Реализовать метод `loadSettings()` для загрузки из DataManager
  - Реализовать метод `saveSettings()` для сохранения в DataManager
  - Реализовать метод `validateSettings()` для валидации настроек
  - **Requirements:** settings.1.2, settings.1.3

- [x] 1.3 Добавить IPC handlers для настроек AI Agent
  - Реализовать `settings:get-ai-agent` handler
  - Реализовать `settings:save-ai-agent` handler
  - **Requirements:** settings.1.2, settings.1.3

### 2. Создание DateTimeFormatter

- [x] 2.1 Создать класс DateTimeFormatter
  - Реализовать метод `format()` для форматирования даты/времени
  - Поддержать различные локали (en-US, ru-RU, etc.)
  - Использовать Intl.DateTimeFormat API
  - **Requirements:** settings.2.1, settings.2.2

- [x] 2.2 Интегрировать DateTimeFormatter с UserProfileManager
  - Использовать locale из профиля пользователя
  - Обновлять форматирование при изменении locale
  - **Requirements:** settings.2.2

### 3. Создание Settings Component

- [x] 3.1 Создать React компонент Settings
  - Создать файл `src/renderer/components/Settings.tsx`
  - Реализовать секцию AI Agent Settings
  - Реализовать секцию Date/Time Formatting
  - **Requirements:** settings.1.1, settings.2.1

- [x] 3.2 Добавить форму для AI Agent Settings
  - Поля для provider, apiKey, model
  - Кнопка сохранения
  - Валидация полей
  - **Requirements:** settings.1.2, settings.1.3

- [x] 3.3 Добавить превью форматирования даты/времени
  - Показывать примеры форматирования для текущей локали
  - Обновлять при изменении locale
  - **Requirements:** settings.2.1, settings.2.2

### 4. Модульные Тесты

- [x] 4.1 Тест: AIAgentSettingsManager загружает настройки
- [x] 4.2 Тест: AIAgentSettingsManager сохраняет настройки
- [x] 4.3 Тест: AIAgentSettingsManager валидирует настройки
- [x] 4.4 Тест: DateTimeFormatter форматирует дату для разных локалей
- [x] 4.5 Тест: Settings компонент отображает форму AI Agent
- [x] 4.6 Тест: Settings компонент отображает превью даты/времени

### 5. Функциональные Тесты

- [x] 5.1 Тест: should save and load AI Agent settings
- [x] 5.2 Тест: should validate AI Agent settings
- [x] 5.3 Тест: should format date/time according to user locale
- [x] 5.4 Тест: should update date/time formatting when locale changes

### 6. Валидация и Финализация

- [x] 6.1 Запустить автоматическую валидацию
- [x] 6.2 Проверить покрытие тестами
- [x] 6.3 Проверить комментарии с требованиями

## Примечания

- Все задачи должны выполняться последовательно в указанном порядке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде должны быть на английском языке
