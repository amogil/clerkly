# Список Задач: LLM Integration — Full Streaming + Native Tool Calling

## Обзор

Переход от текущей модели `reasoning stream + final structured action` к event-driven assistant turn:
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
- [ ] На время миграции сохранить backward compatibility в renderer: старые чаты и старые payload должны корректно отображаться.
- [ ] Удалять Structured Output поэтапно только после того, как text-streaming и tool loop покрыты unit + functional тестами.
- [ ] Для функциональных тестов соблюдать правила `testing.10`, `testing.11`, `testing.12`.

---

## Детальный Анализ Текущего Кода

### Найденные точки изменений (main)

- [ ] `src/main/llm/ILLMProvider.ts`
  - [ ] Сейчас `ChatChunk` поддерживает только `{ type: 'reasoning', delta, done }`.
  - [ ] Сейчас `chat(...)` возвращает `Promise<LLMStructuredOutput>` с `action`.
  - [ ] Требуется переход на provider-agnostic поток turn-событий.

- [ ] `src/main/agents/MainPipeline.ts`
  - [ ] Сейчас `callProviderWithStreaming()` обрабатывает только reasoning-чанки.
  - [ ] Сейчас финальный текст берётся только из `output.action.content` (единым куском).
  - [ ] Сейчас есть retry-логика на `InvalidStructuredOutputError`.
  - [ ] Требуется state machine для assistant turn + tool loop + отмена в многошаговом цикле.

- [ ] `src/main/llm/OpenAIProvider.ts`
  - [ ] Сейчас `text.format.json_schema` + `buildStructuredOutputInstruction()`.
  - [ ] Сейчас текст копится в `contentAccumulator`, затем парсится как JSON.
  - [ ] Требуется streaming `text.delta` и нативный разбор tool-calling событий Responses API.

- [ ] `src/main/llm/AnthropicProvider.ts`
  - [ ] Сейчас `output_config.format.json_schema`, финальный JSON-парсинг ответа.
  - [ ] Требуется adapter на новый внутренний turn-протокол (reasoning/text/tool).

- [ ] `src/main/llm/GoogleProvider.ts`
  - [ ] Сейчас `generationConfig.responseSchema`, финальный JSON-парсинг.
  - [ ] Требуется adapter на новый внутренний turn-протокол.

- [ ] `src/main/llm/StructuredOutputContract.ts`
  - [ ] Сейчас является single source для JSON schema + runtime parse.
  - [ ] Требуется удалить из chat pipeline, оставить только то, что реально нужно вне forced output (если нужно).

### Найденные точки изменений (events + renderer)

- [ ] `src/shared/events/constants.ts`
  - [ ] Сейчас есть только `message.llm.reasoning.updated` как streaming-событие.
  - [ ] Требуются новые события для text/tool updates.

- [ ] `src/shared/events/types.ts`
  - [ ] Сейчас `MessageLlmReasoningUpdatedPayload` есть, но нет payload для text/tool update.
  - [ ] Требуется расширить event map и typed event classes.

- [ ] `src/renderer/lib/IPCChatTransport.ts`
  - [ ] Сейчас текст стримится не по delta: берётся из `message.updated` с полным `action.content`.
  - [ ] Требуется подписка на text/tool streaming events и инкрементальная сборка UIMessageChunk.

- [ ] `src/renderer/lib/messageMapper.ts`
  - [ ] Сейчас корректно маппит `user/llm/error`, но tool_call/code_exec отображаются только косвенно через другие компоненты.
  - [ ] Требуется определить стабильный mapping для промежуточных tool-сообщений (без ломки текущего UI).

- [ ] `src/renderer/hooks/useAgentChat.ts`
  - [ ] Сейчас синхронизирует `rawMessages` через `message.created/updated`.
  - [ ] Требуется убедиться, что новые text/tool streaming события не создают дубликаты и корректно завершают stream в `useChat`.

### Найденные точки изменений (тесты)

- [ ] `tests/unit/agents/MainPipeline.test.ts`
  - [ ] Сильно завязан на structured output и reasoning-only streaming.
  - [ ] Потребуется частичная перепись сценариев.

- [ ] `tests/unit/llm/OpenAIProvider.chat.test.ts`
  - [ ] Проверяет `text.format.json_schema`, `reasoning summary`, `InvalidStructuredOutputError`.
  - [ ] Потребуется перепись контрактных тестов chat-stream.

- [ ] `tests/unit/llm/AnthropicProvider.chat.test.ts` и `tests/unit/llm/GoogleProvider.chat.test.ts`
  - [ ] Проверяют schema-based structured output.
  - [ ] Потребуется перепись на turn event protocol.

- [ ] `tests/unit/renderer/IPCChatTransport.test.ts`
  - [ ] Сейчас ориентирован на reasoning + final text.
  - [ ] Требуется расширение на text.delta/tool events.

- [ ] `tests/functional/llm-chat.spec.ts`
  - [ ] Есть тесты на reasoning-before-answer и invalid structured output retry.
  - [ ] Потребуется: новые сценарии full streaming + multi-tool, удаление/замена structured-output сценариев.

---

## Текущее Состояние

### Выполнено
- ✅ Собран контекст issue #41 и текущей реализации (provider/pipeline/renderer/tests).
- ✅ Создана рабочая ветка `fix/issue-41-full-streaming-tool-calls`.
- ✅ Подготовлен детальный план миграции по файлам и тестам.

### В Работе
- 🔄 Подготовка к Фазе 1: обновление контрактов спецификации и типов событий.

### Запланировано

#### Фаза 1: Контракты и События (foundation)

- [ ] Обновить спецификацию `docs/specs/llm-integration/requirements.md`
  - [ ] Удалить/заменить требования `llm-integration.11.*` (Structured Output description).
  - [ ] Удалить/заменить требования `llm-integration.12.*` (Invalid structured output retry).
  - [ ] Добавить требования на:
    - [ ] streaming `text.delta`;
    - [ ] native tool-calling;
    - [ ] multi-tool в одном turn;
    - [ ] многошаговый цикл `model -> tools -> model`;
    - [ ] корректную отмену в ходе tool loop.

- [ ] Обновить `docs/specs/llm-integration/design.md`
  - [ ] Зафиксировать новый canonical turn event protocol (union событий).
  - [ ] Описать state machine в `MainPipeline`.
  - [ ] Описать bounded concurrency для tool calls.
  - [ ] Обновить стратегию тестирования и таблицу покрытия требований.

- [ ] Обновить realtime контракты:
  - [ ] `src/shared/events/constants.ts` — добавить event names для text/tool update.
  - [ ] `src/shared/events/types.ts` — добавить payload/interfaces/event classes.
  - [ ] `docs/specs/realtime-events/requirements.md` и `docs/specs/realtime-events/design.md` — синхронизировать новые типы событий.

- [ ] Обновить `src/main/llm/ILLMProvider.ts`
  - [ ] Ввести новый `ChatChunk` union:
    - [ ] `reasoning.delta`
    - [ ] `text.delta`
    - [ ] `tool.call.started`
    - [ ] `tool.call.arguments.delta`
    - [ ] `tool.call.arguments.done`
    - [ ] `tool.result`
    - [ ] `turn.done`
    - [ ] `turn.error`
  - [ ] Пересмотреть `chat(...)` контракт под event-driven результат.

#### Фаза 2: MainPipeline state machine + text streaming

- [ ] Переработать `src/main/agents/MainPipeline.ts`
  - [ ] Убрать зависимость от `LLMStructuredOutput.action` как единственного финального источника текста.
  - [ ] Добавить инкрементальное накопление assistant text по `text.delta`.
  - [ ] Создавать `kind:llm` на первом meaningful delta (reasoning или text).
  - [ ] До `turn.done` удерживать `done=false`, на `turn.done` ставить `done=true`.
  - [ ] Поддержать `turn.error` с текущей политикой ошибок/скрытия.
  - [ ] Оставить корректный `usage_json` persist как отдельный шаг.

- [ ] Добавить новые main->renderer события:
  - [ ] `message.llm.text.updated` (инкрементальный текст).
  - [ ] `message.tool_call.updated` (состояние tool call).
  - [ ] Сохранить `message.updated` как snapshot-событие для compatibility.

- [ ] Переписать/удалить structured-output retry logic:
  - [ ] Удалить `InvalidStructuredOutputError` из MainPipeline control-flow.
  - [ ] Удалить retry-instruction, завязанную на JSON schema.

#### Фаза 3: OpenAI native tool-calling loop (MVP)

- [ ] `src/main/llm/OpenAIProvider.ts`
  - [ ] Удалить `buildStructuredOutputInstruction()` из chat-потока.
  - [ ] Удалить `text.format.json_schema` и JSON parse action как обязательный путь.
  - [ ] Парсить streaming-события Responses API в новый internal chunk protocol.
  - [ ] Эмитить:
    - [ ] reasoning deltas;
    - [ ] text deltas;
    - [ ] tool call start/args/result;
    - [ ] turn done/error.

- [ ] `src/main/agents/MainPipeline.ts` (tool loop)
  - [ ] Реализовать single-tool loop:
    - [ ] создать `kind:tool_call` со status `in_progress`;
    - [ ] стримить аргументы;
    - [ ] выполнить инструмент;
    - [ ] обновить то же сообщение статусом `done/error`;
    - [ ] передать результат обратно в модель.
  - [ ] Реализовать multi-tool batch:
    - [ ] bounded concurrency (pool size configurable, начально 3);
    - [ ] детерминированная агрегация по `call_id`;
    - [ ] возврат результатов в модель пакетно.

- [ ] Проверить интеграцию с отменой:
  - [ ] отмена во время параллельных tool calls;
  - [ ] idempotent завершение уже стартовавших задач;
  - [ ] отсутствие `kind:error` для штатной отмены.

#### Фаза 4: Renderer transport/UI интеграция

- [ ] Обновить `src/renderer/lib/IPCChatTransport.ts`
  - [ ] Подписка на `message.llm.text.updated` и инкрементальная подача `text-delta` в stream.
  - [ ] Подписка на `message.tool_call.updated` для промежуточных шагов.
  - [ ] Корректное закрытие stream на `turn.done`/cancel/hidden.

- [ ] Обновить `src/renderer/hooks/useAgentChat.ts`
  - [ ] Синхронизировать `rawMessages` с новыми событиями без дублей.
  - [ ] Обеспечить корректную очистку hidden сообщений во время стриминга.

- [ ] При необходимости обновить:
  - [ ] `src/renderer/lib/messageMapper.ts`
  - [ ] `src/renderer/components/agents/AgentMessage.tsx`
  - [ ] `src/renderer/components/agents/AgentChat.tsx`
  для отображения tool_call/code_exec промежуточных состояний.

#### Фаза 5: Провайдерная унификация (Anthropic/Google)

- [ ] `src/main/llm/AnthropicProvider.ts`
  - [ ] убрать schema-forced structured output;
  - [ ] реализовать адаптер в новый turn protocol;
  - [ ] покрыть tool-calling semantics провайдера.

- [ ] `src/main/llm/GoogleProvider.ts`
  - [ ] убрать `responseSchema` как обязательную часть;
  - [ ] реализовать адаптер в новый turn protocol;
  - [ ] покрыть tool-calling semantics провайдера.

- [ ] Проверить `src/main/llm/LLMProviderFactory.ts` и связанные типы на совместимость нового контракта.

#### Фаза 6: Удаление Structured Output артефактов

- [ ] Удалить/свернуть `src/main/llm/StructuredOutputContract.ts`.
- [ ] Удалить импорты/ветки `InvalidStructuredOutputError` из провайдеров и пайплайна.
- [ ] Обновить спеки и тесты, чтобы не осталось ссылок на JSON-schema forced output в chat-flow.

#### Фаза 7: Тестирование (детальный чек-лист)

- [ ] Unit — новые тесты
  - [ ] `tests/unit/agents/MainPipeline.test.ts`
    - [ ] text streaming инкрементально обновляет `kind:llm` до `turn.done`;
    - [ ] reasoning + text одновременно не конфликтуют;
    - [ ] single tool call lifecycle (`in_progress -> done/error`);
    - [ ] multi-tool batch + deterministic merge по `call_id`;
    - [ ] отмена в середине tool loop без `kind:error`.
  - [ ] `tests/unit/renderer/IPCChatTransport.test.ts`
    - [ ] transport отправляет `text-delta` по мере событий;
    - [ ] корректно обрабатывает `message.tool_call.updated`;
    - [ ] корректно завершает поток при hidden/cancel/turn.done.
  - [ ] `tests/unit/events/EventTypes.test.ts` и/или `tests/unit/events/MainEventBus.test.ts`
    - [ ] ключи/коалесцирование для новых text/tool событий.
  - [ ] `tests/unit/llm/OpenAIProvider.chat.test.ts`
    - [ ] парсинг reasoning/text/tool streaming events;
    - [ ] >=2 tool calls в одном turn;
    - [ ] turn.done / turn.error поведение.
  - [ ] `tests/unit/llm/AnthropicProvider.chat.test.ts`
    - [ ] mapping в новый chunk protocol.
  - [ ] `tests/unit/llm/GoogleProvider.chat.test.ts`
    - [ ] mapping в новый chunk protocol.

- [ ] Unit — тесты на переписывание/удаление
  - [ ] Переписать тесты, завязанные на structured output request schema:
    - [ ] OpenAI: проверки `text.format.json_schema`;
    - [ ] Anthropic: проверки `output_config.format`;
    - [ ] Google: проверки `generationConfig.responseSchema`.
  - [ ] Переписать/удалить тесты retry на `InvalidStructuredOutputError`.

- [ ] Functional — новые тесты
  - [ ] `tests/functional/llm-chat.spec.ts`
    - [ ] "text appears incrementally while model streams";
    - [ ] "reasoning and text stream simultaneously";
    - [ ] "single tool call lifecycle rendered in chat";
    - [ ] "multiple tool calls in one turn and final response continues";
    - [ ] "cancel during tool execution hides in-flight messages and creates no error".

- [ ] Functional — тесты на переписывание/удаление
  - [ ] Переписать/удалить сценарии:
    - [ ] "Structured Output описан в системном промпте..."
    - [ ] "Invalid structured output -> retry, затем ошибка..."
  - [ ] Обновить helper mock-сервер:
    - [ ] `tests/functional/helpers/mock-llm-server.ts` — добавить генерацию text/tool event stream вместо only structured-json chunks.

#### Фаза 8: Финализация и валидация

- [ ] Запустить релевантные unit тесты по изменённым модулям.
- [ ] Запустить `npm run validate`.
- [ ] Проверить, что покрытие не падает ниже порога.
- [ ] Обновить таблицы покрытия в `docs/specs/llm-integration/design.md`.
- [ ] Проверить непротиворечивость `requirements.md` vs `design.md` vs `tasks.md`.

