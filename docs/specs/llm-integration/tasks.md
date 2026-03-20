# Список задач: LLM Integration

## Обзор

Единый план **оставшихся** работ по LLM/runtime слою.
Документ содержит только незавершённые задачи.

**Текущий статус:** Фаза 10 — Awaiting full functional suite approval

---

## CRITICAL RULES

- Не допускать расхождения между `llm-integration` specs, runtime-кодом и тестами.
- Не запускать полный `npm run test:functional` без отдельного подтверждения пользователя.
- Любые изменения runtime должны сохранять контракт stream/snapshot из `llm-integration` и `realtime-events`.

---

## Текущее состояние

### В работе
- 🔄 Фаза 10: ожидается подтверждение пользователя на полный `npm run test:functional`.

### Незавершённые пункты из предыдущего плана

- [x] (Наследовано из Фазы 8) Реализовать runtime-фикс в renderer EventBus и unit regressions по streaming dedupe parity.
- [ ] (Наследовано из Фазы 7) После завершения изменений запросить подтверждение пользователя на полный `npm run test:functional`.

### Запланировано

#### Фаза 9: Issue #74 Runtime Fix

- [x] Шаг 1. Внести runtime-правку в `src/renderer/events/RendererEventBus.ts`:
  - [x] Добавить `EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED` в `isNonCoalescedStreamingType(...)`.
  - [x] Сохранить правило `outdated` для non-coalesced stream: только `< lastTimestamp`.

- [x] Шаг 2. Добавить unit-regressions в `tests/unit/events/RendererEventBus.test.ts`:
  - [x] Equal-timestamp для `message.llm.text.updated` не теряет второй delta.
  - [x] Out-of-order событие со старым timestamp для `message.llm.text.updated` игнорируется.
  - [x] Проверить паритет с `message.llm.reasoning.updated`.

- [x] Шаг 3. Проверить integration слой transport:
  - [x] Проверен существующий кейс `tests/unit/renderer/IPCChatTransport.test.ts`; дополнительная правка теста не потребовалась.

- [x] Шаг 4. Валидация:
  - [x] Прогнать `tests/unit/events/RendererEventBus.test.ts`.
  - [x] Прогнать `tests/unit/renderer/IPCChatTransport.test.ts`.
  - [x] Прогнать `npm run validate`.

- [x] Шаг 5. Ручная проверка:
  - [x] Зафиксирован baseline воспроизведения **до** runtime-фикса (Issue #74 + скриншот симптома).
  - [x] Воспроизведён длинный streaming-ответ в Agents chat через `tests/functional/llm-chat.spec.ts` single test.
  - [x] Подтверждено отсутствие паттерна «пауза -> burst paragraph» на проверочном сценарии.
  - [x] Выполнено 3 последовательных прогона одного baseline-сценария (single functional test).
  - [x] Итог зафиксирован в задаче и текущем плане.

- [x] Шаг 6. DoD (критерии завершения):
  - [x] Unit tests по EventBus/transport зелёные.
  - [x] `npm run validate` зелёный.
  - [x] Симптом не воспроизводится в baseline-сценарии после фикса.
  - [x] Спеки и `tasks.md` синхронизированы с фактическим состоянием.

- [x] Шаг 7. Fallback-диагностика (если симптом сохраняется после Шага 1–6):
  - [x] Не запускалась: условие не выполнено, т.к. симптом не воспроизвёлся после runtime-фикса.

#### Фаза 10: Functional Suite (по подтверждению пользователя)

- [ ] После завершения Фазы 9 запросить подтверждение на полный `npm run test:functional`.
