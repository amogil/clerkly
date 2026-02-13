# Список Задач: Real-time Events System

## Обзор

Данный документ содержит список задач для реализации системы событий реального времени в приложении Clerkly. Система включает EventBus для main и renderer процессов, IPC интеграцию, React hooks и TypeScript типизацию.

## Задачи

### 1. Установка зависимостей и типы

- [x] 1.1 Установить mitt
  - Выполнить `npm install mitt`
  - **Requirements:** -

- [x] 1.2 Создать типы событий
  - Создать файл `src/shared/events/types.ts`
  - Определить BaseEvent, ClerklyEvents, EventType, EventPayload
  - Определить payload типы для agent, message, user событий
  - **Requirements:** realtime-events.1.2, realtime-events.3, realtime-events.8

- [x] 1.3 Создать константы
  - Создать файл `src/shared/events/constants.ts`
  - Определить IPC channel names
  - **Requirements:** realtime-events.4.5

- [x] 1.4 Написать модульные тесты для типов
  - Создать файл `tests/unit/events/EventTypes.test.ts`
  - Тест: should emit entity.created with full data
  - Тест: should emit entity.updated with changedFields
  - Тест: should emit entity.deleted with ID only
  - Тест: should support custom event types
  - Тест: should include timestamp in all events
  - **Requirements:** realtime-events.3.2, realtime-events.3.3, realtime-events.3.4, realtime-events.3.5, realtime-events.3.6

- [x] 1.5 **Checkpoint: Фаза 1** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add event types and constants"`

### 2. MainEventBus

- [x] 2.1 Создать MainEventBus класс
  - Создать файл `src/main/events/MainEventBus.ts`
  - Реализовать singleton с mitt
  - Реализовать методы publish/subscribe/subscribeAll/clear/destroy/resetInstance
  - **Requirements:** realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6

- [x] 2.2 Реализовать timestamp-based deduplication
  - Добавить Map для хранения последних timestamp по entity key
  - Игнорировать события с более старым timestamp
  - **Requirements:** realtime-events.5.5

- [x] 2.3 Реализовать очистку timestamp cache
  - Очистка при entity.deleted событии
  - Периодическая очистка stale записей (раз в минуту, старше 6 часов)
  - **Requirements:** realtime-events.6.5

- [x] 2.4 Реализовать batching
  - Объединение событий одной сущности в пределах одного tick (queueMicrotask)
  - **Requirements:** realtime-events.6.3

- [x] 2.5 Реализовать изоляцию ошибок
  - try-catch вокруг callback вызовов
  - **Requirements:** realtime-events.2.7

- [x] 2.6 Реализовать broadcast в renderer
  - Отправка событий во все BrowserWindow через IPC
  - **Requirements:** realtime-events.4.1

- [x] 2.7 Добавить логирование
  - Logger.debug для всех событий
  - **Requirements:** Нефункциональные (отладка)

- [x] 2.8 Написать модульные тесты для MainEventBus
  - Создать файл `tests/unit/events/MainEventBus.test.ts`
  - Тест: should be singleton
  - Тест: should publish event with type and payload
  - Тест: should include timestamp in event
  - Тест: should deliver event locally within same process
  - Тест: should receive events after subscription
  - Тест: should support wildcard subscription
  - Тест: should return unsubscribe function
  - Тест: should unsubscribe correctly
  - Тест: should isolate consumer errors
  - Тест: should ignore outdated events based on timestamp
  - Тест: should handle 100 events per second
  - Тест: should cleanup subscriptions on clear()
  - Тест: should log events in debug level
  - Тест: should support local-only publish option
  - Тест: should batch events for same entity within one tick
  - Тест: should cleanup timestamp cache on entity.deleted
  - Тест: should cleanup stale timestamp entries periodically
  - Тест: should reset instance for testing (resetInstance)
  - **Requirements:** realtime-events.1, realtime-events.2, realtime-events.6.3, realtime-events.6.5

- [x] 2.9 **Checkpoint: Фаза 2** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): implement MainEventBus with deduplication and batching"`

### 3. RendererEventBus

- [x] 3.1 Создать RendererEventBus класс
  - Создать файл `src/renderer/events/RendererEventBus.ts`
  - Реализовать singleton с mitt, аналогичный MainEventBus
  - **Requirements:** realtime-events.1.1, realtime-events.1.3, realtime-events.1.5, realtime-events.1.6

- [x] 3.2 Реализовать IPC listener
  - Подписка на события из main через window.api.events.onEvent
  - **Requirements:** realtime-events.2.9

- [x] 3.3 Реализовать отправку в main
  - Отправка событий в main через window.api.events.sendEvent
  - **Requirements:** realtime-events.4.2

- [x] 3.4 Написать модульные тесты для RendererEventBus
  - Создать файл `tests/unit/events/RendererEventBus.test.ts`
  - Тест: should be singleton
  - Тест: should publish event with type and payload
  - Тест: should include timestamp in event
  - Тест: should deliver event locally within same process
  - Тест: should receive events after subscription
  - Тест: should support wildcard subscription
  - Тест: should return unsubscribe function
  - Тест: should unsubscribe correctly
  - Тест: should isolate consumer errors
  - Тест: should ignore outdated events based on timestamp
  - Тест: should setup IPC listener on construction
  - Тест: should send events to main via IPC
  - Тест: should log events in debug level
  - Тест: should cleanup IPC listeners on destroy
  - Тест: should reset instance for testing (resetInstance)
  - **Requirements:** realtime-events.1, realtime-events.2, realtime-events.4.7

- [x] 3.5 **Checkpoint: Фаза 3** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): implement RendererEventBus with IPC integration"`

### 4. IPC интеграция

- [x] 4.1 Создать EventIPCHandlers
  - Создать файл `src/main/events/EventIPCHandlers.ts`
  - Реализовать IPC handler для получения событий из renderer
  - **Requirements:** realtime-events.4.1, realtime-events.4.2

- [x] 4.2 Обновить preload script
  - Добавить секцию `events` в существующий объект `api` в `src/preload/index.ts`
  - Реализовать onEvent (возвращает unsubscribe) и sendEvent
  - **Requirements:** realtime-events.4.5, realtime-events.4.6, realtime-events.4.7

- [x] 4.3 Зарегистрировать IPC handlers и инициализировать EventBus в main
  - Обновить `src/main/index.ts`
  - Вызвать `registerEventIPCHandlers()` до создания BrowserWindow
  - Вызвать `MainEventBus.getInstance()` для инициализации при старте
  - **Requirements:** realtime-events.4.1

- [x] 4.4 Написать модульные тесты для IPC handlers
  - Создать файл `tests/unit/events/EventIPCHandlers.test.ts`
  - Тест: should register IPC handler for events from renderer
  - Тест: should forward event to MainEventBus with local option
  - Тест: should not duplicate events from renderer
  - Тест: should handle malformed events gracefully
  - **Requirements:** realtime-events.4

- [x] 4.5 **Checkpoint: Фаза 4** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add IPC handlers and preload integration"`

### 5. React Hook

- [x] 5.1 Создать useEventSubscription hook
  - Создать файл `src/renderer/events/useEventSubscription.ts`
  - Реализовать hook с автоматической отпиской при unmount
  - **Requirements:** realtime-events.7.1, realtime-events.7.2

- [x] 5.2 Создать useEventSubscriptionMultiple hook
  - Реализовать hook для подписки на несколько типов событий
  - **Requirements:** realtime-events.7.3

- [x] 5.3 Создать useEventSubscriptionAll hook
  - Реализовать hook для wildcard подписки
  - **Requirements:** realtime-events.7.4

- [x] 5.4 Написать модульные тесты для hooks
  - Создать файл `tests/unit/hooks/useEventSubscription.test.ts`
  - Тест: should subscribe to event on mount
  - Тест: should unsubscribe on component unmount
  - Тест: should support multiple event types
  - Тест: should support wildcard subscription
  - Тест: should not resubscribe when callback changes (useRef)
  - Тест: should handle React Strict Mode (double mount/unmount)
  - Тест: should call callback with correct event data
  - Тест: should handle errors in callback gracefully
  - **Requirements:** realtime-events.7

- [x] 5.5 **Checkpoint: Фаза 5** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add React hooks for event subscription"`

### 6. Property-Based тесты

- [x] 6.1 Написать property-based тесты для EventBus
  - Создать файл `tests/property/events/EventTypes.property.test.ts`
  - Тест: subscribe always returns unsubscribe function (for any event type)
  - Тест: events are delivered in order by timestamp
  - Тест: no memory leaks after subscribe/unsubscribe cycles
  - Тест: callback isolation (error in one doesn't affect others)
  - Тест: timestamp deduplication works for any sequence of events
  - Тест: batching merges multiple events for same entity within one tick
  - Тест: timestamp cache is cleaned up on entity.deleted
  - **Requirements:** realtime-events.2.4, realtime-events.3.6, realtime-events.6.3, realtime-events.6.5

- [x] 6.2 **Checkpoint: Фаза 6** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add property-based tests for EventBus"`

### 7. Функциональные тесты

- [ ] 7.1 Написать функциональные тесты для IPC
  - Создать файл `tests/functional/realtime-events.spec.ts`
  - Тест: should deliver event from main to renderer via IPC
  - Тест: should deliver event from renderer to main via IPC
  - Тест: should forward events from main to renderer
  - Тест: should forward events from renderer to main
  - Тест: should receive events across IPC boundary
  - **Requirements:** realtime-events.1.4, realtime-events.4, realtime-events.2.9, realtime-events.2.10

- [ ] 7.2 Написать функциональные тесты для UI
  - Тест: should update UI on entity.created
  - Тест: should update UI on entity.updated
  - Тест: should remove from UI on entity.deleted
  - Тест: should update UI smoothly without flickering
  - **Requirements:** realtime-events.5.1, realtime-events.5.2, realtime-events.5.3, realtime-events.5.4

- [ ] 7.3 **Checkpoint: Фаза 7** (запускается при явной просьбе пользователя)
  - Запустить `npm run test:functional` (предупредить: покажет окна на экране)
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add functional tests for IPC and UI"`

### 8. Интеграция и экспорт

- [x] 8.1 Экспортировать API
  - Создать `src/main/events/index.ts`
  - Создать `src/renderer/events/index.ts`
  - **Requirements:** -

- [x] 8.2 Добавить типы в window
  - Обновить interface API в `src/preload/index.ts` для events секции
  - **Requirements:** realtime-events.8

- [x] 8.3 **Checkpoint: Фаза 8** ✅
  - Запустить `npm run validate`
  - Дать резюме выполненной работы
  - Запросить ревью от пользователя
  - После согласования: `git add . && git commit -m "feat(events): add exports and window types"`

### 9. Валидация и финализация

- [x] 9.1 Запустить автоматическую валидацию
  - TypeScript компиляция
  - ESLint проверка
  - Prettier форматирование
  - Модульные тесты
  - Property-based тесты

- [x] 9.2 Проверить покрытие тестами
  - Минимум 85% покрытие строк кода
  - Все требования покрыты тестами

- [ ] 9.3 Запустить функциональные тесты (при явной просьбе пользователя)
  - Запустить `npm run test:functional`
  - Проверить все функциональные тесты проходят

## Зависимости между задачами

```
1.1 → 1.2 → 1.3 → 1.4
       ↓
2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8
       ↓
3.1 → 3.2 → 3.3 → 3.4
       ↓
4.1 → 4.2 → 4.3 → 4.4
       ↓
5.1 → 5.2 → 5.3 → 5.4
       ↓
      6.1
       ↓
7.1 → 7.2
       ↓
8.1 → 8.2
       ↓
9.1 → 9.2 → 9.3
```

## Критерии Завершения

- ✅ Все модульные тесты проходят
- ✅ Все property-based тесты проходят
- ⏳ Все функциональные тесты проходят (ожидает запуска)
- ✅ Покрытие кода ≥ 85%
- ✅ TypeScript компилируется без ошибок
- ✅ События передаются между main и renderer
- ✅ React hook работает корректно
- ✅ Логирование работает с уровнем debug

## Статус

In Progress - Фазы 1-6 и 8 выполнены. Фаза 7 (функциональные тесты) ожидает запуска по запросу пользователя.

## Примечания

- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
- Все комментарии в коде на английском языке
- Спецификации (requirements.md, design.md, tasks.md) на русском языке
- Используется существующий preload script (добавляем секцию events в api)
- mitt устанавливается как production dependency
