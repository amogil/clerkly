# Список задач: LLM Integration

## Обзор

Единый план **оставшихся** работ по LLM/runtime слою.
Документ содержит только незавершённые задачи.

**Текущий статус:** Фаза 9 — Issue #74 Runtime Fix

---

## CRITICAL RULES

- Не допускать расхождения между `llm-integration` specs, runtime-кодом и тестами.
- Не запускать полный `npm run test:functional` без отдельного подтверждения пользователя.
- Любые изменения runtime должны сохранять контракт stream/snapshot из `llm-integration` и `realtime-events`.

---

## Текущее состояние

### В работе
- 🔄 Фаза 9: исправление задержек stream-доставки для `message.llm.text.updated` (Issue #74).

### Незавершённые пункты из предыдущего плана

- [ ] (Наследовано из Фазы 8) Реализовать runtime-фикс в renderer EventBus и unit regressions по streaming dedupe parity.
- [ ] (Наследовано из Фазы 7) После завершения изменений запросить подтверждение пользователя на полный `npm run test:functional`.

### Запланировано

#### Фаза 9: Issue #74 Runtime Fix

- [ ] Шаг 1. Внести runtime-правку в `src/renderer/events/RendererEventBus.ts`:
  - [ ] Добавить `EVENT_TYPES.MESSAGE_LLM_TEXT_UPDATED` в `isNonCoalescedStreamingType(...)`.
  - [ ] Сохранить правило `outdated` для non-coalesced stream: только `< lastTimestamp`.

- [ ] Шаг 2. Добавить unit-regressions в `tests/unit/events/RendererEventBus.test.ts`:
  - [ ] Equal-timestamp для `message.llm.text.updated` не теряет второй delta.
  - [ ] Out-of-order событие со старым timestamp для `message.llm.text.updated` игнорируется.
  - [ ] Проверить паритет с `message.llm.reasoning.updated`.

- [ ] Шаг 3. Проверить integration слой transport:
  - [ ] При необходимости добавить/обновить кейс в `tests/unit/renderer/IPCChatTransport.test.ts` на непрерывную доставку text-delta без пауз.

- [ ] Шаг 4. Валидация:
  - [ ] Прогнать `tests/unit/events/RendererEventBus.test.ts`.
  - [ ] Прогнать `tests/unit/renderer/IPCChatTransport.test.ts` (если менялся).
  - [ ] Прогнать `npm run validate`.

- [ ] Шаг 5. Ручная проверка:
  - [ ] Зафиксировать baseline воспроизведения **до** runtime-фикса: один и тот же prompt/модель/окружение для сравнения.
  - [ ] Воспроизвести длинный streaming-ответ в Agents chat.
  - [ ] Подтвердить отсутствие паттерна «пауза -> burst paragraph».
  - [ ] Повторить проверку минимум в 3 последовательных прогонах на том же baseline-сценарии.
  - [ ] Зафиксировать итог в отчёте по задаче.

- [ ] Шаг 6. DoD (критерии завершения):
  - [ ] Unit tests по EventBus/transport зелёные.
  - [ ] `npm run validate` зелёный.
  - [ ] Симптом не воспроизводится в baseline-сценарии после фикса.
  - [ ] Спеки и `tasks.md` синхронизированы с фактическим состоянием.

- [ ] Шаг 7. Fallback-диагностика (если симптом сохраняется после Шага 1–6):
  - [ ] Проверить cadence входящих чанков на provider-уровне (`OpenAIProvider`/`AnthropicProvider`/`GoogleProvider`) и убедиться, что дельты приходят без многосекундных разрывов.
  - [ ] Проверить flush-поведение `MainPipeline` (batched 100ms + boundary flush) на сценарии воспроизведения.
  - [ ] Проверить доставку в `IPCChatTransport` и исключить задержку на слое преобразования IPC→UIMessageChunk.
  - [ ] По итогам fallback оформить отдельный под-план (без удаления существующих незавершённых пунктов).

#### Фаза 10: Functional Suite (по подтверждению пользователя)

- [ ] После завершения Фазы 9 запросить подтверждение на полный `npm run test:functional`.
