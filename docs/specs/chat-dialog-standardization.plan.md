# План стандартизации диалогов чата (checklist)

## Контекст и текущие диалоги
- [x] Зафиксирован список диалогов в чате агента:
  - [x] `RateLimitBanner` в `src/renderer/components/agents/RateLimitBanner.tsx`
  - [x] `kind:error` в `src/renderer/components/agents/AgentMessage.tsx`

## Шаги

1. Требования (в "что/поведение")
   - [x] Обновить `docs/specs/llm-integration/requirements.md` и при необходимости `docs/specs/agents/requirements.md`.
   - [x] Описать визуальную отличимость типов (error/info/confirmation).
   - [x] Описать обязательные элементы (заголовок/текст/CTA/secondary-action/таймер).
   - [x] Описать поведение (dismiss/auto-retry/навигация по `action_link` и т.д.).
   - [x] Зафиксировать: один тип диалога для LLM error, разные сообщения (нет ключа vs 401/403).
   - [x] Зафиксировать условие `action_link` только для отсутствующего ключа и 401/403.
   - [x] Не упоминать компоненты/классы в требованиях.
   - [x] Получено подтверждение пользователя после шага 1.

2. Дизайн (как именно реализовано)
   - [x] Обновить `docs/specs/llm-integration/design.md` и `docs/specs/agents/design.md`.
   - [x] Описать композицию диалога через `Confirmation` (состояния/слоты/варианты).
   - [x] Описать маппинг кейсов (rate limit, error bubble) на `Confirmation`.
   - [x] Описать различимость intent (error/info/confirmation) через variant/иконки/тексты.
   - [x] Получено подтверждение пользователя после шага 2.

3. Имплементация UI на базе `Confirmation`
   - [x] Добавить `Confirmation` в `src/renderer/components/ai-elements/confirmation.tsx`.
   - [x] Создать единый обёрточный компонент для чата (например, `AgentDialog`).
   - [x] Перевести `RateLimitBanner` на `Confirmation`, сохранив поведение и `data-testid`.
   - [x] Перевести `kind:error` в `AgentMessage` на `Confirmation`, сохранив `data-testid` и логику `action_link`.

4. Тесты
   - [x] Добавить unit-тесты для `AgentDialog`.
   - [ ] Обновить `tests/unit/components/RateLimitBanner.test.tsx`.
   - [ ] Обновить `tests/unit/components/agents/AgentMessage.test.tsx`.
   - [ ] При необходимости обновить `tests/unit/components/agents/AgentChat.test.tsx`.
   - [ ] Обновить `tests/functional/llm-chat.spec.ts` (сохранить `message-error`, `rate-limit-banner`, `rate-limit-cancel`).
   - [ ] Провести инвентаризацию функциональных и модульных тестов и добавить недостающие.

5. Проверки
   - [ ] Запустить `npm run test:unit` после ключевых UI-изменений.
   - [ ] В конце запустить `npm run validate`.
   - [ ] Предложить запуск функциональных тестов с предупреждением об окнах.
