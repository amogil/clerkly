# Список задач: Sandbox HTTP Request — Issue #65

## Обзор

Цель Issue #65: вынести HTTP helper в отдельную спецификацию и реализовать его как кодовый helper `http_request` для `code_exec`, а не как main-pipeline tool.

**Текущий статус:** Фаза 5 — валидация завершена, ожидается решение по полному functional-прогону

---

## CRITICAL RULES

- Не добавлять этот инструмент в основной `MainPipeline` tool-loop.
- Инструмент должен вызываться только из sandbox-кода через allowlisted async helper `http_request`.
- Контракт helper-а должен быть fetch-like и вызываться через `await`.
- Параметр `max_response_bytes` должен быть опциональным и, если передан, ограничивать размер ответа в байтах.
- Не дублировать в этой спецификации общие sandbox и transport-ограничения, уже описанные в `code_exec`.
- Не запускать функциональные тесты без отдельного подтверждения пользователя.

---

## Текущее состояние

### Выполнено
- ✅ Issue #65 проанализирован.
- ✅ Уточнено, что инструмент не должен быть main-pipeline tool.
- ✅ Уточнено, что инструмент должен жить как sandbox helper в экосистеме `code_exec`.
- ✅ Уточнено, что helper должен быть общим HTTP request API, а не “web page tool”.
- ✅ Уточнено, что helper должен быть async/await и fetch-like по стилю вызова.
- ✅ Уточнено, что ограничение результата задаётся в байтах через `max_response_bytes`.
- ✅ Уточнено, что `max_response_bytes` опционален и применяется только при явной передаче параметра.
- ✅ Уточнено, что helper не преобразует HTML в текст и возвращает тело ответа как пришло.
- ✅ Создана отдельная спецификация `docs/specs/sandbox-http-request/`.
- ✅ `docs/specs/code_exec/requirements.md` синхронизирован ссылкой на профильную спецификацию `sandbox-http-request`.
- ✅ `docs/specs/code_exec/design.md` синхронизирован по boundary между общим sandbox runtime и helper-ом `http_request`.
- ✅ Спроектирован входной контракт helper-а: `url`, `method`, `headers`, `body`, `timeout_ms`, `follow_redirects`, `max_response_bytes`.
- ✅ Зафиксированы validation rules для `method`, `headers` и `body`.
- ✅ Зафиксированы defaults для `method`, `timeout_ms` и `follow_redirects`.
- ✅ Спроектирован выходной контракт helper-а: `final_url`, `status`, `headers`, `content_type`, `body_encoding`, `body`, `truncated`, `applied_limit_bytes`.
- ✅ Зафиксировано поведение для текстовых и нетекстовых ответов.
- ✅ Зафиксировано поведение при `follow_redirects = false`.
- ✅ Добавлен allowlisted sandbox helper `http_request`.
- ✅ Реализован bounded HTTP request handler в main process.
- ✅ Реализована валидация `method`, `headers` и `body`.
- ✅ Реализован возврат redirect-ответа без follow при `follow_redirects = false`.
- ✅ Реализован возврат текстовых ответов как `body_encoding = "text"` и нетекстовых как `body_encoding = "base64"`.
- ✅ Реализованы structured errors.
- ✅ Описание helper-а подмешано в prompt-инструкцию `code_exec`.
- ✅ Добавлены unit-тесты для sandbox HTTP request handler.
- ✅ Добавлены unit-тесты для allowlist/policy слоя.
- ✅ Добавлены unit-тесты для `follow_redirects = false` и `body_encoding`.
- ✅ Добавлены functional-сценарии в `tests/functional/code_exec.spec.ts`.
- ✅ Прогнаны релевантные unit-тесты.

### В работе
- 🔄 Ожидается решение пользователя по полному `npm run test:functional`.

### Запланировано

#### Фаза 1: Синхронизация спецификаций

- [x] При необходимости обновить `docs/specs/code_exec/requirements.md`.
  - [x] Сослаться на отдельную спецификацию `sandbox-http-request` как на профильную для данного helper-а.
- [x] При необходимости обновить `docs/specs/code_exec/design.md`.
  - [x] Зафиксировать boundary между общим sandbox runtime и helper-ом `http_request`.

#### Фаза 2: Runtime контракт helper-а

- [x] Спроектировать входной контракт helper-а.
  - [x] `url`
  - [x] `method`
  - [x] `headers`
  - [x] `body`
  - [x] `timeout_ms`
  - [x] `follow_redirects`
  - [x] `max_response_bytes`
  - [x] validation rules для `method`, `headers` и `body`
  - [x] defaults только для `method`, `timeout_ms` и `follow_redirects`
- [x] Спроектировать выходной контракт helper-а.
  - [x] `final_url`
  - [x] `status`
  - [x] `headers`
  - [x] `content_type`
  - [x] `body_encoding`
  - [x] `body`
  - [x] `truncated`
  - [x] `applied_limit_bytes`
  - [x] поведение для текстовых и нетекстовых ответов
  - [x] поведение при `follow_redirects = false`

#### Фаза 3: Реализация

- [x] Добавить allowlisted sandbox helper `http_request`.
- [x] Реализовать bounded HTTP request handler в main process.
- [x] Реализовать валидацию `method`, `headers` и `body`.
- [x] Реализовать возврат redirect-ответа без follow при `follow_redirects = false`.
- [x] Реализовать возврат текстовых ответов как `body_encoding = "text"` и нетекстовых как `body_encoding = "base64"`.
- [x] Реализовать structured errors.
- [x] Подмешать описание helper-а в prompt-инструкцию `code_exec`.

#### Фаза 4: Тесты

- [x] Добавить unit-тесты для sandbox HTTP request handler.
- [x] Добавить unit-тесты для allowlist/policy слоя.
- [x] Добавить unit-тесты для `follow_redirects = false` и `body_encoding`.
- [x] Добавить functional-тесты в `tests/functional/code_exec.spec.ts`.

#### Фаза 5: Валидация

- [x] Прогнать релевантные unit-тесты.
- [x] Прогнать `npm run validate`.
- [ ] После завершения запросить подтверждение на functional tests.
