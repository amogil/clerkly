# Список Задач: Agents

## Обзор

Этот документ содержит список задач для реализации компонента Agents — основного интерфейса для взаимодействия с AI-агентами (чат).

**Общая оценка:** 10-12 дней (без учёта выполненной Фазы 1)

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

### Не выполнено
- ❌ UI компоненты (используют моковые данные)
- ❌ Функциональные тесты

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
- **Статусы:** `new`, `in-progress`, `awaiting-user`, `error`, `completed`

#### 4.2 Тесты computeAgentStatus
- **Файл:** `tests/unit/utils/computeAgentStatus.test.ts`
- **Property-based:** `tests/property/agents/status.property.test.ts`

**После завершения Фазы 4:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add computeAgentStatus utility"`

---

### Фаза 5: UI Компоненты — Базовые (2 дня)

**Зависимости:** Фаза 3, Фаза 4

**⚠️ ВНИМАНИЕ:** Все изменения UI списка агентов требуют согласования с пользователем!

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 5.1 | Типы Agent и Message | ❌ | 0.25 дня | agents.1, agents.7 |
| 5.2 | AgentIcon | ❌ | 0.5 дня | agents.1.2, agents.6 |
| 5.3 | AgentsList | ❌ | 0.5 дня | agents.1.1, agents.1.5-1.9 |
| 5.4 | ActiveAgentInfo | ❌ | 0.25 дня | agents.8 |
| 5.5 | MessageList | ❌ | 0.5 дня | agents.4.8-4.13 |

#### 5.1 Типы Agent и Message
- **Файл:** `src/renderer/types/agent.ts`
- **Удалить:** устаревший `agent-task.ts`

#### 5.2 AgentIcon
- **Файл:** `src/renderer/components/agents/AgentIcon.tsx`
- **Размер:** 32px (w-8 h-8)
- **Цвета по статусу:** см. agents.6

#### 5.3 AgentsList
- **Файл:** `src/renderer/components/agents/AgentsList.tsx`
- **Кнопка "New chat":** bg-sky-400
- **Адаптивность:** автоматический расчёт видимых агентов
- **Кнопка "+N":** для скрытых агентов

#### 5.4 ActiveAgentInfo
- **Файл:** `src/renderer/components/agents/ActiveAgentInfo.tsx`

#### 5.5 MessageList
- **Файл:** `src/renderer/components/agents/MessageList.tsx`
- **Автоскролл:** к последнему сообщению

**После завершения Фазы 5:**
1. `npm run validate`
2. Подтверждение пользователя (особенно для UI изменений!)
3. `git commit -m "feat(agents): add base UI components"`

---

### Фаза 6: UI Компоненты — Ввод и История (1 день)

**Зависимости:** Фаза 5

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 6.1 | AutoExpandingTextarea | ❌ | 0.25 дня | agents.4.5-4.7 |
| 6.2 | MessageContent | ❌ | 0.25 дня | agents.7.7 |
| 6.3 | EmptyStatePlaceholder | ❌ | 0.25 дня | agents.4 |
| 6.4 | HistoryPage | ❌ | 0.25 дня | agents.5 |

#### 6.1 AutoExpandingTextarea
- **Файл:** `src/renderer/components/agents/AutoExpandingTextarea.tsx`
- **Максимум:** 50% высоты области чата
- **Enter:** отправка, **Shift+Enter:** новая строка

#### 6.2 MessageContent
- **Файл:** `src/renderer/components/agents/MessageContent.tsx`
- **Markdown:** react-markdown

#### 6.3 EmptyStatePlaceholder
- **Файл:** `src/renderer/components/agents/EmptyStatePlaceholder.tsx`

#### 6.4 HistoryPage
- **Файл:** `src/renderer/components/agents/HistoryPage.tsx`

**После завершения Фазы 6:**
1. `npm run validate`
2. Подтверждение пользователя
3. `git commit -m "feat(agents): add input and history UI components"`

---

### Фаза 7: Интеграция UI (1.5 дня)

**Зависимости:** Фаза 5, Фаза 6

**⚠️ ВНИМАНИЕ:** Интеграция затрагивает список агентов — требуется согласование!

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 7.1 | Хук useAgents | ❌ | 0.5 дня | agents.12 |
| 7.2 | Хук useMessages | ❌ | 0.5 дня | agents.12 |
| 7.3 | Интеграция компонента Agents | ❌ | 0.5 дня | agents.1-12 |

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

### Фаза 8: Тестирование (2 дня)

**Зависимости:** Фаза 7

| # | Задача | Статус | Оценка | Требования |
|---|--------|--------|--------|------------|
| 8.1 | Тесты UI компонентов | ❌ | 1 день | agents.1-11 |
| 8.2 | Property-based тесты | ❌ | 0.5 дня | agents.2.3, agents.9 |
| 8.3 | Функциональные тесты | ❌ | 0.5 дня | agents.1-12 |

#### 8.1 Тесты UI компонентов
- **Файлы:** `tests/unit/components/agents/*.test.tsx`

#### 8.2 Property-based тесты
- **Файлы:** `tests/property/agents/*.property.test.ts`

#### 8.3 Функциональные тесты
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
    ├──► Фаза 2 ──► Фаза 3 ──┐
    │                        │
    └──► Фаза 4 ─────────────┼──► Фаза 5 ──► Фаза 6 ──► Фаза 7 ──► Фаза 8
                             │
                             └──────────────────────────────────────────►
```

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
