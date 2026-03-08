# Список Задач: LLM Integration — Migration to Vercel AI SDK/UI

## Обзор

Цель: перейти на полный стек Vercel AI SDK (`ai`, `@ai-sdk/*`, `@ai-sdk/react`) для chat-flow, стриминга reasoning/текста, tool loop и обработки ошибок, убрав дублирующую кастомную оркестрацию и renderer-костыли.

**Текущий статус:** Фаза B (после завершения Фазы A по спекам/дизайну)

---

## Фаза A: Синхронизация спецификаций и дизайнов

- [x] Согласовать `docs/specs/llm-integration/{requirements,design}.md` с целевой моделью AI SDK UI/Core без миграционных оговорок.
- [x] Зафиксировать инвариант статусов для persisted `kind:tool_call` (`done=false -> in-progress`, `done=true -> awaiting-response`) в `agents` и `llm-integration`.
- [x] Синхронизировать `docs/specs/settings/*` по ID/критериям и контракту `Test Connection`.
- [x] Переписать `docs/specs/error-notifications/*` под целевую модель: chat errors в истории, toast только для non-chat background ошибок.
- [x] Добавить AI SDK chat-flow тестовые контракты в `docs/specs/testing-infrastructure/*`.
- [x] Убрать противоречия в `docs/specs/clerkly/*` по статусу AI-части (не как «будущее»).

---

## Инварианты целевой модели

- [ ] Main process использует AI SDK Core как единственный движок LLM/tool loop.
- [ ] Renderer использует AI SDK UI (`useChat` + `ChatTransport`) как единственный state machine стриминга.
- [ ] Поток в renderer строится через UIMessage stream protocol (`UIMessageChunk`) без дублирования snapshot/delta.
- [ ] Все специализированные ошибки определяются через AI SDK error classes и нормализуются в доменные типы.
- [x] UI рендер tool-call полностью зависит от persisted `kind:tool_call` + `message.created`/`message.updated` (single source of truth).
- [ ] Канонический финал ответа хранится в `payload.data.text`.
- [x] Согласованное статусное правило: `kind='llm' && done=true -> awaiting-response`.
- [ ] Для persisted `kind='tool_call'` статус вычисляется по `done`:
  - [x] `done=false -> in-progress`
  - [x] `done=true -> awaiting-response`

---

## Фаза B1: Контракты ошибок AI SDK

- [x] Ввести единый `ErrorNormalizer` в main-process (`src/main/llm/*`):
  - [x] `APICallError` -> классификация по `statusCode`:
    - [x] `401/403 -> auth`
    - [x] `429 -> rate_limit` (с извлечением `retry-after` / fallback parsing)
    - [x] `5xx -> provider`
  - [x] timeout/abort -> `timeout`
  - [x] transport-level failures без `statusCode` -> `network`
  - [x] `RetryError` после исчерпания попыток -> `provider`
  - [x] tool ошибки (`NoSuchToolError`, `InvalidToolInputError`, `ToolExecutionError`, `ToolCallRepairError`) -> `tool`
  - [x] stream protocol ошибки (`UIMessageStreamError`) -> `protocol`
- [ ] Зафиксировать и реализовать retry policy из `llm-integration/design.md`:
  - [x] retry только до первого meaningful chunk;
  - [x] максимум 1 retry на запуск `MainPipeline.run()`;
  - [x] после начала стрима retry не выполняется.
- [ ] Синхронизировать `ErrorNormalizer` с UI контрактом ошибок:
  - [x] `kind:error` payload
  - [x] rate-limit countdown (`agent.rate_limit`)
  - [x] диагностические события (`llm.pipeline.diagnostic`)
- [x] Удалить ad-hoc ветки ошибок, дублирующие ErrorNormalizer.

## Фаза B1.1: Конформанс ошибок и каналов уведомлений (cross-spec)

- [ ] Привести runtime к `error-notifications` целевой модели:
  - [ ] Chat-flow ошибки (`auth/network/provider/timeout/tool/protocol`) показываются только в чате (`kind:error`), без toast-дубликатов.
  - [ ] `rate_limit` остаётся transient banner (`agent.rate_limit`) без persisted `kind:error`.
  - [ ] Background/IPC ошибки вне chat-flow показываются в toast через `callApi()` (если `silent !== true`).
  - [ ] Race/cancelled ошибки логируются и не показываются пользователю.
- [ ] Синхронизировать тексты ошибок в `LLMError`/renderer диалогах с `llm-integration.3.5`.
- [ ] Обновить unit-тесты:
  - [x] `tests/unit/utils/apiWrapper.test.ts` (chat suppression vs background toast).
  - [x] `tests/unit/agents/MainPipeline.test.ts` (tool/protocol error mapping, no toast assumptions).

## Фаза B1.2: UX-контракты ошибок в чате

- [x] `src/renderer/components/agents/*`:
  - [x] Для `auth`/missing key ошибок показать действия `Open Settings` (primary) и `Retry` (secondary).
  - [x] `Retry` скрывает текущий `kind:error` и повторяет запрос по последнему `kind:user`.
  - [x] Диалоги ошибок/уведомлений занимают всю ширину области чата.
- [x] `src/main/agents/AgentIPCHandlers.ts`:
  - [x] Реализовать `messages:retry-last` и `messages:cancel-retry` под контракт rate-limit.
  - [x] Для `Cancel` в rate-limit удалять исходное `kind:user` сообщение из БД и чата.
- [x] Functional:
  - [x] Кнопки `Open Settings`/`Retry` и их приоритеты.
  - [x] `Retry` сценарий для auth/missing-key ошибок.
  - [x] `Cancel` сценарий в rate-limit с удалением исходного user message.

---

## Фаза B2: Main process на AI SDK Core

- [ ] `src/main/llm/LLMProviderFactory.ts` и типы:
  - [ ] Проверить, что все провайдеры создаются как AI SDK adapters.
  - [ ] Удалить остаточные structured-output/legacy типы из chat-flow.
- [ ] Добавить SDK-native Tool Calling (даже при пустом списке инструментов):
  - [ ] Перевести orchestration tool-calling на AI SDK `streamText/generateText` (`tools`, `toolChoice`, `stopWhen`) вместо ручной склейки tool-loop.
  - [ ] Зафиксировать пустой реестр инструментов как валидный стартовый режим (`tools = {}` / `[]` по контракту адаптера).
  - [ ] Включить strict-режим для tool schemas (через AI SDK tool strict + provider strict-json-schema опции, где поддерживается).
  - [ ] Добавить unit-тест: при пустом tool registry модель не падает и не генерирует runtime-ошибку tool executor.
- [ ] `src/main/llm/OpenAIProvider.ts`:
  - [ ] Финально перевести все streaming/tool semantics на AI SDK primitives.
  - [ ] Убрать ручные provider-specific parser ветки, если покрываются AI SDK layer.
- [ ] `src/main/llm/AnthropicProvider.ts`:
  - [ ] Довести parity (`reasoning`, `text`, `tool_call`, `turn_error`, usage).
  - [ ] Проверить provider options (`thinking`, `sendReasoning`, parallel tool policy).
- [ ] `src/main/llm/GoogleProvider.ts`:
  - [ ] Довести parity (`reasoning`, `text`, `tool_call`, `turn_error`, usage).
  - [ ] Проверить provider options (`thinkingConfig.includeThoughts` и связанные параметры).
- [ ] `src/main/agents/MainPipeline.ts`:
  - [ ] Финализировать loop `model -> tools -> model` на AI SDK control (`stopWhen`/step control).
  - [ ] Поддержать multi-tool + controlled concurrency.
  - [x] Гарантировать корректный persisted lifecycle для `kind:tool_call` (create/update, done=false/true, full arguments).
  - [x] Удалить публикацию/зависимость от отдельного realtime-события `message.tool_call`; использовать только persisted `message.created`/`message.updated`.
  - [ ] Гарантировать корректный cancel cleanup (idempotent для in-flight jobs).
- [ ] `src/main/tools/*`:
  - [ ] Зафиксировать policy layer: timeout/retry/concurrency cap.
  - [ ] Обеспечить deterministic merge результатов tool batch.
  - [x] До появления реального executor реализовать stub-путь: `tool_call` получает placeholder output и переводится в `done=true`.

## Фаза B2.2: Persisted message lifecycle conformance

- [ ] `src/main/agents/MainPipeline.ts` + `MessageManager`:
  - [ ] Создавать `kind:llm` на первом meaningful chunk (`reasoning`/`text`) либо при завершении, если чанков не было.
  - [ ] До завершения ответа держать `done=false`, на завершении ставить `done=true`.
  - [ ] На ошибке после старта стрима: скрывать in-flight `kind:llm` (`hidden=true`, `done=false`) и создавать `kind:error`.
  - [ ] На cancel: не создавать `kind:error`; при созданном `kind:llm` скрывать его через `hidden=true`.
  - [ ] Проставлять `reply_to_message_id` для всех сообщений pipeline согласно контракту.
- [ ] `src/main/db/repositories/MessagesRepository.ts`:
  - [ ] Гарантировать отдельное хранение `usage_json` (`canonical + raw`) без `provider/model/timestamp`.
  - [ ] Гарантировать, что `kind` не дублируется в `payload_json`.
- [ ] Unit:
  - [ ] `MainPipeline` кейсы no-chunk completion / post-stream error / cancel behavior.
  - [ ] `MessagesRepository` кейсы `reply_to_message_id`, `done`, `usage_json`.

## Фаза B2.1: Статусы и snapshot-контракты

- [ ] `src/main/agents/AgentManager.ts` / `src/shared/utils/agentStatus.ts`:
  - [x] Подтвердить правило `kind='llm' && done=true -> awaiting-response`.
  - [x] Для persisted `kind='tool_call'` реализовать/проверить: `done=false -> in-progress`, `done=true -> awaiting-response`.
- [ ] `src/main/agents/MessageManager.ts` + snapshot converters:
  - [ ] Подтвердить canonical финальный текст только в `payload.data.text`.
  - [ ] Убедиться, что `kind:error`, `kind:tool_call`, `hidden=true` исключаются из model history.
- [ ] `src/shared/events/types.ts`:
  - [x] Удалить типы/константы/классы `message.tool_call` из целевого runtime-контракта.
  - [ ] Проверить optional `changedFields` формат для `{entity}.updated` событий.

---

## Фаза C1: Stream Protocol / UIMessage stream

- [ ] Привести `src/renderer/lib/IPCChatTransport.ts` к тонкому protocol-adapter:
  - [ ] Оставить только трансляцию доменных realtime-событий в `UIMessageChunk`.
  - [ ] Убрать лишнюю бизнес-логику из transport (вынести в main/useChat lifecycle).
  - [ ] Зафиксировать корректный порядок chunk-ов:
    - [x] `start -> start-step -> reasoning/text deltas -> finish-step -> finish`
  - [x] Гарантировать отсутствие дубликатов между delta-событиями и `message.updated` snapshot.
  - [ ] Гарантировать корректное завершение стрима при cancel/hidden/done.
- [ ] Добавить protocol guards:
  - [ ] controlled fail на invalid sequence (с диагностикой, без падения процесса).

## Фаза C1.1: Realtime-events conformance

- [ ] `src/main/events/MainEventBus.ts` и bridge:
  - [x] Для `agent.updated`, `message.updated`, `user.profile.updated` передавать `changedFields` в формате spec (`dot.path`, unique, sorted) при наличии диффа.
  - [x] Сохранить поведение timestamp (`<` only outdated) для стриминговых событий.
- [ ] `src/renderer/events/RendererEventBus.ts`:
  - [x] Проверить отсутствие потерь/dedupe для `message.llm.reasoning.updated` и `message.llm.text.updated` в одном timestamp.
- [ ] Unit-тесты:
  - [x] `tests/unit/events/MainEventBus.test.ts` — `changedFields` формат и сортировка.
  - [x] `tests/unit/events/RendererEventBus.test.ts` — non-coalescing чанков с равным timestamp.

---

## Фаза C2: useChat / transport lifecycle и уменьшение костылей

- [ ] `src/renderer/hooks/useAgentChat.ts`:
  - [ ] Минимизировать дублирующую синхронизацию `rawMessages` и `messages` (оставить только обязательные metadata-cases).
  - [ ] Опираться на lifecycle `useChat` (`status`, `stop`, completion/error hooks).
  - [ ] Убрать лишние ручные костыли hidden/update, если покрываются stream lifecycle.
- [ ] `src/renderer/lib/messageMapper.ts`:
  - [x] Проверить стабильный mapping persisted snapshot -> UIMessage (без legacy fallback).
- [ ] `src/renderer/components/agents/AgentMessage.tsx` и `AgentChat.tsx`:
  - [ ] Подтвердить соответствие AI Elements parts/status.
  - [x] Подтвердить отображение `tool_call` через AI Elements `Tool` компонент.
  - [x] Удалить fallback чтения ответа из `data.action.content`; использовать только `payload.data.text`.
- [ ] `src/renderer/components/ai-elements/tool.tsx`:
  - [x] Подключить/обновить `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput` по контракту [AI Elements Tool](https://elements.ai-sdk.dev/components/tool).
  - [x] Обеспечить отображение `toolName`, аргументов (`input`) и результата/ошибки (`output`) для persisted `kind:tool_call`.

---

## Фаза C3: Tool usage + message persistence (AI SDK UI guides)

- [ ] Применить паттерны AI SDK UI для persistence:
  - [ ] `validateUIMessages` для восстановленных/передаваемых сообщений.
  - [ ] `convertToModelMessages` для model input.
  - [ ] консистентная стратегия `onFinish` persistence + детерминированные message IDs.
- [ ] Зафиксировать поведение tool parts в persisted истории:
  - [ ] что сохраняем в БД,
  - [ ] что участвует в model replay,
  - [ ] как `tool_call` рендерится в chat UI через `Tool` (включая pending/success/error states).
  - [ ] какие служебные tool-части НЕ рендерятся пользователю.
- [ ] Проверить необходимость `sendAutomaticallyWhen` и auto-continue semantics для tool-flow.
- [ ] `src/renderer/lib/messageMapper.ts` / `IPCChatTransport`:
  - [x] корректно маппить persisted `kind:tool_call` в UIMessage tool parts.
  - [x] исключить дублирование tool-call частей между `message.created` и `message.updated`.
- [ ] Использовать SDK-метрики шагов вместо ручной агрегации usage/timing:
  - [ ] Брать usage из `result.totalUsage` и `result.steps[*].usage`, а не только из provider-raw envelope.
  - [ ] Для каждого step сохранять диагностику шага (toolCalls, finishReason, usage) в `llm.pipeline.diagnostic`.
  - [ ] Latency per step считать в pipeline через `onStepFinish` + локальные timestamps рантайма (SDK не даёт готовый duration-поле).
  - [ ] Сохранение в `messages.usage_json` оставить в формате `canonical + raw`, где `canonical` заполняется из SDK usage.

## Фаза C4: Settings/Test Connection conformance

- [ ] Выполнить migration ссылок на требования `settings.*` после смены нумерации (`settings.2`/`settings.3`):
  - [ ] production-код: комментарии `Requirements: settings.*` и inline-ссылки.
  - [ ] unit/functional тесты: structured comments и ссылки на требования.
  - [ ] документы `requirements/design/tasks` в затронутых спеках: исправить перекрёстные ссылки.
  - [ ] прогнать проверку отсутствия старых ссылок (`rg \"settings\\.2\\.|settings\\.3\\.\"` по ожидаемому соответствию) и зафиксировать результат.
- [ ] `src/main/llm/*Provider*.ts`:
  - [ ] Подтвердить `testConnection()` для OpenAI/Anthropic/Google по `settings.2.5` и timeout 10s.
  - [ ] Синхронизировать маппинг ошибок test-connection с доменными сообщениями (`settings.2.8`).
- [ ] `src/renderer/components/settings/*`:
  - [ ] Проверить disable/enabled/lifecycle кнопки `Test Connection` по `settings.2.1-2.4`.
  - [ ] Гарантировать отсутствие сохранения результата теста в БД (`settings.2.10`).
  - [ ] Проверить обязательный security-текст API key (`settings.1.25`) и наличие кнопки `Test Connection` (`settings.1.26`).
- [ ] Tests:
  - [ ] `tests/functional/llm-connection-test.spec.ts` — обновить/добавить кейсы по всем провайдерам и ошибкам.
  - [ ] `tests/unit/llm/*Provider*.test.ts` — маппинг HTTP/timeout/network для testConnection.

---

## Фаза D: Удаление костылей и legacy артефактов

- [ ] Удалить переходные/дублирующие ветки streaming и provider parsing, ставшие лишними после AI SDK унификации.
- [ ] Удалить оставшиеся structured-output chat-flow артефакты в коде/тестах/доках.
- [ ] Удалить неиспользуемые event types/конвертеры, если они дублируют stream protocol.
- [ ] Удалить legacy fallback-рендеры в renderer.
- [x] Миграция legacy LLM payload: `data.action.content` -> `data.text` для исторических сообщений.
  - [x] Добавить SQL-миграцию в `migrations/`:
    - [x] Для `kind='llm'` переносить `$.data.action.content` в `$.data.text`, если `$.data.text` отсутствует или пуст.
    - [x] После переноса удалять `$.data.action` из `payload_json`.
    - [x] Не изменять записи, где `data.text` уже заполнен.
  - [x] Добавить unit-тесты для миграции в `tests/unit/MigrationRunner.test.ts`.
  - [x] Проверить, что после миграции исторические ответы корректно отображаются через каноничный `data.text`.

---

## Фаза E: Тестирование (максимальное покрытие)

- [ ] Полный конформанс с `testing.13` (AI SDK chat-flow contracts):
  - [x] `testing.13.1`: unit на sequence `start -> start-step -> delta -> finish-step -> finish` в `IPCChatTransport`.
  - [x] `testing.13.2`: unit на отсутствие дублей между delta и `message.updated` snapshot.
  - [x] `testing.13.3`: unit на рендер persisted `kind:tool_call` как tool-call блока.
  - [x] `testing.13.4`: unit на `ErrorNormalizer` (auth/rate_limit/provider/network/timeout/tool/protocol).
  - [x] `testing.13.5`: unit на multi-tool + continuation `model -> tools -> model`.
  - [ ] `testing.13.6`: functional на одновременный стриминг reasoning и text.
  - [ ] `testing.13.7`: functional на `rate_limit` countdown без persisted `kind:error`.
  - [ ] `testing.13.8`: functional на cancel во время tool execution без `kind:error`.
- [ ] Unit: `ErrorNormalizer`
  - [x] покрыть все AI SDK error classes и доменный mapping.
  - [x] покрыть извлечение `retry-after` + fallback.
- [ ] Unit: providers
  - [ ] OpenAI/Anthropic/Google parity для streaming/tool/error/usage.
  - [ ] >=2 tool calls в одном turn.
- [ ] Unit: `MainPipeline`
  - [x] порядок событий в loop и корректный persisted lifecycle `kind:tool_call` (`done=false -> done=true`).
  - [ ] cancel в разных фазах loop, включая in-flight tool jobs.
  - [ ] timeout = 300s и корректный mapping в доменную ошибку.
  - [ ] stub-execution: placeholder output для `tool_call` и финализация `done=true`.
- [ ] Unit: transport/event buses
  - [x] no-drop/no-coalescing regressions для `message.llm.reasoning.updated` и `message.llm.text.updated`.
  - [x] негативный контракт: отдельное realtime-событие `message.tool_call` отсутствует; UI зависит только от persisted snapshot-событий.
- [ ] Unit: renderer
  - [x] `IPCChatTransport` protocol ordering.
  - [x] persisted `kind:tool_call` корректно попадает в UI stream как tool-call part.
  - [x] стабильность mapping при mixed streaming events.
  - [x] `AgentMessage`/`Tool` рендер pending/success/error и корректный вывод input/output.
- [ ] Functional:
  - [ ] reasoning и text стримятся одновременно в одном `kind:llm`.
  - [ ] text стримится инкрементально.
  - [ ] multi-tool turn продолжается до финального ответа.
  - [ ] cancel во время tool execution не создаёт `kind:error`.
  - [ ] `tool_call` отображается как tool-call блок (`Tool`) с корректными input/output/status.
  - [ ] `tool_call` рендер корректен на основе только `message.created`/`message.updated`.
  - [ ] `tool_call` в режиме stub переходит `done=false -> done=true` и обновляет UI без отдельного сигнала.
  - [ ] статус/индикатор корректен для `llm/tool_call` + `done`.
  - [ ] `changedFields` передаётся в целевых `{entity}.updated` событиях и корректно используется UI.
  - [ ] chat-flow ошибки не дублируются toast-уведомлениями.
  - [ ] settings: security-текст и `Test Connection` UI контракт покрыты функциональными тестами.
  - [ ] helper `expectNoToastError` используется после ключевых действий (testing.12 contract).

---

## Фаза F: Финализация

- [ ] Перепроверить согласованность `requirements.md` vs `design.md` vs `tasks.md` (полнота, непротиворечивость, неизбыточность).
- [ ] `npm run validate`.
- [ ] После подтверждения пользователя: полный `npm run test:functional`.
- [ ] Обновить чекбоксы `tasks.md` по факту выполнения.

---

## Definition of Done

- [ ] AI SDK Core/UI реально используются как основной стек в main/renderer без дублирующей кастомной оркестрации.
- [ ] Специализированные ошибки полностью определяются через AI SDK errors + доменный normalizer.
- [ ] Stream Protocol реализован корректно, без дублей и без потерь чанков.
- [ ] Tool loop работает end-to-end (`model -> tools -> model`) для всех провайдеров.
- [x] Tool-call UI работает полностью через persisted сообщения и snapshot-события без зависимости от `message.tool_call`.
- [x] Отдельное realtime-событие `message.tool_call` удалено из shared events/types/constants, IPC bridge и unit-тестов.
- [ ] `payload.data.text` остаётся canonical финальным ответом.
- [ ] `npm run validate` и полный `npm run test:functional` проходят.

---

## Дополнительный To Do (по результатам проверки)

- [x] Перевести текущий mapping `tool_call` с text-summary на полноценные AI SDK tool parts (`tool-input-*` / `tool-output-*`) в `messageMapper` и/или `IPCChatTransport`.
- [x] Добавить unit-тесты на формирование именно tool parts (а не text part) для persisted `kind:tool_call`.
- [x] Добавить функциональный сценарий на отображение historical `llm` сообщений после миграции `013` (каноничный рендер из `data.text` без `data.action` fallback).
- [x] После внедрения tool parts синхронизировать рендер `AgentMessage`/`Tool` так, чтобы UI использовал единый контракт tool-part без дублирующих путей.

### Отдельные шаги исправления

- [x] Шаг 1. Реализовать AI SDK tool parts для persisted `kind:tool_call` (убрать text-summary путь).
- [x] Шаг 2. Добавить/обновить unit-тесты, проверяющие именно tool parts контракт.
- [x] Шаг 3. Добавить functional-тест на исторические `llm` после миграции `013` (рендер только из `data.text`).
- [x] Шаг 4. Привести `AgentMessage`/`Tool` к единому пути рендера по tool parts и удалить дубли.
