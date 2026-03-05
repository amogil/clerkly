# Документ Дизайна: LLM Integration

## Обзор

LLM Integration обеспечивает полный цикл взаимодействия с AI: от отправки user-сообщения до отображения streaming-ответа с reasoning в UI. Архитектура расширяема — `PromptBuilder` с фичами и стратегиями истории позволяет добавлять новые возможности без изменения core-логики.

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
    "action": { "type": "text", "content": "Hi! How can I help?" }
  }
}
```

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

**UI отображение:** `reply_to_message_id` хранится в колонке `messages.reply_to_message_id` и передаётся в `MessageSnapshot` отдельным полем, не внутри payload. В renderer `kind: error` рендерится как стандартизированный диалог через кастомный `AgentDialog` с intent `error`, единым layout и опциональными действиями. Для ошибок API ключа (auth) диалог показывает "Open Settings" (primary) и "Retry" (secondary); при нажатии "Retry" диалог ошибки скрывается и запрос повторяется. `AgentDialog` поддерживает intent `error`, `warning`, `info`, `confirmation`; диалоги уведомлений (например, rate limit) используют этот же компонент с intent `info`.

---

## Structured Output

### Единый декларативный контракт схемы

- **Single source of truth:** используется единый модуль контракта Structured Output (`StructuredOutputContract`), где поля задаются декларативно вместе с ограничениями и описаниями.
- **Семантика полей:** для каждого поля задаётся `description`, чтобы модель получала не только формат, но и смысл поля.
- **Автогенерация схемы:** JSON Schema для провайдеров строится автоматически из декларативного контракта.
- **Единая валидация:** парсинг ответа модели выполняется через `safeParse` этого же контракта, без дублирования ручных проверок структуры.
- **Эффект:** схема, форматы и семантика полей синхронизированы между prompt-инструкциями, провайдерами и runtime-валидацией.

### Structured Output: обработка ответа и ошибок

#### Контроль формата Structured Output и повтор запроса

- **Ответственный:** `MainPipeline`.
- **Проверка формата:** после получения ответа LLM валидируем соответствие единому декларативному контракту (`safeParse`).
- **При нарушении формата:** запрос повторяется с дополнительной инструкцией о строгом соблюдении формата Structured Output.
- **Ограничение:** выполняется не более 2 повторных попыток.
- **Если формат не исправлен:** создаётся `kind: error` с типом `provider` и сообщением `"Invalid response format. Please try again later."` в чате текущего агента.
- **Отображение:** `AgentMessage` рендерит это сообщение в чате агента как стандартный диалог ошибки (как и другие `kind: error`).
- **Повтор:** в этом же сообщении в чате агента доступна кнопка `Retry` для повторного запроса.

### Usage JSON: отдельный поток сохранения

- **Ответственный:** `MainPipeline` + `MessageManager` + `MessagesRepository`.
- **Контракт провайдера:** каждый провайдер возвращает usage-envelope в едином виде `canonical + raw`.
- **Отдельный шаг:** после финализации `kind: llm` сообщения pipeline отдельно сохраняет `usage_json` в `messages`.
- **Устойчивость:** ошибка записи `usage_json` не должна ломать основной ответ в чате.
- **Без дублирования:** `usage_json` не содержит `provider`, `model`, `captured_at` (они выводятся из записи сообщения).

#### Некорректный Structured Output

ЕСЛИ Structured Output не соответствует контракту (например, отсутствует `action.content`), система:
- выполняет не более 2 повторных запросов;
- передаёт в повторный запрос инструкцию: `"Your previous response did not match the required JSON schema. Reply again using the exact required format only."`;
- после исчерпания повторов применяет поведение из блока «Контроль формата Structured Output и повтор запроса» выше.

### История для модели: формирование входных сообщений

Логика передачи истории в модель:

1. Берём всю историю сообщений агента.
2. Исключаем сообщения `kind:error` и сообщения с `hidden: true`.
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

### Structured Output: описание формата для модели

#### Как контракт передаётся провайдерам

Единый декларативный контракт используется в двух формах:
- JSON Schema (машинная схема для провайдера, где это поддерживается);
- текстовая инструкция (семантика и форматы полей), сформированная из того же контракта.

#### Использование контракта в провайдерах

- **Возможности внешних API (по документации провайдеров):**
  - `OpenAI`: интеграция выполняется через **Responses API**; Structured Output задаётся через `text.format` с типом `json_schema`.
  - `Google Gemini`: поддерживает JSON Schema через `generationConfig.responseSchema` (с `responseMimeType`).
  - `Anthropic`: поддерживает Structured Outputs через `output_config.format` с типом `json_schema`.
- Все провайдеры при парсинге ответа модели выполняют валидацию через общий `safeParse` контракта.

#### OpenAI strict schema adapter

- Для `OpenAI` используется provider-specific адаптер схемы перед отправкой в `text.format.schema`.
- Адаптер удаляет только `format: "uri"` (ограничение strict subset OpenAI для URL-формата).
- Если адаптер встречает любой другой `format`, выполнение прерывается с явной ошибкой конфигурации схемы (fail-fast), чтобы не отправлять неоднозначную/неподдерживаемую схему.

#### Формат structured output

**Схема и форматы полей:**

- `action.type`: строка, значение `text`.
- `action.content`: строка с пользовательским текстом ответа.
- `usage` НЕ является частью model structured output; usage-envelope (`canonical + raw`) передаётся провайдером отдельно и сохраняется в `messages.usage_json`.

Модель возвращает JSON:

```json
{
  "action": { "type": "text", "content": "Text response" }
}
```

### Полный pipeline обработки сообщения (события и реакции)

#### 1. Main process: получение ответа LLM
1) `MainPipeline` получает Structured Output от провайдера.
2) Валидирует формат (`action.content`, `action.type`).
3) При ошибке формата — делает retry с системным сообщением.
4) Сохраняет `kind: llm` сообщение в БД (payload целиком).
5) Эмитит `message.created`/`message.updated` как обычно.

#### 2. Renderer: первичный рендер
1) Получает `message.created`/`message.updated`.
2) `AgentMessage` рендерит `action.content` как Markdown.
3) Дополнительных post-processing этапов нет.

### Крайние случаи

- Некорректный structured output от провайдера → выполняются retry по контракту.
- При исчерпании retry создаётся `kind:error` сообщение с единым пользовательским текстом.

### Дополнительные параметры (выбраны по умолчанию)

- Дополнительных параметров для image-pipeline нет (функциональность удалена).

### Исключение hidden из истории

- **Правило:** сообщения с флагом `hidden` не включаются в историю промпта.
- **Централизация:** фильтрация выполняется в `MessageManager.listForModelHistory()`.
- **Проверка:** покрывается модульным и функциональным тестами, где скрытые сообщения не попадают в историю второго запроса.

### Тестирование

#### Unit tests
- валидация и парсинг structured output.
- обработка usage-envelope и persist в `messages.usage_json`.
- обработка ошибок формата и retry в `MainPipeline`.

#### Functional tests
- История передаётся как отдельные сообщения и исключает служебные поля.
- Structured Output описан в системном промпте и используется моделью.
- Invalid structured output → retry, затем ошибка с `Retry`.

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
}

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

interface LLMStructuredOutput {
  action: LLMAction;
  usage?: LLMUsage;
}

interface ILLMProvider {
  testConnection(apiKey: string): Promise<TestConnectionResult>;
  // apiKey передаётся в конструктор
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMStructuredOutput>;
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

  buildMessages(messages: Message[]): ChatMessage[] // system + history messages
}
```

`PromptBuilder.buildMessages()` возвращает итоговый массив `ChatMessage[]`:
- один элемент `role: system` с системной инструкцией;
- затем отдельные элементы истории (`role: user`/`role: assistant`) по одному на сообщение.

**Базовая инструкция для system-role:**

```
You are a helpful AI assistant. Always reply in the user's language (detected from the latest user message in the current request), including both your final answer and any reasoning text. You may respond in Markdown when it improves clarity. Supported Markdown (GFM): headings, paragraphs, bold/italic/strikethrough, links/autolinks, blockquotes, ordered/unordered lists and task lists, tables, horizontal rules, inline code, fenced code blocks with language tags (syntax highlighting), Mermaid diagrams (```mermaid```), and math via KaTeX (inline $...$ or block $$...$$). Do not use footnotes.
```

**Формат входных сообщений (пример):**

```json
[
  { "role": "system", "content": "System instruction..." },
  { "role": "user", "content": "Hello" },
  { "role": "assistant", "content": "Hi! How can I help?" }
]
```

**Обработка ошибок в `OpenAIProvider.chat()`:**

```typescript
// Requirements: llm-integration.3
const TIMEOUT_MS = 300_000; // 5 минут

// Таймаут через AbortController
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);

try {
  const response = await fetch(url, { signal: controller.signal, ... });
  // ...
} catch (error) {
  if (error.name === 'AbortError') {
    throw new LLMError('timeout', 'Model response timeout. The provider took too long to respond. Please try again later.');
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

**Поведение `run()`:**

```
1. Загружает историю сообщений агента
2. Получает API ключ из UserSettingsManager
3. Создаёт экземпляр провайдера с актуальными настройками
4. Собирает промпт через PromptBuilder
5. Инициализирует локальное состояние выполнения (`llmMessageId`, `accumulatedReasoning`)
6. Вызывает `provider.chat(messages, options, onChunk)`:
   onChunk(chunk):
     if llmMessageId == null:
      создаёт `kind: llm` сообщение (`done: false`, `reply_to_message_id = userMessageId`) → `llmMessageId = message.id`
     accumulatedReasoning += chunk.delta
     обновляет `kind: llm` (`reasoning.text = accumulatedReasoning`, `done: false`)
     эмитит `message.llm.reasoning.updated { delta, accumulatedText }`
     эмитит `message.updated`
7. Получает финальный Structured Output
8. Обновляет `kind: llm` (action + usage, `done: true`)
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

`MainPipeline.run()` принимает `AbortSignal` и передаёт его в `fetch()`. При отмене:
- Если `kind: llm` ещё не создан — просто выходим (нет сообщений для очистки)
- Если `kind: llm` уже создан — помечаем `hidden: true, done: false`, выходим без создания `kind: error`

**`MessageManager.listForModelHistory()`** фильтрует сообщения с `hidden` — они не попадают во входной массив `messages`.

**`MessageManager.listForModelHistory()`** также фильтрует сообщения с `kind: error` — они не попадают во входной массив `messages` (требование llm-integration.3.9).

**UI** фильтрует сообщения с `hidden: true` — они не отображаются в чате.

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

UI фильтрует сообщения с `hidden: true` — они не отображаются.

### Rate limit диалог (llm-integration.3.7)

При получении ошибки `rate_limit` `MainPipeline` не создаёт `kind: error` сообщение и эмитит событие `agent.rate_limit` с вычисленным `retryAfterSeconds`.

Renderer подписывается на `agent.rate_limit` и показывает диалог поверх чата. По истечении таймера renderer вызывает IPC `messages:retry-last`: `AgentIPCHandlers` берёт последний `kind:user` из БД и повторяет `MainPipeline.run()` с этим `userMessageId`. При успехе диалог исчезает. При нажатии "Cancel" renderer вызывает IPC `messages:cancel-retry`: `AgentIPCHandlers` удаляет последнее `kind: user` сообщение из БД. Диалоги ошибок и уведомлений занимают всю ширину области чата (llm-integration.3.4.4).

```typescript
// Новое событие
interface AgentRateLimitPayload {
  agentId: string;
  userMessageId: number;
  retryAfterSeconds: number;
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

Событие определено в `src/shared/events/types.ts` и `src/shared/events/constants.ts`.

---

## Поток Данных

```
User отправляет сообщение
  → AgentIPCHandlers.messages:create
  → MessageManager.create(kind: 'user')        → message.created
  → MainPipeline.run(agentId, messageId) [async]
      → PromptBuilder.buildMessages(history)
      → OpenAIProvider.chat(messages, options, onChunk)
          → [reasoning chunk]
              → MessageManager.create/update(kind: 'llm', done: false, reply_to_message_id: userMessageId)
              → message.llm.reasoning.updated
              → message.updated
          → [LLMAction received]
              → MessageManager.update(kind: 'llm', action, done: true)
              → message.updated
      → [on error]
          → MessageManager.update(kind: 'llm', hidden: true, done: false) [если уже создан]
          → MessageManager.create(kind: 'error', done: true, reply_to_message_id: userMessageId)
          → message.updated / message.created
```

---

## Стратегия Тестирования

### Модульные тесты

- `tests/unit/llm/OpenAIProvider.chat.test.ts` — мок fetch, стриминг, ошибки, usage
- `tests/unit/agents/PromptBuilder.test.ts` — формирование массива `messages`, исключения из replay
- `tests/unit/agents/MainPipeline.test.ts` — мок провайдера, полный цикл, ошибки, события
- `tests/unit/agents/AgentIPCHandlers.test.ts` — запуск pipeline при kind:user
- `tests/unit/hooks/useMessages.test.ts` — обработка новых событий
- `tests/unit/db/repositories/MessagesRepository.test.ts` — kind как параметр

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
| llm-integration.1.6.1 (`llm` с `done=false` до финализации) | ✓ | ✓ |
| llm-integration.1.6.2 (финализация `llm` с `done=true`) | ✓ | ✓ |
| llm-integration.1.7 (`reply_to_message_id` для создаваемых сообщений) | ✓ | ✓ |
| llm-integration.2 | ✓ | ✓ |
| llm-integration.3.1 | ✓ | ✓ |
| llm-integration.3.1.1 (`error` сохраняется с `done=true`) | ✓ | ✓ |
| llm-integration.3.2 | ✓ | ✓ |
| llm-integration.3.4 | ✓ | ✓ |
| llm-integration.3.4.4 | - | ✓ |
| llm-integration.3.5 | ✓ | ✓ |
| llm-integration.3.6 (таймаут 300s) | ✓ | ✓ |
| llm-integration.3.7 | - | ✓ |
| llm-integration.3.8 | - | ✓ |
| llm-integration.3.9 | ✓ | ✓ |
| llm-integration.4 | ✓ | - |
| llm-integration.4.7 (ответ и reasoning на языке пользователя) | ✓ | ✓ |
| llm-integration.5 | ✓ | - |
| llm-integration.5.8 (модели/`reasoning_effort` для test/prod) | ✓ | ✓ |
| llm-integration.6 | ✓ | - |
| llm-integration.6.5 (`done` как отдельный флаг) | ✓ | - |
| llm-integration.6.6 (совместимость `done` для существующих записей) | ✓ | - |
| llm-integration.7 | ✓ | ✓ |
| llm-integration.8.1 | ✓ | ✓ |
| llm-integration.8.5 | ✓ | ✓ |
| llm-integration.8.6 | ✓ | - |
| llm-integration.8.7 | ✓ | ✓ |
| llm-integration.10 | ✓ | ✓ |
| llm-integration.11 | ✓ | ✓ |
| llm-integration.12 | ✓ | ✓ |
| llm-integration.13 | ✓ | - |
