# Список задач: LLM Integration

## Обзор

План работ по Issue #89: post-tool model continuation наследует урезанный timeout budget.

После `tool_result` следующий шаг модели может не получить полный timeout budget (120s). Таймер сбрасывается в `onStepFinish`, но между `onStepFinish` и началом следующего model request проходит время на выполнение инструмента. В результате post-tool continuation стартует с уменьшенным бюджетом.

**Текущий статус:** Фаза 4 — Валидация завершена

---

## CRITICAL RULES

- Не менять поведение retry (timeout retry, silent-failure retry, invalid tool call retry).
- Не менять семантику `onStepFinish` reset — он остаётся как есть.
- Изменение только в добавлении `resetTimeout()` в `experimental_onStepStart`.
- Изменения идентичны во всех трёх провайдерах (OpenAI, Anthropic, Google).
- Не запускать полный `npm run test:functional` без подтверждения пользователя.

---

## Анализ бага

### Текущее поведение

Lifecycle Vercel AI SDK multi-step tool-loop:
1. `experimental_onStepStart(step 0)` — next model request begins
2. Model streams response with `tool_call`
3. `onStepFinish(step 0)` — model step completed; **timeout resets here** (fresh 120s)
4. Tool executes (e.g. `code_exec`, may take 10-30s+)
5. `experimental_onStepStart(step 1)` — next model request begins; **timeout NOT reset**
6. Model streams response
7. `onStepFinish(step 1)` — model step completed

Между шагами 3 и 5 инструмент выполняется и потребляет бюджет таймаута. К моменту начала следующего model request (шаг 5) от 120s бюджета уже потрачена часть на tool execution.

### Production data (Issue #89)

- User message at `14:47:43.981Z`
- `tool_call(code_exec)` terminal at `14:48:08.631Z` (tool took ~25s)
- `kind:error timeout` at `14:49:44.017Z`
- Delta user→timeout = `120.036s` (full budget from user message)
- Delta tool_result→timeout = `95.386s` (reduced budget for post-tool step)

Post-tool model step получил ~95s вместо полных 120s, потому что ~25s ушло на tool execution.

### Ожидаемое поведение (по спецификации)

Требование `llm-integration.3.6.1`: таймаут применяется к **каждому запросу отдельно**. Время выполнения инструментов между запросами НЕ ДОЛЖНО учитываться в таймауте.

### Root cause

`resetTimeout()` вызывается только в `onStepFinish`. Callback `experimental_onStepStart` уже существует во всех провайдерах, но используется только для записи `stepStartedAt` (диагностика latency). Он не сбрасывает таймер.

### Fix

Добавить `resetTimeout()` в `experimental_onStepStart` во всех трёх провайдерах. Это гарантирует, что каждый model request получает свежий полный timeout budget с момента фактического начала запроса.

---

## Текущее состояние

### Выполнено (Issue #84)
- ✅ Фаза 1-5 Issue #84: timeout retry policy полностью реализована.

### Выполнено (Issue #89)
- ✅ Фаза 1: Обновление спецификаций (`design.md` — pseudocode и unit test entries).
- ✅ Фаза 2: Реализация fix — `resetTimeout()` в `experimental_onStepStart` во всех 3 провайдерах.
- ✅ Фаза 3: Unit-тесты (3 теста: по одному для каждого провайдера).
- ✅ Фаза 4: Валидация (`npm run validate` passed — TS, ESLint, Prettier, 1983 unit tests).

### В работе

### Запланировано

#### Фаза 5: Functional tests (ожидает подтверждения пользователя)

- [ ] Запросить подтверждение пользователя перед `npm run test:functional`.
