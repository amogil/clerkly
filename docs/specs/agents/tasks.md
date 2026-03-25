# Task List: Prompt action button — switch from Stop to Send when user types during in-progress

## Overview

**Issue:** #82  
**Branch:** `feature/82-prompt-button-send-during-in-progress`

Изменение поведения кнопки действия в поле ввода: при статусе агента `in-progress` и наличии текста в поле ввода кнопка должна переключаться из режима `Stop` в режим `Send`, позволяя прервать текущий запрос и отправить новый одним действием.

Бэкенд уже поддерживает cancel + send — изменения только в UI-логике и спецификациях.

**Текущий статус:** Реализация завершена, ожидание запуска функциональных тестов

---

## CRITICAL RULES

- Бэкенд НЕ изменяется — `AgentIPCHandlers.cancelActivePipelineAndNormalizeTail` уже выполняет cancel перед созданием нового `kind: user` сообщения
- Логика переключения stop/send изолирована в `AgentChat.tsx` (строки ~363, 418-429)
- Cancel/interrupt остаётся штатным поведением: без `kind:error`, без error toast
- Компонент `PromptInputSubmit` уже поддерживает оба режима — меняется только условие выбора

---

## Current State

### Completed
- ✅ 1.1 Обновить `docs/specs/agents/requirements.md` — переписаны 4.2.1, 4.2.2, 4.24; добавлено 4.24.6; обновлены функц. тесты
- ✅ 1.2 Обновить `docs/specs/agents/design.md` — обновлён алгоритм action-кнопки, секция useAgentChat п.6, таблица покрытия
- ✅ 2.1 Изменить `src/renderer/components/agents/AgentChat.tsx` — добавлен `isStopMode`, кнопка переключается stop/send по наличию текста
- ✅ 3.1 Обновить unit-тесты — обновлены 3 существующих теста, добавлены 4 новых (37 тестов, все проходят)
- ✅ 4.1 Обновить функциональные тесты — заменён 1 тест на 3 новых (stop для пустого ввода, send при тексте, submit во время in-progress)
- ✅ 5.1 Валидация `npm run validate` — TypeScript, ESLint, Prettier, unit-тесты, coverage — всё прошло

### Pending
- [ ] 5.2 Запуск функциональных тестов (требует согласования с пользователем)
