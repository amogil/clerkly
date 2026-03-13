# Дизайн: Reactive UI Architecture

## Обзор

Документ фиксирует кросс-фичевый дизайн реактивного UI слоя в Clerkly: как renderer получает snapshot-события, применяет их в state и обновляет компоненты без ручного refresh/polling.

## Границы ответственности

Этот документ описывает только app-level паттерны.

В scope:
- подписки renderer на snapshot-события;
- применение snapshot в hooks/store;
- правила обновления single-entity/list state;
- инварианты консистентности UI data-flow.

Вне scope:
- transport, IPC и типизация event-контрактов (`docs/specs/realtime-events/*`);
- рендер-детали конкретных экранов и feature-компонентов (`docs/specs/agents/*` и другие профильные спеки);
- runtime/pipeline-оркестрация (`docs/specs/llm-integration/*`, `docs/specs/code_exec/*`).

## Архитектурный поток

```text
Main domain state change
  -> MainEventBus publishes snapshot event
  -> IPC bridge delivers event to renderer
  -> RendererEventBus emits typed payload
  -> hook/store applies snapshot to local state
  -> subscribed component re-renders
```

Инварианты:
- renderer использует вычисляемые поля из snapshot напрямую;
- renderer не выполняет повторные бизнес-вычисления для уже вычисленных snapshot-полей;
- при create/update/archive UI обновляется из события, а не через повторный запрос этой же сущности;
- подписки очищаются при unmount.

## Паттерны подписки

### 1. Single Entity

Применение:
- компоненту нужен один объект по `id`.

Паттерн:
- hook хранит `EntitySnapshot | null`;
- при `ENTITY_UPDATED/ENTITY_ARCHIVED` фильтрует событие по `id`;
- обновляет или очищает локальное состояние.

### 2. Entity List

Применение:
- компоненту нужен список сущностей.

Паттерн:
- hook хранит `EntitySnapshot[]`;
- `ENTITY_CREATED` добавляет элемент;
- `ENTITY_UPDATED` заменяет элемент по `id`;
- `ENTITY_ARCHIVED` удаляет элемент;
- порядок списка определяется полями snapshot (например, `updatedAt`), без дополнительных запросов.

### 3. Computed Field Display

Применение:
- компонент показывает производное поле (status/badge/label/time marker).

Паттерн:
- компонент читает значение из snapshot;
- UI-слой не пересчитывает поле из сырой истории данных;
- форматирование в renderer допускается только presentation-level (например, формат даты).

### 4. Related Entities

Применение:
- компонент зависит от нескольких сущностей.

Паттерн:
- отдельный hook на каждую сущность/коллекцию;
- композиция hooks в компоненте;
- каждый hook подписывается только на свой event-domain.

## Миграционные правила

При переводе feature на snapshot-first модель:
1. Выделить snapshot-тип как единый source-of-truth для renderer.
2. Перенести бизнес-вычисления в main/domain слой.
3. В renderer заменить пересчёты на чтение готовых snapshot-полей.
4. Переписать hooks на event-driven обновление state.
5. Добавить тесты на реактивное обновление без ручного refresh.

## Стратегия тестирования

### Модульные Тесты

- `tests/unit/events/RendererEventBus.test.ts` — доставка snapshot-событий подписчикам renderer.
- `tests/unit/events/MainEventBus.test.ts` — публикация snapshot-событий и инварианты подписки.

### Функциональные Тесты

- `tests/functional/agent-realtime-events.spec.ts` — обновление UI из snapshot-событий без ручного refresh.
- `tests/functional/agent-reordering.spec.ts` — пересортировка списка по incoming snapshot.
- `tests/functional/agent-switching.spec.ts` — консистентность данных при переключении между реактивно синхронизированными сущностями.

### Покрытие Требований

| Требование | Модульные тесты | Функциональные тесты |
|------------|-----------------|----------------------|
| reactive-ui-architecture.1 | ✓ | ✓ |

