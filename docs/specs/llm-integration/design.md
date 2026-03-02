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
  reply_to_message_id INTEGER,
  payload_json TEXT NOT NULL,
  usage_json TEXT
);
```

### Таблица `images`

```sql
CREATE TABLE images (
  agent_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  image_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  hash TEXT,
  content_type TEXT,
  size INTEGER,
  bytes BLOB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (agent_id, message_id, image_id)
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
    "images": [
      { "id": 1, "url": "https://example.com/a.png", "alt": "Diagram 1" }
    ]
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
- **Проверка формата:** после получения ответа LLM валидируем соответствие единому декларативному контракту (`safeParse`) и корректность плейсхолдеров.
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

ЕСЛИ Structured Output не соответствует контракту (например, отсутствует `action.content` или нарушен формат `images[]`/плейсхолдеров), система:
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
     - для `kind:llm` передаём текст ответа и, при наличии `images[]`, добавляем ссылки изображений в текстовый replay-блок, чтобы модель видела контекст ранее отправленных изображений.
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

#### Формат structured output

**Схема и форматы полей:**

- `action.type`: строка, значение `text`.
- `action.content`: строка; может содержать плейсхолдеры изображений.
- `images[]`: массив объектов изображений (может отсутствовать). Схема, форматы полей и плейсхолдеры описаны в разделе «Встроенные изображения».
- `usage` НЕ является частью model structured output; usage-envelope (`canonical + raw`) передаётся провайдером отдельно и сохраняется в `messages.usage_json`.

Модель возвращает JSON:

```json
{
  "action": { "type": "text", "content": "Text with [[image:1]]" },
  "images": [
    { "id": 1, "url": "https://example.com/a.png", "alt": "Diagram 1", "link": "https://example.com" }
  ]
}
```

#### Список изображений
В `images[]` модель возвращает список:

```json
{
  "action": { "type": "text", "content": "..." },
  "images": [
    { "id": 1, "url": "https://example.com/a.png", "alt": "Схема 1", "link": "https://example.com" },
    { "id": 2, "url": "https://example.com/b.png" }
  ]
}
```

## Встроенные изображения

### Требования к системному промпту

Системный промпт должен:
- использовать плейсхолдеры `[[image:<id>]]` в тексте;
- передавать список изображений в `images[]`;
- не вставлять обычные Markdown‑картинки `![alt](url)`.
- перечислить поддерживаемые форматы изображений (`png/jpeg/webp/gif/svg`).

### Форматы плейсхолдеров

- базовый формат: `[[image:<id>]]`;
- ссылка: `[[image:<id>|link:<url>]]`;
- размер: `[[image:<id>|size:<width>x<height>]]`;
- комбинация: `[[image:<id>|link:<url>|size:<width>x<height>]]`;
- `size` — `width` и `height` как положительные целые.

### Правила

- `id` должен совпадать с `[[image:<id>]]` в тексте и быть натуральным числом.
- `url` допустим только `http/https`.
- `alt` необязателен.
- `link` необязателен; при наличии изображение кликабельно.
- `alt` используется как `alt` для `<img>`.
- `size` является опциональным атрибутом плейсхолдера; при наличии используется для размеров заглушки.
- если `size` не указан, заглушка всё равно показывается — размер определяется автоматически (дефолтные значения).
- изображения без плейсхолдеров игнорируются для рендера, но всё равно скачиваются и сохраняются в БД.
- обработка плейсхолдеров выполняется в renderer: при первичном рендере ставится placeholder+loader, затем он заменяется при успешном получении изображения или удаляется при ошибке/таймауте.
- если изображение присутствует в тексте, но отсутствует в `images[]`, `MainPipeline` помечает запись как ошибочную; renderer получает `status=error` и снимает placeholder/loader.

### Основные компоненты
- **`ImageStorageManager`** (`src/main/media/ImageStorageManager.ts`)
  - **Назначение:** единственная точка работы с бинарными данными и БД изображений.
  - **Поведение:**
    - `downloadAndStore(agentId, messageId, imageId, url)`:
      - если записи нет — создаёт её со `status=pending`;
      - валидирует URL (только http/https);
      - скачивает данные (лимит 50GB);
      - таймаут загрузки: 60 секунд (по таймауту → `status=error`);
      - проверяет content‑type (разрешённые форматы);
      - считает SHA‑256 hash;
      - сохраняет bytes+метаданные в `images` для `(agentId, messageId, imageId)` и ставит `status=success`;
      - при ошибке/таймауте обновляет запись → `status=error`.
    - `markMissingDescriptor(agentId, messageId, imageId)`:
      - создаёт (или обновляет) запись в `images` со `status=error`, если плейсхолдер есть, а `images[]` не содержит `id`.
  - `images:get(agentId, messageId, imageId)` (IPC):
    - читает `images` по `(agentId, messageId, imageId)`;
    - если записи нет — `{ found: false, status: 'error' }` (нештатная ситуация, запись должна создаваться `ImageStorageManager` при `downloadAndStore`/`markMissingDescriptor`);
    - если `status = pending` — `{ found: true, status: 'pending' }`;
    - если `status = error` — `{ found: true, status: 'error' }`;
    - если `status = success` — возвращает `{ found: true, status: 'success', bytes, contentType, size }`.
  - **Ответственность:** хранение, валидация, безопасность.
  - **Ошибки:** не показываются пользователю, только логируются.
- **`MainPipeline`**
  - **Назначение:** оркестратор ответа LLM и запуск фоновой загрузки изображений.
  - **Поведение:**
    - получает Structured Output;
    - валидирует формат и делает retry при ошибке;
    - сохраняет `kind: llm` с полным Structured Output;
    - извлекает плейсхолдеры из `action.content`;
    - сопоставляет их с `images[]`;
    - запускает `ImageStorageManager.downloadAndStore` для каждого изображения.
  - для плейсхолдеров без `images[]` вызывает `ImageStorageManager.markMissingDescriptor`.
  - **Ответственность:** запись сообщения и запуск загрузок (без управления статусами).
- **`MessageImageResolver`** (`src/renderer/lib/MessageImageResolver.ts`)
  - **Назначение:** визуальная подстановка изображений в UI.
  - **Поведение:**
    - находит плейсхолдеры;
    - вставляет заглушки нужного размера;
    - вызывает `images:get(agentId, messageId, imageId)`:
      - первые 10 секунд — раз в 0.5 секунды;
      - следующие 10 секунд — раз в 1 секунду;
      - затем — раз в 5 секунд;
    - при `status=success` создаёт `blob:` URL и заменяет заглушку;
    - при `status=error` или ошибке IPC снимает заглушку сразу;
    - по таймауту 60 секунд удаляет заглушку.
  - при обновлении сообщения рендерит заново (полный re-render, как обычно).
  - **Ответственность:** отображение, polling, замена заглушек.
- **`AgentMessage`**
  - **Назначение:** интеграция рендеринга сообщения и `MessageImageResolver`.
  - **Поведение:** передаёт `action.content`, запускает резолвер после первичного рендера.
  - **Ответственность:** связка между данными сообщения и UI‑подстановкой изображений.

### Polling стратегия

- 0–10s: каждые 0.5s
- 10–20s: каждые 1s
- 20–60s: каждые 5s
- Таймаут: 60s

### Поток рендера (после первичного Markdown)

1. `MessageResponse` рендерит Markdown.
2. Рендерер находит плейсхолдеры `[[image:<id>]]` в DOM и заменяет их на заглушки.
3. По `id` сразу обращается к `images:get(agentId, messageId, imageId)` и получает текущее состояние изображения.
4. Renderer опрашивает `images:get(agentId, messageId, imageId)` только для изображений, у которых на шаге 3 получен `status=pending`:
   - первые 10 секунд — раз в 0.5 секунды;
   - следующие 10 секунд — раз в 1 секунду;
   - затем — раз в 5 секунд.
5. Пока ожидание идёт (`status=pending`) — рендерится заглушка нужного размера с лоадером.
6. При `status=success` получает bytes + contentType → подмена заглушки на `<img>` (alt из `images[]`) или `<a><img></a>` если `link` указан в плейсхолдере.
7. При `status=error` или ошибке IPC — снимает заглушку/placeholder сразу.
8. По таймауту 60 секунд — удаляет заглушку/placeholder.

### Полный pipeline обработки сообщения (события и реакции)

#### 1. Main process: получение ответа LLM
1) `MainPipeline` получает Structured Output от провайдера.
2) Валидирует формат (`action.content`, `images[]`, плейсхолдеры).
3) При ошибке формата — делает retry с системным сообщением.
4) Сохраняет `kind: llm` сообщение в БД (payload целиком).
5) Запускает фоновую загрузку изображений внутри `MainPipeline`.
6) Эмитит `message.created`/`message.updated` как обычно (отдельных событий для изображений нет).

#### 2. Main process: загрузка изображений
1) `MainPipeline` извлекает плейсхолдеры из `action.content`.
2) Сопоставляет плейсхолдеры с `images[]`.
3) Для каждого изображения запускает загрузку через `ImageStorageManager`.
4) `ImageStorageManager` сам создаёт запись `images` со `status=pending`, затем по результату загрузки обновляет запись:
   - успех → `status=success` + `hash/bytes/content_type/size`;
   - ошибка/таймаут → `status=error`.
5) Если `imageId` нет в `images[]`:
   - `MainPipeline` вызывает `ImageStorageManager.markMissingDescriptor(...)`.

#### 3. Renderer: первичный рендер
1) Получает `message.created`/`message.updated`.
2) `AgentMessage` рендерит `MessageResponse`.
3) `MessageImageResolver` ищет плейсхолдеры, заменяет их на заглушки.
4) Для каждого `imageId`:
   - polling: первые 10 секунд — раз в 0.5 секунды, следующие 10 секунд — раз в 1 секунду, затем — раз в 5 секунд, до готовности или таймаута 60 секунд.

#### 4. Renderer: обработка ожидания (polling)
1) Вызывает IPC `images:get(agentId, messageId, imageId)` (интервалы: 0.5с → 1с → 5с) и получает:
   - `status: 'pending'` → продолжает ждать (loader остаётся);
   - `status: 'error'` → снимает заглушку/placeholder сразу (для "нет записи" это нештатно, можно игнорировать без UI-ошибки);
   - `status: 'success'` + bytes → подменяет заглушку на `<img>`.
2) Таймаут ожидания 60 секунд → удаляет заглушку/лоадер.
3) Ошибка IPC/исключение → снимает заглушку/лоадер сразу (без UI-ошибки).

#### 5. Гонки и порядок событий
- Гонки решаются polling‑механизмом: renderer опрашивает main до готовности или таймаута.

### Крайние случаи

- Плейсхолдер есть, `images[]` не содержит `id`:
  - main создаёт запись в `images` со `status=error`;
  - `images:get` возвращает `status: error`, renderer снимает заглушку/лоадер сразу.
- Изображение есть, плейсхолдера нет → игнорировать для рендера, но скачивать и сохранять в БД.
- URL недоступен / ошибка сети → снять placeholder/loader (без UI‑ошибки) и записать в лог.
- content‑type не `image/*` → снять placeholder/loader (без UI‑ошибки) и записать в лог.
- размер > лимита → снять placeholder/loader (без UI‑ошибки) и записать в лог.
- повторные плейсхолдеры одного `id` → повторно опрашивать `images:get` без отдельного кэша.
- `link` невалидный/не http(s) → игнорировать ссылку, оставить `<img>`.
- неверный `size` (не `<width>x<height>`) → игнорировать размер.
- `size` отсутствует → использовать дефолтный размер заглушки.
- **Гонки событий:** решаются polling‑механизмом; pending‑кэш не используется.

### Дополнительные параметры (выбраны по умолчанию)

- **Дефолтный размер заглушки:** `320x180` (16:9).
- **Стиль лоадера:** неброский серый скелетон + лёгкая пульсация (`bg-muted/40`, `animate-pulse`, скругление `rounded-md`).
- **Лимиты загрузки:**
  - max size: `50GB`
  - content types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`
- **SVG:** санитизировать перед рендером.
- **Формат IPC (обслуживает `ImageStorageManager`):**
  - `images:get(agentId, messageId, imageId)` → `{ found: boolean, status: 'pending'|'error'|'success', bytes?, contentType?, size? }`
- **Polling:** первые 10 секунд — 0.5с, следующие 10 секунд — 1с, далее — 5с, максимум 60 секунд.

### Исключение hidden из истории

- **Правило:** сообщения с флагом `hidden` не включаются в историю промпта.
- **Централизация:** фильтрация выполняется в `MessageManager.listForModelHistory()`.
- **Проверка:** покрывается модульным и функциональным тестами, где скрытые сообщения не попадают в историю второго запроса.

### Тестирование

#### Unit tests
- парсер плейсхолдеров и замена в DOM/HTML.
- `ImageStorageManager` (ограничения размера, фильтр типов).
- обработка отсутствующего id/URL.

#### Functional tests
- История передаётся как отдельные сообщения и исключает служебные поля.
- Structured Output описан в системном промпте и используется моделью.
- Invalid structured output → retry, затем ошибка с `Retry`.
- LLM ответ с `[[image:1]]` и `images[]` → `<img>` появляется после загрузки.
- Ошибка: неизвестный id → снять placeholder/loader (без UI‑ошибки) и записать в лог.
- Повторная перерисовка не вызывает повторной загрузки.
- Кликабельная картинка: `[[image:1|link:https://...]]` → `<a>` вокруг `<img>`.
- Асинхронность: рендер без картинки → после `status=success` картинка вставляется.
- Заглушка: размер из `size` используется до загрузки, затем заменяется на изображение.

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

interface LLMImageDescriptor {
  id: number;
  url: string;
  alt?: string;
  link?: string;
}

interface LLMStructuredOutput {
  action: LLMAction;
  images?: LLMImageDescriptor[];
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
You are a helpful AI assistant. You may respond in Markdown when it improves clarity. Supported Markdown (GFM): headings, paragraphs, bold/italic/strikethrough, links/autolinks, blockquotes, ordered/unordered lists and task lists, tables, horizontal rules, inline code, fenced code blocks with language tags (syntax highlighting), Mermaid diagrams (```mermaid```), and math via KaTeX (inline $...$ or block $$...$$). Do not use footnotes.
```

**Формат входных сообщений (пример):**

```json
[
  { "role": "system", "content": "System instruction..." },
  { "role": "user", "content": "Hello" },
  { "role": "assistant", "content": "Hi! Here is an image [[image:1]].\nImages: id=1 url=https://example.com/a.png" }
]
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
      создаёт `kind: llm` сообщение → `llmMessageId = message.id`
     accumulatedReasoning += chunk.delta
     обновляет `kind: llm` (`reasoning.text = accumulatedReasoning`)
     эмитит `message.llm.reasoning.updated { delta, accumulatedText }`
     эмитит `message.updated`
7. Получает финальный Structured Output
8. Обновляет `kind: llm` (action + usage)
9. Эмитит финальный `message.updated`
```

**Обработка ошибок:**

```
catch(error):
  if llmMessageId != null:
    обновляет `kind: llm` с `hidden: true`
    эмитит `message.updated`
  создаёт `kind: error` (messages.reply_to_message_id = userMessageId, payload.error.message)
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
- Если `kind: llm` уже создан — помечаем `hidden: true`, выходим без создания `kind: error`

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
              → MessageManager.create/update(kind: 'llm')
              → message.llm.reasoning.updated
              → message.updated
          → [LLMAction received]
              → MessageManager.update(kind: 'llm', action)
              → message.updated
      → [on error]
          → MessageManager.update(kind: 'llm', hidden: true) [если уже создан]
          → MessageManager.create(kind: 'error')
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
- `tests/unit/utils/imagePlaceholders.test.ts` — парсер плейсхолдеров
- `tests/unit/media/ImageStorageManager.test.ts` — загрузка/ошибки/IPC

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
- `tests/functional/llm-chat.spec.ts` — "LLM ответ с `[[image:1]]` и `images[]` → `<img>` появляется после загрузки"
- `tests/functional/llm-chat.spec.ts` — "Ошибка: неизвестный id → снять placeholder/loader (без UI‑ошибки) и записать в лог"
- `tests/functional/llm-chat.spec.ts` — "Повторная перерисовка не вызывает повторной загрузки"
- `tests/functional/llm-chat.spec.ts` — "Кликабельная картинка: `[[image:1|link:https://...]]` → `<a>` вокруг `<img>`"
- `tests/functional/llm-chat.spec.ts` — "Асинхронность: рендер без картинки → после `status=success` картинка вставляется"
- `tests/functional/llm-chat.spec.ts` — "Заглушка: размер из `size` используется до загрузки, затем заменяется на изображение"

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
| llm-integration.9 | ✓ | ✓ |
| llm-integration.10 | - | - |
| llm-integration.11 | - | - |
| llm-integration.12 | - | - |
| llm-integration.13 | ✓ | - |
