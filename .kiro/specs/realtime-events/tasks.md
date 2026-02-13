# Список Задач: Real-time Events System

## Статус: Not Started

## Фазы Реализации

### Фаза 1: Базовая инфраструктура Event Bus

#### 1.1. Создать класс EventBus
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.1.1, realtime-events.2.1
- **Описание:** Реализовать singleton класс EventBus с методами publish, subscribe, unsubscribe

#### 1.2. Реализовать структуру Event
- **Статус:** Not Started
- **Файлы:** `src/main/events/types.ts`
- **Требования:** realtime-events.1.4
- **Описание:** Определить TypeScript интерфейсы для Event, EventCallback, UnsubscribeFn

#### 1.3. Реализовать механизм подписки
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.2.1, realtime-events.2.2, realtime-events.2.3
- **Описание:** Реализовать Map для хранения подписок, поддержка wildcard "*"

#### 1.4. Реализовать механизм публикации
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.1.1, realtime-events.1.7
- **Описание:** Асинхронная публикация событий, уведомление всех подписчиков

#### 1.5. Добавить изоляцию ошибок
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.2.7
- **Описание:** Обернуть callbacks в try-catch, логировать ошибки

### Фаза 2: Синхронизация между вкладками

#### 2.1. Интегрировать BroadcastChannel API
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.5.1, realtime-events.5.2
- **Описание:** Создать BroadcastChannel, отправлять события в другие вкладки

#### 2.2. Реализовать fallback через localStorage
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.5.3
- **Описание:** Использовать localStorage events если BroadcastChannel недоступен

#### 2.3. Предотвратить дублирование событий
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.5.5
- **Описание:** Добавить source ID, не обрабатывать собственные события

#### 2.4. Реализовать cleanup при закрытии вкладки
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.5.6
- **Описание:** Закрывать BroadcastChannel, очищать подписки

### Фаза 3: Типы событий для агентов

#### 3.1. Определить типы событий агентов
- **Статус:** Not Started
- **Файлы:** `src/main/events/types.ts`
- **Требования:** realtime-events.3.1
- **Описание:** Создать константы для agent.created, agent.updated, agent.deleted, agent.status.changed

#### 3.2. Реализовать helper для публикации agent.created
- **Статус:** Not Started
- **Файлы:** `src/main/events/AgentEvents.ts`
- **Требования:** realtime-events.3.2
- **Описание:** Функция publishAgentCreated с полными данными агента

#### 3.3. Реализовать helper для публикации agent.updated
- **Статус:** Not Started
- **Файлы:** `src/main/events/AgentEvents.ts`
- **Требования:** realtime-events.3.3
- **Описание:** Функция publishAgentUpdated с данными и списком измененных полей

#### 3.4. Реализовать helper для публикации agent.status.changed
- **Статус:** Not Started
- **Файлы:** `src/main/events/AgentEvents.ts`
- **Требования:** realtime-events.3.4
- **Описание:** Функция publishAgentStatusChanged с ID, старым и новым статусом

#### 3.5. Реализовать helper для публикации agent.deleted
- **Статус:** Not Started
- **Файлы:** `src/main/events/AgentEvents.ts`
- **Требования:** realtime-events.3.5
- **Описание:** Функция publishAgentDeleted с ID агента

### Фаза 4: Типы событий для сообщений

#### 4.1. Определить типы событий сообщений
- **Статус:** Not Started
- **Файлы:** `src/main/events/types.ts`
- **Требования:** realtime-events.4.1
- **Описание:** Создать константы для message.created, message.updated, message.deleted

#### 4.2. Реализовать helper для публикации message.created
- **Статус:** Not Started
- **Файлы:** `src/main/events/MessageEvents.ts`
- **Требования:** realtime-events.4.2
- **Описание:** Функция publishMessageCreated с данными сообщения и ID агента

#### 4.3. Реализовать helper для публикации message.updated
- **Статус:** Not Started
- **Файлы:** `src/main/events/MessageEvents.ts`
- **Требования:** realtime-events.4.3
- **Описание:** Функция publishMessageUpdated

#### 4.4. Реализовать helper для публикации message.deleted
- **Статус:** Not Started
- **Файлы:** `src/main/events/MessageEvents.ts`
- **Требования:** realtime-events.4.4
- **Описание:** Функция publishMessageDeleted

### Фаза 5: React интеграция

#### 5.1. Создать React hook useEventSubscription
- **Статус:** Not Started
- **Файлы:** `src/renderer/hooks/useEventSubscription.ts`
- **Требования:** realtime-events.2.8
- **Описание:** Hook для подписки на события с автоматической отпиской при unmount

#### 5.2. Интегрировать с Agents List компонентом
- **Статус:** Not Started
- **Файлы:** `src/renderer/components/agents.tsx`
- **Требования:** realtime-events.6.1, realtime-events.6.2, realtime-events.6.3, realtime-events.6.4
- **Описание:** Подписаться на события агентов и сообщений, обновлять UI

#### 5.3. Реализовать защиту от перезаписи пользовательских изменений
- **Статус:** Not Started
- **Файлы:** `src/renderer/components/agents.tsx`
- **Требования:** realtime-events.6.6
- **Описание:** Проверять, редактирует ли пользователь данные перед обновлением

#### 5.4. Добавить плавные анимации обновлений
- **Статус:** Not Started
- **Файлы:** `src/renderer/components/agents.tsx`
- **Требования:** realtime-events.6.5
- **Описание:** CSS transitions для обновлений UI

### Фаза 6: Оптимизация производительности

#### 6.1. Реализовать batching событий
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.7.4
- **Описание:** Объединять события одного типа для одной сущности

#### 6.2. Добавить throttling для частых событий
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.7.3
- **Описание:** Ограничить частоту обработки событий

#### 6.3. Реализовать автоматическую очистку подписок
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** realtime-events.7.5
- **Описание:** Использовать WeakMap для автоматической очистки

#### 6.4. Добавить метрики производительности
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventMetrics.ts`
- **Требования:** realtime-events.7.6
- **Описание:** Собирать метрики: количество событий, время обработки, ошибки

### Фаза 7: Тестирование

#### 7.1. Написать модульные тесты для EventBus
- **Статус:** Not Started
- **Файлы:** `tests/unit/events/EventBus.test.ts`
- **Требования:** Все требования realtime-events.1, realtime-events.2
- **Описание:** Тесты публикации, подписки, отписки, изоляции ошибок

#### 7.2. Написать property-based тесты
- **Статус:** Not Started
- **Файлы:** `tests/property/events/EventBus.property.test.ts`
- **Требования:** realtime-events.2.1, realtime-events.7.5
- **Описание:** Инварианты подписок, отсутствие утечек памяти

#### 7.3. Написать функциональные тесты
- **Статус:** Not Started
- **Файлы:** `tests/functional/realtime-events.spec.ts`
- **Требования:** realtime-events.5, realtime-events.6, realtime-events.7
- **Описание:** Синхронизация между вкладками, обновление UI, производительность

#### 7.4. Написать тесты для React hook
- **Статус:** Not Started
- **Файлы:** `tests/unit/hooks/useEventSubscription.test.ts`
- **Требования:** realtime-events.2.8
- **Описание:** Тесты подписки, отписки при unmount

### Фаза 8: Документация и мониторинг

#### 8.1. Добавить логирование в development режиме
- **Статус:** Not Started
- **Файлы:** `src/main/events/EventBus.ts`
- **Требования:** Нефункциональные требования
- **Описание:** Логировать все события в development

#### 8.2. Создать dashboard для метрик
- **Статус:** Not Started
- **Файлы:** `src/renderer/components/EventsDashboard.tsx`
- **Требования:** Нефункциональные требования
- **Описание:** Визуализация метрик событий (только для development)

#### 8.3. Написать документацию по использованию
- **Статус:** Not Started
- **Файлы:** `docs/realtime-events.md`
- **Требования:** -
- **Описание:** Примеры использования, best practices

## Зависимости между задачами

```
1.1 → 1.2 → 1.3 → 1.4 → 1.5
              ↓
            2.1 → 2.2 → 2.3 → 2.4
                          ↓
                        3.1 → 3.2, 3.3, 3.4, 3.5
                          ↓
                        4.1 → 4.2, 4.3, 4.4
                          ↓
                        5.1 → 5.2 → 5.3, 5.4
                          ↓
                        6.1, 6.2, 6.3, 6.4
                          ↓
                        7.1, 7.2, 7.3, 7.4
                          ↓
                        8.1, 8.2, 8.3
```

## Оценка времени

- **Фаза 1:** 2-3 дня
- **Фаза 2:** 2 дня
- **Фаза 3:** 1 день
- **Фаза 4:** 1 день
- **Фаза 5:** 2-3 дня
- **Фаза 6:** 2 дня
- **Фаза 7:** 3-4 дня
- **Фаза 8:** 1 день

**Итого:** 14-17 дней

## Критерии Завершения

- ✅ Все модульные тесты проходят
- ✅ Все property-based тесты проходят
- ✅ Все функциональные тесты проходят
- ✅ Покрытие кода ≥ 85%
- ✅ События синхронизируются между вкладками
- ✅ UI обновляется в реальном времени
- ✅ Производительность: 100 событий/сек
- ✅ Документация написана
