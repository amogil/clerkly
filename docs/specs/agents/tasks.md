# Список Задач: Agents

## Обзор

Этот документ содержит список задач для реализации компонента Agents — основного интерфейса для взаимодействия с AI-агентами (чат).

**Общая оценка:** 10-12 дней (без учёта выполненной Фазы 1-5)

**Текущий статус:** Пост-миграционная стабилизация функциональных тестов (Фаза 9.x)

---

## КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

### Правило 1: Завершение Фазы

После завершения КАЖДОЙ фазы ОБЯЗАТЕЛЬНО:
1. Запустить `npm run validate`
2. Убедиться, что все проверки проходят
3. Получить подтверждение от пользователя
4. Закоммитить изменения с описательным сообщением

### Правило 2: Изменения UI Списка Агентов

**ЗАПРЕЩЕНО** вносить любые изменения в код, связанные с внешним видом и поведением списка агентов (чатов), без явного согласования с пользователем.

Это включает:
- Изменение расположения элементов в хедере
- Изменение размеров иконок агентов
- Изменение цветов и анимаций статусов
- Изменение логики адаптивности списка
- Изменение поведения кнопки "+N"
- Изменение порядка сортировки агентов

**Перед любым изменением UI списка агентов:**
1. Описать планируемое изменение пользователю
2. Дождаться явного подтверждения
3. Только после подтверждения вносить изменения

---

## Текущее Состояние

### Выполнено
- ✅ Типы событий (`AgentCreatedEvent`, `AgentUpdatedEvent`, `AgentArchivedEvent`, `MessageCreatedEvent`, `MessageUpdatedEvent`)
- ✅ Миграция `005_create_agents_tables.sql`
- ✅ Drizzle ORM схема (`src/main/db/schema.ts`)
- ✅ Репозитории (`AgentsRepository`, `MessagesRepository`)
- ✅ Модульные тесты репозиториев
- ✅ AgentManager и MessageManager
- ✅ IPC handlers и Preload API
- ✅ computeAgentStatus утилита
- ✅ UI типы (Agent, Message)
- ✅ Хуки (useAgents, useMessages)
- ✅ Интеграция хуков в agents.tsx
- ✅ Auto-create First Agent (agents.2.7-2.11):
  - ✅ Auto-create при пустом списке (loadAgents)
  - ✅ Auto-create при архивировании последнего (archiveAgent + event subscription)
  - ✅ Удаление empty state UI
  - ✅ Модульные тесты (2 новых теста)
  - ✅ Функциональные тесты (3 теста в agents-always-one.spec.ts)
  - ✅ Исправлен путь к preload script (dist/preload/preload/index.js)
- ✅ Форматирование даты агента (agents.8.1, settings.2.1):
  - ✅ Использование DateTimeFormatter.formatDateTime() с toLocaleDateString() для соответствия системным настройкам ОС
  - ✅ Отображение updatedAt вместо createdAt в заголовке и списке агентов
  - ✅ Обновлены требования agents.8.1, agents.5.3, settings.2.1
  - ✅ Обновлен дизайн agents (design.md)
  - ✅ Модульные тесты (4 теста в agents-date-simple.test.tsx)
  - ✅ Обновлены тесты DateTimeFormatter для нового подхода
  - ✅ Функциональный тест (agent-date-update.spec.ts) - проверка обновления даты при отправке сообщения
  - ✅ MessageManager.create() генерирует событие AGENT_UPDATED с обновленным updatedAt (agents.1.4, agents.12.2)
- ✅ Автофокус на поле ввода (agents.4.7.1, agents.4.7.2):
  - ✅ Добавлено требование об автофокусе при активации чата
  - ✅ Обновлен design.md с деталями реализации
  - ✅ Реализация useEffect для автофокуса при смене activeAgent
  - ✅ Функциональный тест (input-autofocus.spec.ts) - 6 тестов
  - ✅ Коммит создан
- ✅ AI Elements миграция (Фаза 9):
  - ✅ IPCChatTransport + messageMapper
  - ✅ useAgentChat hook (заменяет useMessages)
  - ✅ AgentMessage, AgentPromptInput, AgentChat компоненты
  - ✅ agents.tsx: все AgentChat смонтированы при старте, CSS show/hide, стартовый лоадер
  - ✅ AnthropicProvider и GoogleProvider через нативный HTTP+SSE
  - ✅ messages:list-paginated IPC endpoint
  - ✅ Unit-тесты всех новых компонентов (1426 тестов)

### В процессе
- Нет активных задач

### Не выполнено
- ❌ Стабилизация функциональных тестов после миграции (см. `docs/specs/agents/functional-test-failures.md`: 4 падения, 5 flaky)

---

## Фазы Реализации

### Фаза 1: База Данных ✅ ВЫПОЛНЕНА

| # | Задача | Статус | Файлы |
|---|--------|--------|-------|
| 1.1 | Миграция таблиц agents и messages | ✅ | `migrations/005_create_agents_tables.sql` |
| 1.2 | Drizzle ORM схема | ✅ | `src/main/db/schema.ts` |
| 1.3 | AgentsRepository | ✅ | `src/main/db/repositories/AgentsRepository.ts` |
| 1.4 | MessagesRepository | ✅ | `src/main/db/repositories/MessagesRepository.ts` |
| 1.5 | Тесты репозиториев | ✅ | `tests/unit/db/repositories/*.test.ts` |

---

### Фаза 2: Main Process — Бизнес-логика ✅ ВЫПОЛНЕНА

**Зависимости:** Фаза 1 ✅

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 2.1 | AgentManager | ✅ | 0.5 дня | agents.2, agents.10 |
| 2.2 | MessageManager | ✅ | 0.5 дня | agents.4, agents.7 |
| 2.3 | Тесты AgentManager | ✅ | 0.5 дня | agents.2, agents.10 |
| 2.4 | Тесты MessageManager | ✅ | 0.5 дня | agents.4, agents.7 |

#### 2.1 AgentManager
- **Файл:** `src/main/agents/AgentManager.ts`
- **Методы:** `create()`, `list()`, `get()`, `update()`, `archive()`
- **Использует:** `dbManager.agents` (репозиторий)
- **Генерирует события:** `AgentCreatedEvent`, `AgentUpdatedEvent`, `AgentArchivedEvent`

#### 2.2 MessageManager
- **Файл:** `src/main/agents/MessageManager.ts`
- **Методы:** `list()`, `create()`, `update()`
- **Использует:** `dbManager.messages` (репозиторий)
- **Генерирует события:** `MessageCreatedEvent`, `MessageUpdatedEvent`

#### 2.3 Тесты AgentManager
- **Файл:** `tests/unit/agents/AgentManager.test.ts`
- **Покрытие:** CRUD операции, изоляция по userId, генерация событий

#### 2.4 Тесты MessageManager
- **Файл:** `tests/unit/agents/MessageManager.test.ts`
- **Покрытие:** CRUD операции, проверка доступа, генерация событий

**После завершения Фазы 2:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add AgentManager and MessageManager"`

---

### Фаза 3: IPC и Preload API ✅ ВЫПОЛНЕНА

**Зависимости:** Фаза 2 ✅

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 3.1 | AgentIPCHandlers | ✅ | 0.25 дня | agents.2, agents.4 |
| 3.2 | Preload API | ✅ | 0.25 дня | user-data-isolation.6.6 |
| 3.3 | Тесты IPC handlers | ✅ | 0.5 дня | agents.2, agents.4 |

#### 3.1 AgentIPCHandlers
- **Файл:** `src/main/agents/AgentIPCHandlers.ts`
- **Handlers:** `agents:create`, `agents:list`, `agents:get`, `agents:update`, `agents:archive`, `messages:list`, `messages:create`, `messages:update`

#### 3.2 Preload API
- **Файл:** `src/preload/index.ts`
- **API:** `window.api.agents`, `window.api.messages`
- **Типы:** `src/preload/types.ts`

#### 3.3 Тесты IPC handlers
- **Файл:** `tests/unit/agents/AgentIPCHandlers.test.ts`

**После завершения Фазы 3:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add IPC handlers and Preload API"`

---

### Фаза 4: Утилиты ✅ ВЫПОЛНЕНА

**Зависимости:** Нет (можно выполнять параллельно с Фазой 2-3)

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 4.1 | computeAgentStatus | ✅ | 0.25 дня | agents.9 |
| 4.2 | Тесты computeAgentStatus | ✅ | 0.25 дня | agents.9 |

#### 4.1 computeAgentStatus
- **Файл:** `src/shared/utils/computeAgentStatus.ts`
- **Алгоритм:** Определение статуса из последних сообщений
- **Статусы:** `new`, `in-progress`, `awaiting-response`, `error`, `completed`

#### 4.2 Тесты computeAgentStatus
- **Файл:** `tests/unit/utils/computeAgentStatus.test.ts`

**После завершения Фазы 4:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add computeAgentStatus utility"`

---

### Фаза 5: UI Типы и Хуки ✅ ВЫПОЛНЕНА

**Зависимости:** Фаза 3, Фаза 4

**⚠️ ВНИМАНИЕ:** Все изменения UI списка агентов требуют согласования с пользователем!

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 5.1 | Типы Agent и Message | ✅ | 0.25 дня | agents.1, agents.7 |
| 5.2 | Хук useAgents | ✅ | 0.5 дня | agents.12 |
| 5.3 | Хук useMessages | ✅ | 0.5 дня | agents.12 |
| 5.4 | Интеграция в agents.tsx | ✅ | 0.5 дня | agents.1-12 |
| 5.5 | Тесты хуков | ✅ | 0.5 дня | agents.12 |

#### 5.1 Типы Agent и Message
- **Файл:** `src/renderer/types/agent.ts` ✅
- **Экспорт:** `src/renderer/types/index.ts` ✅

#### 5.2 Хук useAgents
- **Файл:** `src/renderer/hooks/useAgents.ts` ✅
- **Методы:** `createAgent`, `selectAgent`, `archiveAgent` ✅
- **События:** подписка на `agent.*` ✅

#### 5.3 Хук useMessages
- **Файл:** `src/renderer/hooks/useMessages.ts` ✅
- **Методы:** `sendMessage` ✅
- **События:** подписка на `message.*` ✅

#### 5.4 Интеграция в agents.tsx
- **Файл:** `src/renderer/components/agents.tsx` ✅
- **Заменено:** моковые данные на реальные API вызовы ✅
- **Статус:** вычисляется через `computeAgentStatus` ✅

#### 5.5 Тесты хуков
- **Файлы:** `tests/unit/hooks/useAgents.test.ts`, `tests/unit/hooks/useMessages.test.ts` ✅
- **Покрытие:** 27 тестов useAgents + 24 теста useMessages ✅

**Завершение Фазы 5:**
1. ✅ `npm run validate` - прошла успешно
2. ✅ Подтверждение пользователя получено
3. ✅ `git commit -m "feat(agents): integrate hooks into UI component"`

---

### Фаза 5.1: Auto-create First Agent ✅ ЗАВЕРШЕНА

**Зависимости:** Фаза 5 ✅

**⚠️ КРИТИЧЕСКИ ВАЖНО:** Реализация auto-create first agent (agents.2.7-2.11)

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 5.1.1 | Обновить useAgents.loadAgents | ✅ | 0.25 дня | agents.2.7, agents.2.8 |
| 5.1.2 | Обновить useAgents.archiveAgent | ✅ | 0.25 дня | agents.2.9, agents.2.10 |
| 5.1.3 | Убрать empty state UI | ✅ | 0.1 дня | agents.2.11 |
| 5.1.4 | Модульные тесты | ✅ | 0.25 дня | agents.2.7-2.11 |
| 5.1.6 | Функциональные тесты | ✅ | 0.25 дня | agents.2.7-2.11 |
| 5.1.7 | Исправить infinite loop в useAgents | ✅ | 0.1 дня | agents.2.7-2.11 |
| 5.1.8 | Зарегистрировать AgentIPCHandlers | ✅ | 0.1 дня | agents.2, agents.4 |
| 5.1.9 | Валидация и тестирование | ✅ | 0.1 дня | agents.2.7-2.11 |

#### 5.1.1 Обновить useAgents.loadAgents
- **Файл:** `src/renderer/hooks/useAgents.ts` ✅
- **Изменение:** Добавлен auto-create при пустом списке ✅
- **Логика:**
  ```typescript
  if (agentList.length === 0) {
    const firstAgent = await window.api.agents.create('New Agent');
    setAgents([firstAgent]);
    setActiveAgentId(firstAgent.agentId);
    return;
  }
  ```

#### 5.1.2 Обновить useAgents.archiveAgent
- **Файл:** `src/renderer/hooks/useAgents.ts` ✅
- **Изменение:** Добавлен auto-create при архивировании последнего агента ✅
- **Логика:**
  ```typescript
  const isLastAgent = agents.length === 1;
  // ... archive logic ...
  if (isLastAgent) {
    const newAgent = await window.api.agents.create('New Agent');
    setActiveAgentId(newAgent.agentId);
  }
  ```

#### 5.1.3 Убрать empty state UI
- **Файл:** `src/renderer/components/agents.tsx` ✅
- **Изменение:** Заменен "No agents yet" на "Loading..." ✅
- **Обоснование:** Empty state никогда не должен показываться благодаря auto-create first agent

#### 5.1.4 Модульные тесты
- **Файл:** `tests/unit/hooks/useAgents.test.ts` ✅
- **Новые тесты:** ✅
  - `should auto-create agent when list is empty on mount`
  - `should auto-create agent when archiving last agent`

#### 5.1.6 Функциональные тесты
- **Файл:** `tests/functional/agents-always-one.spec.ts` (новый) ✅
- **Тесты:** ✅
  - `should auto-create first agent for new user after login`
  - `should auto-create agent when last agent is archived`
  - `should never show empty state UI`

#### 5.1.7 Исправить infinite loop в useAgents
- **Файл:** `src/renderer/hooks/useAgents.ts` ✅
- **Проблема:** `loadAgents` зависел от `activeAgentId`, что вызывало бесконечный цикл ✅
- **Решение:** Убрана зависимость от `activeAgentId`, используется функциональный setState ✅

#### 5.1.8 Зарегистрировать AgentIPCHandlers
- **Файл:** `src/main/index.ts` ✅
- **Проблема:** AgentIPCHandlers не были зарегистрированы в main process ✅
- **Решение:** Добавлена инициализация AgentManager, MessageManager и регистрация AgentIPCHandlers ✅
- **Ошибка была:** `Cannot read properties of undefined (reading 'list')` - window.api.agents был undefined

#### 5.1.9 Валидация и тестирование
- **Действия:** ✅
  - Запустить `npm run validate`
  - Убедиться что все тесты проходят
  - Проверить что auto-create first agent работает корректно

**Чек-лист Фазы 5.1:**

- [x] Код написан согласно требованиям agents.2.7-2.11
- [x] useAgents.loadAgents обновлен (auto-create при пустом списке)
- [x] useAgents.archiveAgent обновлен (auto-create при архивировании последнего)
- [x] useAgents event subscription обновлен (auto-create при AGENT_ARCHIVED если список пустой)
- [x] Empty state UI удален из agents.tsx
- [x] Модульные тесты написаны (2 новых теста)
- [x] Функциональные тесты написаны (3 теста в agents-invariant.spec.ts)
- [x] Исправлен infinite loop в useAgents (убрана зависимость от activeAgentId)
- [x] AgentIPCHandlers зарегистрированы в main process
- [x] Исправлен путь к preload script (dist/preload/preload/index.js)
- [x] Спецификации обновлены (requirements.md, design.md, tasks.md)
- [x] Debug логирование убрано
- [x] `npm run validate` проходит без ошибок
- [x] Все модульные тесты проходят (1144 теста)
- [x] Все функциональные тесты auto-create проходят (3 теста)

**Текущий прогресс:** 17/17 пунктов чек-листа (100%) ✅

---

### Фаза 9: AI Elements миграция ✅ ЗАВЕРШЕНА

**Зависимости:** Фаза 5, Фаза 6

| # | Задача | Статус | Требования |
|---|--------|--------|------------|
| 9.1 | IPCChatTransport | ✅ | llm-integration.2, agents.13 |
| 9.2 | messageMapper | ✅ | agents.13, llm-integration.7 |
| 9.3 | messages:list-paginated IPC endpoint | ✅ | agents.13.2 |
| 9.4 | useAgentChat hook | ✅ | agents.4, agents.13 |
| 9.5 | AgentMessage компонент | ✅ | agents.4.9, agents.4.10, llm-integration.7 |
| 9.6 | AgentPromptInput компонент | ✅ | agents.4.3–4.7 |
| 9.7 | AgentChat компонент | ✅ | agents.4, agents.13 |
| 9.8 | Интеграция в agents.tsx | ✅ | agents.13.3, agents.13.5, agents.13.10 |
| 9.9 | AnthropicProvider.chat() | ✅ | llm-integration.2 |
| 9.10 | GoogleProvider.chat() | ✅ | llm-integration.2 |
| 9.11 | Удаление старых компонентов | ✅ | — |
| 9.12 | Unit-тесты всех новых компонентов | ✅ | — |

**Что реализовано:**
- `src/renderer/lib/IPCChatTransport.ts` — мост между `useChat` и Electron IPC
- `src/renderer/lib/messageMapper.ts` — маппинг `MessageSnapshot` → `UIMessage`
- `src/renderer/hooks/useAgentChat.ts` — заменяет `useMessages`, оборачивает `useChat`
- `src/renderer/components/agents/AgentMessage.tsx` — рендер user/llm/error сообщений
- `src/renderer/components/agents/AgentPromptInput.tsx` — поле ввода с auto-expand
- `src/renderer/components/agents/AgentChat.tsx` — per-agent компонент, смонтирован всё время
- `src/renderer/components/agents.tsx` — рендерит все AgentChat, CSS show/hide, стартовый лоадер
- `src/main/llm/AnthropicProvider.ts` — нативный HTTP+SSE
- `src/main/llm/GoogleProvider.ts` — нативный HTTP+SSE
- Удалены: `MessageBubble.tsx`, `ChatInput.tsx`, `AutoExpandingTextarea.tsx`, `useMessages.ts`

---

### Фаза 6: UI Компоненты — Ввод и История (1 день)

**Зависимости:** Фаза 5

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 6.1 | AutoExpandingTextarea | ✅ ВЫПОЛНЕНО | 0.25 дня | agents.4.5-4.7 |
| 6.2 | MarkdownMessage | ✅ ВЫПОЛНЕНО | 0.25 дня | agents.7.7 |
| 6.3 | AgentWelcome | ✅ ВЫПОЛНЕНО | 0.25 дня | agents.4 |
| 6.4 | Перенос текста в сообщениях | ✅ ВЫПОЛНЕНО | 0.1 дня | agents.4.22 |
| 6.5 | AllAgents | ✅ ВЫПОЛНЕНО | 0.25 дня | agents.5 |

#### 6.1 AutoExpandingTextarea
- **Файл:** `src/renderer/components/agents/AutoExpandingTextarea.tsx`
- **Максимум:** 50% высоты области чата
- **Enter:** отправка, **Shift+Enter:** новая строка

#### 6.2 MarkdownMessage
- **Файл:** `src/renderer/components/agents/MarkdownMessage.tsx` ✅
- **Markdown:** react-markdown ✅
- **Тесты:** `tests/unit/components/agents/MarkdownMessage.test.tsx` (12 тестов) ✅

#### 6.3 AgentWelcome
- **Файл:** `src/renderer/components/agents/AgentWelcome.tsx` ✅
- **Интеграция:** `src/renderer/components/agents.tsx` (показывается когда messages.length === 0) ✅
- **Дизайн:** Application Logo + 4 промпт-кнопки с иконками ✅
- **Промпты:** 
  - "Transcribe my latest meeting" (Video icon)
  - "Extract action items from today's standup" (CheckSquare icon)
  - "Create Jira tickets from meeting notes" (FileText icon)
  - "Send summary to the team" (Calendar icon)
- **Анимации:** framer-motion (fade in, scale on hover/tap) ✅
- **Модульные тесты:** `tests/unit/components/agents/AgentWelcome.test.tsx` (10 тестов) ✅
- **Функциональные тесты:** `tests/functional/empty-state-placeholder.spec.ts` (7 тестов) ✅
- **Стилизация сообщений пользователя:** ✅
  - `rounded-2xl` (16px скругленные углы)
  - `bg-secondary/70` (серый полупрозрачный фон)
  - `border border-border` (тонкая серая рамка)
  - полная ширина (без ограничения max-w)
  - `whitespace-pre-wrap` (сохранение переносов строк)
  - `break-words` (перенос длинных слов без пробелов)

#### 6.4 Перенос текста в сообщениях ✅
- **Файл:** `src/renderer/components/agents.tsx` ✅
- **Требование:** agents.4.22 ✅
- **Задача:** Добавить CSS классы для корректного переноса текста в сообщениях ✅
- **Изменения:**
  - Добавлен `whitespace-pre-wrap` для сохранения переносов строк из текста ✅
  - Добавлен `break-words` для переноса длинных слов без пробелов ✅
  - Убедились, что горизонтальная полоса прокрутки не появляется ✅
- **Применено к:**
  - Сообщениям пользователя (user messages) ✅
  - Сообщениям агента (agent messages) ✅
- **Модульные тесты:** `tests/unit/components/agents.test.tsx` (6 тестов) ✅
- **Функциональные тесты:** `tests/functional/message-text-wrapping.spec.ts` (12 тестов) ✅
  1. "should wrap long words without spaces in user messages"
  2. "should preserve line breaks in user messages"
  3. "should have correct CSS classes for agent messages"
  4. "should not exceed chat area width with long content"
  5. "should handle mixed content with long words and line breaks"
  6. "should preserve multiple consecutive line breaks"
  7. "should wrap long text with spaces naturally"
  8. "should wrap code-like content without horizontal scroll"
  9. "should preserve internal whitespace and trim leading/trailing"
  10. "should maintain text wrapping after window resize"
  11. "should handle emoji and Unicode characters correctly"

#### 6.5 AllAgents
- **Файл:** `src/renderer/components/agents/AllAgents.tsx`

**После завершения Фазы 6:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add input and history UI components"`

---

### Фаза 7: Интеграция UI ✅ ВЫПОЛНЕНА

**Зависимости:** Фаза 5, Фаза 6

**⚠️ ВНИМАНИЕ:** Интеграция затрагивает список агентов — требуется согласование!

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 7.1 | Хук useAgents | ✅ | 0.5 дня | agents.12 |
| 7.2 | Хук useMessages | ✅ | 0.5 дня | agents.12 |
| 7.3 | Интеграция компонента Agents | ✅ | 0.5 дня | agents.1-12 |

#### 7.1 useAgents
- **Файл:** `src/renderer/hooks/useAgents.ts`
- **Методы:** `createAgent`, `selectAgent`, `archiveAgent`
- **События:** подписка на `agent.*`

#### 7.2 useMessages
- **Файл:** `src/renderer/hooks/useMessages.ts`
- **Методы:** `sendMessage`
- **События:** подписка на `message.*`

#### 7.3 Интеграция компонента Agents
- **Файл:** `src/renderer/components/agents.tsx`
- **Заменить:** моковые данные на реальные API вызовы

**После завершения Фазы 7:**
1. `npm run validate`
2. Подтверждение пользователя (обязательно для UI!)
3. `git commit -m "feat(agents): integrate UI with real API"`

---

### Фаза 8: Тестирование ✅ ВЫПОЛНЕНО

**Зависимости:** Фаза 7

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 8.1 | Тесты UI компонентов | ✅ | 1 день | agents.1-11 |
| 8.2 | Функциональные тесты | ✅ | 0.5 дня | agents.1-12 |

#### 8.1 Тесты UI компонентов
- **Файлы:** `tests/unit/components/agents/*.test.tsx`

#### 8.2 Функциональные тесты
- **Файл:** `tests/functional/agents.spec.ts`
- **Запуск:** только по запросу пользователя

**После завершения Фазы 8:**
1. `npm run validate`
2. Подтверждение пользователя
3. Запуск функциональных тестов (по запросу)
4. `git commit -m "test(agents): add comprehensive test coverage"`

---

## Зависимости Между Фазами

```
Фаза 1 ✅
    │
    ├──► Фаза 2 ✅ ──► Фаза 3 ✅ ──┐
    │                              │
    └──► Фаза 4 ✅ ────────────────┼──► Фаза 5 ✅ ──► Фаза 5.1 ✅ ──► Фаза 6 ──► Фаза 7 ──► Фаза 8
                                   │
                                   └──────────────────────────────────────────────────────────►
```

**Текущая фаза:** Фаза 9.x (стабилизация функциональных тестов после AI Elements миграции)

---

### Фаза 9: AI Elements — Загрузка всех чатов при старте (agents.13) ⚠️ ЧАСТИЧНО ЗАВЕРШЕНА

**Зависимости:** Фаза 5.1 ✅, ai-elements-migration план (Фазы 2–8)

**Описание:** Реализация новой архитектуры чатов — все `AgentChat` монтируются при старте, переключение через CSS show/hide, лоадер пока все чаты не загружены.

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 9.1 | Компонент `AgentChat` | ✅ | 0.5 дня | agents.13.3, agents.13.5 |
| 9.2 | Лоадер при старте | ✅ | 0.25 дня | agents.13.1, agents.13.2 |
| 9.3 | CSS show/hide при переключении | ✅ | 0.25 дня | agents.13.4, agents.13.5 |
| 9.4 | Монтирование нового агента | ✅ | 0.25 дня | agents.13.7 |
| 9.5 | Ленивая подгрузка при скролле вверх | ❌ | 0.5 дня | agents.13.9 |
| 9.6 | Тесты | 🔄 | 0.5 дня | agents.13 |

#### 9.1 Компонент `AgentChat`
- **Файл:** `src/renderer/components/agents/AgentChat.tsx`
- **Описание:** Независимый компонент для каждого агента. Монтируется при старте, остаётся смонтированным всё время.
- **Использует:** `useAgentChat(agentId)` — загружает последние 50 сообщений при mount
- **Содержит:** `Conversation` + `ConversationContent` + список `AgentMessage` + `AgentPromptInput`
- **Экспортирует:** `isLoading` для лоадера в `agents.tsx`

#### 9.2 Лоадер при старте
- **Файл:** `src/renderer/components/agents.tsx`
- **Логика:** `agents.tsx` рендерит все `AgentChat` компоненты сразу, но показывает лоадер пока хотя бы один `isLoading === true`
- **Реализация:** `const allLoaded = agentChatStates.every(s => !s.isLoading)` — показывать основной интерфейс только когда `allLoaded === true`

#### 9.3 CSS show/hide при переключении
- **Файл:** `src/renderer/components/agents.tsx`
- **Логика:** Каждый `AgentChat` рендерится с `className={activeAgentId === agent.agentId ? '' : 'hidden'}` (или `display: none`)
- **Результат:** Переключение агента = мгновенно, без ремонта, позиция скролла сохраняется

#### 9.4 Монтирование нового агента
- **Файл:** `src/renderer/components/agents.tsx`
- **Логика:** При получении события `AGENT_CREATED` — новый `AgentChat` добавляется в список и монтируется немедленно

#### 9.5 Ленивая подгрузка при скролле вверх
- **Файл:** `src/renderer/components/agents/AgentChat.tsx`
- **Логика:** `Conversation` при скролле к верхней границе вызывает `loadMore()` из `useAgentChat`
- **Результат:** Старые сообщения подгружаются порциями по 50, позиция скролла не прыгает

#### 9.6 Тесты
- **Модульные:** `tests/unit/components/agents/AgentChat.test.tsx`
  - Рендерится с лоадером пока `isLoading === true`
  - Скрывается через CSS когда не активен
  - Показывается без ремонта при активации
- **Функциональные:** `tests/functional/agent-switching.spec.ts`
  - "should preserve scroll position when switching agents"
  - "should show correct chat immediately on agent click"
- **Фактический статус:** часть функтестов по скроллу/смежным сценариям нестабильна, требуется стабилизация (см. `docs/specs/agents/functional-test-failures.md`)

**После завершения Фазы 9:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): implement all-chats-on-startup architecture"`

---

## Критерии Завершения

Работа считается завершенной когда:

- ✅ Все задачи выполнены
- ✅ `npm run validate` проходит без ошибок
- ✅ Покрытие кода ≥ 85%
- ✅ Все требования покрыты тестами
- ✅ Функциональные тесты проходят
- ✅ Производительность: переключение агентов < 100ms

---

## Чеклист Завершения Фазы

Перед переходом к следующей фазе:

- [ ] Код написан согласно требованиям
- [ ] Тесты написаны и проходят
- [ ] `npm run validate` проходит
- [ ] Изменения UI согласованы с пользователем (если применимо)
- [ ] Получено подтверждение от пользователя
- [ ] Изменения закоммичены

---

### Фаза 9: Миграция на AI Elements + кастомный IPC Transport ✅ ВЫПОЛНЕНА

**Зависимости:** Фаза 5.1 ✅

**Детальный план:** `docs/specs/ai-elements-migration/plan.md`

**⚠️ КРИТИЧЕСКИ ВАЖНО:**
- Функциональные тесты НЕ трогать
- Сохранить все `data-testid` атрибуты
- Апгрейд React 18 → 19 требует проверки совместимости

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 9.0 | Исследование и проверка совместимости | ✅ | 0.5 дня | - |
| 9.1 | Установка зависимостей (React 19, AI SDK v5, use-stick-to-bottom) | ✅ | 0.25 дня | - |
| 9.2 | IPCChatTransport | ✅ | 1 день | llm-integration.2, llm-integration.8 |
| 9.3 | messageMapper | ✅ | 0.5 дня | llm-integration.3.8, llm-integration.8.5 |
| 9.4 | useAgentChat | ✅ | 0.5 дня | agents.12 |
| 9.5 | Conversation (скролл) | ✅ | 0.5 дня | agents.4.13, agents.4.14 |
| 9.6 | AgentMessage | ✅ | 0.5 дня | agents.4.9, agents.4.10, llm-integration.3.4.1 |
| 9.7 | Reasoning | ✅ | 0.25 дня | llm-integration.7.2 |
| 9.8 | AgentPromptInput | ✅ | 0.5 дня | agents.4.1-4.7 |
| 9.9 | Интеграция в agents.tsx | ✅ | 0.5 дня | agents.4 |
| 9.10 | Удаление старых компонентов | ✅ | 0.25 дня | - |
| 9.11 | Финальная валидация | 🔄 | 0.25 дня | - |

**После завершения Фазы 9:**
1. `npm run validate`
2. Подтверждение пользователя
3. Запуск функциональных тестов (по запросу)
4. `git commit -m "feat(agents): migrate to AI Elements + IPC transport"`
