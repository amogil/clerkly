# Список Задач: LLM Integration — Issue #51 (`final_answer`)

## Обзор

Цель: привести систему в соответствие задаче #51 — добавить поддержку тулы `final_answer`, зафиксировать её контракт в спеках/дизайне, реализовать логику статуса `completed`, обновить промпт и покрыть изменения модульными и функциональными тестами.

**Текущий статус:** Планирование

---

## Фаза 1: Спеки и дизайн (сначала)

- [ ] Обновить `docs/specs/llm-integration/requirements.md`:
  - [ ] Добавить явный контракт тулы `final_answer` (назначение, структура аргументов, условия вызова).
  - [ ] Зафиксировать, что `final_answer` переводит диалог в статус `completed`.
  - [ ] Зафиксировать поведение при отсутствии `final_answer`: turn может завершиться `kind: llm` с `done=true`, но статус остаётся `awaiting-response`.
  - [ ] Обновить список функциональных тестов под новый контракт.
- [ ] Обновить `docs/specs/llm-integration/design.md`:
  - [ ] Описать место `final_answer` в pipeline (`model -> tool_call(final_answer) -> final persisted state`).
  - [ ] Уточнить, как `final_answer` сохраняется в `messages` (kind/payload/done/reply_to_message_id).
  - [ ] Описать влияние на stream lifecycle и завершение ответа.
- [ ] Обновить `docs/specs/agents/requirements.md`:
  - [ ] Зафиксировать правило перехода агента в `completed`, связанное с `final_answer`.
  - [ ] Зафиксировать ожидания UI для статуса `completed` (иконки/лейблы/доступность действий).
- [ ] Обновить `docs/specs/agents/design.md`:
  - [ ] Обновить алгоритм `computeAgentStatus()` с явной веткой `completed` по `final_answer`.
  - [ ] Уточнить источники данных для вычисления статуса (только persisted messages).
- [ ] При необходимости синхронизировать `docs/specs/realtime-events/{requirements,design}.md`:
  - [ ] Обновить контракт snapshot-полей/`changedFields`, если меняется сигнализация перехода в `completed`.
- [ ] Обновить этот `tasks.md` по факту реализации.

---

## Фаза 2: Реализация кода

- [ ] Добавить системную тулу `final_answer` в orchestration layer:
  - [ ] Подключить definition тулы в pipeline/tool registry.
  - [ ] Включить strict-схему структуры аргументов для этой тулы (без блокировки ответа при нарушении лимитов `summary_points`).
- [ ] Реализовать обработку вызова `final_answer`:
  - [ ] Persist `kind: tool_call` для `final_answer` с корректным lifecycle (`done=false -> done=true` либо согласованный целевой путь).
  - [ ] Зафиксировать финальный текст ответа в `tool_call(final_answer).arguments.text`.
  - [ ] Обеспечить отсутствие нормализации `summary_points` при нарушении моделью лимитов (сохранять и рендерить как пришло).
  - [ ] Корректно завершать turn в pipeline без legacy fallback.
- [ ] Обновить prompt/prompt builder:
  - [ ] Добавить инструкцию модели, когда и как вызывать `final_answer`.
  - [ ] Исключить конфликтующие или устаревшие инструкции.
- [ ] Обновить вычисление статусов:
  - [ ] Добавить/активировать правило вычисления `completed` из persisted-сообщений `final_answer`.
  - [ ] Проверить, что текущие правила `in-progress/awaiting-response/error/new` не ломаются.
- [ ] Проверить renderer mapping:
  - [ ] Убедиться, что рендер `tool_call(final_answer)` и streaming/final `kind: llm` текста соответствует целевой модели.
  - [ ] Убедиться, что нет legacy-путей, противоречащих новому контракту.

---

## Фаза 3: Обновление модульных тестов

- [ ] `tests/unit/agents/MainPipeline.test.ts`:
  - [ ] Добавить сценарий вызова `final_answer` с корректным завершением turn.
  - [ ] Проверить persist lifecycle сообщения `tool_call(final_answer)`.
  - [ ] Проверить запись `arguments.text` и отсутствие нормализации `summary_points` при нарушении лимитов.
- [ ] `tests/unit/agents/PromptBuilder.test.ts`:
  - [ ] Проверить наличие и корректность инструкции про `final_answer`.
- [ ] `tests/unit/agents/AgentManager.test.ts`:
  - [ ] Добавить/обновить кейсы вычисления `completed` на основе `final_answer`.
  - [ ] Проверить, что соседние статусы не деградируют.
- [ ] `tests/unit/components/agents/AgentMessage.test.tsx` и связанные renderer unit:
  - [ ] Проверить рендер `tool_call(final_answer)` и финального состояния.
  - [ ] Проверить рендер `message-completed-badge` и `message-completed-summary`.
  - [ ] Проверить отображение `summary_points` как есть при нарушении лимитов моделью.
  - [ ] Проверить отсутствие regressions в обычных `tool_call`.
- [ ] `tests/unit/components/agents-status-colors.test.tsx`:
  - [ ] Проверить визуальные атрибуты `completed`.

---

## Фаза 4: Обновление/добавление функциональных тестов

- [ ] `tests/functional/llm-chat.spec.ts`:
  - [ ] Добавить сценарий, где модель завершает через `final_answer`.
  - [ ] Проверить, что пользователь видит корректный финальный ответ.
  - [ ] Проверить, что статус агента становится `completed`.
- [ ] `tests/functional/agent-status-calculation.spec.ts`:
  - [ ] Добавить сценарий вычисления `completed` после `final_answer`.
- [ ] `tests/functional/agent-status-all-places.spec.ts`:
  - [ ] Проверить отображение `completed` во всех ключевых местах UI.
- [ ] Негативные functional кейсы:
  - [ ] Без `final_answer` статус не должен переходить в `completed`.
  - [ ] При `summary_points` > 10 и/или пунктах > 200 символов UI показывает данные как есть (без нормализации).
  - [ ] Ошибки/отмена не должны ложно переводить агента в `completed`.

---

## Фаза 5: Валидация

- [ ] Прогнать релевантные unit тесты по затронутым модулям.
- [ ] Прогнать `npm run validate`.
- [ ] После подтверждения пользователя — полный прогон `npm run test:functional`.

---

## Definition of Done

- [ ] Спеки и дизайн обновлены под целевую модель `final_answer` без legacy/миграционных оговорок.
- [ ] Pipeline поддерживает `final_answer` end-to-end в strict режиме.
- [ ] Статус `completed` вычисляется и отображается по согласованному правилу.
- [ ] Добавлены/обновлены модульные тесты для pipeline, статусов, промпта и renderer.
- [ ] Добавлены/обновлены функциональные тесты для user-flow и статусов.
- [ ] `npm run validate` проходит.
- [ ] (После отдельного подтверждения) полный `npm run test:functional` проходит.
