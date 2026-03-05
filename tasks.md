# План приведения кода к спецификациям (полный анализ + чек-листы)

## 0) Режим выполнения

- **Plan approved:** `no`
- **Ограничение:** до явного согласования этот документ **не исполняется**.
- **Цель этого файла:** зафиксировать полный разбор текущего состояния и исчерпывающий план изменений кода/тестов/документации.

---

## 1) Что проанализировано

### 1.1 Спецификации

Прочитаны и сверены актуальные версии:

- `docs/specs/agents/requirements.md`
- `docs/specs/agents/design.md`
- `docs/specs/agents/tasks.md`
- `docs/specs/llm-integration/requirements.md`
- `docs/specs/llm-integration/design.md`
- `docs/specs/testing-infrastructure/requirements.md`
- `docs/specs/testing-infrastructure/design.md`

### 1.2 Код (main/renderer/shared)

Проверены ключевые точки, влияющие на done/hidden/status/reasoning/send-stop:

- `src/main/db/schema.ts`
- `src/main/MigrationRunner.ts`
- `src/main/DatabaseManager.ts`
- `src/main/db/repositories/MessagesRepository.ts`
- `src/main/agents/MessageManager.ts`
- `src/main/agents/AgentManager.ts`
- `src/main/agents/AgentIPCHandlers.ts`
- `src/main/agents/MainPipeline.ts`
- `src/shared/events/types.ts`
- `src/shared/utils/agentStatus.ts`
- `src/renderer/hooks/useAgentChat.ts`
- `src/renderer/lib/IPCChatTransport.ts`
- `src/renderer/components/agents/AgentChat.tsx`
- `src/renderer/components/agents/AgentMessage.tsx`

### 1.3 Тесты

Проверены текущие unit/functional тесты по критичным зонам:

- `tests/unit/agents/AgentManager.test.ts`
- `tests/unit/agents/MessageManager.test.ts`
- `tests/unit/db/repositories/MessagesRepository.test.ts`
- `tests/unit/components/agents/AgentChat.test.tsx`
- `tests/unit/hooks/useAgentChat.test.ts`
- `tests/unit/renderer/IPCChatTransport.test.ts`
- `tests/unit/agents/MainPipeline.test.ts`
- `tests/functional/llm-chat.spec.ts`
- `tests/functional/agent-status-calculation.spec.ts`
- `tests/functional/agent-status-indicators.spec.ts`

---

## 2) Критичные выводы анализа (текущее состояние)

## 2.1 Блокирующие рассинхроны со спеками

1. **Отсутствует поле `done` в текущей схеме сообщений в коде**
- В `src/main/db/schema.ts` у `messages` нет `done`.
- В миграциях (`migrations/001..010`) нет миграции добавления `done`.
- Это конфликтует с целевой моделью в `agents/llm-integration`.

2. **Статус агента сейчас вычисляется не по `done`, а по содержимому payload (`action`)**
- `src/main/agents/AgentManager.ts` использует `hasFinalAction(payloadJson)`.
- Спеки требуют алгоритм по последнему видимому сообщению и флагу `done`.

3. **Событийная модель сообщения не содержит `done`**
- `src/shared/events/types.ts` (`MessageSnapshot`) не включает `done`.
- Из-за этого renderer и тесты не могут строго опираться на завершённость LLM-сообщения.

4. **MainPipeline не выставляет done-семантику явно**
- Нет явной фиксации:
  - `llm` during stream => `done=false`
  - `llm` final => `done=true`
  - error message => `done=true`
  - interrupted partial llm => `hidden=true` + `done=false`

5. **Создание `reply_to_message_id` в IPC сейчас заглушка**
- В `AgentIPCHandlers.handleMessageCreate` сейчас `const replyToMessageId = ... ? null : null`.
- Нужна детерминированная логика по предыдущему сообщению (и спец-правила pipeline).

## 2.2 Частичные/локальные проблемы поведения

6. **Скрытие ошибок при новом user-сообщении по порядку действий не соответствует целевой строгой логике**
- Сейчас user-message создаётся, потом вызывается hide errors.
- Требуется зафиксировать и унифицировать ожидаемый порядок по обновлённым спекам.

7. **Транспорт/отображение ошибок могут расходиться по shape payload**
- В ряде мест ожидается `data.message`, в других — `data.error.message`.
- Нужна единая контрактная схема в main->renderer.

8. **Кнопка send/stop должна быть привязана к двум факторам (режим + текст), а не только к наличию submit-контрола**
- Визуальный режим уже завязан на `agent.status`.
- Нужно чётко зафиксировать и протестировать интерактивность send vs stop.

## 2.3 Проблемы покрытия тестами

9. **Нет плотного покрытия done-алгоритма статуса**
- Нет полной матрицы состояний `kind/hidden/done` (особенно для `llm done=false` vs `llm done=true`).

10. **Функциональные тесты статуса слишком общие**
- Текущие проверки статуса часто допускают диапазоны (`blue|sky` и т.п.) вместо строгих сценариев переходов.

11. **Недостаточная проверка контрактов main<->renderer для новых полей**
- Нет полной цепочки тестов «БД -> MessageManager -> IPC/Event -> hook -> UI» для `done`.

---

## 3) Целевая картина (что должно быть после реализации)

1. В БД `messages` есть `done` (`INTEGER NOT NULL DEFAULT 0`), корректно мигрирован и backfilled.
2. `done` проходит сквозным полем через repository/manager/event snapshot/renderer state.
3. Статус агента вычисляется **строго** по алгоритму из актуальных требований:
- если сообщений нет -> `new`
- исключить `hidden=true`
- после фильтрации пусто -> `new`
- last visible `error` -> `error`
- last visible `final_answer` -> `completed`
- last visible `user` -> `in-progress`
- last visible `llm done=false` -> `in-progress`
- last visible `llm done=true` -> `awaiting-response`
4. Pipeline корректно ведёт флаги `done/hidden` во всех успех/ошибка/abort ветках.
5. `reply_to_message_id` заполняется детерминированно.
6. Кнопка ввода работает по двухфакторному правилу:
- stop mode (`in-progress`) — всегда активна
- send mode (не `in-progress`) — активна только при непустом тексте
7. Тесты покрывают новую модель плотной матрицей unit + functional.

---

## 4) План изменений (пошагово, с чек-листами)

## Фаза A — Финализация спецификаций/дизайна перед кодом

### A.1 Проверка непротиворечивости требований (agents + llm-integration)

- [ ] Повторно свести пересечения `messages` schema между `agents/requirements.md` и `llm-integration/requirements.md`.
- [ ] Убедиться, что `reply_to_message_id` и `done` описаны без конфликтов и дублирования реализации.
- [ ] Убедиться, что алгоритм статуса задан одинаково в обеих спеках там, где он упоминается.
- [ ] Убедиться, что правило кнопки send/stop описано в терминах UI приложения (не абстрактно, без двусмысленности).

### A.2 Актуализация design-документов

- [ ] В `docs/specs/agents/design.md` закрепить итоговый статус-алгоритм и связь с `done`/`hidden`.
- [ ] В `docs/specs/llm-integration/design.md` закрепить полный lifecycle `done` для user/llm/error.
- [ ] В обоих design.md обновить таблицы покрытия требований (без пропусков).
- [ ] Убрать избыточности и взаимоисключающие формулировки.

### A.3 Актуализация task-трекинга feature

- [ ] Обновить `docs/specs/agents/tasks.md` по фактическому состоянию (что реально сделано в коде/тестах, что ещё нет).
- [ ] Убрать взаимоисключающие статусы по одним и тем же пунктам.

**Gate A:**
- [ ] Пользователь согласовал обновлённые спецификации/дизайн.

---

## Фаза B — Данные и миграции (`done` + контракты сообщений)

### B.1 Схема и миграция

- [ ] Добавить `done` в `src/main/db/schema.ts` (`boolean mode` + default false).
- [ ] Создать миграцию `011_add_done_to_messages.sql`:
  - [ ] `ALTER TABLE ... ADD COLUMN done INTEGER NOT NULL DEFAULT 0`
  - [ ] backfill по agreed-правилам
  - [ ] проверка idempotency/безопасности повторного запуска
- [ ] Обновить unit-тесты миграций:
  - [ ] `tests/unit/MigrationRunner.test.ts`
  - [ ] `tests/unit/DatabaseManager.test.ts`
  - [ ] Проверка, что после миграции `messages.done` существует и имеет `NOT NULL DEFAULT 0`.
  - [ ] Проверка backfill-логики для существующих строк (`error -> done=1`, остальные `done=0`).
  - [ ] Проверка, что повторный запуск миграций не ломает схему и не меняет уже корректные значения.

### B.2 Repository layer

- [ ] Расширить `MessagesRepository.create(...)` параметром `done` (дефолт по месту вызова, не внутри репозитория «магией»).
- [ ] Добавить/расширить методы для изменения done-статуса при update/hidden-flow.
- [ ] Проверить выборки last-message: нужна ли фильтрация `hidden` в конкретных сценариях статус-вычисления.
- [ ] Обновить `tests/unit/db/repositories/MessagesRepository.test.ts` матрицей `done`.
  - [ ] `create()` сохраняет переданное значение `done` для `user/llm/error`.
  - [ ] `listByAgent(includeHidden=false)` не возвращает hidden и не искажает `done`.
  - [ ] `listByAgent(includeHidden=true)` возвращает hidden + корректный `done`.
  - [ ] `hideErrorMessages()` скрывает только `kind:error`, не меняя `done`.
  - [ ] `setHidden()` скрывает сообщение, не меняя `done`.
  - [ ] `getLastByAgent()` возвращает фактически последнее сообщение по текущему правилу сортировки с корректным `done`.

### B.3 Event контракт

- [ ] Добавить `done: boolean` в `MessageSnapshot` (`src/shared/events/types.ts`).
- [ ] Проверить сериализацию/десериализацию во всех IPC/event местах.
- [ ] Обновить тесты контрактов/маппинга.
  - [ ] Unit: `MessageSnapshot` сериализуется с `done` для `message.created`.
  - [ ] Unit: `MessageSnapshot` сериализуется с `done` для `message.updated`.
  - [ ] Unit: отсутствие `done` в источнике обрабатывается fail-fast (либо явный default по контракту).

**Gate B:**
- [ ] Локально проходит `npm run test:unit -- tests/unit/MigrationRunner.test.ts tests/unit/DatabaseManager.test.ts tests/unit/db/repositories/MessagesRepository.test.ts`

---

## Фаза C — Main process бизнес-логика

### C.1 MessageManager

- [ ] `toEventMessage` прокидывает `done`.
- [ ] `create/update` поддерживают done-параметр без слома текущих вызовов.
- [ ] Скрытие ошибок (`hideErrorMessages`) и скрытие partial llm (`setHidden`) не теряют done-семантику.
- [ ] Unit-тесты `tests/unit/agents/MessageManager.test.ts`:
  - [ ] создание/обновление with done
  - [ ] события `message.updated` с done/hidden
  - [ ] `toEventMessage()` корректно пробрасывает `done=true/false`.
  - [ ] `create()` публикует `message.created` с `done` и `replyToMessageId`.
  - [ ] `update()` публикует `message.updated` без потери `done`.
  - [ ] `hideErrorMessages()` публикует апдейты только для реально изменённых сообщений.

### C.2 AgentManager: статус строго по алгоритму

- [ ] Переписать вычисление статуса на `last visible message + done`.
- [ ] Удалить зависимость от `hasFinalAction(payloadJson)` для статуса.
- [ ] Учесть `error`, `final_answer`, `user`, `llm done=false/true`, пустую историю, скрытые сообщения.
- [ ] Плотно обновить `tests/unit/agents/AgentManager.test.ts` матрицей:
  - [ ] no messages
  - [ ] only hidden messages
  - [ ] last visible user
  - [ ] last visible llm done=false
  - [ ] last visible llm done=true
  - [ ] last visible error
  - [ ] last visible final_answer
  - [ ] mixed history: последний по времени hidden `error`, предыдущий visible `llm done=true` -> `awaiting-response`.
  - [ ] mixed history: visible `user` после `llm done=true` -> `in-progress`.
  - [ ] malformed payload у `llm` не влияет на статус, если `done` задан явно.
  - [ ] неизвестный `kind` у последнего visible сообщения -> ожидаемый fallback-статус по контракту.

### C.3 AgentIPCHandlers

- [ ] Исправить вычисление `replyToMessageId` (не заглушка).
- [ ] Проверить порядок действий на user send (hide errors / create user / cancel previous / start new pipeline) в соответствии с финальной спеки.
- [ ] Проверить cancel/retry каналы и единый shape ошибок.
- [ ] Обновить `tests/unit/agents/AgentIPCHandlers.test.ts`.
  - [ ] `messages:create(kind=user)` выставляет корректный `replyToMessageId` (null для первого, id предыдущего для остальных).
  - [ ] `messages:create(kind=user)` выполняет согласованный порядок: hide/cancel/create/run.
  - [ ] при `messages:cancel` не создаётся `kind:error`.
  - [ ] ошибки pipeline не ломают IPC-ответ и не приводят к дублям сообщений.

### C.4 MainPipeline

- [ ] Установить done по стадиям:
  - [ ] llm create on first reasoning -> `done=false`
  - [ ] llm update during reasoning -> `done=false`
  - [ ] llm finalize with action -> `done=true`
  - [ ] error messages -> `done=true`
  - [ ] interrupted partial llm -> `hidden=true`, `done=false`
- [ ] Проверить retry/timeout/abort ветки на корректное состояние сообщений.
- [ ] Проверить, что при штатной отмене error-message не создаётся.
- [ ] Обновить `tests/unit/agents/MainPipeline.test.ts` детальными сценариями done/hidden.
  - [ ] no-reasoning path: `llm` создаётся сразу с `action`, `done=true`.
  - [ ] reasoning-stream path: промежуточные апдейты `done=false`, финал `done=true`.
  - [ ] abort до первого чанка: `llm` не создаётся.
  - [ ] abort после первого чанка: `llm.hidden=true`, `llm.done=false`, без `error`.
  - [ ] provider error до первого чанка: создаётся только `error done=true`.
  - [ ] provider error после начала stream: partial `llm hidden=true done=false` + `error done=true`.
  - [ ] timeout классифицируется как timeout и создаёт корректный `error` payload/type.
  - [ ] retry invalid structured output не оставляет «висячих» `llm done=false` после исчерпания попыток.
  - [ ] `reply_to_message_id` у pipeline-сообщений равен `userMessageId`.

**Gate C:**
- [ ] Локально проходит набор unit по main-process (`AgentManager`, `MessageManager`, `AgentIPCHandlers`, `MainPipeline`).

---

## Фаза D — Renderer и UI-поведение

### D.1 Transport + hook + mapper

- [ ] Прокинуть `done` через `messageMapper` и клиентскую модель raw сообщений.
- [ ] Привести обработку ошибок к единому payload shape.
- [ ] В `useAgentChat` убедиться, что hidden-сообщения удаляются консистентно и не «всплывают» после reload.
- [ ] Обновить `tests/unit/renderer/IPCChatTransport.test.ts` и `tests/unit/hooks/useAgentChat.test.ts`.
  - [ ] Transport: завершает поток только на `llm done=true` (или hidden/abort), а не по первому `message.updated`.
  - [ ] Transport: корректно читает ошибку из `data.error.message`.
  - [ ] Hook: `MESSAGE_UPDATED hidden=true` удаляет сообщение из `rawMessages` и `UIMessage`.
  - [ ] Hook: `done`-апдейты не теряются при последовательных `message.updated`.
  - [ ] Hook: при переключении агента состояние не подмешивает события другого `agentId`.

### D.2 AgentChat / send-stop логика

- [ ] Зафиксировать двухфакторный алгоритм активности кнопки:
  - [ ] если mode=stop -> always enabled
  - [ ] если mode=send -> enabled только при непустом тексте
- [ ] Убедиться, что режим (`send` vs `stop generation`) определяется только статусом агента.
- [ ] Проверить Shift+Enter поведение (newline) и Enter submit в актуальной обвязке.
- [ ] Обновить `tests/unit/components/agents/AgentChat.test.tsx`.
  - [ ] `status=in-progress` -> видна stop-кнопка, она активна при пустом и непустом input.
  - [ ] `status!=in-progress` + пустой input -> send-кнопка неактивна.
  - [ ] `status!=in-progress` + непустой input -> send-кнопка активна.
  - [ ] переключение статуса `in-progress <-> awaiting-response` мгновенно меняет режим кнопки.
  - [ ] Shift+Enter оставляет сообщение в textarea и не вызывает отправку.
  - [ ] Enter отправляет только при активной send-кнопке.

### D.3 AgentMessage / reasoning блок

- [ ] Проверить текущий reasoning UI на соответствие целевой картине (без лишних индикаторов, без дубликатов).
- [ ] Убедиться, что триггер содержит ожидаемый состав и не конфликтует с avatar-правилом в спеках.
- [ ] Доработать unit-тесты по trigger/content/streaming состояниям.
  - [ ] нет дублирования reasoning-текста при серии delta/snapshot апдейтов.
  - [ ] при `llm` без `action.content` и с reasoning нет дополнительного нижнего loading-индикатора.
  - [ ] trigger-состав стабилен: иконка приложения + текст + chevron.
  - [ ] для `kind:llm` с reasoning не показывается отдельный верхний avatar вне trigger.

**Gate D:**
- [ ] Локально проходят unit-тесты renderer-блока.

---

## Фаза E — Функциональные тесты (плотное покрытие)

### E.1 Статусы и done

- [ ] Расширить `tests/functional/agent-status-calculation.spec.ts`:
  - [ ] строгая проверка `in-progress` на `llm done=false` (между reasoning и финальным действием)
  - [ ] переход в `awaiting-response` только после `done=true`
  - [ ] hidden сообщения исключаются из расчёта

### E.2 Чатовый поток и ошибки

- [ ] Расширить `tests/functional/llm-chat.spec.ts`:
  - [ ] сценарий прерывания в mid-stream -> partial llm hidden + no error bubble
  - [ ] сценарий timeout/error -> корректный error dialog и done semantics в истории
  - [ ] retry flow (auth/invalid structured output) + скрытие старой ошибки

### E.3 Кнопка send/stop

- [ ] Добавить функциональные проверки:
  - [ ] stop всегда активна в `in-progress`
  - [ ] send неактивна без текста
  - [ ] send активируется при вводе
  - [ ] Shift+Enter добавляет перенос без отправки

### E.4 Правила testing-infrastructure

- [ ] Проверить отсутствие `waitForTimeout` для ожидания DOM (кроме допустимых кейсов с комментарием).
- [ ] Добавить проверки отсутствия toast-error после ключевых действий (`testing.12`).

**Gate E:**
- [ ] Точечно пройдены изменённые functional сценарии.

---

## Фаза F — Полная валидация и стабилизация

- [ ] Запустить `npm run validate`.
- [ ] Исправить регрессии type/lint/unit.
- [ ] Обновить таблицы покрытия в design.md под финальный набор тестов.
- [ ] Финально сверить: спеки полные, непротиворечивые, не избыточные.

---

## 5) Детальный checklist трассировки «требование -> код -> тест»

## 5.1 done lifecycle

- [ ] requirement: done хранится в БД
- [ ] code: schema + migration + repository
- [ ] test(unit): migration/repository/message manager
- [ ] test(functional): status transition based on done

## 5.2 status algorithm

- [ ] requirement: исключаем hidden
- [ ] code: AgentManager status computation
- [ ] test(unit): full matrix
- [ ] test(functional): visible UI status transitions

## 5.3 reply_to_message_id

- [ ] requirement: first null, остальные на предыдущий message id
- [ ] code: IPC create + pipeline create paths
- [ ] test(unit): IPC/pipeline assertions
- [ ] test(functional): retry/cancel paths keep linkage

## 5.4 send/stop button behavior

- [ ] requirement: mode by status + active by text/non-text rules
- [ ] code: AgentChat input controls
- [ ] test(unit): component interaction
- [ ] test(functional): end-to-end behavior

## 5.5 reasoning display contract

- [ ] requirement: reasoning trigger/content composition and streaming behavior
- [ ] code: AgentMessage + AgentReasoningTrigger + stream flag source
- [ ] test(unit): no duplicate indicators, no regressions
- [ ] test(functional): visible reasoning during stream

---

## 6) Риски и меры снижения

1. **Риск:** миграция `done` сломает существующие локальные БД
- **Мера:** идемпотентный SQL + unit tests мигратора + smoke проверка на test DB.

2. **Риск:** изменение статуса вызовет каскадные падения UI/functional
- **Мера:** сначала unit matrix статусов, потом functional.

3. **Риск:** hidden/done race condition в streaming/cancel
- **Мера:** детерминированные тесты MainPipeline с управляемыми chunk/abort моментами.

4. **Риск:** drift между двумя спеками (`agents` и `llm-integration`)
- **Мера:** обязательный cross-check и единый traceability checklist (раздел 5).

---

## 7) Порядок выполнения после согласования

1. Фаза A (спеки/дизайн) — обязательный старт.
2. Фаза B (схема/миграции).
3. Фаза C (main-process).
4. Фаза D (renderer/UI).
5. Фаза E (functional).
6. Фаза F (validate + финальная сверка).

---

## 8) Definition of Done по этой задаче

- [ ] Все актуальные спеки и design файлы консистентны и без внутренних конфликтов.
- [ ] Код полностью следует алгоритмам `done/hidden/status/reply_to_message_id`.
- [ ] Кнопка send/stop работает строго по требованиям.
- [ ] Reasoning блок отображается корректно и без визуальных дубликатов.
- [ ] Плотное покрытие unit + functional добавлено и стабильно.
- [ ] `npm run validate` проходит.
- [ ] Сводка с traceability предоставлена пользователю.
