# Документ Требований: Error Notifications

## Введение

Данный документ описывает целевую модель обработки ошибок в приложении Clerkly.
Основной канал ошибок LLM/chat-flow — стандартизированные диалоги внутри истории чата (`kind:error` или rate-limit banner). Toast-уведомления используются только для фоновых операций вне chat-flow.

## Глоссарий

- **Chat Error Dialog** — визуальный блок ошибки в чате (на основе `kind:error`)
- **Rate-limit banner** — временный диалог с обратным отсчётом для `429`, без записи `kind:error` в БД
- **Background Error Toast** — toast-уведомление для фоновых операций вне чата
- **Error Normalizer** — единый маппинг ошибок AI SDK/IPC в доменные типы ошибок
- **Race condition error** — ожидаемая конкурентная ошибка, которая логируется, но не показывается пользователю

## Требования

### 1. Каналы отображения ошибок

**ID:** error-notifications.1

**User Story:** Как пользователь, я хочу получать понятные ошибки в правильном месте интерфейса, чтобы не путаться в состоянии системы.

#### Критерии Приемки

1.1. КОГДА ошибка относится к chat-flow агента, ТО система ДОЛЖНА показывать её в истории чата как стандартизированный `kind:error` диалог, а НЕ как toast

1.2. КОГДА ошибка chat-flow имеет тип `rate_limit`, ТО система ДОЛЖНА показывать `rate-limit banner` с обратным отсчётом и кнопкой Cancel без создания записи `kind:error` в `messages`

1.3. КОГДА ошибка относится к фоновой операции вне chat-flow, ТО система ДОЛЖНА показывать `Background Error Toast`

1.4. Диалоги ошибок в чате и rate-limit banner ДОЛЖНЫ использовать единые пользовательские тексты из LLM error-контракта (`auth`, `network`, `provider`, `timeout`, `rate_limit`, `tool`, `protocol`)

1.5. Система ДОЛЖНА логировать все ошибки через централизованный `Logger`

1.6. Race condition/cancelled ошибки ДОЛЖНЫ логироваться, но НЕ ДОЛЖНЫ показываться пользователю

#### Функциональные Тесты

- `tests/functional/llm-chat.spec.ts` — "should show error message on invalid api key"
- `tests/functional/llm-chat.spec.ts` — "should show rate limit banner with countdown"
- `tests/functional/llm-chat.spec.ts` — "should hide error bubble when user sends next message"

### 2. Единая обвязка IPC ошибок

**ID:** error-notifications.2

**User Story:** Как разработчик, я хочу единообразную обвязку ошибок IPC, чтобы не дублировать обработку в каждом хуке.

#### Критерии Приемки

2.1. Приложение ДОЛЖНО предоставлять wrapper `callApi()` для IPC вызовов с единым поведением по ошибкам

2.2. `callApi()` ДОЛЖНА возвращать данные при успехе и `null` при ошибке

2.3. КОГДА ошибка относится к chat-flow, `callApi()` НЕ ДОЛЖНА дополнительно создавать toast (ошибка уже отображается внутри чата)

2.4. КОГДА ошибка относится к фоновой операции, `callApi()` ДОЛЖНА показывать toast, если `silent` не включён

2.5. Global unhandled rejection handler ДОЛЖЕН логировать ошибку и показывать fallback toast только для non-chat ошибок

#### Функциональные Тесты

- `tests/unit/utils/apiWrapper.test.ts` — "should return null on error"
- `tests/unit/utils/apiWrapper.test.ts` — "should not show toast when silent is true"
- `tests/unit/utils/apiWrapper.test.ts` — "should return data on success"

## Вне Области Применения

Следующие элементы явно исключены из данной спецификации:

- Кастомизация тем/анимаций toast
- История всех уведомлений в отдельном журнале UI
- Дублирование chat-ошибок в toast и наоборот
