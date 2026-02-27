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
   - [x] Обновить `tests/unit/components/RateLimitBanner.test.tsx` (изменений не потребовалось).
   - [x] Обновить `tests/unit/components/agents/AgentMessage.test.tsx` (изменений не потребовалось).
   - [x] При необходимости обновить `tests/unit/components/agents/AgentChat.test.tsx` (не требуется).
   - [x] Обновить `tests/functional/llm-chat.spec.ts` (изменений не потребовалось).
   - [x] Провести инвентаризацию функциональных и модульных тестов и добавить недостающие (недостающих не выявлено).

5. Проверки
   - [ ] Запустить `npm run test:unit` после ключевых UI-изменений.
   - [ ] В конце запустить `npm run validate`.
   - [ ] Предложить запуск функциональных тестов с предупреждением об окнах.

## Упавшие функциональные тесты (чек-лист)
- [ ] `tests/functional/account-profile.spec.ts:1479:7` — Account Profile › should synchronously fetch profile during authorization (error)
- [ ] `tests/functional/account-profile.spec.ts:1587:7` — Account Profile › should show LoginError when profile fetch fails
- [ ] `tests/functional/account-profile.spec.ts:2014:7` — Account Profile › should show login screen and clear UI on logout
- [ ] `tests/functional/oauth-profile-sync.spec.ts:186:7` — OAuth Profile Synchronous Fetch › should synchronously fetch profile during authorization (error)
- [ ] `tests/functional/oauth-profile-sync.spec.ts:416:7` — OAuth Profile Synchronous Fetch › should show LoginError when profile fetch fails
- [ ] `tests/functional/sign-out-flow.spec.ts:56:5` — should show login screen after sign out
- [ ] `tests/functional/sign-out-flow.spec.ts:108:5` — should clear tokens after sign out
- [ ] `tests/functional/sign-out-flow.spec.ts:155:5` — should handle sign out when revoke fails

## Мигающие функциональные тесты (flaky)
- [ ] `tests/functional/llm-chat.spec.ts:700:7` — LLM Chat (mock server) › should cancel rate limit retry and hide user message

## Анализ тестов (по одному, с согласованием)

### 1) Account Profile › should synchronously fetch profile during authorization (error)
- **Название:** `tests/functional/account-profile.spec.ts:1479:7` — Account Profile › should synchronously fetch profile during authorization (error)
- **Сценарий:** Авторизация с mock OAuth, UserInfo API возвращает 500; ожидается синхронная обработка ошибки и отображение ошибки входа.
- **Детальный план исполнения:**
  1. Перезапустить только этот тест через `npm run test:functional:single -- account-profile.spec.ts --grep "synchronously fetch profile during authorization (error)"`.
  2. Зафиксировать фактический UI-стейт: видимость LoginError, состояние кнопки "Continue with Google", состояние профиля.
  3. Сравнить ожидания теста с текущим UX (есть ли переработка LoginError).
  4. Предложить согласованный путь: обновление теста или фикса поведения (только после согласования).
