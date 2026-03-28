# Список задач: Issue #87 — Stale running code_exec tool_call leaves chat forever In progress

## Обзор

Persisted `tool_call(code_exec)` записи могут навсегда остаться в `running` (`done=0`), что блокирует чат в статусе `In progress` после рестарта приложения. Две root cause: (1) retry path (`handleAttemptFailure`) скрывает сообщения попытки, но не финализирует running tool calls; (2) нет startup reconciliation для stale `running` tool_call записей.

**Текущий статус:** план составлен, ожидает согласования

---

## CRITICAL RULES

- Не менять поведение retry (timeout retry, silent-failure retry, invalid tool call retry).
- Не менять семантику существующего `finalizePendingToolCallsForTurn` внутри `MainPipeline` — он продолжает работать для текущего turn.
- Не запускать полный `npm run test:functional` без подтверждения пользователя.

---

## Анализ бага

### Gap 1: Retry path оставляет stale running rows

`handleAttemptFailure()` (строка ~1329 в `MainPipeline.ts`) при retry:
1. Для non-invalid-final-answer ошибок вызывает `flushPendingToolCall()` — это создаёт persisted `tool_call` (`done=0`, `status=running`).
2. Потом `setHidden(messageId, agentId)` для всех `attemptMessageIds` — помечает `hidden=true`, но **НЕ** финализирует `done` и `status`.
3. Результат: hidden `tool_call` с `done=0`, `status=running` навсегда остаётся в БД.

Для invalid-final-answer / orphaned tool call flow: `flushPendingToolCall` пропускается (строка 1341), но `runningToolCalls` из `state` уже содержит persisted `tool_call` записи, созданные при обработке `tool_call` chunk. При retry они скрываются (`setHidden`), но `done` и `output.status` остаются `running`.

### Gap 2: Нет startup reconciliation

После рестарта приложения:
- Нет активного runtime для старых pipeline.
- Persisted `tool_call` с `done=0`, `status=running`, `hidden=false` (id 1089 из issue) -> `computeAgentStatus()` возвращает `IN_PROGRESS` -> бесконечный spinner.
- Persisted `tool_call` с `done=0`, `status=running`, `hidden=true` (id 1075, 1084) -> не влияют на UI, но засоряют БД.

Существующий `MessageManager.finalizeStaleToolCalls()` (issue #88) **не пригоден** для startup reconciliation:
- `list(agentId)` вызывает `listByAgent(agentId)` с `includeHidden=false` — hidden записи не видны.
- Фильтр `!msg.hidden` в самом методе дублирует это ограничение.
- Итого: hidden rows (id 1075, 1084 из issue) не будут найдены и не будут финализированы.

Для startup нужен отдельный метод, работающий с `includeHidden=true`.

### Stale `kind:llm` с `done=false, hidden=false` после kill процесса

Та же проблема касается `kind:llm` с `done=false, hidden=false` после рестарта — `computeAgentStatus()` возвращает `IN_PROGRESS`. Во всех штатных сценариях `handleRunError` и `cancelActivePipelineAndNormalizeTail` скрывают in-flight `kind:llm` через `hideAndMarkIncomplete`. Stale visible `kind:llm` возможен только при kill процесса (OOM, Activity Monitor, force-quit). **Вынесено из scope #87** — отдельный issue #92 (связан с функциональностью продолжения работы в чатах при перезагрузке).

### Затронутые файлы

- `src/main/agents/MainPipeline.ts` — `handleAttemptFailure()`
- `src/main/agents/MessageManager.ts` — новый startup метод
- `src/main/db/repositories/MessagesRepository.ts` — новый bulk-update метод
- `src/main/index.ts` — вызов startup reconciliation

---

## Plan

### Фаза 1: Обновление спецификаций

- [ ] **1.1** Добавить требование `llm-integration.11.6.2` в `requirements.md`:
  > КОГДА попытка (attempt) завершается retry, ТО все running `tool_call` записи этой попытки ДОЛЖНЫ быть финализированы в terminal состояние (`error`) с `done=1` ДО скрытия сообщений попытки.
- [ ] **1.2** Добавить требование `llm-integration.11.6.3` в `requirements.md`:
  > КОГДА приложение стартует, ТО система ДОЛЖНА финализировать все persisted `tool_call` записи с `done=0` (включая `hidden=true`) во всех агентах текущего пользователя в terminal состояние `cancelled` с `done=1`.
- [ ] **1.3** Обновить `design.md`:
  - Секция `handleAttemptFailure`: добавить шаг финализации running tool calls перед `setHidden`
  - Новая секция startup reconciliation: описание метода в `MessageManager` + `MessagesRepository`
  - Обновить coverage table

### Фаза 2: Реализация — Fix retry path (Gap 1)

- [ ] **2.1** Вынести private метод `finalizeRunningToolCallsForAttempt(state, agentId)` в `MainPipeline`:
  - Итерирует `state.runningToolCalls` (Map с messageId, callId, toolName, args, startedAt)
  - Для каждой записи: читает текущий `payloadJson`, подставляет terminal output, вызывает `this.messageManager.update(messageId, agentId, payload, true)`
  - Формат output: для `code_exec` — `{ status: 'error', stdout: '', stderr: '', stdout_truncated: false, stderr_truncated: false, error: { code: 'internal_error', message: 'Retried due to model error.' } }`; для прочих — `{ status: 'error', content: 'Retried due to model error.' }`
  - После update очищает entry из `state.runningToolCalls`
- [ ] **2.2** Вызвать `finalizeRunningToolCallsForAttempt` в `handleAttemptFailure()` перед циклом `setHidden` (строка ~1397)

### Фаза 3: Реализация — Startup reconciliation (Gap 2)

- [ ] **3.1** Добавить метод `MessagesRepository.listStaleToolCalls(): Message[]`
  - SQL: `SELECT * FROM messages WHERE done=false AND kind='tool_call' AND agentId IN (SELECT agentId FROM agents WHERE userId=<currentUser>)`
  - Возвращает все stale tool_call rows (включая `hidden=true`)
- [ ] **3.2** Добавить метод `MessageManager.finalizeAllStaleToolCallsOnStartup(): void`
  - Вызывает `MessagesRepository.listStaleToolCalls()`
  - Для каждой `kind:tool_call` записи: parse payload, set terminal output по toolName (status: `cancelled`), update `payloadJson` + `done=true` через `MessagesRepository.update()`
  - **Не emit'ить `MessageUpdatedEvent`** — renderer ещё не подключён, читает из БД при загрузке (см. Q2)
  - Logging: `this.logger.info(...)` с количеством обработанных записей
- [ ] **3.3** Вызвать startup reconciliation в `src/main/index.ts`:
  - Место: после `userManager.initialize()` + `lifecycleManager.initialize()`, до `appCoordinator.start()` (строка ~378)
  - Условие: `userManager.getCurrentUserId()` не null
  - Вызов: `messageManager.finalizeAllStaleToolCallsOnStartup()`

### Фаза 4: Unit-тесты

- [ ] **4.1** `tests/unit/agents/MainPipeline.test.ts`:
  - Тест: при retry через `InvalidFinalAnswerContractError` (orphaned tool_call) running `tool_call` записи обновляются до `done=true` и `output.status='error'` перед `setHidden`
  - Тест: при retry через timeout running `tool_call` записи финализируются
  - Тест: при retry через silent-failure running `tool_call` записи финализируются
  - Тест: `code_exec` tool_call получает output с `stdout/stderr/error`
  - Тест: non-code_exec tool_call получает output с `{ status, content }`
  - Тест: если `state.runningToolCalls` пуст — no-op, без ошибок

- [ ] **4.2** `tests/unit/agents/MessageManager.test.ts`:
  - Тест: `finalizeAllStaleToolCallsOnStartup()` финализирует visible stale `tool_call` (`hidden=false, done=false`) — payload содержит `cancelled` output, `done=true`
  - Тест: `finalizeAllStaleToolCallsOnStartup()` финализирует hidden stale `tool_call` (`hidden=true, done=false`) — payload содержит `cancelled` output, `done=true`
  - Тест: не трогает уже terminal `tool_calls` (`done=true`)
  - Тест: работает корректно без stale записей (no-op)
  - Тест: `code_exec` получает `cancelled` output с `stdout/stderr` полями
  - Тест: non-code_exec получает `{ status: 'cancelled', content }` output
  - Тест: не emit'ит `MessageUpdatedEvent` (events bus пуст после вызова)

### Фаза 5: Валидация

- [ ] Прогнать `npm run validate` (TypeScript, ESLint, Prettier, unit tests, coverage)
- [ ] Убедиться, что все новые и существующие тесты проходят
- [ ] Обновить coverage table в `design.md`

### Фаза 6: Functional tests

- [ ] Запросить подтверждение пользователя перед `npm run test:functional`

---

## Риски и решения

| Риск | Решение |
|------|---------|
| `handleAttemptFailure` в hot path retry — доп. DB writes | `state.runningToolCalls` обычно 0-1 записей, minimal overhead |
| Startup reconciliation конфликтует с активным pipeline | При старте pipeline controllers пусты — нет активных pipelines — безопасно |
| `finalizeStaleToolCalls` из #88 пересекается | Не пересекается: #88 работает at message-time для visible rows; #87 добавляет at startup-time (включая hidden) и at retry-time (в памяти) |
| `AgentsRepository.list()` не включает archived agents | Stale tool_calls в archived agents не блокируют UI (archived не видны в sidebar), но засоряют БД. Startup reconciliation фильтрует по `userId`, а не по `archivedAt` — захватит и archived agents |

---

## Открытые вопросы

### Q1. Stale `kind:llm` с `done=false, hidden=false` при kill процесса

**Контекст.** `computeAgentStatus()` (`AgentManager.ts:48`) возвращает `IN_PROGRESS` для `kind:llm, done=false`. Если `kind:llm` остаётся visible и `done=false` после рестарта — тот же бесконечный spinner, что и с `tool_call`.

**Когда это может произойти.** Только при принудительном завершении процесса (kill, crash, OOM). Во всех штатных сценариях `handleRunError` (`MainPipeline.ts:2064`) и `cancelActivePipelineAndNormalizeTail` (`AgentIPCHandlers.ts:385`) вызывают `hideAndMarkIncomplete()`, которое ставит `hidden=true` на in-flight `kind:llm`. Штатная отмена тоже проходит через этот путь. Единственный edge case — процесс убит между созданием `kind:llm` (`done=false`) и его финализацией (`done=true` или `hidden=true`).

**Вероятность.** Низкая, но ненулевая: Electron на macOS может быть убит Activity Monitor, OOM killer, force-quit через Cmd+Q во время стриминга.

**Стоимость включения.** Минимальная — startup reconciliation уже итерирует все messages с `done=false`, достаточно расширить фильтр с `kind='tool_call'` на `kind IN ('tool_call', 'llm')`. Для `kind:llm` действие: `hidden=true, done=false` (аналогично `hideAndMarkIncomplete`), чтобы `getLatestVisibleMessage` пропустил её и вычислил статус от предыдущего видимого сообщения.

**Различие в обработке `kind:llm` vs `kind:tool_call`:**
- `tool_call`: ставим `done=true` + terminal output payload (`cancelled`), потому что consumer (следующий model step) ожидает terminal status.
- `llm`: ставим `hidden=true`, `done` остаётся `false` (как в `hideAndMarkIncomplete`). Payload не меняется — это прерванный стрим, он не участвует в replay.

**Риск.** Нет — `kind:llm` с `hidden=true` уже поддерживается всюду (`listForModelHistory` фильтрует, `getLatestVisibleMessage` fallback'ит на предыдущее видимое).

**Предложение: вынести в отдельный issue.** Stale `kind:llm` при kill процесса связан с более широкой функциональностью продолжения работы в чатах при перезагрузке приложения. Решать вместе с ней.

---

### Q2. Emit `MessageUpdatedEvent` при startup finalization

**Контекст.** Startup reconciliation вызывается в `index.ts` до `appCoordinator.start()` и до `authWindowManager.initializeApp()`. На этом этапе:
- Renderer ещё не создан (main window создаётся внутри `authWindowManager.initializeApp()`).
- `MainEventBus` уже создан, но никто не подписан на IPC-relay.
- Events будут emit'ены в пустоту и собраны GC.

**Вопрос:** нужно ли emit'ить `MessageUpdatedEvent` для каждой обновлённой записи?

**Аргумент за emit:** Единообразие с остальным кодом (все update'ы через `MessageManager.update()` emit'ят events). Если в будущем появится pre-renderer подписчик (например, logger), он автоматически увидит startup cleanup.

**Аргумент против emit:** Renderer при загрузке читает данные из БД напрямую (`agents:list` -> `toEventAgent()` -> `getLatestVisibleMessage()`), а не из event stream. Events уйдут в пустоту. Emit создаёт ложное впечатление, что кто-то их обработает. Дополнительные DB reads (getById для каждой записи после update) без пользы.

**Последствия если не emit'ить:**
- UI корректен: renderer при первом рендере читает уже финализированные записи из БД.
- `EventLogger` не залогирует startup cleanup — но можно добавить `this.logger.info(...)`.
- Если в будущем добавится pre-renderer consumer events — нужно будет пересмотреть.

**Предложение: не emit'ить.** Использовать `MessagesRepository` напрямую (без `MessageManager.update()`), обновляя `payloadJson` + `done` / `hidden` в одном DB write per row. Logger message в `MessageManager.finalizeAllStaleToolCallsOnStartup()` достаточно. Пересмотр — отдельный issue #93.

---

### Q3. Функциональный тест на app-restart recovery

**Контекст.** Функциональные тесты (`tests/functional/`) запускают реальный Electron, занимают ~30 минут суммарно. Новый тест на app-restart recovery потребует:
1. Запустить приложение.
2. Отправить сообщение, дождаться `tool_call(running)` в БД.
3. Принудительно убить процесс (kill).
4. Перезапустить приложение.
5. Проверить, что `tool_call` финализирован и чат не в `IN_PROGRESS`.

**Сложность.** Шаги 3-4 нестандартны для текущей Playwright-инфраструктуры: `electronApp.close()` делает graceful shutdown (запускает `will-quit` handlers), а нужен `process.kill(pid, 'SIGKILL')`. Кроме того, нужно перезапустить Electron с тем же user profile (БД), что требует кастомной настройки data path.

**Стоимость.** Высокая: ~2-3 часа на инфраструктуру restart-тестов + сам тест. Непропорционально scope issue #87.

**Покрытие без функционального теста.** Unit-тесты (фаза 4) покрывают:
- `finalizeRunningToolCallsForAttempt` — все retry-сценарии.
- `finalizeAllStaleToolCallsOnStartup` — DB-уровень reconciliation (visible + hidden rows).
- Существующие функциональные тесты (`llm-chat.spec.ts`, `code_exec.spec.ts`) проверяют error recovery при штатных ошибках.

**Предложение: не включать в scope #87.** Создать отдельный issue для restart-recovery functional test как tech debt, когда/если инфраструктура для restart-тестов будет нужна другим задачам. Заведён issue #94.
