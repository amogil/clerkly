# Список Задач: Agents

## Обзор

Этот документ содержит список задач для реализации компонента Agents — основного интерфейса для взаимодействия с AI-агентами (чат).

**Общая оценка:** 12-15 дней

## Текущее Состояние

- ✅ Типы событий определены (`AgentCreatedEvent`, `AgentUpdatedEvent`, `AgentArchivedEvent`, `MessageCreatedEvent`, `MessageUpdatedEvent`)
- ✅ Тип `Message` обновлён согласно спеке (с `payload_json`)
- ❌ Таблицы `agents` и `messages` не созданы в БД
- ❌ `AgentManager` и `MessageManager` не реализованы
- ❌ IPC handlers для agents/messages не реализованы
- ❌ Preload API для agents/messages не реализован
- ❌ UI компонент использует моковые данные и старую модель (`AgentTask`)

## Фазы Реализации

### Фаза 1: База Данных (1 день)

#### Задача 1.1: Создать миграцию для таблиц agents и messages
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.7.1, agents.10.1
- **Файл:** `migrations/005_create_agents_tables.sql`
- **Описание:**
  - Создать таблицу `agents` с полями: `agent_id`, `user_id`, `name`, `created_at`, `updated_at`, `archived_at`
  - Создать таблицу `messages` с полями: `id`, `agent_id`, `timestamp`, `payload_json`
  - Создать индексы:
    - `idx_agents_user_archived` на `(user_id, archived_at)` — для фильтрации
    - `idx_agents_user_archived_updated` на `(user_id, archived_at, updated_at DESC)` — для сортировки
    - `idx_messages_agent_id` на `(agent_id)`
    - `idx_messages_agent_timestamp` на `(agent_id, timestamp)`
  - Добавить DOWN секцию для отката

#### Задача 1.2: Написать тесты для миграции
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.7.1
- **Описание:**
  - Тест создания таблиц
  - Тест индексов
  - Тест отката миграции

---

### Фаза 2: Main Process — Бизнес-логика (2-3 дня)

#### Задача 2.1: Создать AgentManager
- **Статус:** ❌ Не начата
- **Оценка:** 1 день
- **Требования:** agents.2, agents.10, user-data-isolation.6.5, user-data-isolation.6.3
- **Файл:** `src/main/agents/AgentManager.ts`
- **Зависимость:** Drizzle ORM репозитории (`.kiro/specs/user-data-isolation/requirements.md`)
- **Описание:**
  - Реализовать методы: `create()`, `list()`, `get()`, `update()`, `archive()`, `touch()`
  - Использовать репозитории `DatabaseManager` (`dbManager.agents`)
  - Автоматическая изоляция по `userId` через репозитории
  - Генерация событий через `MainEventBus`
  - Генерация 10-символьного alphanumeric `agentId` выполняется репозиторием

#### Задача 2.2: Создать MessageManager
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.4, agents.7, user-data-isolation.6.5, user-data-isolation.7.6
- **Файл:** `src/main/agents/MessageManager.ts`
- **Зависимость:** Drizzle ORM репозитории (`.kiro/specs/user-data-isolation/requirements.md`)
- **Описание:**
  - Реализовать методы: `list()`, `create()`, `update()`
  - Использовать репозитории `DatabaseManager` (`dbManager.messages`)
  - Проверка доступа к агенту выполняется репозиторием автоматически
  - Обновление `updated_at` агента при создании сообщения
  - Генерация событий через `MainEventBus`

#### Задача 2.3: Написать модульные тесты для AgentManager
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.2, agents.10
- **Файл:** `tests/unit/agents/AgentManager.test.ts`
- **Описание:**
  - Тесты CRUD операций
  - Тесты изоляции по userId
  - Тесты генерации событий
  - Тесты генерации agentId

#### Задача 2.4: Написать модульные тесты для MessageManager
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.4, agents.7
- **Файл:** `tests/unit/agents/MessageManager.test.ts`
- **Описание:**
  - Тесты CRUD операций
  - Тесты проверки доступа
  - Тесты обновления updated_at агента
  - Тесты генерации событий

---

### Фаза 3: IPC и Preload API (1 день)

#### Задача 3.1: Создать AgentIPCHandlers
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.2, agents.4, agents.10, user-data-isolation.6.6
- **Файл:** `src/main/agents/AgentIPCHandlers.ts`
- **Описание:**
  - Зарегистрировать IPC handlers: `agents:create`, `agents:list`, `agents:get`, `agents:update`, `agents:archive`
  - Зарегистрировать IPC handlers: `messages:list`, `messages:create`, `messages:update`
  - userId НЕ передаётся через IPC — получается автоматически

#### Задача 3.2: Обновить Preload API
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.2, agents.4, user-data-isolation.6.6
- **Файл:** `src/preload/index.ts`
- **Описание:**
  - Добавить `window.api.agents` с методами: `create`, `list`, `get`, `update`, `archive`
  - Добавить `window.api.messages` с методами: `list`, `create`, `update`
  - Обновить типы в `src/preload/types.ts`

#### Задача 3.3: Написать тесты для IPC handlers
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.2, agents.4
- **Файл:** `tests/unit/agents/AgentIPCHandlers.test.ts`
- **Описание:**
  - Тесты регистрации handlers
  - Тесты вызова методов managers

---

### Фаза 4: Утилиты и Вычисление Статуса (0.5 дня)

#### Задача 4.1: Создать функцию computeAgentStatus
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.9
- **Файл:** `src/shared/utils/computeAgentStatus.ts`
- **Описание:**
  - Реализовать алгоритм определения статуса из сообщений
  - Чистая функция (pure function)
  - Экспортировать для использования в renderer

#### Задача 4.2: Написать тесты для computeAgentStatus
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.9
- **Файл:** `tests/unit/utils/computeAgentStatus.test.ts`
- **Описание:**
  - Тесты всех статусов: new, in-progress, awaiting-user, error, completed
  - Property-based тесты для детерминированности

---

### Фаза 5: UI Компоненты — Базовые (2-3 дня)

#### Задача 5.1: Обновить типы Agent и Message в renderer
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.1, agents.7
- **Файл:** `src/renderer/types/agent.ts`
- **Описание:**
  - Заменить `AgentTask` на `Agent` согласно спеке
  - Добавить тип `Message` с `payloadJson`
  - Добавить тип `MessagePayload` с `kind` и `data`
  - Удалить устаревший `agent-task.ts`

#### Задача 5.2: Создать компонент AgentIcon
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.1.2, agents.1.5, agents.1.6, agents.6
- **Файл:** `src/renderer/components/agents/AgentIcon.tsx`
- **Описание:**
  - Круглая иконка 32px с первой буквой названия
  - Цвета и анимации по статусу
  - Кольцо выделения для активного агента
  - Тултип с названием и статусом

#### Задача 5.3: Создать компонент AgentsList
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.1.1, agents.1.5-1.9, agents.2.1-2.2
- **Файл:** `src/renderer/components/agents/AgentsList.tsx`
- **Описание:**
  - Горизонтальный список иконок агентов
  - Кнопка "New chat" (bg-sky-400)
  - Адаптивный расчёт видимых агентов
  - Кнопка "+N" для скрытых агентов

#### Задача 5.4: Создать компонент ActiveAgentInfo
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.8.1, agents.8.3
- **Файл:** `src/renderer/components/agents/ActiveAgentInfo.tsx`
- **Описание:**
  - Иконка статуса, название, статус, время создания
  - Truncate для длинных названий

#### Задача 5.5: Создать компонент MessageList
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.4.8-4.13, agents.7.3-7.4
- **Файл:** `src/renderer/components/agents/MessageList.tsx`
- **Описание:**
  - Отображение сообщений в хронологическом порядке
  - Фильтрация по kind (user, llm, final_answer)
  - Аватар агента перед первым сообщением в последовательности
  - Автоскролл к последнему сообщению

#### Задача 5.6: Создать компонент MessageContent
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.7.7
- **Файл:** `src/renderer/components/agents/MessageContent.tsx`
- **Описание:**
  - Рендеринг текста или Markdown
  - Использование react-markdown

#### Задача 5.7: Создать компонент EmptyStatePlaceholder
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.4
- **Файл:** `src/renderer/components/agents/EmptyStatePlaceholder.tsx`
- **Описание:**
  - Placeholder для пустого чата
  - Примеры команд с возможностью клика

---

### Фаза 6: UI Компоненты — Ввод и История (1-2 дня)

#### Задача 6.1: Создать компонент AutoExpandingTextarea
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.4.5-4.7
- **Файл:** `src/renderer/components/agents/AutoExpandingTextarea.tsx`
- **Описание:**
  - Автоматическое увеличение высоты
  - Максимум 50% высоты области чата
  - Скролл при превышении максимума
  - Enter для отправки, Shift+Enter для новой строки

#### Задача 6.2: Создать компонент HistoryPage
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.5.1-5.5
- **Файл:** `src/renderer/components/agents/HistoryPage.tsx`
- **Описание:**
  - Список всех агентов
  - Кнопка "Back"
  - Отображение ошибок для статуса error

#### Задача 6.3: Создать компонент ActivityIndicator
- **Статус:** ❌ Не начата
- **Оценка:** 0.25 дня
- **Требования:** agents.11
- **Файл:** `src/renderer/components/agents/ActivityIndicator.tsx`
- **Описание:**
  - Анимированный спиннер
  - Отображается при tool_call/code_exec

---

### Фаза 7: Интеграция UI (2 дня)

#### Задача 7.1: Переписать главный компонент Agents
- **Статус:** ❌ Не начата
- **Оценка:** 1 день
- **Требования:** agents.1-12
- **Файл:** `src/renderer/components/agents.tsx`
- **Описание:**
  - Заменить моковые данные на реальные API вызовы
  - Интегрировать все созданные компоненты
  - Подписка на события через `useEventSubscription`
  - Управление состоянием (agents, messages, activeAgentId)

#### Задача 7.2: Создать хук useAgents
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.12
- **Файл:** `src/renderer/hooks/useAgents.ts`
- **Описание:**
  - Загрузка агентов при монтировании
  - Подписка на события агентов
  - Методы: createAgent, selectAgent, archiveAgent

#### Задача 7.3: Создать хук useMessages
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.12
- **Файл:** `src/renderer/hooks/useMessages.ts`
- **Описание:**
  - Загрузка сообщений при смене агента
  - Подписка на события сообщений
  - Методы: sendMessage

---

### Фаза 8: Тестирование UI (2 дня)

#### Задача 8.1: Написать модульные тесты для UI компонентов
- **Статус:** ❌ Не начата
- **Оценка:** 1 день
- **Требования:** agents.1-11
- **Файлы:**
  - `tests/unit/components/agents/AgentIcon.test.tsx`
  - `tests/unit/components/agents/AgentsList.test.tsx`
  - `tests/unit/components/agents/MessageList.test.tsx`
  - `tests/unit/components/agents/AutoExpandingTextarea.test.tsx`
- **Описание:**
  - Тесты рендеринга
  - Тесты взаимодействия
  - Тесты статусов и анимаций

#### Задача 8.2: Написать property-based тесты
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.2.3, agents.9
- **Файлы:**
  - `tests/property/agents/agentId.property.test.ts`
  - `tests/property/agents/status.property.test.ts`
- **Описание:**
  - Тесты генерации agentId (уникальность, формат)
  - Тесты вычисления статуса (детерминированность)

#### Задача 8.3: Написать функциональные тесты
- **Статус:** ❌ Не начата
- **Оценка:** 0.5 дня
- **Требования:** agents.1-12
- **Файл:** `tests/functional/agents.spec.ts`
- **Описание:**
  - E2E тесты создания агента
  - E2E тесты переключения между агентами
  - E2E тесты отправки сообщений
  - E2E тесты истории агентов

---

## Зависимости Между Задачами

```
Фаза 1 (БД)
  ↓
Фаза 2 (Main Process) + Фаза 4 (Утилиты)
  ↓
Фаза 3 (IPC/Preload)
  ↓
Фаза 5 (UI Базовые) + Фаза 6 (UI Ввод/История)
  ↓
Фаза 7 (Интеграция)
  ↓
Фаза 8 (Тестирование)
```

## Критерии Завершения

Работа считается завершенной когда:

- ✅ Все задачи выполнены
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Prettier форматирование корректно
- ✅ Все модульные тесты проходят
- ✅ Все property-based тесты проходят
- ✅ Покрытие кода ≥ 85%
- ✅ Все требования покрыты тестами
- ✅ Функциональные тесты проходят (по запросу пользователя)
- ✅ Производительность соответствует требованиям (< 100ms переключение)

## Примечания

- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- После каждой фазы необходимо запускать валидацию
- При падении тестов запускать только упавшие тесты для отладки
- Обновлять этот файл после завершения каждой задачи
