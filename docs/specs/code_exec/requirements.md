# Документ Требований: code_exec

## Введение

Данный документ описывает требования к фиче выполнения JavaScript-кода моделью через инструмент `code_exec` в изолированной песочнице Electron.
Документ фиксирует только исполнение кода, безопасность, контракт API и persisted/runtime-поведение.
Требования к визуальному отображению в чате находятся в спецификации `agents`.
Вызов `code_exec` является обычным tool call и сохраняется в истории сообщений как `kind: tool_call` с `toolName = "code_exec"`.

## Глоссарий

- **Code Exec** — инструмент `code_exec`, который модель вызывает для запуска JavaScript-кода
- **Sandbox Runtime** — изолированная среда исполнения кода для конкретного агента
- **Execution Policy** — набор ограничений (время, доступы, лимиты)
- **Allowed Tools** — разрешённые вызовы из sandbox в main process

## Требования

### 1. Вызов выполнения кода моделью

**ID:** code_exec.1

**User Story:** Как пользователь, я хочу, чтобы агент мог запускать JavaScript-код через `code_exec`, чтобы решать задачи, требующие вычислений и программной обработки данных.

#### Критерии Приемки

1.1. Система ДОЛЖНА предоставлять модели инструмент `code_exec` в tool-calling контракте.

1.1.1. Контракт `code_exec` (аргументы, формат результата, операционные лимиты) ДОЛЖЕН явно сообщаться модели в prompt/tool-инструкции.

1.2. КОГДА модель вызывает `code_exec`, ТО система ДОЛЖНА запускать переданный JavaScript-код в sandbox runtime активного агента.

1.2.1. КОГДА модель вызывает `code_exec`, ТО вызов ДОЛЖЕН обрабатываться как tool call в рамках существующего tool-loop (`model -> tools -> model`).

1.3. КОГДА исполнение кода завершается, ТО система ДОЛЖНА возвращать модели структурированный результат выполнения.

1.4. КОГДА модель вызывает `code_exec` несколько раз в рамках одного turn, ТО система ДОЛЖНА корректно обрабатывать каждый вызов и сохранять результат каждого вызова с уникальной корреляцией вызов↔результат.

1.4.1. WHERE tool-loop выполняется последовательно, система ДОЛЖНА сохранять результаты в порядке вызовов модели.

1.4.2. WHERE tool-loop выполняется параллельно, система ДОЛЖНА сохранять корректную корреляцию результатов по идентификатору вызова и SHALL NOT требовать совпадения порядка завершения с порядком вызовов.

1.5. Каждый вызов `code_exec` ДОЛЖЕН исполняться в отдельной sandbox-инстанции (one-call-one-sandbox), без переиспользования runtime между вызовами.

1.5.1. Между разными вызовами `code_exec` НЕ ДОЛЖНО быть разделяемого исполняемого состояния JavaScript.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should execute JavaScript via code_exec tool call"
- `tests/functional/code_exec.spec.ts` — "should process multiple code_exec calls in one turn"

### 2. Безопасность и изоляция исполнения

**ID:** code_exec.2

**User Story:** Как пользователь, я хочу, чтобы выполнение кода было безопасным и изолированным, чтобы код не мог получить доступ к чувствительным данным приложения и системы.

#### Критерии Приемки

2.1. Исполнение `code_exec` ДОЛЖНО происходить в изолированной sandbox-среде Electron с отключенным прямым доступом к Node.js API.

2.2. Sandbox runtime ДОЛЖЕН иметь доступ только к явно разрешённому bridge API.

2.3. Sandbox runtime SHALL NOT иметь прямой доступ к файловой системе, сетевым запросам и БД.

2.4. КОГДА sandbox-код пытается вызвать неразрешённый API, ТО система ДОЛЖНА блокировать доступ и возвращать контролируемую ошибку.

2.5. КОГДА истекает лимит времени исполнения, ТО система ДОЛЖНА прерывать выполнение и возвращать статус timeout.

2.6. КОГДА запрос на выполнение отменён пользователем или системой, ТО активное выполнение ДОЛЖНО быть остановлено корректно.

2.7. Tool calls, выполняемые в основном pipeline потоке (`MainPipeline` tool-loop), SHALL NOT быть напрямую доступны из JavaScript-кода sandbox runtime.

2.8. Система ДОЛЖНА использовать закрытый allowlist тулов, доступных из JavaScript-кода sandbox runtime.

2.8.1. КОГДА JavaScript-код обращается к туле, отсутствующей в allowlist, ТО вызов ДОЛЖЕН завершаться контролируемой ошибкой с `status = "error"`, `error.code = "policy_denied"` и `error.message = "Tool is not allowed in sandbox allowlist."`.

2.8.2. Allowlist тулов sandbox runtime ДОЛЖЕН определяться в одном централизованном месте и использоваться как единый источник истины для валидации вызовов.

2.9. Sandbox runtime SHALL NOT поддерживать многопоточность JavaScript (запрещены `Worker`, `SharedWorker`, `ServiceWorker`, `Worklet`).

2.9.1. КОГДА sandbox-код пытается использовать многопоточность, ТО система ДОЛЖНА завершать вызов контролируемой ошибкой с `status = "error"`, `error.code = "policy_denied"` и `error.message = "Multithreading APIs are not allowed in sandbox runtime."`.

2.10. КОГДА пользователь закрывает приложение при активном `code_exec`, ТО система ДОЛЖНА принудительно остановить выполнение sandbox-кода и выполнить cleanup sandbox-инстанции без зависаний shutdown-процесса.

2.11. Система ДОЛЖНА ограничивать потребление ресурсов sandbox-выполнения:
  - лимит CPU;
  - лимит оперативной памяти.

2.11.1. КОГДА sandbox-выполнение превышает лимит CPU или памяти, ТО вызов ДОЛЖЕН завершаться с `status = "error"` и `error.code = "limit_exceeded"`.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should deny access to non-whitelisted sandbox APIs"
- `tests/functional/code_exec.spec.ts` — "should timeout long-running code_exec execution"
- `tests/functional/code_exec.spec.ts` — "should cancel active code_exec execution"
- `tests/functional/code_exec.spec.ts` — "should deny main-pipeline-only tools from sandbox JavaScript"
- `tests/functional/code_exec.spec.ts` — "should allow only tools from sandbox allowlist"
- `tests/functional/code_exec.spec.ts` — "should stop sandbox execution on app close without hanging shutdown"
- `tests/functional/code_exec.spec.ts` — "should enforce sandbox CPU and memory limits"

### 3. Контракт bridge API для модели

**ID:** code_exec.3

**User Story:** Как разработчик, я хочу формализовать API исполнения и доступные методы для модели, чтобы она стабильно и предсказуемо использовала `code_exec`.

#### Критерии Приемки

3.1. Система ДОЛЖНА документировать для модели контракт инструмента `code_exec`:
  - обязательное поле `code` (JavaScript строка);
  - опциональное поле `timeout_ms`;
  - ожидаемый результат: `status`, `stdout`, `stderr`, `stdout_truncated`, `stderr_truncated`, `error`.
  - `stdout` ДОЛЖЕН содержать консольный вывод sandbox-кода.
  - `stderr` ДОЛЖЕН содержать диагностический/error вывод sandbox-кода.

3.1.1. Формальный входной контракт `code_exec` ДОЛЖЕН быть задокументирован как JSON schema:
  - `type: object`
  - `additionalProperties: false`
  - `required: ["code"]`
  - `properties.code: string`
  - `properties.timeout_ms: integer`

3.1.2. Формальный выходной контракт `code_exec` ДОЛЖЕН быть задокументирован как структура:
  - `status: "success" | "error" | "timeout"`
  - `stdout: string`
  - `stderr: string`
  - `stdout_truncated: boolean`
  - `stderr_truncated: boolean`
  - `error?: { code: string; message: string }`

3.1.2.1. Формальный выходной контракт `code_exec` ДОЛЖЕН быть JSON-объектом (`type: object`).

3.1.2.2. Поле `error.code` ДОЛЖНО использовать фиксированный словарь значений:
  - `policy_denied` — нарушение sandbox policy/allowlist;
  - `sandbox_runtime_error` — ошибка исполнения JavaScript-кода в sandbox;
  - `invalid_tool_arguments` — невалидные входные аргументы инструмента;
  - `limit_exceeded` — превышение операционных лимитов (размер/ресурсы/время);
  - `internal_error` — внутренняя ошибка исполнения/bridge/pipeline.

3.1.2.3. Поле `error.message` ДОЛЖНО быть человекочитаемым и достаточным для диагностики причины ошибки моделью.

3.1.2.4. КОГДА вызов `code_exec` прерывается пользователем (cancel/stop), ТО отдельное состояние отмены модели НЕ возвращается; lifecycle такого вызова в истории завершается через `messages.hidden = true` по правилам `code_exec.4.5`.

3.1.2.5. КОГДА `status = "success"`, ТО поле `error` НЕ ДОЛЖНО присутствовать в результате.

3.1.2.6. КОГДА `status = "error"` ИЛИ `status = "timeout"`, ТО поле `error` ДОЛЖНО присутствовать и содержать `error.code` и `error.message`.

3.1.3. КОГДА модель явно задаёт `timeout_ms` в вызове `code_exec`, ТО система ДОЛЖНА принимать только диапазон от `10000` до `3600000` миллисекунд (от 10 секунд до 1 часа).

3.1.4. ЕСЛИ `timeout_ms` меньше `10000` или больше `3600000`, ТО система ДОЛЖНА отклонять вызов контролируемой ошибкой валидации инструмента.

3.1.5. ЕСЛИ модель не передала `timeout_ms`, ТО система ДОЛЖНА использовать значение по умолчанию `60000` миллисекунд.

3.2. Система ДОЛЖНА документировать для модели только разрешённые runtime API внутри sandbox (например, `console.log`, ограниченный `tools` bridge).

3.2.1. Разрешённые API консоли ДОЛЖНЫ быть перечислены явно: `console.log`, `console.info`, `console.warn`, `console.error`.

3.3. Система ДОЛЖНА содержать минимум один позитивный и один негативный пример использования API для модели.

3.4. КОГДА модель использует только разрешённый API, ТО исполнение ДОЛЖНО завершаться без ошибки `error.code = "policy_denied"`.

3.5. КОГДА модель обращается к запрещённому API, ТО система ДОЛЖНА возвращать контролируемую ошибку с `status = "error"` и `error.code = "policy_denied"` без раскрытия чувствительных деталей среды.

3.6. Система ДОЛЖНА явно указывать модели, что в `code_exec` она МОЖЕТ писать диагностические сообщения через `console.*`.

3.7. КОГДА sandbox-код пишет сообщения в `console.*`, ТО после завершения `code_exec` система ДОЛЖНА возвращать модели содержимое консольного вывода в `stdout` и/или `stderr`.

3.7.1. Потоки `stdout` и `stderr` ДОЛЖНЫ возвращаться раздельно и SHALL NOT объединяться в одно поле.

#### Примеры API для модели

Позитивный пример:

```javascript
// code_exec input.code
const nums = [1, 2, 3, 4];
const sum = nums.reduce((a, b) => a + b, 0);
console.log(`sum=${sum}`);
console.info('calculation completed');
```

Негативный пример:

```javascript
// code_exec input.code
// Должно завершиться status=error, error.code=policy_denied
return await window.api.saveData('x', 'y');
```

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should execute code_exec with documented allowed API"
- `tests/functional/code_exec.spec.ts` — "should return error with code policy_denied for forbidden API access"
- `tests/functional/code_exec.spec.ts` — "should return console output to model after code_exec"

### 4. Контракт хранения и realtime-события

**ID:** code_exec.4

**User Story:** Как разработчик, я хочу единый persisted/runtime-контракт для `code_exec`, чтобы pipeline и transport работали консистентно.

#### Критерии Приемки

4.1. Система ДОЛЖНА сохранять lifecycle выполнения `code_exec` как persisted `kind: tool_call` сообщения с `toolName = "code_exec"` и обновлением состояния start → finish.

4.1.1. Статус выполнения `code_exec` ДОЛЖЕН храниться в `payload_json.data.output.status`, а флаг завершённости lifecycle ДОЛЖЕН храниться в колонке `messages.done` (а НЕ в JSON).

4.1.2. Persisted `tool_call(code_exec)` ДОЛЖЕН содержать audit-поля `started_at` (ISO), `finished_at` (ISO), `duration_ms` (number).

4.2. Snapshot-события `message.created` и `message.updated` ДОЛЖНЫ использоваться для доставки состояния `code_exec` в runtime-подписчики.

4.3. КОГДА состояние `code_exec` обновляется, ТО событие `message.updated` ДОЛЖНО содержать полное актуальное snapshot-состояние сообщения.

4.4. Контракт `code_exec` ДОЛЖЕН быть совместим с существующим stream/snapshot потоком сообщений.

4.5. КОГДА вызов `code_exec` отменяется, ТО сообщение ДОЛЖНО скрываться через `messages.hidden = true`; отдельное состояние отмены в output НЕ ДОЛЖНО использоваться.

4.6. ПОКА `code_exec` находится в состоянии `status = "running"`, система ДОЛЖНА поддерживать актуальность runtime через `message.updated` (heartbeat/progress update).

4.7. Audit-поля lifecycle ДОЛЖНЫ быть монотонными:
  - `started_at` фиксируется один раз при старте и далее НЕ ДОЛЖЕН изменяться;
  - `finished_at` фиксируется один раз при переходе в terminal-состояние;
  - `duration_ms` вычисляется и фиксируется только при переходе в terminal-состояние.

4.8. После перехода `code_exec` в terminal-состояние (`success | error | timeout`) дальнейшие изменения `output.status` для этого вызова НЕ ДОЛЖНЫ выполняться.

4.9. КОГДА `tool_call(code_exec)` скрыт через `messages.hidden = true`, ТО для него НЕ ДОЛЖНЫ публиковаться дальнейшие `message.updated` heartbeat/progress апдейты.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should persist code_exec lifecycle and update via message snapshots"

### 5. Операционные лимиты

**ID:** code_exec.5

**User Story:** Как разработчик, я хочу фиксированные лимиты исполнения `code_exec`, чтобы обеспечить предсказуемость производительности и защиту от перегрузок.

#### Критерии Приемки

5.1. Система ДОЛЖНА ограничивать максимальный размер входного поля `code` для одного вызова.

5.1.1. В целевой конфигурации лимит размера входного поля `code` ДОЛЖЕН составлять `262144` байт (`256 KiB`) на один вызов `code_exec`.

5.1.2. Лимит размера входного `code` ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.2. Система ДОЛЖНА ограничивать максимальный объём `stdout` и `stderr`, возвращаемых модели.

5.2.1. КОГДА `stdout` или `stderr` превышают лимит, ТО система ДОЛЖНА усекать соответствующий поток, выставлять флаг `stdout_truncated=true` и/или `stderr_truncated=true`, и сохранять оставшийся поток без изменений.

5.2.2. В целевой конфигурации лимит `stdout` ДОЛЖЕН составлять `1048576` байт (`1 MiB`) на один вызов `code_exec`.

5.2.3. В целевой конфигурации лимит `stderr` ДОЛЖЕН составлять `1048576` байт (`1 MiB`) на один вызов `code_exec`.

5.2.4. Лимиты `stdout`/`stderr` ДОЛЖНЫ быть явно сообщены модели в prompt/tool-инструкции.

5.3. КОГДА модель инициирует параллельные `code_exec` tool calls в одном turn, ТО система ДОЛЖНА поддерживать параллельный запуск отдельных sandbox-инстанций (one-call-one-sandbox) с корректной корреляцией по `callId`.

5.4. Система ДОЛЖНА ограничивать потребление CPU sandbox-выполнения.

5.4.1. Лимит CPU ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.5. Система ДОЛЖНА ограничивать потребление оперативной памяти sandbox-выполнения.

5.5.1. Лимит памяти ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.6. При срабатывании любого лимита система ДОЛЖНА завершать вызов с `status = "error"` (например, `error.code = "policy_denied"` или `error.code = "limit_exceeded"`) либо `status = "timeout"` без падения процесса.

5.7. `stdout`/`stderr` (включая усечённые значения и флаги `stdout_truncated`/`stderr_truncated`) ДОЛЖНЫ сохраняться в persisted `tool_call` и ДОЛЖНЫ храниться без автоматической очистки/архивации в рамках данной фичи.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should enforce code_exec payload and output size limits"
- `tests/functional/code_exec.spec.ts` — "should support parallel code_exec calls with callId correlation"

### 6. Тестируемость и покрытие

**ID:** code_exec.6

**User Story:** Как разработчик, я хочу получить модульные и функциональные тесты новой фичи, чтобы контролировать регрессии и безопасность исполнения.

#### Критерии Приемки

6.1. Для `code_exec` ДОЛЖНЫ быть добавлены модульные тесты main/runtime/pipeline слоёв.

6.2. Для `code_exec` ДОЛЖНЫ быть добавлены функциональные тесты пользовательских execution-сценариев.

6.3. Тесты ДОЛЖНЫ покрывать success, error, timeout, cancel и policy-denied сценарии.

6.4. Новые тесты SHALL NOT использовать `.skip()` и `.only()`.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should cover success/error/timeout/cancel flows for code_exec"
