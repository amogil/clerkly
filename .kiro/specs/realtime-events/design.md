# Документ Дизайна: Real-time Events System

## Обзор

Real-time Events System — система событий для синхронизации данных в реальном времени между различными частями приложения Clerkly. Система построена на паттерне Publisher-Subscriber с использованием библиотеки mitt и Electron IPC.

### Цели Дизайна

- Обеспечить асинхронную коммуникацию между компонентами приложения
- Минимизировать связанность между продюсерами и консюмерами событий
- Обеспечить типобезопасность событий через TypeScript generics
- Автоматически синхронизировать события между main и renderer процессами
- Предоставить удобный React hook для подписки на события
- Обеспечить производительность (< 10ms на событие, 100+ событий/сек)

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **React**: Библиотека для построения UI компонентов
- **mitt**: Минималистичный event emitter (~200 bytes)
- **IPC**: Electron межпроцессное взаимодействие для передачи событий
- **Logger**: Централизованный класс для логирования (clerkly.3)

## Архитектура

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Producer   │     │   Producer   │     │   Producer   │    │
│  │      1       │     │      2       │     │      3       │    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   MainEventBus    │                        │
│                    │      (mitt)       │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│  ┌──────▼───────┐     ┌──────▼───────┐     ┌─────▼────────┐    │
│  │   Consumer   │     │   Consumer   │     │  IPC Bridge  │    │
│  │      1       │     │      2       │     │  (to renderer)│   │
│  └──────────────┘     └──────────────┘     └──────┬───────┘    │
│                                                    │             │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
                              ┌──────────────────────┼──────────────┐
                              │    Preload Script    │              │
                              │   (contextBridge)    │              │
                              └──────────────────────┼──────────────┘
                                                     │
┌────────────────────────────────────────────────────┼─────────────┐
│                     Renderer Process               │              │
│                                                    │              │
│                    ┌───────────────────────────────▼─────┐       │
│                    │        RendererEventBus            │       │
│                    │             (mitt)                  │       │
│                    └───────────────────────────────┬─────┘       │
│                                                    │              │
│         ┌────────────────────┼────────────────────┐              │
│         │                    │                    │              │
│  ┌──────▼───────┐     ┌──────▼───────┐     ┌─────▼────────┐     │
│  │    React     │     │    React     │     │    React     │     │
│  │  Component   │     │  Component   │     │  Component   │     │
│  │  (useEvent)  │     │  (useEvent)  │     │  (useEvent)  │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Структура файлов

```
src/
├── shared/
│   └── events/
│       ├── types.ts              # TypeScript типы всех событий (единый источник истины)
│       └── constants.ts          # Константы (IPC channel names)
├── main/
│   └── events/
│       ├── MainEventBus.ts       # EventBus для main процесса
│       └── EventIPCHandlers.ts   # IPC handlers для пересылки событий
├── renderer/
│   └── events/
│       ├── RendererEventBus.ts   # EventBus для renderer процесса
│       └── useEventSubscription.ts # React hook
└── preload/
    └── index.ts                  # Добавить events секцию в существующий preload
```

## Реализация

### 1. Типы событий

**Файл:** `src/shared/events/types.ts`

```typescript
// Requirements: realtime-events.1.2, realtime-events.3, realtime-events.8

// Базовая структура события
export interface BaseEvent<T extends string, P> {
  type: T;
  payload: P;
  timestamp: number;
  source: 'main' | 'renderer';
}

// Типы payload для каждого события
export interface AgentCreatedPayload {
  id: string;
  name: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentUpdatedPayload {
  id: string;
  name?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
  changedFields: string[];
}

export interface AgentDeletedPayload {
  id: string;
}

export interface MessageCreatedPayload {
  id: number;
  agentId: string;
  kind: string;
  timestamp: string;
}

export interface MessageUpdatedPayload {
  id: number;
  agentId: string;
  changedFields: string[];
}

export interface UserLoginPayload {
  userId: string;
}

export interface UserLogoutPayload {
  userId: string;
}

export interface UserProfileUpdatedPayload {
  userId: string;
  changedFields: string[];
}

// Карта всех событий
export type ClerklyEvents = {
  'agent.created': AgentCreatedPayload;
  'agent.updated': AgentUpdatedPayload;
  'agent.deleted': AgentDeletedPayload;
  'message.created': MessageCreatedPayload;
  'message.updated': MessageUpdatedPayload;
  'user.login': UserLoginPayload;
  'user.logout': UserLogoutPayload;
  'user.profile.updated': UserProfileUpdatedPayload;
};

// Типы для EventBus
export type EventType = keyof ClerklyEvents;
export type EventPayload<T extends EventType> = ClerklyEvents[T];
export type Event<T extends EventType> = BaseEvent<T, EventPayload<T>>;
export type AnyEvent = Event<EventType>;

// Callback типы
export type EventCallback<T extends EventType> = (event: Event<T>) => void;
export type WildcardCallback = (type: EventType, event: AnyEvent) => void;

// Опции публикации
export interface PublishOptions {
  local?: boolean;  // Только локальная доставка (без IPC)
}
```

### 2. MainEventBus

**Файл:** `src/main/events/MainEventBus.ts`

```typescript
// Requirements: realtime-events.1, realtime-events.2, realtime-events.4

import mitt, { Emitter } from 'mitt';
import { BrowserWindow } from 'electron';
import { Logger } from '../Logger';
import {
  ClerklyEvents,
  EventType,
  Event,
  EventCallback,
  WildcardCallback,
  PublishOptions,
  AnyEvent,
} from '../../shared/events/types';
import { IPC_EVENT_CHANNEL } from '../../shared/events/constants';

type UnsubscribeFn = () => void;

export class MainEventBus {
  private static instance: MainEventBus;
  private emitter: Emitter<ClerklyEvents>;
  private logger: Logger;
  private lastEventTimestamps: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 минута
  private static readonly STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 часов
  
  // Requirements: realtime-events.6.3 - Batching
  private pendingEvents: Map<string, AnyEvent> = new Map();
  private batchScheduled: boolean = false;

  private constructor() {
    this.emitter = mitt<ClerklyEvents>();
    this.logger = new Logger('MainEventBus');
    this.startCleanupInterval();
  }

  static getInstance(): MainEventBus {
    if (!MainEventBus.instance) {
      MainEventBus.instance = new MainEventBus();
    }
    return MainEventBus.instance;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleTimestamps();
    }, MainEventBus.CLEANUP_INTERVAL_MS);
  }

  private cleanupStaleTimestamps(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.lastEventTimestamps) {
      if (now - timestamp > MainEventBus.STALE_THRESHOLD_MS) {
        this.lastEventTimestamps.delete(key);
      }
    }
  }

  // Requirements: realtime-events.6.3 - Batching в пределах одного tick
  private scheduleBatchFlush(): void {
    if (this.batchScheduled) return;
    this.batchScheduled = true;
    
    queueMicrotask(() => {
      this.flushPendingEvents();
      this.batchScheduled = false;
    });
  }

  private flushPendingEvents(): void {
    for (const [, event] of this.pendingEvents) {
      this.emitter.emit(event.type, event.payload as any);
      this.broadcastToRenderers(event);
    }
    this.pendingEvents.clear();
  }

  publish<T extends EventType>(
    type: T,
    payload: ClerklyEvents[T],
    options: PublishOptions = {}
  ): void {
    const event: Event<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'main',
    };

    this.logger.debug(`Publishing event: ${type}`, { payload });

    // Cleanup timestamp при delete событии
    this.cleanupEntityTimestamp(type, payload);

    // Requirements: realtime-events.6.3 - Batching для событий одной сущности
    const entityKey = this.getEntityKey(type, payload);
    if (entityKey && !options.local) {
      // Batching: заменяем предыдущее событие для той же сущности
      const batchKey = `${type}:${entityKey}`;
      this.pendingEvents.set(batchKey, event as AnyEvent);
      this.scheduleBatchFlush();
    } else {
      // Немедленная доставка для local-only или событий без entity
      this.emitter.emit(type, payload);
      if (!options.local) {
        this.broadcastToRenderers(event as AnyEvent);
      }
    }
  }

  subscribe<T extends EventType>(
    type: T,
    callback: EventCallback<T>
  ): UnsubscribeFn {
    const handler = (payload: ClerklyEvents[T]) => {
      const event: Event<T> = {
        type,
        payload,
        timestamp: Date.now(),
        source: 'main',
      };

      // Проверка timestamp для предотвращения обработки устаревших событий
      const entityKey = this.getEntityKey(type, payload);
      if (entityKey) {
        const lastTimestamp = this.lastEventTimestamps.get(entityKey) || 0;
        if (event.timestamp < lastTimestamp) {
          this.logger.debug(`Ignoring outdated event: ${type}`, { entityKey });
          return;
        }
        this.lastEventTimestamps.set(entityKey, event.timestamp);
      }

      try {
        callback(event);
      } catch (error) {
        this.logger.error(`Error in event callback for ${type}:`, error);
      }
    };

    this.emitter.on(type, handler);
    return () => this.emitter.off(type, handler);
  }

  subscribeAll(callback: WildcardCallback): UnsubscribeFn {
    const handler = (type: EventType, payload: ClerklyEvents[EventType]) => {
      const event: AnyEvent = {
        type,
        payload,
        timestamp: Date.now(),
        source: 'main',
      } as AnyEvent;

      try {
        callback(type, event);
      } catch (error) {
        this.logger.error(`Error in wildcard callback:`, error);
      }
    };

    this.emitter.on('*', handler as any);
    return () => this.emitter.off('*', handler as any);
  }

  private broadcastToRenderers(event: AnyEvent): void {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_EVENT_CHANNEL, event);
      }
    }
  }

  private getEntityKey(type: EventType, payload: any): string | null {
    if (type.startsWith('agent.') && payload.id) {
      return `agent:${payload.id}`;
    }
    if (type.startsWith('message.') && payload.id) {
      return `message:${payload.id}`;
    }
    if (type.startsWith('user.') && payload.userId) {
      return `user:${payload.userId}`;
    }
    return null;
  }

  // Requirements: realtime-events.6.5
  private cleanupEntityTimestamp(type: EventType, payload: any): void {
    if (type.endsWith('.deleted')) {
      const entityKey = this.getEntityKey(type, payload);
      if (entityKey) {
        this.lastEventTimestamps.delete(entityKey);
      }
    }
  }

  clear(): void {
    this.emitter.all.clear();
    this.lastEventTimestamps.clear();
    this.pendingEvents.clear();
  }

  destroy(): void {
    this.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Для тестов: сброс singleton
  static resetInstance(): void {
    if (MainEventBus.instance) {
      MainEventBus.instance.destroy();
      MainEventBus.instance = null as any;
    }
  }
}
```

### 3. RendererEventBus

**Файл:** `src/renderer/events/RendererEventBus.ts`

```typescript
// Requirements: realtime-events.1, realtime-events.2, realtime-events.4

import mitt, { Emitter } from 'mitt';
import { Logger } from '../Logger';
import {
  ClerklyEvents,
  EventType,
  Event,
  EventCallback,
  WildcardCallback,
  PublishOptions,
  AnyEvent,
} from '../../shared/events/types';

type UnsubscribeFn = () => void;

export class RendererEventBus {
  private static instance: RendererEventBus;
  private emitter: Emitter<ClerklyEvents>;
  private logger: Logger;
  private lastEventTimestamps: Map<string, number> = new Map();
  private ipcUnsubscribe: (() => void) | null = null;

  private constructor() {
    this.emitter = mitt<ClerklyEvents>();
    this.logger = new Logger('RendererEventBus');
    this.setupIPCListener();
  }

  static getInstance(): RendererEventBus {
    if (!RendererEventBus.instance) {
      RendererEventBus.instance = new RendererEventBus();
    }
    return RendererEventBus.instance;
  }

  private setupIPCListener(): void {
    // Получение событий из main через preload
    if (window.api?.events?.onEvent) {
      this.ipcUnsubscribe = window.api.events.onEvent((event: AnyEvent) => {
        this.logger.debug(`Received event from main: ${event.type}`);
        this.emitter.emit(event.type, event.payload as any);
      });
    }
  }

  publish<T extends EventType>(
    type: T,
    payload: ClerklyEvents[T],
    options: PublishOptions = {}
  ): void {
    const event: Event<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'renderer',
    };

    this.logger.debug(`Publishing event: ${type}`, { payload });

    // Локальная доставка
    this.emitter.emit(type, payload);

    // IPC доставка к main (если не local-only)
    if (!options.local && window.api?.events?.sendEvent) {
      window.api.events.sendEvent(event);
    }
  }

  subscribe<T extends EventType>(
    type: T,
    callback: EventCallback<T>
  ): UnsubscribeFn {
    const handler = (payload: ClerklyEvents[T]) => {
      const event: Event<T> = {
        type,
        payload,
        timestamp: Date.now(),
        source: 'renderer',
      };

      // Проверка timestamp
      const entityKey = this.getEntityKey(type, payload);
      if (entityKey) {
        const lastTimestamp = this.lastEventTimestamps.get(entityKey) || 0;
        if (event.timestamp < lastTimestamp) {
          this.logger.debug(`Ignoring outdated event: ${type}`, { entityKey });
          return;
        }
        this.lastEventTimestamps.set(entityKey, event.timestamp);
      }

      try {
        callback(event);
      } catch (error) {
        this.logger.error(`Error in event callback for ${type}:`, error);
      }
    };

    this.emitter.on(type, handler);
    return () => this.emitter.off(type, handler);
  }

  subscribeAll(callback: WildcardCallback): UnsubscribeFn {
    const handler = (type: EventType, payload: ClerklyEvents[EventType]) => {
      const event: AnyEvent = {
        type,
        payload,
        timestamp: Date.now(),
        source: 'renderer',
      } as AnyEvent;

      try {
        callback(type, event);
      } catch (error) {
        this.logger.error(`Error in wildcard callback:`, error);
      }
    };

    this.emitter.on('*', handler as any);
    return () => this.emitter.off('*', handler as any);
  }

  private getEntityKey(type: EventType, payload: any): string | null {
    if (type.startsWith('agent.') && payload.id) {
      return `agent:${payload.id}`;
    }
    if (type.startsWith('message.') && payload.id) {
      return `message:${payload.id}`;
    }
    if (type.startsWith('user.') && payload.userId) {
      return `user:${payload.userId}`;
    }
    return null;
  }

  clear(): void {
    this.emitter.all.clear();
    this.lastEventTimestamps.clear();
  }

  // Requirements: realtime-events.4.7
  destroy(): void {
    this.clear();
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
    }
  }

  // Для тестов: сброс singleton
  static resetInstance(): void {
    if (RendererEventBus.instance) {
      RendererEventBus.instance.destroy();
      RendererEventBus.instance = null as any;
    }
  }
}
```

### 4. React Hook

**Файл:** `src/renderer/events/useEventSubscription.ts`

```typescript
// Requirements: realtime-events.7

import { useEffect, useCallback, useRef } from 'react';
import { RendererEventBus } from './RendererEventBus';
import {
  EventType,
  Event,
  EventCallback,
  WildcardCallback,
} from '../../shared/events/types';

export function useEventSubscription<T extends EventType>(
  eventType: T,
  callback: EventCallback<T>
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();
    
    const handler: EventCallback<T> = (event) => {
      callbackRef.current(event);
    };

    const unsubscribe = eventBus.subscribe(eventType, handler);
    return unsubscribe;
  }, [eventType]);
}

export function useEventSubscriptionMultiple(
  eventTypes: EventType[],
  callback: WildcardCallback
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();
    const unsubscribes: (() => void)[] = [];

    for (const eventType of eventTypes) {
      const handler = (event: Event<typeof eventType>) => {
        callbackRef.current(eventType, event as any);
      };
      unsubscribes.push(eventBus.subscribe(eventType, handler));
    }

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [eventTypes.join(',')]);
}

export function useEventSubscriptionAll(callback: WildcardCallback): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventBus = RendererEventBus.getInstance();
    
    const handler: WildcardCallback = (type, event) => {
      callbackRef.current(type, event);
    };

    const unsubscribe = eventBus.subscribeAll(handler);
    return unsubscribe;
  }, []);
}
```

### 5. IPC Handlers

**Файл:** `src/main/events/EventIPCHandlers.ts`

```typescript
// Requirements: realtime-events.4

import { ipcMain } from 'electron';
import { MainEventBus } from './MainEventBus';
import { Logger } from '../Logger';
import { IPC_EVENT_CHANNEL, IPC_EVENT_FROM_RENDERER } from '../../shared/events/constants';
import { AnyEvent, EventType } from '../../shared/events/types';

const logger = new Logger('EventIPCHandlers');

export function registerEventIPCHandlers(): void {
  // Получение событий из renderer
  ipcMain.on(IPC_EVENT_FROM_RENDERER, (event, data: AnyEvent) => {
    logger.debug(`Received event from renderer: ${data.type}`);
    
    const eventBus = MainEventBus.getInstance();
    // Публикуем локально в main (без пересылки обратно в renderer)
    eventBus.publish(data.type as EventType, data.payload, { local: true });
  });
}
```

### 6. Preload Script интеграция

**Файл:** `src/preload/index.ts`

Добавить секцию `events` в существующий объект `api` (аналогично `auth`, `error`, `settings`):

```typescript
// Requirements: realtime-events.4, realtime-events.4.7

// Добавить в interface API:
interface API {
  // ... существующие секции ...
  
  // Requirements: realtime-events.4.5, realtime-events.4.6
  events: {
    onEvent: (callback: (event: AnyEvent) => void) => () => void;
    sendEvent: (event: AnyEvent) => void;
  };
}

// Добавить в объект api:
const api: API = {
  // ... существующие секции ...
  
  // Requirements: realtime-events.4.5, realtime-events.4.6, realtime-events.4.7
  events: {
    /**
     * Listen for events from main process
     * @param {Function} callback - Callback function to execute when event is received
     * @returns {Function} Unsubscribe function to remove the listener
     */
    onEvent(callback: (event: AnyEvent) => void): () => void {
      const listener = (_event: any, data: AnyEvent) => {
        callback(data);
      };
      ipcRenderer.on(IPC_EVENT_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(IPC_EVENT_CHANNEL, listener);
      };
    },

    /**
     * Send event to main process
     * @param {AnyEvent} event - Event to send
     */
    sendEvent(event: AnyEvent): void {
      ipcRenderer.send(IPC_EVENT_FROM_RENDERER, event);
    },
  },
};
```

**Важно:** Функция `onEvent` возвращает unsubscribe функцию для корректной очистки при hot reload.

### 7. Константы

**Файл:** `src/shared/events/constants.ts`

```typescript
// IPC channel names
export const IPC_EVENT_CHANNEL = 'clerkly:event';
export const IPC_EVENT_FROM_RENDERER = 'clerkly:event:from-renderer';
```

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы.

### Property 1: Fire-and-Forget семантика

*Для любого* опубликованного события, продюсер НЕ должен ждать обработки консюмерами. Публикация события должна завершиться немедленно.

**Validates: Requirements realtime-events.1.3**

### Property 2: Изоляция ошибок консюмеров

*Для любой* ошибки, выброшенной в callback консюмера, она НЕ должна влиять на других консюмеров того же события.

**Validates: Requirements realtime-events.2.7**

### Property 3: Timestamp-based deduplication

*Для любой* последовательности событий одной сущности, события с более старым timestamp должны игнорироваться, если уже обработано событие с более новым timestamp.

**Validates: Requirements realtime-events.5.5**

### Property 4: Unsubscribe функция

*Для любой* подписки на событие, метод subscribe должен возвращать функцию для отписки. Вызов этой функции должен прекратить доставку событий данному консюмеру.

**Validates: Requirements realtime-events.2.4**

### Property 5: changedFields обязателен для updated событий

*Для любого* события типа `{entity}.updated`, payload ДОЛЖЕН содержать поле `changedFields: string[]`.

**Validates: Requirements realtime-events.3.3**

## Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Множественные события одной сущности в одном tick**: События должны объединяться (batching), доставляется только последнее событие.

2. **Событие при отсутствии консюмеров**: Событие должно быть опубликовано без ошибок, даже если нет подписчиков.

3. **Подписка во время обработки события**: Новый консюмер не должен получить текущее событие, только последующие.

4. **Отписка во время обработки события**: Отписавшийся консюмер не должен получать последующие события.

5. **IPC недоступен**: События должны доставляться только локально без ошибок.

6. **Очень большой payload (> 1MB)**: Событие должно быть отклонено или обрезано с логированием предупреждения.

7. **React Strict Mode**: Hook должен корректно обрабатывать двойной mount/unmount.

## Обработка Ошибок

### Стратегия Обработки Ошибок

Система событий должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка в callback консюмера

**Причины:**
- Исключение в пользовательском коде
- Ошибка доступа к данным
- TypeError при обработке payload

**Обработка:**
```typescript
// Requirements: realtime-events.2.7
try {
  callback(event);
} catch (error) {
  this.logger.error(`Error in event callback for ${type}:`, error);
  // Продолжаем доставку другим консюмерам
}
```

**Результат:** Ошибка логируется, другие консюмеры получают событие.

#### 2. Ошибка отправки IPC события

**Причины:**
- Окно закрыто или уничтожено
- Renderer Process не готов
- Ошибка сериализации

**Обработка:**
```typescript
// Requirements: realtime-events.4.4
private broadcastToRenderers(event: AnyEvent): void {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    if (!window.isDestroyed()) {
      try {
        window.webContents.send(IPC_EVENT_CHANNEL, event);
      } catch (error) {
        this.logger.error('Failed to send IPC event:', error);
      }
    }
  }
}
```

**Результат:** Ошибка логируется, событие доставляется локально.

#### 3. Ошибка десериализации события из IPC

**Причины:**
- Некорректный формат данных
- Несовместимые типы

**Обработка:**
```typescript
// Requirements: realtime-events.4.6
ipcMain.on(IPC_EVENT_FROM_RENDERER, (event, data: AnyEvent) => {
  if (!data || !data.type || !data.payload) {
    logger.error('Received malformed event from renderer:', data);
    return;
  }
  // Обработка события
});
```

**Результат:** Ошибка логируется, событие игнорируется.

## Примеры Использования

### 1. Публикация события создания агента

```typescript
// Requirements: realtime-events.1.1, realtime-events.3.2
const eventBus = MainEventBus.getInstance();

eventBus.publish('agent.created', {
  id: 'agent-123',
  name: 'My Agent',
  userId: 'user-456',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

### 2. Подписка на события в React компоненте

```typescript
// Requirements: realtime-events.7.1, realtime-events.7.2
function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEventSubscription('agent.created', (event) => {
    setAgents(prev => [...prev, event.payload]);
  });

  useEventSubscription('agent.deleted', (event) => {
    setAgents(prev => prev.filter(a => a.id !== event.payload.id));
  });

  return <ul>{agents.map(a => <li key={a.id}>{a.name}</li>)}</ul>;
}
```

### 3. Публикация события обновления с changedFields

```typescript
// Requirements: realtime-events.3.3
eventBus.publish('agent.updated', {
  id: 'agent-123',
  name: 'Updated Name',
  updatedAt: new Date().toISOString(),
  changedFields: ['name', 'updatedAt'], // ОБЯЗАТЕЛЬНО
});
```

### 4. Wildcard подписка для логирования

```typescript
// Requirements: realtime-events.2.3
const eventBus = MainEventBus.getInstance();

eventBus.subscribeAll((type, event) => {
  console.log(`[Event] ${type}:`, event.payload);
});
```

### 5. Локальная публикация (без IPC)

```typescript
// Requirements: realtime-events.1.6
eventBus.publish('user.login', { userId: 'user-123' }, { local: true });
// Событие доставляется только в текущем процессе
```

## Стратегия Тестирования

### Двойной Подход к Тестированию

Система событий будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют end-to-end сценарии с реальным Electron IPC

### Модульные Тесты

#### EventBus (Main и Renderer)

**Файл:** `tests/unit/events/EventBus.test.ts`

| Тест | Требование |
|------|------------|
| should publish event with type and payload | realtime-events.1.1 |
| should include timestamp in event | realtime-events.1.2 |
| should deliver event locally within same process | realtime-events.1.5 |
| should receive events after subscription | realtime-events.2.1 |
| should support multiple event types subscription | realtime-events.2.2 |
| should support wildcard subscription | realtime-events.2.3 |
| should return unsubscribe function | realtime-events.2.4 |
| should unsubscribe correctly | realtime-events.2.4 |
| should isolate consumer errors | realtime-events.2.7 |
| should not duplicate events | realtime-events.4.3 |
| should serialize events correctly | realtime-events.4.6 |
| should ignore outdated events based on timestamp | realtime-events.5.5 |
| should handle 100 events per second | realtime-events.6.2 |
| should cleanup subscriptions on clear() | realtime-events.6.5 |
| should log events in debug level | Нефункциональные |

#### Event Types

**Файл:** `tests/unit/events/EventTypes.test.ts`

| Тест | Требование |
|------|------------|
| should emit entity.created with full data | realtime-events.3.2 |
| should emit entity.updated with changedFields | realtime-events.3.3 |
| should emit entity.deleted with ID only | realtime-events.3.4 |
| should support custom event types | realtime-events.3.5 |
| should include timestamp in all events | realtime-events.3.6 |

#### React Hook

**Файл:** `tests/unit/hooks/useEventSubscription.test.ts`

| Тест | Требование |
|------|------------|
| should subscribe to event on mount | realtime-events.7.1 |
| should unsubscribe on component unmount | realtime-events.7.2 |
| should support multiple event types | realtime-events.7.3 |
| should support wildcard subscription | realtime-events.7.4 |
| should not resubscribe when callback changes | realtime-events.7.5 |
| should handle React Strict Mode | realtime-events.7.6 |

#### IPC Handlers

**Файл:** `tests/unit/events/EventIPCHandlers.test.ts`

| Тест | Требование |
|------|------------|
| should register IPC handler | realtime-events.4.1 |
| should forward event to MainEventBus | realtime-events.4.2 |
| should not duplicate events from renderer | realtime-events.4.3 |

### Property-Based Тесты

**Файл:** `tests/property/events/EventBus.property.test.ts`

| Тест | Требование |
|------|------------|
| subscribe always returns unsubscribe function | realtime-events.2.4 |
| events are delivered in order by timestamp | realtime-events.3.6 |
| no memory leaks after subscribe/unsubscribe cycles | realtime-events.6.5 |

### Функциональные Тесты

**Файл:** `tests/functional/realtime-events.spec.ts`

| Тест | Требование |
|------|------------|
| should deliver event from main to renderer via IPC | realtime-events.1.4 |
| should deliver event from renderer to main via IPC | realtime-events.4.2 |
| should forward events from main to renderer | realtime-events.4.1 |
| should forward events from renderer to main | realtime-events.4.2 |
| should receive events across IPC boundary | realtime-events.2.9, realtime-events.2.10 |
| should update UI on entity.created | realtime-events.5.1 |
| should update UI on entity.updated | realtime-events.5.2 |
| should remove from UI on entity.deleted | realtime-events.5.3 |

### Покрытие Требований

| Требование | Модульные | Property-Based | Функциональные |
|------------|-----------|----------------|----------------|
| realtime-events.1.1 | ✓ | - | - |
| realtime-events.1.2 | ✓ | - | - |
| realtime-events.1.3 | ✓ | - | - |
| realtime-events.1.4 | - | - | ✓ |
| realtime-events.1.5 | ✓ | - | - |
| realtime-events.1.6 | ✓ | - | - |
| realtime-events.2.1 | ✓ | - | - |
| realtime-events.2.2 | ✓ | - | - |
| realtime-events.2.3 | ✓ | - | - |
| realtime-events.2.4 | ✓ | ✓ | - |
| realtime-events.2.5 | ✓ | - | - |
| realtime-events.2.6 | ✓ | - | - |
| realtime-events.2.7 | ✓ | - | - |
| realtime-events.2.8 | ✓ | - | - |
| realtime-events.2.9 | - | - | ✓ |
| realtime-events.2.10 | - | - | ✓ |
| realtime-events.3.1 | ✓ | - | - |
| realtime-events.3.2 | ✓ | - | - |
| realtime-events.3.3 | ✓ | - | - |
| realtime-events.3.4 | ✓ | - | - |
| realtime-events.3.5 | ✓ | - | - |
| realtime-events.3.6 | ✓ | ✓ | - |
| realtime-events.4.1 | ✓ | - | ✓ |
| realtime-events.4.2 | ✓ | - | ✓ |
| realtime-events.4.3 | ✓ | - | - |
| realtime-events.4.4 | ✓ | - | - |
| realtime-events.4.5 | ✓ | - | - |
| realtime-events.4.6 | ✓ | - | - |
| realtime-events.4.7 | ✓ | - | - |
| realtime-events.5.1 | - | - | ✓ |
| realtime-events.5.2 | - | - | ✓ |
| realtime-events.5.3 | - | - | ✓ |
| realtime-events.5.4 | - | - | ✓ |
| realtime-events.5.5 | ✓ | - | - |
| realtime-events.6.1 | ✓ | - | - |
| realtime-events.6.2 | ✓ | - | - |
| realtime-events.6.3 | ✓ | - | - |
| realtime-events.6.4 | ✓ | ✓ | - |
| realtime-events.6.5 | ✓ | ✓ | - |
| realtime-events.7.1 | ✓ | - | - |
| realtime-events.7.2 | ✓ | - | - |
| realtime-events.7.3 | ✓ | - | - |
| realtime-events.7.4 | ✓ | - | - |
| realtime-events.7.5 | ✓ | - | - |
| realtime-events.7.6 | ✓ | - | - |
| realtime-events.8.1 | ✓ (tsc) | - | - |
| realtime-events.8.2 | ✓ (tsc) | - | - |
| realtime-events.8.3 | ✓ (tsc) | - | - |
| realtime-events.8.4 | ✓ | - | - |
| realtime-events.8.5 | ✓ | - | - |

## Безопасность

- События не содержат чувствительных данных (пароли, токены)
- IPC каналы используют contextBridge (contextIsolation: true)
- Валидация типов событий через TypeScript
- Изоляция ошибок между консюмерами

## Производительность

- mitt: ~200 bytes, O(1) для emit
- Timestamp-based deduplication для предотвращения обработки устаревших событий
- Lazy initialization для singleton EventBus
- Логирование только в development режиме с уровнем debug
