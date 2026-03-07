# Список задач: Приведение Agents к обновлённым требованиям (status/done/startup-settled)

## Обзор

Цель работ: привести реализацию `agents` и связанные части `llm-integration` к целевому поведению по:
- статусам агента через `kind + hidden + done`;
- режимам кнопки `send/stop`;
- жизненному циклу `done` и backfill исторических `llm`;
- устранению стартового визуального дёрганья чата.

Связанные спецификации:
- `docs/specs/agents/requirements.md`
- `docs/specs/agents/design.md`
- `docs/specs/llm-integration/requirements.md`
- `docs/specs/llm-integration/design.md`
- `docs/specs/testing-infrastructure/requirements.md`
- `docs/specs/testing-infrastructure/design.md`

**Текущий статус:** Фаза 10 — выполнено.

---

## Критически важные правила

- Внешние AI Elements-компоненты не модифицируются; интеграция реализуется в коде приложения.
- Сообщения с `hidden=true` исключаются из UI и из расчёта статуса.
- Для прерванного/повреждённого `llm` сообщения фиксируется `hidden=true` и `done=false`.
- Отмена через `stop` — штатный сценарий, без создания `kind:error`.

---

## Выполнено

### 1) Спеки и дизайн
- [x] Обновлены `agents/requirements.md` под `startupSettled` и двухфакторный показ основного экрана (`all chats loaded` + `active chat settled`).
- [x] Обновлён `agents/design.md` под целевую архитектуру без миграционных формулировок.
- [x] Уточнён контракт `messages` и логика статуса по `hidden/done`.

### 2) База данных и backfill
- [x] Добавлена/проверена поддержка `messages.done`.
- [x] Реализован backfill исторических `llm` с финальным `action` в `done=1`.
- [x] Добавлена проверка идемпотентности миграции `012_backfill_done_for_historical_llm.sql`.

### 3) Pipeline и сообщения
- [x] Во время reasoning `llm` создаётся/обновляется с `done=false`.
- [x] На финальном action `llm` переводится в `done=true`.
- [x] В error/abort/cancel ветках для незавершённого `llm` выставляется `hidden=true` и `done=false`.
- [x] Ошибки `kind:error` сохраняются с `done=true`.

### 4) Статус агента
- [x] Логика статуса приведена к `agents.9.2`.
- [x] `hidden=true` сообщения исключаются из расчёта.
- [x] Сценарий `last llm + done=false => in-progress` закреплён тестами.

### 5) Prompt input (`send/stop`)
- [x] Режим кнопки зависит от статуса агента (`in-progress => stop`, иначе `send`).
- [x] В режиме `send` активность зависит от наличия текста.
- [x] В режиме `stop` кнопка активна независимо от текста (unit-покрытие есть).

### 6) Startup UX и отсутствие дёрганья
- [x] Реализован `startupSettled` в рендерере и его учёт в глобальном loader.
- [x] Основной экран остаётся смонтированным и визуально маскируется loader-экраном.
- [x] Добавлены проверки отсутствия transient page-scroll / dual-scrollbar / late width-shift.

### 7) Покрытие тестами (уже есть в коде)
- [x] `tests/unit/MigrationRunner.test.ts` — backfill + идемпотентность.
- [x] `tests/unit/agents/MainPipeline.test.ts` — lifecycle `done` и ветка скрытия незавершённого `llm`.
- [x] `tests/unit/agents/AgentManager.test.ts` — hidden-aware расчёт статуса.
- [x] `tests/unit/components/agents/AgentChat.test.tsx` — send/stop поведение.
- [x] `tests/unit/hooks/useAppCoordinatorState.test.ts` — polling-ресинк `app:get-state` до терминальной фазы координатора.
- [x] `tests/functional/startup-loader.spec.ts` — startup-settled и анти-регрессии по скроллу/ширине.
- [x] `tests/functional/agent-status-calculation.spec.ts` — hidden-aware статус в e2e.
- [x] `tests/functional/agent-messaging.spec.ts` — `send` активен только при тексте.

---

## В работе

### 8) Функциональный пробел по `stop`
- [x] Добавить отдельный functional-тест: в режиме `stop` кнопка остаётся активной при пустом и непустом вводе.
- [x] Прогнать этот функциональный тест точечно.

### 9) Startup orchestration redesign (startup polling + runtime events)
- [x] Startup orchestration реализована через IPC polling state (`app:get-state`) и явный ready-signal (`app:set-chats-ready`).
- [x] `useAppCoordinatorState` использует polling `app:get-state` только на этапе запуска до терминальной стартовой фазы.
- [x] `AppCoordinator` публикует `app.coordinator.state-changed` для runtime-синхронизации без постоянного polling.
- [x] Добавлен IPC-контракт `app:set-chats-ready` для перевода `AppCoordinator` в `ready`.
- [x] Обновлены unit-тесты `AppCoordinator` и `useAppCoordinatorState` под гибридную модель (startup polling + runtime events).
- [x] Обновлены `agents/requirements.md` и `agents/design.md` под целевой гибридный контракт.

---

## Запланировано

### 10) Финальные проверки
- [x] Прогнать `npm run validate`.
- [x] Прогнать профильные функциональные тесты по изменённым сценариям.
- [x] Обновить этот `tasks.md` до финального состояния «выполнено».

Профильные функциональные прогоны:
- [x] `tests/functional/agent-messaging.spec.ts`:
  - `should enable send button only when input has text`
  - `should keep stop button enabled regardless of input text in in-progress status`
- [x] `tests/functional/agent-status-calculation.spec.ts`:
  - `should ignore hidden messages when calculating status`
- [x] `tests/functional/startup-loader.spec.ts`:
  - `should keep agents screen mounted while startup loader is visible`
  - `should keep active chat width stable after startup with history`
  - `should not expose transient page scroll or dual scrollbars during startup transition`
  - `should keep loader visible until active chat startup settles even after messages are loaded`
- [x] `tests/functional/llm-chat.spec.ts`:
  - `should keep chat viewport visually stable on app reopen with real llm history`

---

## Ожидаемый результат

- Поведение UI и статусов полностью соответствует актуальным требованиям `agents` и `llm-integration`.
- Проблемы со стартовым визуальным скроллом/ресайзом не воспроизводятся.
- В функциональном покрытии есть отдельная проверка `stop`-кнопки независимо от текста ввода.

---

## Фаза 11: Reasoning trigger icon animation lifecycle (план)

Цель работ: обеспечить поведение иконки в заголовке reasoning-блока — анимация только во время активного reasoning, после завершения reasoning и сворачивания блока иконка остаётся статичной.

Связанные спецификации:
- `docs/specs/agents/requirements.md`
- `docs/specs/agents/design.md`
- `docs/specs/llm-integration/requirements.md`
- `docs/specs/llm-integration/design.md`
- `docs/specs/testing-infrastructure/requirements.md`
- `docs/specs/testing-infrastructure/design.md`

**Текущий статус:** Фаза 11 — запланировано (ожидает реализации).

### Чек-лист работ

#### 1) Спеки и критерии
- [ ] Уточнить acceptance-критерий в `agents`/`llm-integration`: иконка в reasoning-trigger анимирована только во время активного reasoning; после завершения reasoning и автосворачивания остаётся статичной.
- [ ] Добавить/обновить ссылки на функциональный тест в секциях "Функциональные Тесты".
- [ ] Обновить таблицы покрытия требований в `design.md`.

#### 2) Репродукция и фиксация текущего поведения
- [ ] Запустить точечный functional-сценарий reasoning-trigger и зафиксировать переходы: streaming → finish → collapse.
- [ ] Подтвердить единый источник truth для состояния "reasoning завершён" в renderer.

#### 3) Тесты сначала (red → green)
- [ ] Добавить unit-тест на переход состояния trigger: после завершения reasoning и collapsed-состояния `Logo` получает `animated=false`.
- [ ] Добавить functional-тест: после появления финального `action.content` и автосворачивания trigger в DOM отсутствует `svg.logo-animated`.
- [ ] Проверить отсутствие регрессий toggle-поведения (manual collapse/expand).

#### 4) Изменение реализации (точечно)
- [ ] Обновить вычисление флага анимации в `AgentReasoningTrigger` (и при необходимости связанный источник флага в `AgentChat`) так, чтобы анимация зависела только от активной reasoning-фазы.
- [ ] Убедиться, что текст, chevron и поведение раскрытия/сворачивания не меняются.

#### 5) Валидация
- [ ] Запустить только затронутые unit-тесты.
- [ ] Запустить только затронутые functional-тесты (с предупреждением о показе окон).
- [ ] Запустить `npm run validate`.

### Ожидаемый результат

- Во время reasoning иконка в trigger анимируется.
- После завершения reasoning и сворачивания блока иконка остаётся статичной.
- Поведение toggle и порядок reasoning/action остаются без изменений.

### Риски

- Возможен разъезд между "isStreaming чата" и "isStreaming reasoning".
- Возможны флейки в functional-тесте из-за тайминга автосворачивания.
