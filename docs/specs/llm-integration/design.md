# Документ Дизайна: LLM Integration

## Обзор

LLM Integration обеспечивает полный цикл взаимодействия с AI: от отправки user-сообщения до отображения streaming-ответа с reasoning в UI. Архитектура расширяема — `PromptBuilder` с фичами и стратегиями истории позволяет добавлять новые возможности без изменения core-логики.

---

## Схема Базы Данных

### Изменения в таблице `messages`

Добавляется колонка `kind`:

```sql
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL;
```

Миграция заполняет `kind` для существующих записей и убирает его из JSON:

```sql
UPDATE messages SET kind = 'user';
UPDATE messages SET payload_json = json_remove(payload_json, '$.kind');
```

**Итоговая схема:**

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  kind TEXT NOT NULL,
  reply_to_message_id INTEGER,
  payload_json TEXT NOT NULL
);
```

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
    "action": { "type": "text", "content": "Hi! How can I help?" },
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50,
      "total_tokens": 150,
      "cached_tokens": 80,
      "reasoning_tokens": 30
    }
  }
}
```

Флаг `interrupted: true` добавляется при обрыве стриминга:

```json
{
  "data": {
    "interrupted": true,
    "reasoning": { "text": "частичный...", "excluded_from_replay": true }
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

Для ошибок без action_link (network, provider, timeout):

```json
{
  "data": {
    "error": { "type": "network", "message": "Network error. Please check your internet connection." }
  }
}
```

Для отсутствующего API ключа (dialog тот же, другое сообщение):

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

**UI отображение:** `reply_to_message_id` хранится в колонке `messages.reply_to_message_id` и передаётся в `MessageSnapshot` отдельным полем, не внутри payload. В renderer `kind: error` рендерится как стандартизированный диалог через кастомный `AgentDialog` с intent `error`, единым layout и опциональными действиями. Для ошибок API ключа (auth) диалог показывает "Open Settings" и "Retry". `AgentDialog` поддерживает intent `error`, `warning`, `info`, `confirmation`; диалоги уведомлений (например, rate limit) используют этот же компонент с intent `info`.

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
}

interface ChatChunk {
  type: 'reasoning';
  delta: string;
  done: boolean;
}

interface LLMAction {
  type: 'text';
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
    reasoning_tokens?: number;
  };
}

interface ILLMProvider {
  testConnection(apiKey: string): Promise<TestConnectionResult>;
  // apiKey передаётся в конструктор
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMAction>;
  getProviderName(): string;
}
```

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

  build(messages: Message[]): {
    systemPrompt: string;
    historyYaml: string; // YAML-строка истории
  }
}
```

**YAML-формат истории:**

```yaml
messages:
  - id: 1
    kind: user
    timestamp: "2026-02-13T18:42:11+01:00"
    data:
      reply_to_message_id: null
      text: "Hello"
  - id: 2
    kind: llm
    timestamp: "2026-02-13T18:42:15+01:00"
    data:
      reply_to_message_id: 1
      action:
        type: text
        content: "Hi! How can I help?"
      # reasoning и model исключаются из replay
```

**Обработка ошибок в `OpenAIProvider.chat()`:**

```typescript
// Requirements: llm-integration.3
const TIMEOUT_MS = 60_000; // 1 минута

// Таймаут через AbortController
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);

try {
  const response = await fetch(url, { signal: controller.signal, ... });
  // ...
} catch (error) {
  if (error.name === 'AbortError') {
    throw new LLMError('timeout', 'Request timed out. The model took too long to respond.');
  }
  throw new LLMError('network', 'Network error. Please check your internet connection.');
} finally {
  clearTimeout(timeout);
}

// HTTP ошибки
if (response.status === 401 || response.status === 403) {
  throw new LLMError('auth', 'Invalid API key.');
  // UI отобразит ссылку "Open Settings" рядом с сообщением
}
if (response.status === 429) {
  throw new LLMError('rate_limit', 'Rate limit exceeded. Please try again later.');
}
if (response.status >= 500) {
  throw new LLMError('provider', 'Provider service unavailable. Please try again later.');
}
```

`LLMError` — кастомный класс с полем `code` для различения типов ошибок в тестах.

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

**Алгоритм `run()`:**

```
1. Загрузить историю сообщений агента
2. Получить API ключ из UserSettingsManager
3. Создать провайдер: new OpenAIProvider(apiKey)
4. Собрать промпт через PromptBuilder
5. llmMessageId = null, accumulatedReasoning = ''
6. Вызвать provider.chat(messages, options, onChunk):
   onChunk(chunk):
     if llmMessageId == null:
       создать kind:llm сообщение → llmMessageId = message.id
     accumulatedReasoning += chunk.delta
     обновить kind:llm (reasoning.text = accumulatedReasoning)
     эмитить message.llm.reasoning.updated { delta, accumulatedText }
     эмитить message.updated
7. Получить LLMAction
8. Обновить kind:llm: добавить action + usage
9. Эмитить message.updated (финальное)
```

**Обработка ошибок:**

```
catch(error):
  if llmMessageId != null:
    обновить kind:llm: добавить interrupted: true
    эмитить message.updated
  создать kind:error (messages.reply_to_message_id = userMessageId, payload.error.message)
  эмитить message.created
```

### Прерывание запроса при новом сообщении

`AgentManager` хранит `Map<agentId, AbortController>` — по одному контроллеру на агента.

**Алгоритм при `messages:create` с `kind: user`:**

```
1. Если для agentId есть активный AbortController:
   a. Вызвать controller.abort('interrupted_by_user')
   b. Удалить контроллер из Map
2. Создать новый AbortController, сохранить в Map
3. Создать kind:user сообщение
4. Запустить MainPipeline.run(agentId, messageId, abortController.signal)
5. По завершении run() — удалить контроллер из Map
```

`MainPipeline.run()` принимает `AbortSignal` и передаёт его в `fetch()`. При отмене:
- Если `kind: llm` ещё не создан — просто выходим (нет сообщений для очистки)
- Если `kind: llm` уже создан — помечаем `interrupted: true`, выходим без создания `kind: error`

**`PromptBuilder`** при сборке истории фильтрует сообщения с `interrupted: true` — они не попадают в YAML.

**`PromptBuilder`** также фильтрует сообщения с `kind: error` — они не попадают в YAML (требование llm-integration.3.9).

**UI** фильтрует сообщения с `interrupted: true` — они не отображаются в чате.

### Скрытие kind:error при новом сообщении

При создании нового `kind: user` сообщения `AgentIPCHandlers` ДОЛЖЕН пометить все `kind: error` сообщения этого агента флагом `dismissed: true` в payload перед запуском нового `MainPipeline.run()`.

```
messages:create (kind: user):
  1. UPDATE messages SET payload_json = json_set(payload_json, '$.data.dismissed', true)
     WHERE agent_id = ? AND kind = 'error'
  2. Отменить активный pipeline (если есть)
  3. Создать kind:user сообщение
  4. Запустить MainPipeline.run()
```

UI фильтрует сообщения с `dismissed: true` — они не отображаются (аналогично `interrupted: true`).

### Rate limit диалог (llm-integration.3.7)

При получении ошибки `rate_limit` `MainPipeline` НЕ создаёт `kind: error` сообщение, а эмитит событие `agent.rate_limit` с полем `retryAfterSeconds: 10`.

Renderer подписывается на `agent.rate_limit` и показывает диалог поверх чата. По истечении таймера renderer вызывает IPC `messages:retry-last` — `AgentIPCHandlers` берёт последний `kind:user` из БД и повторяет `MainPipeline.run()` с этим `userMessageId`. При успехе диалог исчезает. При нажатии "Cancel" renderer вызывает IPC `messages:cancel-retry` — `AgentIPCHandlers` удаляет последнее `kind: user` сообщение из БД. Диалоги ошибок и уведомлений растягиваются на всю ширину области чата (llm-integration.3.4.4).

```typescript
// Новое событие
interface AgentRateLimitPayload {
  agentId: string;
  userMessageId: number;
  retryAfterSeconds: number; // всегда 10
}
```

```typescript
// Requirements: llm-integration.2
interface MessageLlmReasoningUpdatedPayload {
  messageId: number;
  agentId: string;
  delta: string;
  accumulatedText: string;
}
```

Добавляется в `src/shared/events/types.ts` и `src/shared/events/constants.ts`.

---

## Поток Данных

```
User отправляет сообщение
  → AgentIPCHandlers.messages:create
  → MessageManager.create(kind: 'user')        → message.created
  → MainPipeline.run(agentId, messageId) [async]
      → PromptBuilder.build(history)
      → OpenAIProvider.chat(messages, options, onChunk)
          → [reasoning chunk]
              → MessageManager.create/update(kind: 'llm')
              → message.llm.reasoning.updated
              → message.updated
          → [LLMAction received]
              → MessageManager.update(kind: 'llm', action)
              → message.updated
      → [on error]
          → MessageManager.update(kind: 'llm', interrupted: true) [если уже создан]
          → MessageManager.create(kind: 'error')
          → message.updated / message.created
```

---

## Стратегия Тестирования

### Модульные тесты

- `tests/unit/llm/OpenAIProvider.chat.test.ts` — мок fetch, стриминг, ошибки, usage
- `tests/unit/agents/PromptBuilder.test.ts` — YAML-сериализация, исключения из replay
- `tests/unit/agents/MainPipeline.test.ts` — мок провайдера, полный цикл, ошибки, события
- `tests/unit/agents/AgentIPCHandlers.test.ts` — запуск pipeline при kind:user
- `tests/unit/hooks/useMessages.test.ts` — обработка новых событий
- `tests/unit/db/repositories/MessagesRepository.test.ts` — kind как параметр

### Функциональные тесты

- `tests/functional/llm-chat.spec.ts` — "should show llm response after user message"
- `tests/functional/llm-chat.spec.ts` — "should show reasoning before answer"
- `tests/functional/llm-chat.spec.ts` — "should show error message on invalid api key"
- `tests/functional/llm-chat.spec.ts` — "should interrupt previous request when new message sent during streaming"
- `tests/functional/llm-chat.spec.ts` — "should not show interrupted llm message in chat"
- `tests/functional/llm-chat.spec.ts` — "should show rate limit banner with countdown"
- `tests/functional/llm-chat.spec.ts` — "should show provider error message on 500"
- `tests/functional/llm-chat.spec.ts` — "should hide error bubble when user sends next message"
- `tests/functional/llm-chat.spec.ts` — "should send full conversation history to llm on second message"
- `tests/functional/llm-chat.spec.ts` — "should exclude error messages from llm history"

### Покрытие Требований

| Требование | Модульные тесты | Функциональные тесты |
|------------|-----------------|----------------------|
| llm-integration.1 | ✓ | ✓ |
| llm-integration.2 | ✓ | ✓ |
| llm-integration.3.1 | ✓ | ✓ |
| llm-integration.3.2 | ✓ | ✓ |
| llm-integration.3.4 | ✓ | ✓ |
| llm-integration.3.4.4 | - | - |
| llm-integration.3.5 | ✓ | ✓ |
| llm-integration.3.7 | - | ✓ |
| llm-integration.3.8 | - | ✓ |
| llm-integration.3.9 | ✓ | ✓ |
| llm-integration.4 | ✓ | - |
| llm-integration.5 | ✓ | - |
| llm-integration.6 | ✓ | - |
| llm-integration.7 | ✓ | ✓ |
| llm-integration.8.1 | ✓ | ✓ |
| llm-integration.8.5 | ✓ | ✓ |
| llm-integration.8.6 | ✓ | - |
