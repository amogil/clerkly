# Документ Требований: code_exec

## Введение

Данный документ описывает требования к фиче выполнения JavaScript-кода моделью через инструмент `code_exec` в изолированной песочнице Electron.
Документ фиксирует только исполнение кода, безопасность, контракт API и persisted/runtime-поведение.
Требования к визуальному отображению в чате находятся в спецификации `agents`.
Вызов `code_exec` является обычным tool call и, при валидных аргументах, сохраняется в истории сообщений как `kind: tool_call` с `toolName = "code_exec"`.

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

1.1.2. Prompt/tool-инструкция для модели ДОЛЖНА содержать правило обработки ресурсных ограничений:
  - при `error.code = "limit_exceeded"` модель ДОЛЖНА уменьшать объём/сложность кода или разбивать задачу на несколько вызовов;
  - при наличии предупреждения о throttling в `stderr` модель ДОЛЖНА учитывать, что выполнение шло в деградированном режиме.

1.1.3. Prompt/tool-инструкция для модели ДОЛЖНА явно позиционировать `code_exec` как основной рабочий инструмент для вычислений, извлечения данных, преобразований, анализа, проверки и другой программной обработки в рамках turn.

1.1.4. Prompt/tool-инструкция для модели ДОЛЖНА требовать, чтобы перед новым tool call модель сначала проверяла, достаточно ли уже имеющихся результатов инструментов для полезного ответа пользователю.

1.1.5. ЕСЛИ уже собранных результатов инструментов достаточно для ответа, модель НЕ ДОЛЖНА продолжать exploratory tool-loop и ДОЛЖНА переходить к пользовательскому ответу или завершению через `final_answer`.

1.2. КОГДА модель вызывает `code_exec`, ТО система ДОЛЖНА запускать переданный JavaScript-код в sandbox runtime активного агента.

1.2.1. КОГДА модель вызывает `code_exec`, ТО вызов ДОЛЖЕН обрабатываться как tool call в рамках существующего tool-loop (`model -> tools -> model`).

1.3. КОГДА исполнение кода завершается, ТО система ДОЛЖНА возвращать модели структурированный результат выполнения.

1.4. КОГДА модель вызывает `code_exec` несколько раз в рамках одного turn, ТО система ДОЛЖНА корректно обрабатывать каждый вызов и сохранять результат каждого вызова с уникальной корреляцией вызов↔результат.

1.4.1. WHERE tool-loop выполняется последовательно, система ДОЛЖНА сохранять результаты в порядке вызовов модели.

1.4.2. WHERE tool-loop выполняется параллельно, система ДОЛЖНА сохранять корректную корреляцию результатов по идентификатору вызова и SHALL NOT требовать совпадения порядка завершения с порядком вызовов.

1.5. Каждый вызов `code_exec` ДОЛЖЕН исполняться в отдельной sandbox-инстанции (one-call-one-sandbox), без переиспользования runtime между вызовами.

1.5.1. Между разными вызовами `code_exec` НЕ ДОЛЖНО быть разделяемого исполняемого состояния JavaScript.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should support multiple code_exec calls in one turn with callId correlation"
- `tests/functional/code_exec.spec.ts` — "should include terminal code_exec tool result in subsequent model history"

#### Модульные Тесты

- `tests/unit/agents/PromptBuilder.test.ts` — "should include code_exec tool schema and prompt policy instructions"
- `tests/unit/agents/MainPipeline.test.ts` — "should process code_exec calls as kind:tool_call in common tool-loop"

### 2. Безопасность и изоляция исполнения

**ID:** code_exec.2

**User Story:** Как пользователь, я хочу, чтобы выполнение кода было безопасным и изолированным, чтобы код не мог получить доступ к чувствительным данным приложения и системы.

#### Критерии Приемки

2.1. Исполнение `code_exec` ДОЛЖНО происходить в изолированной sandbox-среде Electron с отключенным прямым доступом к Node.js API.

2.2. Sandbox runtime ДОЛЖЕН иметь доступ только к явно разрешённому bridge API.

2.3. Sandbox runtime SHALL NOT иметь прямой доступ к файловой системе, сетевым запросам и БД.

2.3.1. Browser-level сетевые API в sandbox runtime SHALL NOT быть доступны для исходящего трафика: `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, navigation/open redirect (`window.open`, `location.assign`, `location.replace`).

2.3.2. КОГДА sandbox-код пытается использовать запрещённый browser-level сетевой канал, вызов ДОЛЖЕН завершаться контролируемой ошибкой с `status = "error"` и `error.code = "policy_denied"` без выполнения сетевого запроса.

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

2.10.1. Остановка sandbox-кода при shutdown ДОЛЖНА выполняться с timeout завершения `15000` миллисекунд; ЕСЛИ timeout истёк, процесс sandbox ДОЛЖЕН быть принудительно завершён.

2.11. Система ДОЛЖНА ограничивать потребление ресурсов sandbox-выполнения (CPU и оперативная память) в соответствии с лимитами раздела `code_exec.5.4` и `code_exec.5.5`.

2.11.1. Система ДОЛЖНА сообщать модели о лимитах CPU и памяти в prompt/tool-инструкции.

2.11.2. КОГДА sandbox-выполнение приближается к лимитам CPU или памяти, система ДОЛЖНА по возможности ограничивать потребление ресурсов без немедленного падения вызова.

2.11.3. ЕСЛИ ограничение ресурсов не позволяет удержать выполнение в пределах лимитов, вызов ДОЛЖЕН завершаться с `status = "error"` и `error.code = "limit_exceeded"`.

2.11.4. КОГДА применяется best-effort ограничение ресурсов без остановки выполнения, система ДОЛЖНА вернуть модели явный диагностический сигнал в `stderr` о том, что выполнение прошло в режиме ограничений (throttled/degraded mode).

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should timeout long-running code_exec execution and continue loop"
- `tests/functional/code_exec.spec.ts` — "should cancel active code_exec execution without persisting kind:error"
- `tests/functional/code_exec.spec.ts` — "should deny main-pipeline-only and non-allowlisted sandbox tools"
- `tests/functional/code_exec.spec.ts` — "should return policy_denied for window.open and perform no network request"
- `tests/functional/code_exec.spec.ts` — "should return policy_denied for location.assign/replace and perform no network request"
- `tests/functional/code_exec.spec.ts` — "should deny fetch/xhr/websocket/sendBeacon and perform no network request"
- `tests/functional/code_exec.spec.ts` — "should deny multithreading APIs in sandbox runtime"
- `tests/functional/code_exec.spec.ts` — "should shutdown without hanging when code_exec is active"
- `tests/functional/code_exec.spec.ts` — "should return limit_exceeded for memory-heavy code_exec and continue loop"
- `tests/functional/code_exec.spec.ts` — "should execute finite CPU pressure scenario without forced terminal failure"

#### Модульные Тесты

- `tests/unit/code_exec/SandboxBridge.test.ts` — "should enforce allowlist and return policy_denied for forbidden APIs"
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — "should deny multithreading APIs and capture stdout/stderr output channels"
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — "should enforce timeout/cancel/cleanup and shutdown forced-kill fallback"

### 3. Контракт bridge API для модели

**ID:** code_exec.3

**User Story:** Как разработчик, я хочу формализовать API исполнения и доступные методы для модели, чтобы она стабильно и предсказуемо использовала `code_exec`.

#### Критерии Приемки

3.1. Система ДОЛЖНА документировать для модели контракт инструмента `code_exec`:
  - обязательное поле `task_summary` (непустая краткая строка с описанием сути работы, выполняемой данным кодом);
  - обязательное поле `code` (JavaScript строка);
  - опциональное поле `timeout_ms`;
  - ожидаемый результат: `status`, `stdout`, `stderr`, `stdout_truncated`, `stderr_truncated`, `error`.
  - `stdout` ДОЛЖЕН содержать консольный вывод sandbox-кода.
  - `stderr` ДОЛЖЕН содержать диагностический/error вывод sandbox-кода.

3.1.1. Формальный входной контракт `code_exec` ДОЛЖЕН быть задокументирован как JSON schema:
  - `type: object`
  - `additionalProperties: false`
  - `required: ["task_summary", "code"]`
  - `properties.task_summary: string`
  - `properties.code: string`
  - `properties.timeout_ms: integer`

3.1.1.1. Поле `task_summary` ДОЛЖНО содержать краткое описание сути работы, выполняемой через данный вызов `code_exec`.

3.1.1.2. ЕСЛИ `task_summary` отсутствует, не является строкой или после `trim()` пусто, ТО система ДОЛЖНА отклонять вызов контролируемой ошибкой валидации инструмента.

3.1.1.3. Длина `task_summary` после `trim()` ДОЛЖНА быть от `1` до `200` символов включительно.

3.1.1.4. ЕСЛИ длина `task_summary` после `trim()` превышает `200` символов, ТО система ДОЛЖНА отклонять вызов контролируемой ошибкой валидации инструмента.

3.1.2. Формальный выходной контракт `code_exec` ДОЛЖЕН быть задокументирован как структура:
  - `status: "running" | "success" | "error" | "timeout" | "cancelled"`
  - `stdout: string`
  - `stderr: string`
  - `stdout_truncated: boolean`
  - `stderr_truncated: boolean`
  - `error?: { code: string; message: string }`

3.1.2.1. Формальный выходной контракт `code_exec` ДОЛЖЕН быть JSON-объектом (`type: object`).

3.1.2.2. Поле `error.code` ДОЛЖНО использовать фиксированный словарь значений:
  - `policy_denied` — нарушение sandbox policy/allowlist;
  - `sandbox_runtime_error` — ошибка исполнения JavaScript-кода в sandbox;
  - `limit_exceeded` — превышение операционных лимитов (размер/ресурсы/время);
  - `internal_error` — внутренняя ошибка исполнения/bridge/pipeline.

3.1.2.2.1. В chat-flow `invalid_tool_arguments` НЕ ДОЛЖЕН появляться в persisted `output.error.code` для `tool_call(code_exec)`, так как при невалидных аргументах `code_exec` не запускается и persisted `tool_call(code_exec)` не создаётся (см. `llm-integration.11.2.3.*`).

3.1.2.2.2. Для прямого defensive-вызова runtime-слоя (вне chat-flow orchestration) `invalid_tool_arguments` MAY использоваться как диагностический код ошибки валидации входа.

3.1.2.3. Поле `error.message` ДОЛЖНО быть человекочитаемым и достаточным для диагностики причины ошибки моделью.

3.1.2.3.1. Для `error.code = "limit_exceeded"` поле `error.message` ДОЛЖНО содержать конкретную причину превышения лимита и фактический лимит (например, CPU `1 vCPU`, RAM `2 GiB`, размер `code` `30 KiB`).

3.1.2.4. КОГДА вызов `code_exec` прерывается пользователем (cancel/stop), результат ДОЛЖЕН возвращаться с `status = "cancelled"`.

3.1.2.5. КОГДА `status = "running"` ИЛИ `status = "success"`, ТО поле `error` НЕ ДОЛЖНО присутствовать в результате.

3.1.2.6. КОГДА `status = "error"` ИЛИ `status = "timeout"`, ТО поле `error` ДОЛЖНО присутствовать и содержать `error.code` и `error.message`.

3.1.2.7. КОГДА `status = "cancelled"`, ТО поле `error` НЕ ДОЛЖНО присутствовать.

3.1.3. КОГДА модель явно задаёт `timeout_ms` в вызове `code_exec`, ТО система ДОЛЖНА принимать только диапазон от `10000` до `3600000` миллисекунд (от 10 секунд до 1 часа).

3.1.4. ЕСЛИ `timeout_ms` меньше `10000` или больше `3600000`, ТО система ДОЛЖНА отклонять вызов контролируемой ошибкой валидации инструмента.

3.1.5. ЕСЛИ модель не передала `timeout_ms`, ТО система ДОЛЖНА использовать значение по умолчанию `60000` миллисекунд.

3.2. Система ДОЛЖНА документировать для модели только разрешённые runtime API внутри sandbox (например, `console.log`, ограниченный `tools` bridge).

3.2.1. Разрешённые API консоли ДОЛЖНЫ быть перечислены явно: `console.log`, `console.info`, `console.warn`, `console.error`.

3.2.2. КОГДА в allowlist sandbox runtime включён helper `http_request`, ТО система ДОЛЖНА документировать его для модели как разрешённый API `tools.http_request(...)`; детальный контракт данного helper-а ДОЛЖЕН определяться в `docs/specs/sandbox-http-request/*`.

3.2.3. Prompt/tool-инструкция для модели ДОЛЖНА явно указывать, что внутри одного вызова `code_exec` sandbox-код МОЖЕТ выполнять несколько вызовов allowlisted helper-ов, если это необходимо для решения задачи.

3.2.4. Prompt/tool-инструкция для модели ДОЛЖНА явно указывать, что независимые allowlisted helper-вызовы внутри одного `code_exec` МОГУТ выполняться конкурентно через стандартные async-паттерны JavaScript (например, `await Promise.all(...)`), если это не нарушает sandbox policy и лимиты.

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

- `tests/functional/code_exec.spec.ts` — "should support multiple code_exec calls in one turn with callId correlation"
- `tests/functional/code_exec.spec.ts` — "should deny main-pipeline-only and non-allowlisted sandbox tools"
- `tests/functional/code_exec.spec.ts` — "should apply stdout/stderr truncation limits and flags"

#### Модульные Тесты

- `tests/unit/code_exec/CodeExecToolSchema.test.ts` — "should validate code_exec input schema and timeout range/default"
- `tests/unit/code_exec/CodeExecToolSchema.test.ts` — "should reject missing or empty task_summary in code_exec input"
- `tests/unit/code_exec/CodeExecToolSchema.test.ts` — "should reject task_summary longer than 200 characters"
- `tests/unit/agents/PromptBuilder.test.ts` — "should include allowed API, examples and console usage guidance for code_exec"

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

4.5. КОГДА вызов `code_exec` отменяется, persisted `tool_call(code_exec)` ДОЛЖЕН фиксировать `output.status = "cancelled"` и сообщение НЕ ДОЛЖНО скрываться через `messages.hidden = true`.

4.5.1. КОГДА вызов `code_exec` завершён со статусом `cancelled`, persisted `tool_call(code_exec)` ДОЛЖЕН оставаться видимым в истории и его результат ДОЛЖЕН передаваться модели в последующей работе согласно правилам `llm-integration.11.3.1`.

4.6. КОГДА выполнение `code_exec` фактически запущено в sandbox runtime, ТО lifecycle-запись `tool_call(code_exec)` ДОЛЖНА начинаться со статуса `running` и публиковаться через `message.created` до terminal `message.updated`.

4.6.1. Для фактически запущенного `code_exec` единственный допустимый начальный status — `running`.

4.6.2. ЕСЛИ у вызова `code_exec` обнаружены `invalid_tool_arguments` на этапе валидации ответа модели, ТО `code_exec` НЕ ДОЛЖЕН запускаться, persisted `tool_call(code_exec)` НЕ ДОЛЖЕН создаваться (запись `code_exec` НЕ ДОЛЖНА появляться в чате), а pipeline ДОЛЖЕН вернуть ошибку ответа модели (model response validation error) в стандартном error-потоке сообщений.

4.6.3. Статусы `success | error | timeout | cancelled` НЕ ДОЛЖНЫ использоваться как начальный status lifecycle-записи `tool_call(code_exec)`, поскольку они обозначают уже завершённое исполнение.

4.6.4. ЕСЛИ в model-step, где запрошен `code_exec`, отсутствует post-tool `kind: llm` сегмент, ТО `tool_call(code_exec)` со статусом `running` ВСЁ РАВНО ДОЛЖЕН быть видимым в чате до terminal-обновления того же блока.

4.7. Audit-поля lifecycle ДОЛЖНЫ быть монотонными:
  - `started_at` фиксируется один раз при старте и далее НЕ ДОЛЖЕН изменяться;
  - `finished_at` фиксируется один раз при переходе в terminal-состояние;
  - `duration_ms` вычисляется и фиксируется только при переходе в terminal-состояние.

4.8. После перехода `code_exec` в terminal-состояние (`success | error | timeout | cancelled`) дальнейшие изменения `output.status` для этого вызова НЕ ДОЛЖНЫ выполняться.

4.9. После перехода `tool_call(code_exec)` в любой terminal-статус (`success | error | timeout | cancelled`) для него НЕ ДОЛЖНЫ публиковаться дальнейшие lifecycle `message.updated`.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should persist lifecycle audit fields for terminal code_exec"
- `tests/functional/code_exec.spec.ts` — "should publish message.created and message.updated for code_exec lifecycle"

#### Модульные Тесты

- `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` — "should map running/terminal lifecycle with audit fields and done flag"
- `tests/unit/agents/MainPipeline.test.ts` — "should persist tool_call lifecycle and enforce terminal status immutability"

### 5. Операционные лимиты

**ID:** code_exec.5

**User Story:** Как разработчик, я хочу фиксированные лимиты исполнения `code_exec`, чтобы обеспечить предсказуемость производительности и защиту от перегрузок.

#### Критерии Приемки

5.1. Система ДОЛЖНА ограничивать максимальный размер входного поля `code` для одного вызова.

5.1.1. В целевой конфигурации лимит размера входного поля `code` ДОЛЖЕН составлять `30720` байт (`30 KiB`) на один вызов `code_exec`.

5.1.2. Лимит размера входного `code` ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.1.3. КОГДА размер входного `code` превышает лимит, аргументы `code_exec` ДОЛЖНЫ считаться невалидными на этапе валидации tool call (до запуска sandbox-исполнения).

5.1.4. При невалидных аргументах `code_exec` система ДОЛЖНА возвращать модели ошибку валидации аргументов инструмента и выполнять ограниченный retry/repair по правилам `llm-integration.11.2.3.*`.

5.1.5. ЕСЛИ после исчерпания retry/repair аргументы остаются невалидными, turn ДОЛЖЕН завершаться обычной ошибкой модели (`kind: error` в чате), а НЕ terminal-ошибкой `tool_call`.

5.2. Система ДОЛЖНА ограничивать максимальный объём `stdout` и `stderr`, возвращаемых модели.

5.2.1. КОГДА `stdout` или `stderr` превышают лимит, ТО система ДОЛЖНА усекать соответствующий поток, выставлять флаг `stdout_truncated=true` и/или `stderr_truncated=true`, и сохранять оставшийся поток без изменений.

5.2.2. В целевой конфигурации лимит `stdout` ДОЛЖЕН составлять `10240` байт (`10 KiB`) на один вызов `code_exec`.

5.2.3. В целевой конфигурации лимит `stderr` ДОЛЖЕН составлять `10240` байт (`10 KiB`) на один вызов `code_exec`.

5.2.4. Лимиты `stdout`/`stderr` ДОЛЖНЫ быть явно сообщены модели в prompt/tool-инструкции.

5.3. КОГДА модель инициирует параллельные `code_exec` tool calls в одном turn, ТО система ДОЛЖНА поддерживать параллельный запуск отдельных sandbox-инстанций (one-call-one-sandbox) с корректной корреляцией по `callId`.

5.4. Система ДОЛЖНА ограничивать потребление CPU sandbox-выполнения.

5.4.1. В целевой конфигурации лимит CPU sandbox-выполнения ДОЛЖЕН составлять `1` vCPU.

5.4.2. Лимит CPU ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.5. Система ДОЛЖНА ограничивать потребление оперативной памяти sandbox-выполнения.

5.5.1. В целевой конфигурации лимит оперативной памяти sandbox-выполнения ДОЛЖЕН составлять `2147483648` bytes (`2 GiB`).

5.5.2. Лимит памяти ДОЛЖЕН быть явно сообщён модели в prompt/tool-инструкции.

5.6. При срабатывании любого операционного лимита система ДОЛЖНА завершать вызов с `status = "error"` и `error.code = "limit_exceeded"` либо `status = "timeout"` без падения процесса.

5.7. `stdout`/`stderr` (включая усечённые значения и флаги `stdout_truncated`/`stderr_truncated`) ДОЛЖНЫ сохраняться в persisted `tool_call` и ДОЛЖНЫ храниться без автоматической очистки/архивации в рамках данной фичи.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should enforce code size limit for code_exec arguments"
- `tests/functional/code_exec.spec.ts` — "should apply stdout/stderr truncation limits and flags"
- `tests/functional/code_exec.spec.ts` — "should support multiple code_exec calls in one turn with callId correlation"

#### Модульные Тесты

- `tests/unit/code_exec/OutputLimiter.test.ts` — "should truncate stdout/stderr and set truncated flags correctly"
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — "should apply CPU/RAM limit policy and produce limit_exceeded when containment fails"

### 6. Тестируемость и покрытие

**ID:** code_exec.6

**User Story:** Как разработчик, я хочу получить модульные и функциональные тесты новой фичи, чтобы контролировать регрессии и безопасность исполнения.

#### Критерии Приемки

6.1. Для `code_exec` ДОЛЖНЫ быть добавлены модульные тесты main/runtime/pipeline слоёв.

6.2. Для `code_exec` ДОЛЖНЫ быть добавлены функциональные тесты пользовательских execution-сценариев.

6.3. Тесты ДОЛЖНЫ покрывать success, error, timeout, cancel и policy-denied сценарии.

6.4. Новые тесты SHALL NOT использовать `.skip()` и `.only()`.

6.5. Детальный тест-план (перечень сценариев, файлов и приоритетов реализации) ДОЛЖЕН задаваться в `docs/specs/code_exec/design.md` и `docs/specs/code_exec/tasks.md`, без дублирования в данном документе.

6.6. Соответствие требований `code_exec.*` тестам ДОЛЖНО фиксироваться в таблице покрытия в `docs/specs/code_exec/design.md`.

#### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — "should return limit_exceeded for memory-heavy code_exec and continue loop"
- `tests/functional/llm-chat.spec.ts` — "should continue to next model step after terminal code_exec tool result"
