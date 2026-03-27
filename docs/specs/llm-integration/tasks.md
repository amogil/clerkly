# Список задач: LLM Integration

## Обзор

План работ по LLM timeout management (Issue #84: retry policy, Issue #89: step-start reset).

**Текущий статус:** Issue #89 — Фаза 4 завершена, ожидание functional tests

---

## CRITICAL RULES

- Не менять поведение retry (timeout retry, silent-failure retry, invalid tool call retry).
- Не менять семантику `onStepFinish` reset — он остаётся как есть.
- Изменения идентичны во всех трёх провайдерах (OpenAI, Anthropic, Google).
- Не запускать полный `npm run test:functional` без подтверждения пользователя.

---

## Issue #84: retry timeout-ошибок модели до 3 раз

Выделение timeout в отдельную retry-ветку с лимитом 3 consecutive retry (4 попытки суммарно). Счётчик timeout-повторов сбрасывается при успешной попытке.

### Выполнено (Issue #84)

- ✅ Фаза 1: Обновление спецификаций (`requirements.md`, `design.md`).
- ✅ Фаза 2: Реализация timeout retry в `MainPipeline.ts` (`MAX_TIMEOUT_RETRIES`, `consecutiveTimeouts`, `shouldRetryTimeout`).
- ✅ Фаза 3: Unit-тесты (6 тестов: exhaust retry, recover, non-timeout unchanged, abort guards, counter reset).
- ✅ Фаза 4: Валидация (`npm run validate` passed).
- ✅ Фаза 5: Исправление замечаний code review (PR #85).
  - [x] P0: Добавить недостающий unit-тест на сброс счётчика timeout-retry между runs.
  - [x] P0: Исправить ложное отмечание в tasks.md.
  - [x] P2: Убрать implementation details из `requirements.md` 12.2.3 (имена классов, `consecutive`).
  - [x] P2: Добавить `logger.warn` при timeout retry в `MainPipeline.ts`.
  - [x] P2: Обновить "Выполнено" / "В работе" секции tasks.md.
  - [x] P3: Guard `normalizeLLMError` вызов за `!isInvalidFinalAnswer`.
  - [x] P3: Переименовать тест "does not retry timeout when signal is already aborted" → "exits early without calling provider when signal is already aborted".
  - [x] Прогнать `npm run validate`.
  - [x] Push и ответить на review comments.

---

## Issue #89: post-tool model continuation наследует урезанный timeout budget

После `tool_result` следующий шаг модели может не получить полный timeout budget (120s). Таймер сбрасывался только в `onStepFinish`, но между `onStepFinish` и началом следующего model request проходит время на выполнение инструмента.

### Анализ бага

#### Текущее поведение

Lifecycle Vercel AI SDK multi-step tool-loop:
1. `experimental_onStepStart(step 0)` — next model request begins
2. Model streams response with `tool_call`
3. `onStepFinish(step 0)` — model step completed; **timeout resets here** (fresh 120s)
4. Tool executes (e.g. `code_exec`, may take 10-30s+)
5. `experimental_onStepStart(step 1)` — next model request begins; **timeout NOT reset**
6. Model streams response
7. `onStepFinish(step 1)` — model step completed

Между шагами 3 и 5 инструмент выполняется и потребляет бюджет таймаута. К моменту начала следующего model request (шаг 5) от 120s бюджета уже потрачена часть на tool execution.

#### Production data (Issue #89)

- User message at `14:47:43.981Z`
- `tool_call(code_exec)` terminal at `14:48:08.631Z` (tool took ~25s)
- `kind:error timeout` at `14:49:44.017Z`
- Delta user→timeout = `120.036s` (full budget from user message)
- Delta tool_result→timeout = `95.386s` (reduced budget for post-tool step)

Post-tool model step получил ~95s вместо полных 120s, потому что ~25s ушло на tool execution.

#### Ожидаемое поведение (по спецификации)

Требование `llm-integration.3.6.1`: таймаут применяется к **каждому запросу отдельно**. Время выполнения инструментов между запросами НЕ ДОЛЖНО учитываться в таймауте.

#### Root cause

`resetTimeout()` вызывается только в `onStepFinish`. Callback `experimental_onStepStart` уже существует во всех провайдерах, но используется только для записи `stepStartedAt` (диагностика latency). Он не сбрасывает таймер.

#### Fix

Добавить `resetTimeout()` в `experimental_onStepStart` во всех трёх провайдерах. Это гарантирует, что каждый model request получает свежий полный timeout budget с момента фактического начала запроса.

### Выполнено (Issue #89)

- ✅ Фаза 1: Обновление спецификаций (`design.md` — pseudocode и unit test entries).
- ✅ Фаза 2: Реализация fix — `resetTimeout()` в `experimental_onStepStart` во всех 3 провайдерах.
- ✅ Фаза 3: Unit-тесты (3 теста: по одному для каждого провайдера).
- ✅ Фаза 4: Валидация (`npm run validate` passed — TS, ESLint, Prettier, 1983 unit tests).

### Запланировано

#### Фаза 5: Functional tests (ожидает подтверждения пользователя)

- [ ] Запросить подтверждение пользователя перед `npm run test:functional`.
