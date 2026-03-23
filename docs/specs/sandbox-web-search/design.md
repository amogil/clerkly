# Дизайн: sandbox-web-search

## Обзор

`sandbox-web-search` добавляет helper `web_search` для sandbox-кода внутри `code_exec`.
Helper не является отдельным инструментом main LLM tool-loop и не создаёт отдельный `tool_call(web_search)`.
Ключевой принцип дизайна: helper отражает provider-native web search контракт активного провайдера и не выполняет кросс-провайдерную нормализацию payload.

## Архитектура

### Компоненты

- **"SandboxBridge"**
  - проверяет доступность helper-а `web_search` через централизованный allowlist.
- **"SandboxWebSearchHandler"**
  - main-process handler helper-а;
  - получает adapter из provider-method registry;
  - валидирует вход через adapter contract;
  - выполняет вызов через adapter execute;
  - возвращает provider-native output/error.
- **"ProviderMethodRegistry"**
  - хранит capability matrix и adapter registrations;
  - выполняет lookup по `(provider, method)` и runtime capability gating;
  - выполняет fail-fast consistency check capability ↔ adapter registration.
- **"Provider Adapter Layer"**
  - содержит provider-method adapters для OpenAI / Anthropic / Gemini;
  - не унифицирует нативный формат результата между провайдерами.
- **"PromptBuilder" / code_exec prompt section**
  - сообщает модели, что `tools.web_search(...)` использует контракт активного провайдера;
  - не обещает единый cross-provider schema результата.
- **"SandboxSessionManager"**
  - прокидывает helper через sandbox bridge в окружение выполнения `code_exec`.

### Передача provider/apiKey в sandbox runtime

- `provider` и `apiKey` передаются в `SandboxSessionManager.execute()` через closure в `CodeExecFeature.getTools(provider, apiKey)`.
- Сигнатура `LLMTool.execute` остаётся чистой: `(args, signal?) => Promise<unknown>` — без протаскивания provider/apiKey через общий tool interface.
- `MainPipeline.bindToolExecutors` не знает о provider/apiKey — они замкнуты в tool closure на этапе `getTools()`.
- Инъекция credentials в features выполняется через публичный метод `PromptBuilder.forEachFeature(callback)`, без прямого доступа к приватному полю `features`.

### Тестовый backdoor

- Provider adapters НЕ содержат тестовых backdoor-ов в production коде.
- Для тестирования provider_error path используется mock HTTP-сервер (аналогично паттерну `SandboxHttpRequestHandler`).

## Граница ответственности

- `docs/specs/code_exec/*`:
  - общий sandbox runtime, lifecycle `tool_call(code_exec)`, ограничения безопасности.
- `docs/specs/sandbox-web-search/*`:
  - контракт helper-а `web_search` и provider-routing.
- `docs/specs/llm-integration/*`:
  - не регистрирует `web_search` как отдельный top-level tool.

## Контракт данных helper-а

### Вход

Вход helper-а передаётся как provider-native input для активного провайдера.
Helper не вводит общий обязательный provider-agnostic schema.

### Выход

Успешный результат передаётся как provider-native payload.
Допускается стабильный runtime envelope верхнего уровня:

```json
{
  "provider": "openai | anthropic | gemini",
  "output": { "...provider-native payload...": true },
  "meta": {
    "provider": "openai"
  }
}
```

Правила:
- `output` содержит provider-native payload без потери значимых полей;
- helper не требует универсальный shape наподобие `results[].title/url/snippet`;
- `meta` опционален и диагностичен.

### Ошибка

```json
{
  "error": {
    "code": "invalid_input | provider_error | timeout | internal_error | policy_denied",
    "message": "Human-readable message"
  }
}
```

`policy_denied` возвращается через fallback в `SandboxSessionManager.handleSandboxToolInvocation`, когда sandbox-код вызывает helper, не зарегистрированный для текущего провайдера.

## Матрица провайдеров

- **OpenAI**: используется нативный web search контракт OpenAI.
- **Anthropic**: используется нативный web search контракт Anthropic.
  - Каждый запрос к Anthropic API включает `max_tokens: 512` (константа `ANTHROPIC_WEB_SEARCH_MAX_TOKENS`). Ограничение задано для контроля стоимости; основной payload результата передаётся через tool result, а не через текст модели.
- **Gemini**: используется нативный google_search/grounding контракт Gemini.
- **Fallback**: при отсутствии web search capability у активного провайдера helper `web_search` не публикуется в доступный sandbox tool registry.

### Runtime Capability Gating

- По умолчанию capability `web_search` включён для `openai`, `anthropic`, `google`.
- Capability gating определяется декларативно в `ProviderMethodCapabilityMatrix` внутри `ProviderMethodRegistry`.
- Runtime env override отсутствует: capability определяется исключительно декларацией в capability matrix, без переменных окружения.
- Если провайдер не включён в capability matrix, helper не регистрируется в sandbox tools, и вызов `tools.web_search` из sandbox-кода возвращает `policy_denied` (через fallback в `SandboxSessionManager.handleSandboxToolInvocation`).

### Таймаут helper-а

- Timeout для одного provider web_search запроса: `120_000` ms (120 секунд).
- Timeout фиксирован в `SandboxWebSearchHandler` (константа `WEB_SEARCH_TIMEOUT_MS`).
- Prompt guidance сообщает модели, что один запрос web_search может занять до ~120 секунд, и при нескольких запросах нужно выставлять `code_exec.timeout_ms` с запасом.

## Поток выполнения

1. Модель вызывает `code_exec`.
2. Sandbox-код внутри `code_exec` выполняет `await tools.web_search(input)`.
3. `SandboxBridge` проверяет allowlist и делегирует вызов в `SandboxWebSearchHandler`.
4. Handler выполняет lookup adapter-а в `ProviderMethodRegistry` по `(active provider, "web_search")`.
5. Если capability недоступна, helper не регистрируется в sandbox registry для этого запуска.
6. Adapter валидирует input по provider-native правилам.
7. Adapter вызывает provider-specific web search API.
8. Handler возвращает provider-native `output` (или structured `error`).
9. `code_exec` продолжает выполнение и завершает стандартный lifecycle.

## Расширяемость Provider Methods

### Provider Method Onboarding Checklist

1. Добавить новый method в тип `ProviderMethod`.
2. Обновить capability declaration (`provider -> method -> supported`).
3. Реализовать provider adapters с контрактом `validate` + `execute`.
4. Зарегистрировать adapters в `ProviderMethodRegistry`.
5. Убедиться, что fail-fast consistency check проходит на старте runtime.
6. Добавить/обновить unit tests:
   - registry consistency и lookup;
   - adapter contract tests (validation + execute/error mapping).
7. Добавить/обновить functional tests для runtime routing через registry (mock path) и, при необходимости, real-provider path.

## Persisted поведение

- helper `web_search` не создаёт самостоятельных persisted сообщений;
- persisted остаётся только lifecycle `tool_call(code_exec)` (`running -> terminal`);
- результат helper-а используется внутри sandbox-кода и попадает в persisted контекст только через общий output `code_exec`.

## Ошибки и устойчивость

- Ошибки helper-а возвращаются structured-объектом, не вызывая crash.
- Helper не выполняет внутренний automatic retry; retry остаётся ответственностью вызывающего кода/оркестратора.
- Если sandbox-код не обработал ошибку helper-а, итоговый status `code_exec` определяется существующими правилами runtime/normalization.

## Ограничения UI

- Нет прямых UI-кнопок/контролов для `web_search`.
- Пользователь не вызывает helper напрямую; helper доступен только через sandbox-код в `code_exec`.

## Стратегия тестирования

### Модульные тесты

- `tests/unit/code_exec/SandboxBridge.test.ts` — allowlist-валидация `web_search` как допустимого sandbox tool name.
- `tests/unit/code_exec/SandboxWebSearchHandler.test.ts` — provider routing, pass-through input/output, structured errors.
- `tests/unit/code_exec/WebSearchProviderMethodAdapters.test.ts` — provider-specific invocation и mapping ошибок.
- `tests/unit/agents/PromptBuilder.test.ts` — описание provider-native контракта helper-а в prompt-инструкции `code_exec`.

### Функциональные тесты

- `tests/functional/code_exec.spec.ts` — вызов `tools.web_search(...)` из sandbox-кода.
- `tests/functional/code_exec.spec.ts` — provider-native validation failure.
- `tests/functional/code_exec.spec.ts` — корректность persisted lifecycle в рамках `tool_call(code_exec)`.
- `tests/functional/code_exec.spec.ts` — mock-provider e2e для Anthropic web_search adapter path.
- `tests/functional/code_exec.spec.ts` — mock-provider e2e для Google web_search adapter path.
- `tests/functional/code_exec-real.spec.ts` — e2e путь с реальным OpenAI API key и реальным ответом provider web search (без stub payload).
- `tests/functional/code_exec-real.spec.ts` — e2e путь с реальным Anthropic API key и реальным ответом provider web search (без stub payload).
- `tests/functional/code_exec-real.spec.ts` — e2e путь с реальным Google API key и реальным ответом provider web search (без stub payload).

### Покрытие требований

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|------------------|
| sandbox-web-search.1 (1.1-1.5) | ✓ | ✓ |
| sandbox-web-search.1.6 (capability fallback) | ✓ | - (unit only) |
| sandbox-web-search.2 | ✓ | ✓ |
| sandbox-web-search.3 | ✓ | ✓ |
| sandbox-web-search.4 | ✓ | ✓ |
| sandbox-web-search.5 | ✓ | ✓ |
| sandbox-web-search.6 | ✓ | ✓ |
