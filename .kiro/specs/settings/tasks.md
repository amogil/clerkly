# Список Задач: Настройки Приложения

## Обзор

Данный документ содержит список задач для реализации настроек приложения Clerkly, включая настройки AI Agent (LLM провайдер и API ключ с шифрованием) и форматирование даты/времени из системных настроек.

## Задачи

### 1. Создание AIAgentSettingsManager

- [x] 1.1 Создать интерфейс AIAgentSettings
  - Определить структуру данных (llmProvider, apiKeys для каждого провайдера, encryptionStatus)
  - **Requirements:** settings.1.1, settings.1.16

- [x] 1.2 Создать класс AIAgentSettingsManager
  - Реализовать метод `saveLLMProvider()` для немедленного сохранения провайдера
  - Реализовать метод `saveAPIKey()` для сохранения с шифрованием (когда доступно)
  - Реализовать метод `loadAPIKey()` для загрузки с дешифрованием
  - Реализовать метод `deleteAPIKey()` для удаления ключа провайдера
  - Реализовать метод `loadSettings()` для загрузки всех настроек
  - **Requirements:** settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.20, settings.1.22

- [x] 1.3 Реализовать шифрование API ключей
  - Использовать Electron safeStorage API для шифрования
  - Graceful degradation к plain text когда шифрование недоступно
  - Сохранять флаг encrypted для каждого провайдера
  - **Requirements:** settings.1.14, settings.1.15, settings.1.17

- [x] 1.4 Реализовать раздельное хранилище для провайдеров
  - Отдельные ключи для OpenAI, Anthropic, Google
  - Сохранение ключей всех провайдеров независимо
  - **Requirements:** settings.1.16, settings.1.19

### 2. Создание DateTimeFormatter

- [x] 2.1 Создать класс DateTimeFormatter
  - Реализовать метод `formatDate()` для форматирования даты по системной локали
  - Реализовать метод `formatDateTime()` для форматирования даты и времени
  - Реализовать метод `formatLogTimestamp()` для фиксированного формата логов
  - Использовать Intl.DateTimeFormat API с системной локалью (undefined)
  - **Requirements:** settings.2.1, settings.2.3

- [x] 2.2 Добавить обработку ошибок форматирования
  - Graceful fallback к toLocaleDateString() при ошибках
  - Логирование ошибок форматирования
  - **Requirements:** settings.2.1

### 3. Создание Settings Component

- [x] 3.1 Создать React компонент AIAgentSettings
  - Создать файл `src/renderer/components/Settings.tsx`
  - Реализовать секцию AI Agent Settings
  - Dropdown для выбора LLM провайдера (OpenAI, Anthropic, Google)
  - **Requirements:** settings.1.1

- [x] 3.2 Добавить поле API Key с toggle visibility
  - Поле type="password" по умолчанию (скрыто)
  - Кнопка показать/скрыть с иконками Eye/EyeOff
  - Toggle не триггерит сохранение
  - Состояние видимости не сохраняется между сессиями
  - **Requirements:** settings.1.2, settings.1.3, settings.1.4, settings.1.5, settings.1.6, settings.1.7, settings.1.8

- [x] 3.3 Реализовать автоматическое сохранение
  - Немедленное сохранение провайдера при изменении
  - Debounce 500ms для сохранения API ключа
  - Удаление ключа при очистке поля
  - Автоматическая загрузка ключа при переключении провайдера
  - **Requirements:** settings.1.9, settings.1.10, settings.1.11

- [x] 3.4 Добавить обработку ошибок
  - Показывать уведомления об ошибках через error-notifications
  - Молчаливое сохранение без визуальных индикаторов
  - **Requirements:** settings.1.12, settings.1.13

- [x] 3.5 Добавить UI элементы
  - Сообщение о безопасности хранения ключа
  - Placeholder кнопка "Test Connection" (не функциональна)
  - **Requirements:** settings.1.25, settings.1.26

- [x] 3.6 Удалить секцию Display Preferences
  - Полностью удалить секцию из UI (если существует)
  - **Requirements:** settings.2.7

### 4. Модульные Тесты

- [x] 4.1 Тесты AIAgentSettingsManager
  - Тест: should save LLM provider immediately
  - Тест: should encrypt API key when encryption available
  - Тест: should save API key as plain text when encryption unavailable
  - Тест: should decrypt API key when loading
  - Тест: should handle decryption errors gracefully
  - Тест: should delete API key for specific provider only
  - Тест: should return default settings when none exist
  - **Requirements:** settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.16, settings.1.21, settings.1.22

- [x] 4.2 Тесты DateTimeFormatter
  - Тест: should format date using system locale
  - Тест: should format log timestamp in fixed format
  - Тест: should handle formatting errors gracefully
  - **Requirements:** settings.2.1, settings.2.3

- [x] 4.3 Тесты Settings Component
  - Тест: should render AI Agent settings form
  - Тест: should toggle API key visibility
  - Тест: should save provider immediately on change
  - Тест: should save API key with debounce
  - **Requirements:** settings.1.1, settings.1.3, settings.1.9, settings.1.10

### 5. Property-Based Тесты

- [x] 5.1 Property Test: Раздельное хранилище для провайдеров
  - Проверить изоляцию API ключей между провайдерами
  - Минимум 100 итераций
  - **Validates:** Property 6
  - **Requirements:** settings.1.16, settings.1.19

- [x] 5.2 Property Test: Round-trip шифрования/дешифрования
  - Проверить сохранение значения через цикл encrypt/decrypt
  - Минимум 100 итераций
  - **Validates:** Property 8
  - **Requirements:** settings.1.22

- [x] 5.3 Property Test: Форматирование дат по системной локали
  - Проверить корректность форматирования для различных timestamp
  - Минимум 100 итераций
  - **Validates:** Property 10
  - **Requirements:** settings.2.1

### 6. Функциональные Тесты

- [x] 6.1 Функциональный тест: AI Agent Settings
  - Тест: should save and persist AI Agent settings
  - Тест: should toggle API key visibility
  - Тест: should load correct API key when switching providers
  - Тест: should encrypt API key when safeStorage available
  - Тест: should save API key without encryption when safeStorage unavailable
  - Тест: should delete API key when field is cleared
  - Тест: should show error notification on save failure
  - **Requirements:** settings.1.3, settings.1.4, settings.1.5, settings.1.9, settings.1.10, settings.1.11, settings.1.13, settings.1.14, settings.1.15, settings.1.19

- [x] 6.2 Функциональный тест: Date/Time Formatting
  - Тест: should format dates using system locale
  - Тест: should format times using system locale
  - Тест: should use fixed format for logs
  - Тест: should not display relative time formats
  - **Requirements:** settings.2.1, settings.2.2, settings.2.3, settings.2.4

### 7. Валидация и Финализация

- [x] 7.1 Запустить автоматическую валидацию
  - TypeScript компиляция
  - ESLint проверка
  - Prettier форматирование
  - Модульные тесты
  - Property-based тесты

- [x] 7.2 Проверить покрытие тестами
  - Минимум 85% покрытие строк кода
  - Все требования покрыты тестами
  - Таблица покрытия требований актуальна

- [x] 7.3 Проверить комментарии с требованиями
  - Все функции имеют комментарии Requirements
  - Все тесты имеют структуру Preconditions/Action/Assertions/Requirements

## Статус

✅ Все задачи выполнены

## Примечания

- Все задачи выполнены последовательно в указанном порядке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде на английском языке
- Спецификации (requirements.md, design.md, tasks.md) на русском языке
- Использованы существующие IPC каналы (save-data, load-data, delete-data)
- Изоляция данных по пользователям реализована через user-data-isolation.1
