# Task List: Settings

## Overview

План для временного production-only режима секции `LLM Provider`: в собранном приложении выбор провайдера остается видимым, но становится неинтерактивным и показывает только OpenAI. Runtime-логика main process и существующие test/dev сценарии multi-provider не изменяются.

**Current status:** Phase 2 - Completed

---

## CRITICAL RULES

- Не изменять логику выбора провайдера в `Main Process`.
- Не изменять effective provider в runtime вне renderer-only production gating.
- Не ломать существующее поведение в `dev` и `test`.
- Не отключать и не переписывать functional/multi-provider тесты, если production gating не влияет на test/dev.
- Не менять поведение `Test Connection` в test/dev режиме.

---

## Current State

### Completed
- ✅ Собран контекст по issue #61, релевантным спецификациям и затрагиваемым файлам.
- ✅ Определена граница решения: только production UI-ограничение в секции `LLM Provider`.
- ✅ Уточнены `requirements.md` и `design.md` для packaged production-only ограничения в renderer.
- ✅ Добавлен renderer-only packaged gating в `Settings` с disabled selector и helper text для OpenAI.
- ✅ Добавлен минимальный IPC/runtime-флаг `app:get-runtime-info` для безопасного определения packaged режима.
- ✅ Сохранено текущее multi-provider поведение в `dev` и `test` без изменений main-process provider logic.
- ✅ Добавлены renderer unit-тесты на packaged production branch.
- ✅ Выполнены точечные unit-тесты и полный `npm run validate`.

### In Progress
- Нет.

### Planned

#### Phase 1: Production-only UI Gating

- [x] Уточнить в `requirements.md`, что временное ограничение действует только в production-сборке
  - [x] Зафиксировать, что секция `LLM Provider` остается видимой
  - [x] Зафиксировать, что combobox disabled в production
  - [x] Зафиксировать, что отображаемое значение — `OpenAI (GPT)`
  - [x] Зафиксировать поясняющий текст под combobox: доступен только OpenAI

- [x] Уточнить в `design.md` механизм production gating только в renderer
  - [x] Описать источник признака production-режима
  - [x] Описать, что gating применяется только в компоненте `Settings`
  - [x] Явно зафиксировать, что `Main Process` и provider runtime не изменяются

- [x] Реализовать production-only gating в `src/renderer/components/settings.tsx`
  - [x] В production фиксировать отображаемый provider как `openai`
  - [x] В production выставлять selector в disabled state
  - [x] В production показывать поясняющий текст под selector
  - [x] В dev/test сохранять текущее интерактивное multi-provider поведение без изменений

- [x] Проверить влияние на UI-потоки
  - [x] Убедиться, что API key поле продолжает работать для OpenAI в production
  - [x] Убедиться, что `Test Connection` визуально и функционально остается совместимым с OpenAI flow
  - [x] Убедиться, что в dev/test provider switching не меняется

- [x] Проверить необходимость обновления тестов
  - [x] Сначала подтвердить, что gating не активируется в unit/functional test окружении
  - [x] ЕСЛИ gating не активируется в test, ТО существующие functional/multi-provider тесты не менять
  - [x] ЕСЛИ renderer unit-тесты завязаны на production branch, ТО добавить только минимальные unit-тесты на disabled-state и helper text

- [x] Выполнить целевую проверку
  - [x] Запустить renderer/unit тесты только при необходимости
  - [x] Запустить `npm run validate`

#### Phase 2: Completion

- [x] Обновить `tasks.md` после реализации
  - [x] Перенести выполненные пункты в `Completed`
  - [x] Обновить `Current status`
