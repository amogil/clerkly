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
- [ ] UI рендер tool-call полностью зависит от persisted `kind:tool_call` + `message.created`/`message.updated` (single source of truth).
- [ ] Канонический финал ответа хранится в `payload.data.text`.
- [ ] Согласованное статусное правило: `kind='llm' && done=true -> awaiting-response`.
- [ ] Для persisted `kind='tool_call'` статус вычисляется по `done`:
  - [ ] `done=false -> in-progress`
  - [ ] `done=true -> awaiting-response`

---

## Фаза B1: Контракты ошибок AI SDK

- [ ] Ввести единый `ErrorNormalizer` в main-process (`src/main/llm/*`):
  - [ ] `APICallError` -> классификация по `statusCode`:
    - [ ] `401/403 -> auth`
    - [ ] `429 -> rate_limit` (с извлечением `retry-after` / fallback parsing)
    - [ ] `5xx -> provider`
  - [ ] timeout/abort -> `timeout`
  - [ ] transport-level failures без `statusCode` -> `network`
  - [ ] `RetryError` после исчерпания попыток -> `provider`
  - [ ] tool ошибки (`NoSuchToolError`, `InvalidToolInputError`, `ToolExecutionError`, `ToolCallRepairError`) -> `tool`
  - [ ] stream protocol ошибки (`UIMessageStreamError`) -> `protocol`
- [ ] Зафиксировать и реализовать retry policy из `llm-integration/design.md`:
  - [ ] retry только до первого meaningful chunk;
  - [ ] максимум 1 retry на запуск `MainPipeline.run()`;
  - [ ] после начала стрима retry не выполняется.
- [ ] Синхронизировать `ErrorNormalizer` с UI контрактом ошибок:
  - [ ] `kind:error` payload
  - [ ] rate-limit countdown (`agent.rate_limit`)
  - [ ] диагностические события (`llm.pipeline.diagnostic`)
- [ ] Удалить ad-hoc ветки ошибок, дублирующие ErrorNormalizer.

## Фаза B1.1: Конформанс ошибок и каналов уведомлений (cross-spec)

- [ ] Привести runtime к `error-notifications` целевой модели:
  - [ ] Chat-flow ошибки (`auth/network/provider/timeout/tool/protocol`) показываются только в чате (`kind:error`), без toast-дубликатов.
  - [ ] `rate_limit` остаётся transient banner (`agent.rate_limit`) без persisted `kind:error`.
  - [ ] Background/IPC ошибки вне chat-flow показываются в toast через `callApi()` (если `silent !== true`).
  - [ ] Race/cancelled ошибки логируются и не показываются пользователю.
- [ ] Синхронизировать тексты ошибок в `LLMError`/renderer диалогах с `llm-integration.3.5`.
- [ ] Обновить unit-тесты:
  - [ ] `tests/unit/utils/apiWrapper.test.ts` (chat suppression vs background toast).
  - [ ] `tests/unit/agents/MainPipeline.test.ts` (tool/protocol error mapping, no toast assumptions).

## Фаза B1.2: UX-контракты ошибок в чате

- [ ] `src/renderer/components/agents/*`:
  - [ ] Для `auth`/missing key ошибок показать действия `Open Settings` (primary) и `Retry` (secondary).
  - [ ] `Retry` скрывает текущий `kind:error` и повторяет запрос по последнему `kind:user`.
  - [ ] Диалоги ошибок/уведомлений занимают всю ширину области чата.
- [ ] `src/main/agents/AgentIPCHandlers.ts`:
  - [ ] Реализовать `messages:retry-last` и `messages:cancel-retry` под контракт rate-limit.
  - [ ] Для `Cancel` в rate-limit удалять исходное `kind:user` сообщение из БД и чата.
- [ ] Functional:
  - [ ] Кнопки `Open Settings`/`Retry` и их приоритеты.
  - [ ] `Retry` сценарий для auth/missing-key ошибок.
  - [ ] `Cancel` сценарий в rate-limit с удалением исходного user message.

---

## Фаза B2: Main process на AI SDK Core

- [ ] `src/main/llm/LLMProviderFactory.ts` и типы:
  - [ ] Проверить, что все провайдеры создаются как AI SDK adapters.
  - [ ] Удалить остаточные structured-output/legacy типы из chat-flow.
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
  - [ ] Гарантировать корректный persisted lifecycle для `kind:tool_call` (create/update, done=false/true, full arguments).
  - [ ] Удалить публикацию/зависимость от отдельного realtime-события `message.tool_call`; использовать только persisted `message.created`/`message.updated`.
  - [ ] Гарантировать корректный cancel cleanup (idempotent для in-flight jobs).
- [ ] `src/main/tools/*`:
  - [ ] Зафиксировать policy layer: timeout/retry/concurrency cap.
  - [ ] Обеспечить deterministic merge результатов tool batch.
  - [ ] До появления реального executor реализовать stub-путь: `tool_call` получает placeholder output и переводится в `done=true`.

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
  - [ ] Подтвердить правило `kind='llm' && done=true -> awaiting-response`.
  - [ ] Для persisted `kind='tool_call'` реализовать/проверить: `done=false -> in-progress`, `done=true -> awaiting-response`.
- [ ] `src/main/agents/MessageManager.ts` + snapshot converters:
  - [ ] Подтвердить canonical финальный текст только в `payload.data.text`.
  - [ ] Убедиться, что `kind:error`, `kind:tool_call`, `hidden=true` исключаются из model history.
- [ ] `src/shared/events/types.ts`:
  - [ ] Удалить типы/константы/классы `message.tool_call` из целевого runtime-контракта.
  - [ ] Проверить optional `changedFields` формат для `{entity}.updated` событий.

---

## Фаза C1: Stream Protocol / UIMessage stream

- [ ] Привести `src/renderer/lib/IPCChatTransport.ts` к тонкому protocol-adapter:
  - [ ] Оставить только трансляцию доменных realtime-событий в `UIMessageChunk`.
  - [ ] Убрать лишнюю бизнес-логику из transport (вынести в main/useChat lifecycle).
  - [ ] Зафиксировать корректный порядок chunk-ов:
    - [ ] `start -> start-step -> reasoning/text deltas -> finish-step -> finish`
  - [ ] Гарантировать отсутствие дубликатов между delta-событиями и `message.updated` snapshot.
  - [ ] Гарантировать корректное завершение стрима при cancel/hidden/done.
- [ ] Добавить protocol guards:
  - [ ] controlled fail на invalid sequence (с диагностикой, без падения процесса).

## Фаза C1.1: Realtime-events conformance

- [ ] `src/main/events/MainEventBus.ts` и bridge:
  - [ ] Для `agent.updated`, `message.updated`, `user.profile.updated` передавать `changedFields` в формате spec (`dot.path`, unique, sorted) при наличии диффа.
  - [ ] Сохранить поведение timestamp (`<` only outdated) для стриминговых событий.
- [ ] `src/renderer/events/RendererEventBus.ts`:
  - [ ] Проверить отсутствие потерь/dedupe для `message.llm.reasoning.updated` и `message.llm.text.updated` в одном timestamp.
- [ ] Unit-тесты:
  - [ ] `tests/unit/events/MainEventBus.test.ts` — `changedFields` формат и сортировка.
  - [ ] `tests/unit/events/RendererEventBus.test.ts` — non-coalescing чанков с равным timestamp.

---

## Фаза C2: useChat / transport lifecycle и уменьшение костылей

- [ ] `src/renderer/hooks/useAgentChat.ts`:
  - [ ] Минимизировать дублирующую синхронизацию `rawMessages` и `messages` (оставить только обязательные metadata-cases).
  - [ ] Опираться на lifecycle `useChat` (`status`, `stop`, completion/error hooks).
  - [ ] Убрать лишние ручные костыли hidden/update, если покрываются stream lifecycle.
- [ ] `src/renderer/lib/messageMapper.ts`:
  - [ ] Проверить стабильный mapping persisted snapshot -> UIMessage (без legacy fallback).
- [ ] `src/renderer/components/agents/AgentMessage.tsx` и `AgentChat.tsx`:
  - [ ] Подтвердить соответствие AI Elements parts/status.
  - [ ] Подтвердить отображение `tool_call` через AI Elements `Tool` компонент.
  - [ ] Удалить fallback чтения ответа из `data.action.content`; использовать только `payload.data.text`.
- [ ] `src/renderer/components/ai-elements/tool.tsx`:
  - [ ] Подключить/обновить `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput` по контракту [AI Elements Tool](https://elements.ai-sdk.dev/components/tool).
  - [ ] Обеспечить отображение `toolName`, аргументов (`input`) и результата/ошибки (`output`) для persisted `kind:tool_call`.

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
  - [ ] корректно маппить persisted `kind:tool_call` в UIMessage tool parts.
  - [ ] исключить дублирование tool-call частей между `message.created` и `message.updated`.

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

---

## Фаза E: Тестирование (максимальное покрытие)

- [ ] Полный конформанс с `testing.13` (AI SDK chat-flow contracts):
  - [ ] `testing.13.1`: unit на sequence `start -> start-step -> delta -> finish-step -> finish` в `IPCChatTransport`.
  - [ ] `testing.13.2`: unit на отсутствие дублей между delta и `message.updated` snapshot.
  - [ ] `testing.13.3`: unit на рендер persisted `kind:tool_call` как tool-call блока.
  - [ ] `testing.13.4`: unit на `ErrorNormalizer` (auth/rate_limit/provider/network/timeout/tool/protocol).
  - [ ] `testing.13.5`: unit на multi-tool + continuation `model -> tools -> model`.
  - [ ] `testing.13.6`: functional на одновременный стриминг reasoning и text.
  - [ ] `testing.13.7`: functional на `rate_limit` countdown без persisted `kind:error`.
  - [ ] `testing.13.8`: functional на cancel во время tool execution без `kind:error`.
- [ ] Unit: `ErrorNormalizer`
  - [ ] покрыть все AI SDK error classes и доменный mapping.
  - [ ] покрыть извлечение `retry-after` + fallback.
- [ ] Unit: providers
  - [ ] OpenAI/Anthropic/Google parity для streaming/tool/error/usage.
  - [ ] >=2 tool calls в одном turn.
- [ ] Unit: `MainPipeline`
  - [ ] порядок событий в loop и корректный persisted lifecycle `kind:tool_call` (`done=false -> done=true`).
  - [ ] cancel в разных фазах loop, включая in-flight tool jobs.
  - [ ] timeout = 300s и корректный mapping в доменную ошибку.
  - [ ] stub-execution: placeholder output для `tool_call` и финализация `done=true`.
- [ ] Unit: transport/event buses
  - [ ] no-drop/no-coalescing regressions для `message.llm.reasoning.updated` и `message.llm.text.updated`.
  - [ ] негативный контракт: отдельное realtime-событие `message.tool_call` отсутствует; UI зависит только от persisted snapshot-событий.
- [ ] Unit: renderer
  - [ ] `IPCChatTransport` protocol ordering.
  - [ ] persisted `kind:tool_call` корректно попадает в UI stream как tool-call part.
  - [ ] стабильность mapping при mixed streaming events.
  - [ ] `AgentMessage`/`Tool` рендер pending/success/error и корректный вывод input/output.
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
- [ ] Tool-call UI работает полностью через persisted сообщения и snapshot-события без зависимости от `message.tool_call`.
- [ ] Отдельное realtime-событие `message.tool_call` удалено из shared events/types/constants, IPC bridge и unit-тестов.
- [ ] `payload.data.text` остаётся canonical финальным ответом.
- [ ] `npm run validate` и полный `npm run test:functional` проходят.
