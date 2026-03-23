# Документ Требований: sandbox-web-search

## Введение

Данный документ описывает требования к helper-у `web_search`, доступному в sandbox-коде через `code_exec`.
Helper НЕ задаёт единый кросс-провайдерный search-контракт. Вместо этого helper передаёт модели нативный контракт web search инструмента активного LLM-провайдера.
Фича ограничена sandbox/runtime-уровнем и НЕ вводит отдельный main-pipeline tool call `web_search`.

## Глоссарий

- **Web Search Helper** — helper `web_search`, вызываемый из sandbox-кода через `tools.web_search(...)`
- **Provider-native Contract** — вход/выход web search в формате активного провайдера (OpenAI / Anthropic / Gemini)
- **Active Provider** — текущий LLM-провайдер, выбранный в настройках агента
- **Tool Call Message** — persisted сообщение `kind: tool_call` (в данном контексте lifecycle остаётся на `toolName = "code_exec"`)

## Требования

### 1. Доступность helper-а в sandbox

**ID:** sandbox-web-search.1

**User Story:** Как пользователь, я хочу, чтобы агент мог выполнять web search из sandbox-кода, используя возможности текущего провайдера.

#### Критерии Приемки

1.1. Система ДОЛЖНА предоставлять sandbox-коду helper `web_search`.

1.2. Helper `web_search` ДОЛЖЕН вызываться из sandbox-кода через bridge/allowlist, а НЕ как отдельный main-pipeline tool call.

1.3. Helper `web_search` ДОЛЖЕН быть асинхронным API и ДОЛЖЕН использоваться через `await`.

1.4. В рамках одного выполнения `code_exec` sandbox-код МОЖЕТ вызывать helper `web_search` несколько раз.

1.5. Prompt/tool-инструкция для модели ДОЛЖНА явно описывать, что helper использует provider-native web search контракт активного провайдера.

1.6. КОГДА активный провайдер не предоставляет web search capability, helper `web_search` НЕ ДОЛЖЕН публиковаться в списке доступных sandbox tools.

1.7. КОГДА sandbox-код вызывает `tools.web_search(...)`, но helper не зарегистрирован для текущего провайдера (не прошёл capability check), ТО sandbox runtime ДОЛЖЕН возвращать ошибку `policy_denied`. Реальный путь: helper исключается из sandbox allowlist (требование 1.6), и sandbox-скрипт возвращает стандартную ошибку `policy_denied: Tool is not allowed in sandbox allowlist.` (определено в `code_exec` требовании 2.8.1). Дополнительно, `SandboxSessionManager.handleSandboxToolInvocation` содержит defense-in-depth guard, возвращающий `policy_denied`, если вызов всё же дойдёт до main process.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should allow sandbox code to call tools.web_search"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real OpenAI and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Anthropic and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Google and return non-stub payload"

### 2. Контракт helper-а

**ID:** sandbox-web-search.2

**User Story:** Как разработчик, я хочу, чтобы helper отражал нативный контракт активного провайдера, чтобы не терять провайдерные возможности и семантику.

#### Критерии Приемки

2.1. Helper `web_search` ДОЛЖЕН принимать вход в формате provider-native контракта активного провайдера.

2.2. Helper `web_search` SHALL NOT навязывать единый кросс-провайдерный входной schema поверх provider-native контракта.

2.3. КОГДА активный провайдер — OpenAI, ТО helper ДОЛЖЕН использовать нативный контракт web search OpenAI.

2.4. КОГДА активный провайдер — Anthropic, ТО helper ДОЛЖЕН использовать нативный контракт web search Anthropic.

2.5. КОГДА активный провайдер — Gemini, ТО helper ДОЛЖЕН использовать нативный контракт google_search/grounding Gemini.

2.6. КОГДА вход helper-а невалиден относительно provider-native контракта активного провайдера, ТО helper ДОЛЖЕН возвращать structured error `invalid_input`.

2.7. КОГДА все переданные запросы (queries/query) пусты или содержат только пробельные символы после trim, ТО helper ДОЛЖЕН возвращать structured error `invalid_input` для всех провайдеров (OpenAI, Anthropic, Google).

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should allow sandbox code to call tools.web_search"
- `tests/functional/code_exec.spec.ts` — "should execute anthropic web_search helper against mocked provider endpoint"
- `tests/functional/code_exec.spec.ts` — "should execute google web_search helper against mocked provider endpoint"
- `tests/functional/code_exec.spec.ts` — "should return invalid_input for provider-native validation failure"
- `tests/functional/code_exec.spec.ts` — "should return invalid_input for Anthropic whitespace-only query in web_search helper"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real OpenAI and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Anthropic and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Google and return non-stub payload"

### 3. Выходной контракт

**ID:** sandbox-web-search.3

**User Story:** Как разработчик, я хочу получать provider-native результат helper-а без кросс-провайдерной нормализации.

#### Критерии Приемки

3.1. КОГДА `web_search` завершается успешно, ТО helper ДОЛЖЕН возвращать provider-native payload результата активного провайдера.

3.2. Helper SHALL NOT требовать универсальные поля результата (например, общий `results[].title/url/snippet`) для всех провайдеров.

3.3. Helper MAY оборачивать provider-native payload в стабильный runtime envelope верхнего уровня:
- `provider` — идентификатор активного провайдера;
- `output` — provider-native payload.

3.4. ЕСЛИ runtime envelope используется, ТО helper ДОЛЖЕН сохранять provider-native payload без потери семантически значимых полей.

3.5. Helper MAY включать диагностический объект `meta`, если это не изменяет provider-native payload в `output`.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should allow sandbox code to call tools.web_search"
- `tests/functional/code_exec.spec.ts` — "should execute anthropic web_search helper against mocked provider endpoint"
- `tests/functional/code_exec.spec.ts` — "should execute google web_search helper against mocked provider endpoint"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real OpenAI and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Anthropic and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Google and return non-stub payload"

### 4. Ошибки и capability fallback

**ID:** sandbox-web-search.4

**User Story:** Как пользователь, я хочу предсказуемую обработку ошибок helper-а, чтобы диалог не ломался.

#### Критерии Приемки

4.1. Ошибки helper-а ДОЛЖНЫ возвращаться в structured формате (`error.code`, `error.message`).

4.2. Поле `error.code` ДОЛЖНО использовать значения:
- `invalid_input`
- `provider_error`
- `timeout`
- `internal_error`
- `policy_denied` (при вызове helper-а, не зарегистрированного для текущего провайдера)

4.3. Helper `web_search` SHALL NOT выполнять автоматический retry внутри handler-а; повторные попытки выполняются только внешним оркестратором/кодом вызывающей стороны.

4.4. Ошибка helper-а НЕ ДОЛЖНА приводить к crash main process или sandbox process.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should surface tools.web_search runtime error without pipeline crash"

### 5. Persisted/runtime поведение

**ID:** sandbox-web-search.5

**User Story:** Как разработчик, я хочу чтобы `web_search` работал внутри lifecycle `code_exec`, без отдельного persisted канала.

#### Критерии Приемки

5.1. Вызов helper-а `web_search` НЕ ДОЛЖЕН создавать отдельное persisted сообщение `kind: tool_call` с `toolName = "web_search"`.

5.2. Persisted lifecycle ДОЛЖЕН оставаться в рамках существующего `tool_call(code_exec)`.

5.3. Результаты helper-а `web_search` ДОЛЖНЫ быть доступны sandbox-коду как возвращаемое значение helper-а.

5.4. ЕСЛИ `code_exec` завершается terminal-статусом, ТО persisted контракт `tool_call(code_exec)` ДОЛЖЕН оставаться корректным (`kind`, `done`, `reply_to_message_id`).

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should keep persisted lifecycle in code_exec while using tools.web_search"

### 6. Минимальная тест-матрица

**ID:** sandbox-web-search.6

**User Story:** Как разработчик, я хочу минимально достаточный набор тестов для helper-а `web_search`, чтобы изменения были проверяемыми и стабильными.

#### Критерии Приемки

6.1. Unit-тесты ДОЛЖНЫ покрывать:
- роутинг helper-а по активному провайдеру;
- pass-through provider-native входа/выхода;
- mapping ошибок в фиксированный набор `error.code`;
- отсутствие публикации `web_search` в sandbox registry при недоступной provider capability.

6.2. Functional-тесты ДОЛЖНЫ покрывать:
- успешный вызов `tools.web_search(...)` для активного провайдера;
- provider-native validation failure;
- runtime-сбой provider-helper path без crash pipeline;
- отсутствие отдельного persisted `tool_call(web_search)`.

6.3. Отсутствие `tools.web_search` в runtime при недоступной provider capability покрывается unit-тестами (`SandboxSessionManager.test.ts`, `ProviderMethodRegistry.test.ts`).

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should allow sandbox code to call tools.web_search"
- `tests/functional/code_exec.spec.ts` — "should execute anthropic web_search helper against mocked provider endpoint"
- `tests/functional/code_exec.spec.ts` — "should execute google web_search helper against mocked provider endpoint"
- `tests/functional/code_exec.spec.ts` — "should return invalid_input for provider-native validation failure"
- `tests/functional/code_exec.spec.ts` — "should return invalid_input for Anthropic whitespace-only query in web_search helper"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real OpenAI and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Anthropic and return non-stub payload"
- `tests/functional/code_exec-real.spec.ts` — "should execute tools.web_search against real Google and return non-stub payload"
