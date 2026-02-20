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
- Отображение `kind: llm` и `kind: final_answer` в UI

---

## Решения по открытым вопросам

1. **Модели:** `gpt-5-mini` с `reasoning_effort: "low"` для функциональных тестов (поддерживает reasoning, дешевле `gpt-5`), `gpt-5.2` с `reasoning_effort: "medium"` для реальной работы.
2. **Поле `kind`:** Добавить колонку `kind` в таблицу `messages`, убрать `kind` из `payload_json`. Миграция заполняет `kind` из существующих записей.
3. **Стриминг:** Эмитить `message.updated` на каждый чанк — в Electron IPC overhead минимален, архитектура проще, UI обновляется максимально плавно.
4. **Reasoning в UI:** Показывать как текст под основным ответом (раскрывающийся или просто текст).
5. **Structured output:** Только `text` и `final_answer` для MVP, но архитектура рассчитана на расширение.
6. **API ключ:** Берётся из `UserSettingsManager` (пользователь указывает в настройках). Для тестов — из `OPENAI_API_KEY` env переменной.
7. **Системный промпт:** Заглушка-placeholder, заменяется в будущем.
8. **Ошибки LLM:** Отдельное сообщение в чате с `kind: error`.

---

## Архитектура построения промпта

Ключевое архитектурное решение — `PromptBuilder` как расширяемая система сборки промпта.

### Концепция

```
PromptBuilder
├── SystemPromptSection       — базовый системный промпт агента
├── FeatureSection[]          — набор фич, каждая добавляет свой промпт + инструменты
│   ├── feature.systemPrompt  — дополнение к системному промпту
│   └── feature.tools[]       — инструменты этой фичи
└── HistorySection            — история сообщений
    ├── сейчас: вся история
    └── будущее: свежие + суммаризация старых
```

### Интерфейсы

```typescript
// Фича — самодостаточный модуль с промптом и инструментами
interface AgentFeature {
  name: string;
  getSystemPromptSection(): string;   // добавляется к системному промпту
  getTools(): LLMTool[];              // инструменты этой фичи
}

// Строитель промпта
class PromptBuilder {
  constructor(
    private systemPrompt: string,
    private features: AgentFeature[],
    private historyStrategy: HistoryStrategy
  ) {}

  build(messages: Message[]): { systemPrompt: string; history: ChatMessage[]; tools: LLMTool[] }
}

// Стратегия истории (расширяемая)
interface HistoryStrategy {
  select(messages: Message[]): Message[];  // сейчас: все; будущее: свежие + суммаризация
}
```

### Сейчас (MVP)

- `SystemPromptSection` — заглушка: `"You are a helpful AI assistant."`
- `features: []` — пустой список
- `HistoryStrategy` — `FullHistoryStrategy` (вся история)
- Инструменты: нет

### В будущем

- Добавить фичи: каждая регистрирует свой промпт и инструменты
- Заменить `FullHistoryStrategy` на `SummarizingHistoryStrategy`
- Системный промпт берётся из настроек агента

---

## Шаги реализации

### 1. Спека

**Файлы:**
- `.kiro/specs/llm-integration/requirements.md`
- `.kiro/specs/llm-integration/design.md`

---

### 2. Миграция БД — добавить поле `kind` в таблицу `messages`

**Файлы:**
- `src/main/db/schema.ts` — добавить колонку `kind TEXT NOT NULL DEFAULT 'user'`
- `src/main/MigrationRunner.ts` — новая миграция: заполнить `kind` из `payload_json`, убрать `kind` из payload
- `src/main/db/repositories/MessagesRepository.ts` — обновить запросы
- `src/preload/index.ts` — добавить `'error'` в `MessagePayloadAPI.kind`
- `src/shared/utils/agentStatus.ts` — добавить `kind: 'error'` в `computeAgentStatus`

---

### 3. Расширить `ILLMProvider` — добавить метод `chat()`

**Файлы:**
- `src/main/llm/ILLMProvider.ts` — добавить интерфейсы и метод `chat()`
- `src/main/llm/OpenAIProvider.ts` — реализовать `chat()` со стримингом reasoning и structured output
- `src/main/llm/LLMConfig.ts` — добавить модели для чата: `gpt-5-mini` с `reasoning_effort: "low"` (тесты), `gpt-5.2` с `reasoning_effort: "medium"` (прод)

**Structured output — подход:**

Все три провайдера поддерживают JSON structured output, но с разными API:
- OpenAI: `response_format: { type: "json_schema", ... }`
- Anthropic: нативный только в новых моделях, для старых — tool-calling workaround
- Google: `response_mime_type: "application/json"` + `response_schema`

Единого API нет. Решение: каждый провайдер реализует structured output своим способом внутри, а наружу выдаёт единый `LLMAction`.

**Стриминг + structured output:**

Стриминг и structured output несовместимы для контента — нельзя показывать частичный JSON. Поэтому:
- **Reasoning** — стримится по чанкам, показывается в реальном времени
- **Action (JSON)** — получается целиком в конце, показывается после завершения

```
[reasoning chunks] → UI обновляется в реальном времени
[structured JSON]  → получаем целиком, рендерим после
```

**JSON схема (MVP, расширяемая):**
```json
{ "action": { "type": "text", "content": "ответ модели" } }
```

В будущем `type` расширяется до `final_answer | code_exec | request_scope` без изменения архитектуры.

**Интерфейс:**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

interface ChatOptions {
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools?: LLMTool[];
}

// Только reasoning стримится — content приходит целиком в LLMAction
interface ChatChunk {
  type: 'reasoning';
  delta: string;
  done: boolean;
}

// Structured output. MVP: только "text". Расширяется без изменения архитектуры.
interface LLMAction {
  type: 'text';  // будущее: | 'final_answer' | 'code_exec' | 'request_scope'
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ILLMProvider {
  testConnection(apiKey: string): Promise<TestConnectionResult>;
  // Стримит reasoning через onChunk, возвращает финальный structured action
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
- `PromptBuilder` класс — собирает системный промпт, историю, инструменты
- Конвертация `Message[]` → `ChatMessage[]` (исключает reasoning из replay)

---

### 5. Создать `MainPipeline`

**Файл:** `src/main/agents/MainPipeline.ts`

**Ответственность:**
- Принимает `agentId` + `userMessageId`
- Использует `PromptBuilder` для сборки промпта
- Берёт API ключ из `UserSettingsManager` через `settings.loadAPIKey(provider)` и `settings.loadLLMProvider()` (уже есть в IPC)
- Вызывает `ILLMProvider.chat()` со стримингом
- При первом чанке: создаёт `kind: llm` сообщение через `MessageManager.create()`
- При каждом reasoning чанке: обновляет сообщение через `MessageManager.update()` → эмитит `message.updated` с полным `payloadJson` (не diff — renderer должен получить весь payload для обновления reasoning)
- При завершении: финальный `LLMAction` записывается в то же `kind: llm` сообщение
- При завершении: если `final_answer` — создаёт `kind: final_answer` сообщение
- При ошибке: создаёт `kind: error` сообщение
- Управление busy-состоянием per agent (Map<agentId, boolean>)

**Структура `kind: llm` payload (без `kind` поля — оно в колонке):**
```json
{
  "data": {
    "reply_to_message_id": 123,
    "model": "gpt-5.2",
    "reasoning": { "text": "...", "excluded_from_replay": true },
    "action": { "type": "text", "content": "..." },
    "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
  }
}
```

---

### 6. Подключить `MainPipeline` к `AgentIPCHandlers`

**Файл:** `src/main/agents/AgentIPCHandlers.ts`

- При `messages:create` с `kind: user` → запускать `MainPipeline.run(agentId, messageId)` асинхронно
- IPC возвращает результат сразу, pipeline работает в фоне

---

### 7. Обновить renderer

**Файлы:**
- `src/renderer/hooks/useMessages.ts` — обрабатывать `kind: llm`, `kind: final_answer`, `kind: error`
- `src/renderer/components/agents.tsx` — рендер сообщений:
  - `kind: llm` → пузырь слева, reasoning как текст под ответом
  - `kind: final_answer` → пузырь слева с markdown
  - `kind: error` → красный пузырь слева с текстом ошибки

---

### 8. Тесты

**Модульные:**
- `tests/unit/llm/OpenAIProvider.chat.test.ts` — мок fetch, проверка стриминга и reasoning
- `tests/unit/agents/MainPipeline.test.ts` — мок LLM провайдера, проверка цикла
- `tests/unit/agents/PromptBuilder.test.ts` — проверка сборки промпта

**Функциональные:**
- `tests/functional/llm-chat.spec.ts` — реальный OpenAI (через `OPENAI_API_KEY` из env), модель `gpt-5-mini`
- `env.example` — добавить `OPENAI_API_KEY=your-key-here`

---

## Порядок выполнения

1. Спека (шаг 1)
2. Миграция БД (шаг 2)
3. Расширение ILLMProvider + OpenAIProvider (шаг 3)
4. PromptBuilder (шаг 4)
5. MainPipeline (шаг 5)
6. Подключение к AgentIPCHandlers (шаг 6)
7. Обновление renderer (шаг 7)
8. Тесты (шаг 8)
9. Валидация: `npm run validate`
