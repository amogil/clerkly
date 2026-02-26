# Чеклист: Падающие функтесты

Дата последнего прогона: 2026-02-26
Для каждого теста по одному:
1) Дать название
2) Дать сценарий
3) Дать детальный план исправления
4) Подтвердить у пользователя. Запрещено править код без согласования пользователя
5) Исправить, прогнать
6) Перейти к следующему тесту

## Упавшие (4, 4 исправлены)
- [x] `tests/functional/agent-scroll-position.spec.ts` — "should NOT force autoscroll when user sends message while scrolled up"
- [x] `tests/functional/settings-ai-agent.spec.ts` — "53.1: should save and load LLM provider selection"
- [x] `tests/functional/settings-ai-agent.spec.ts` — "53.2: should save and load API key with encryption"
- [x] `tests/functional/settings-ai-agent.spec.ts` — "53.3: should delete API key when field is cleared"

## Flaky (5, стабилизированы)
- [x] `tests/functional/agent-reordering.spec.ts` — "should bring hidden agent to header after sending message" (5/5 после фикса stale locator + explicit wait)
- [x] `tests/functional/agent-status-indicators.spec.ts` — "should animate in-progress status" (5/5 после controlled delay mock LLM)
- [x] `tests/functional/agent-switching.spec.ts` — "should switch active agent on click" (5/5)
- [x] `tests/functional/llm-chat.spec.ts` — "should show action_link in auth error bubble and navigate to settings on click" (5/5)
- [x] `tests/functional/message-format.spec.ts` — "should display agent responses correctly" (5/5)
