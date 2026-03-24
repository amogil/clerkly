# Дизайн: code_exec

## Обзор

Фича `code_exec` добавляет в LLM-пайплайн инструмент `code_exec`, позволяющий модели выполнять JavaScript-код в изолированной среде Electron.
Архитектура следует принципу минимальной привилегии: sandbox не имеет прямого доступа к привилегированным ресурсам, а все привилегированные операции проходят через main process с валидацией политик.
UI-визуализация исполнения описывается в `docs/specs/agents/*` и не входит в scope данного документа.

## Архитектура

### Компоненты

- **"CodeExecFeature" (Prompt layer)**
  - добавляет системную инструкцию и tool schema `code_exec`;
  - фиксирует prompt-level иерархию, где `code_exec` является основным рабочим инструментом, а новые tool calls делаются только при наличии конкретного пробела в данных или обработке;
  - явно разводит внешний LLM tool-loop (`max 1 tool_call` на один ответ модели) и внутренние sandbox helper-вызовы внутри одного `code_exec`, которые могут быть множественными и при необходимости конкурентными.
- **"MainPipeline" (Main Process)**
  - обрабатывает tool call `code_exec`;
  - инициирует lifecycle persisted-сообщения выполнения;
  - направляет код в sandbox runtime;
  - сохраняет финальный результат и публикует snapshot-события.
- **"SandboxSessionManager" (Main Process)**
  - управляет lifecycle sandbox на один вызов `code_exec`;
  - создаёт отдельную sandbox-инстанцию на каждый вызов (без reuse между вызовами);
  - реализует timeout, cancel и гарантированную очистку после завершения вызова.
- **"SandboxBridge" (Shared policy module)**
  - хранит централизованный allowlist/policy-правила sandbox tools;
  - публикует разрешённые helper-ы sandbox runtime, включая `tools.http_request(...)` и `tools.web_search(...)`, когда они включены в allowlist;
  - контракт и маршрутизация `web_search` helper-а описаны в `docs/specs/sandbox-web-search/*`;
  - используется runtime и unit-тестами как единый source of truth.
- **"SandboxRuntime" (Sandbox Renderer)**
  - исполняет JavaScript-код;
  - получает preload bridge `codeExecSandbox.js`, который публикует allowlisted bridge API в `globalThis.__sandboxBridge`;
  - применяет runtime hardening поверх preload bridge и собирает `stdout/stderr/error`;
  - возвращает результат в main.

## Контракт данных

### Persisted сообщение исполнения кода

Для исполнения `code_exec` используется существующий persisted формат `kind: tool_call` c `toolName: "code_exec"`.

Рекомендуемая структура payload:

```json
{
  "data": {
    "callId": "call-code-exec-1",
    "toolName": "code_exec",
    "arguments": {
      "task_summary": "Calculate and print hello-world output",
      "code": "console.log('hello')",
      "timeout_ms": 10000
    },
    "output": {
      "status": "running | success | error | timeout | cancelled",
      "stdout": "hello\n",
      "stderr": "",
      "stdout_truncated": false,
      "stderr_truncated": false,
      "started_at": "2026-03-10T10:00:00+01:00",
      "finished_at": "2026-03-10T10:00:01+01:00",
      "duration_ms": 1000
    }
  }
}
```

`output.error` добавляется только для terminal-состояний `error` и `timeout`.
В chat-flow persisted `tool_call(code_exec)` не использует `error.code = "invalid_tool_arguments"`: невалидные аргументы отбрасываются на pipeline-validation этапе до запуска инструмента и до создания записи `tool_call`.
Defensive runtime-валидация (`SandboxSessionManager.execute` при прямом вызове) может возвращать `invalid_tool_arguments` как локальный диагностический код.

Lifecycle:
- если sandbox runtime фактически стартовал: создание сообщения `status=running`, `done=false`;
- если `invalid_tool_arguments` выявлены на этапе валидации ответа модели до запуска инструмента: persisted `tool_call(code_exec)` не создаётся;
- завершение: terminal status, `done=true`.
- `done` хранится в колонке `messages.done` (кросс-типовой lifecycle-флаг), а статус инструмента хранится в `payload_json.data.output.status`.
- `started_at` фиксируется только при старте и далее не изменяется.
- `finished_at` и `duration_ms` фиксируются только при terminal-переходе.
- После terminal-перехода (`success|error|timeout|cancelled`) повторные изменения `output.status` не выполняются.

### Realtime события

Для `code_exec` используются стандартные snapshot-события:
- `message.created`
- `message.updated`

Отдельные custom-события для `code_exec` не требуются в базовом дизайне, чтобы сохранить единый поток доставки через snapshot-контракт.
Для lifecycle `code_exec` публикуются следующие snapshot-пути:
- runtime-путь: `message.created` со стартовым `status=running`, затем `message.updated` с terminal-статусом (`success|error|timeout|cancelled`);
- invalid-arguments путь: lifecycle-снимки `tool_call(code_exec)` не публикуются, так как сам `tool_call` не создаётся.
После terminal-перехода дальнейшие lifecycle `message.updated` для этого вызова не публикуются.

## Потоки выполнения

### 1. Модель вызывает `code_exec`

1. `MainPipeline` получает `tool_call` с `toolName=code_exec`.
2. `MainPipeline` валидирует аргументы `code_exec` до запуска инструмента.
3. Если аргументы невалидны (`invalid_tool_arguments`), `tool_call(code_exec)` не создаётся, sandbox не запускается, pipeline формирует model response validation error.
4. Если аргументы валидны, `MainPipeline` создаёт persisted `kind: tool_call` сообщение (`toolName=code_exec`, `running`).
5. `SandboxSessionManager` создаёт отдельную sandbox-инстанцию для текущего вызова.
6. `SandboxRuntime` получает session-scoped preload bridge и выполняет код с доступом только к allowlisted helper-ам.
7. `MainPipeline` обновляет то же сообщение до terminal status.
8. Sandbox-инстанция текущего вызова очищается и уничтожается.

### 2. Timeout

1. При старте исполнения запускается watchdog таймер.
2. При превышении лимита `SandboxSessionManager` отменяет выполнение.
3. Сообщение обновляется со статусом `timeout`.

### 3. Cancel

1. Пользователь/система инициирует cancel активного turn.
2. Активное `code_exec` исполнение прерывается.
3. Сообщение обновляется со статусом `cancelled`, остаётся видимым в истории и используется в последующем model-context.

### 4. Закрытие приложения во время исполнения

1. Пользователь закрывает приложение при активном `code_exec`.
2. `SandboxSessionManager` инициирует штатную остановку sandbox-инстанции с timeout завершения `15000` миллисекунд.
3. Если timeout завершения истёк, sandbox-процесс принудительно завершается.
4. Shutdown завершается без зависаний, а sandbox resources очищаются.

## Безопасность

### Принципы

- sandbox window запускается с `contextIsolation=true`, `nodeIntegration=false`, sandbox-режимом и preload bridge entry для session-scoped allowlisted helper-ов.
- sandbox API ограничен whitelist-методами.
- любые привилегированные операции валидируются в main process.

### Ограничения

- Прямой `fs` доступ: запрещён.
- Прямой network доступ: запрещён.
- Доступ к БД: запрещён.
- Node.js globals в sandbox runtime недоступны (`process`, `require`, `module`, `Buffer`, `__dirname`, `__filename`).
- Неизвестные IPC каналы: запрещены.
- Лимит времени исполнения обязателен.
- Многопоточность JavaScript запрещена (`Worker`, `SharedWorker`, `ServiceWorker`, `Worklet`).

### Enforcement browser-level network egress

Для выполнения требований `code_exec.2.3.1-2.3.2` используется multi-layer защита:

1. `session.webRequest` в sandbox partition:
   - `onBeforeRequest` отменяет любые исходящие запросы (`http/https/ws/wss`, beacon, навигационные загрузки);
   - отмена выполняется до отправки запроса, гарантия: request не покидает процесс sandbox.
2. Navigation hardening:
   - `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`;
   - обработчики `will-navigate`/`will-redirect` блокируют переходы.
   - runtime hardening перехватывает `window.open`, `location.assign`, `location.replace` и нормализует попытку в policy-denied результат;
   - policy-событие нормализуется в terminal результат tool call: `status="error"` + `error.code="policy_denied"` + диагностический `error.message`, без сетевого egress.
3. Permission hardening:
   - `session.setPermissionRequestHandler` и `setPermissionCheckHandler` возвращают deny для всех permission-based сетевых каналов.
4. Runtime hardening в sandbox injected script:
   - блокировка browser-level API `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`;
   - при попытке вызова возвращается контролируемая ошибка `policy_denied`.
5. CSP:
   - sandbox document устанавливается с `connect-src 'none'` и запретом внешних источников для сетевых подключений.

Итоговый инвариант: no-request-leaves-sandbox для browser-level egress путей.

Трассировка в требования и тесты:
- `code_exec.2.3.1` покрывается блокировкой API/навигации на уровнях runtime (`fetch/xhr/websocket/sendBeacon`) и browser/session (`webRequest`, `window.open`, navigation handlers, permissions, CSP).
- `code_exec.2.3.2` покрывается требованием контролируемого отказа `status="error"` + `error.code="policy_denied"` без сетевого egress, включая navigation/open попытки (`window.open`, `location.assign`, `location.replace`).
- Функциональная верификация выполняется сценарием `tests/functional/code_exec.spec.ts` — "should deny browser-level network APIs (fetch/xhr/websocket/sendBeacon/navigation) with policy_denied", где дополнительно проверяется отсутствие исходящего запроса.

### Валидации main process

- Проверка соответствия `agentId` и sandbox session.
- Проверка размера code payload.
- Проверка разрешённых инструментов/методов.
- Нормализация ошибок в контролируемый доменный формат.

### Закрытый список тулов sandbox runtime

- JavaScript-код в sandbox runtime работает только через отдельный allowlist тулов (`SANDBOX_JS_TOOLS_ALLOWLIST`).
- Helper `tools.http_request(...)`, если он включён в allowlist, является частью этого sandbox API и описывается профильной спецификацией `docs/specs/sandbox-http-request/*`.
- Tool calls из основного pipeline потока (`MainPipeline` tool-loop) не прокидываются в sandbox bridge и недоступны для прямого вызова из JavaScript.
- Любой вызов инструмента вне allowlist завершается `status=error` с `error.code='policy_denied'`.
- Allowlist хранится централизованно и используется всеми проверками bridge/gateway.

### Операционные лимиты (политика)

- `code_exec_timeout_ms_policy_cap`: 3600000 ms
- `code_exec_timeout_ms_min`: 10000 ms
- `code_exec_timeout_ms_default`: 60000 ms
- `code_exec_max_code_bytes`: 30720 bytes
- `code_exec_max_stdout_bytes`: 10240 bytes
- `code_exec_max_stderr_bytes`: 10240 bytes
- `code_exec_sandbox_cpu_limit`: 1 vCPU
- `code_exec_sandbox_memory_limit_bytes`: 2147483648 bytes (2 GiB)

Правило truncation output:
- При превышении лимита `stdout` и/или `stderr` соответствующий поток усекается до лимита.
- Для усечённого потока выставляется флаг `stdout_truncated` и/или `stderr_truncated`.
- Потоки `stdout` и `stderr` всегда сохраняются и возвращаются раздельно.

Информирование модели о лимитах:
- prompt/tool-инструкция явно сообщает модели лимиты `timeout_ms`, `code` size, `stdout/stderr`, а также ограничения CPU/памяти sandbox.
- prompt/tool-инструкция явно сообщает, что `code_exec` является основным рабочим инструментом turn для программной обработки, а не вспомогательной опцией “на случай необходимости”.
- prompt/tool-инструкция явно требует оценивать достаточность уже полученных tool results перед новым exploratory вызовом.
- prompt/tool-инструкция явно сообщает, что несколько allowlisted helper-вызовов внутри одного `code_exec` допустимы и что независимые helper-вызовы могут выполняться конкурентно через обычные async-механизмы JavaScript.
- prompt/tool-инструкция явно сообщает, что Node.js globals (`process`, `require`, `module`, `Buffer`, `__dirname`, `__filename`) недоступны в sandbox runtime.

Политика классификации ошибок sandbox policy:
- распознаваемые нарушения sandbox policy нормализуются в terminal `status=error` с `error.code='policy_denied'`;
- попытки использования Node.js globals возвращаются как контролируемый `policy_denied`;
- обычные runtime-ошибки пользовательского JavaScript-кода остаются `sandbox_runtime_error`.

Политика превышения CPU/памяти:
Политика превышения CPU/памяти в текущей реализации:
- лимиты CPU/RAM фиксируются как контрактные значения и сообщаются модели через prompt/tool-инструкции;
- при приближении к лимитам включается best-effort containment без немедленной остановки выполнения;
- при успешном завершении в режиме containment в `stderr` добавляется диагностическое предупреждение о degraded-mode;
- при превышении лимитов, которое не удаётся удержать, результат нормализуется в terminal `status=error` с `error.code='limit_exceeded'`.

### Best-effort monitor loop (Electron sandbox)

`SandboxSessionManager` выполняет периодический мониторинг sandbox-процесса с интервалом `200` мс (`CODE_EXEC_LIMITS.monitorIntervalMs`):

1. Читает метрики процесса sandbox через `app.getAppMetrics()` (CPU usage и RSS memory по PID sandbox renderer).
2. Сравнивает значения с порогами:
   - near-limit (soft): CPU `>= 85%` от `1 vCPU`, RAM `>= 90%` от `2 GiB`;
   - hard-limit: CPU `> 120%` от `1 vCPU` (sampling tolerance), RAM `> 2 GiB`.
3. При near-limit применяет best-effort containment:
   - включает `webContents.setBackgroundThrottling(true)`;
   - помечает вызов как degraded для последующей диагностической записи в `stderr`.
4. При hard-limit принудительно завершает sandbox-выполнение и возвращает terminal результат:
   - `status = error`
   - `error.code = limit_exceeded`
   - `error.message` с конкретным превышенным лимитом (CPU/RAM) и наблюдённым значением.

### Как проблема сообщается модели

Канал 1 (фатальный):
- при ресурсной ошибке sandbox runtime модель получает terminal-результат:
  - `status = "error"`
  - `error.code = "limit_exceeded"`
- `error.message` с конкретикой (`CPU 1 vCPU` / `RAM 2 GiB` / `code size 30 KiB`).

Канал 2 (нефатальный):
- если execution удержан в пределах лимитов за счёт containment, в `stderr` добавляется предупреждение degraded-mode (throttling diagnostic).
- результат остается terminal по доменному исходу выполнения (`success` или `error` пользовательского кода), без подмены в `limit_exceeded`.

## Стратегия тестирования

### Модульные Тесты

- `tests/unit/agents/MainPipeline.test.ts` — lifecycle `running -> terminal`, mapping `error.code`, cancel/timeout, дедупликация по `callId`, terminal-immutability.
- `tests/unit/agents/PromptBuilder.test.ts` — наличие `code_exec` tool schema, обязательного `task_summary` (1..200 символов) и правил для модели (`timeout`, `code size`, `stdout/stderr`, CPU/RAM).
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — one-call-one-sandbox, timeout, cancel, cleanup, shutdown timeout `15000`.
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — preload bridge bootstrap через `app.getAppPath()` и доступность `window.tools.http_request(...)` внутри sandbox runtime.
- `tests/unit/code_exec/SandboxBridge.test.ts` — allowlist enforcement, запрет main-pipeline-only tools, `policy_denied`.
- `tests/unit/code_exec/SandboxPolicy.test.ts` — browser/session policy hardening (`webRequest`, permissions, navigation, CSP/network deny).
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — capture `console.*`, раздельные `stdout/stderr`, запрет multithreading API.
- `tests/unit/code_exec/SandboxSessionManager.test.ts` — policy mapping для Node.js globals (`process`, `require`, `module`, `Buffer`, `__dirname`, `__filename`) в `policy_denied`.
- `tests/unit/code_exec/OutputLimiter.test.ts` — лимиты `stdout/stderr`, truncation, флаги `stdout_truncated`/`stderr_truncated`.
- `tests/unit/code_exec/CodeExecToolSchema.test.ts` — валидация `task_summary` (1..200 символов), `code`, `timeout_ms` диапазона и `additionalProperties=false`.
- `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` — запись `started_at`, `finished_at`, `duration_ms`, переход `done=false/true`.

### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — end-to-end запуск `code_exec` + возврат `stdout/stderr`.
- `tests/functional/code_exec.spec.ts` — невалидные аргументы `code_exec` с bounded retry/repair и финальным `kind:error`.
- `tests/functional/code_exec.spec.ts` — несколько вызовов в одном turn (включая параллельные) и корреляция по `callId`.
- `tests/functional/code_exec.spec.ts` — persisted lifecycle/audit поля (`started_at`, `finished_at`, `duration_ms`) для terminal `code_exec`.
- `tests/functional/code_exec.spec.ts` — browser-level безопасность (`policy_denied` для `window.open`, `location.assign`, `location.replace`).
- `tests/functional/code_exec.spec.ts` — sandbox Node.js globals safety (`policy_denied` для `process`/`require`/`module`/`Buffer`/`__dirname`/`__filename`).
- `tests/functional/code_exec.spec.ts` — browser-level network egress enforcement (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `window.open`, `location.assign`, `location.replace` блокируются с `policy_denied`, без исходящих запросов).
- `tests/functional/code_exec.spec.ts` — лимиты `code`/`stdout`/`stderr` и truncated-флаги.
- `tests/functional/code_exec.spec.ts` — timeout/cancel/shutdown lifecycle и `limit_exceeded` сигналы по ресурсоёмким сценариям.
- `tests/functional/code_exec.spec.ts` — resource-monitor diagnostics under CPU pressure (degraded stderr path либо terminal `limit_exceeded` containment-fail path).
- `tests/functional/code_exec.spec.ts` — integration в общий `kind:tool_call` pipeline и продолжение цикла `model -> tools -> model`.
- `tests/functional/llm-chat.spec.ts` — terminal `tool_call` включаются в model history, non-terminal не включаются, pipeline продолжает следующий шаг `model`.

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| code_exec.1.1-1.1.2 | `tests/unit/agents/PromptBuilder.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.1.2-1.3 | `tests/unit/agents/MainPipeline.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.1.4-1.4.2 | `tests/unit/agents/MainPipeline.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.1.5-1.5.1 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.2.1-2.4 | `tests/unit/code_exec/SandboxBridge.test.ts`, `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.2.4.1 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.2.5-2.6 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | - |
| code_exec.2.7-2.8.2 | `tests/unit/code_exec/SandboxBridge.test.ts` | - |
| code_exec.2.9-2.9.1 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | - |
| code_exec.2.10-2.10.1 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | - |
| code_exec.2.11-2.11.4 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` покрывает both degraded stderr path and `limit_exceeded` terminal-path |
| code_exec.3.1-3.1.1 | `tests/unit/code_exec/CodeExecToolSchema.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.3.1.2-3.1.2.7 | `tests/unit/code_exec/CodeExecToolSchema.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.3.1.3-3.1.5 | `tests/unit/code_exec/CodeExecToolSchema.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.3.2-3.3 | `tests/unit/agents/PromptBuilder.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.3.4-3.5 | `tests/unit/code_exec/SandboxBridge.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.3.6-3.7.1 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.4.1-4.1.2 | `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.4.2-4.4 | `tests/unit/agents/MainPipeline.test.ts` | - |
| code_exec.4.5-4.6 | `tests/unit/agents/MainPipeline.test.ts`, `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.4.7-4.9 | `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.5.1-5.1.5 | `tests/unit/code_exec/CodeExecToolSchema.test.ts`, `tests/unit/agents/MainPipeline.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.5.2-5.2.4 | `tests/unit/code_exec/OutputLimiter.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.5.3 | `tests/unit/agents/MainPipeline.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.5.4-5.6 | `tests/unit/code_exec/SandboxSessionManager.test.ts` | - |
| code_exec.5.7 | `tests/unit/code_exec/CodeExecPersistenceMapper.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.6.1-6.2 | `tests/unit/agents/MainPipeline.test.ts`, `tests/unit/code_exec/*.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.6.3 | `tests/unit/agents/MainPipeline.test.ts`, `tests/unit/code_exec/SandboxSessionManager.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.6.4 | `tests/unit/agents/MainPipeline.test.ts`, `tests/unit/code_exec/*.test.ts` | `tests/functional/code_exec.spec.ts` |
| code_exec.6.5-6.6 | `tests/unit/code_exec/*.test.ts` | `tests/functional/code_exec.spec.ts`, `tests/functional/llm-chat.spec.ts` |
