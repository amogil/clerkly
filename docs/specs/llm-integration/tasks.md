# Список Задач: LLM Integration — Issue #51 (`final_answer`)

## Обзор

Цель: привести систему в соответствие задаче #51 — добавить поддержку тулы `final_answer`, зафиксировать её контракт в спеках/дизайне, реализовать логику статуса `completed`, обновить промпт и покрыть изменения модульными и функциональными тестами.

**Текущий статус:** Фаза 6 — Завершена (ожидается только полный functional прогон)

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
  - [x] Включить strict-схему структуры аргументов для этой тулы (без блокировки ответа при нарушении лимитов `summary_points`).
- [x] Реализовать обработку вызова `final_answer`:
  - [x] Persist `kind: tool_call` для `final_answer` с корректным lifecycle (`done=false -> done=true` либо согласованный целевой путь).
  - [x] Зафиксировать финальный текст ответа в `tool_call(final_answer).arguments.text`.
  - [x] Обеспечить отсутствие нормализации `summary_points` при нарушении моделью лимитов (сохранять и рендерить как пришло).
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
  - [x] Проверить запись `arguments.text` и отсутствие нормализации `summary_points` при нарушении лимитов.
- [x] `tests/unit/agents/PromptBuilder.test.ts`:
  - [x] Проверить наличие и корректность инструкции про `final_answer`.
- [x] `tests/unit/agents/AgentManager.test.ts`:
  - [x] Добавить/обновить кейсы вычисления `completed` на основе `final_answer`.
  - [x] Проверить, что соседние статусы не деградируют.
- [x] `tests/unit/components/agents/AgentMessage.test.tsx` и связанные renderer unit:
  - [x] Проверить рендер `tool_call(final_answer)` и финального состояния.
  - [x] Проверить рендер `message-completed-badge` и `message-completed-summary`.
  - [x] Проверить отображение `summary_points` как есть при нарушении лимитов моделью.
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
  - [x] При `summary_points` > 10 и/или пунктах > 200 символов UI показывает данные как есть (без нормализации).
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

## Definition of Done

- [x] Спеки и дизайн обновлены под целевую модель `final_answer` без legacy/миграционных оговорок.
- [x] Pipeline поддерживает `final_answer` end-to-end в strict режиме.
- [x] Статус `completed` вычисляется и отображается по согласованному правилу.
- [x] Добавлены/обновлены модульные тесты для pipeline, статусов, промпта и renderer.
- [x] Добавлены/обновлены функциональные тесты для user-flow и статусов.
- [x] `npm run validate` проходит.
- [ ] (После отдельного подтверждения) полный `npm run test:functional` проходит.
- [x] Strict-schema `final_answer` в AI SDK + retry/repair policy реализованы и покрыты тестами.
