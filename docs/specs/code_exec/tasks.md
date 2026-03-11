# Список Задач: code_exec

## Обзор

Цель: реализовать безопасное выполнение JavaScript-кода моделью через `code_exec` в изолированной sandbox-среде.

**Текущий статус:** Фаза 8 — Gap Closure (реализация завершена, ожидается только полный `npm run test:functional` по подтверждению пользователя)

---

## КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

- Нельзя ослаблять безопасность sandbox ради функциональности.
- Нельзя давать sandbox прямой доступ к Node.js, ФС, сети или БД.
- Нельзя ломать текущие контракты `llm/tool_call/error/final_answer`.
- Нельзя отключать тесты через `.skip()`/`.only()`.

---

## Текущее Состояние

### Выполнено
- ✅ Подготовлен первичный анализ issue #52 и контекста текущей архитектуры.
- ✅ Создана новая спецификация `docs/specs/code_exec/`.
- ✅ Синхронизированы `docs/specs/agents/*` по UI-контракту `tool_call(code_exec)`.
- ✅ Синхронизированы `docs/specs/llm-integration/*` по явной привязке `toolName="code_exec"` без изменения message kind.
- ✅ Устранены противоречия по рендеру `final_answer` между `realtime-events` и `agents`.
- ✅ Реализован `SandboxSessionManager` (one-call-one-sandbox, timeout/cancel/cleanup, shutdown cleanup).
- ✅ Добавлен `code_exec` в prompt/tool layer и системные инструкции модели.
- ✅ Интегрирован `code_exec` в `MainPipeline` с persisted lifecycle `running -> terminal` для `kind: tool_call`.
- ✅ Добавлена нормализация `code_exec` статусов и ошибок (`success/error/timeout/cancelled`, `policy_denied/limit_exceeded/...`).
- ✅ Реализован validation/retry контракт tool calls с `maxRetries=2` и совместимостью с `final_answer`.
- ✅ Обновлены `PromptBuilder` и `MessageManager.listForModelHistory` на terminal-only replay для `tool_call`.
- ✅ Добавлена сериализация terminal `tool_call` в AI SDK tool-result формат (`toolCallId/toolName/result`).
- ✅ Добавлены и обновлены unit-тесты по `code_exec` и интеграции pipeline/history/UI.
- ✅ Добавлен functional-файл `tests/functional/code_exec.spec.ts` (базовые сценарии рендера и статуса агента).
- ✅ Добавлены `SandboxBridge`/`SandboxPolicy` и интеграция policy-allowlist + browser-level egress hardening в sandbox session.
- ✅ Добавлен `CodeExecPersistenceMapper` и подключён в `MainPipeline` для записи terminal payload по единому контракту.
- ✅ Расширены functional-тесты `code_exec.spec.ts` и `llm-chat.spec.ts` для history/continuation/limits/policy сценариев.
- ✅ Добавлен functional-сценарий `invalid code_exec args -> bounded retry/repair -> persisted kind:error`.
- ✅ Добавлены functional-сценарии по параллельным `code_exec` вызовам (`callId` correlation) и audit lifecycle-полям terminal результата.
- ✅ Добавлены functional-сценарии browser-level egress deny для `fetch`/`XMLHttpRequest`/`WebSocket`/`navigator.sendBeacon` без исходящего запроса.
- ✅ Добавлен сценарий `limit_exceeded` для memory-heavy `code_exec` с продолжением pipeline.
- ✅ Обновлены `SandboxSessionManager` и unit-тесты для нормализации memory-limit ошибок в `error.code=limit_exceeded`.
- ✅ Синхронизированы `code_exec` requirements/design с фактической реализацией lifecycle и resource-limit semantics.
- ✅ Запущен `npm run validate` (успешно).
- ✅ Закрыт reviewer comment по `invalid_tool_arguments`: зафиксировано, что `code_exec` не запускается, `tool_call(code_exec)` не создаётся и ошибка возвращается как model response validation error.
- ✅ Унифицирован invalid-tool-args flow в `MainPipeline`: validation-feedback передаётся модели на retry, persisted `tool_call` не создаётся для невалидных аргументов, при исчерпании retry создаётся только `kind:error`.
- ✅ Добавлены unit-тесты `MainPipeline` на отсутствие persist `tool_call` при invalid args и на retry-feedback в последующие provider-вызовы.
- ✅ Добавлены unit-тесты для `scripts/inject-oauth-client-secret.js` (env, `.env` fallback, non-strict pass-through, strict fail-fast, placeholder warning).
- ✅ Синхронизированы `llm-integration/code_exec/google-oauth-auth` requirements/design и coverage-матрицы с новым контрактом.

### В Работе
- 🔄 Ожидает отдельного запуска полного `npm run test:functional` по подтверждению пользователя.

### Запланировано

#### Фаза 2: Main/Sandbox архитектура

- [x] Реализовать `SandboxSessionManager` для lifecycle sandbox runtime.
  - [x] Создание отдельной sandbox-инстанции на каждый вызов `code_exec` (one-call-one-sandbox).
  - [x] Timeout/cancel/cleanup политика.
- [x] Добавить sandbox preload bridge с whitelist API.
- [x] Добавить policy-валидации main process для sandbox запросов.
- [x] Реализовать browser-level egress enforcement (требования `code_exec.2.3.1-2.3.2`) с явной трассировкой `control -> verification`.
  - [x] `session.webRequest` deny для исходящих `http/https/ws/wss` и связанных egress-каналов до отправки запроса.
  - [x] Navigation/Open hardening: `setWindowOpenHandler(deny)` + блокировка `will-navigate`/`will-redirect`.
  - [x] Permission hardening: deny в `setPermissionRequestHandler` и `setPermissionCheckHandler`.
  - [x] Runtime hardening bridge/preload: блокировка `fetch`/`XMLHttpRequest`/`WebSocket`/`navigator.sendBeacon` с нормализацией в `status=error`, `error.code=policy_denied`.
  - [x] Runtime hardening navigation API: `window.open`/`location.assign`/`location.replace` должны давать terminal `policy_denied`, а не silent deny.
  - [x] CSP hardening sandbox-документа: `connect-src 'none'` и запрет внешних источников для сетевых подключений.

#### Фаза 3: LLM и pipeline интеграция

- [x] Добавить `code_exec` в prompt/tool layer.
- [x] Интегрировать `code_exec` в `MainPipeline`.
  - [x] Persist start/update/final lifecycle для `kind: tool_call` с `toolName='code_exec'`.
  - [x] Нормализация статусов `running/success/error/timeout/cancelled` и кодов ошибок по фиксированному словарю.
  - [x] Реализовать общий validation/retry контракт tool calls для `code_exec` (schema validation → feedback модели → bounded retry/repair `maxRetries=2` → при исчерпании обычный `kind:error` в чате, не `tool_call`-ошибка).
  - [x] Унифицировать этот же validation/retry flow для уже реализованного `final_answer` и остальных tool calls без расхождений по типу финальной ошибки.
  - [x] Мигрировать `PromptBuilder`/`MessageManager.listForModelHistory` на новую логику: terminal-результаты всех `tool_call` (`final_answer`, `code_exec`, включая `cancelled/error`) включаются в model history; non-terminal не включаются.
  - [x] Реализовать сериализацию terminal `tool_call` в AI SDK tool-result формат для model history (`toolCallId`, `toolName`, `result`).
  - [x] Гарантировать немедленный переход к следующему шагу `model` после terminal `tool_call` любого статуса (`success/error/timeout/cancelled`) в цикле `model -> tools -> model`.
  - [x] Выполнить проверку совместимости с уже реализованным `final_answer`: существующие persisted `tool_call(final_answer)` должны корректно участвовать в model history без скрытия и без миграции схемы БД.

#### Фаза 4: Тестирование

- [x] Добавить unit-тесты main/runtime/pipeline слоёв.
- [x] Переименовать functional test-файл под каноничное имя `tests/functional/code_exec.spec.ts` (если в коде ещё используется старое имя) и обновить все ссылки/запуски.
- [x] Добавить/обновить functional-тест `code_exec.spec.ts`: невалидные аргументы `code_exec` → bounded retry/repair → финальный `kind:error` в чате.
- [x] Зафиксировать в requirements/design трассировку для `invalid_tool_arguments`: без запуска `code_exec`, без persisted `tool_call(code_exec)`, с ошибкой валидации ответа модели.
- [x] Добавить/обновить functional-тест `code_exec.spec.ts`: лимит входного кода `30 KiB` и ожидаемая ошибка валидации.
- [x] Добавить/обновить functional-тест `code_exec.spec.ts`: лимиты `stdout/stderr` по `10 KiB` и корректные флаги truncation.
- [x] Добавить/обновить functional-тест `code_exec.spec.ts`: для `window.open`/`location.assign`/`location.replace` возвращается terminal `policy_denied` (без silent deny и без исходящего запроса).
- [x] Добавить/обновить functional-тест `llm-chat.spec.ts`: включение terminal tool results (`final_answer`, `code_exec`, включая `error/timeout/cancelled`) в model history в AI SDK tool-result формате.
- [x] Добавить/обновить functional-тест `llm-chat.spec.ts`: non-terminal `tool_call` (`running`) не попадает в model history.
- [x] Добавить/обновить functional-тест `llm-chat.spec.ts`: после terminal `tool_call` любого статуса pipeline немедленно продолжает следующий шаг `model`.
- [x] Покрыть полный набор сценариев по детальному тест-плану из `docs/specs/code_exec/design.md` (раздел "Стратегия тестирования").
- [x] Обновить детальную матрицу покрытия по `code_exec.6.6` в `docs/specs/code_exec/design.md` после добавления/изменения тестов.
- [x] Выполнять тестовую реализацию в порядке: сначала unit, затем functional.

#### Фаза 5: Синхронизация UI-спеков

- [x] Обновить `docs/specs/agents/*` требования/дизайн для визуализации `code_exec`.
- [x] Проверить согласованность `code_exec` и `agents` по границам ответственности.
- [x] Синхронизировать `docs/specs/llm-integration/*` по `toolName="code_exec"` (без смены контрактов `kind`).

#### Фаза 6: Валидация

- [x] Запустить `npm run validate`.
- [ ] После подтверждения пользователя запустить `npm run test:functional`.

#### Фаза 7: Resource Degraded Mode (SHALL)

- [x] Вернуть в `docs/specs/code_exec/requirements.md` и `design.md` обязательное требование degraded/throttled режима при приближении к CPU/RAM лимитам.
- [x] Реализовать monitor loop в `SandboxSessionManager` (интервал `monitorIntervalMs`) с best-effort containment.
- [x] Добавить обязательный диагностический сигнал в `stderr` при успешном завершении вызова в degraded режиме.
- [x] Сохранить terminal fallback: при невозможности удержать лимиты завершать вызов с `status=error`, `error.code=limit_exceeded`.
- [x] Добавить/обновить unit-тесты на degraded path и containment-fail path (`limit_exceeded`).
- [x] Добавить/обновить functional-тест на наличие degraded/throttled сигнала в `stderr`.
- [x] Обновить таблицу покрытия требований в `docs/specs/code_exec/design.md` после реализации.

#### Фаза 8: Invalid Tool Arguments (System Target Behavior)

- [x] Привести runtime-логику `MainPipeline` к единому контракту: schema/contract validation любого `tool_call` до создания persisted `kind: tool_call`.
- [x] Гарантировать, что при `invalid_tool_arguments` не создаются `message.created/message.updated` для `kind: tool_call` и не появляется запись инструмента в истории чата.
- [x] Сохранить текущий retry/repair flow (`maxRetries=2`) с возвратом диагностики в модель на каждой невалидной попытке.
- [x] Явно реализовать/документировать канал передачи validation-feedback модели между retry-попытками для невалидных аргументов (чтобы retry был не только повтором без диагностического контекста).
- [x] Гарантировать terminal fallback: при исчерпании retry/repair создавать только `kind:error` (без terminal `tool_call`).
- [x] Унифицировать поведение для обоих инструментов в текущем scope (`final_answer`, `code_exec`) без специальных исключений.
- [x] Заменить технически вводящее в заблуждение именование retry-exhaustion ошибки (`FinalAnswerRetryExhaustedError`) на общее для всех tool calls и синхронизировать тексты/ветки обработки.
- [x] Устранить расхождение `code_exec` контракта ошибок: согласовать `code_exec.3.1.2.2.1` с runtime/тестами (`SandboxSessionManager` сейчас возвращает `invalid_tool_arguments` при прямом вызове), зафиксировав единый boundary (pipeline-level vs tool-runtime-level).
- [x] Уточнить вводное требование `code_exec` (`requirements.md`, пункт 0/введение): persisted `tool_call(code_exec)` создаётся только для валидных вызовов, прошедших pre-execution validation.
- [x] Добавить/обновить unit-тесты `tests/unit/agents/MainPipeline.test.ts` на отсутствие persist `tool_call` при невалидных аргументах и на `kind:error` после retry-limit.
- [x] Добавить/обновить unit-тесты `tests/unit/agents/MainPipeline.test.ts` на отсутствие `message.created/message.updated(kind:tool_call)` при невалидных аргументах на всех retry-попытках.
- [x] Добавить/обновить functional-тесты `tests/functional/llm-chat.spec.ts` и `tests/functional/code_exec.spec.ts`: invalid args не создают `tool_call` в чате/истории на всех попытках.
- [x] Усилить существующий `tests/functional/code_exec.spec.ts` сценарий invalid args: проверять отсутствие любых persisted `tool_call(code_exec)` (не только отсутствие terminal `success`).
- [x] Добавить/обновить functional-сценарий для `final_answer`: invalid arguments не создают persisted `tool_call(final_answer)` и завершаются `kind:error` после retry-limit.
- [x] Обновить матрицы покрытия в `docs/specs/llm-integration/design.md` и `docs/specs/code_exec/design.md` с явной трассировкой этого контракта.
- [x] Обновить `docs/specs/llm-integration/design.md` coverage-table строкой `llm-integration.11.2.3.3` и привязать к конкретным тестам.
- [x] Сверить текстовые названия функциональных тестов в requirements/design с фактическими тест-кейсами в `tests/functional/llm-chat.spec.ts` и `tests/functional/code_exec.spec.ts`.
- [x] Прогнать `npm run validate`.
- [ ] После подтверждения пользователя прогнать полный `npm run test:functional`.

#### Фаза 9: OAuth Build Injection Validation

- [x] Добавить unit-тесты для `scripts/inject-oauth-client-secret.js`: чтение `CLERKLY_OAUTH_CLIENT_SECRET` из `process.env`, fallback из `.env`, pass-through в non-strict и fail-fast в strict-режиме при отсутствии значения.
- [x] Добавить тест-кейс на отсутствие placeholder в build output (скрипт не падает, но логирует warning) и зафиксировать это поведение в `docs/specs/google-oauth-auth/design.md`.
