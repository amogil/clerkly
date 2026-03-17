# Дизайн: Sandbox HTTP Request

## Обзор

`Sandbox HTTP Request` добавляет для `code_exec` helper `http_request`, позволяющий sandbox-коду выполнять HTTP(S)-запросы в стиле JavaScript `fetch` и получать структурированный результат.
Helper доступен в sandbox runtime через allowlist и вызывается через `await`.
Общие ограничения sandbox runtime и security-модель определяются в `docs/specs/code_exec/*`; данный документ описывает контракт `http_request`.

## Архитектура

### Компоненты

- **"SandboxBridge"**
  - использует runtime allowlist для разрешения вызова helper-а из sandbox-кода.
- **"SandboxHttpRequestHandler"**
  - main-process обработчик helper-а;
  - валидирует вход, выполняет ограниченный HTTP-запрос и возвращает структурированный результат.
- **"PromptBuilder" / code_exec prompt section**
  - сообщает модели наличие async helper-а `http_request` и его контракт;
  - формирует компактный reference block с call form, input fields, redirect behavior, result fields и error shape.

### Граница ответственности

- `docs/specs/code_exec/*`:
  - описывает общий sandbox runtime, политику allowlist и общую интеграцию `code_exec`.
- `docs/specs/sandbox-http-request/*`:
  - описывает конкретный helper HTTP-запросов;
  - фиксирует его контракт и ограничения.
- `docs/specs/llm-integration/*`:
  - не описывает данный helper как main-pipeline tool.

## Контракт данных helper-а

### Вход

Входной контракт:

```json
{
  "url": "https://example.com/api",
  "method": "GET",
  "headers": {
    "accept": "application/json"
  },
  "body": "",
  "timeout_ms": 10000,
  "follow_redirects": true,
  "max_response_bytes": 12000
}
```

Правила:
- `url` — обязательная строка, абсолютный `http/https` URL;
- `url` допускает только публичные HTTP(S)-назначения; `localhost`, loopback, private, link-local и другие reserved/internal targets отклоняются до сетевого запроса и перед каждым redirect hop;
- `method` — опциональная строка HTTP-метода, по умолчанию `GET`; допустимые значения: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`;
- `headers` — опциональный объект заголовков со строковыми ключами и строковыми значениями;
- `body` — опциональное строковое тело запроса;
- `body` не допускается для `GET` и `HEAD`;
- `timeout_ms` — опциональный таймаут запроса; default — `10000`, максимум — `180000`;
- `follow_redirects` — опциональный флаг перехода по redirects;
- `max_response_bytes` — опциональный integer в диапазоне `0..262144`;
- максимальное число redirects — `10`;
- внутренний safety cap response body — `262144` bytes;
- helper вызывается через `await tools.http_request({...})`;
- helper может вызываться несколько раз в рамках одного sandbox execution; независимые вызовы могут комбинироваться через `await Promise.all(...)`, если это не нарушает лимиты и policy;
- поведение helper-а должно быть детерминированным.
- в functional test mode `SandboxSessionManager` может передавать explicit test-only loopback allowlist (`127.0.0.1`) для локальных mock HTTP-сервисов тестовой инфраструктуры; этот bypass не применяется в обычном runtime.

### Выход

Результат:

```json
{
  "status": 200,
  "final_url": "https://example.com/api",
  "headers": {
    "content-type": "application/json"
  },
  "content_type": "application/json",
  "body_encoding": "text",
  "truncated": true,
  "applied_limit_bytes": 12000,
  "body": "{\"ok\":true}"
}
```

### Ошибка

Формат ошибки:

```json
{
  "error": {
    "code": "invalid_url | invalid_method | invalid_headers | invalid_body | invalid_timeout | invalid_follow_redirects | invalid_max_response_bytes | forbidden_destination | fetch_failed | internal_error",
    "message": "Human-readable message"
  }
}
```

### Prompt-контракт для модели

Model-facing prompt section для `http_request` строится как компактная reference card и ДОЛЖНА включать:
- явное указание, что helper пригоден для открытия и чтения публичных веб-сайтов, веб-страниц, файлов и API через `code_exec`;
- явное указание, что helper не допускает `localhost`, loopback, private, link-local и другие reserved/internal network targets;
- call form `await tools.http_request({...})`;
- input fields с типами, defaults и max values;
- redirect behavior, включая лимит `10` hops, redirect rewriting и cross-origin header stripping;
- success result fields;
- error fields `error.code` и `error.message`;
- короткий request example;
- короткий success response example;
- короткий error example.

## Поток выполнения

### 1. Вызов helper-а из sandbox-кода

1. Sandbox-код обращается к allowlisted helper-у через bridge API.
2. `SandboxBridge` проверяет allowlist и делегирует вызов в main-process handler.
3. Handler валидирует входной request config.
4. Handler валидирует, что `timeout_ms` не превышает `180000`.
5. Handler классифицирует destination до первого fetch:
   - literal `localhost` и `.localhost` отклоняются сразу;
   - literal IP сравнивается с forbidden address classes;
   - hostname при необходимости резолвится, и все полученные адреса проверяются на forbidden classes.
6. Handler фиксирует для текущего hop упорядоченный список проверенных destination addresses и привязывает реальное исходящее соединение только к адресам из этого списка.
7. ЕСЛИ список содержит несколько проверенных публичных адресов, handler пытается использовать их в resolver order до первого успешного соединения; connect/setup failure одного адреса не завершает helper, пока не исчерпаны остальные проверенные адреса этого hop.
8. Handler НЕ ДОЛЖЕН полагаться только на preflight lookup с последующим независимым `fetch(hostname)`, потому что это оставляет lookup/connect mismatch и DNS-rebinding gap.
9. Handler вычисляет фактически применённый лимит ответа: `max_response_bytes`, если он передан, иначе внутренний safety cap `262144`.
10. Handler выполняет ограниченный HTTP(S)-запрос с timeout и redirects не более `10` переходов.
11. ЕСЛИ `follow_redirects = false`, handler возвращает первый полученный redirect-ответ без перехода по `Location`.
12. ЕСЛИ redirect-follow включён, handler следует fetch-compatible policy:
   - `303` всегда переписывается в `GET` без body;
   - `301/302` переписывают `POST` в `GET` без body;
   - `307/308` сохраняют исходные method/body.
13. Перед каждым redirect hop handler повторно классифицирует next destination, фиксирует новый упорядоченный список проверенных addresses для этого hop и завершает helper с `forbidden_destination`, если hop указывает на `localhost`, loopback, private, link-local или reserved/internal target.
14. ЕСЛИ redirect policy переписывает следующий hop в `GET` без body, handler удаляет body-specific headers `content-type`, `content-length`, `content-encoding` и `transfer-encoding`.
15. ЕСЛИ redirect переводит запрос на другой origin, handler удаляет чувствительные request headers `authorization`, `proxy-authorization`, `cookie` и `cookie2` перед следующим hop.
16. Handler определяет формат тела ответа:
   - text/*, application/json, application/xml и другие текстовые content types -> `body_encoding = "text"`;
   - остальные content types -> `body_encoding = "base64"`.
17. Handler формирует структурированный результат.
18. Handler усекает итоговый `body` по применённому лимиту и выставляет `truncated`.
19. Handler возвращает structured result обратно в sandbox-код.

### 2. Ограничение результата

Ограничение результата обеспечивается следующими правилами:

1. Входной параметр `max_response_bytes` управляем и ограничен сверху значением `262144`.
2. ЕСЛИ `max_response_bytes` не передан, ТО helper применяет внутренний safety cap `262144` bytes как `applied_limit_bytes`.
3. Чтение response body всегда происходит через streaming reader и bounded applied limit.
4. Финальный `body` всегда ограничивается `applied_limit_bytes`.
5. Для нетекстовых ответов лимит применяется к исходным байтам response body до преобразования в base64.

## Стратегия тестирования

### Модульные Тесты

- `tests/unit/code_exec/SandboxBridge.test.ts` - проверяет allowlist доступность helper-а
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет request validation, timeout, redirects, fetch-compatible redirect rewriting, body-header cleanup on rewritten GET redirects, cross-origin header stripping, truncation, error mapping
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет request validation, timeout, redirects, fetch-compatible redirect rewriting, body-header cleanup on rewritten GET redirects, cross-origin header stripping, forbidden destination rejection, connection-boundary address pinning, multi-address fallback order, truncation, error mapping
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет возврат redirect-ответа при `follow_redirects = false`
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет `body_encoding = "text"` для текстовых ответов и `body_encoding = "base64"` для нетекстовых
- `tests/unit/code_exec/SandboxSessionManager.test.ts` - проверяет preload bridge bootstrap и доступность `window.tools.http_request(...)` внутри sandbox runtime
- `tests/unit/agents/PromptBuilder.test.ts` - проверяет, что model-facing описание helper-а `http_request` подмешивается в prompt-инструкцию `code_exec`, включая usage guidance для URL fetch задач, limits, redirect policy и error shape

### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper"
- `tests/functional/code_exec.spec.ts` - "should return redirect response without following in http_request helper"
- `tests/functional/code_exec.spec.ts` - "should enforce max_response_bytes and base64 encoding in http_request helper"
- `tests/functional/code_exec.spec.ts` - "should return structured validation and runtime errors from http_request helper"
- `tests/functional/code_exec.spec.ts` - "should reject localhost http_request target before any request is sent"

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| sandbox-http-request.1.1-1.4.5 | `tests/unit/code_exec/SandboxBridge.test.ts`, `tests/unit/code_exec/SandboxSessionManager.test.ts`, `tests/unit/agents/PromptBuilder.test.ts` | `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper" |
| sandbox-http-request.2.1-2.10.1 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper", "should enforce max_response_bytes and base64 encoding in http_request helper", "should return structured validation and runtime errors from http_request helper", "should reject localhost http_request target before any request is sent" |
| sandbox-http-request.3.1-3.2 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper", "should return redirect response without following in http_request helper", "should enforce max_response_bytes and base64 encoding in http_request helper", "should reject localhost http_request target before any request is sent" |
| sandbox-http-request.3.2.1-3.2.2 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | - |
| sandbox-http-request.3.3-3.6 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper", "should return redirect response without following in http_request helper", "should enforce max_response_bytes and base64 encoding in http_request helper", "should reject localhost http_request target before any request is sent" |
| sandbox-http-request.4.1-4.4 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts`, `tests/unit/code_exec/SandboxBridge.test.ts` | `tests/functional/code_exec.spec.ts` - "should return structured validation and runtime errors from http_request helper", "should reject localhost http_request target before any request is sent" |
