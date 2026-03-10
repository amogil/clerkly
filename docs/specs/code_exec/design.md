# Дизайн: code_exec

## Обзор

Фича `code_exec` добавляет в LLM-пайплайн инструмент `code_exec`, позволяющий модели выполнять JavaScript-код в изолированной среде Electron.
Архитектура следует принципу минимальной привилегии: sandbox не имеет прямого доступа к привилегированным ресурсам, а все привилегированные операции проходят через main process с валидацией политик.
UI-визуализация исполнения описывается в `docs/specs/agents/*` и не входит в scope данного документа.

## Архитектура

### Компоненты

- **"CodeExecFeature" (Prompt layer)**
  - добавляет системную инструкцию и tool schema `code_exec`.
- **"MainPipeline" (Main Process)**
  - обрабатывает tool call `code_exec`;
  - инициирует lifecycle persisted-сообщения выполнения;
  - направляет код в sandbox runtime;
  - сохраняет финальный результат и публикует snapshot-события.
- **"SandboxSessionManager" (Main Process)**
  - управляет lifecycle sandbox на один вызов `code_exec`;
  - создаёт отдельную sandbox-инстанцию на каждый вызов (без reuse между вызовами);
  - реализует timeout, cancel и гарантированную очистку после завершения вызова.
- **"SandboxBridge" (Preload для sandbox window)**
  - предоставляет строго ограниченный API;
  - проксирует только разрешённые вызовы в main IPC.
- **"SandboxRuntime" (Sandbox Renderer)**
  - исполняет JavaScript-код;
  - собирает `stdout/stderr/error`;
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
      "code": "console.log('hello')",
      "timeout_ms": 10000
    },
    "output": {
      "status": "running | success | error | timeout",
      "stdout": "hello\n",
      "stderr": "",
      "stdout_truncated": false,
      "stderr_truncated": false,
      "started_at": "2026-03-10T10:00:00+01:00",
      "finished_at": "2026-03-10T10:00:01+01:00",
      "duration_ms": 1000,
      "error": {
        "code": "",
        "message": ""
      }
    }
  }
}
```

Lifecycle:
- создание сообщения: `status=running`, `done=false`;
- завершение: terminal status, `done=true`.
- `done` хранится в колонке `messages.done` (кросс-типовой lifecycle-флаг), а статус инструмента хранится в `payload_json.data.output.status`.
- `started_at` фиксируется только при старте и далее не изменяется.
- `finished_at` и `duration_ms` фиксируются только при terminal-переходе.
- После terminal-перехода (`success|error|timeout`) повторные изменения `output.status` не выполняются.

### Realtime события

Для `code_exec` используются стандартные snapshot-события:
- `message.created`
- `message.updated`

Отдельные custom-события для `code_exec` не требуются в базовом дизайне, чтобы сохранить единый поток доставки через snapshot-контракт.
ПОКА вызов находится в `status=running`, `message.updated` используется также как heartbeat/progress-апдейт для поддержания актуальности UI.
После установки `hidden=true` (cancel flow) дальнейшие heartbeat/progress `message.updated` для этого вызова не публикуются.

## Потоки выполнения

### 1. Модель вызывает `code_exec`

1. `MainPipeline` получает `tool_call` с `toolName=code_exec`.
2. `MainPipeline` создаёт persisted `kind: tool_call` сообщение (`toolName=code_exec`, `running`).
3. `SandboxSessionManager` создаёт отдельную sandbox-инстанцию для текущего вызова.
4. `SandboxRuntime` выполняет код и формирует результат.
5. `MainPipeline` обновляет то же сообщение до terminal status.
6. Sandbox-инстанция текущего вызова очищается и уничтожается.

### 2. Timeout

1. При старте исполнения запускается watchdog таймер.
2. При превышении лимита `SandboxSessionManager` отменяет выполнение.
3. Сообщение обновляется со статусом `timeout`.

### 3. Cancel

1. Пользователь/система инициирует cancel активного turn.
2. Активное `code_exec` исполнение прерывается.
3. Сообщение помечается `hidden=true`; отдельное состояние отмены в output не используется.

### 4. Закрытие приложения во время исполнения

1. Пользователь закрывает приложение при активном `code_exec`.
2. `SandboxSessionManager` выполняет принудительную остановку sandbox-инстанции.
3. Shutdown завершается без зависаний, а sandbox resources очищаются.

## Безопасность

### Принципы

- sandbox window запускается с `contextIsolation=true`, `nodeIntegration=false`, sandbox-режимом и отдельным preload.
- sandbox API ограничен whitelist-методами.
- любые привилегированные операции валидируются в main process.

### Ограничения

- Прямой `fs` доступ: запрещён.
- Прямой network доступ: запрещён.
- Доступ к БД: запрещён.
- Неизвестные IPC каналы: запрещены.
- Лимит времени исполнения обязателен.
- Многопоточность JavaScript запрещена (`Worker`, `SharedWorker`, `ServiceWorker`, `Worklet`).

### Валидации main process

- Проверка соответствия `agentId` и sandbox session.
- Проверка размера code payload.
- Проверка разрешённых инструментов/методов.
- Нормализация ошибок в контролируемый доменный формат.

### Закрытый список тулов sandbox runtime

- JavaScript-код в sandbox runtime работает только через отдельный allowlist тулов (`SANDBOX_JS_TOOLS_ALLOWLIST`).
- Tool calls из основного pipeline потока (`MainPipeline` tool-loop) не прокидываются в sandbox bridge и недоступны для прямого вызова из JavaScript.
- Любой вызов инструмента вне allowlist завершается `status=error` с `error.code='policy_denied'`.
- Allowlist хранится централизованно и используется всеми проверками bridge/gateway.

### Операционные лимиты (политика)

- `code_exec_timeout_ms_policy_cap`: 3600000 ms
- `code_exec_timeout_ms_min`: 10000 ms
- `code_exec_timeout_ms_default`: 60000 ms
- `code_exec_max_code_bytes`: 262144 bytes
- `code_exec_max_stdout_bytes`: 1048576 bytes
- `code_exec_max_stderr_bytes`: 1048576 bytes
- `code_exec_sandbox_cpu_limit`: задаётся конфигурацией исполнения sandbox
- `code_exec_sandbox_memory_limit_bytes`: задаётся конфигурацией исполнения sandbox

Правило truncation output:
- При превышении лимита `stdout` и/или `stderr` соответствующий поток усекается до лимита.
- Для усечённого потока выставляется флаг `stdout_truncated` и/или `stderr_truncated`.
- Потоки `stdout` и `stderr` всегда сохраняются и возвращаются раздельно.

Информирование модели о лимитах:
- prompt/tool-инструкция явно сообщает модели лимиты `timeout_ms`, `code` size, `stdout/stderr`, а также ограничения CPU/памяти sandbox.

## Стратегия тестирования

### Модульные Тесты

- `tests/unit/agents/MainPipeline.test.ts` — обработка `code_exec` lifecycle, timeout/cancel/error.
- `tests/unit/agents/PromptBuilder.test.ts` — наличие `code_exec` feature/tool schema.
- `tests/unit/.../SandboxSessionManager.test.ts` — управление сессиями, timeout, cleanup.

### Функциональные Тесты

- `tests/functional/code_exec.spec.ts` — end-to-end запуск `code_exec`.
- `tests/functional/code_exec.spec.ts` — безопасность (`status=error` + `error.code=policy_denied` для неразрешённого доступа).
- `tests/functional/code_exec.spec.ts` — timeout/cancel сценарии.

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| code_exec.1 | ✓ | ✓ |
| code_exec.2 | ✓ | ✓ |
| code_exec.3 | ✓ | ✓ |
| code_exec.4 | ✓ | ✓ |
| code_exec.5 | ✓ | ✓ |
| code_exec.6 | ✓ | ✓ |
