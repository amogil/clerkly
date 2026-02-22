# TODO: Что осталось сделать по спеке Agents

Составлено: 2026-02-22. Отражает фактическое состояние кода и тестов.

---

## Статус по фазам

| Фаза | Описание | Статус |
|------|----------|--------|
| 1–5.1 | БД, Main Process, IPC, утилиты, хуки, auto-create | ✅ ВЫПОЛНЕНО |
| 6 (частично) | UI компоненты | ✅ почти всё, кроме п.6.5 |
| 7 | Интеграция UI | ✅ фактически выполнено (tasks.md устарел) |
| 8 | Тестирование | ⚠️ частично |

---

## 1. Обновить tasks.md (технический долг)

Фазы 7.1, 7.2, 7.3 фактически выполнены — код существует:
- `src/renderer/hooks/useAgents.ts` ✅
- `src/renderer/hooks/useMessages.ts` ✅
- `src/renderer/components/agents.tsx` ✅

**Действие:** Отметить 7.1, 7.2, 7.3 как ✅ в tasks.md.

---

## 2. Фаза 6.5 — AllAgentsPage (❌ не реализована)

**Требование:** agents.5

Компонент `AllAgentsPage` уже существует в `src/renderer/components/agents/AllAgentsPage.tsx`
и интегрирован в `agents.tsx`. Нужно проверить соответствие требованиям agents.5:

- [ ] agents.5.3 — показывает updatedAt через `DateTimeFormatter.formatDateTime()`
- [ ] agents.5.5 — агенты со статусом "error" показывают errorMessage из последнего сообщения
- [ ] agents.5.6 — архивированные агенты НЕ отображаются
- [ ] agents.5.7 — сортировка по updatedAt (от новых к старым)
- [ ] agents.5.8 — SQL запрос с `ORDER BY timestamp DESC LIMIT 1` для error message

**Файлы:**
- `src/renderer/components/agents/AllAgentsPage.tsx`
- `src/main/agents/AgentIPCHandlers.ts` (если нужен оптимизированный запрос)

---

## 3. Фаза 8.1 — Unit тесты UI компонентов

### Уже есть:
- `tests/unit/components/agents/AutoExpandingTextarea.test.tsx` ✅
- `tests/unit/components/agents/EmptyStatePlaceholder.test.tsx` ✅
- `tests/unit/components/agents/MarkdownMessage.test.tsx` ✅
- `tests/unit/components/agents.test.tsx` ✅ (MessageBubble, text wrapping, action_link)
- `tests/unit/components/agents-autoscroll.test.tsx` ✅
- `tests/unit/components/agents-date-simple.test.tsx` ✅
- `tests/unit/components/agents-initial-render.test.tsx` ✅
- `tests/unit/components/agents-scroll-position.test.tsx` ✅
- `tests/unit/components/agents-status-colors.test.tsx` ✅

### Не хватает:
- [ ] Unit тесты для `AllAgentsPage` — `tests/unit/components/agents/AllAgentsPage.test.tsx`
  - Рендер списка агентов
  - Отображение errorMessage для агентов со статусом error
  - Сортировка по updatedAt
  - Клик по агенту → вызов onAgentClick
  - Кнопка Back → вызов onBack
- [ ] Unit тесты для `AgentHeader` — `tests/unit/components/agents/AgentHeader.test.tsx`
  - Отображение имени, статуса, updatedAt активного агента
  - Кнопка New Chat
  - Кнопка +N при скрытых агентах
- [ ] Unit тесты для `RateLimitBanner` — уже есть `tests/unit/components/RateLimitBanner.test.tsx` ✅

---

## 4. Фаза 8.2 — Property-based тесты

Каталог `tests/property/agents/` пустой.

- [ ] `tests/property/agents/status.property.test.ts` — инварианты `computeAgentStatus`
  - Статус всегда один из допустимых значений
  - Агент без сообщений всегда `new`
  - После user-сообщения без ответа всегда `in-progress`
  - После error-сообщения всегда `error`

---

## 5. Фаза 8.3 — Функциональные тесты

### Уже написаны (нужно запустить и проверить):

| Файл | Требования | Статус |
|------|-----------|--------|
| `agents-always-one.spec.ts` | agents.2.7–2.11 | ✅ проходят |
| `agent-reordering.spec.ts` | agents.1.4.1–1.4.4 | ❓ не запускались |
| `agents-error-messages.spec.ts` | agents.5.5–5.8 | ❓ не запускались |
| `all-agents-page.spec.ts` | agents.5 | ❓ не запускались |
| `agent-status-indicators.spec.ts` | agents.6 | ❓ не запускались |
| `agent-status-calculation.spec.ts` | agents.9 | ❓ не запускались |
| `agent-switching.spec.ts` | agents.3 | ❓ не запускались |
| `agent-messaging.spec.ts` | agents.4 | ❓ не запускались |
| `agent-realtime-events.spec.ts` | agents.12 | ❓ не запускались |
| `agent-activity-indicator.spec.ts` | agents.11 | ❓ не запускались |
| `agent-data-isolation.spec.ts` | agents.10 | ❓ не запускались |
| `agent-date-update.spec.ts` | agents.8.1 | ✅ проходит |
| `agent-list-responsive.spec.ts` | agents.1.7–1.9 | ❓ не запускались |
| `agent-scroll-position.spec.ts` | agents.4.14 | ❓ не запускались |
| `empty-state-placeholder.spec.ts` | agents.4.15–4.21 | ✅ проходят |
| `message-text-wrapping.spec.ts` | agents.4.23 | ✅ проходят |
| `input-autofocus.spec.ts` | agents.4.7.1–4.7.2 | ✅ проходят |
| `auto-expanding-textarea.spec.ts` | agents.4.5–4.7 | ❓ не запускались |
| `header-layout.spec.ts` | agents.8 | ❓ не запускались |
| `message-format.spec.ts` | agents.7 | ❓ не запускались |

### Не написаны (нужно создать):

- [ ] `tests/functional/agent-activation-animation.spec.ts` — agents.6.7
  - "should show animation only when switching to different agent"
  - "should not show animation when agent status updates without switching"
  - "should show animation when switching back to previous agent"

---

## 6. Приоритетный порядок работ

### Высокий приоритет:
1. Запустить все существующие функциональные тесты по agents — выявить что падает
2. Исправить падающие тесты
3. Написать `agent-activation-animation.spec.ts`

### Средний приоритет:
4. Unit тесты `AllAgentsPage` и `AgentHeader`
5. Property-based тесты `tests/property/agents/status.property.test.ts`
6. Обновить tasks.md (отметить выполненные фазы)

### Низкий приоритет:
7. Проверить соответствие `AllAgentsPage` требованиям agents.5 (6.5)

---

## 7. Команды для запуска тестов

```bash
# Запустить все функциональные тесты по agents (покажут окна!)
npm run test:functional:single -- "agent-*.spec.ts|agents-*.spec.ts|all-agents-page.spec.ts"

# Запустить конкретный тест
npm run test:functional:single -- agent-switching.spec.ts

# Unit тесты по agents
npm run test:unit -- tests/unit/components/agents

# Property-based тесты по agents
npm run test:property -- tests/property/agents/
```
