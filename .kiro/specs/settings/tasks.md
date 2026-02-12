# Список Задач: Настройки Приложения

## Обзор

Данный документ содержит список задач для реализации настроек приложения Clerkly, включая настройки LLM Provider (провайдер и API ключ с шифрованием) и форматирование даты/времени из системных настроек.

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

- [x] 3.1 Создать React компонент LLMProviderSettings
  - Создать файл `src/renderer/components/Settings.tsx`
  - Реализовать секцию LLM Provider
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
  - **Requirements:** settings.1.24, settings.1.25

- [x] 3.6 Удалить секцию Display Preferences
  - Полностью удалить секцию из UI (если существует)
  - **Requirements:** settings.2.7

### 4. Реализация Тестирования Подключения к LLM Provider

- [x] 4.1 Создать интерфейс ILLMProvider
  - Создать файл `src/main/llm/ILLMProvider.ts`
  - Определить интерфейс с методами `testConnection()` и `getProviderName()`
  - Определить интерфейс `TestConnectionResult`
  - **Requirements:** settings.3.5

- [x] 4.2 Реализовать OpenAIProvider
  - Создать файл `src/main/llm/OpenAIProvider.ts`
  - Реализовать метод `testConnection()` с минимальным запросом к OpenAI API
  - Использовать модель `gpt-4o-mini`, max_tokens: 5
  - Timeout 10 секунд
  - Обработка HTTP статусов (200, 401, 403, 429, 500/502/503)
  - Обработка сетевых ошибок и timeout
  - **Requirements:** settings.3.5, settings.3.6, settings.3.7, settings.3.8

- [x] 4.3 Реализовать AnthropicProvider
  - Создать файл `src/main/llm/AnthropicProvider.ts`
  - Реализовать метод `testConnection()` с минимальным запросом к Anthropic API
  - Использовать модель `claude-haiku-4-5`, max_tokens: 5
  - Timeout 10 секунд
  - Обработка HTTP статусов и ошибок
  - **Requirements:** settings.3.5, settings.3.6, settings.3.7, settings.3.8

- [x] 4.4 Реализовать GoogleProvider
  - Создать файл `src/main/llm/GoogleProvider.ts`
  - Реализовать метод `testConnection()` с минимальным запросом к Google API
  - Использовать модель `gemini-3-flash`
  - Timeout 10 секунд
  - Обработка HTTP статусов и ошибок
  - **Requirements:** settings.3.5, settings.3.6, settings.3.7, settings.3.8

- [x] 4.5 Создать LLMProviderFactory
  - Создать файл `src/main/llm/LLMProviderFactory.ts`
  - Реализовать метод `createProvider()` для создания экземпляров провайдеров
  - Обработка неизвестных провайдеров
  - **Requirements:** settings.3

- [x] 4.6 Создать IPC handlers для тестирования подключения
  - Создать файл `src/main/llm/LLMIPCHandlers.ts`
  - Реализовать handler `llm:test-connection`
  - Логирование попыток (только первые 4 символа ключа)
  - Логирование результатов (success/failure)
  - Обработка ошибок
  - Регистрация в `src/main/index.ts`
  - **Requirements:** settings.3.4, settings.3.9

- [ ] 4.7 Обновить preload API
  - Добавить `llm.testConnection()` в `src/preload/index.ts`
  - Обновить типы в `src/preload/window.d.ts` (если существует)
  - **Requirements:** settings.3

- [ ] 4.8 Обновить Settings Component
  - Добавить состояние `testingConnection`
  - Реализовать обработчик `handleTestConnection()`
  - Обновить кнопку "Test Connection" (убрать disabled, добавить onClick)
  - Показывать "Testing..." во время тестирования
  - Disabled кнопка когда API key пустой или тестирование выполняется
  - Показывать уведомление об успехе через `showSuccess()`
  - Показывать уведомление об ошибке через `showError()`
  - **Requirements:** settings.3.1, settings.3.2, settings.3.3, settings.3.4, settings.3.7, settings.3.8

### 5. Модульные Тесты

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

### 5. Модульные Тесты

- [x] 5.1 Тесты AIAgentSettingsManager
  - Тест: should save LLM provider immediately
  - Тест: should encrypt API key when encryption available
  - Тест: should save API key as plain text when encryption unavailable
  - Тест: should decrypt API key when loading
  - Тест: should handle decryption errors gracefully
  - Тест: should delete API key for specific provider only
  - Тест: should return default settings when none exist
  - **Requirements:** settings.1.9, settings.1.10, settings.1.11, settings.1.14, settings.1.15, settings.1.16, settings.1.21, settings.1.22

- [x] 5.2 Тесты DateTimeFormatter
  - Тест: should format date using system locale
  - Тест: should format log timestamp in fixed format
  - Тест: should handle formatting errors gracefully
  - **Requirements:** settings.2.1, settings.2.3

- [x] 5.3 Тесты Settings Component
  - Тест: should render AI Agent settings form
  - Тест: should toggle API key visibility
  - Тест: should save provider immediately on change
  - Тест: should save API key with debounce
  - **Requirements:** settings.1.1, settings.1.3, settings.1.9, settings.1.10

- [ ] 5.4 Тесты LLM Providers
  - Создать файл `tests/unit/llm/OpenAIProvider.test.ts`
  - Тест: should return success on valid API key (HTTP 200)
  - Тест: should return error on invalid API key (HTTP 401)
  - Тест: should return error on network timeout
  - Тест: should return error on server error (HTTP 500)
  - Тест: should handle rate limit error (HTTP 429)
  - Повторить для AnthropicProvider и GoogleProvider
  - **Requirements:** settings.3.5, settings.3.6, settings.3.7, settings.3.8

- [ ] 5.5 Тесты LLMProviderFactory
  - Создать файл `tests/unit/llm/LLMProviderFactory.test.ts`
  - Тест: should create OpenAI provider
  - Тест: should create Anthropic provider
  - Тест: should create Google provider
  - Тест: should throw error for unknown provider
  - **Requirements:** settings.3

- [ ] 5.6 Тесты LLM IPC Handlers
  - Создать файл `tests/unit/llm/LLMIPCHandlers.test.ts`
  - Тест: should handle successful test connection
  - Тест: should handle failed test connection
  - Тест: should log API key safely (only first 4 chars)
  - Тест: should log test results
  - **Requirements:** settings.3.4, settings.3.9

- [ ] 5.7 Тесты Settings Component (Test Connection)
  - Обновить файл `tests/unit/components/Settings.test.tsx`
  - Тест: should disable Test Connection button when API key is empty
  - Тест: should enable Test Connection button when API key is filled
  - Тест: should show "Testing..." during connection test
  - Тест: should call window.api.llm.testConnection with correct params
  - Тест: should show success notification on successful connection
  - Тест: should show error notification on failed connection
  - **Requirements:** settings.3.1, settings.3.2, settings.3.3, settings.3.4, settings.3.7, settings.3.8

### 6. Property-Based Тесты

- [x] 6.1 Property Test: Раздельное хранилище для провайдеров
  - Проверить изоляцию API ключей между провайдерами
  - Минимум 100 итераций
  - **Validates:** Property 6
  - **Requirements:** settings.1.16, settings.1.19

- [x] 6.2 Property Test: Round-trip шифрования/дешифрования
  - Проверить сохранение значения через цикл encrypt/decrypt
  - Минимум 100 итераций
  - **Validates:** Property 8
  - **Requirements:** settings.1.22

- [x] 6.3 Property Test: Форматирование дат по системной локали
  - Проверить корректность форматирования для различных timestamp
  - Минимум 100 итераций
  - **Validates:** Property 10
  - **Requirements:** settings.2.1

- [ ] 6.4 Property Test: Обработка различных ответов API
  - Создать файл `tests/property/llm/LLMProviderResponses.property.test.ts`
  - Проверить корректную обработку различных HTTP статусов
  - Проверить корректную обработку различных форматов ошибок
  - Минимум 100 итераций
  - **Requirements:** settings.3.8

### 7. Функциональные Тесты

- [x] 7.1 Функциональный тест: LLM Provider Settings
  - Тест: should save and persist LLM Provider settings
  - Тест: should toggle API key visibility
  - Тест: should load correct API key when switching providers
  - Тест: should encrypt API key when safeStorage available
  - Тест: should save API key without encryption when safeStorage unavailable
  - Тест: should delete API key when field is cleared
  - Тест: should show error notification on save failure
  - **Requirements:** settings.1.3, settings.1.4, settings.1.5, settings.1.9, settings.1.10, settings.1.11, settings.1.13, settings.1.14, settings.1.15, settings.1.19

- [x] 7.2 Функциональный тест: Date/Time Formatting
  - Тест: should format dates using system locale
  - Тест: should format times using system locale
  - Тест: should use fixed format for logs
  - Тест: should not display relative time formats
  - **Requirements:** settings.2.1, settings.2.2, settings.2.3, settings.2.4

- [ ] 7.3 Функциональный тест: LLM Connection Test
  - Создать файл `tests/functional/llm-connection-test.spec.ts`
  - Тест: should disable Test Connection button when API key is empty
  - Тест: should enable Test Connection button when API key is filled
  - Тест: should show "Testing..." during connection test
  - Тест: should show success notification on valid API key
  - Тест: should show error notification on invalid API key
  - Тест: should test connection for each provider (OpenAI, Anthropic, Google)
  - Тест: should disable button and show "Testing..." during test
  - **Requirements:** settings.3.1, settings.3.2, settings.3.3, settings.3.4, settings.3.7, settings.3.8

### 8. Валидация и Финализация

- [ ] 8.1 Запустить автоматическую валидацию
  - TypeScript компиляция
  - ESLint проверка
  - Prettier форматирование
  - Модульные тесты
  - Property-based тесты

- [ ] 8.2 Проверить покрытие тестами
  - Минимум 85% покрытие строк кода
  - Все требования покрыты тестами
  - Таблица покрытия требований актуальна

- [ ] 8.3 Проверить комментарии с требованиями
  - Все функции имеют комментарии Requirements
  - Все тесты имеют структуру Preconditions/Action/Assertions/Requirements

- [ ] 8.4 Запустить функциональные тесты (при явной просьбе пользователя)
  - Запустить `npm run test:functional`
  - Проверить все функциональные тесты проходят
  - Проверить тесты тестирования подключения работают корректно

## Статус

🔄 В процессе выполнения

Выполнено: Задачи 1-3, 5.1-5.3, 6.1-6.3, 7.1-7.2
Осталось: Задачи 4 (Тестирование подключения), 5.4-5.7, 6.4, 7.3, 8

## Примечания

- Все задачи выполнены последовательно в указанном порядке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде на английском языке
- Спецификации (requirements.md, design.md, tasks.md) на русском языке
- Использованы существующие IPC каналы (save-data, load-data, delete-data)
- Изоляция данных по пользователям реализована через user-data-isolation.1
