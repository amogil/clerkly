# Документ Требований: Settings

## Введение

Данный документ описывает требования к странице настроек приложения Clerkly, включая настройки AI Agent (LLM провайдер и API ключ) и форматирование дат и времени из системных настроек.

## Глоссарий

- **AI Agent Settings** - Настройки AI агента (LLM провайдер и API ключ)
- **LLM Provider** - Провайдер языковой модели (OpenAI, Anthropic, Google)
- **API Key** - Ключ доступа к API провайдера LLM
- **System Locale** - Системная локаль операционной системы, определяющая формат дат и времени
- **Debounce** - Задержка выполнения операции до окончания серии быстрых изменений
- **safeStorage** - API Electron для безопасного хранения чувствительных данных
- **Encryption** - Шифрование данных перед сохранением
- **Toggle Visibility** - Переключение видимости API ключа (показать/скрыть)
- **DateTimeFormatter** - Утилита для форматирования дат и времени

## Архитектурный Принцип

Приложение следует архитектурному принципу **Единого Источника Истины (Single Source of Truth)**, описанному в спецификации `clerkly` (см. `.kiro/specs/clerkly/requirements.md`).

**Применение к Settings:**
- Настройки AI Agent и другие настройки сохраняются в базе данных
- UI отображает настройки из базы данных
- Изменения настроек автоматически сохраняются в базу с debounce (где применимо)

## Требования

### 1. Настройки AI Agent

**ID:** settings.1

**User Story:** Как пользователь, я хочу настроить AI агента для работы с моими задачами, указав провайдера LLM и API ключ, чтобы агент мог выполнять интеллектуальные операции.

**Зависимости:** user-data-isolation.1 (изоляция данных пользователей)

#### Критерии Приемки

1.1. Страница Settings ДОЛЖНА содержать секцию "AI Agent Settings" с следующими полями:
   - LLM Provider (выпадающий список): OpenAI (GPT), Anthropic (Claude), Google (Gemini)
   - API Key (текстовое поле с возможностью скрыть/показать)

1.2. КОГДА пользователь вводит API ключ, ТО поле ДОЛЖНО отображать символы как пароль (скрыто по умолчанию)

1.3. Поле API Key ДОЛЖНО содержать кнопку показать/скрыть (toggle visibility button) справа внутри поля

1.4. Кнопка показать/скрыть ДОЛЖНА отображать иконку:
   - Иконка "Eye" (открытый глаз) КОГДА API ключ скрыт (type="password")
   - Иконка "EyeOff" (перечеркнутый глаз) КОГДА API ключ виден (type="text")

1.5. КОГДА пользователь кликает на кнопку показать/скрыть, ТО:
   - ЕСЛИ API ключ скрыт: переключить поле в режим text (показать символы) И изменить иконку на "EyeOff"
   - ЕСЛИ API ключ виден: переключить поле в режим password (скрыть символы) И изменить иконку на "Eye"

1.6. Кнопка показать/скрыть ДОЛЖНА быть видна всегда (независимо от того, пустое поле или заполнено)

1.7. Кнопка показать/скрыть НЕ ДОЛЖНА триггерить сохранение данных (только переключает видимость)

1.8. Состояние видимости API ключа (показан/скрыт) НЕ ДОЛЖНО сохраняться между сессиями (всегда начинать со скрытого состояния)

1.9. КОГДА пользователь изменяет API Key, ТО изменения ДОЛЖНЫ автоматически сохраняться в базу данных с debounce 500ms после последнего изменения

1.10. КОГДА пользователь изменяет LLM Provider (выпадающий список), ТО:
   - Изменение провайдера ДОЛЖНО сохраняться немедленно без debounce
   - Поле API Key ДОЛЖНО автоматически загрузить ключ выбранного провайдера (если он был сохранен ранее)
   - ЕСЛИ ключ для выбранного провайдера не найден: поле API Key ДОЛЖНО быть пустым с placeholder "Enter your API key"

1.11. КОГДА пользователь очищает поле API Key (пустая строка), ТО запись для текущего провайдера ДОЛЖНА быть удалена из базы данных

1.12. Система ДОЛЖНА НЕ показывать визуальный индикатор сохранения (сохранение происходит молча в фоне)

1.13. КОГДА сохранение в базу данных не удается, ТО система ДОЛЖНА показать уведомление об ошибке через стандартный механизм обработки ошибок (см. error-notifications.1)

1.14. Система ДОЛЖНА пытаться зашифровать API ключ перед сохранением используя `safeStorage.encryptString()` из Electron

1.15. КОГДА шифрование недоступно (например, на некоторых Linux системах), ТО система ДОЛЖНА сохранить API ключ без шифрования

1.16. Каждый LLM провайдер ДОЛЖЕН иметь отдельное хранилище для своего API ключа:
   - OpenAI: ключи `ai_agent_api_key_openai` и `ai_agent_api_key_openai_encrypted`
   - Anthropic: ключи `ai_agent_api_key_anthropic` и `ai_agent_api_key_anthropic_encrypted`
   - Google: ключи `ai_agent_api_key_google` и `ai_agent_api_key_google_encrypted`

1.17. Система ДОЛЖНА сохранять метаданные о шифровании для каждого провайдера отдельно:
   - Ключ `ai_agent_api_key_{provider}_encrypted`: `true` если зашифрован, `false` если plain text
   - Ключ `ai_agent_api_key_{provider}`: зашифрованная строка или plain text

1.18. LLM Provider ДОЛЖЕН храниться в таблице `user_data` с ключом `ai_agent_llm_provider`

1.19. КОГДА пользователь переключается между провайдерами, ТО:
   - Ключ предыдущего провайдера ДОЛЖЕН сохраниться в базе данных (не удаляется)
   - Ключ нового провайдера ДОЛЖЕН загрузиться из базы данных (если существует)
   - Приложение ДОЛЖНО использовать активного провайдера и его ключ для всех операций

1.20. КОГДА приложение запускается, ТО настройки AI Agent ДОЛЖНЫ загружаться из базы данных текущего пользователя:
   - Загрузить активного провайдера из `ai_agent_llm_provider`
   - Загрузить API ключ активного провайдера из соответствующего ключа
   - Отобразить провайдера и его ключ в UI

1.21. КОГДА настройки не найдены в базе (первый запуск или после очистки), ТО значения по умолчанию ДОЛЖНЫ быть:
   - LLM Provider: `openai`
   - API Key: пустая строка с placeholder "Enter your API key"

1.22. КОГДА API ключ загружается из базы для конкретного провайдера, ТО система ДОЛЖНА:
   - Проверить флаг `ai_agent_api_key_{provider}_encrypted`
   - Если `true`: расшифровать используя `safeStorage.decryptString()`
   - Если `false`: использовать как plain text

1.23. API ключ ДОЛЖЕН иметь максимальную длину 1000 символов

1.24. Система НЕ ДОЛЖНА выполнять валидацию формата API ключа (валидация произойдет автоматически при первом запросе к провайдеру)

1.25. UI ДОЛЖЕН отображать текст: "Your API key is stored securely. It will only be used to communicate with your selected LLM provider."

1.25. UI ДОЛЖЕН отображать текст: "Your API key is stored securely. It will only be used to communicate with your selected LLM provider."

1.26. Кнопка "Test Connection" ДОЛЖНА присутствовать в UI, но НЕ ДОЛЖНА быть функциональной (placeholder для будущей функциональности)

1.27. Система ДОЛЖНА использовать существующие IPC каналы для работы с настройками:
   - `save-data` для сохранения LLM провайдера и API ключей
   - `load-data` для загрузки настроек
   - `delete-data` для удаления API ключей

**Примечание:** Изоляция данных AI Agent между пользователями (сохранение и восстановление настроек при смене пользователя) реализуется через user-data-isolation.1 (добавление колонки `user_email` в таблицу `user_data`). Отдельные требования для изоляции настроек AI Agent не нужны.

#### Функциональные Тесты

- `tests/functional/settings-ai-agent.spec.ts` - "should save LLM provider selection immediately"
- `tests/functional/settings-ai-agent.spec.ts` - "should save API key with debounce"
- `tests/functional/settings-ai-agent.spec.ts` - "should delete API key when field is cleared"
- `tests/functional/settings-ai-agent.spec.ts` - "should encrypt API key when safeStorage available"
- `tests/functional/settings-ai-agent.spec.ts` - "should save API key without encryption when safeStorage unavailable"
- `tests/functional/settings-ai-agent.spec.ts` - "should load and decrypt API key on app start"
- `tests/functional/settings-ai-agent.spec.ts` - "should toggle API key visibility"
- `tests/functional/settings-ai-agent.spec.ts` - "should show error notification on save failure"
- `tests/functional/settings-ai-agent.spec.ts` - "should persist settings after logout and restore on re-login"
- `tests/functional/settings-ai-agent.spec.ts` - "should preserve API keys when switching providers"
- `tests/functional/settings-ai-agent.spec.ts` - "should load correct API key when switching back to provider"

### 2. Форматирование Дат и Времени из Системных Настроек

**ID:** settings.2

**User Story:** Как пользователь, я хочу чтобы все даты и время в приложении отображались в формате моей операционной системы, чтобы не настраивать это вручную и видеть привычный формат.

**Зависимости:** Нет

#### Критерии Приемки

2.1. Приложение ДОЛЖНО использовать системные настройки локали для форматирования дат и времени (через `Intl.DateTimeFormat` с системной локалью)

2.2. Форматирование ДОЛЖНО применяться ко всем timestamp в следующих местах:
   - Задачи (Tasks)
   - Календарь (Calendar)
   - Контакты (Contacts)
   - История изменений

2.3. Форматирование НЕ ДОЛЖНО применяться к логам - логи ДОЛЖНЫ использовать централизованный "Logger" класс (см. clerkly.3)

2.4. Приложение НЕ ДОЛЖНО отображать относительные форматы времени (например, "2 hours ago", "yesterday")

2.5. Приложение ДОЛЖНО использовать существующие паттерны отображения дат (только дата vs дата+время) как уже реализовано в интерфейсе

2.6. КОГДА системные настройки локали изменяются, ТО приложение ДОЛЖНО автоматически применить новый формат при следующем запуске

2.7. Страница Settings НЕ ДОЛЖНА содержать секцию "Display Preferences" (секция должна быть полностью удалена из UI)

#### Функциональные Тесты

- `tests/functional/date-time-formatting.spec.ts` - "should format dates using system locale"
- `tests/functional/date-time-formatting.spec.ts` - "should format times using system locale"
- `tests/functional/date-time-formatting.spec.ts` - "should use fixed format for logs"
- `tests/functional/date-time-formatting.spec.ts` - "should not display relative time formats"

## Вне Области Применения

Следующие элементы явно исключены из данной спецификации:

- Функциональность кнопки "Test Connection" для AI Agent (placeholder для будущей реализации)
- Ручная настройка формата даты и времени (используются системные настройки)
- Валидация формата API ключей
- Множественные API ключи для одного провайдера
- Экспорт/импорт настроек
- Синхронизация настроек между устройствами
