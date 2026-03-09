# Список Задач: LLM Integration — Issue #51 (`final_answer`)

## Обзор

Цель: привести систему в соответствие задаче #51 — добавить поддержку тулы `final_answer`, зафиксировать её контракт в спеках/дизайне, реализовать логику статуса `completed`, обновить промпт и покрыть изменения модульными и функциональными тестами.

**Текущий статус:** Фаза 8 — В работе

---

## Фаза 1: Спеки и дизайн (сначала)

- [x] Обновить `docs/specs/llm-integration/requirements.md`:
  - [x] Добавить явный контракт тулы `final_answer` (назначение, структура аргументов, условия вызова).
  - [x] Зафиксировать, что `final_answer` переводит диалог в статус `completed`.
  - [x] Зафиксировать поведение при отсутствии `final_answer`: turn может завершиться `kind: llm` с `done=true`, но статус остаётся `awaiting-response`.
  - [x] Обновить список функциональных тестов под новый контракт.
- [x] Обновить `docs/specs/llm-integration/design.md`:
  - [x] Описать место `final_answer` в pipeline (`model -> tool_call(final_answer) -> final persisted state`).
  - [x] Уточнить, как `final_answer` сохраняется в `messages` (kind/payload/done/reply_to_message_id).
  - [x] Описать влияние на stream lifecycle и завершение ответа.
- [x] Обновить `docs/specs/agents/requirements.md`:
  - [x] Зафиксировать правило перехода агента в `completed`, связанное с `final_answer`.
  - [x] Зафиксировать ожидания UI для статуса `completed` (иконки/лейблы/доступность действий).
- [x] Обновить `docs/specs/agents/design.md`:
  - [x] Обновить алгоритм `computeAgentStatus()` с явной веткой `completed` по `final_answer`.
  - [x] Уточнить источники данных для вычисления статуса (только persisted messages).
- [x] При необходимости синхронизировать `docs/specs/realtime-events/{requirements,design}.md`:
  - [x] Обновить контракт snapshot-полей/`changedFields`, если меняется сигнализация перехода в `completed`.
- [x] Обновить этот `tasks.md` по факту реализации.

---

## Фаза 2: Реализация кода

- [x] Добавить системную тулу `final_answer` в orchestration layer:
  - [x] Подключить definition тулы в pipeline/tool registry.
  - [x] Включить strict-схему структуры аргументов для этой тулы.
- [x] Реализовать обработку вызова `final_answer`:
  - [x] Persist `kind: tool_call` для `final_answer` с корректным lifecycle (`done=false -> done=true` либо согласованный целевой путь).
  - [x] Зафиксировать финальный текст ответа в `tool_call(final_answer).arguments.text`.
  - [x] Обеспечить strict-валидацию контракта и retry/repair через SDK при нарушении лимитов.
  - [x] Корректно завершать turn в pipeline без legacy fallback.
- [x] Обновить prompt/prompt builder:
  - [x] Добавить инструкцию модели, когда и как вызывать `final_answer`.
  - [x] Исключить конфликтующие или устаревшие инструкции.
- [x] Обновить вычисление статусов:
  - [x] Добавить/активировать правило вычисления `completed` из persisted-сообщений `final_answer`.
  - [x] Проверить, что текущие правила `in-progress/awaiting-response/error/new` не ломаются.
- [x] Проверить renderer mapping:
  - [x] Убедиться, что рендер `tool_call(final_answer)` и streaming/final `kind: llm` текста соответствует целевой модели.
  - [x] Убедиться, что нет legacy-путей, противоречащих новому контракту.

---

## Фаза 3: Обновление модульных тестов

- [x] `tests/unit/agents/MainPipeline.test.ts`:
  - [x] Добавить сценарий вызова `final_answer` с корректным завершением turn.
  - [x] Проверить persist lifecycle сообщения `tool_call(final_answer)`.
  - [x] Проверить запись `arguments.text` и обработку финальной ошибки после SDK retry.
- [x] `tests/unit/agents/PromptBuilder.test.ts`:
  - [x] Проверить наличие и корректность инструкции про `final_answer`.
- [x] `tests/unit/agents/AgentManager.test.ts`:
  - [x] Добавить/обновить кейсы вычисления `completed` на основе `final_answer`.
  - [x] Проверить, что соседние статусы не деградируют.
- [x] `tests/unit/components/agents/AgentMessage.test.tsx` и связанные renderer unit:
  - [x] Проверить рендер `tool_call(final_answer)` и финального состояния.
  - [x] Проверить рендер `message-completed-badge` и `message-completed-summary`.
  - [x] Проверить рендер completion summary для валидного `final_answer`.
  - [x] Проверить отсутствие regressions в обычных `tool_call`.
- [x] `tests/unit/components/agents-status-colors.test.tsx`:
  - [x] Проверить визуальные атрибуты `completed`.

---

## Фаза 4: Обновление/добавление функциональных тестов

- [x] `tests/functional/llm-chat.spec.ts`:
  - [x] Добавить сценарий, где модель завершает через `final_answer`.
  - [x] Проверить, что пользователь видит корректный финальный ответ.
  - [x] Проверить, что статус агента становится `completed`.
- [x] `tests/functional/agent-status-calculation.spec.ts`:
  - [x] Добавить сценарий вычисления `completed` после `final_answer`.
- [x] `tests/functional/agent-status-all-places.spec.ts`:
  - [x] Проверить отображение `completed` во всех ключевых местах UI.
- [x] Негативные functional кейсы:
  - [x] Без `final_answer` статус не должен переходить в `completed`.
  - [x] При невалидном `final_answer` срабатывает retry/repair и при исчерпании лимита создаётся `kind:error`.
  - [x] Ошибки/отмена не должны ложно переводить агента в `completed`.

---

## Фаза 5: Валидация

- [x] Прогнать релевантные unit тесты по затронутым модулям.
- [x] Прогнать `npm run validate`.
- [ ] После подтверждения пользователя — полный прогон `npm run test:functional`.

---

## Фаза 6: Корректировка final_answer контракта (strict + retry)

- [x] Обновить спеки и дизайн под новую семантику `final_answer`:
  - [x] Основной ответ пользователя остаётся в `kind: llm` (`data.text`).
  - [x] `final_answer` — completion summary (не дублирует полный ответ).
  - [x] Лимиты `text`/`summary_points` обязательны по strict-schema инструмента.
- [x] Перенести retry/repair для невалидного `final_answer` на AI SDK (`maxRetries` + strict tools).
- [x] Упростить `MainPipeline`: оставить только доменный маппинг финальной ошибки в `kind:error`.
- [x] Обновить промпт `FinalAnswerFeature`:
  - [x] Явно запретить дублирование полного ответа в `final_answer.text`.
  - [x] Зафиксировать лимиты `text`/`summary_points`.
- [x] Обновить renderer mapping/компоненты:
  - [x] Убрать fallback для пустого `final_answer.text` (невалидный путь обрабатывается в pipeline).
  - [x] Оставить `final_answer` как completion summary + `Completed` badge.
- [x] Добавить/обновить unit тесты:
  - [x] `MainPipeline`: финальная ошибка провайдера после SDK retry -> `kind:error`.
  - [x] `PromptBuilder`: обновлённая инструкция и лимиты schema.
  - [x] renderer tests: completion summary без fallback-пути.
- [x] Добавить/обновить functional тесты:
  - [x] сценарий невалидного `final_answer` с последующим успешным retry.
  - [x] сценарий исчерпания retry и показа `kind:error`.

---

## Фаза 7: Согласованность границ спецификаций

- [x] Зафиксировать границу ответственности между спеками:
  - [x] `llm-integration` описывает только runtime-логику взаимодействия с LLM (без UI-описаний).
  - [x] `agents` описывает только UI/рендер и статусную визуализацию persisted данных (без model/pipeline логики).
- [x] Удалить из `llm-integration` интерфейсные детали и оставить только контракты событий/данных/ошибок/flow.
- [x] Удалить из `agents` runtime-логику LLM (retry/repair/валидация tool-контрактов на стороне модели).
## Фаза 8: Приведение внешнего вида и поведения tool-call к новым требованиям

- [ ] Синхронизировать UI-реализацию `tool_call(final_answer)` с текущими спеками `agents`:
  - [ ] Заголовок `"Final Answer"`: текст из `final_answer.text` или fallback `Done`.
  - [ ] Иконка в заголовке: `Check` без круга.
  - [ ] Тело: только `summary_points`, элементы с `Check` в зелёном круге.
  - [ ] КОГДА `summary_points` пустой/отсутствует — блок неколлапсируемый (без toggle).
- [ ] Убрать legacy UI-пути рендера `final_answer` (badge/summary-варианты, не соответствующие текущему контракту).
- [ ] Добавить/обновить unit-тесты renderer под целевое поведение `Final Answer`:
  - [ ] Проверка fallback `Done` при отсутствии `text`.
  - [ ] Проверка отсутствия toggle при пустом `summary_points`.
  - [ ] Проверка корректных `data-testid` для блока, хедера, title, check, summary, toggle.
- [ ] Добавить/обновить functional-тесты под целевое поведение `Final Answer` в чате.
- [ ] Привести UI auth-error диалога к `agents.4.10.3-4.10.5`:
  - [ ] Фиксированный порядок кнопок: сначала `Open Settings`, затем `Retry`.
  - [ ] Визуальные варианты: `Open Settings` — `outline`, `Retry` — `default`.
  - [ ] При нажатии `Retry` текущий error-диалог скрывается до старта повторного запроса.
- [ ] Добавить/обновить unit-тесты для auth-error диалога:
  - [ ] Проверка наличия двух действий (`Open Settings`, `Retry`).
  - [ ] Проверка порядка кнопок и их variants.
  - [ ] Проверка скрытия диалога перед `retryLast(...)`.
- [ ] Добавить/обновить functional-тесты auth-error flow:
  - [ ] Проверка порядка кнопок `Open Settings` -> `Retry`.
  - [ ] Проверка поведения `Retry` (диалог скрывается перед повтором).

## Фаза 9: Runtime-контракт `final_answer` (default values) и трассировка требований

- [ ] Привести runtime-обработку `final_answer` к `llm-integration.9.5.1.2`:
  - [ ] При отсутствии `text` не выполнять автоподстановку в runtime-слое `llm-integration`.
  - [ ] При отсутствии `summary_points` нормализовать до `[]` в runtime-контракте.
- [ ] Добавить/обновить unit-тесты pipeline/mapper на default-значения `final_answer` (`text` отсутствует, `summary_points=[]`).
- [ ] Добавить/обновить functional-тест на сценарий `final_answer` без `summary_points` (успешный `completed` без ошибок контракта).
- [ ] Синхронизировать таблицу покрытия требований в `docs/specs/llm-integration/design.md` с актуальным `requirements.md` (включая `llm-integration.7`).

---

## Фаза 10: Расширение тестового покрытия (приоритет unit)

- [ ] Добавить модульные тесты (`MainPipeline` / `PromptBuilder` / mappers) для `final_answer`:
  - [ ] `final_answer` без `text` (поле отсутствует) не ломает pipeline и не получает runtime-автоподстановку на LLM-слое.
  - [ ] `final_answer` без `summary_points` нормализуется до `[]` для runtime-контракта.
  - [ ] `final_answer` с пустым `summary_points` остаётся успешным `completed` (без перехода в `kind:error`).
  - [ ] Невалидные лимиты (`text > 300`, `summary_points > 10`, пункт `> 200`) приводят к retry/repair и корректной финальной ошибке при исчерпании.
- [ ] Добавить модульные тесты статусов (`AgentManager.computeAgentStatus`):
  - [ ] `tool_call(final_answer, done=true)` -> `completed`.
  - [ ] `tool_call(non-final, done=true)` -> `awaiting-response`.
  - [ ] `llm(done=true)` без `final_answer` -> `awaiting-response`.
  - [ ] `hidden=true` сообщения исключаются из расчёта статуса.
- [ ] Добавить модульные тесты renderer (`AgentMessage`/mapper):
  - [ ] Рендер `"Final Answer"` header: title из `final_answer.text`, fallback `Done`.
  - [ ] Рендер `summary_points` как списка пунктов с индикаторами.
  - [ ] Отсутствие toggle при пустом/отсутствующем `summary_points`.
  - [ ] Наличие и корректность `data-testid` для `message-final-answer-*`.
- [ ] Добавить модульные тесты transport/runtime синхронизации:
  - [ ] `message.llm.reasoning.updated`/`message.llm.text.updated` не дублируются snapshot-апдейтами.
  - [ ] `message.updated` с `hidden=true` корректно закрывает активный stream без `kind:error`.
  - [ ] `tool_call` обрабатывается только через persisted `message.created`/`message.updated`.
- [ ] Добавить функциональные тесты (`tests/functional/llm-chat.spec.ts`, `agent-status-calculation.spec.ts`):
  - [ ] `final_answer` с пустым `summary_points` (или отсутствующим) отображается как неколлапсируемый `"Final Answer"`.
  - [ ] `final_answer` без `text` показывает `Done` в заголовке.
  - [ ] `kind:error` auth-диалог: есть `Open Settings` + `Retry`, порядок `Open Settings` -> `Retry`, variants `outline/default`.
  - [ ] При `Retry` auth-ошибки диалог скрывается перед повторным запросом.
  - [ ] После `tool_call(final_answer, done=true)` статус в UI становится `completed` во всех местах.
- [ ] Добавить regression-набор после удаления legacy UI-путей:
  - [ ] Проверка, что `final_answer` больше не рендерится через старый `Completed badge`/legacy summary-блок.
  - [ ] Проверка, что обычные `tool_call` продолжают рендериться как tool-блоки без деградаций.

---

## Definition of Done

- [x] Спеки и дизайн обновлены под целевую модель `final_answer` без legacy/миграционных оговорок.
- [x] Pipeline поддерживает `final_answer` end-to-end в strict режиме.
- [x] Статус `completed` вычисляется и отображается по согласованному правилу.
- [x] Добавлены/обновлены модульные тесты для pipeline, статусов, промпта и renderer.
- [x] Добавлены/обновлены функциональные тесты для user-flow и статусов.
- [x] `npm run validate` проходит.
- [ ] (После отдельного подтверждения) полный `npm run test:functional` проходит.
- [x] Strict-schema `final_answer` в AI SDK + retry/repair policy реализованы и покрыты тестами.
- [ ] Внешний вид и поведение `tool_call(final_answer)` соответствуют текущим требованиям `agents` и покрыты unit/functional тестами.
- [ ] Runtime default-контракт `final_answer` (`text` отсутствует, `summary_points=[]`) реализован и покрыт тестами.
- [ ] Таблица покрытия требований в `llm-integration/design.md` синхронизирована с актуальными требованиями.
- [ ] Добавлен расширенный набор unit/functional тестов для `final_answer`, статусов, runtime-stream и error-actions без регрессий.
