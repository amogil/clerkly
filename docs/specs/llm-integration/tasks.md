# Список задач: LLM Integration

## Обзор

План работ по Issue #84: retry timeout-ошибок модели до 3 раз в `MainPipeline`.

Сейчас при timeout провайдера pipeline выполняет только 1 повтор в generic silent-failure ветке. Intermittent timeout часто восстанавливается при повторе, но одного недостаточно. Задача — выделить timeout в отдельную retry-ветку с лимитом 3 consecutive retry (4 попытки суммарно). Счётчик timeout-повторов сбрасывается при успешной попытке, то есть он не сквозной через весь run — каждая новая серия timeout получает свежие 3 retry.

**Текущий статус:** Фаза 5 — Исправление замечаний code review

---

## CRITICAL RULES

- Не менять поведение retry для non-timeout ошибок (silent-failure: max 1 retry).
- Не менять поведение retry для invalid tool call / final_answer (max 2 retry).
- Timeout retry разрешён только до появления первого meaningful chunk.
- Timeout retry НЕ выполняется при user-abort (`signal.aborted`).
- Не запускать полный `npm run test:functional` без подтверждения пользователя.

---

## Текущее состояние

### Выполнено
- ✅ Фаза 1: Обновление спецификаций (`requirements.md`, `design.md`).
- ✅ Фаза 2: Реализация timeout retry в `MainPipeline.ts` (`MAX_TIMEOUT_RETRIES`, `consecutiveTimeouts`, `shouldRetryTimeout`).
- ✅ Фаза 3: Unit-тесты (6 тестов: exhaust retry, recover, non-timeout unchanged, abort guards, counter reset).
- ✅ Фаза 4: Валидация (`npm run validate` passed).

### В работе
- 🔄 Фаза 5: Исправление замечаний code review (PR #85).

### Запланировано

#### Фаза 5: Исправление замечаний code review

- [x] P0: Добавить недостающий unit-тест на сброс счётчика timeout-retry между runs.
- [x] P0: Исправить ложное отмечание в tasks.md.
- [x] P2: Убрать implementation details из `requirements.md` 12.2.3 (имена классов, `consecutive`).
- [x] P2: Добавить `logger.warn` при timeout retry в `MainPipeline.ts`.
- [x] P2: Обновить "Выполнено" / "В работе" секции tasks.md.
- [x] P3: Guard `normalizeLLMError` вызов за `!isInvalidFinalAnswer`.
- [x] P3: Переименовать тест "does not retry timeout when signal is already aborted" → "exits early without calling provider when signal is already aborted".
- [x] Прогнать `npm run validate`.
- [x] Push и ответить на review comments.
