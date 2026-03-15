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
  - сообщает модели наличие async helper-а `http_request` и его контракт.

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
- `method` — опциональная строка HTTP-метода, по умолчанию `GET`; допустимые значения: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`;
- `headers` — опциональный объект заголовков со строковыми ключами и строковыми значениями;
- `body` — опциональное строковое тело запроса;
- `body` не допускается для `GET` и `HEAD`;
- `timeout_ms` — опциональный таймаут запроса; default — `10000`, максимум — `180000`;
- `follow_redirects` — опциональный флаг перехода по redirects;
- `max_response_bytes` — опциональный integer;
- максимальное число redirects — `10`;
- helper вызывается через `await tools.http_request({...})`;
- поведение helper-а должно быть детерминированным.

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
    "code": "invalid_url | invalid_method | invalid_headers | invalid_body | fetch_failed | limit_exceeded | internal_error",
    "message": "Human-readable message"
  }
}
```

## Поток выполнения

### 1. Вызов helper-а из sandbox-кода

1. Sandbox-код обращается к allowlisted helper-у через bridge API.
2. `SandboxBridge` проверяет allowlist и делегирует вызов в main-process handler.
3. Handler валидирует входной request config.
4. Handler валидирует, что `timeout_ms` не превышает `180000`.
5. Handler вычисляет фактически применённый лимит ответа, если передан `max_response_bytes`.
6. Handler выполняет ограниченный HTTP(S)-запрос с timeout и redirects не более `10` переходов.
7. ЕСЛИ `follow_redirects = false`, handler возвращает первый полученный redirect-ответ без перехода по `Location`.
8. Handler определяет формат тела ответа:
   - text/*, application/json, application/xml и другие текстовые content types -> `body_encoding = "text"`;
   - остальные content types -> `body_encoding = "base64"`.
9. Handler формирует структурированный результат.
10. Handler усекает итоговый `body` по применённому лимиту и выставляет `truncated`.
11. Handler возвращает structured result обратно в sandbox-код.

### 2. Ограничение результата

Ограничение результата обеспечивается следующими правилами:

1. Входной параметр `max_response_bytes` управляем и ограничен сверху.
2. ЕСЛИ `max_response_bytes` не передан, ТО helper не применяет отдельное ограничение результата и полагается на общие ограничения вывода `code_exec`.
3. Чтение response body bounded, чтобы не допустить неограниченного чтения тела ответа.
4. ЕСЛИ `max_response_bytes` передан, ТО финальный `body` ограничивается `applied_limit_bytes`.
5. Для нетекстовых ответов лимит `max_response_bytes` применяется к исходным байтам response body до преобразования в base64.

## Стратегия тестирования

### Модульные Тесты

- `tests/unit/code_exec/SandboxBridge.test.ts` - проверяет allowlist доступность helper-а
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет request validation, timeout, redirects, truncation, error mapping
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет возврат redirect-ответа при `follow_redirects = false`
- `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` - проверяет `body_encoding = "text"` для текстовых ответов и `body_encoding = "base64"` для нетекстовых
- `tests/unit/agents/PromptBuilder.test.ts` - проверяет, что model-facing описание helper-а `http_request` подмешивается в prompt-инструкцию `code_exec`

### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - sandbox-код вызывает helper `http_request` и получает structured result
- `tests/functional/code_exec.spec.ts` - helper соблюдает лимит `max_response_bytes`
- `tests/functional/code_exec.spec.ts` - helper не следует redirect при `follow_redirects = false`
- `tests/functional/code_exec.spec.ts` - helper возвращает бинарный ответ как `body_encoding = "base64"`
- `tests/functional/code_exec.spec.ts` - helper корректно обрабатывает redirect и request failure

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| sandbox-http-request.1.1-1.1.4 | `tests/unit/code_exec/SandboxBridge.test.ts`, `tests/unit/agents/PromptBuilder.test.ts` | `tests/functional/code_exec.spec.ts` |
| sandbox-http-request.2.1-2.10 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | `tests/functional/code_exec.spec.ts` |
| sandbox-http-request.3.1-3.6 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts` | `tests/functional/code_exec.spec.ts` |
| sandbox-http-request.4.1-4.4 | `tests/unit/code_exec/SandboxHttpRequestHandler.test.ts`, `tests/unit/code_exec/SandboxBridge.test.ts` | `tests/functional/code_exec.spec.ts` |
