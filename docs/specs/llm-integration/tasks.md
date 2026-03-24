# Список задач: LLM Integration

## Обзор

План работ по Issue #84: retry timeout-ошибок модели до 3 раз в `MainPipeline`.

Сейчас при timeout провайдера pipeline выполняет только 1 повтор в generic silent-failure ветке. Intermittent timeout часто восстанавливается при повторе, но одного недостаточно. Задача — выделить timeout в отдельную retry-ветку с лимитом 3 consecutive retry (4 попытки суммарно). Счётчик timeout-повторов сбрасывается при успешной попытке, то есть он не сквозной через весь run — каждая новая серия timeout получает свежие 3 retry.

**Текущий статус:** Фаза 4 — Валидация завершена

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

### В работе
- 🔄 Issue #84: retry timeout-ошибок модели до 3 раз.

### Запланировано

#### Фаза 1: Обновление спецификаций

- [x] Обновить `docs/specs/llm-integration/requirements.md`
  - [x] Добавить требование `llm-integration.12.2.3`: КОГДА нормализованный тип ошибки = `timeout` И run не отменён пользователем И первый meaningful chunk ещё не получен, `MainPipeline` ДОЛЖЕН выполнить до 3 consecutive повторных попыток (4 attempts total включая начальную). Счётчик timeout-повторов ДОЛЖЕН сбрасываться при успешной попытке. После исчерпания retry ДОЛЖЕН создаваться ровно один `kind:error` с `type=timeout`.
  - [x] Добавить требование `llm-integration.12.2.4`: существующее поведение retry для non-timeout ошибок (1 повтор) ДОЛЖНО оставаться неизменным.

- [x] Обновить `docs/specs/llm-integration/design.md`
  - [x] В секции "Retry policy (recoverable ошибки)" добавить timeout-specific policy: до 3 повторов для `timeout`-ошибок до первого meaningful chunk.
  - [x] Добавить записи unit-тестов в секцию тестирования.
  - [x] Обновить таблицу покрытия требований для новых ID.

#### Фаза 2: Реализация в runtime

- [x] Изменить `src/main/agents/MainPipeline.ts`
  - [x] Добавить константу `MAX_TIMEOUT_RETRIES = 3`.
  - [x] Добавить в `AttemptCycleState` поле `consecutiveTimeouts: number` (начальное значение `0`).
  - [x] В `handleAttemptFailure()` добавить новую ветку `shouldRetryTimeout`:
    - Ошибка нормализуется в `type: timeout` (через `normalizeLLMError`).
    - run не отменён пользователем (`!signal?.aborted`).
    - Нет meaningful chunks (`!state.meaningfulChunkSeen`).
    - `cycleState.consecutiveTimeouts < MAX_TIMEOUT_RETRIES`.
  - [x] При timeout-retry инкрементировать `cycleState.consecutiveTimeouts`.
  - [x] При успешной попытке (возврат из `callProviderWithStreaming`) сбрасывать `cycleState.consecutiveTimeouts = 0` — счётчик не сквозной.
  - [x] Исключить timeout из `shouldRetrySilentFailure` (чтобы timeout не расходовал generic retry).
  - [x] Обновить `shouldRetry`: `shouldRetryInvalidFinalAnswer || shouldRetryTimeout || shouldRetrySilentFailure`.

#### Фаза 3: Unit-тесты

- [ ] Добавить тесты в `tests/unit/agents/MainPipeline.test.ts`:
- [x] Добавить тесты в `tests/unit/agents/MainPipeline.test.ts`:
  - [x] Timeout retry исчерпывает 3 retry (4 вызова `chat`), затем создаёт один `kind:error` с `type=timeout`.
  - [x] Timeout успешен на 2-м retry (2 вызова `chat`, нет `kind:error`).
  - [x] Non-timeout ошибка (network) по-прежнему retry max 1 раз (2 вызова `chat`).
  - [x] Timeout при `signal.aborted` НЕ делает retry.
  - [x] Счётчик timeout-retry сбрасывается после успешной попытки (timeout -> success -> timeout -> success — каждая серия получает свежие 3 retry).

#### Фаза 4: Валидация

- [x] Прогнать targeted unit tests: `tests/unit/agents/MainPipeline.test.ts`.
- [x] Прогнать `npm run validate`.
- [ ] Запросить подтверждение пользователя перед `npm run test:functional`.
