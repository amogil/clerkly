# Список задач: Sandbox HTTP Request — Issue #65

## Обзор

Цель Issue #65: вынести HTTP helper в отдельную спецификацию и реализовать его как кодовый helper `http_request` для `code_exec`, а не как main-pipeline tool.

**Текущий статус:** Фаза 1 — спецификация и планирование

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

### В работе
- 🔄 Синхронизация границ ответственности со спецификацией `code_exec`.

### Запланировано

#### Фаза 1: Синхронизация спецификаций

- [ ] При необходимости обновить `docs/specs/code_exec/requirements.md`.
  - [ ] Сослаться на отдельную спецификацию `sandbox-http-request` как на профильную для данного helper-а.
- [ ] При необходимости обновить `docs/specs/code_exec/design.md`.
  - [ ] Зафиксировать boundary между общим sandbox runtime и helper-ом `http_request`.

#### Фаза 2: Runtime контракт helper-а

- [ ] Спроектировать входной контракт helper-а.
  - [ ] `url`
  - [ ] `method`
  - [ ] `headers`
  - [ ] `body`
  - [ ] `timeout_ms`
  - [ ] `follow_redirects`
  - [ ] `max_response_bytes`
  - [ ] validation rules для `method`, `headers` и `body`
  - [ ] defaults только для `method`, `timeout_ms` и `follow_redirects`
- [ ] Спроектировать выходной контракт helper-а.
  - [ ] `final_url`
  - [ ] `status`
  - [ ] `headers`
  - [ ] `content_type`
  - [ ] `body_encoding`
  - [ ] `body`
  - [ ] `truncated`
  - [ ] `applied_limit_bytes`
  - [ ] поведение для текстовых и нетекстовых ответов
  - [ ] поведение при `follow_redirects = false`

#### Фаза 3: Реализация

- [ ] Добавить allowlisted sandbox helper `http_request`.
- [ ] Реализовать bounded HTTP request handler в main process.
- [ ] Реализовать валидацию `method`, `headers` и `body`.
- [ ] Реализовать возврат redirect-ответа без follow при `follow_redirects = false`.
- [ ] Реализовать возврат текстовых ответов как `body_encoding = "text"` и нетекстовых как `body_encoding = "base64"`.
- [ ] Реализовать structured errors.
- [ ] Подмешать описание helper-а в prompt-инструкцию `code_exec`.

#### Фаза 4: Тесты

- [ ] Добавить unit-тесты для sandbox HTTP request handler.
- [ ] Добавить unit-тесты для allowlist/policy слоя.
- [ ] Добавить unit-тесты для `follow_redirects = false` и `body_encoding`.
- [ ] Добавить functional-тесты в `tests/functional/code_exec.spec.ts`.

#### Фаза 5: Валидация

- [ ] Прогнать релевантные unit-тесты.
- [ ] Прогнать `npm run validate`.
- [ ] После завершения запросить подтверждение на functional tests.
