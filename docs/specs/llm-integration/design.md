# Документ Дизайна: LLM Integration

## Фокус Документа

Этот документ описывает только дизайн runtime-интеграции с LLM:
- orchestration с ограничением `max 1 tool_call` на один ответ модели в `MainPipeline`;
- provider-адаптеры на базе `Vercel AI SDK` и единый `ChatChunk` контракт;
- persisted/runtime контракты сообщений (`kind`, `done`, `tool_call`, `usage_json`) и поток realtime-событий для LLM.

В документ НЕ входят:
- UI/рендеринг и визуальные состояния чата (см. `docs/specs/agents/*`);
- транспортные и подписочные детали общей event-системы вне LLM-контекста (см. `docs/specs/realtime-events/*`);
- sandbox/policy детали инструмента `code_exec` (см. `docs/specs/code_exec/*`).

## Обзор

LLM Integration обеспечивает полный цикл взаимодействия с AI: от отправки user-сообщения до получения, обработки и сохранения streaming-ответа с reasoning. Архитектура расширяема — `PromptBuilder` с фичами и стратегиями истории позволяет добавлять новые возможности без изменения core-логики.
Целевая оркестрация выполняется через `Vercel AI SDK` для всех провайдеров (`OpenAI`, `Anthropic`, `Google`) с единым контрактом стриминга и tool-loop.
Документ `llm-integration` описывает только runtime-логику взаимодействия с LLM и не содержит требований/дизайна интерфейса.

### Целевая Архитектура LLM Loop

- `MainPipeline` управляет жизненным циклом turn и не содержит провайдер-специфичной логики стриминга.
- `LLMProviderFactory` создаёт провайдерные адаптеры, построенные поверх `Vercel AI SDK`.
- Провайдеры нормализуют SDK-чанки в единый внутренний `ChatChunk` контракт (`reasoning`, `text`, `tool_call`, `tool_result`, `turn_error`).
- `MainPipeline` эмитит `message.llm.reasoning.updated`, `message.llm.text.updated` и snapshot `message.created`/`message.updated` для persisted сообщений (включая `kind:tool_call`).
- `ToolRunner` исполняет не более одного вызова инструмента на один ответ модели и возвращает результат в следующий шаг `model`.
- provider-layer использует явный safety bound числа шагов SDK-managed tool-loop (`stepCountIs(AI_SDK_MAX_STEPS)`; текущая реализация `AI_SDK_MAX_STEPS = 100000`), чтобы continuation не обрывалась после первого `tool_result`, при этом доменное завершение turn по-прежнему определяется исходами orchestration (`final_answer`, ошибка, `abort/cancel`), а не самим safety bound в штатных сценариях.
- Извлечение auto-title для агента выполняется в том же model-turn из markdown-ответа (`<!-- clerkly:title-meta: ... -->`) без отдельного LLM-запроса.

### Канонический реестр инструментов (tool registry)

Канонический список `toolName` для tool-loop определяется в `llm-integration` и используется как source of truth для runtime-контрактов:
- `final_answer`
- `code_exec`

Другие спецификации ссылаются на этот список и не переопределяют его самостоятельно.

---

## Схема Базы Данных

### Таблица `messages`

**Целевая схема:**

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  kind TEXT NOT NULL,
  run_id TEXT,
  attempt_id INTEGER,
  sequence INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  reply_to_message_id INTEGER,
  payload_json TEXT NOT NULL,
  usage_json TEXT
);
```

### Семантика `done`

- Колонка `done` присутствует в `messages` как обязательный флаг завершённости сообщения.
- Для сообщений `kind:error` значение `done` равно `1`.
- Для сообщений, которые находятся в процессе формирования (например, streaming `kind:llm`), значение `done` равно `0`.
- Для полностью сформированных сообщений `done` равно `1`.
- Для `kind:llm` с финальным ответом (`data.text`) значение `done` равно `1`.

### Правило `reply_to_message_id`

- Первое сообщение в чате агента сохраняется с `reply_to_message_id = NULL`.
- Каждое следующее сообщение сохраняется со ссылкой на `id` предыдущего сообщения этого агента.
- Для `MainPipeline.run(agentId, userMessageId)` все создаваемые сообщения пайплайна (`kind: llm`, `kind: error`) используют `reply_to_message_id = userMessageId`.

---

## Форматы Сообщений

`reply_to_message_id` хранится в колонке `messages.reply_to_message_id` и не входит в payload JSON.

### kind: user

```json
{
  "data": {
    "text": "Hello"
  }
}
```

### kind: llm

```json
{
  "data": {
    "reasoning": { "text": "...", "excluded_from_replay": true },
    "text": "Hi! How can I help?"
  }
}
```

Финальный текст ответа в chat-flow хранится в `data.text`.

`messages.usage_json` хранит usage-envelope отдельно от `payload_json`:

```json
{
  "canonical": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150,
    "cached_tokens": 80,
    "reasoning_tokens": 30
  },
  "raw": {
    "...provider specific usage payload...": true
  }
}
```

При прерывании активного стриминга `kind: llm` сообщение помечается `hidden: true` в колонке `messages.hidden`:

```json
{
  "id": 124,
  "kind": "llm",
  "done": false,
  "hidden": true,
  "payload": {
    "data": {
      "reasoning": { "text": "частичный...", "excluded_from_replay": true }
    }
  }
}
```

### kind: error

```json
{
  "data": {
    "error": {
      "type": "auth",
      "message": "Invalid API key. Please check your key and try again.",
      "action_link": { "label": "Open Settings", "screen": "settings" }
    }
  }
}
```

`kind: error` сообщения всегда сохраняются как завершённые (`done: true`).

Для ошибок без action_link (network, provider, timeout):

```json
{
  "data": {
    "error": { "type": "network", "message": "Network error. Please check your internet connection." }
  }
}
```

Для отсутствующего API ключа (контракт тот же, другое сообщение):

```json
{
  "data": {
    "error": {
      "type": "auth",
      "message": "API key is not set. Add it in Settings to continue.",
      "action_link": { "label": "Open Settings", "screen": "settings" }
    }
  }
}
```

### kind: tool_call (final_answer)

```json
{
  "data": {
    "toolName": "final_answer",
    "arguments": {
      "summary_points": ["Completed A", "Completed B", "Completed C"]
    }
  }
}
```

Контракт `final_answer` валидируется через strict-schema инструмента в `Vercel AI SDK`:
- `summary_points`: обязательный массив длиной `1..10`;
- каждый пункт `summary_points`: непустая строка (после `trim`) длиной `<= 200`.
- служебные metadata comments `<!-- clerkly:title-meta: ... -->` относятся только к обычному `kind: llm` markdown/text ответу и не являются допустимым содержимым других payload-контрактов turn.
Невалидный `final_answer` не фиксируется как завершённый: retry/repair выполняется на стороне AI SDK; при исчерпании лимита создаётся `kind:error`.
`reply_to_message_id` хранится в колонке `messages.reply_to_message_id` и передаётся в `MessageSnapshot` отдельным полем, не внутри payload.

### kind: tool_call (code_exec)

```json
{
  "data": {
    "callId": "call-code-exec-1",
    "toolName": "code_exec",
    "arguments": {
      "code": "console.log('ok')",
      "timeout_ms": 30000
    },
    "output": {
      "status": "success",
      "stdout": "ok\n",
      "stderr": ""
    }
  }
}
```

`code_exec` использует тот же persisted контракт `kind: tool_call` (без отдельного `kind`) и тот же snapshot-поток `message.created`/`message.updated`; детальные ограничения и sandbox-политики задаются в `docs/specs/code_exec/*`.

---

## Поток Ответа Модели

### Event-driven streaming

- `MainPipeline` обрабатывает поток чанков `reasoning` и `text`.
- Для одного turn создаётся `kind: llm` сообщение.
- Пока turn не завершён, `done = 0`; после завершения `done = 1`.
- Tool-calling в chat-flow обрабатывается через persisted `message.created`/`message.updated`.

### Auto-title из markdown-stream

Auto-title извлекается из текстового потока ассистента и не требует отдельного вызова LLM.

**Prompt-injection стратегия (eligible turn):**
- В `buildRunContext(...)` pipeline один раз на turn вычисляет eligibility через `buildAutoTitleSystemInstruction(...)`.
- ЕСЛИ cooldown guard активен, per-turn auto-title instruction НЕ добавляется в prompt.
- ЕСЛИ текущий title равен `New Agent` и в истории ещё нет meaningful user-message (>=3 буквенно-цифровых символов), per-turn auto-title instruction добавляется только на meaningful triggering user-message.
- ЕСЛИ текущий title равен `New Agent`, но в истории уже есть meaningful user-message, per-turn auto-title instruction МОЖЕТ добавляться даже при не-meaningful triggering user-message.
- ЕСЛИ turn eligible, instruction вставляется как `role: system` через `injectSystemMessage(...)` и содержит:
  - контракт формата `<!-- clerkly:title-meta: ... -->`;
  - требование включать в одном теге JSON `{"title":"<short title>","rename_need_score":NN}`;
  - контекст `Current chat title: "<текущее имя>"`.

**Контракт метаданных в ответе модели:**
- Комментарий формата `<!-- clerkly:title-meta: ... -->`.
- Payload: JSON `{"title":"<short title>","rename_need_score":NN}`, где `NN` — integer `0..100`.
- Комментарий может находиться в любом месте обычного markdown/text ответа модели (`kind: llm`, `data.text`).
- Комментарий допустим только в обычном markdown/text ответе модели (`kind: llm`, `data.text`).
- За один turn обрабатывается только первое валидное вхождение.

**Parser-алгоритм (MainPipeline):**
1. Parser работает инкрементально по text-delta чанкам в состоянии `search`.
2. При обнаружении префикса `<!-- clerkly:title-meta:` parser переходит в `capture`.
3. В `capture` parser накапливает payload до:
   - закрывающего `-->`, или
   - достижения `TITLE_META_PAYLOAD_MAX_LENGTH = 260`.
   - лимит считается в Unicode-символах (code points), не в байтах.
4. Если `-->` найден до лимита:
   - парсится JSON payload с `title` и `rename_need_score`,
   - stream ответа НЕ модифицируется (комментарий остаётся в markdown-потоке),
   - parser больше не извлекает metadata в текущем turn.
5. Если лимит 260 достигнут без `-->`:
   - comment считается невалидным,
   - rename пропускается для текущего comment,
   - основной turn продолжается без ошибок.
6. Если поток завершился в состоянии незакрытого `capture`, comment считается невалидным.

**Валидация и применение candidate title:**
- Нормализация: trim, single-line, collapse spaces, удаление краевой пунктуации.
- Ограничение длины: `AGENT_TITLE_MAX_LENGTH = 200`.
- Лимит длины title считается в Unicode-символах (code points), не в байтах.
- Целевой формат названия для модели: `3-12` слов (target), но жёсткий runtime-guard — лимит 200 символов.
- Пустой/невалидный результат отбрасывается.
- `rename_need_score` валидируется как integer `0..100`; при невалидном/отсутствующем значении candidate отбрасывается.
- Применение rename выполняется через существующий путь `AgentManager.update(...)` и `agent.updated`.

**Anti-flapping (runtime guard):**
- exact-match guard на нормализованных строках (`current === next`);
- score guard:
  - default-title определяется по нормализованному case-insensitive сравнению (`normalize(currentTitle)` эквивалентен `New Agent`);
  - при default-title rename разрешён только при `rename_need_score > 50`;
  - при non-default title rename разрешён только при `rename_need_score >= 80`;
- cooldown guard: не чаще одного rename за 5 user-turns на агента.
- initial-rename guard: ПОКА default-title (по нормализованному case-insensitive сравнению) и в истории нет meaningful user-message, auto-rename разрешён только при meaningful triggering user-message.
- ПОКА default-title (по нормализованному case-insensitive сравнению), но в истории уже есть meaningful user-message, auto-rename может применяться на текущем turn даже при не-meaningful triggering user-message.
- Для cooldown replay учитываются только **успешные** rename через durable-marker в persisted payload (`data.auto_title_applied = true`, `data.auto_title_applied_title = "<title>"`).
- ЕСЛИ `rename(...)` завершился ошибкой, markdown comment в тексте ответа не считается успешным rename и не активирует cooldown.

**Надёжность:**
- Ошибки parser/валидации/rename не прерывают `MainPipeline.run(...)`.
- Отсутствие валидного comment не влияет на delivery основного ответа пользователю.
- Переименование ограничивается текущим user-context (без cross-user данных).
- В рамках одного `MainPipeline.run(...)` история сообщений загружается один раз в начале turn и переиспользуется для:
  - построения model replay сообщений,
  - вычисления auto-title guard/cooldown.
- Текущее финальное `kind: llm` сообщение добавляется в snapshot in-memory и не требует повторного чтения полной истории из БД в том же turn.

### Usage JSON: отдельный поток сохранения

- **Ответственный:** `MainPipeline` + `MessageManager` + `MessagesRepository`.
- **Контракт провайдера:** каждый провайдер возвращает usage-envelope в едином виде `canonical + raw`.
- **Отдельный шаг:** после финализации `kind: llm` сообщения pipeline отдельно сохраняет `usage_json` в `messages`.
- **Устойчивость:** ошибка записи `usage_json` не должна ломать основной ответ.
- **Без дублирования:** `usage_json` не содержит `provider`, `model`, `captured_at` (они выводятся из записи сообщения).

### История для модели: формирование входных сообщений

Логика передачи истории в модель:

1. Берём всю историю сообщений агента.
2. Исключаем сообщения `kind:error` и сообщения с `hidden: true`.
3. Для каждого сообщения истории:
   - санитизируем `payload`: удаляем `data.model` и всю ветку `data.reasoning*`;
   - определяем `role`: `user` для `kind:user`, `assistant` для `kind:llm`;
   - для `kind:tool_call` включаем только terminal-состояния (`success|error|timeout|cancelled`) и сериализуем как replay-пару `assistant(tool-call)` + `tool(tool-result)` независимо от `toolName`;
   - формируем отдельный элемент входного массива `messages` с текстовым `content`:
     - для `kind:user` передаём текст пользовательского сообщения;
     - для `kind:llm` передаём только текст ответа;
     - для `kind:tool_call` передаём AI SDK-совместимую связанную пару:
       - `assistant` с `tool-call` (`toolCallId`, `toolName`, `input`),
       - `tool` с `tool-result` (`toolCallId`, `toolName`, `output`), где `output` соответствует ToolResultOutput AI SDK (`type` + `value`).
4. Для всех поддерживаемых провайдеров формируем единый итоговый входной массив сообщений:
   - отдельный элемент `role: system` для системной инструкции;
   - отдельные элементы истории в хронологическом порядке (по одному элементу на каждое сообщение диалога).

Пример terminal replay-пары tool_call в AI SDK-совместимом виде:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "tool-call",
      "toolCallId": "call-123",
      "toolName": "code_exec",
      "input": {
        "code": "console.log('ok')"
      }
    }
  ]
}
{
  "role": "tool",
  "content": [
    {
      "type": "tool-result",
      "toolCallId": "call-123",
      "toolName": "code_exec",
      "output": {
        "type": "json",
        "value": {
          "status": "cancelled",
          "output": {
            "stdout": "",
            "stderr": ""
          }
        }
      }
    }
  ]
}
```

`reply_to_message_id` в историю для LLM не передаётся.

### Полный pipeline обработки сообщения (события и реакции)

#### 1. Main process: получение ответа LLM
1) `MainPipeline` получает streaming chunks от провайдера (`reasoning`, `text`).
2) На первом meaningful chunk создаёт `kind: llm` (`done: 0`).
3) Во время активного стриминга буферизует изменения `reasoning/text` и обновляет payload `kind: llm` не чаще одного раза в 100ms.
4) При получении полного `tool_call` выполняет schema/contract validation до persist; string-поля аргументов инструмента дополнительно проверяются на отсутствие `<!-- clerkly:title-meta: ... -->`, а если в одном ответе модели обнаружено более одного `tool_call`, ответ помечается невалидным и уходит в retry/repair без persist.
5) Для валидного `tool_call` выполняет boundary-flush pre-tool буфера и сразу создаёт persisted `kind: tool_call` в `running` (`done: 0`) без ожидания дополнительных чанков текущего model-step.
6) Не дожидаясь terminal `tool_result`, открывает post-tool LLM-сегмент для последующих reasoning/text чанков текущего ответа модели.
7) После terminal-результата (`success|error|timeout|cancelled`) обновляет тот же persisted `kind: tool_call` в `done: 1` in-place и передаёт replay-пару `assistant(tool-call)` + `tool(tool-result)` в следующий шаг `model` (с тем же ограничением `max 1 tool_call` для следующего ответа).
8) Для невалидного `tool_call` не создаёт persisted запись, запускает retry/repair; при провале попытки помечает сообщения попытки `hidden: true`.
9) Отдельно сохраняет `usage_json` (если есть), после финализации непустого LLM-сегмента.
10) КОГДА в успешной попытке есть валидный `tool_call`, технический JSON-текст `output.text`/text-chunks, дублирующий payload вызова инструмента (например `{"summary_points":[...]}` или JSON-объект с полями tool envelope), не персистится как отдельный `kind: llm`.
11) КОГДА в успешной попытке есть валидный `final_answer`, markdown/text список, эквивалентный `final_answer.summary_points` и отличающийся только list-markers/checkbox-prefixes/whitespace, не персистится как отдельный `kind: llm`; если после такого списка есть дополнительный недублирующий текст, сохраняется только этот хвост.
12) `final_answer` отображается последним артефактом успешной попытки независимо от порядка прихода в provider-stream.

#### 2. Runtime transport: stream processing
1) Runtime-consumer использует единый stream-state контракт диалога.
2) `IPCChatTransport` работает как protocol-adapter: транслирует realtime-события в `UIMessageChunk` sequence (`start -> start-step -> delta -> finish-step -> finish`).
3) `message.llm.reasoning.updated` и `message.llm.text.updated` применяются как primary deltas.
4) `message.updated` используется как snapshot persisted-состояния и финализации; промежуточные snapshot-обновления отправляются batched (<=1/100ms), boundary-обновления отправляются немедленно после flush.
5) `kind: tool_call` обрабатывается только через persisted snapshot (`message.created`/`message.updated`), включая промежуточный статус `running`.
6) Визуальный порядок фиксируется каноническим `sequence` внутри `attemptId`, а не временем прихода события в renderer.
7) Порядок model-run хранится в колонках `messages.run_id`, `messages.attempt_id`, `messages.sequence`; renderer сортирует snapshots по этим полям (с fallback на `timestamp,id` для legacy сообщений).
8) Renderer-слой сообщений использует memoization (`"AgentChatInner"`, `"AgentMessage"`), чтобы при stream/update-потоке ререндерились только изменённые элементы списка и не происходило массового повторного markdown-рендера неизменившихся сообщений.

#### 3. Batching streaming updates (100ms)
1) `MainPipeline` ведёт общий буфер для `reasoning/text` deltas и накопленного persisted payload активного `kind: llm` сегмента.
2) Промежуточный flush выполняется не чаще одного раза в 100ms.
3) Один flush-цикл:
   - делает один persisted upsert (`message.created` или `message.updated`) для текущего `kind: llm`;
   - публикует batched `message.llm.reasoning.updated` и/или `message.llm.text.updated` (с объединёнными delta за окно).
4) Принудительный flush выполняется до boundary-событий: `tool_call`, `tool_result`, финализация шага (`done`), `error`, `abort`.
5) Гарантия порядка сохраняется: pre-tool `kind: llm` segment -> `kind: tool_call` (`running`) -> post-tool `kind: llm` segment.

### Крайние случаи

- Неконсистентный event-stream от провайдера → контролируемая ошибка без падения процесса.
- При неисправимой ошибке создаётся `kind:error` сообщение с единым пользовательским текстом.

### Retry policy (recoverable ошибки)

- Повтор допускается только для recoverable ошибок провайдера/транспорта, возникших до появления первого meaningful chunk (`reasoning`/`text`).
- Pipeline-level retry ограничен одним повтором на один запуск `MainPipeline.run()`.
- Дополнительно провайдерный вызов через `Vercel AI SDK` может выполнить внутренние повторы (`maxRetries: 2`).
- Если после retry ошибка сохраняется, создаётся стандартное `kind:error` сообщение (или `agent.rate_limit` для `429`), дальнейшие повторы не выполняются.
- После появления первого meaningful chunk повтор не выполняется; применяется обычная ветка обработки post-stream ошибки (скрытие in-flight `kind:llm` + `kind:error`).

### Retry policy (невалидный final_answer)

- Невалидный `final_answer` (нарушение лимитов `summary_points`) считается recoverable-ошибкой контракта.
- Retry/repair выполняются провайдерным вызовом `Vercel AI SDK` (`maxRetries: 2` + strict tools).
- При исчерпании лимита retry `MainPipeline` обрабатывает финальную ошибку как стандартный `kind:error`.

### Исключение hidden из истории

- **Правило:** сообщения с флагом `hidden` не включаются в историю промпта.
- **Централизация:** фильтрация выполняется в `MessageManager.listForModelHistory()`.
- **Проверка:** покрывается модульным и функциональным тестами, где скрытые сообщения не попадают в историю второго запроса.

### Тестирование

#### Unit tests
- обработка streaming chunks в `MainPipeline`.
- обработка usage-envelope и persist в `messages.usage_json`.
- обработка ошибок event-stream и retry policy в `MainPipeline`.

#### Functional tests
- История передаётся как отдельные сообщения и исключает служебные поля.
- Reasoning и text стримятся инкрементально.
- Tool calling сохраняется как `kind: tool_call` в истории сообщений и проходит через snapshot-события.

---

## Компоненты

### ILLMProvider

```typescript
// Requirements: llm-integration.5
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
      >;
}

interface ChatOptions {
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools?: LLMTool[];
}

type ChatChunk =
  | { type: 'reasoning'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; callId: string; toolName: string; arguments: Record<string, unknown> }
  | {
      type: 'tool_result';
      callId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      output: unknown;
      status: 'success' | 'error' | 'timeout' | 'cancelled';
    }
  | {
      type: 'turn_error';
      errorType: 'auth' | 'rate_limit' | 'provider' | 'network' | 'timeout' | 'tool' | 'protocol';
      message: string;
    };

interface LLMUsage {
  canonical: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
    reasoning_tokens?: number;
  };
  raw: Record<string, unknown>;
}

interface LLMChatResult {
  usage?: LLMUsage;
}

interface ILLMProvider {
  testConnection(apiKey: string): Promise<TestConnectionResult>;
  // apiKey передаётся в конструктор
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void,
    signal?: AbortSignal
  ): Promise<LLMChatResult>;
  getProviderName(): string;
}
```

**Выбор модели и reasoning effort (llm-integration.5.8):**
- Тестовая конфигурация: `gpt-5-nano` + `reasoning_effort: "low"`.
- Продовая конфигурация: `gpt-5.2` + `reasoning_effort: "medium"`.

### PromptBuilder

```typescript
// Requirements: llm-integration.4
interface AgentFeature {
  name: string;
  getSystemPromptSection(): string;
  getTools(): LLMTool[];
}

interface HistoryStrategy {
  select(messages: Message[]): Message[];
}

class FullHistoryStrategy implements HistoryStrategy {
  select(messages: Message[]): Message[] {
    return messages; // вся история
  }
}

class PromptBuilder {
  constructor(
    private systemPrompt: string,
    private features: AgentFeature[],
    private historyStrategy: HistoryStrategy
  ) {}

  build(messages: Message[]): { messages: ChatMessage[]; tools: LLMTool[] } // system + history + tools
}
```

`PromptBuilder.build()` возвращает:
- `messages`: итоговый массив `ChatMessage[]`;
- `tools`: объединённый список инструментов из `AgentFeature.getTools()`.

Для feature `final_answer` системная инструкция и описание инструмента задают следующую модель поведения:
- обычный поток `reasoning/text` используется для рабочего диалога (уточнения, вопросы к пользователю, промежуточные сообщения);
- `final_answer` вызывается только когда модель считает задачу завершённой;
- если задача не завершена и `final_answer` не вызывается, модель явно запрашивает у пользователя недостающие данные или подтверждение следующего шага;
- в конце каждого turn модель выбирает ровно один исход: либо `final_answer`, либо явный следующий вопрос пользователю;
- если запрос полностью выполним в текущем turn, модель завершает его через `final_answer` и не оставляет turn в `awaiting-response` без вопроса;
- `final_answer` вызывается только в одиночку в одном model-turn (без других tool calls в этом же ответе модели);
- payload инструмента не дублируется в plain-text ответе модели; модель не выводит сырой JSON, зеркалирующий `tool_call`;
- при завершении через `final_answer` модель не публикует перед вызовом инструмента отдельный обычный markdown/text summary, буллеты или checklist с теми же solved-task пунктами, включая их перефразированные варианты;
- математические выражения в `final_answer.summary_points` оформляются только через KaTeX-совместимые markdown-делимитеры `$...$`/`$$...$$`;
- `final_answer.summary_points` перечисляет решённые задачи.

`messages` содержит:
- один элемент `role: system` с системной инструкцией;
- затем отдельные элементы истории:
  - `role: user` / `role: assistant` для диалоговых сообщений;
  - для terminal `kind: tool_call` — связанную replay-пару `role: assistant` (`tool-call`) и `role: tool` (`tool-result`).

**Базовая инструкция для system-role:**

```
You are a helpful AI assistant. Always reply in the user's language (detected from the latest user message in the current request), including both your response text and any reasoning text. You may respond in Markdown when it improves clarity. Supported Markdown (GFM): headings, paragraphs, bold/italic/strikethrough, links/autolinks, blockquotes, ordered/unordered lists and task lists, tables, horizontal rules, inline code, fenced code blocks with language tags (syntax highlighting), Mermaid diagrams (```mermaid```), and math via KaTeX (inline $...$ or block $$...$$). For math, use only $...$ / $$...$$; do not use \(...\), \[...\], or escaped dollar delimiters like \$...\$ / \$\$...\$\$. Do not use footnotes.
```

**Формат входных сообщений (пример):**

```json
[
  { "role": "system", "content": "System instruction..." },
  { "role": "user", "content": "Hello" },
  { "role": "assistant", "content": "Hi! How can I help?" }
]
```

**Нормализация ошибок AI SDK в `LLMProvider.chat()`:**

```typescript
// Requirements: llm-integration.3, llm-integration.3.6, llm-integration.3.10
const TIMEOUT_MS = 60_000; // 1 минута на каждый запрос к LLM API

// Таймер сбрасывается при каждом onStepFinish (llm-integration.3.6.1):
// - setTimeout(60s) при старте chat()
// - clearTimeout + setTimeout(60s) в onStepFinish callback
// - Время выполнения инструментов между запросами не учитывается
let timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

try {
  await runProviderStreamWithTimeout({
    timeoutMs: TIMEOUT_MS,
    signal,
    onStepFinish: () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    },
  });
} catch (error) {
  throw normalizeLLMError(error); // APICallError/RetryError/UIMessageStreamError/Tool*Error -> domain code
} finally {
  clearTimeout(timeoutId);
}
```

Нормализация выполняется единообразно для всех провайдеров:

| Источник ошибки AI SDK | Доменный тип |
|---|---|
| `APICallError` (`401/403`) | `auth` |
| `APICallError` (`429`) | `rate_limit` |
| `APICallError` (`5xx`) | `provider` |
| timeout/abort | `timeout` |
| transport-level ошибка без `statusCode` | `network` |
| `NoSuchToolError` / `InvalidToolInputError` / `ToolExecutionError` / `ToolCallRepairError` | `tool` |
| `UIMessageStreamError` | `protocol` |
| `Invalid prompt: ... ModelMessage[] schema` | `protocol` |

```typescript
// Requirements: llm-integration.1
class MainPipeline {
  constructor(
    private messageManager: MessageManager,
    private userSettingsManager: UserSettingsManager,
    private providerFactory: LLMProviderFactory
  ) {}

  async run(agentId: string, userMessageId: number, signal?: AbortSignal): Promise<void>
}
```

**Поведение `run()`:**

```
1. Загружает историю сообщений агента
2. Получает API ключ из UserSettingsManager
3. Создаёт экземпляр провайдера с актуальными настройками
4. Собирает промпт через PromptBuilder
   - `const { messages, tools } = promptBuilder.build(history)`
5. Инициализирует локальное состояние выполнения (`llmMessageId`, `accumulatedReasoning`, `accumulatedText`, `pendingReasoningDelta`, `pendingTextDelta`, `lastFlushAt`)
6. Вызывает `provider.chat(messages, { ...options, tools }, onChunk, signal)` (провайдерная реализация использует `Vercel AI SDK`):
   onChunk(chunk):
     if llmMessageId == null:
      создаёт `kind: llm` сообщение (`done: false`, `reply_to_message_id = userMessageId`) → `llmMessageId = message.id`
      эмитит `message.created`
    if chunk.type == 'reasoning':
      accumulatedReasoning += chunk.delta
      pendingReasoningDelta += chunk.delta
      запускает batched flush (не чаще 1 раза в 100ms)
    if chunk.type == 'text':
      accumulatedText += chunk.delta
      pendingTextDelta += chunk.delta
      запускает batched flush (не чаще 1 раза в 100ms)
    if chunk.type == 'tool_call':
      собирает полный tool call и валидирует schema/contract
      если tool call валиден:
        выполняет boundary-flush текущего pre-tool буфера
        финализирует текущий непустой LLM-сегмент
        создаёт persisted `kind: tool_call` (`done: false`, `status: running`) немедленно
        запускает выполнение инструмента (асинхронно, без блокировки post-tool text stream)
      если tool call невалиден:
        запускает retry/repair без создания persisted `kind: tool_call`
    flush():
      upsert `kind: llm` (`done: false`) через один persisted snapshot update
      эмитит batched `message.llm.reasoning.updated { delta, accumulatedText }` и/или
      batched `message.llm.text.updated { delta, accumulatedText }`
    if boundary event (`tool_call`/`tool_result`/done/error/abort):
      выполняет force-flush без ожидания 100ms
7. Post-tool LLM-сегмент может продолжать стримиться, пока `tool_call` остаётся в `running`
8. При завершении выполнения инструмента обновляет соответствующий persisted `kind: tool_call` до terminal-статуса (`success|error|timeout|cancelled`) и передаёт terminal-результат в следующий шаг `model`
9. После успешного завершения `provider.chat(...)` финализирует текущий непустой LLM-сегмент (`done: true`) и сохраняет `usage_json` отдельным шагом
10. Если `final_answer` присутствует в успешной попытке, публикует его в UI последним артефактом этой попытки (даже если он пришёл раньше других terminal-событий в transport-стриме)
11. Если последним видимым сообщением стал `kind: tool_call` с `toolName='final_answer'` и `done=true`, `AgentManager.computeAgentStatus()` возвращает `completed`
12. Эмитит финальный `message.updated`
```

**Валидация tool call (общий контракт):**
- Перед фактическим исполнением любого инструмента `MainPipeline` валидирует аргументы по schema/contract.
- Перед исполнением проверяется cardinality: один ответ модели может содержать не более одного `tool_call`.
- Если в ответе модели обнаружено более одного `tool_call`, ответ считается невалидным и обрабатывается через retry/repair без persist.
- Отдельно валидируется правило `final_answer`: если присутствует `final_answer`, он должен быть единственным `tool_call` этого turn.
- При невалидных аргументах pipeline возвращает модели диагностику ошибки валидации и запускает bounded retry/repair в рамках текущего turn (`maxRetries = 2`).
- При невалидных аргументах persisted `kind: tool_call` не создаётся и не обновляется на всех попытках retry/repair.
- Если после исчерпания retry/repair аргументы остаются невалидными, `MainPipeline` завершает turn через обычное `kind:error` сообщение (без terminal-ошибки `tool_call`).

**Обработка ошибок:**

```
catch(error):
  if llmMessageId != null:
    обновляет `kind: llm` с `hidden: true, done: false`
    эмитит `message.updated`
  создаёт `kind: error` (`done: true`, messages.reply_to_message_id = userMessageId, payload.error.message)
  эмитит `message.created`
```

### Прерывание запроса при новом сообщении

`AgentManager` хранит `Map<agentId, AbortController>` — по одному контроллеру на агента.

**Поведение при `messages:create` с `kind: user`:**

```
1. Если для `agentId` есть активный AbortController:
   a. Вызвать controller.abort('cancelled_by_user')
   b. Удалить контроллер из Map
2. Создаёт новый AbortController и сохраняет его в Map
3. Создаёт `kind: user` сообщение
4. Запускает `MainPipeline.run(agentId, messageId, abortController.signal)`
5. По завершении `run()` удаляет контроллер из Map
```

`MainPipeline.run()` принимает `AbortSignal` и передаёт его в `provider.chat(...)` (через AI SDK adapter). При отмене:
- Если `kind: llm` ещё не создан — просто выходим (нет сообщений для очистки)
- Если `kind: llm` уже создан — помечаем `hidden: true, done: false`, выходим без создания `kind: error`
- Исходное `kind: user` сообщение отменённого turn не скрывается

**`MessageManager.listForModelHistory()`** фильтрует сообщения с `hidden` — они не попадают во входной массив `messages`.

**`MessageManager.listForModelHistory()`** также фильтрует сообщения с `kind: error`; для `kind: tool_call` включаются только terminal-результаты (`success|error|timeout|cancelled`) независимо от `toolName` и сериализуются в AI SDK replay-пару `assistant(tool-call)` + `tool(tool-result)` с общим `toolCallId`.

Клиентский runtime фильтрует сообщения с `hidden: true`.

### Скрытие kind:error при новом сообщении

При создании нового `kind: user` сообщения `AgentIPCHandlers` скрывает все видимые `kind: error` сообщения этого агента через `hidden: true` перед запуском нового `MainPipeline.run()`.

```
messages:create (kind: user):
  1. UPDATE messages SET hidden = 1
     WHERE agent_id = ? AND kind = 'error' AND hidden = 0
  2. Отменить активный pipeline (если есть)
  3. Создать kind:user сообщение
  4. Запустить MainPipeline.run()
```

Клиентский runtime фильтрует сообщения с `hidden: true`.

### Rate limit flow (llm-integration.3.7)

При получении ошибки `rate_limit` `MainPipeline` не создаёт `kind: error` сообщение и эмитит событие `agent.rate_limit` с вычисленным `retryAfterSeconds`.

Клиентский runtime подписывается на `agent.rate_limit`. По истечении таймера вызывается IPC `messages:retry-last`: `AgentIPCHandlers` берёт последний `kind:user` из БД и повторяет `MainPipeline.run()` с этим `userMessageId`. При действии "Cancel" вызывается IPC `messages:cancel-retry`: `AgentIPCHandlers` удаляет последнее `kind: user` сообщение из БД.

```typescript
// Новое событие
interface AgentRateLimitPayload {
  agentId: string;
  userMessageId: number;
  retryAfterSeconds: number;
}
```

### Контракты streaming-событий (реализация)

Технические контракты realtime-событий фиксируются на уровне дизайна и синхронизируются с `realtime-events` спецификацией:

```typescript
// Requirements: llm-integration.2, llm-integration.14.5, realtime-events.5.5, realtime-events.3.8.1, realtime-events.6.3.1
type EventName =
  | 'message.llm.reasoning.updated'
  | 'message.llm.text.updated';

interface MessageLlmReasoningUpdatedPayload {
  messageId: number;
  agentId: string;
  delta: string;
  accumulatedText: string;
  timestamp: number;
}

interface MessageLlmTextUpdatedPayload {
  messageId: number;
  agentId: string;
  delta: string;
  accumulatedText: string;
  timestamp: number;
}
```

Правило обработки timestamp для стриминговых типов (`message.updated`, `message.llm.reasoning.updated`, `message.llm.text.updated`):
- события с одинаковым timestamp НЕ коалесцируются;
- устаревшим считается только событие с меньшим timestamp (`<`), чтобы не терять чанки в одном миллисекундном тике.
- правило применяется симметрично в `MainEventBus` и `RendererEventBus` для `reasoning/text` stream-событий.

Правило источников данных в runtime:
- `message.llm.reasoning.updated` и `message.llm.text.updated` используются как primary source для delta-стриминга.
- `message.updated` используется как snapshot source для persisted-состояния и финализации turn.
- Во время активного стриминга runtime не должен повторно добавлять тот же контент из snapshot, уже применённый через delta-события.
- Промежуточные delta/snapshot события для активного `kind: llm` сегмента публикуются batched не чаще одного раза в 100ms; boundary-события вызывают принудительный flush.

События определены в `src/shared/events/types.ts` и `src/shared/events/constants.ts`, а доставка реализована в `MainEventBus`.

---

## Поток Данных

```
User отправляет сообщение
  → AgentIPCHandlers.messages:create
  → MessageManager.create(kind: 'user')        → message.created
  → MainPipeline.run(agentId, messageId) [async]
      → PromptBuilder.build(history) -> { messages, tools }
      → LLMProvider.chat(messages, { ...options, tools }, onChunk) // provider adapter over Vercel AI SDK
          → [reasoning chunk]
              → enqueue в streaming buffer
              → batched flush (<=1/100ms):
                  MessageManager.create/update(kind: 'llm', done: false, reply_to_message_id: userMessageId)
                  message.llm.reasoning.updated
                  message.created (для первого flush) / message.updated (для последующих flush)
          → [text chunk]
              → enqueue в streaming buffer
              → batched flush (<=1/100ms):
                  MessageManager.update(kind: 'llm', text, done: false)
                  message.llm.text.updated
                  message.updated
          → [tool_call with full arguments, например `final_answer` или `code_exec`]
              → force-flush streaming buffer
              → validate tool-call
              → finalize current non-empty llm segment
              → MessageManager.create(kind: 'tool_call', done: false, status: 'running')
              → message.created
              → execute tool (async)
              → continue streaming post-tool llm segment (no wait for terminal)
              → MessageManager.update(kind: 'tool_call', done: true, status: terminal) // in-place update
              → message.updated
              → append replay pair assistant(tool-call) + tool(tool-result) to next model step
          → [chat completion]
              → MessageManager.update(kind: 'llm', done: true) // only for non-empty segment
              → message.updated
              → persist usage_json
              → if final_answer exists in successful attempt: render as last visible artifact
      → [on error]
          → force-flush streaming buffer (если есть pending изменения)
          → MessageManager.update(kind: 'llm', hidden: true, done: false) [если уже создан]
          → MessageManager.create(kind: 'error', done: true, reply_to_message_id: userMessageId)
          → message.updated / message.created
```

---

## Стратегия Тестирования

### Модульные тесты

- `tests/unit/llm/OpenAIProvider.chat.test.ts` — streaming/tool-loop mapping, ошибки, usage
- `tests/unit/llm/AnthropicProvider.chat.test.ts` — streaming/tool-loop mapping, ошибки, usage
- `tests/unit/llm/GoogleProvider.chat.test.ts` — streaming/tool-loop mapping, ошибки, usage
- `tests/unit/llm/ErrorNormalizer.test.ts` — mapping AI SDK ошибок (`auth/rate_limit/provider/network/timeout/tool/protocol`)
- `tests/unit/agents/PromptBuilder.test.ts` — формирование массива `messages`, исключения из replay
- `tests/unit/agents/PromptModelContract.test.ts` — контрактная валидация `ModelMessage[]` (AI SDK schema), terminal-статусы `tool-result`, негативные кейсы `legacy result`, missing pair, mismatched `toolCallId`, malformed/non-terminal `tool_call`
- `tests/unit/agents/MainPipeline.test.ts` — мок провайдера, полный цикл, ошибки, события
- `tests/unit/agents/MainPipeline.test.ts` — integration guard: в `provider.chat` передаются schema-valid `ModelMessage[]` и связанная replay-пара `assistant(tool-call)` + `tool(tool-result)`
- `tests/unit/agents/MainPipeline.test.ts` — порядок persist: `kind:tool_call(status=running)` фиксируется только после завершения pre-tool reasoning-сегмента и до post-tool llm сегмента; terminal приходит позже и обновляет тот же блок in-place
- `tests/unit/agents/MainPipeline.test.ts` — отклонение ответа модели с `tool_calls.length > 1` (retry/repair без persist `tool_call`)
- `tests/unit/agents/MainPipeline.test.ts` — 100ms batching streaming updates: промежуточные flush не чаще 1/100ms, force-flush на `tool_call/tool_result/done/error/abort`, без потери accumulated delta
- `tests/unit/agents/AgentIPCHandlers.test.ts` — запуск pipeline при kind:user
- `tests/unit/renderer/IPCChatTransport.test.ts` — обработка delta-stream (`reasoning/text`) и persisted `kind: tool_call` snapshot
- `tests/unit/renderer/messageOrder.test.ts` — детерминированная сортировка snapshots по `runId/attemptId/sequence` (из колонок `messages`) с fallback на `timestamp,id`
- `tests/unit/hooks/useAgentChat.test.ts` — применение сортировки при `message.created`/`message.updated` для out-of-order доставки
- `tests/unit/components/agents/AgentChat.test.tsx` — renderer re-render guard: input-only state updates не должны ререндерить список сообщений; при обновлении одного snapshot ререндерится только соответствующий элемент
- `tests/unit/events/MainEventBus.test.ts` и `tests/unit/events/RendererEventBus.test.ts` — порядок/доставка streaming событий без потери чанков
- `tests/unit/db/repositories/MessagesRepository.test.ts` — kind как параметр
- `tests/unit/db/repositories/MessagesRepository.test.ts` — семантика `done` для `kind:llm` и `kind:error`
- `tests/unit/agents/MainPipeline.test.ts` — parser комментария `<!-- clerkly:title-meta: ... -->` (search/capture, split chunks, незакрытый comment, лимит 260)
- `tests/unit/agents/MainPipeline.test.ts` — integration rename-flow: первое валидное вхождение, отсутствие модификации output-stream, fallback при invalid comment
- `tests/unit/agents/MainPipeline.test.ts` — per-turn prompt injection: контракт auto-title добавляется только на eligible turn (cooldown/meaningful guards)
- `tests/unit/agents/MainPipeline.test.ts` — runtime guard: `<!-- clerkly:title-meta: ... -->` отклоняется в аргументах tool_call до persist (`final_answer`, `code_exec.task_summary`)
- `tests/unit/components/agents/AgentMessage.test.tsx` — renderer defense-in-depth: persisted historical `tool_call` payload с `<!-- clerkly:title-meta: ... -->` не показывает metadata comment в UI
- `tests/unit/agents/AgentTitleNormalization.test.ts` — нормализация/валидация title (single-line, trim, punctuation, max 200)
- `tests/unit/agents/AgentTitleAntiFlap.test.ts` — guards anti-flapping (exact match, split `rename_need_score` threshold для `New Agent`/non-default, cooldown)

### Функциональные тесты

- `tests/functional/llm-chat.spec.ts` — "should show llm response after user message"
- `tests/functional/llm-chat.spec.ts` — "should show reasoning before answer"
- `tests/functional/llm-chat.spec.ts` — "should show error message on invalid api key"
- `tests/functional/llm-chat.spec.ts` — "should interrupt previous request when new message sent during streaming"
- `tests/functional/llm-chat.spec.ts` — "should not show hidden llm message in chat"
- `tests/functional/llm-chat.spec.ts` — "should show rate limit banner with countdown and auto-retry"
- `tests/functional/llm-chat.spec.ts` — "should show provider error message on 500"
- `tests/functional/llm-chat.spec.ts` — "should hide error bubble when user sends next message"
- `tests/functional/llm-chat.spec.ts` — "should send full conversation history to llm on second message"
- `tests/functional/llm-chat.spec.ts` — "should exclude error messages from llm history"
- `tests/functional/llm-chat.spec.ts` — "should create tool_call only after reasoning phase and start post-tool text without waiting terminal result"
- `tests/functional/llm-chat.spec.ts` — "should keep visual order pre-tool llm -> tool_call(running) -> post-tool llm with in-place terminal update"
- `tests/functional/llm-chat.spec.ts` — "should show running code_exec before terminal when first model step has no post-tool text"
- `tests/functional/llm-chat.spec.ts` — "should retry tool call on invalid arguments, not persist tool_call, and show kind:error after retry limit"
- `tests/functional/llm-chat.spec.ts` — "should continue to next model step after terminal code_exec tool result"
- `tests/functional/llm-chat.spec.ts` — "should reject model response containing more than one tool_call and run repair"
- `tests/functional/llm-chat.spec.ts` — "should render final_answer tool_call as completed assistant response"
- `tests/functional/llm-chat.spec.ts` — "should render math inside tool_call(final_answer) checklist item"
- `tests/functional/llm-chat.spec.ts` — "should include final_answer non-duplication rules in system prompt"
- `tests/functional/llm-chat.spec.ts` — "should not render raw final_answer JSON text when tool_call(final_answer) is present"
- `tests/functional/llm-chat.spec.ts` — "should not render duplicate markdown summary before final_answer checklist"
- `tests/functional/llm-chat.spec.ts` — "should cancel active request via stop button without creating error message"
- `tests/functional/llm-chat.spec.ts` — "should show error when invalid final_answer exhausts retry limit"
- `tests/functional/llm-chat.spec.ts` — "should show error when final_answer contains blank summary point"
- `tests/functional/llm-chat.spec.ts` — "should render math when model returns LaTeX delimiters"
- `tests/functional/llm-chat.spec.ts` — "should extract agent title and rename_need_score from single metadata comment in the same model turn"
- `tests/functional/llm-chat.spec.ts` — "should extract agent title from llm text when the same turn also completes with final_answer"
- `tests/functional/llm-chat.spec.ts` — "should include auto-title metadata contract in system prompt"
- `tests/functional/llm-chat.spec.ts` — "should reject title-meta inside tool payload and repair without rendering metadata comment"
- `tests/functional/llm-chat.spec.ts` — "should ignore unterminated title metadata comment when payload exceeds 260 chars"
- `tests/functional/llm-chat.spec.ts` — "should keep default name when first user message is non-meaningful"
- `tests/functional/llm-chat.spec.ts` — "should keep current name when auto-title candidate is non-meaningful"
- `tests/functional/llm-chat.spec.ts` — "should keep default name when default-title rename_need_score is 50"
- `tests/functional/llm-chat.spec.ts` — "should apply rename when default-title rename_need_score is 51"
- `tests/functional/llm-chat.spec.ts` — "should skip rename when rename_need_score is below threshold"
- `tests/functional/llm-chat.spec.ts` — "should skip rename when rename_need_score is invalid"
- `tests/functional/llm-chat.spec.ts` — "should apply rename for new intent after 5-turn cooldown"

### Покрытие Требований

| Требование | Модульные тесты | Функциональные тесты |
|------------|-----------------|----------------------|
| llm-integration.1 | ✓ | ✓ |
| llm-integration.1.1 | ✓ | ✓ |
| llm-integration.1.2 | ✓ | ✓ |
| llm-integration.1.3 | ✓ | ✓ |
| llm-integration.1.4 | ✓ | ✓ |
| llm-integration.1.5 | ✓ | ✓ |
| llm-integration.1.6 | ✓ | ✓ |
| llm-integration.1.6.1 | ✓ | ✓ |
| llm-integration.1.6.2 | ✓ | ✓ |
| llm-integration.1.6.3 | ✓ | ✓ |
| llm-integration.1.6.4 | ✓ | ✓ |
| llm-integration.1.7 | ✓ | ✓ |
| llm-integration.1.8 | ✓ | ✓ |
| llm-integration.2 | ✓ | ✓ |
| llm-integration.2.1 | ✓ | ✓ |
| llm-integration.2.1.1 | ✓ | ✓ |
| llm-integration.2.1.2 | ✓ | ✓ |
| llm-integration.2.1.3 | ✓ | ✓ |
| llm-integration.2.2 | ✓ | ✓ |
| llm-integration.2.3 | ✓ | ✓ |
| llm-integration.2.3.1 | ✓ | ✓ |
| llm-integration.2.4 | ✓ | ✓ |
| llm-integration.2.4.1 | ✓ | ✓ |
| llm-integration.2.5 | ✓ | ✓ |
| llm-integration.2.5.1 | ✓ | ✓ |
| llm-integration.2.6 | ✓ | ✓ |
| llm-integration.2.6.1 | ✓ | ✓ |
| llm-integration.2.7 | ✓ | ✓ |
| llm-integration.2.8 | ✓ | ✓ |
| llm-integration.3 | ✓ | ✓ |
| llm-integration.3.1 | ✓ | ✓ |
| llm-integration.3.1.1 | ✓ | ✓ |
| llm-integration.3.2 | ✓ | ✓ |
| llm-integration.3.3 | ✓ | ✓ |
| llm-integration.3.4 | ✓ | ✓ |
| llm-integration.3.4.1 | ✓ | ✓ |
| llm-integration.3.4.2 | ✓ | ✓ |
| llm-integration.3.4.3 | ✓ | ✓ |
| llm-integration.3.4.4 | ✓ | ✓ |
| llm-integration.3.5 | ✓ | ✓ |
| llm-integration.3.6 | ✓ | ✓ |
| llm-integration.3.7 | - | ✓ |
| llm-integration.3.7.1 | - | ✓ |
| llm-integration.3.7.2 | - | ✓ |
| llm-integration.3.7.3 | - | ✓ |
| llm-integration.3.7.3.1 | - | ✓ |
| llm-integration.3.7.4 | - | ✓ |
| llm-integration.3.7.5 | - | ✓ |
| llm-integration.3.7.6 | - | ✓ |
| llm-integration.3.8 | - | ✓ |
| llm-integration.3.9 | ✓ | ✓ |
| llm-integration.3.10 | ✓ | ✓ |
| llm-integration.4 | ✓ | - |
| llm-integration.4.1 | ✓ | - |
| llm-integration.4.2 | ✓ | - |
| llm-integration.4.3 | ✓ | - |
| llm-integration.4.4 | ✓ | - |
| llm-integration.4.5 | ✓ | - |
| llm-integration.4.5.1 | ✓ | - |
| llm-integration.4.6 | ✓ | - |
| llm-integration.4.7 | ✓ | ✓ |
| llm-integration.5 | ✓ | - |
| llm-integration.5.1 | ✓ | - |
| llm-integration.5.2 | ✓ | - |
| llm-integration.5.2.1 | ✓ | - |
| llm-integration.5.3 | ✓ | - |
| llm-integration.5.4 | ✓ | - |
| llm-integration.5.5 | ✓ | - |
| llm-integration.5.6 | ✓ | - |
| llm-integration.5.7 | ✓ | - |
| llm-integration.5.7.1 | ✓ | - |
| llm-integration.5.8 | ✓ | ✓ |
| llm-integration.5.9 | ✓ | ✓ |
| llm-integration.6 | ✓ | - |
| llm-integration.6.1 | ✓ | - |
| llm-integration.6.2 | ✓ | - |
| llm-integration.6.3 | ✓ | - |
| llm-integration.6.4 | ✓ | - |
| llm-integration.6.5 | ✓ | - |
| llm-integration.6.6 | ✓ | - |
| llm-integration.6.6.1 | ✓ | - |
| llm-integration.6.7 | ✓ | ✓ |
| llm-integration.6.8 | ✓ | ✓ |
| llm-integration.6.9 | ✓ | ✓ |
| llm-integration.6.10 | ✓ | ✓ |
| llm-integration.7 | ✓ | ✓ |
| llm-integration.7.1 | ✓ | ✓ |
| llm-integration.7.2 | ✓ | ✓ |
| llm-integration.7.3 | ✓ | ✓ |
| llm-integration.7.4 | ✓ | ✓ |
| llm-integration.7.5 | ✓ | ✓ |
| llm-integration.8 | ✓ | ✓ |
| llm-integration.8.1 | ✓ | ✓ |
| llm-integration.8.2 | ✓ | ✓ |
| llm-integration.8.3 | ✓ | ✓ |
| llm-integration.8.4 | ✓ | ✓ |
| llm-integration.8.5 | ✓ | ✓ |
| llm-integration.8.6 | ✓ | - |
| llm-integration.8.6.1 | ✓ | ✓ |
| llm-integration.8.7 | ✓ | ✓ |
| llm-integration.8.8 | ✓ | ✓ |
| llm-integration.9 | ✓ | ✓ |
| llm-integration.9.1 | ✓ | ✓ |
| llm-integration.9.2 | ✓ | ✓ |
| llm-integration.9.3 | ✓ | ✓ |
| llm-integration.9.4 | ✓ | ✓ |
| llm-integration.9.4.1 | ✓ | ✓ |
| llm-integration.9.4.2 | ✓ | ✓ |
| llm-integration.9.4.3 | ✓ | ✓ |
| llm-integration.9.5 | ✓ | ✓ |
| llm-integration.9.5.1 | ✓ | ✓ |
| llm-integration.9.5.1.1 | ✓ | ✓ |
| llm-integration.9.5.1.2 | ✓ | ✓ |
| llm-integration.9.5.1.3 | ✓ | ✓ |
| llm-integration.9.5.2 | ✓ | ✓ |
| llm-integration.9.5.3 | ✓ | ✓ |
| llm-integration.9.5.3.1 | ✓ | ✓ |
| llm-integration.9.5.4 | ✓ | ✓ |
| llm-integration.9.5.5 | ✓ | ✓ |
| llm-integration.9.5.6 | ✓ | ✓ |
| llm-integration.9.6 | ✓ | ✓ |
| llm-integration.9.7 | ✓ | ✓ |
| llm-integration.10 | ✓ | ✓ |
| llm-integration.10.1 | ✓ | ✓ |
| llm-integration.10.2 | ✓ | ✓ |
| llm-integration.10.3 | ✓ | ✓ |
| llm-integration.10.4 | ✓ | ✓ |
| llm-integration.11 | ✓ | ✓ |
| llm-integration.11.1 | ✓ | ✓ |
| llm-integration.11.1.1 | ✓ | ✓ |
| llm-integration.11.1.2 | ✓ | ✓ |
| llm-integration.11.1.2.1 | ✓ | ✓ |
| llm-integration.11.1.3 | ✓ | ✓ |
| llm-integration.11.1.3.1 | ✓ | ✓ |
| llm-integration.11.1.4 | ✓ | ✓ |
| llm-integration.11.1.5 | ✓ | ✓ |
| llm-integration.11.1.6 | ✓ | ✓ |
| llm-integration.11.2 | ✓ | ✓ |
| llm-integration.11.2.1 | ✓ | ✓ |
| llm-integration.11.2.2 | ✓ | ✓ |
| llm-integration.11.3 | ✓ | ✓ |
| llm-integration.11.3.1 | ✓ | ✓ |
| llm-integration.11.3.2 | ✓ | ✓ |
| llm-integration.11.3.3 | ✓ | ✓ |
| llm-integration.11.3.4 | ✓ | ✓ |
| llm-integration.11.4 | ✓ | ✓ |
| llm-integration.11.4.1 | ✓ | ✓ |
| llm-integration.11.4.2 | ✓ | ✓ |
| llm-integration.11.4.3 | ✓ | ✓ |
| llm-integration.11.4.4 | ✓ | ✓ |
| llm-integration.11.5 | ✓ | ✓ |
| llm-integration.11.5.1 | ✓ | ✓ |
| llm-integration.11.6 | ✓ | ✓ |
| llm-integration.11.6.1 | ✓ | ✓ |
| llm-integration.11.7 | ✓ | ✓ |
| llm-integration.12 | ✓ | ✓ |
| llm-integration.12.1 | ✓ | ✓ |
| llm-integration.12.2 | ✓ | ✓ |
| llm-integration.12.2.1 | ✓ | ✓ |
| llm-integration.12.2.2 | ✓ | ✓ |
| llm-integration.12.3 | ✓ | ✓ |
| llm-integration.12.4 | ✓ | ✓ |
| llm-integration.13 | ✓ | - |
| llm-integration.13.1 | ✓ | - |
| llm-integration.13.2 | ✓ | - |
| llm-integration.13.3 | ✓ | - |
| llm-integration.13.4 | ✓ | - |
| llm-integration.13.5 | ✓ | - |
| llm-integration.14 | ✓ | ✓ |
| llm-integration.14.1 | ✓ | ✓ |
| llm-integration.14.2 | ✓ | ✓ |
| llm-integration.14.3 | ✓ | ✓ |
| llm-integration.14.4 | ✓ | ✓ |
| llm-integration.14.5 | ✓ | ✓ |
| llm-integration.14.6 | ✓ | - |
| llm-integration.15 | ✓ | - |
| llm-integration.15.1 | ✓ | - |
| llm-integration.15.2 | ✓ | - |
| llm-integration.15.3 | ✓ | - |
| llm-integration.16 | ✓ | ✓ |
| llm-integration.16.1 | ✓ | ✓ |
| llm-integration.16.1.1 | ✓ | ✓ |
| llm-integration.16.1.2 | ✓ | ✓ |
| llm-integration.16.1.3 | ✓ | ✓ |
| llm-integration.16.2 | ✓ | ✓ |
| llm-integration.16.3 | ✓ | ✓ |
| llm-integration.16.4 | ✓ | ✓ |
| llm-integration.16.5 | ✓ | ✓ |
| llm-integration.16.6 | ✓ | ✓ |
| llm-integration.16.7 | ✓ | ✓ |
| llm-integration.16.8 | ✓ | ✓ |
| llm-integration.16.8.1 | ✓ | ✓ |
| llm-integration.16.9 | ✓ | ✓ |
| llm-integration.16.10 | ✓ | ✓ |
| llm-integration.16.10.1 | ✓ | ✓ |
| llm-integration.16.11 | ✓ | ✓ |
| llm-integration.16.12 | ✓ | ✓ |
| llm-integration.16.13 | ✓ | ✓ |
