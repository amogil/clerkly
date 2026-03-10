# Список Задач: code_exec

## Обзор

Цель: реализовать безопасное выполнение JavaScript-кода моделью через `code_exec` в изолированной sandbox-среде.

**Текущий статус:** Фаза 2 — Main/Sandbox архитектура (ожидает реализации)

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

### В Работе
- 🔄 Фаза 2: Подготовка к реализации main/sandbox runtime.

### Запланировано

#### Фаза 2: Main/Sandbox архитектура

- [ ] Реализовать `SandboxSessionManager` для lifecycle sandbox runtime.
  - [ ] Создание отдельной sandbox-инстанции на каждый вызов `code_exec` (one-call-one-sandbox).
  - [ ] Timeout/cancel/cleanup политика.
- [ ] Добавить sandbox preload bridge с whitelist API.
- [ ] Добавить policy-валидации main process для sandbox запросов.

#### Фаза 3: LLM и pipeline интеграция

- [ ] Добавить `code_exec` в prompt/tool layer.
- [ ] Интегрировать `code_exec` в `MainPipeline`.
  - [ ] Persist start/update/final lifecycle для `kind: tool_call` с `toolName='code_exec'`.
  - [ ] Нормализация статусов `running/success/error/timeout` и кодов ошибок (`error.code`, включая `policy_denied`).

#### Фаза 4: Тестирование

- [ ] Добавить unit-тесты main/runtime/pipeline слоёв.
- [ ] Добавить functional-тесты `code_exec.spec.ts`.
- [ ] Покрыть success/error/timeout/cancel/policy-denied сценарии.

**DoD: обязательные functional тесты `code_exec`:**
- [ ] `should execute JavaScript via code_exec tool call`
- [ ] `should process multiple code_exec calls in one turn`
- [ ] `should deny access to non-whitelisted sandbox APIs`
- [ ] `should deny main-pipeline-only tools from sandbox JavaScript`
- [ ] `should allow only tools from sandbox allowlist`
- [ ] `should return error with code policy_denied for forbidden API access`
- [ ] `should timeout long-running code_exec execution`
- [ ] `should cancel active code_exec execution (message becomes hidden)`
- [ ] `should return console output to model after code_exec`
- [ ] `should enforce code_exec payload and output size limits`
- [ ] `should enforce code_exec per-agent concurrency and rate limits`
- [ ] `should persist code_exec lifecycle and update via message snapshots`

**DoD: обязательные unit тесты `code_exec`:**
- [ ] `MainPipeline`: persist lifecycle `running -> terminal (success/error/timeout)` для `tool_call(code_exec)`.
- [ ] `MainPipeline`: отмена `code_exec` скрывает сообщение через `hidden=true` без отдельного статуса `cancelled`.
- [ ] `MainPipeline`: mapping ошибок в фиксированный словарь `error.code`.
- [ ] `SandboxSessionManager`: timeout enforcement и корректная остановка исполнения.
- [ ] `SandboxBridge`: allowlist enforcement + `policy_denied` для запрещённых API.
- [ ] `SandboxRuntime`: разделение `stdout`/`stderr` и сбор `console.*`.
- [ ] Output limiter: truncation + `stdout_truncated`/`stderr_truncated` флаги.
- [ ] Output limiter: лимит сериализованного `returnValue` (`1048576` bytes) с ошибкой `limit_exceeded`.
- [ ] Persist mapper: audit-поля `started_at`, `finished_at`, `duration_ms`.

#### Фаза 5: DB-миграция и backfill для `code_exec`

- [ ] Добавить DB-миграцию для persisted `tool_call(code_exec)`:
  - [ ] Backfill `output.stdout_truncated=false` и `output.stderr_truncated=false` для legacy-записей.
  - [ ] Backfill `output.started_at`, `output.finished_at`, `output.duration_ms` для legacy-записей.
- [ ] Добавить unit-тесты миграции/backfill.
- [ ] Добавить functional smoke-тест совместимости чтения legacy `tool_call(code_exec)` без новых полей.

#### Фаза 6: Синхронизация UI-спеков

- [x] Обновить `docs/specs/agents/*` требования/дизайн для визуализации `code_exec`.
- [x] Проверить согласованность `code_exec` и `agents` по границам ответственности.
- [x] Синхронизировать `docs/specs/llm-integration/*` по `toolName="code_exec"` (без смены контрактов `kind`).

#### Фаза 7: Валидация

- [ ] Запустить `npm run validate`.
- [ ] После подтверждения пользователя запустить `npm run test:functional`.

#### Фаза 8: UI follow-up по `Final Answer` (перенесено из `llm-integration/tasks.md`)

- [ ] Обновить renderer-компонент `Final Answer`: выровнять текст checklist-пункта по вертикальному центру относительно зелёной иконки `Check`.
- [ ] Добавить/обновить unit-тест `AgentMessage` на корректное выравнивание контента пункта `message-final-answer-item`.
- [ ] Добавить/обновить functional-тест рендера `Final Answer`, проверяющий визуальную геометрию пункта (иконка и текст выровнены строго по вертикальному центру).
