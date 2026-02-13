# Документ Дизайна: Real-time Events System

## Обзор

Real-time Events System - это система событий для синхронизации данных в реальном времени между различными частями приложения Clerkly. Система построена на паттерне Publisher-Subscriber и обеспечивает автоматическое обновление UI при изменениях в базе данных.

## Архитектура

### Компоненты системы

```
┌─────────────────────────────────────────────────────────┐
│                     Application                          │
│                                                          │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      │
│  │  Actor   │      │  Actor   │      │  Actor   │      │
│  │    1     │      │    2     │      │    3     │      │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘      │
│       │                 │                  │             │
│       └─────────────────┼──────────────────┘             │
│                         │                                │
│                    ┌────▼────┐                           │
│                    │  Event  │                           │
│                    │   Bus   │                           │
│                    └────┬────┘                           │
│                         │                                │
│       ┌─────────────────┼──────────────────┐             │
│       │                 │                  │             │
│  ┌────▼─────┐      ┌────▼─────┐      ┌────▼─────┐      │
│  │Consumer  │      │Consumer  │      │Consumer  │      │
│  │    1     │      │    2     │      │    3     │      │
│  └──────────┘      └──────────┘      └──────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────┐
         │    BroadcastChannel API          │
         │  (синхронизация между вкладками) │
         └──────────────────────────────────┘
```

### Основные классы

#### EventBus
Центральный компонент для публикации и подписки на события.

```typescript
class EventBus {
  private subscribers: Map<string, Set<EventCallback>>;
  private broadcastChannel: BroadcastChannel | null;
  
  publish(event: Event): void;
  subscribe(eventType: string, callback: EventCallback): UnsubscribeFn;
  unsubscribe(eventType: string, callback: EventCallback): void;
  clear(): void;
}
```

#### Event
Структура события.

```typescript
interface Event {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}
```

## Реализация

### 1. Event Bus

**Файл:** `src/main/events/EventBus.ts`

```typescript
export class EventBus {
  private static instance: EventBus;
  private subscribers = new Map<string, Set<EventCallback>>();
  private broadcastChannel: BroadcastChannel | null = null;
  
  private constructor() {
    this.initBroadcastChannel();
  }
  
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  publish(event: Event): void {
    // Публикация локально
    this.notifySubscribers(event);
    
    // Публикация в другие вкладки
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(event);
    }
  }
  
  subscribe(eventType: string, callback: EventCallback): UnsubscribeFn {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(callback);
    
    return () => this.unsubscribe(eventType, callback);
  }
  
  private notifySubscribers(event: Event): void {
    const callbacks = this.subscribers.get(event.type) || new Set();
    const wildcardCallbacks = this.subscribers.get('*') || new Set();
    
    [...callbacks, ...wildcardCallbacks].forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }
  
  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('clerkly-events');
      this.broadcastChannel.onmessage = (event) => {
        this.notifySubscribers(event.data);
      };
    }
  }
}
```

### 2. React Hook для подписки

**Файл:** `src/renderer/hooks/useEventSubscription.ts`

```typescript
export function useEventSubscription(
  eventType: string,
  callback: EventCallback
): void {
  useEffect(() => {
    const eventBus = EventBus.getInstance();
    const unsubscribe = eventBus.subscribe(eventType, callback);
    
    return () => {
      unsubscribe();
    };
  }, [eventType, callback]);
}
```

### 3. Интеграция с Agents List

**Файл:** `src/renderer/components/agents.tsx`

```typescript
export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  
  // Подписка на события агентов
  useEventSubscription('agent.created', (event) => {
    const newAgent = event.payload as Agent;
    setAgents(prev => [newAgent, ...prev]);
  });
  
  useEventSubscription('agent.updated', (event) => {
    const updatedAgent = event.payload as Agent;
    setAgents(prev => prev.map(agent => 
      agent.id === updatedAgent.id ? updatedAgent : agent
    ));
  });
  
  useEventSubscription('agent.status.changed', (event) => {
    const { agentId, newStatus } = event.payload;
    setAgents(prev => prev.map(agent =>
      agent.id === agentId ? { ...agent, status: newStatus } : agent
    ));
  });
  
  useEventSubscription('message.created', (event) => {
    const { message, agentId } = event.payload;
    // Добавить сообщение в чат
    // Обновить updatedAt агента
  });
  
  // ... остальной код компонента
}
```

## Стратегия Тестирования

### Модульные Тесты

**Файл:** `tests/unit/events/EventBus.test.ts`

- Публикация и получение событий
- Подписка и отписка
- Обработка ошибок в callbacks
- Wildcard подписки
- Изоляция ошибок между консюмерами

### Property-Based Тесты

**Файл:** `tests/property/events/EventBus.property.test.ts`

- Инварианты подписок (подписка всегда возвращает функцию отписки)
- Порядок доставки событий
- Отсутствие утечек памяти при подписках/отписках

### Функциональные Тесты

**Файл:** `tests/functional/realtime-events.spec.ts`

- Синхронизация между вкладками
- Обновление UI при получении событий
- Производительность (100 событий/сек)
- Batching событий

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| realtime-events.1.1 | ✓ | - | ✓ |
| realtime-events.1.2 | ✓ | - | ✓ |
| realtime-events.1.3 | ✓ | - | ✓ |
| realtime-events.2.1 | ✓ | ✓ | ✓ |
| realtime-events.2.2 | ✓ | - | ✓ |
| realtime-events.2.7 | ✓ | - | - |
| realtime-events.3.1 | ✓ | - | ✓ |
| realtime-events.4.1 | ✓ | - | ✓ |
| realtime-events.5.1 | - | - | ✓ |
| realtime-events.6.1 | - | - | ✓ |
| realtime-events.7.2 | - | - | ✓ |

## Производительность

### Оптимизации

1. **Batching событий** - объединение нескольких событий для одной сущности
2. **Throttling** - ограничение частоты обработки событий
3. **Weak references** - для автоматической очистки неиспользуемых подписок
4. **Lazy initialization** - BroadcastChannel создается только при необходимости

### Метрики

- Публикация события: < 1ms
- Доставка события: < 10ms
- Память Event Bus: < 10MB
- Поддержка: 100 событий/сек

## Безопасность

- События не содержат чувствительных данных (пароли, токены)
- Валидация типов событий перед обработкой
- Изоляция ошибок между консюмерами
- Санитизация данных в событиях перед отображением в UI

## Миграция и Обратная Совместимость

- Версионирование событий (v1, v2) для будущих изменений
- Поддержка старых форматов событий при обновлении
- Graceful degradation при отсутствии BroadcastChannel

## Мониторинг и Отладка

### Development режим

```typescript
if (process.env.NODE_ENV === 'development') {
  eventBus.subscribe('*', (event) => {
    console.log('[Event]', event.type, event.payload);
  });
}
```

### Метрики

```typescript
interface EventMetrics {
  totalPublished: number;
  byType: Record<string, number>;
  activeSubscriptions: number;
  averageProcessingTime: number;
  errors: number;
}
```

## Альтернативные Решения

### Рассмотренные альтернативы

1. **Redux** - слишком тяжеловесно для простой событийной системы
2. **RxJS** - избыточная функциональность, большой размер бандла
3. **EventEmitter3** - не поддерживает синхронизацию между вкладками
4. **Custom solution** - ✅ Выбрано: минимальный размер, полный контроль

## Будущие Улучшения

- Event sourcing для полной истории
- Персистентность событий в IndexedDB
- Replay событий
- WebSocket для серверных событий
- Conflict resolution для одновременного редактирования
