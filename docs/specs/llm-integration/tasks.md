# Список задач: LLM Integration

## Обзор

**Issue:** #88
**Branch:** `fix/88-finalize-unfinished-tool-calls-on-new-message`

Финализация всех незавершённых `tool_call` записей при отправке нового пользовательского сообщения.

**Текущий статус:** реализация завершена, ожидание запуска функциональных тестов

---

## CRITICAL RULES

- Не менять поведение retry (timeout retry, silent-failure retry, invalid tool call retry).
- Не менять семантику существующего `finalizePendingToolCallsForTurn` внутри `MainPipeline` — он продолжает работать для текущего turn.
- Не запускать полный `npm run test:functional` без подтверждения пользователя.

---

## Issue #88: Finalize all unfinished tool calls when user sends a new message

При отправке нового `kind:user` сообщения система отменяет активный pipeline (`cancelActivePipelineAndNormalizeTail`), но не финализирует «осиротевшие» persisted `tool_call` записи (`done=0`, `status=running`), у которых уже нет живого runtime-сессии. Такие записи остаются навсегда, портят UX и статус агента.

### Анализ бага

#### Текущее поведение

Поток при `messages:create` (`kind: user`):
1. `cancelActivePipelineAndNormalizeTail(agentId)` — отменяет `AbortController`, скрывает in-flight `kind:llm` (если есть)
2. `hideErrorMessages(agentId)` — скрывает видимые `kind:error`
3. Создаёт `kind:user` сообщение
4. Запускает новый `MainPipeline.run()`

**Проблема:** между шагами 1 и 4 нет очистки stale `tool_call` записей.

`finalizePendingToolCallsForTurn()` вызывается **только** внутри `MainPipeline.handleRunError()` (при ошибке/отмене **текущего** run) и фильтрует по `replyToMessageId === userMessageId` (текущий turn). Она не видит tool calls от **предыдущих** turns и не вызывается при cancel из `AgentIPCHandlers`.

#### Сценарий проблемы

1. Пользователь отправляет сообщение → pipeline запускает `code_exec` → persisted `tool_call` (`done=0`, `status=running`)
2. Pipeline падает или сигнал abort «теряет» runtime-контекст (AI SDK bug)
3. Пользователь отправляет **новое** сообщение
4. `cancelActivePipelineAndNormalizeTail` отменяет pipeline, но stale `tool_call` остаётся `done=0`
5. Новый pipeline запускается с «мусором» в истории → UI показывает бесконечный spinner для старого tool call

#### Root cause

`cancelActivePipelineAndNormalizeTail` работает **только** с последним сообщением (`getLastMessage`) и **только** скрывает in-flight `kind:llm`. Она не трогает `kind:tool_call` записи. Persisted reconciliation отсутствует.

### Plan

#### Фаза 1: Обновление спецификаций

- ✅ Добавить требование `llm-integration.8.9` в `requirements.md`
- ✅ Добавить требование `llm-integration.8.10` в `requirements.md`
- ✅ Обновить `design.md` — секция «Прерывание запроса при новом сообщении»: добавить шаг persisted reconciliation в поток `messages:create (kind: user)`

#### Фаза 2: Реализация

- ✅ **2.1** Создать метод `MessageManager.finalizeStaleToolCalls(agentId: string): void`
- ✅ **2.2** Вызвать `messageManager.finalizeStaleToolCalls(agentId)` в `AgentIPCHandlers.handleMessageCreate()` между `cancelActivePipelineAndNormalizeTail()` и `hideErrorMessages()`
- ✅ **2.3** Рефакторинг `MainPipeline.finalizePendingToolCallsForTurn()` оценён и отклонён (scope safe: оба метода оставлены независимыми из-за различий в семантике фильтрации и статусов)

#### Фаза 3: Unit-тесты

- ✅ **3.1** `tests/unit/agents/MessageManager.test.ts`: 6 тестов для `finalizeStaleToolCalls`
- ✅ **3.2** `tests/unit/agents/AgentIPCHandlers.test.ts`: 3 теста для интеграции `finalizeStaleToolCalls`

#### Фаза 4: Валидация

- ✅ Прогнан `npm run validate` (TypeScript, ESLint, Prettier, unit tests, coverage)
- ✅ Все новые и существующие тесты проходят
- ✅ Обновлена coverage table в `design.md`

#### Фаза 5: Functional tests (ожидает подтверждения пользователя)

- [ ] Запросить подтверждение пользователя перед `npm run test:functional`

### Выполнено (Issue #88)

- ✅ Фаза 1: Обновлены `requirements.md` (8.9, 8.10) и `design.md` (поток messages:create, coverage table, unit test descriptions)
- ✅ Фаза 2: Реализован `MessageManager.finalizeStaleToolCalls()`, вызван в `AgentIPCHandlers.handleMessageCreate()`, рефакторинг MainPipeline отклонён (scope safe)
- ✅ Фаза 3: Добавлены 9 unit-тестов (6 в MessageManager, 3 в AgentIPCHandlers)
- ✅ Фаза 4: Прогнан `npm run validate` — все проверки пройдены
