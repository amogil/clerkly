# Список Задач: code_exec

## Обзор

Цель: реализовать безопасное выполнение JavaScript-кода моделью через `code_exec` в изолированной sandbox-среде.

**Текущий статус:** Фаза 2 — Main/Sandbox архитектура (ожидает реализации)

---

## КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА

- Нельзя ослаблять безопасность sandbox ради функциональности.
- Нельзя давать sandbox прямой доступ к Node.js, ФС, сети или БД.
- Нельзя ломать текущие контракты `llm/tool_call/error/final_answer`.
- Нельзя отключать тесты через `.skip()`/`.only()`.

---

## Текущее Состояние

### Выполнено
- ✅ Подготовлен первичный анализ issue #52 и контекста текущей архитектуры.
- ✅ Создана новая спецификация `docs/specs/code_exec/`.
- ✅ Синхронизированы `docs/specs/agents/*` по UI-контракту `tool_call(code_exec)`.
- ✅ Синхронизированы `docs/specs/llm-integration/*` по явной привязке `toolName="code_exec"` без изменения message kind.
- ✅ Устранены противоречия по рендеру `final_answer` между `realtime-events` и `agents`.

### В Работе
- 🔄 Фаза 2: Подготовка к реализации main/sandbox runtime.

### Запланировано

#### Фаза 2: Main/Sandbox архитектура

- [ ] Реализовать `SandboxSessionManager` для lifecycle sandbox runtime.
  - [ ] Создание отдельной sandbox-инстанции на каждый вызов `code_exec` (one-call-one-sandbox).
  - [ ] Timeout/cancel/cleanup политика.
- [ ] Добавить sandbox preload bridge с whitelist API.
- [ ] Добавить policy-валидации main process для sandbox запросов.

#### Фаза 3: LLM и pipeline интеграция

- [ ] Добавить `code_exec` в prompt/tool layer.
- [ ] Интегрировать `code_exec` в `MainPipeline`.
  - [ ] Persist start/update/final lifecycle для `kind: tool_call` с `toolName='code_exec'`.
  - [ ] Нормализация статусов `running/success/error/timeout/cancelled` и кодов ошибок по фиксированному словарю.
  - [ ] Реализовать общий validation/retry контракт tool calls для `code_exec` (schema validation → feedback модели → bounded retry/repair `maxRetries=2` → при исчерпании обычный `kind:error` в чате, не `tool_call`-ошибка).
  - [ ] Унифицировать этот же validation/retry flow для уже реализованного `final_answer` и остальных tool calls без расхождений по типу финальной ошибки.
  - [ ] Мигрировать `PromptBuilder`/`MessageManager.listForModelHistory` на новую логику: terminal-результаты всех `tool_call` (`final_answer`, `code_exec`, включая `cancelled/error`) включаются в model history; non-terminal не включаются.
  - [ ] Реализовать сериализацию terminal `tool_call` в AI SDK tool-result формат для model history (`toolCallId`, `toolName`, `result`).
  - [ ] Гарантировать немедленный переход к следующему шагу `model` после terminal `tool_call` любого статуса (`success/error/timeout/cancelled`) в цикле `model -> tools -> model`.
  - [ ] Выполнить проверку совместимости с уже реализованным `final_answer`: существующие persisted `tool_call(final_answer)` должны корректно участвовать в model history без скрытия и без миграции схемы БД.

#### Фаза 4: Тестирование

- [ ] Добавить unit-тесты main/runtime/pipeline слоёв.
- [ ] Переименовать functional test-файл под каноничное имя `tests/functional/code_exec.spec.ts` (если в коде ещё используется старое имя) и обновить все ссылки/запуски.
- [ ] Добавить/обновить functional-тест `code_exec.spec.ts`: невалидные аргументы `code_exec` → bounded retry/repair → финальный `kind:error` в чате.
- [ ] Добавить/обновить functional-тест `code_exec.spec.ts`: лимит входного кода `30 KiB` и ожидаемая ошибка валидации.
- [ ] Добавить/обновить functional-тест `code_exec.spec.ts`: лимиты `stdout/stderr` по `10 KiB` и корректные флаги truncation.
- [ ] Добавить/обновить functional-тест `llm-chat.spec.ts`: включение terminal tool results (`final_answer`, `code_exec`, включая `error/timeout/cancelled`) в model history в AI SDK tool-result формате.
- [ ] Добавить/обновить functional-тест `llm-chat.spec.ts`: non-terminal `tool_call` (`running`) не попадает в model history.
- [ ] Добавить/обновить functional-тест `llm-chat.spec.ts`: после terminal `tool_call` любого статуса pipeline немедленно продолжает следующий шаг `model`.
- [ ] Покрыть полный набор сценариев по детальному тест-плану из `docs/specs/code_exec/design.md` (раздел "Стратегия тестирования").
- [ ] Обновить детальную матрицу покрытия по `code_exec.6.6` в `docs/specs/code_exec/design.md` после добавления/изменения тестов.
- [ ] Выполнять тестовую реализацию в порядке: сначала unit, затем functional.

#### Фаза 5: Синхронизация UI-спеков

- [x] Обновить `docs/specs/agents/*` требования/дизайн для визуализации `code_exec`.
- [x] Проверить согласованность `code_exec` и `agents` по границам ответственности.
- [x] Синхронизировать `docs/specs/llm-integration/*` по `toolName="code_exec"` (без смены контрактов `kind`).

#### Фаза 6: Валидация

- [ ] Запустить `npm run validate`.
- [ ] После подтверждения пользователя запустить `npm run test:functional`.

#### Фаза 7: UI follow-up по `Final Answer` (перенесено из `llm-integration/tasks.md`)

- [ ] Обновить renderer-компонент `Final Answer`: выровнять текст checklist-пункта по вертикальному центру относительно зелёной иконки `Check`.
- [ ] Добавить/обновить unit-тест `AgentMessage` на корректное выравнивание контента пункта `message-final-answer-item`.
- [ ] Добавить/обновить functional-тест рендера `Final Answer`, проверяющий визуальную геометрию пункта (иконка и текст выровнены строго по вертикальному центру).
