# Документ Дизайна: LLM Integration

## Обзор

LLM Integration обеспечивает полный цикл взаимодействия с AI: от отправки user-сообщения до получения, обработки и сохранения streaming-ответа с reasoning. Архитектура расширяема — `PromptBuilder` с фичами и стратегиями истории позволяет добавлять новые возможности без изменения core-логики.
Целевая оркестрация выполняется через `Vercel AI SDK` для всех провайдеров (`OpenAI`, `Anthropic`, `Google`) с единым контрактом стриминга и tool-loop.
Документ `llm-integration` описывает только runtime-логику взаимодействия с LLM и не содержит требований/дизайна интерфейса.

### Целевая Архитектура LLM Loop

- `MainPipeline` управляет жизненным циклом turn и не содержит провайдер-специфичной логики стриминга.
- `LLMProviderFactory` создаёт провайдерные адаптеры, построенные поверх `Vercel AI SDK`.
- Провайдеры нормализуют SDK-чанки в единый внутренний `ChatChunk` контракт (`reasoning`, `text`, `tool_call`, `tool_result`, `turn_error`).
- `MainPipeline` эмитит `message.llm.reasoning.updated`, `message.llm.text.updated` и snapshot `message.created`/`message.updated` для persisted сообщений (включая `kind:tool_call`).
- `ToolRunner` исполняет вызовы инструментов в bounded concurrency и возвращает результаты в цикл `model -> tools -> model`.

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
      "text": "Task completed",
      "summary_points": ["Completed A", "Completed B", "Completed C"]
    }
  }
}
```

Контракт `final_answer` валидируется через strict-schema инструмента в `Vercel AI SDK`:
- `text`: опциональная строка; когда присутствует — непустая и длиной `<= 300`;
- `summary_points`: опциональный массив длиной `<= 10`;
- каждый пункт `summary_points`: строка длиной `<= 200`.
- Значения по умолчанию при отсутствии поля в аргументах:
  - `text`: отсутствует (не подставляется автоматически на runtime-слое `llm-integration`);
  - `summary_points`: `[]` (пустой список для дальнейшей обработки).
Невалидный `final_answer` не фиксируется как завершённый: retry/repair выполняется на стороне AI SDK; при исчерпании лимита создаётся `kind:error`.
`reply_to_message_id` хранится в колонке `messages.reply_to_message_id` и передаётся в `MessageSnapshot` отдельным полем, не внутри payload.

---

## Поток Ответа Модели

### Event-driven streaming

- `MainPipeline` обрабатывает поток чанков `reasoning` и `text`.
- Для одного turn создаётся `kind: llm` сообщение.
- Пока turn не завершён, `done = 0`; после завершения `done = 1`.
- Tool-calling в chat-flow обрабатывается через persisted `message.created`/`message.updated`.

### Usage JSON: отдельный поток сохранения

- **Ответственный:** `MainPipeline` + `MessageManager` + `MessagesRepository`.
- **Контракт провайдера:** каждый провайдер возвращает usage-envelope в едином виде `canonical + raw`.
- **Отдельный шаг:** после финализации `kind: llm` сообщения pipeline отдельно сохраняет `usage_json` в `messages`.
- **Устойчивость:** ошибка записи `usage_json` не должна ломать основной ответ.
- **Без дублирования:** `usage_json` не содержит `provider`, `model`, `captured_at` (они выводятся из записи сообщения).

### История для модели: формирование входных сообщений

Логика передачи истории в модель:

1. Берём всю историю сообщений агента.
2. Исключаем сообщения `kind:error`, `kind:tool_call` и сообщения с `hidden: true`.
3. Для каждого сообщения истории:
   - санитизируем `payload`: удаляем `data.model` и всю ветку `data.reasoning*`;
   - определяем `role`: `user` для `kind:user`, `assistant` для `kind:llm`;
   - формируем отдельный элемент входного массива `messages` с текстовым `content`:
     - для `kind:user` передаём текст пользовательского сообщения;
     - для `kind:llm` передаём только текст ответа.
4. Для всех поддерживаемых провайдеров формируем единый итоговый входной массив сообщений:
   - отдельный элемент `role: system` для системной инструкции;
   - отдельные элементы истории в хронологическом порядке (по одному элементу на каждое сообщение диалога).

`reply_to_message_id` в историю для LLM не передаётся.

### Полный pipeline обработки сообщения (события и реакции)

#### 1. Main process: получение ответа LLM
1) `MainPipeline` получает streaming chunks от провайдера (`reasoning`, `text`).
2) На первом meaningful chunk создаёт `kind: llm` (`done: 0`).
3) На каждом чанке обновляет payload `kind: llm`.
4) На завершении turn финализирует `kind: llm` (`done: 1`).
5) Отдельно сохраняет `usage_json` (если есть).

#### 2. Runtime transport: stream processing
1) Runtime-consumer использует единый stream-state контракт диалога.
2) `IPCChatTransport` работает как protocol-adapter: транслирует realtime-события в `UIMessageChunk` sequence (`start -> start-step -> delta -> finish-step -> finish`).
3) `message.llm.reasoning.updated` и `message.llm.text.updated` применяются как primary deltas.
4) `message.updated` используется как snapshot persisted-состояния и финализации.
5) `kind: tool_call` обрабатывается только через persisted snapshot (`message.created`/`message.updated`).

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

- Невалидный `final_answer` (нарушение лимитов `text`/`summary_points`) считается recoverable-ошибкой контракта.
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
  role: 'user' | 'assistant' | 'system';
  content: string;
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
      status: 'success' | 'error';
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
    onChunk: (chunk: ChatChunk) => void
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

`messages` содержит:
- один элемент `role: system` с системной инструкцией;
- затем отдельные элементы истории (`role: user`/`role: assistant`) по одному на сообщение.

**Базовая инструкция для system-role:**

```
You are a helpful AI assistant. Always reply in the user's language (detected from the latest user message in the current request), including both your response text and any reasoning text. You may respond in Markdown when it improves clarity. Supported Markdown (GFM): headings, paragraphs, bold/italic/strikethrough, links/autolinks, blockquotes, ordered/unordered lists and task lists, tables, horizontal rules, inline code, fenced code blocks with language tags (syntax highlighting), Mermaid diagrams (```mermaid```), and math via KaTeX (inline $...$ or block $$...$$). Do not use footnotes.
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
// Requirements: llm-integration.3, llm-integration.3.10
const TIMEOUT_MS = 300_000; // 5 минут

try {
  // provider adapter запускает streaming через Vercel AI SDK
  // и маппит AI SDK ошибки в единый доменный формат
  await runProviderStreamWithTimeout({ timeoutMs: TIMEOUT_MS, signal });
} catch (error) {
  throw normalizeLLMError(error); // APICallError/RetryError/UIMessageStreamError/Tool*Error -> domain code
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

```typescript
// Requirements: llm-integration.1
class MainPipeline {
  constructor(
    private messageManager: MessageManager,
    private userSettingsManager: UserSettingsManager,
    private providerFactory: LLMProviderFactory
  ) {}

  async run(agentId: string, userMessageId: number): Promise<void>
}
```

**Поведение `run()`:**

```
1. Загружает историю сообщений агента
2. Получает API ключ из UserSettingsManager
3. Создаёт экземпляр провайдера с актуальными настройками
4. Собирает промпт через PromptBuilder
   - `const { messages, tools } = promptBuilder.build(history)`
5. Инициализирует локальное состояние выполнения (`llmMessageId`, `accumulatedReasoning`, `accumulatedText`)
6. Вызывает `provider.chat(messages, { ...options, tools }, onChunk)` (провайдерная реализация использует `Vercel AI SDK`):
   onChunk(chunk):
     if llmMessageId == null:
      создаёт `kind: llm` сообщение (`done: false`, `reply_to_message_id = userMessageId`) → `llmMessageId = message.id`
      эмитит `message.created`
    if chunk.type == 'reasoning':
      accumulatedReasoning += chunk.delta
      обновляет `kind: llm` (`reasoning.text = accumulatedReasoning`, `done: false`)
      эмитит `message.llm.reasoning.updated { delta, accumulatedText }`
    if chunk.type == 'text':
      accumulatedText += chunk.delta
      обновляет `kind: llm` (`data.text = accumulatedText`, `done: false`)
      эмитит `message.llm.text.updated { delta, accumulatedText }`
    if chunk.type == 'tool_call':
      сохраняет/обновляет `kind: tool_call` (аргументы уже собраны полностью)
      if toolName != 'final_answer' and execution недоступен:
        сохраняет stub output и завершает `done: true`
    if llmMessageId уже существовал до этого чанка: эмитит `message.updated` (snapshot/consistency)
7. После успешного завершения `provider.chat(...)` обновляет `kind: llm` (`done: true`) и сохраняет `usage_json` отдельным шагом
8. Если последним видимым сообщением стал `kind: tool_call` с `toolName='final_answer'` и `done=true`, `AgentManager.computeAgentStatus()` возвращает `completed`
9. Эмитит финальный `message.updated`
```

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

**`MessageManager.listForModelHistory()`** также фильтрует сообщения с `kind: error` и `kind: tool_call` — они не попадают во входной массив `messages`.

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
// Requirements: llm-integration.2, realtime-events.5.5
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

Правило источников данных в runtime:
- `message.llm.reasoning.updated` и `message.llm.text.updated` используются как primary source для delta-стриминга.
- `message.updated` используется как snapshot source для persisted-состояния и финализации turn.
- Во время активного стриминга runtime не должен повторно добавлять тот же контент из snapshot, уже применённый через delta-события.

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
              → MessageManager.create/update(kind: 'llm', done: false, reply_to_message_id: userMessageId)
              → message.llm.reasoning.updated
              → message.created (для первого чанка) / message.updated (для последующих чанков)
          → [text chunk]
              → MessageManager.update(kind: 'llm', text, done: false)
              → message.llm.text.updated
              → message.updated
          → [tool_call with full arguments]
              → MessageManager.create/update(kind: 'tool_call', done: false/true)
              → обработка persisted snapshot в клиентском runtime
              → message.created/message.updated
          → [chat completion]
              → MessageManager.update(kind: 'llm', done: true)
              → message.updated
      → [on error]
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
- `tests/unit/agents/PromptBuilder.test.ts` — формирование массива `messages`, исключения из replay
- `tests/unit/agents/MainPipeline.test.ts` — мок провайдера, полный цикл, ошибки, события
- `tests/unit/agents/AgentIPCHandlers.test.ts` — запуск pipeline при kind:user
- `tests/unit/renderer/IPCChatTransport.test.ts` — обработка delta-stream (`reasoning/text`) и persisted `kind: tool_call` snapshot
- `tests/unit/events/MainEventBus.test.ts` и `tests/unit/events/RendererEventBus.test.ts` — порядок/доставка streaming событий без потери чанков
- `tests/unit/db/repositories/MessagesRepository.test.ts` — kind как параметр
- `tests/unit/db/repositories/MessagesRepository.test.ts` — семантика `done` для `kind:llm` и `kind:error`

### Функциональные тесты

- `tests/functional/llm-chat.spec.ts` — "should show llm response after user message"
- `tests/functional/llm-chat.spec.ts` — "should show reasoning before answer"
- `tests/functional/llm-chat.spec.ts` — "should show error message on invalid api key"
- `tests/functional/llm-chat.spec.ts` — "should interrupt previous request when new message sent during streaming"
- `tests/functional/llm-chat.spec.ts` — "should not show hidden llm message in chat"
- `tests/functional/llm-chat.spec.ts` — "should show rate limit banner with countdown"
- `tests/functional/llm-chat.spec.ts` — "should show provider error message on 500"
- `tests/functional/llm-chat.spec.ts` — "should hide error bubble when user sends next message"
- `tests/functional/llm-chat.spec.ts` — "should send full conversation history to llm on second message"
- `tests/functional/llm-chat.spec.ts` — "should exclude error messages from llm history"

### Покрытие Требований

| Требование | Модульные тесты | Функциональные тесты |
|------------|-----------------|----------------------|
| llm-integration.1 | ✓ | ✓ |
| llm-integration.1.8 (AI SDK loop для всех провайдеров) | ✓ | ✓ |
| llm-integration.1.6.1 (`llm` с `done=false` до завершения ответа) | ✓ | ✓ |
| llm-integration.1.6.2 (завершение `llm` с `done=true`) | ✓ | ✓ |
| llm-integration.1.7 (`reply_to_message_id` для создаваемых сообщений) | ✓ | ✓ |
| llm-integration.2 | ✓ | ✓ |
| llm-integration.2.8 (UIMessage stream protocol compatibility) | ✓ | ✓ |
| llm-integration.3.1 | ✓ | ✓ |
| llm-integration.3.1.1 (`error` сохраняется с `done=true`) | ✓ | ✓ |
| llm-integration.3.2 | ✓ | ✓ |
| llm-integration.3.4 | ✓ | ✓ |
| llm-integration.3.5 | ✓ | ✓ |
| llm-integration.3.6 (таймаут 300s) | ✓ | ✓ |
| llm-integration.3.7 | - | ✓ |
| llm-integration.3.8 | - | ✓ |
| llm-integration.3.9 | ✓ | ✓ |
| llm-integration.3.10 (нормализация ошибок AI SDK) | ✓ | ✓ |
| llm-integration.4 | ✓ | - |
| llm-integration.4.7 (ответ и reasoning на языке пользователя) | ✓ | ✓ |
| llm-integration.5 | ✓ | - |
| llm-integration.5.8 (модели/`reasoning_effort` для test/prod) | ✓ | ✓ |
| llm-integration.5.9 (единый AI SDK контракт OpenAI/Anthropic/Google) | ✓ | ✓ |
| llm-integration.6 | ✓ | - |
| llm-integration.6.5 (`done` как отдельный флаг) | ✓ | - |
| llm-integration.6.6 (`kind:llm` с `data.text` имеет `done = true`) | ✓ | - |
| llm-integration.7 | ✓ | ✓ |
| llm-integration.8.1 | ✓ | ✓ |
| llm-integration.8.5 | ✓ | ✓ |
| llm-integration.8.6 | ✓ | - |
| llm-integration.8.6.1 | ✓ | ✓ |
| llm-integration.8.7 | ✓ | ✓ |
| llm-integration.9 | ✓ | ✓ |
| llm-integration.9.5.1.2 (default contract: `text` отсутствует, `summary_points=[]`) | ✓ | ✓ |
| llm-integration.10 | ✓ | ✓ |
| llm-integration.11 | ✓ | ✓ |
| llm-integration.12 | ✓ | ✓ |
| llm-integration.13 | ✓ | - |
| llm-integration.14 | ✓ | ✓ |
