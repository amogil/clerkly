# Список Задач: LLM Integration — Full Streaming + Native Tool Calling

## Обзор

Целевая модель event-driven assistant turn:
- streaming reasoning;
- streaming текста ответа;
- native tool-calling с многошаговым циклом `model -> tools -> model`;
- поддержка нескольких tool calls в одном turn (в том числе параллельно);
- полный отказ от Structured Output как обязательного формата ответа модели.

**Текущий статус:** Фаза 1 — Проектирование и контракты

---

## КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

- [ ] Не ломать текущую политику отмены: отменённый запрос НЕ создаёт `kind:error`, незавершённый `kind:llm` скрывается через `hidden: true`, `done: false`.
- [ ] Не допускать регрессию существующих realtime событий (`message.created`, `message.updated`) при добавлении новых событий.
- [ ] Renderer ДОЛЖЕН корректно отображать валидные payload сообщений целевого формата.
- [ ] Structured Output НЕ ДОЛЖЕН оставаться обязательным форматом chat-flow.
- [ ] Для функциональных тестов соблюдать правила `testing.10`, `testing.11`, `testing.12`.

---

## Детальный Анализ Текущего Кода

### Найденные точки изменений (main)

- [x] `src/main/llm/ILLMProvider.ts`
  - [x] Сейчас `ChatChunk` поддерживает только `{ type: 'reasoning', delta, done }`.
  - [x] Сейчас `chat(...)` возвращает `Promise<LLMStructuredOutput>` с `action`.
  - [x] Требуется переход на provider-agnostic поток turn-событий.

- [x] `src/main/agents/MainPipeline.ts`
  - [x] Сейчас `callProviderWithStreaming()` обрабатывает только reasoning-чанки.
  - [x] Сейчас финальный текст берётся только из `output.action.content` (единым куском).
  - [x] Сейчас есть retry-логика на `InvalidStructuredOutputError`.
  - [ ] Требуется state machine для assistant turn + tool loop + отмена в многошаговом цикле.

- [ ] `src/main/agents/PromptBuilder.ts` + `src/main/index.ts`
  - [ ] `PromptBuilder` умеет собирать `tools`, но `MainPipeline` использует только `buildMessages()` и не передаёт tools в provider options.
  - [ ] В `src/main/index.ts` `PromptBuilder` инициализируется с пустым списком feature (`[]`), поэтому фактически tools не подключаются.
  - [ ] Требуется явная wiring-цепочка `AgentFeature -> PromptBuilder.tools -> MainPipeline -> provider.chat`.

- [ ] `src/main/agents/AgentIPCHandlers.ts` + `src/main/agents/AgentManager.ts`
  - [ ] Логика `messages:cancel` ориентирована на `user/llm`, но не покрывает state cleanup для активных `tool_call`.
  - [ ] `AgentManager.computeAgentStatus()` не имеет отдельной ветки для `tool_call`; при активных tool-сообщениях возможен неверный status.
  - [ ] Требуется синхронизация отмены/статусов с новым tool-loop.

- [ ] `src/main/tools/*` (новый слой)
  - [ ] В текущем production-коде отсутствует выделенный ToolRunner/ToolGateway для вызовов tools из LLM turn-loop.
  - [ ] Требуется ввести слой исполнения инструментов в main (policy, timeout, bounded concurrency, error mapping).

- [x] `src/main/llm/OpenAIProvider.ts`
  - [x] Сейчас `text.format.json_schema` + `buildStructuredOutputInstruction()`.
  - [x] Сейчас текст копится в `contentAccumulator`, затем парсится как JSON.
  - [x] Требуется streaming `text.delta` и нативный разбор tool-calling событий Responses API.

- [ ] `src/main/llm/AnthropicProvider.ts`
  - [x] Сейчас `output_config.format.json_schema`, финальный JSON-парсинг ответа.
  - [ ] Требуется adapter на новый внутренний turn-протокол (reasoning/text/tool).

- [ ] `src/main/llm/GoogleProvider.ts`
  - [x] Сейчас `generationConfig.responseSchema`, финальный JSON-парсинг.
  - [ ] Требуется adapter на новый внутренний turn-протокол.

- [ ] `src/main/llm/StructuredOutputContract.ts`
  - [ ] Сейчас является single source для JSON schema + runtime parse.
  - [ ] Требуется удалить из chat pipeline, оставить только то, что реально нужно вне forced output (если нужно).

### Найденные точки изменений (events + renderer)

- [x] `src/shared/events/constants.ts`
  - [x] Проверить целостность набора streaming-событий (`message.llm.reasoning.updated`, `message.llm.text.updated`, `message.tool_call`) во всех слоях (types, bus, transport, tests).

- [x] `src/shared/events/types.ts`
  - [x] Проверить согласованность payload/event-классов для reasoning/text/tool streaming и их использование в EventBus/IPC.

- [x] `src/renderer/lib/IPCChatTransport.ts`
  - [x] Сейчас текст стримится не по delta: берётся из `message.updated` с полным `action.content`.
  - [x] Требуется подписка на text/tool streaming events и инкрементальная сборка UIMessageChunk.

- [x] `src/renderer/lib/messageMapper.ts`
  - [x] Сейчас корректно маппит `user/llm/error`, но tool_call отображаются только косвенно через другие компоненты.
  - [x] Требуется определить стабильный mapping для промежуточных tool-сообщений (без ломки текущего UI).

- [x] `src/renderer/hooks/useAgentChat.ts`
  - [x] Сейчас синхронизирует `rawMessages` через `message.created/updated`.
  - [x] Требуется убедиться, что новые text/tool streaming события не создают дубликаты и корректно завершают stream в `useChat`.

### Найденные точки изменений (тесты)

- [x] `tests/unit/agents/MainPipeline.test.ts`
  - [x] Сильно завязан на structured output и reasoning-only streaming.
  - [x] Потребуется частичная перепись сценариев.

- [x] `tests/unit/llm/OpenAIProvider.chat.test.ts`
  - [x] Проверяет `text.format.json_schema`, `reasoning summary`, `InvalidStructuredOutputError`.
  - [x] Потребуется перепись контрактных тестов chat-stream.

- [x] `tests/unit/llm/AnthropicProvider.chat.test.ts` и `tests/unit/llm/GoogleProvider.chat.test.ts`
  - [x] Проверяют schema-based structured output.
  - [x] Потребуется перепись на turn event protocol.

- [x] `tests/unit/renderer/IPCChatTransport.test.ts`
  - [x] Сейчас ориентирован на reasoning + final text.
  - [x] Требуется расширение на text.delta/tool events.

- [ ] `tests/functional/llm-chat.spec.ts`
  - [ ] Есть тесты на reasoning-before-answer и invalid structured output retry.
  - [ ] Потребуется: новые сценарии full streaming + multi-tool, удаление/замена structured-output сценариев.

---

## Текущее Состояние

### Выполнено
- ✅ Собран контекст issue #41 и текущей реализации (provider/pipeline/renderer/tests).
- ✅ Создана рабочая ветка `fix/issue-41-full-streaming-tool-calls`.
- ✅ Подготовлен детальный план реализации по файлам и тестам.

### В Работе
- 🔄 Подготовка к Фазе 1: обновление контрактов спецификации и типов событий.

### Запланировано

#### Фаза 1: Контракты и События (foundation)

- [ ] Устранить противоречия между `docs/specs/agents/requirements.md` и `docs/specs/llm-integration/requirements.md`
  - [ ] Выровнять модель финального ответа:
  - [ ] Зафиксировать единый canonical-путь: финал как `kind:llm` (`done=true`) без отдельного типа сообщения.
  - [ ] Синхронизировать `agents.7.*`, `agents.9.*`, `llm-integration.1.*`, `llm-integration.7.*`.
  - [ ] Обновить связанные функциональные тесты статусов/рендера финального ответа.
  - [ ] Выровнять перечень `kind`:
  - [ ] Проверить, что глоссарий и критерии приёмки `llm-integration` и `agents` используют единый набор `kind` с `tool_call`.
  - [ ] Явно описать, какие `kind` участвуют в model history, какие только в UI/системе статусов.
  - [ ] Выровнять поведение при rate limit (429):
  - [ ] Зафиксировать, создаётся ли `kind:error` запись при countdown-баннере или используется отдельный transient-механизм.
  - [ ] Синхронизировать это со статусами агента (`agents.9.*`) и правилами скрытия сообщений.
  - [ ] Устранить структурные несоответствия документа:
  - [ ] Проверить, что ссылки на требования в design/tasks/test coverage не содержат «битых» ID.

- [ ] Обновить спецификацию `docs/specs/llm-integration/requirements.md`
  - [ ] Добавить требования на:
  - [ ] streaming `text.delta`;
  - [ ] native tool-calling;
  - [ ] multi-tool в одном turn;
  - [ ] многошаговый цикл `model -> tools -> model`;
  - [ ] корректную отмену в ходе tool loop.

- [ ] Обновить `docs/specs/agents/requirements.md` и `docs/specs/agents/design.md`
  - [ ] Зафиксировать ожидания UI/статусов для `tool_call` в рамках нового LLM turn-loop.
  - [ ] Зафиксировать правила отображения промежуточных tool-сообщений и их завершения.
  - [ ] Удалить или актуализировать устаревший пункт out-of-scope про отсутствие LLM-интеграции, так как текущие требования уже описывают LLM-сценарии.

- [ ] Обновить `docs/specs/llm-integration/design.md`
  - [ ] Зафиксировать новый canonical turn event protocol (union событий).
  - [ ] Описать state machine в `MainPipeline`.
  - [ ] Описать bounded concurrency для tool calls.
  - [ ] Обновить стратегию тестирования и таблицу покрытия требований.

- [ ] Обновить realtime контракты:
  - [ ] `src/shared/events/constants.ts` — добавить event names для text/tool update.
  - [ ] `src/shared/events/types.ts` — добавить payload/interfaces/event classes.
  - [ ] `docs/specs/realtime-events/requirements.md` и `docs/specs/realtime-events/design.md` — синхронизировать новые типы событий.

- [x] Обновить `src/main/llm/ILLMProvider.ts`
  - [x] Ввести новый `ChatChunk` union:
  - [x] `reasoning.delta`
  - [x] `text.delta`
  - [x] `tool_call` (single-shot после полной сборки аргументов)
  - [x] `turn.done`
  - [x] `turn.error`
  - [x] Пересмотреть `chat(...)` контракт под event-driven результат.

#### Фаза 2: MainPipeline state machine + text streaming

- [x] Переработать `src/main/agents/MainPipeline.ts`
  - [x] Убрать зависимость от `LLMStructuredOutput.action` как единственного финального источника текста.
  - [x] Зафиксировать `payload.data.text` как canonical хранилище финального текста в `kind: llm`.
  - [x] Добавить инкрементальное накопление assistant text по `text.delta`.
  - [x] Создавать `kind:llm` на первом meaningful delta (reasoning или text).
  - [x] До `turn.done` удерживать `done=false`, на `turn.done` ставить `done=true`.
  - [x] Поддержать `turn.error` с текущей политикой ошибок/скрытия.
  - [x] Оставить корректный `usage_json` persist как отдельный шаг.

- [x] Довести wiring инструментов до провайдера
  - [x] `PromptBuilder.build(...).tools` должен попадать в `ChatOptions.tools` при вызове `provider.chat(...)`.
  - [ ] Синхронизировать форматы tools для OpenAI/Anthropic/Google adapters.

- [x] Добавить новые main->renderer события:
  - [x] `message.llm.text.updated` (инкрементальный текст).
  - [x] `message.tool_call` (single-shot, orchestration event).
  - [x] Сохранить `message.updated` как snapshot-событие для compatibility.

- [x] Переписать/удалить structured-output retry logic:
  - [x] Удалить `InvalidStructuredOutputError` из MainPipeline control-flow.
  - [x] Удалить retry-instruction, завязанную на JSON schema.

#### Фаза 3: OpenAI native tool-calling loop (MVP)

- [x] `src/main/llm/OpenAIProvider.ts`
  - [x] Удалить `buildStructuredOutputInstruction()` из chat-потока.
  - [x] Удалить `text.format.json_schema` и JSON parse action как обязательный путь.
  - [x] Парсить streaming-события Responses API в новый internal chunk protocol.
  - [x] Эмитить:
  - [x] reasoning deltas;
  - [x] text deltas;
  - [x] tool call start/args/result;
  - [x] turn done/error.

- [ ] `src/main/agents/MainPipeline.ts` (tool loop)
  - [ ] Реализовать single-tool loop:
  - [ ] собрать аргументы tool call полностью;
  - [ ] эмитить одно событие `message.tool_call`;
  - [ ] выполнить инструмент;
  - [ ] передать результат обратно в модель.
  - [ ] Реализовать multi-tool batch:
  - [ ] bounded concurrency (pool size configurable, начально 3);
  - [ ] детерминированная агрегация по `call_id`;
  - [ ] возврат результатов в модель пакетно.

- [ ] `src/main/tools/*` (новые модули)
  - [ ] Ввести ToolRunner/ToolRegistry/ToolPolicy для унифицированного исполнения вызовов.
  - [ ] Добавить ограничения: timeout, retry policy (где нужно), concurrency cap.
  - [ ] Добавить нормализацию ошибок tool execution -> статус `done/error/policy_denied`.

- [ ] Проверить интеграцию с отменой:
  - [ ] отмена во время параллельных tool calls;
  - [ ] idempotent завершение уже стартовавших задач;
  - [ ] отсутствие `kind:error` для штатной отмены.

#### Фаза 4: Renderer transport/UI интеграция

- [x] Обновить `src/renderer/lib/IPCChatTransport.ts`
  - [x] Подписка на `message.llm.text.updated` и инкрементальная подача `text-delta` в stream.
  - [x] Явно игнорировать `message.tool_call` для рендера чата (событие orchestration-only).
  - [x] Корректное закрытие stream на `turn.done`/cancel/hidden.
  - [x] Убрать зависимость от legacy-пути `payload.data.action.content` в активном streaming-потоке.

- [ ] Обновить `src/renderer/hooks/useAgentChat.ts`
  - [ ] Синхронизировать `rawMessages` с новыми событиями без дублей.
  - [ ] Обеспечить корректную очистку hidden сообщений во время стриминга.

- [ ] При необходимости обновить:
  - [x] `src/renderer/lib/messageMapper.ts`
  - [x] `src/renderer/components/agents/AgentMessage.tsx`
  - [ ] `src/renderer/components/agents/AgentChat.tsx`
 для отображения только `kind:llm` streaming-состояний без отдельных tool-call сообщений.
  - [x] Переключить рендер финального текста на `payload.data.text` как canonical-поле (без опоры на `data.action.content`).

- [ ] Синхронизировать вычисление статуса агента
  - [ ] Обновить `src/main/agents/AgentManager.ts` для статуса через `kind:llm done=false` как единственный индикатор in-progress.
  - [ ] Убедиться, что UI-индикатор активности не регрессирует при multi-tool сценариях.

#### Фаза 5: Провайдерная унификация (Anthropic/Google)

- [ ] `src/main/llm/AnthropicProvider.ts`
  - [x] убрать schema-forced structured output;
  - [ ] реализовать адаптер в новый turn protocol;
  - [ ] покрыть tool-calling semantics провайдера.

- [ ] `src/main/llm/GoogleProvider.ts`
  - [x] убрать `responseSchema` как обязательную часть;
  - [ ] реализовать адаптер в новый turn protocol;
  - [ ] покрыть tool-calling semantics провайдера.

- [ ] Проверить `src/main/llm/LLMProviderFactory.ts` и связанные типы на совместимость нового контракта.

#### Фаза 6: Удаление Structured Output артефактов

- [ ] Удалить/свернуть `src/main/llm/StructuredOutputContract.ts`.
- [x] Удалить импорты/ветки `InvalidStructuredOutputError` из провайдеров и пайплайна.
- [ ] Обновить спеки и тесты, чтобы не осталось ссылок на JSON-schema forced output в chat-flow.

#### Фаза 7: Тестирование (детальный чек-лист)

- [ ] Unit — новые тесты
  - [ ] `tests/unit/agents/PromptBuilder.test.ts`
  - [ ] Проверка, что tools из features реально попадают в pipeline/provider request.
  - [x] `tests/unit/agents/MainPipeline.test.ts`
  - [x] text streaming инкрементально обновляет `kind:llm` до `turn.done`;
  - [x] reasoning + text одновременно не конфликтуют;
  - [x] single tool call эмитит один `message.tool_call` после полной сборки аргументов;
  - [ ] multi-tool batch + deterministic merge по `call_id`;
  - [ ] отмена в середине tool loop без `kind:error`.
  - [ ] `tests/unit/agents/AgentIPCHandlers.test.ts`
  - [ ] `messages:cancel` корректно обрабатывает активные tool-сообщения.
  - [ ] `tests/unit/agents/AgentManager.test.ts`
  - [ ] статус агента корректен при `tool_call` в in-progress и done состояниях.
  - [x] `tests/unit/renderer/IPCChatTransport.test.ts`
  - [x] transport отправляет `text-delta` по мере событий;
  - [x] не рендерит `message.tool_call` как отдельный UI chunk;
  - [x] корректно завершает поток при hidden/cancel/turn.done.
  - [ ] `tests/unit/events/EventTypes.test.ts` и/или `tests/unit/events/MainEventBus.test.ts`
  - [ ] ключи/коалесцирование для новых text/tool событий.
  - [x] `tests/unit/llm/OpenAIProvider.chat.test.ts`
  - [x] парсинг reasoning/text/tool streaming events;
  - [ ] >=2 tool calls в одном turn;
  - [x] turn.done / turn.error поведение.
  - [x] `tests/unit/llm/AnthropicProvider.chat.test.ts`
  - [x] mapping в новый chunk protocol.
  - [x] `tests/unit/llm/GoogleProvider.chat.test.ts`
  - [x] mapping в новый chunk protocol.

- [ ] Unit — тесты на переписывание/удаление
  - [ ] Переписать тесты, завязанные на structured output request schema:
  - [ ] OpenAI: проверки `text.format.json_schema`;
  - [x] Anthropic: проверки `output_config.format`;
  - [x] Google: проверки `generationConfig.responseSchema`.
  - [x] Переписать/удалить тесты retry на `InvalidStructuredOutputError`.

- [ ] Functional — новые тесты
  - [ ] `tests/functional/llm-chat.spec.ts`
  - [ ] "text appears incrementally while model streams";
  - [ ] "reasoning and text stream simultaneously";
  - [ ] "single tool call does not create separate chat message";
  - [ ] "multiple tool calls in one turn and final response continues";
  - [ ] "cancel during tool execution hides in-flight messages and creates no error".
  - [ ] `tests/functional/agent-activity-indicator.spec.ts`
  - [ ] покрыть сценарии активности при multi-tool и завершении tool batch.

- [ ] Functional — тесты на переписывание/удаление
  - [ ] Переписать/удалить сценарии:
  - [ ] "Structured Output описан в системном промпте..."
  - [x] "Invalid structured output -> retry, затем ошибка..."
  - [ ] Обновить helper mock-сервер:
  - [x] `tests/functional/helpers/mock-llm-server.ts` — добавить генерацию text stream + single-shot `tool_call` событий вместо lifecycle/tool-args streaming.

#### Фаза 7.1: Унификация `changedFields` в событиях updated

- [x] `src/shared/events/types.ts`
  - [x] Сделать `changedFields` опциональным полем в updated payload-контрактах (`AgentUpdatedPayload`, `MessageUpdatedPayload`) с форматом `string[]`.
  - [x] Обновить `AgentUpdatedEvent`/`MessageUpdatedEvent` constructors и `toPayload()` под новый формат.
  - [x] Удалить/актуализировать устаревший generic `EntityUpdatedEvent<T>` (`changedFields: Partial<T>`) либо синхронизировать его с `string[]`.
  - [x] Привести `UserProfileUpdatedPayload`/`UserProfileUpdatedEvent` к тому же контракту (`changedFields?: string[]`).

- [x] `src/main/agents/AgentManager.ts`
  - [x] Для событий, где `changedFields` публикуется, передавать корректный список изменённых полей (`name`, `updatedAt`, `status`, `archivedAt` при необходимости).
  - [x] Для событий пересчёта статуса по сообщениям при наличии `changedFields` заполнять минимум `['status']`, а при touch — `['updatedAt', 'status']`.

- [x] `src/main/agents/MessageManager.ts`
  - [x] Для событий, где `changedFields` публикуется, передавать список snapshot-полей (`payload`, `done`, `hidden`, `usageJson`, `replyToMessageId`).
  - [x] Для `hideErrorMessages()/setHidden()/hideAndMarkIncomplete()/setDone()/update()` выставлять точный список changed fields без оверрепорта.

- [x] `src/main/auth/UserManager.ts`
  - [x] Для `user.profile.updated` публиковать `changedFields` в формате `string[]` (snapshot paths) вместо object-патча.
  - [x] Перед публикацией нормализовать `changedFields`: dedupe + lexicographic sort.

- [x] `src/renderer/events/RendererEventBus.ts`
  - [x] Проверить/обновить dedupe-coalescing логику для `message.updated` с учётом `changedFields` и streaming-событий.
  - [x] Обеспечить отсутствие потери событий при одинаковом timestamp и разных `changedFields`.

- [x] Unit tests
  - [x] `tests/unit/events/EventClasses.test.ts` — обновить тесты event-классов для нового `changedFields: string[]`.
  - [x] `tests/unit/agents/AgentManager.test.ts` — проверки наполнения `changedFields` для всех веток публикации `AgentUpdatedEvent`.
  - [x] `tests/unit/agents/MessageManager.test.ts` — проверки `changedFields` для всех веток `MessageUpdatedEvent`.
  - [x] `tests/unit/events/EventIPCHandlers.test.ts` и `tests/unit/events/MainEventBus.test.ts` — сериализация/доставка `changedFields: string[]`.
  - [x] `tests/unit/auth/UserManager.test.ts` — проверка формата `changedFields` для `user.profile.updated` (array строк, unique, sorted).
  - [x] Добавить table-driven unit тест для нормализатора `changedFields` (дубликаты, порядок, пустой список, nested path).

#### Фаза 7.2: Закрытие пробелов по новым streaming/tool событиям и статусам

- [x] `src/shared/events/constants.ts`
  - [x] Убедиться, что объявлены `message.llm.text.updated` и `message.tool_call`.

- [x] `src/shared/events/types.ts`
  - [x] Добавить payload/event-классы для `message.llm.text.updated` и `message.tool_call`.
  - [x] Обновить `ClerklyEvents`/`EventType` и ключи dedupe (`getEntityId`/`getEventKey`) для новых событий.

- [ ] Unit tests
  - [x] `tests/unit/events/EventClasses.test.ts` — покрыть `MessageLlmTextUpdatedEvent` и `MessageToolCallEvent`.
  - [x] `tests/unit/events/EventTypes.test.ts` — покрыть ключи dedupe для `message.llm.text.updated` и `message.tool_call`.
  - [x] `tests/unit/utils/agentStatus.test.ts` — обновить тесты на актуальный набор статусов (`new`, `in-progress`, `awaiting-response`, `error`, `completed`).
  - [x] `tests/unit/agents/PromptBuilder.test.ts` — явно проверить, что `kind: tool_call` не попадает в model history.
  - [x] `tests/unit/renderer/messageMapper.test.ts` — проверить, что `tool_call` игнорируется для чата и не ломает mapping остальных сообщений.
  - [ ] `tests/unit/events/MainEventBus.test.ts` и `tests/unit/events/RendererEventBus.test.ts` — отсутствие coalescing/дропа для `message.llm.reasoning.updated` и `message.llm.text.updated` при equal timestamp.

- [ ] Functional tests
  - [ ] `tests/functional/llm-chat.spec.ts` — добавить сценарий инкрементального text-stream в активном `kind:llm` bubble.

#### Фаза 7.3: Контракт порядка событий и запрет лишних сообщений

- [ ] Event ordering contract (unit)
  - [ ] `tests/unit/agents/MainPipeline.test.ts` — зафиксировать допустимый порядок в рамках одного turn:
  - [ ] `message.llm.reasoning.updated` и `message.llm.text.updated` могут чередоваться,
  - [ ] `message.tool_call` приходит только single-shot после полной сборки аргументов,
  - [ ] финализация фиксируется через `message.updated` с `done=true`.
  - [ ] `tests/unit/events/MainEventBus.test.ts` + `tests/unit/events/RendererEventBus.test.ts` — убедиться, что этот порядок не ломается из-за dedupe/coalescing.

- [ ] Negative contract tests (unit/functional)
  - [ ] `tests/unit/events/EventTypes.test.ts` — убедиться, что в целевом контракте отсутствуют/не используются ключи для `message.tool_call.updated`.
  - [ ] `tests/unit/agents/MainPipeline.test.ts` — запрет публикации частичных tool-call событий до полной сборки аргументов.
  - [ ] `tests/unit/renderer/IPCChatTransport.test.ts` — `message.tool_call` не попадает в UI stream как отдельный message chunk.
  - [ ] `tests/functional/llm-chat.spec.ts` — подтвердить, что в чате не появляется отдельный bubble/tool-call message.

#### Фаза 7.4: Статусные инварианты (текущий этап)

- [x] `tests/unit/agents/AgentManager.test.ts`
  - [x] `kind='llm' && done=false -> in-progress`.
  - [x] `kind='llm' && done=true -> awaiting-response`.
  - [x] `completed` присутствует в типах/UI, но не вычисляется в текущем runtime-пути `computeAgentStatus()` (ожидаемое поведение текущего этапа).

- [x] `tests/unit/utils/agentStatus.test.ts` + `tests/unit/components/agents-status-colors.test.tsx`
  - [x] сохранить совместимость визуального отображения `completed` (иконка/цвет/текст) без требования runtime-вычисления.

#### Фаза 7.5: Acceptance-критерии целевой цели (Definition of Done)

- [ ] Цель "stream reasoning + text + tool calls" считается достигнутой, если одновременно выполнено:
  - [ ] В UI reasoning стримится инкрементально через `message.llm.reasoning.updated`.
  - [ ] В UI текст ответа стримится инкрементально через `message.llm.text.updated`.
  - [ ] `message.tool_call` приходит single-shot только после полной сборки `arguments`.
  - [ ] `message.tool_call` не рендерится отдельным сообщением в чате.
  - [ ] Финальный persisted snapshot сообщения фиксируется через `message.updated` + `done=true`.
  - [x] `npm run validate` проходит полностью.
  - [x] Обязательный набор smoke functional тестов по стримингу и tool loop проходит.

#### Фаза 8: Финализация и валидация

- [x] Запустить релевантные unit тесты по изменённым модулям.
- [x] Запустить `npm run validate`.
- [x] Проверить, что покрытие не падает ниже порога.
- [ ] Обновить таблицы покрытия в `docs/specs/llm-integration/design.md`.
- [ ] Проверить непротиворечивость `requirements.md` vs `design.md` vs `tasks.md`.
