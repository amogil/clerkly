# План реализации: Интеграция LLM (Issue #31)

## Ветка
`feature/llm-integration`

## Контекст

Уже реализовано:
- `AgentManager`, `MessageManager`, `AgentIPCHandlers` — управление агентами и сообщениями
- `OpenAIProvider` — только тест-коннект (не умеет чатиться)
- `ILLMProvider` — интерфейс с одним методом `testConnection()`
- Схема БД: таблица `messages` с `payload_json` (kind: user | llm | final_answer | ...)
- `useMessages.sendMessage()` — создаёт `kind: user` сообщение через IPC, но не запускает LLM
- `UserSettingsManager` — хранит настройки пользователя, включая API ключи

Не реализовано:
- LLM-цикл (pipeline)
- Стриминг ответов
- Отображение `kind: llm` сообщений в UI

---

## Согласованные решения

1. **Модели:** `gpt-5-nano` с `reasoning_effort: "low"` для функциональных тестов, `gpt-5.2` с `reasoning_effort: "medium"` для реальной работы.
2. **Поле `kind`:** Добавить колонку `kind` в таблицу `messages`, убрать `kind` из `payload_json`. Миграция заполняет `kind` из существующих записей.
3. **События сообщений:**
   - `message.created` — любое новое сообщение (user, llm, error)
   - `message.updated` — любое обновление сообщения (промежуточное или финальное)
   - `message.llm.reasoning.updated` — только для reasoning чанков, летит одновременно с `message.updated`
4. **Reasoning в UI:** Показывать как текст под основным ответом.
5. **Structured output:** Только `text` для MVP. JSON схема: `{ "action": { "type": "text", "content": "..." } }`. `final_answer` исключён из MVP.
6. **API ключ:** Из `UserSettingsManager` через `settings.loadAPIKey(provider)`. Для тестов — из `OPENAI_API_KEY` env.
7. **Системный промпт:** Заглушка `"You are a helpful AI assistant."`.
8. **Ошибки LLM:** Отдельное сообщение в чате с `kind: error`.
9. **`reply_to_message_id`:** Первое сообщение в чате агента — `null`. Все остальные сообщения (любого kind, включая user) — `id` предыдущего сообщения в чате.
10. **Busy/queue логика:** Не реализуем в MVP.
11. **AgentEngine (retry):** Не реализуем в MVP.
12. **Формат промпта:** Весь запрос к LLM передаётся в YAML — системный промпт, история сообщений, инструменты.

---

## Архитектура построения промпта

`PromptBuilder` — расширяемая система сборки промпта.

### Концепция

```
PromptBuilder
├── SystemPromptSection       — базовый системный промпт агента
├── FeatureSection[]          — набор фич, каждая добавляет свой промпт + инструменты
│   ├── feature.systemPrompt  — дополнение к системному промпту
│   └── feature.tools[]       — инструменты этой фичи
└── HistorySection            — история сообщений (сериализуется в YAML)
    ├── сейчас: вся история
    └── будущее: свежие + суммаризация старых
```

### Формат YAML-запроса к LLM

Весь запрос передаётся как один YAML-документ в системном промпте или как структурированный набор сообщений. История сериализуется в YAML:

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

Поле `reasoning.text` исключается из YAML при сборке истории (`excluded_from_replay: true`).

### Интерфейсы

```typescript
interface AgentFeature {
  name: string;
  getSystemPromptSection(): string;
  getTools(): LLMTool[];
}

class PromptBuilder {
  constructor(
    private systemPrompt: string,
    private features: AgentFeature[],
    private historyStrategy: HistoryStrategy
  ) {}

  build(messages: Message[]): { systemPrompt: string; history: string; tools: LLMTool[] }
  // history — YAML-строка с историей сообщений
}

interface HistoryStrategy {
  select(messages: Message[]): Message[];
}
```

### MVP

- `SystemPromptSection` — заглушка: `"You are a helpful AI assistant."`
- `features: []` — пустой список
- `HistoryStrategy` — `FullHistoryStrategy` (вся история)
- Инструменты: нет

---

## Шаги реализации

### 1. Спека

**Файлы:**
- `.kiro/specs/llm-integration/requirements.md`
- `.kiro/specs/llm-integration/design.md`

---

### 2. Миграция БД — добавить поле `kind` в таблицу `messages`

**Файлы:**
- `src/main/db/schema.ts` — добавить колонку `kind TEXT NOT NULL` (без дефолта, всегда передаётся явно)
- `src/main/MigrationRunner.ts` — новая миграция: проставить `kind = 'user'` всем существующим записям, убрать `kind` из payload
- `src/main/db/repositories/MessagesRepository.ts` — обновить запросы, принимать `kind` как отдельный параметр
- `src/shared/utils/agentStatus.ts` — добавить `kind: 'error'` в тип `MessagePayload`

---

### 3. Расширить `ILLMProvider` — добавить метод `chat()`

**Файлы:**
- `src/main/llm/ILLMProvider.ts` — добавить интерфейсы и метод `chat()`
- `src/main/llm/OpenAIProvider.ts` — реализовать `chat()` со стримингом reasoning и structured output
- `src/main/llm/LLMConfig.ts` — добавить модели для чата

**Structured output:**

Каждый провайдер реализует structured output своим способом внутри, наружу выдаёт единый `LLMAction`.

**Стриминг + structured output:**
- **Reasoning** — стримится по чанкам через `onChunk`
- **Action (JSON)** — получается целиком в конце

**Интерфейс:**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ChatOptions {
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools?: LLMTool[];
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
    cached_tokens?: number;      // токены из кэша (дешевле)
    reasoning_tokens?: number;   // токены потраченные на reasoning
  };
}

interface ILLMProvider {
  testConnection(apiKey: string): Promise<TestConnectionResult>;
  // apiKey передаётся в конструктор при создании провайдера
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<LLMAction>;
  getProviderName(): string;
}
```

---

### 4. Создать `PromptBuilder`

**Файл:** `src/main/agents/PromptBuilder.ts`

- `AgentFeature` интерфейс
- `HistoryStrategy` интерфейс + `FullHistoryStrategy` реализация
- `PromptBuilder` класс — собирает системный промпт, сериализует историю в YAML, собирает инструменты
- Конвертация `Message[]` → YAML-строка (исключает `reasoning.text` из replay)

---

### 5. Создать `MainPipeline`

**Файл:** `src/main/agents/MainPipeline.ts`

**Ответственность:**
- Принимает `agentId` + `userMessageId`
- Использует `PromptBuilder` для сборки промпта (YAML история + системный промпт)
- Берёт API ключ из `UserSettingsManager` через `settings.loadAPIKey(provider)` и `settings.loadLLMProvider()`
- Вызывает `ILLMProvider.chat()` со стримингом
- При первом чанке: создаёт `kind: llm` сообщение через `MessageManager.create()`
- При каждом reasoning чанке: обновляет сообщение через `MessageManager.update()` → эмитит одновременно `message.llm.reasoning.updated` (delta + accumulatedText) и `message.updated` (полный snapshot)
- При завершении reasoning / получении action: `MessageManager.update()` → `message.updated`
- При завершении: финальный `LLMAction` записывается в то же `kind: llm` сообщение
- При ошибке: два сценария:
  - **До первого чанка** (LLM не ответил): создаёт только `kind: error` сообщение
  - **После начала стриминга** (LLM начал, потом оборвалось): обновляет существующий `kind: llm` — добавляет `"interrupted": true` в payload → затем создаёт `kind: error` сообщение

**Параллелизм:**
- `MainPipeline` stateless — всё состояние выполнения (`llmMessageId`, `accumulatedReasoning`) живёт в локальных переменных внутри `run()`
- Несколько агентов выполняются конкурентно через async/await — Node.js event loop переключается между ними пока каждый ждёт LLM
- Изоляция гарантирована: каждый `run()` работает только со своим `agentId` и своими сообщениями
- Первое сообщение в чате агента — `reply_to_message_id: null`
- Все остальные сообщения (любого kind, включая user) — `reply_to_message_id` указывает на `id` предыдущего сообщения в чате
- `MainPipeline` при создании `kind: llm` / `kind: error` берёт `id` последнего сообщения в чате как `reply_to_message_id`
- При создании `kind: user` сообщения — `AgentIPCHandlers` аналогично берёт `id` последнего сообщения

**Структура `kind: llm` payload (без поля `kind` — оно в колонке):**
```json
{
  "data": {
    "reply_to_message_id": 123,
    "model": "gpt-5.2",
    "reasoning": { "text": "...", "excluded_from_replay": true },
    "action": { "type": "text", "content": "..." },
    "usage": { "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "cached_tokens": 0, "reasoning_tokens": 0 }
  }
}
```

**Структура `kind: error` payload:**
```json
{
  "data": {
    "reply_to_message_id": 123,
    "error": {
      "type": "auth | rate_limit | provider | network | timeout",
      "message": "...",
      "action_link": { "label": "Open Settings", "screen": "settings" }
    }
  }
}
```

`action_link` присутствует только для ошибок типа `auth`.

---

### 5.1 Новое событие `message.llm.reasoning.updated`

**Файлы:**
- `src/shared/events/types.ts` — добавить тип события и класс `MessageLlmReasoningUpdatedEvent`
- `src/shared/events/constants.ts` — добавить `MESSAGE_LLM_REASONING_UPDATED`

**Payload:**
```typescript
interface MessageLlmReasoningUpdatedPayload {
  messageId: number;
  agentId: string;
  delta: string;          // новый кусок reasoning
  accumulatedText: string; // весь reasoning накопленный до этого момента
}
```

**Поведение при стриминге reasoning:**
```
// На каждый чанк MainPipeline эмитит оба события:
MainEventBus.publish(new MessageLlmReasoningUpdatedEvent({ messageId, agentId, delta, accumulatedText }))
MainEventBus.publish(new MessageUpdatedEvent(fullMessageSnapshot))
```

Renderer может подписаться только на `message.llm.reasoning.updated` для специфичной анимации reasoning, и на `message.updated` для общего обновления.

---

### 6. Подключить `MainPipeline` к `AgentIPCHandlers`

**Файл:** `src/main/agents/AgentIPCHandlers.ts`

- При `messages:create` с `kind: user` → запускать `MainPipeline.run(agentId, messageId)` асинхронно
- IPC возвращает результат сразу, pipeline работает в фоне

---

### 7. Обновить renderer

**Файлы:**
- `src/renderer/hooks/useMessages.ts` — обрабатывать `kind: llm`, `kind: error`
- `src/renderer/components/agents.tsx` — рендер сообщений:
  - `kind: llm` → пузырь слева: сначала reasoning (стримится в реальном времени), потом ответ (появляется после завершения)
  - `kind: error` → красный пузырь слева с текстом ошибки

---

### 8. Тесты

**Модульные:**
- `tests/unit/llm/OpenAIProvider.chat.test.ts`
  - успешный chat без reasoning
  - успешный chat с reasoning (стриминг чанков)
  - ошибка сети (fetch throws)
  - HTTP 401 (неверный ключ)
  - HTTP 429 (rate limit)
  - пустой ответ от API
  - usage поля корректно маппятся (cached_tokens, reasoning_tokens)
- `tests/unit/agents/PromptBuilder.test.ts`
  - пустая история → только системный промпт
  - история с user + llm сообщениями → корректный YAML
  - reasoning исключается из YAML (excluded_from_replay)
  - model исключается из YAML
  - первое сообщение имеет reply_to_message_id: null
  - interrupted: true в llm сообщении корректно сериализуется
- `tests/unit/agents/MainPipeline.test.ts`
  - успешный цикл: user message → llm message создаётся → action записывается
  - reasoning чанки: message.updated + message.llm.reasoning.updated эмитятся на каждый чанк
  - ошибка до первого чанка → только kind:error создаётся
  - ошибка после начала стриминга → llm message помечается interrupted:true + kind:error создаётся
  - reply_to_message_id корректно проставляется (первое сообщение = null, остальные = предыдущее)
  - параллельные вызовы для разных агентов не мешают друг другу
- `tests/unit/agents/AgentIPCHandlers.test.ts` (обновить)
  - messages:create с kind:user запускает MainPipeline асинхронно
  - IPC возвращает результат до завершения pipeline
- `tests/unit/hooks/useMessages.test.ts` (обновить)
  - message.llm.reasoning.updated обновляет reasoning в стейте
  - message.updated обновляет сообщение целиком
  - kind:error рендерится корректно
- `tests/unit/db/repositories/MessagesRepository.test.ts` (обновить)
  - create с явным kind сохраняет корректно
  - kind не имеет дефолта — ошибка если не передан

**Функциональные:**
- `tests/functional/llm-chat.spec.ts` — реальный OpenAI (через `OPENAI_API_KEY` из env), модель `gpt-5-nano`
- `env.example` — добавить `OPENAI_API_KEY=your-key-here`

---

## Чеклист выполнения

После каждого шага: написать тесты (unit + функциональные где применимо), запустить, закоммитить.

### Шаг 1: Спека
- [x] Написать `.kiro/specs/llm-integration/requirements.md`
- [x] Написать `.kiro/specs/llm-integration/design.md`
- [x] Коммит

### Шаг 2: Миграция БД — колонка `kind` в `messages`
- [x] `src/main/db/schema.ts` — добавить колонку `kind TEXT NOT NULL`
- [x] `src/main/MigrationRunner.ts` — новая миграция: проставить `kind = 'user'` всем существующим записям (все текущие сообщения в БД являются пользовательскими), убрать `kind` из payload
- [x] `src/main/db/repositories/MessagesRepository.ts` — обновить `create()` и `update()`, принимать `kind` как параметр; добавить `getById()`
- [x] `src/shared/utils/agentStatus.ts` — добавить `'error'` в тип `MessagePayload.kind`
- [x] Тесты:
  - [x] `tests/unit/db/schema.test.ts` — колонка `kind` присутствует, NOT NULL
  - [x] `tests/unit/MigrationRunner.test.ts` — миграция заполняет `kind` из `payload_json`
  - [x] `tests/unit/db/repositories/MessagesRepository.test.ts` — create с явным kind, ошибка без kind
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 3: Расширить `ILLMProvider` + `OpenAIProvider.chat()`
- [x] `src/main/llm/ILLMProvider.ts` — добавить интерфейсы `ChatMessage`, `ChatOptions`, `ChatChunk`, `LLMAction`, метод `chat()`
- [x] `src/main/llm/LLMConfig.ts` — добавить chat-модели и `CHAT_TIMEOUT_MS`
- [x] `src/main/llm/OpenAIProvider.ts` — конструктор принимает `apiKey`, реализовать `chat()`:
  - [x] streaming fetch с SSE парсингом
  - [x] reasoning чанки через `onChunk`
  - [x] structured output (JSON schema `{ action: { type, content } }`)
  - [x] маппинг usage полей (input/output/cached/reasoning tokens)
- [x] `src/main/llm/AnthropicProvider.ts`, `GoogleProvider.ts` — заглушки `chat()`
- [x] Тесты (`tests/unit/llm/OpenAIProvider.chat.test.ts`):
  - [x] успешный chat без reasoning
  - [x] успешный chat с reasoning (стриминг чанков, onChunk вызывается)
  - [x] ошибка сети (fetch throws)
  - [x] таймаут / AbortError
  - [x] HTTP 401 (неверный ключ)
  - [x] HTTP 429 (rate limit)
  - [x] пустой ответ от API
  - [x] usage поля корректно маппятся
  - [x] контент разбит на несколько чанков
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 4: `PromptBuilder`
- [x] `src/main/agents/PromptBuilder.ts`:
  - [x] интерфейс `AgentFeature`
  - [x] интерфейс `HistoryStrategy` + класс `FullHistoryStrategy`
  - [x] класс `PromptBuilder` — сборка системного промпта, YAML-сериализация истории, сбор инструментов
  - [x] исключение `reasoning.text` и `model` из YAML при сериализации
- [x] Тесты (`tests/unit/agents/PromptBuilder.test.ts`):
  - [x] пустая история → только системный промпт
  - [x] история с user + llm → корректный YAML
  - [x] reasoning исключается из YAML
  - [x] model исключается из YAML
  - [x] первое сообщение: `reply_to_message_id: null`
  - [x] `interrupted: true` в llm сообщении корректно сериализуется
  - [x] несколько features — их системные промпты конкатенируются
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 5: `MainPipeline`
- [x] `src/main/agents/MainPipeline.ts`:
  - [x] `run(agentId, userMessageId, signal)` — основной метод, принимает `AbortSignal`
  - [x] получение API ключа из `UserSettingsManager`
  - [x] создание провайдера с ключом
  - [x] сборка промпта через `PromptBuilder`
  - [x] вызов `ILLMProvider.chat()` со стримингом
  - [x] при первом чанке: `MessageManager.create(kind: 'llm')`
  - [x] на каждый reasoning чанк: `MessageManager.update()` + эмит `message.llm.reasoning.updated` + `message.updated`
  - [x] при завершении: финальный update с action
  - [x] при отмене через AbortSignal (`interrupted_by_user`): если `kind: llm` создан — пометить `interrupted: true`; НЕ создавать `kind: error`
  - [x] ошибка после начала стриминга: update llm с `interrupted: true` + создать `kind: error`
  - [x] `reply_to_message_id` — последнее сообщение в чате (null если первое)


  
- [x] Добавить новые события в `src/shared/events/types.ts` и `src/shared/events/constants.ts`:
  - [x] `MESSAGE_LLM_REASONING_UPDATED` с payload `{ messageId, agentId, delta, accumulatedText }`
- [x] Тесты (`tests/unit/agents/MainPipeline.test.ts`):
  - [x] успешный цикл: user message → llm message создаётся → action записывается
  - [x] reasoning чанки: `message.updated` + `message.llm.reasoning.updated` эмитятся на каждый чанк
  - [x] ошибка до первого чанка → только `kind: error` создаётся
  - [x] ошибка после начала стриминга → llm помечается `interrupted: true` + `kind: error`
  - [x] `reply_to_message_id` корректно проставляется
  - [x] параллельные вызовы для разных агентов изолированы
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 6: Подключить `MainPipeline` к `AgentIPCHandlers`
- [x] `src/main/agents/AgentManager.ts` — хранить `Map<agentId, AbortController>`, отменять текущий запрос при новом сообщении от того же агента или при архивировании агента
- [x] `src/main/agents/AgentIPCHandlers.ts` — при `messages:create` с `kind: user`: отменить текущий pipeline агента (если есть), запустить новый `MainPipeline.run()` асинхронно
- [x] Тесты (`tests/unit/agents/AgentIPCHandlers.test.ts`):
  - [x] `messages:create` с `kind: user` запускает pipeline асинхронно
  - [x] IPC возвращает результат до завершения pipeline
  - [x] `messages:create` с другим kind не запускает pipeline
  - [x] повторный `messages:create` отменяет предыдущий pipeline и запускает новый
  - [x] архивирование агента отменяет активный pipeline без создания сообщений
- [x] Тесты (`tests/unit/agents/MainPipeline.test.ts`) — добавить:
  - [x] отмена через AbortSignal до первого чанка — нет сообщений, нет `kind: error`
  - [x] отмена через AbortSignal после начала стриминга — `kind: llm` помечается `interrupted: true`, нет `kind: error`
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 7: Обновить renderer
- [x] `src/shared/events/types.ts` — добавить `MessageLlmReasoningUpdatedEvent` в preload-типы
- [x] `src/preload/index.ts` — пробросить `message.llm.reasoning.updated` в renderer
- [x] `src/renderer/hooks/useMessages.ts`:
  - [x] подписка на `message.llm.reasoning.updated` — обновлять reasoning в стейте
  - [x] подписка на `message.updated` — обновлять сообщение целиком
  - [x] обработка `kind: error`
- [x] `src/renderer/components/agents.tsx` (разбит на компоненты):
  - [x] `kind: llm` — пузырь слева: сначала reasoning (стримится), потом ответ (`MessageBubble`)
  - [x] `kind: error` — красный пузырь слева с текстом ошибки (`MessageBubble`)
  - [x] фильтрация сообщений с `interrupted: true` — не отображаются в чате
  - [x] рефакторинг: `AgentAvatar`, `AgentHeader`, `AllAgentsPage`, `MessageBubble`, `ChatInput`
- [x] Тесты:
  - [x] `tests/unit/hooks/useMessages.test.ts` — `message.llm.reasoning.updated` обновляет reasoning, `kind: error` обрабатывается
  - [x] `tests/unit/components/agents.test.tsx` — рендер `kind: llm` с reasoning и action, рендер `kind: error`
- [x] `npm run validate` проходит
- [x] Коммит

### Шаг 8: Функциональные тесты
- [x] `env.example` — добавить `OPENAI_API_KEY=your-key-here`
- [x] `tests/functional/llm-chat.spec.ts`:
  - [x] отправка сообщения → появляется llm-ответ
  - [x] reasoning отображается перед ответом
  - [x] ошибка (неверный ключ) → отображается error-сообщение
- [x] Коммит

### Финал
- [x] `npm run validate` — все проверки зелёные

## Этап 2: Рефакторинг — колонка `hidden` вместо payload-флагов (выполнено)
- [x] `src/main/db/schema.ts` — колонка `hidden BOOLEAN NOT NULL DEFAULT FALSE`, индекс `idx_messages_agent_hidden`; удалена миграция 001
- [x] `src/main/db/repositories/MessagesRepository.ts` — `dismissErrorMessages` через `hidden=true`, метод `setHidden()`
- [x] `src/main/agents/MessageManager.ts` — `setHidden()`, `dismissErrorMessages()`, `toEventMessage()` включает `hidden`
- [x] `src/main/agents/MainPipeline.ts` — вместо `interrupted: true` в payload — вызов `messageManager.setHidden()`
- [x] `src/main/agents/PromptBuilder.ts` — фильтрация по `msg.hidden`
- [x] `src/renderer/components/agents.tsx` — фильтрация по `message.hidden`
- [x] `src/shared/events/types.ts` — поле `hidden: boolean` в `MessageSnapshot`
- [x] Тесты обновлены во всех затронутых файлах
- [x] `npm run validate` — все проверки зелёные

## Этап 3: Рефакторинг — фильтрация hidden в SQL (выполнено)
- [x] `src/main/db/repositories/MessagesRepository.ts` — `listByAgent(agentId, includeHidden = false)` фильтрует `hidden=false` в SQL по умолчанию
- [x] `src/main/agents/PromptBuilder.ts` — убрана ручная фильтрация `msg.hidden` (теперь на уровне БД)
- [x] `src/renderer/components/agents.tsx` — убрана проверка `if (message.hidden) return null`
- [x] Тесты: добавлены `should exclude hidden messages by default` и `should include hidden messages when includeHidden=true`
- [x] `npm run validate` — все проверки зелёные

---

## Этап 4: Оставшиеся функциональные тесты

### Шаг 9: Функтесты через MockLLMServer (тесты 4, 5, 7, 8, 9, 10)

Все тесты используют `MockLLMServer` вместо реального OpenAI. Требуется настроить `OpenAIProvider` принимать кастомный `baseUrl` для тестов.

#### 9.1 Настройка OpenAIProvider для mock-сервера

**Файлы:**
- `src/main/llm/OpenAIProvider.ts` — принимать опциональный `baseUrl` в конструкторе (только для тестов)
- `src/main/llm/LLMProviderFactory.ts` — пробрасывать `baseUrl` из env `MOCK_LLM_URL` (только если `PLAYWRIGHT_TEST=1`)

#### 9.2 Тест 4: прерывание запроса при новом сообщении

**Тест:** `should interrupt previous request when new message sent during streaming`

**Сценарий:**
1. MockLLMServer настроен на медленный стриминг (задержка между чанками)
2. Пользователь отправляет первое сообщение
3. Пока идёт стриминг — отправляет второе сообщение
4. Первый `kind: llm` помечается `hidden=true` (не виден в UI)
5. Появляется ответ на второе сообщение

**Проверки:**
- В чате виден только один `[data-testid="message-llm"]` — ответ на второе сообщение
- Первый `kind: llm` не отображается (hidden)

**Требования:** llm-integration.8.1, llm-integration.8.4, llm-integration.8.5

#### 9.3 Тест 5: прерванный llm не отображается

**Тест:** `should not show interrupted llm message in chat`

**Сценарий:**
1. MockLLMServer: первый запрос — медленный стриминг, второй — быстрый ответ
2. Отправить сообщение → дождаться начала стриминга → отправить второе
3. Проверить что в чате нет артефактов первого ответа

**Проверки:**
- Ровно один `[data-testid="message-llm"]` в DOM
- Его контент соответствует ответу на второе сообщение

**Требования:** llm-integration.8.5

#### 9.4 Тест 7: ошибка провайдера (HTTP 500)

**Тест:** `should show provider error message on 500`

**Сценарий:**
1. MockLLMServer возвращает HTTP 500
2. Пользователь отправляет сообщение
3. Появляется `[data-testid="message-error"]` с текстом про недоступность сервиса

**Проверки:**
- `[data-testid="message-error"]` виден
- Текст содержит `"unavailable"` или `"try again"`

**Требования:** llm-integration.3.1, llm-integration.3.5

#### 9.5 Тест 8: error bubble исчезает при следующем сообщении

**Тест:** `should hide error bubble when user sends next message`

**Сценарий:**
1. MockLLMServer: первый запрос — HTTP 500, второй — успешный ответ
2. Отправить первое сообщение → появляется error bubble
3. Отправить второе сообщение
4. Error bubble исчезает, появляется llm-ответ

**Проверки:**
- После второго сообщения `[data-testid="message-error"]` не виден
- `[data-testid="message-llm"]` виден

**Требования:** llm-integration.3.8

#### 9.6 Тест 9: полная история передаётся LLM при втором сообщении

**Тест:** `should send full conversation history to llm on second message`

**Сценарий:**
1. MockLLMServer логирует тело запроса
2. Отправить первое сообщение → получить ответ
3. Отправить второе сообщение
4. Проверить тело второго запроса к LLM через `mockLLMServer.getLastRequest()`

**Проверки:**
- Тело второго запроса содержит оба предыдущих сообщения в `messages[]`
- Первое сообщение — `role: user`, второе — `role: assistant`

**Требования:** llm-integration.3.9

#### 9.7 Тест 10: kind:error не попадает в историю LLM

**Тест:** `should exclude error messages from llm history`

**Сценарий:**
1. MockLLMServer: первый запрос — HTTP 500, второй — успешный
2. Отправить первое сообщение → error bubble
3. Отправить второе сообщение
4. Проверить тело второго запроса — `kind: error` не должен быть в истории

**Проверки:**
- В `messages[]` второго запроса нет сообщений с ролью `system` содержащих `[error]`
- Только `role: user` сообщение первого запроса (если не hidden)

**Требования:** llm-integration.3.9

---

### Шаг 10: Rate limit баннер (тест 6) — требует реализации фичи

**Статус:** ❌ заблокирован — фича не реализована

#### 10.1 Реализация rate limit баннера

**Файлы:**
- `src/shared/events/constants.ts` — добавить `AGENT_RATE_LIMIT = 'agent.rate_limit'`
- `src/shared/events/types.ts` — добавить `AgentRateLimitPayload { agentId, userMessageId, retryAfterSeconds }`
- `src/main/agents/MainPipeline.ts` — при HTTP 429: эмитить `agent.rate_limit` вместо создания `kind: error`; парсить `retry-after` заголовок и текст ошибки для определения `retryAfterSeconds`
- `src/main/agents/AgentIPCHandlers.ts` — добавить хендлеры:
  - `messages:retry-last(agentId, userMessageId)` — повторить `MainPipeline.run()` с тем же `userMessageId`
  - `messages:cancel-retry(agentId, userMessageId)` — удалить `kind: user` сообщение из БД
- `src/preload/index.ts` — пробросить `agent.rate_limit` в renderer; добавить `messages.retryLast` и `messages.cancelRetry`
- `src/renderer/components/agents/RateLimitBanner.tsx` — новый компонент:
  - Текст: `"Rate limit exceeded. Retrying in N seconds..."`
  - Кнопка "Cancel"
  - Таймер обратного отсчёта
  - По истечении — вызов `window.api.messages.retryLast(agentId, userMessageId)`
  - По Cancel — вызов `window.api.messages.cancelRetry(agentId, userMessageId)`
- `src/renderer/components/agents.tsx` — подписка на `agent.rate_limit`, показ `RateLimitBanner`
- `src/renderer/hooks/useMessages.ts` — подписка на `agent.rate_limit` (или в `agents.tsx` напрямую)

**Модульные тесты:**
- `tests/unit/agents/MainPipeline.test.ts` — при HTTP 429 эмитит `agent.rate_limit`, не создаёт `kind: error`
- `tests/unit/agents/AgentIPCHandlers.test.ts` — `messages:retry-last` запускает pipeline, `messages:cancel-retry` удаляет сообщение
- `tests/unit/components/RateLimitBanner.test.tsx` — рендер, таймер, кнопка Cancel

#### 10.2 Функтест 6: rate limit баннер

**Тест:** `should show rate limit banner with countdown`

**Сценарий:**
1. MockLLMServer возвращает HTTP 429 с `retry-after: 3`
2. Пользователь отправляет сообщение
3. Появляется баннер с текстом `"Retrying in 3 seconds..."`
4. Через 3 секунды MockLLMServer переключается на успешный ответ
5. Баннер исчезает, появляется llm-ответ

**Проверки:**
- `[data-testid="rate-limit-banner"]` виден после первого запроса
- Содержит текст с числом секунд
- После таймаута баннер исчезает и появляется `[data-testid="message-llm"]`

**Требования:** llm-integration.3.7.1, llm-integration.3.7.2, llm-integration.3.7.3, llm-integration.3.7.5


---

## Сводный список функциональных тестов

### ✅ 1. `should show llm response after user message`
Отправить сообщение → появляется `[data-testid="message-llm"]` с непустым текстом ответа.
_(реальный OpenAI)_

### ✅ 2. `should show reasoning before answer`
Отправить сообщение → если reasoning присутствует, его DOM-позиция выше action.
_(реальный OpenAI)_

### ✅ 3. `should show error message on invalid api key`
Сохранить невалидный ключ → отправить сообщение → появляется `[data-testid="message-error"]` с текстом про invalid key.
_(реальный OpenAI)_

### ❌ 4. `should interrupt previous request when new message sent during streaming`
MockLLMServer с медленным стримингом → отправить первое сообщение → пока идёт стриминг отправить второе → в чате только один `message-llm` (ответ на второе).

### ❌ 5. `should not show interrupted llm message in chat`
Аналогично тесту 4, но проверяем что прерванный `kind: llm` (hidden=true) вообще не рендерится в DOM.

### ❌ 6. `should show provider error message on 500`
MockLLMServer возвращает HTTP 500 → появляется `[data-testid="message-error"]` с текстом про недоступность сервиса.

### ❌ 7. `should hide error bubble when user sends next message`
MockLLMServer: первый запрос 500, второй успешный → error bubble исчезает после второго сообщения, появляется `message-llm`.

### ❌ 8. `should send full conversation history to llm on second message`
Два сообщения подряд → в теле второго запроса к LLM (через `mockServer.getLastRequest()`) присутствуют оба предыдущих сообщения (user + assistant).

### ❌ 9. `should exclude error messages from llm history`
Первый запрос 500 → второй успешный → в теле второго запроса нет `[error]` сообщений.

### ❌ 10. `should show rate limit banner with countdown` _(заблокирован — требует реализации rate limit баннера)_
MockLLMServer возвращает HTTP 429 с `retry-after: 3` → появляется `[data-testid="rate-limit-banner"]` с обратным отсчётом → через 3 сек баннер исчезает и появляется `message-llm`.


---

## Актуальный статус (2026-02-22)

### Всё реализовано и написано

Все шаги 1–10 выполнены. Функциональные тесты в `tests/functional/llm-chat.spec.ts`:

| # | Тест | Статус |
|---|------|--------|
| 1 | `should show llm response after user message` | ✅ написан |
| 2 | `should show reasoning before answer` | ✅ написан |
| 3 | `should show error message on invalid api key` | ✅ написан |
| 4 | `should interrupt previous request when new message sent during streaming` | ✅ написан |
| 5 | `should not show interrupted llm message in chat` | ✅ написан |
| 6 | `should show provider error message on 500` | ✅ написан |
| 7 | `should hide error bubble when user sends next message` | ✅ написан |
| 8 | `should send full conversation history to llm on second message` | ✅ написан |
| 9 | `should exclude error messages from llm history` | ✅ написан |
| 10 | `should show rate limit banner with countdown and auto-retry` | ✅ написан |
| 11 | `should cancel rate limit retry and hide user message` | ✅ написан |
| 12 | `should show action_link in auth error bubble and navigate to settings on click` | ✅ написан |

### Что осталось

1. **Запустить функциональные тесты** (покажут окна) — нужно явное разрешение пользователя:
   ```bash
   npm run test:functional:single -- llm-chat.spec.ts
   ```

2. **Коммит** изменений из текущей ветки (`feature/llm-integration`):
   - `src/renderer/components/agents/MessageBubble.tsx` — `action_link` кнопка (llm-integration.3.4.1)
   - `src/renderer/components/agents.tsx` — проброс `onNavigate`
   - `src/renderer/App.tsx` — `onNavigate={navigateToScreen}` в `<Agents>`
   - `tests/unit/components/agents.test.tsx` — 2 теста для `action_link`
   - `tests/functional/llm-chat.spec.ts` — тест 12

3. **`npm run validate`** — проходит ✅ (ESLint автофикс применён, unit/property тесты зелёные)
