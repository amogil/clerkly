# Документ Требований: Sandbox HTTP Request

## Введение

Данный документ описывает требования к helper-у `http_request`, доступному в sandbox-коде через `code_exec`.
Инструмент предоставляет модели способ выполнять HTTP(S)-запросы в fetch-подобном стиле и получать структурированный ответ.
Общие ограничения sandbox runtime и security-модель определяются спецификацией `code_exec`.

## Глоссарий

- **Sandbox HTTP Request** - кодовый helper `http_request` для выполнения HTTP(S)-запросов из sandbox-кода
- **Fetch-like Contract** - вызов helper-а через один объект опций по образцу JavaScript `fetch`/request config
- **Response Body** - тело HTTP-ответа, возвращаемое helper-ом без специального преобразования HTML в текст

## Требования

### 1. Доступность инструмента для sandbox-кода

**ID:** sandbox-http-request.1

**User Story:** Как пользователь, я хочу, чтобы агент мог выполнять HTTP-запросы из кода, чтобы решать задачи, где нужен контролируемый доступ к HTTP-ресурсам.

#### Критерии Приемки

1.1. Система ДОЛЖНА предоставлять sandbox-коду helper `http_request`

1.2. Helper `http_request` ДОЛЖЕН вызываться из sandbox-кода через bridge-механизм с allowlist, а НЕ как прямой main-pipeline tool call

1.3. Helper `http_request` ДОЛЖЕН быть асинхронным JavaScript API и ДОЛЖЕН использоваться через `await`

1.4. Prompt/tool-инструкция для модели ДОЛЖНА описывать назначение helper-а, входной контракт, ограничения и формат результата

1.4.1. Prompt/tool-инструкция ДОЛЖНА явно описывать default и maximum ограничения helper-а, включая `timeout_ms`, `max_response_bytes` и внутренний safety cap `262144` bytes

1.4.2. Prompt/tool-инструкция ДОЛЖНА явно описывать redirect policy helper-а, включая лимит `10` переходов, правила переписывания `303`, `301/302 POST` и `307/308`, а также очистку чувствительных заголовков при cross-origin redirect

1.4.3. Prompt/tool-инструкция ДОЛЖНА явно описывать shape успешного результата и shape structured error с полями `error.code` и `error.message`

1.4.4. Prompt/tool-инструкция ДОЛЖНА явно сообщать модели, что через `code_exec` и `await tools.http_request(...)` она МОЖЕТ открывать и читать публичные веб-сайты, веб-страницы и другие HTTP-ресурсы, а НЕ только API

1.4.5. Prompt/tool-инструкция ДОЛЖНА явно сообщать модели, что helper предназначен только для публичных HTTP(S)-ресурсов и ДОЛЖЕН отклонять `localhost`, loopback, private, link-local и другие reserved/internal network targets

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper"

### 2. Контракт входа

**ID:** sandbox-http-request.2

**User Story:** Как разработчик, я хочу формальный контракт вызова `http_request`, чтобы модель использовала helper предсказуемо.

#### Критерии Приемки

2.1. Helper `http_request` ДОЛЖЕН принимать один объект аргументов в стиле JavaScript `fetch`

2.2. Объект аргументов ДОЛЖЕН поддерживать как минимум поля:
  - `url`
  - `method`
  - `headers`
  - `body`
  - `timeout_ms`
  - `follow_redirects`
  - `max_response_bytes`

2.3. Поле `url` ДОЛЖНО быть обязательной строкой и содержать абсолютный `http/https` URL

2.3.1. ЕСЛИ `url` указывает на `localhost`, loopback, private, link-local или другой reserved/internal network target, ТО helper ДОЛЖЕН отклонять вызов structured runtime error

2.3.2. ГДЕ приложение выполняется в functional test mode, система МОЖЕТ использовать явно задокументированный test-only loopback allowlist для локальных mock HTTP-сервисов test infrastructure

2.4. Поле `method` МОЖЕТ быть опущено; ЕСЛИ оно опущено, ТО система ДОЛЖНА использовать `GET`

2.4.1. ЕСЛИ поле `method` передано, ТО оно ДОЛЖНО быть одной из строк: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

2.4.2. ЕСЛИ поле `method` передано в другом значении, ТО helper ДОЛЖЕН отклонять вызов как невалидный

2.5. Поле `headers` МОЖЕТ быть опущено; ЕСЛИ оно передано, ТО оно ДОЛЖНО быть объектом HTTP-заголовков со строковыми ключами и строковыми значениями

2.5.1. ЕСЛИ поле `headers` передано в другом формате, ТО helper ДОЛЖЕН отклонять вызов как невалидный

2.6. Поле `body` МОЖЕТ быть опущено; ЕСЛИ оно передано, ТО оно ДОЛЖНО быть строкой и ДОЛЖНО использоваться как тело HTTP-запроса

2.6.1. ЕСЛИ поле `body` передано при `method = GET` ИЛИ `method = HEAD`, ТО helper ДОЛЖЕН отклонять вызов как невалидный

2.6.2. ЕСЛИ поле `body` передано в другом формате, ТО helper ДОЛЖЕН отклонять вызов как невалидный

2.7. Поле `timeout_ms` МОЖЕТ быть опущено; ЕСЛИ оно опущено, ТО система ДОЛЖНА использовать значение по умолчанию `10000`

2.7.1. ЕСЛИ значение `timeout_ms` превышает `180000`, ТО helper ДОЛЖЕН отклонять вызов как невалидный

2.8. Поле `follow_redirects` МОЖЕТ быть опущено; ЕСЛИ оно опущено, ТО система ДОЛЖНА использовать значение по умолчанию `true`

2.9. Поле `max_response_bytes` МОЖЕТ быть опущено

2.10. Значение `max_response_bytes` ДОЛЖНО интерпретироваться как лимит в байтах тела ответа

2.10.1. ЕСЛИ поле `max_response_bytes` передано, ТО оно ДОЛЖНО быть integer в диапазоне `0..262144`

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper"
- `tests/functional/code_exec.spec.ts` - "should enforce max_response_bytes and base64 encoding in http_request helper"
- `tests/functional/code_exec.spec.ts` - "should return structured validation and runtime errors from http_request helper"

### 3. Выполнение запроса и результат

**ID:** sandbox-http-request.3

**User Story:** Как пользователь, я хочу, чтобы helper возвращал контролируемый и пригодный для обработки результат HTTP-запроса.

#### Критерии Приемки

3.1. КОГДА helper `http_request` вызывается, ТО система ДОЛЖНА выполнять контролируемый HTTP(S)-запрос

3.2. Система ДОЛЖНА валидировать URL перед сетевым запросом

3.3. Система ДОЛЖНА обрабатывать redirects контролируемым образом в соответствии с `follow_redirects`

3.3.1. Система ДОЛЖНА прерывать redirect-цепочку после `10` переходов, чтобы предотвращать кольцевые redirects и бесконечные переходы

3.3.2. ЕСЛИ redirect-цепочка достигает лимита `10` переходов и не завершена, ТО helper ДОЛЖЕН завершаться структурированной runtime error

3.3.3. ЕСЛИ `follow_redirects = false` и сервер возвращает redirect-ответ, ТО helper ДОЛЖЕН вернуть этот redirect-ответ без перехода по `Location`

3.3.4. ЕСЛИ `follow_redirects = true` и сервер возвращает redirect-ответ со статусом `303`, ТО helper ДОЛЖЕН выполнять следующий запрос как `GET` без `body`

3.3.5. ЕСЛИ `follow_redirects = true`, сервер возвращает redirect-ответ со статусом `301` ИЛИ `302`, и текущий запрос использует `POST`, ТО helper ДОЛЖЕН выполнять следующий запрос как `GET` без `body`

3.3.6. ЕСЛИ `follow_redirects = true` и сервер возвращает redirect-ответ со статусом `307` ИЛИ `308`, ТО helper ДОЛЖЕН сохранять исходные `method` и `body` для следующего запроса

3.3.6.1. ЕСЛИ redirect policy переписывает следующий запрос в `GET` без `body`, ТО helper ДОЛЖЕН удалять из следующего запроса body-specific headers, включая `content-type`, `content-length`, `content-encoding` и `transfer-encoding`

3.3.7. ЕСЛИ redirect переводит запрос на другой origin, ТО helper ДОЛЖЕН удалять из следующего запроса чувствительные заголовки `authorization`, `proxy-authorization`, `cookie` и `cookie2`

3.3.8. ЕСЛИ redirect переводит запрос на `localhost`, loopback, private, link-local или другой reserved/internal network target, ТО helper ДОЛЖЕН завершаться structured runtime error до отправки следующего hop

3.4. КОГДА запрос завершается успешно, ТО helper ДОЛЖЕН возвращать структурированный результат

3.4.1. Результат ДОЛЖЕН включать как минимум:
  - `status`
  - `final_url`
  - `headers`
  - `content_type`
  - `body_encoding`
  - `body`
  - `truncated`
  - `applied_limit_bytes`

3.4.2. Поле `body` ДОЛЖНО содержать тело HTTP-ответа

3.4.3. Поле `body_encoding` ДОЛЖНО принимать значение `text`, ЕСЛИ тело ответа возвращается как текст

3.4.4. Поле `body_encoding` ДОЛЖНО принимать значение `base64`, ЕСЛИ тело ответа возвращается как бинарные данные

3.4.5. КОГДА ответ имеет текстовый content type, ТО helper ДОЛЖЕН возвращать `body` как текст и `body_encoding = "text"`

3.4.6. КОГДА ответ имеет нетекстовый content type, ТО helper ДОЛЖЕН возвращать `body` в base64-представлении и `body_encoding = "base64"`

3.5. Поле `body` ДОЛЖНО быть ограничено фактически применённым значением `applied_limit_bytes`

3.5.1. ЕСЛИ передан `max_response_bytes`, ТО система ДОЛЖНА использовать его как `applied_limit_bytes`

3.5.2. ЕСЛИ `max_response_bytes` не передан, ТО система ДОЛЖНА использовать внутренний safety cap `262144` bytes как `applied_limit_bytes`

3.6. Результат ДОЛЖЕН явно сообщать, был ли `body` усечён

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - "should allow sandbox code to execute async http_request helper"
- `tests/functional/code_exec.spec.ts` - "should return redirect response without following in http_request helper"
- `tests/functional/code_exec.spec.ts` - "should enforce max_response_bytes and base64 encoding in http_request helper"

### 4. Ошибки и безопасность

**ID:** sandbox-http-request.4

**User Story:** Как пользователь, я хочу, чтобы ошибки HTTP-запросов обрабатывались предсказуемо, чтобы агент не ломал общий сценарий работы.

#### Критерии Приемки

4.1. ЕСЛИ URL, method или другие входные параметры невалидны, ТО helper ДОЛЖЕН возвращать структурированную ошибку валидации

4.1.1. Structured validation error ДОЛЖНА включать объект `error` с полями `code` и `message`

4.2. ЕСЛИ HTTP-запрос завершается сетевой ошибкой или timeout, ТО helper ДОЛЖЕН возвращать структурированную runtime error

4.2.1. Structured runtime error ДОЛЖНА включать объект `error` с полями `code` и `message`

4.2.2. Structured runtime error для запрещённого назначения ДОЛЖНА использовать `error.code = "forbidden_destination"`

4.3. Общая sandbox policy для данного helper-а ДОЛЖНА соответствовать спецификации `code_exec`

4.4. Поведение helper-а ДОЛЖНО оставаться детерминированным по timeout, redirects и размеру результата

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` - "should return structured validation and runtime errors from http_request helper"
- `tests/functional/code_exec.spec.ts` - "should reject localhost http_request target before any request is sent"
