# Документ Требований: LLM Integration

## Фокус Документа

Этот документ фиксирует только требования к runtime-интеграции с LLM:
- orchestration single-tool шага на один ответ модели (`max 1 tool_call per model response`) в `MainPipeline`;
- streaming reasoning/text, обработку ошибок и retry-поведение;
- persisted/runtime контракты сообщений (`kind`, `done`, `tool_call`, `usage_json`) и их согласованность в chat-flow;
- канонический реестр tool names для LLM tool-loop (`final_answer`, `code_exec`).

Документ НЕ определяет:
- UI/рендеринг сообщений и визуальные состояния чата (см. `docs/specs/agents/*`);
- общий transport/event-bus контракт вне LLM-специфичных требований (см. `docs/specs/realtime-events/*`);
- sandbox/policy/API контракты исполнения `code_exec` (см. `docs/specs/code_exec/*`).

## Введение

Данный документ описывает требования к интеграции LLM в приложение Clerkly. Функциональность обеспечивает полный цикл взаимодействия пользователя с AI-агентом: отправка сообщения → вызов LLM → стриминг reasoning и текста ответа → (опционально) вызовы инструментов → сохранение событий и сообщений в целевом runtime-контракте.
Целевой runtime-слой оркестрации LLM-цикла — `Vercel AI SDK` для всех поддерживаемых провайдеров.
Документ `llm-integration` фиксирует только логику взаимодействия с LLM (pipeline, провайдеры, stream/tool-loop, ошибки и контракты данных) и НЕ описывает интерфейс/визуальное представление.

## Глоссарий

- **MainPipeline** — оркестратор LLM-цикла в main process
- **PromptBuilder** — компонент сборки промпта (системный промпт + история как последовательность сообщений + инструменты)
- **LLMProvider** — провайдер LLM (OpenAI, Anthropic, Google)
- **Vercel AI SDK** — единый SDK-слой (`ai` + провайдерные пакеты), через который выполняются streaming и tool-loop
- **Reasoning** — внутренние "размышления" модели (стримятся в реальном времени)
- **Assistant text** — пользовательский текстовый ответ модели (стримится инкрементально)
- **Tool call** — запрос модели на вызов инструмента и получение результата
- **code_exec** — инструмент выполнения JavaScript-кода в sandbox; в истории хранится как `kind: tool_call` с `toolName = "code_exec"`
- **kind** — тип сообщения: `user | llm | error | tool_call`
- **done** — флаг завершённости сообщения в БД (`false` пока сообщение ещё формируется/стримится, `true` после полного получения)
- **reply_to_message_id** — ссылка на сообщение, на которое даётся ответ (колонка `messages.reply_to_message_id`, null только у первого)
- **usage_json** — отдельное JSON-поле в `messages` для хранения токен-метрик провайдера в формате `canonical + raw`

## Требования

### 1. LLM-цикл (MainPipeline)

**ID:** llm-integration.1

**User Story:** Как пользователь, я хочу чтобы после отправки сообщения агент автоматически обращался к LLM и показывал ответ в чате.

#### Критерии Приемки

1.1. КОГДА пользователь отправляет сообщение (`kind: user`), ТО `MainPipeline` ДОЛЖЕН запускаться асинхронно в фоне — IPC возвращает результат немедленно

1.2. `MainPipeline` ДОЛЖЕН быть stateless — всё состояние выполнения хранится в локальных переменных `run()`, что обеспечивает параллельное выполнение для разных агентов

1.3. `MainPipeline` ДОЛЖЕН получать API ключ из `UserSettingsManager` через `loadAPIKey(provider)`

1.4. `MainPipeline` ДОЛЖЕН использовать `PromptBuilder` для сборки промпта перед вызовом LLM

1.5. `MainPipeline` ДОЛЖЕН создавать `kind: llm` сообщение при получении первого meaningful чанка (reasoning или text) либо при завершении генерации, если стриминг не пришёл

1.6. `MainPipeline` ДОЛЖЕН обновлять persisted `kind: llm` сообщение батчами в активном стриминге и при завершении текущего ответа модели

1.6.1. `kind: llm` сообщение ДОЛЖНО создаваться/обновляться с `done = false`, пока текущий ответ модели не завершён

1.6.2. После завершения текущего ответа модели `kind: llm` сообщение ДОЛЖНО иметь `done = true`

1.6.3. `kind: llm` ДОЛЖЕН оставаться каноничным сообщением для streaming reasoning/text; отдельное завершение задачи фиксируется `kind: tool_call` с `toolName = "final_answer"` и `done = true`.

1.6.4. КОГДА идёт активный стриминг `reasoning/text`, ТО промежуточные persisted-обновления `kind: llm` ДОЛЖНЫ выполняться не чаще одного раза в 100ms; при этом система ДОЛЖНА выполнять принудительный flush накопленного буфера до обработки boundary-событий (`tool_call`, `tool_result`, `done`, `error`, `abort`).

1.7. `MainPipeline` ДОЛЖЕН проставлять `messages.reply_to_message_id` для каждого создаваемого сообщения:
  - Для первого сообщения в чате агента — `null`
  - Для сообщений, создаваемых в рамках `MainPipeline.run(agentId, userMessageId)`, — `reply_to_message_id = userMessageId`

1.8. `MainPipeline` ДОЛЖЕН реализовывать вызов модели и tool-loop через `Vercel AI SDK` для всех поддерживаемых провайдеров (`OpenAI`, `Anthropic`, `Google`)

---

### 2. Стриминг и события

**ID:** llm-integration.2

**User Story:** Как пользователь, я хочу видеть reasoning модели в реальном времени, пока она "думает".

#### Критерии Приемки

2.1. КОГДА приходит reasoning чанк, ТО система ДОЛЖНА эмитить realtime-событие обновления reasoning для соответствующего `kind: llm` сообщения

2.1.1. КОГДА reasoning чанк создаёт первое `kind: llm` сообщение (сообщение ещё не существовало), ТО дополнительно ДОЛЖНО эмититься `message.created` с полным snapshot нового сообщения

2.1.2. КОГДА reasoning чанк обновляет уже существующее `kind: llm` сообщение, ТО дополнительно ДОЛЖНО эмититься batched `message.updated` с полным snapshot обновлённого сообщения

2.1.3. Точный технический контракт realtime-события reasoning (имя события и payload) ДОЛЖЕН определяться в `design.md` и быть согласован с `realtime-events` спецификацией

2.2. `message.created` ДОЛЖЕН эмититься при создании любого нового сообщения (user, llm, error, tool_call)

2.3. `message.updated` ДОЛЖЕН эмититься при любом обновлении сообщения (промежуточном и финальном)

2.3.1. Для активного стриминга `kind: llm` промежуточные `message.updated` ДОЛЖНЫ эмититься не чаще одного раза в 100ms; финальные/граничные snapshot-обновления (`tool_call`, `tool_result`, `done`, `error`, `abort`) ДОЛЖНЫ эмититься немедленно после flush буфера.

2.4. Событие `message.llm.reasoning.updated` ДОЛЖНО передавать инкрементальные delta-обновления reasoning.

2.4.1. Во время активного стриминга система ДОЛЖНА передавать `message.llm.reasoning.updated` батчами не чаще одного раза в 100ms (с объединением накопленных delta), за исключением принудительного flush на boundary-событиях.

2.5. Событие `message.llm.text.updated` ДОЛЖНО передавать инкрементальные delta-обновления текста ответа.

2.5.1. Во время активного стриминга система ДОЛЖНА передавать `message.llm.text.updated` батчами не чаще одного раза в 100ms (с объединением накопленных delta), за исключением принудительного flush на boundary-событиях.

2.6. Обработка `tool_call` в chat-flow ДОЛЖНА опираться на persisted сообщения `kind: tool_call` через `message.created`/`message.updated`.

2.6.1. КОГДА `kind: tool_call` имеет `toolName = "final_answer"`, ТО обработка завершения turn ДОЛЖНА соответствовать контракту `agents.7.4`.

2.7. Событие `message.updated` ДОЛЖНО оставаться snapshot-событием целостного persisted-состояния сообщения.

2.8. Поток realtime-событий ДОЛЖЕН быть совместим с единым stream-контрактом (`UIMessage stream protocol`) для `reasoning`, `text` и завершения ответа.

---

### 3. Обработка ошибок

**ID:** llm-integration.3

**User Story:** Как пользователь, я хочу видеть понятное сообщение об ошибке если LLM недоступен или вернул ошибку.

#### Критерии Приемки

3.1. ЕСЛИ ошибка произошла до получения первого чанка (сеть, неверный ключ, таймаут), ТО ДОЛЖНО создаться только `kind: error` сообщение

3.1.1. Любое созданное `kind: error` сообщение ДОЛЖНО иметь `done = true`

3.2. ЕСЛИ ошибка произошла после начала стриминга, ТО:
  - Существующий `kind: llm` ДОЛЖЕН быть скрыт через флаг `hidden: true`
  - Существующий `kind: llm` ДОЛЖЕН быть помечен `done = false`
  - ДОЛЖНО создаться `kind: error` сообщение следом

3.3. `kind: error` сообщение ДОЛЖНО содержать текст ошибки в `data.error.message` и тип ошибки в `data.error.type`

3.4. Сообщения `kind:error` ДОЛЖНЫ формироваться в стандартизированном контракте с типом и текстом ошибки, а также с опциональными действиями.

3.4.1. Контракт `kind:error` ДОЛЖЕН иметь единый формат (`data.error.type`, `data.error.message`, опционально `data.error.action_link`), при этом текст сообщения зависит от причины ошибки.

3.4.2. Для ошибок LLM ДОЛЖНЫ использоваться разные пользовательские сообщения для:
  - отсутствия API ключа
  - ошибок авторизации (HTTP 401/403)

3.4.3. ЕСЛИ ошибка относится к отсутствию API ключа ИЛИ к ошибке авторизации (HTTP 401/403), ТО `kind:error` ДОЛЖЕН содержать действия "Open Settings" и "Retry" для повтора последнего `kind:user` сообщения в БД.

3.4.4. КОГДА выполняется действие "Retry", ТО запрос ДОЛЖЕН повторяться на основе последнего `kind:user` сообщения этого агента.

3.5. Типы ошибок и их сообщения:
  - **Нет API ключа**: `"API key is not set. Add it in Settings to continue."` + действие "Open Settings"
  - **Неверный ключ** (HTTP 401/403): `"Invalid API key. Please check your key and try again."` + действие "Open Settings"
  - **Нет сети**: `"Network error. Please check your internet connection."`
  - **Rate limit** (HTTP 429): `"Rate limit exceeded. Please try again later."` — см. требование 3.7
  - **Внутренняя ошибка провайдера** (HTTP 5xx): `"Provider service unavailable. Please try again later."`
  - **Таймаут ожидания ответа**: `"Model response timeout. The provider took too long to respond. Please try again later."`
  - **Ошибка инструмента** (`tool`): `"Tool execution failed. Please try again later."`
  - **Ошибка stream protocol** (`protocol`): `"Response stream error. Please try again later."`

3.6. КАЖДЫЙ отдельный запрос к LLM API (от отправки до получения полного ответа модели) ДОЛЖЕН быть ограничен таймаутом 2 минуты. ЕСЛИ модель не завершила ответ за это время, ТО запрос прерывается с ошибкой таймаута

3.6.1. КОГДА в рамках одного pipeline-цикла выполняется несколько последовательных запросов к LLM API (например: запрос → tool call → повторный запрос), ТО таймаут применяется к **каждому запросу отдельно**. Время выполнения инструментов НЕ ДОЛЖНО учитываться в таймауте — ни между запросами (между step-ами), ни внутри одного step-а (когда AI SDK исполняет tool executor в рамках текущего step)

3.6.2. Таймаут защищает от зависания LLM API (модель не отвечает или не завершает ответ). У инструментов (code_exec, web_search) собственные таймауты

3.7. **Rate limit (HTTP 429) — стандартизированный flow с обратным отсчётом:**

3.7.1. ВМЕСТО создания обычного `kind:error` при 429 система ДОЛЖНА запускать transient rate-limit flow с обратным отсчётом до автоматического повтора запроса.

3.7.2. Rate-limit flow ДОЛЖЕН содержать:
    - сообщение `"Rate limit exceeded. Retrying in N seconds..."`
    - действие "Cancel" для отмены повтора.

3.7.3. КОГДА отсчёт достигает нуля, ТО система ДОЛЖНА автоматически повторить последний запрос на основе последнего `kind:user` сообщения в БД через IPC-команду повтора (`messages:retry-last`), которая запускает `MainPipeline.run(...)`

3.7.3.1. Countdown для 429 ДОЛЖЕН быть transient runtime-состоянием и НЕ ДОЛЖЕН создавать отдельную запись `kind:error` в `messages`.

  3.7.4. ЕСЛИ пользователь нажимает "Cancel" во время отсчёта, ТО:
    - Повтор отменяется
    - Исходное `kind: user` сообщение ДОЛЖНО быть удалено из БД
    - transient rate-limit flow ДОЛЖЕН завершаться

3.7.5. КОГДА повторный запрос завершается успешно, ТО transient rate-limit flow ДОЛЖЕН завершаться, а ответ ДОЛЖЕН сохраняться как обычный `kind: llm`.

  3.7.6. Время ожидания перед повтором определяется следующим образом (в порядке приоритета):
    1. Заголовок `retry-after` в HTTP-ответе (число секунд) — поддерживается Anthropic
    2. Парсинг времени из текста ошибки в теле ответа (например, `"Please try again in 10.384s"`) — OpenAI включает это в message
    3. Дефолт: 10 секунд — если ни заголовок, ни текст не содержат времени

3.8. `kind:error` сообщение ДОЛЖНО скрываться (`hidden: true`) КОГДА пользователь отправляет следующее сообщение в том же чате:
  - При создании нового `kind: user` сообщения все видимые `kind: error` сообщения этого агента ДОЛЖНЫ быть помечены флагом `hidden: true`
  - Сообщения с `hidden: true` НЕ ДОЛЖНЫ считаться активной частью чата в runtime-потоке
  - Сообщения с `hidden: true` остаются в БД (не удаляются) — для отладки и аудита
  - Это поведение симметрично скрытию `kind: llm` через `hidden: true`

3.9. `kind: error` сообщения НЕ ДОЛЖНЫ включаться в историю при сборке промпта для LLM:
  - `MessageManager.listForModelHistory()` ДОЛЖЕН фильтровать сообщения с `kind: error` при подготовке истории для `PromptBuilder`
  - Это гарантирует что LLM не видит технические ошибки как часть диалога

3.10. Ошибки провайдеров и стриминга ДОЛЖНЫ нормализоваться в единый доменный формат на базе классов ошибок `Vercel AI SDK`:
  - `APICallError` с `401/403` → `auth`
  - `APICallError` с `429` → `rate_limit`
  - `APICallError` с `5xx` → `provider`
  - timeout/abort → `timeout`
  - transport-level ошибки без `statusCode` → `network`
  - ошибки tool execution (`NoSuchToolError`, `InvalidToolInputError`, `ToolExecutionError`, `ToolCallRepairError`) → `tool`
  - ошибки stream protocol (`UIMessageStreamError`) → `protocol`
  - ошибки валидации replay prompt (например, `Invalid prompt: ... ModelMessage[] schema`) → `protocol`

3.11. КОГДА исходная ошибка содержит HTTP-статус код, ТО `kind:error` payload ДОЛЖЕН включать его в `data.error.statusCode` как опциональное числовое поле для диагностики. Пользовательское сообщение (`data.error.message`) НЕ ДОЛЖНО изменяться.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should show rate limit banner with countdown and auto-retry"
- `tests/functional/llm-chat.spec.ts` — "should show provider error message on 500"

---

### 4. Построение промпта (PromptBuilder)

**ID:** llm-integration.4

**User Story:** Как разработчик, я хочу расширяемую систему сборки промпта для добавления новых фич без изменения архитектуры.

#### Критерии Приемки

4.1. `PromptBuilder` ДОЛЖЕН принимать системный промпт, список `AgentFeature` и `HistoryStrategy`

4.2. `PromptBuilder` ДОЛЖЕН формировать вход для модели как последовательность отдельных сообщений (`system` + сообщения истории), без объединения истории в единый агрегированный блок.

4.3. `PromptBuilder` ДОЛЖЕН использовать выбранную стратегию истории (`HistoryStrategy`) при отборе сообщений для передачи в модель.

4.4. Служебные поля и правила санитизации истории ДОЛЖНЫ соответствовать требованиям `llm-integration.10.*`.

4.5. Системный промпт ДОЛЖЕН содержать краткое описание допустимой Markdown-разметки (GFM)
     (заголовки, параграфы, жирный/курсив/зачеркнутый, ссылки/автоссылки, цитаты,
     списки (упорядоченные/маркированные) включая task lists, таблицы,
     горизонтальные разделители, inline код, fenced-блоки с языком
     (подсветка синтаксиса), диаграммы Mermaid, математика через KaTeX
     (inline $...$ и block $$...$$)). Сноски использовать нельзя.

4.5.1. Инструкция для модели в системном промпте ДОЛЖНА явно требовать для математики только делимитеры `$...$` и `$$...$$`; делимитеры `\(...\)` и `\[...\]`, а также экранированные формы `\$...\$` / `\$\$...\$\$` ДОЛЖНЫ быть запрещены.

4.6. Базовая стратегия истории ДОЛЖНА быть полной (`FullHistoryStrategy`); список `AgentFeature` МОЖЕТ быть пустым или содержать feature-модули (включая инструменты), в зависимости от конфигурации агента

4.7. КОГДА пользователь отправляет сообщение, ТО модель ДОЛЖНА формировать и reasoning, и текст ответа на языке пользователя (по языку последнего `kind:user` сообщения в текущем запросе).

---

### 5. LLM Provider Interface

**ID:** llm-integration.5

**User Story:** Как разработчик, я хочу единый интерфейс для всех LLM провайдеров.

#### Критерии Приемки

5.1. Внутренний слой адаптера провайдера (`ILLMProvider` или эквивалент) ДОЛЖЕН иметь метод `chat(messages, options, onChunk, signal?)` с event-driven стримингом чанков (`reasoning`, `text`, `tool_call`, `turn_error`) и успешным завершением текущего ответа модели через завершение `chat(...)` без ошибки; переданный `signal` ДОЛЖЕН использоваться для штатной отмены активного turn без формирования `kind:error`

5.2. `apiKey` ДОЛЖЕН передаваться в конструктор провайдера (не в каждый вызов)

5.2.1. `MainPipeline` ДОЛЖЕН создавать новый экземпляр провайдера при каждом вызове `run()`, читая актуальные настройки из `UserSettingsManager` — это гарантирует, что изменение провайдера или ключа в настройках вступает в силу при следующем запросе

5.3. Reasoning ДОЛЖЕН стримиться через `onChunk` инкрементальными delta-чанками

5.4. Текст ответа ДОЛЖЕН стримиться через `onChunk` инкрементально (`text delta`), без ожидания только финального агрегированного блока

5.5. Провайдер ДОЛЖЕН поддерживать tool-calling в рамках одного turn с ограничением `max 1 tool_call` на один ответ модели: в chat-flow передаются полностью собранные данные валидного tool call для persisted сообщения `kind: tool_call`

5.6. Ответ провайдера ДОЛЖЕН включать usage-envelope в формате:
  - `canonical`: `input_tokens`, `output_tokens`, `total_tokens`, `cached_tokens?`, `reasoning_tokens?`
  - `raw`: исходный usage-пейлоад провайдера для аудита и последующей проверки биллинга

5.7. `OpenAIProvider` ДОЛЖЕН использовать OpenAI **Responses API** для генерации ответа модели и обработки tool-calling

5.7.1. Structured Output в виде обязательного `json_schema` НЕ ДОЛЖЕН быть единственным допустимым форматом chat-flow

5.8. Для тестов используется модель `gpt-5-nano` с `reasoning_effort: "low"`, для прода — `gpt-5.2` с `reasoning_effort: "medium"`

5.9. Провайдерные реализации (`OpenAIProvider`, `AnthropicProvider`, `GoogleProvider`) ДОЛЖНЫ быть построены поверх `Vercel AI SDK` и поддерживать единый streaming/tool-loop контракт `ILLMProvider`

---

### 6. Схема БД — колонки `kind` и `done`

**ID:** llm-integration.6

**User Story:** Как разработчик, я хочу хранить тип сообщения в отдельной колонке для эффективных запросов.

#### Критерии Приемки

6.1. Таблица `messages` ДОЛЖНА иметь колонку `kind TEXT NOT NULL` (без дефолта)

6.2. `kind` ДОЛЖЕН быть убран из `payload_json` — всегда передаётся явно при вставке

6.3. В целевой модели `kind` ДОЛЖЕН храниться в отдельной колонке `messages.kind`; поле `kind` НЕ ДОЛЖНО храниться внутри `payload_json`

6.4. `MessagesRepository.create()` ДОЛЖЕН принимать `kind` как обязательный параметр

6.5. Система ДОЛЖНА хранить для каждого сообщения явный флаг завершённости `done`:
  - `done = false` — сообщение ещё формируется (например, streaming `kind: llm`)
  - `done = true` — сообщение полностью получено

6.6. Сообщения `kind: llm`, у которых в payload присутствует финальный ответ (`data.text`), ДОЛЖНЫ иметь `done = true`

6.6.1. Финальный текст ответа в chat-flow ДОЛЖЕН храниться в `payload.data.text`.

6.7. Таблица `messages` ДОЛЖНА иметь отдельные колонки порядка model-run:
  - `run_id TEXT`
  - `attempt_id INTEGER`
  - `sequence INTEGER`

6.8. Данные порядка model-run (`run_id`, `attempt_id`, `sequence`) ДОЛЖНЫ храниться в одноимённых колонках таблицы `messages`.

6.9. КОГДА сообщение относится к model-run шагу (`kind: llm` или `kind: tool_call`), ТО `run_id`, `attempt_id`, `sequence` ДОЛЖНЫ сохраняться в соответствующих колонках.

6.10. КОГДА сообщение не относится к model-run шагу (`kind: user` или `kind: error`), ТО `run_id`, `attempt_id`, `sequence` МОГУТ оставаться `NULL`.

---

### 7. Семантика потока ответа

**ID:** llm-integration.7

**User Story:** Как разработчик, я хочу единый runtime-контракт потока ответа (`reasoning` + `text`) без дублирования источников данных.

#### Критерии Приемки

7.1. `kind: llm` сообщение ДОЛЖНО оставаться каноничной записью для потока ответа модели в чате.

7.2. Reasoning ДОЛЖЕН поступать инкрементально в реальном времени и сохраняться в `payload.data.reasoning.text`.

7.3. Текст ответа ДОЛЖЕН обновляться инкрементально по мере text-stream; reasoning и text МОГУТ частично перекрываться по времени.

7.4. `kind:error` ДОЛЖЕН использовать стандартизированный payload-контракт ошибок по правилам `llm-integration.3.*`.

7.5. Вычисление статуса агента в chat-flow ДОЛЖНО выполняться по единому алгоритму из `llm-integration.9.4`.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should show reasoning before answer"
- `tests/functional/llm-chat.spec.ts` — "should keep agent in-progress during reasoning-only llm phase"

---

### 8. Прерывание текущего запроса при новом сообщении

**ID:** llm-integration.8

**User Story:** Как пользователь, я хочу отправить новое сообщение агенту пока он ещё отвечает, и получить ответ на оба сообщения сразу.

#### Критерии Приемки

8.1. КОГДА пользователь отправляет новое сообщение агенту, у которого есть активный `MainPipeline.run()`, ТО текущий запрос к LLM ДОЛЖЕН быть отменён через `AbortController`

8.2. Отмена выполняется только для текущего агента — запросы других агентов не затрагиваются

8.3. ЕСЛИ на момент отмены `kind: llm` сообщение ещё не было создано (агент не успел ответить ни одним чанком), ТО:
  - Запрос отменяется без создания каких-либо сообщений
  - Новое `kind: user` сообщение сохраняется в БД
  - Запускается новый `MainPipeline.run()` с новым сообщением

8.4. ЕСЛИ на момент отмены `kind: llm` сообщение уже было создано (агент начал отвечать), ТО:
  - Запрос отменяется
  - Существующий `kind: llm` скрывается через флаг `hidden: true`
  - Исходное `kind: user` сообщение этого turn НЕ ДОЛЖНО помечаться `hidden` и ДОЛЖНО оставаться видимым в чате
  - Новое `kind: user` сообщение сохраняется в БД
  - Запускается новый `MainPipeline.run()` с новым сообщением

8.5. Сообщения с `hidden: true` НЕ ДОЛЖНЫ участвовать в активном runtime-потоке (обрабатываются как скрытые)

8.6. Сообщения с `hidden: true` НЕ ДОЛЖНЫ включаться в историю при сборке промпта для LLM

8.6.1. КОГДА отменяется уже начатый turn (был создан `kind: llm`), ТО в историю для следующего запроса ДОЛЖНО попадать исходное `kind: user` сообщение этого turn, а скрытый `kind: llm` — НЕ ДОЛЖЕН попадать

8.7. Отменённый запрос НЕ ДОЛЖЕН создавать `kind: error` сообщение — это штатная ситуация, не ошибка

8.8. КОГДА агент архивируется, ТО активный `MainPipeline.run()` для этого агента (если есть) ДОЛЖЕН быть отменён через `AbortController` — без создания новых сообщений

8.9. КОГДА пользователь отправляет новое `kind:user` сообщение, ТО система ДОЛЖНА финализировать все non-terminal, non-hidden `tool_call` записи этого агента (`done=0`, `hidden=false`) в terminal состояние `cancelled` с `done=1` ДО запуска нового pipeline. Hidden tool calls (`hidden=true`) исключаются — они уже обработаны предыдущим cancel/retry.

8.10. Финализация stale tool calls НЕ ДОЛЖНА затрагивать уже terminal tool call записи (`done=1`).

---

### 9. Типы сообщений и согласованность с Agents

**ID:** llm-integration.9

**User Story:** Как разработчик, я хочу единообразные `kind` и статусную семантику между LLM pipeline и модулем Agents, чтобы избежать расхождений в runtime и логике статусов.

#### Критерии Приемки

9.1. LLM pipeline ДОЛЖЕН использовать согласованный набор `kind` из спецификации `agents.7.2.1`

9.2. Завершение задачи агентом ДОЛЖНО фиксироваться сообщением `kind: tool_call` с `toolName = "final_answer"` и `done = true`.

9.3. КОГДА turn завершён сообщением `kind: llm` с `done = true`, но без `final_answer`, ТО статус ДОЛЖЕН оставаться `awaiting-response`.

9.4. Статус агента в chat-flow ДОЛЖЕН вычисляться в одном месте по алгоритму `agents.9.2`; LLM pipeline ДОЛЖЕН сохранять `kind`/`done`/`hidden` семантику сообщений строго в соответствии с этим алгоритмом.

9.4.1. КОГДА terminal `tool_call(code_exec)` имеет `output.status = "success"`, ТО до следующего шага tool-loop статус агента ДОЛЖЕН оставаться `in-progress`.

9.4.2. КОГДА terminal `tool_call(code_exec)` имеет `output.status ∈ {"error","timeout"}`, ТО статус агента ДОЛЖЕН оставаться `in-progress`.

9.4.3. КОГДА terminal `tool_call(code_exec)` имеет `output.status = "cancelled"`, ТО статус агента ДОЛЖЕН вычисляться по runtime-контексту активности pipeline:
  - ПОКА pipeline этого агента активен, статус ДОЛЖЕН оставаться `in-progress`;
  - ЕСЛИ pipeline этого агента не активен, статус ДОЛЖЕН быть `awaiting-response`.

9.5. Основной пользовательский ответ модели ДОЛЖЕН оставаться в `kind: llm` (`data.text`).

9.5.1. `tool_call` с `toolName = "final_answer"` ДОЛЖЕН содержать:
  - `summary_points` (обязательный список пунктов завершения).

9.5.1.1. Системная инструкция и описание инструмента `final_answer` ДОЛЖНЫ явно фиксировать:
  - обычный текстовый ответ модели (`kind: llm`, `data.text`) используется для диалога в процессе выполнения задачи (уточнения, запросы к пользователю, промежуточные сообщения), а не для фиксации завершения;
  - `final_answer` вызывается только когда модель уверена, что работа завершена;
  - ЕСЛИ работа не завершена и `final_answer` не вызывается, модель ДОЛЖНА явно запросить у пользователя недостающую информацию или подтверждение следующего шага;
  - `final_answer` вызывается только в одиночку в рамках одного model-turn; в том же turn НЕ ДОЛЖНЫ вызываться другие инструменты;
  - payload вызова инструмента НЕ ДОЛЖЕН дублироваться в plain-text ответе модели; модель НЕ ДОЛЖНА выводить сырой JSON, который зеркалирует `tool_call` (`summary_points`, `toolName`, `arguments`, `output`);
  - КОГДА модель завершает turn через `final_answer`, она НЕ ДОЛЖНА перед этим публиковать обычный markdown/text summary, буллеты или checklist, которые дословно ИЛИ перефразированно дублируют тот же итог; список решённых задач ДОЛЖЕН находиться только в `final_answer.summary_points`;
  - КОГДА пункт `summary_points` содержит математическое выражение, модель ДОЛЖНА использовать KaTeX-совместимые markdown-делимитеры `$...$` (inline) или `$$...$$` (block);
  - `summary_points` соблюдает лимиты `llm-integration.9.5.2-9.5.3.1` и перечисляет решённые задачи.

9.5.1.2. КОГДА модель завершает текущий turn, ТО она ДОЛЖНА выбирать ровно один исход:
  - либо вызвать `final_answer`;
  - либо задать пользователю явный следующий вопрос для продолжения.

9.5.1.3. КОГДА запрос пользователя полностью выполним в пределах текущего turn (например, прямой generation/edit/transform без дополнительных входных данных), ТО модель ДОЛЖНА вызвать `final_answer` в этом же turn и НЕ ДОЛЖНА оставлять turn в `awaiting-response` без явного вопроса пользователю.

9.5.2. `summary_points` ДОЛЖЕН содержать от 1 до 10 пунктов.

9.5.3. КАЖДЫЙ пункт `summary_points` ДОЛЖЕН иметь длину не более 200 символов.

9.5.3.1. КАЖДЫЙ пункт `summary_points` ДОЛЖЕН содержать непустой текст: после `trim` длина ДОЛЖНА быть не менее 1 символа.

9.5.3.2. Служебный auto-title metadata comment вида `<!-- clerkly:title-meta: ... -->` ДОЛЖЕН появляться только в текстовом ответе модели (`kind: llm`, `data.text`) и НЕ ДОЛЖЕН появляться в других payload-контрактах turn.

9.5.3.3. КОГДА модель завершает turn через `final_answer`, ТО она НЕ ДОЛЖНА перед этим публиковать обычный markdown/text summary, буллеты или checklist, которые дословно ИЛИ перефразированно дублируют тот же итог; список решённых задач ДОЛЖЕН находиться только в `final_answer.summary_points`.

9.5.4. ЕСЛИ `final_answer` нарушает ограничения по `summary_points`, ТО система ДОЛЖНА считать такой `final_answer` невалидным и запустить retry/repair по правилам `llm-integration.12.*`.

9.5.5. ОТСУТСТВИЕ `summary_points` (или пустой массив) НЕ ДОЛЖНО считаться успешным `completed`; такой `final_answer` ДОЛЖЕН обрабатываться как невалидный по правилам retry/repair (`llm-integration.12.*`).

9.5.6. КОГДА в успешной попытке присутствует валидный `tool_call`, ТО система НЕ ДОЛЖНА сохранять отдельный пользовательский `kind: llm` ответ, если его текст является техническим сериализованным payload вызова инструмента (например, JSON с полями `summary_points`, `toolName`, `arguments`, `output`).

9.5.6.1. Это правило ДОЛЖНО применяться к ответам провайдера, где в одном model-turn одновременно пришли `kind: llm` text-chunks/`output.text` и валидный `tool_call`; дублирование в UI в таком случае считается следствием персиста, а не отдельной ошибки renderer.

9.5.6.2. КОГДА в успешной попытке присутствует валидный `final_answer`, ТО система НЕ ДОЛЖНА сохранять отдельный пользовательский `kind: llm` ответ, если его markdown/text контент эквивалентен `final_answer.summary_points` и отличается только списочной разметкой (`-`, `*`, `+`, `1.`, `1)`, checkbox-style prefixes) или пробельной нормализацией.

9.6. В целевой модели невалидный `final_answer` НЕ ДОЛЖЕН фиксироваться как успешный `completed`; он ДОЛЖЕН либо быть исправлен через retry, либо завершиться `kind:error` при исчерпании retry-лимита.

9.7. Контракт отображения `kind: tool_call` (в текущем scope: `final_answer`, `code_exec`) определяется только в спецификации `agents` (`agents.7.4.*`) и не дублируется в данном документе.

#### Функциональные Тесты

- `tests/functional/agent-status-calculation.spec.ts` - "should keep in-progress status for done code_exec success tool_call"
- `tests/functional/agent-status-calculation.spec.ts` - "should keep in-progress status from done code_exec error tool_call"
- `tests/functional/agent-status-calculation.spec.ts` - "should keep in-progress status from done code_exec timeout tool_call"
- `tests/functional/llm-chat.spec.ts` — "should cancel active request via stop button without creating error message"
- `tests/functional/agent-status-calculation.spec.ts` - "should resolve awaiting-response status from done code_exec cancelled tool_call when pipeline is inactive"
- `tests/functional/llm-chat.spec.ts` — "should include final_answer non-duplication rules in system prompt"

---

### 10. История для модели: сериализация

**ID:** llm-integration.10

**User Story:** Как разработчик, я хочу чтобы модель получала корректную историю диалога без лишних служебных данных.

#### Критерии Приемки

10.1. История диалога ДОЛЖНА передаваться в модель как последовательность отдельных сообщений, а не как единый агрегированный блок.

10.2. В историю ДОЛЖНЫ попадать только пользовательские данные сообщения, а служебные поля (`kind`, `reply_to_message_id`, `model`, `reasoning.text`, `reasoning.excluded_from_replay`) НЕ ДОЛЖНЫ передаваться в сериализованный payload.

10.3. Сообщения `kind:error` и сообщения с флагом `hidden` НЕ ДОЛЖНЫ попадать в историю.

10.4. Системная инструкция и история диалога ДОЛЖНЫ передаваться в модель раздельно, без объединения в один текстовый блок.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should send full conversation history to llm on second message"

---

### 11. Tool Calling с ограничением `max 1 tool_call` на ответ модели

**ID:** llm-integration.11

**User Story:** Как пользователь, я хочу чтобы агент вызывал не более одного инструмента в одном ответе модели, чтобы поведение было предсказуемым и стабильным.

#### Критерии Приемки

11.1. КОГДА модель запрашивает вызов инструмента, ТО `MainPipeline` ДОЛЖЕН дождаться полной сборки аргументов и выполнить schema/contract validation до создания persisted `kind: tool_call`.

11.1.1. КОГДА один ответ модели содержит более одного `tool_call`, ТО такой ответ ДОЛЖЕН считаться невалидным и ДОЛЖЕН обрабатываться через bounded retry/repair без создания persisted `kind: tool_call`.

11.1.2. КОГДА `tool_call` валиден, ТО система ДОЛЖНА на boundary этого `tool_call` немедленно завершить текущий pre-tool LLM-сегмент (если он непустой) и сразу создать persisted `kind: tool_call` в статусе выполнения (`done = false`, `status = "running"`), без ожидания дополнительных чанков в текущем model-step.

11.1.2.1. КОГДА после boundary `tool_call` в том же model-step приходят дополнительные `reasoning`/`text` чанки, ТО они ДОЛЖНЫ относиться к post-tool LLM-сегменту и НЕ ДОЛЖНЫ задерживать появление persisted `tool_call(status="running")` в UI.

11.1.3. КОГДА `tool_call` валиден и создан в `running`, ТО post-tool LLM-сегмент ДОЛЖЕН начинать стримиться без ожидания terminal-результата `tool_call`.

11.1.3.1. ЕСЛИ после `tool_call` в текущем model-step отсутствует post-tool `text`/`reasoning`, ТО persisted `tool_call` со статусом `running` ВСЁ РАВНО ДОЛЖЕН стать видимым в UI до его terminal-обновления в `message.updated`.

11.1.4. КОГДА `tool_call` завершён terminal-результатом (`success | error | timeout | cancelled`), ТО система ДОЛЖНА обновить тот же persisted `kind: tool_call` до terminal-состояния (`done = true`) в том же блоке (без создания дублирующего terminal-блока).

11.1.5. КОГДА в одном run присутствуют и стриминг LLM (`reasoning`/`text`), и `tool_call`, ТО видимый порядок сообщений ДОЛЖЕН быть: pre-tool LLM-сегмент -> `tool_call` (`running`) -> post-tool LLM-сегмент; terminal-обновление `tool_call` МОЖЕТ приходить позже и ДОЛЖНО применяться in-place.

11.1.6. Пустые LLM-сегменты (без reasoning и без text) НЕ ДОЛЖНЫ сохраняться.

11.2. Для `final_answer` инструмент ДОЛЖЕН вызываться в strict-режиме через `Vercel AI SDK`; соблюдение контракта аргументов (`llm-integration.9.5.*`) ДОЛЖНО обеспечиваться схемой инструмента и встроенным retry/repair механизмом SDK.

11.2.1. КОГДА `final_answer` присутствует в model-turn, ТО к ответу ДОЛЖНО применяться общее ограничение cardinality из `llm-integration.11.1.1` (без отдельного локального правила).

11.2.2. `final_answer` ДОЛЖЕН отображаться последним пользовательским артефактом текущей успешной попытки независимо от порядка его прихода в provider stream.

11.3. КОГДА аргументы любого `tool_call` не проходят schema/contract validation, система ДОЛЖНА вернуть модели диагностику невалидных аргументов и выполнить bounded retry/repair без создания persisted `kind: tool_call`.

11.3.1. Retry/repair для невалидных аргументов tool call ДОЛЖЕН быть ограничен конечным числом попыток: `maxRetries = 2`.

11.3.2. ЕСЛИ после исчерпания retry/repair аргументы остаются невалидными, turn ДОЛЖЕН завершаться обычной ошибкой модели (`kind: error` в чате), а НЕ terminal-ошибкой `tool_call`.

11.3.3. Для невалидных аргументов любого `tool_call` запись `kind: tool_call` НЕ ДОЛЖНА создаваться или обновляться в `messages` на любом шаге retry/repair.

11.3.4. КОГДА попытка помечается неуспешной из-за невалидного `tool_call`, ТО уже созданные в этой попытке `kind: llm`/`kind: tool_call` сообщения ДОЛЖНЫ помечаться `hidden: true` и исключаться из активного runtime-потока.

11.4. Сообщения `kind: tool_call` ДОЛЖНЫ сохраняться в истории сообщений и ДОЛЖНЫ включаться в model history (`PromptBuilder`/`listForModelHistory`) только в terminal-состоянии.

11.4.1. Non-terminal `tool_call` (например, `status = "running"`) НЕ ДОЛЖЕН включаться в model history.

11.4.2. Формат включения terminal `tool_call` в model history ДОЛЖЕН соответствовать AI SDK replay-контракту вызова инструмента: связанная пара `assistant(tool-call)` + `tool(tool-result)` с одинаковым `toolCallId`.

11.4.3. Для каждого terminal `tool_call` в model history ДОЛЖНЫ передаваться:
  - `assistant` сообщение с `tool-call` (`toolCallId`, `toolName`, `input` из persisted `arguments`);
  - `tool` сообщение с `tool-result` (`toolCallId`, `toolName`, `output`), где `output` сериализован в формате ToolResultOutput AI SDK (для JSON: `{ "type": "json", "value": ... }`).

11.4.4. Поле `output.value` ДОЛЖНО содержать terminal-статус вызова (`success | error | timeout | cancelled`) и соответствующий output инструмента (включая ошибку, если она есть).

11.5. После получения terminal-результата инструмента `MainPipeline` ДОЛЖЕН продолжать выполнение следующим шагом модели (`model -> tool -> model`) до завершения turn или ошибки, сохраняя ограничение `max 1 tool_call` на каждый следующий ответ модели.

11.5.1. КОГДА `tool_call` завершён terminal-результатом с любым статусом (`success | error | timeout | cancelled`), ТО `MainPipeline` ДОЛЖЕН немедленно передать этот результат в следующий шаг модели.

11.5.2. Система НЕ ДОЛЖНА использовать скрытый provider-level лимит числа шагов tool-loop; любой guard на число шагов ДОЛЖЕН быть явно задокументирован в `llm-integration` как safety bound runtime-слоя.

11.5.3. КОГДА SDK-managed tool-loop выполняется внутри provider-layer, ТО provider-layer ДОЛЖЕН обеспечивать continuation после terminal `tool_result` до доменного завершения turn (`final_answer`, ошибка, abort/cancel`) в пределах явно задокументированного safety bound, а НЕ останавливаться после первого tool-result без такого задокументированного guard.

11.5.4. ЕСЛИ модель вернула `tool_call` и его `tool_result` был получен, НО модель не предоставила ни текстового ответа, ни `final_answer` после tool result, ТО `MainPipeline` ДОЛЖЕН повторить запрос к модели (retry). ЕСЛИ после `MAX_INVALID_TOOL_CALL_RETRIES` попыток модель по-прежнему не отвечает, ТО pipeline ДОЛЖЕН показать ошибку пользователю.

> Контекст: Vercel AI SDK (ai@5.1.5) может потерять ошибку abort при multi-step tool loop из-за бага с закрытым TransformStream controller. Provider возвращает пустой ответ как успешный. Retry даёт модели повторный шанс ответить.

11.6. Runtime-поток tool-calling НЕ ДОЛЖЕН требовать отдельного realtime-сигнала; обработка ДОЛЖНА строиться по persisted `message.created`/`message.updated`.

11.6.1. Система ДОЛЖНА гарантировать, что при завершении run/attempt не остаётся `tool_call` со статусом `running`: каждый такой вызов ДОЛЖЕН переходить в terminal-статус (`cancelled | error | timeout | success`) до завершения попытки.

11.6.2. КОГДА попытка (attempt) завершается retry, ТО все running `tool_call` записи этой попытки ДОЛЖНЫ быть финализированы в terminal состояние (`error`) с `done=1` ДО скрытия сообщений попытки.

11.6.3. КОГДА приложение стартует, ТО система ДОЛЖНА финализировать все persisted `tool_call` записи с `done=0` (включая `hidden=true`) во всех агентах текущего пользователя в terminal состояние `cancelled` с `done=1`.

11.6.4. КОГДА приложение стартует, ТО система ДОЛЖНА скрыть все persisted `kind:llm` сообщения с `done=false` и `hidden=false` во всех агентах текущего пользователя, установив `hidden=true`. Флаг `done` ДОЛЖЕН оставаться `false` (семантика аналогична `hideAndMarkIncomplete`). Это аналогично `llm-integration.11.6.3`, но для `kind:llm` вместо `kind:tool_call`.

11.7. ЕСЛИ реальное выполнение инструмента недоступно, система ДОЛЖНА завершать `kind: tool_call` через заглушку результата:
  - сохранять диагностически понятный placeholder output,
  - переводить сообщение в `done = true`,
  - эмитить `message.updated` с финальным snapshot.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should create tool_call only after reasoning phase and start post-tool text without waiting terminal result"
- `tests/functional/llm-chat.spec.ts` — "should keep visual order pre-tool llm -> tool_call(running) -> post-tool llm with in-place terminal update"
- `tests/functional/llm-chat.spec.ts` — "should show running code_exec before terminal when first model step has no post-tool text"
- `tests/functional/llm-chat.spec.ts` — "should reject model response containing more than one tool_call and run repair"
- `tests/functional/llm-chat.spec.ts` — "should retry tool call on invalid arguments, not persist tool_call, and show kind:error after retry limit"
- `tests/functional/llm-chat.spec.ts` — "should continue to next model step after terminal code_exec tool result"
- `tests/functional/llm-chat.spec.ts` — "should render final_answer tool_call as completed assistant response"
- `tests/functional/llm-chat.spec.ts` — "should render math inside tool_call(final_answer) checklist item"
- `tests/functional/llm-chat.spec.ts` — "should include final_answer non-duplication rules in system prompt"
- `tests/functional/llm-chat.spec.ts` — "should not render raw final_answer JSON text when tool_call(final_answer) is present"
- `tests/functional/llm-chat.spec.ts` — "should not render duplicate markdown summary before final_answer checklist"
- `tests/functional/startup-recovery.spec.ts` — "should finalize stale tool_call records after SIGKILL restart"
- `tests/functional/startup-recovery.spec.ts` — "should hide stale llm messages after SIGKILL restart"
- `tests/functional/startup-recovery.spec.ts` — "should recover both stale tool_call and stale llm after SIGKILL restart"
- `tests/functional/startup-recovery.spec.ts` — "should handle SIGKILL restart with no stale messages (no-op)"

### 12. Надёжность chat-flow и обработка некорректных ответов

**ID:** llm-integration.12

**User Story:** Как пользователь, я хочу чтобы диалог не ломался при некорректных/неполных ответах модели.

#### Критерии Приемки

12.1. ЕСЛИ провайдер возвращает неполный или неконсистентный event-stream, система ДОЛЖНА завершать turn контролируемой ошибкой без падения процесса.

12.2. КОГДА ошибка относится к recoverable-сценарию провайдера, система МОЖЕТ выполнить ограниченное число повторных попыток (retry policy определяется в design).

12.2.1. КОГДА получен невалидный `final_answer`, система ДОЛЖНА автоматически выполнять retry/repair через механизмы `Vercel AI SDK`.

12.2.2. Retry для невалидного `final_answer` ДОЛЖЕН быть ограничен конечным числом попыток (защита от бесконечного цикла): `maxRetries = 2`.

12.2.3. КОГДА нормализованный тип ошибки = `timeout` И run не отменён пользователем И первый meaningful chunk (`reasoning`/`text`) ещё не получен, ТО система ДОЛЖНА выполнить до 3 повторных попыток (4 attempts total включая начальную). Счётчик повторов ДОЛЖЕН сбрасываться при успешной попытке. После исчерпания retry ДОЛЖЕН создаваться ровно один `kind:error` с `type=timeout`.

12.2.4. КОГДА нормализованный тип ошибки НЕ является `timeout` И первый meaningful chunk (`reasoning`/`text`) ещё не получен И run не отменён пользователем, ТО система ДОЛЖНА выполнить не более 1 повторной попытки.

12.3. ЕСЛИ после повторов ошибка сохраняется (включая исчерпание retry по невалидному `final_answer`), пользователь ДОЛЖЕН увидеть стандартизированное сообщение об ошибке в чате.

12.4. Штатная отмена запроса пользователем (stop/cancel) НЕ ДОЛЖНА трактоваться как ошибка и НЕ ДОЛЖНА создавать `kind:error` сообщение.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should cancel active request via stop button without creating error message"
- `tests/functional/llm-chat.spec.ts` — "should show error when invalid final_answer exhausts retry limit"
- `tests/functional/llm-chat.spec.ts` — "should show error when final_answer contains blank summary point"

---

### 13. Учёт токенов и сохранение usage_json

**ID:** llm-integration.13

**User Story:** Как разработчик, я хочу сохранять usage-метрики провайдера вместе с LLM-сообщением в едином формате, чтобы позже отдельно рассчитывать стоимость обработки.

#### Критерии Приемки

13.1. КОГДА LLM-провайдер возвращает usage-метрики, система ДОЛЖНА сохранять их в `messages.usage_json` отдельным шагом после завершения `kind: llm` сообщения.

13.2. `messages.usage_json` ДОЛЖЕН хранить единый envelope:
  - `canonical`: нормализованные токен-поля (`input_tokens`, `output_tokens`, `total_tokens`, `cached_tokens?`, `reasoning_tokens?`)
  - `raw`: usage-объект провайдера без изменения его структуры

13.3. ЕСЛИ провайдер не возвращает usage-метрики, система НЕ ДОЛЖНА прерывать обработку сообщения и МОЖЕТ оставить `messages.usage_json` пустым.

13.4. Система НЕ ДОЛЖНА вычислять стоимость в рамках сохранения `usage_json`; расчёт стоимости выполняется отдельным процессом.

13.5. `usage_json` НЕ ДОЛЖЕН дублировать `provider`, `model` и `timestamp`, так как `model` и время уже хранятся в сообщении, а провайдер определяется по модели.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should show llm response after user message"

---

### 14. Разделение ответственности streaming-событий

**ID:** llm-integration.14

**User Story:** Как разработчик, я хочу однозначные источники данных для стриминга и snapshot-обновлений, чтобы избежать дублей и рассинхронизации в runtime-потоке.

#### Критерии Приемки

14.1. `message.llm.reasoning.updated` и `message.llm.text.updated` ДОЛЖНЫ быть источником инкрементальных delta-обновлений для активного стриминга.

14.2. `message.updated` ДОЛЖЕН оставаться snapshot-событием целостности persisted-состояния, но НЕ ДОЛЖЕН дублировать уже применённые активные delta-чанки в потоке обработки.

14.3. После завершения turn (`done = true`) финальный snapshot из `message.updated` ДОЛЖЕН считаться каноническим persisted-состоянием сообщения.

14.4. В активном стриминге delta/source-of-truth (`message.llm.reasoning.updated`, `message.llm.text.updated`) и snapshot (`message.updated`) ДОЛЖНЫ координироваться через общий буфер с частотой не чаще 100ms между промежуточными flush-циклами.

14.5. Runtime-слой доставки realtime-событий (main + renderer EventBus) ДОЛЖЕН обрабатывать `message.llm.reasoning.updated` и `message.llm.text.updated` симметрично: события с одинаковым timestamp НЕ ДОЛЖНЫ отбрасываться как outdated, чтобы исключить визуальные паузы и burst-рендеринг текста.

14.6. Renderer-слой списка сообщений ДОЛЖЕН обновляться инкрементально во время стриминга: КОГДА происходят input-only state updates (без изменения message snapshot), ТО система НЕ ДОЛЖНА выполнять массовый повторный ререндер списка сообщений; КОГДА обновляется snapshot одного сообщения, ТО ДОЛЖЕН ререндериться только соответствующий элемент списка.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should continue single-tool model -> tool -> model flow with persisted tool_call blocks"

---

### 15. Канонический реестр tool names

**ID:** llm-integration.15

**User Story:** Как разработчик, я хочу единый канонический список имён инструментов в одном месте, чтобы избежать расхождений между спеками и runtime.

#### Критерии Приемки

15.1. Канонический список `toolName` ДОЛЖЕН фиксироваться в `llm-integration` как source of truth для runtime/tool-loop контракта.

15.2. В текущем scope список `toolName` ДОЛЖЕН состоять ровно из:
  - `final_answer`
  - `code_exec`

15.3. Другие спецификации (`agents`, `code_exec`, `realtime-events`) SHALL ссылаться на канонический список из `llm-integration` и SHALL NOT переопределять его независимо.

---

### 16. Извлечение auto-title из markdown-ответа модели

**ID:** llm-integration.16

**User Story:** Как разработчик, я хочу извлекать кандидат имени агента из того же model-turn, чтобы не делать отдельный LLM-запрос.

#### Критерии Приемки

16.1. Система ДОЛЖНА извлекать метаданные auto-title из обычного markdown/text-ответа ассистента (`kind: llm`, `data.text`) по контракту `<!-- clerkly:title-meta: ... -->` в рамках того же `MainPipeline.run(...)`.

16.1.1. КОГДА текущий turn удовлетворяет guard-условиям auto-title, ТО система ДОЛЖНА добавлять в model input per-turn system instruction с контрактом генерации `<!-- clerkly:title-meta: ... -->` и контекстом текущего названия чата.

16.1.2. КОГДА текущий turn удовлетворяет guard-условиям auto-title, ТО система ДОЛЖНА запрашивать у модели единый metadata-пакет в одном теге `<!-- clerkly:title-meta: ... -->`, который содержит:
  - `title` (строка);
  - `rename_need_score` (целое число `0..100`, где большее значение означает более сильную необходимость смены текущего названия).

16.1.3. Payload тега `<!-- clerkly:title-meta: ... -->` ДОЛЖЕН быть JSON-объектом формата `{"title":"<short title>","rename_need_score":NN}`.

16.1.4. Служебный тег `<!-- clerkly:title-meta: ... -->` ДОЛЖЕН размещаться только в обычном markdown/text-ответе модели и НЕ ДОЛЖЕН размещаться внутри аргументов инструментов.

16.2. Система НЕ ДОЛЖНА выполнять отдельный LLM-вызов для генерации названия агента.

16.3. Parser ДОЛЖЕН обрабатывать stream инкрементально и искать первое вхождение префикса `<!-- clerkly:title-meta:`.

16.4. КОГДА parser вошёл в режим захвата payload, ТО захват ДОЛЖЕН завершаться:
  - при обнаружении закрывающего `-->`, ИЛИ
  - при достижении лимита `TITLE_META_PAYLOAD_MAX_LENGTH = 260`.

16.4.1. Лимит `TITLE_META_PAYLOAD_MAX_LENGTH` ДОЛЖЕН считаться в Unicode-символах (code points), а НЕ в байтах.

16.5. ЕСЛИ захват достиг лимита 260 без `-->`, ТО comment ДОЛЖЕН считаться невалидным, а rename ДОЛЖЕН быть пропущен без влияния на основной ответ.

16.6. За один model-turn система ДОЛЖНА обрабатывать не более одного валидного metadata comment (первое валидное вхождение).

16.7. Система НЕ ДОЛЖНА модифицировать пользовательский output-stream ради извлечения title; извлечение выполняется параллельно с обычной доставкой контента.

16.8. Candidate title ДОЛЖЕН нормализоваться (trim, single-line, collapse spaces, удаление краевой пунктуации) и валидироваться с ограничением `AGENT_TITLE_MAX_LENGTH = 200`.

16.8.2. Лимит `AGENT_TITLE_MAX_LENGTH` ДОЛЖЕН считаться в Unicode-символах (code points), а НЕ в байтах.

16.8.1. Candidate title ДОЛЖЕН стремиться к краткому формату `3-12` слов (target); при этом превышение 200 символов ДОЛЖНО приводить к пропуску rename.

16.8.3. Нормализация candidate title ДОЛЖНА удалять непарные парные знаки препинания (paired punctuation). Обрабатываемые типы:
  - Двойные кавычки: ASCII `"` (U+0022), типографские `\u201C` (`"`) / `\u201D` (`"`)
  - Одинарные кавычки (НЕ апострофы): типографские `\u2018` (`'`) / `\u2019` (`'`)
  - Круглые скобки: `(` / `)`
  - Квадратные скобки: `[` / `]`
  - Фигурные скобки: `{` / `}`
  - Обратные кавычки (backticks): `` ` ``
  - Угловые скобки: `<` / `>`

  Правила:
  - Для парных символов с разными открывающей/закрывающей формами (типографские кавычки, скобки, угловые скобки): ЕСЛИ количество открывающих не равно количеству закрывающих, ТО все символы этого типа ДОЛЖНЫ быть удалены.
  - Для симметричных парных символов (ASCII `"`, обратные кавычки): ЕСЛИ количество нечётное, ТО все символы этого типа ДОЛЖНЫ быть удалены.
  - Сбалансированные (парные) символы ДОЛЖНЫ сохраняться.
  - ASCII одинарные кавычки / апострофы (`'`, U+0027) НЕ ДОЛЖНЫ затрагиваться, так как они повсеместно используются в сокращениях (contractions) и притяжательных формах.

16.8.4. Промпт auto-title (per-turn system instruction) ДОЛЖЕН явно инструктировать модель не использовать парные знаки препинания (кавычки, скобки, backticks, угловые скобки) в генерируемых названиях. Это обеспечивает defense-in-depth: промпт предотвращает генерацию, а нормализация (`llm-integration.16.8.3`) обрабатывает случаи, когда модель всё же их включает.

16.9. ЕСЛИ candidate title после нормализации пустой или превышает лимит, ТО rename ДОЛЖЕН быть пропущен.

16.10. Перед применением rename система ДОЛЖНА выполнять anti-flapping guards:
  - exact-match guard на нормализованных строках;
  - score guard:
    - default-title ДОЛЖЕН определяться без учёта регистра и артефактов форматирования (лишние пробелы и краевая пунктуация НЕ ДОЛЖНЫ менять результат сравнения с `New Agent`);
    - КОГДА title является default-title, rename ДОЛЖЕН применяться только при `rename_need_score > 50`;
    - КОГДА title НЕ является default-title, rename ДОЛЖЕН применяться только при `rename_need_score >= 80`;
  - cooldown guard: не чаще одного rename за 5 user-turns для одного агента;
  - cooldown replay ДОЛЖЕН учитывать только успешно применённые rename (не просто наличие comment в тексте ответа);
  - initial-rename guard: ПОКА title является default-title (по нормализованному case-insensitive сравнению), ЕСЛИ в истории агента ещё нет meaningful user-message (>=3 буквенно-цифровых символов), auto-rename ДОЛЖЕН выполняться только на meaningful triggering user-message;
  - ПОКА title является default-title (по нормализованному case-insensitive сравнению), ЕСЛИ в истории агента уже есть meaningful user-message, auto-rename МОЖЕТ выполняться и на turn с не-meaningful triggering user-message.

16.10.1. ЕСЛИ `rename_need_score` отсутствует, невалиден или вне диапазона `0..100`, ТО rename ДОЛЖЕН быть пропущен для текущего turn.

16.11. Применение валидного candidate title ДОЛЖНО выполняться через существующий путь обновления агента (`AgentManager.update(...)`) с публикацией стандартного `agent.updated`.

16.12. Ошибки parser/валидации/rename НЕ ДОЛЖНЫ прерывать `MainPipeline.run(...)` и НЕ ДОЛЖНЫ создавать блокирующее `kind:error` сообщение; для таких случаев ДОЛЖНО быть достаточно диагностического логирования.

16.13. Логика auto-title ДОЛЖНА сохранять изоляцию данных пользователя: rename применяется только к агенту текущего user-context.

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` - "should extract agent title and rename_need_score from single metadata comment in the same model turn"
- `tests/functional/llm-chat.spec.ts` - "should extract agent title from llm text when the same turn also completes with final_answer"
- `tests/functional/llm-chat.spec.ts` - "should include auto-title metadata contract in system prompt"
- `tests/functional/llm-chat.spec.ts` - "should ignore unterminated title metadata comment when payload exceeds 260 chars"
- `tests/functional/llm-chat.spec.ts` - "should reject title-meta inside tool payload and repair without rendering metadata comment"
- `tests/functional/llm-chat.spec.ts` - "should keep default name when first user message is non-meaningful"
- `tests/functional/llm-chat.spec.ts` - "should keep default name when default-title rename_need_score is 50"
- `tests/functional/llm-chat.spec.ts` - "should apply rename when default-title rename_need_score is 51"
- `tests/functional/llm-chat.spec.ts` - "should skip rename when rename_need_score is below threshold"
- `tests/functional/llm-chat.spec.ts` - "should skip rename when rename_need_score is invalid"
- `tests/functional/llm-chat.spec.ts` - "should apply rename for new intent after 5-turn cooldown"
