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

#### Снапшоты моделей

**Requirements:** realtime-events.9

События, связанные с моделями ORM, используют снапшоты (snapshots) вместо прямых ссылок на модели БД. Снапшот — это иммутабельная копия данных модели, оптимизированная для передачи через IPC.

**Принципы снапшотов:**

1. **Полнота данных**: Снапшот содержит все поля модели ORM
2. **Вычисляемые поля**: Снапшот может содержать дополнительные вычисляемые поля (например, `status`)
3. **IPC-совместимость**: Типы данных оптимизированы для сериализации:
   - Даты как `number` (Unix timestamp) вместо `string` (ISO 8601)
   - JSON распарсен в объекты (например, `payload: MessagePayload` вместо `payloadJson: string`)
4. **Отдельные интерфейсы**: Снапшот — это отдельный интерфейс (например, `AgentSnapshot`, `MessageSnapshot`)

**Пример снапшотов:**

```typescript
// AgentSnapshot - содержит все поля Agent + вычисляемое поле status
export interface AgentSnapshot {
  id: string;
  name: string;
  createdAt: number;  // Unix timestamp (было: string ISO 8601)
  updatedAt: number;  // Unix timestamp (было: string ISO 8601)
  archivedAt: number | null;  // Unix timestamp (было: string ISO 8601)
  status: AgentStatus;  // Вычисляемое поле (НЕ в БД)
}

// MessageSnapshot - содержит все поля Message + распарсенный payload
export interface MessageSnapshot {
  id: number;
  agentId: string;
  timestamp: number;  // Unix timestamp (было: string ISO 8601)
  payload: MessagePayload;  // Распарсенный JSON (было: payloadJson: string)
}
```

#### Структура событий с снапшотами

**Requirements:** realtime-events.9.1, realtime-events.9.7

Каждое событие модели содержит два обязательных поля:

```typescript
// Agent events
export interface AgentCreatedPayload extends BaseEvent {
  agent: AgentSnapshot;  // Полный снапшот созданного агента
  timestamp: number;     // Время генерации события
}

export interface AgentUpdatedPayload extends BaseEvent {
  agent: AgentSnapshot;  // Полный снапшот обновленного агента
  timestamp: number;     // Время генерации события
}

export interface AgentArchivedPayload extends BaseEvent {
  agent: AgentSnapshot;  // Полный снапшот архивированного агента
  timestamp: number;     // Время генерации события
}

// Message events
export interface MessageCreatedPayload extends BaseEvent {
  message: MessageSnapshot;  // Полный снапшот созданного сообщения
  timestamp: number;         // Время генерации события
}

export interface MessageUpdatedPayload extends BaseEvent {
  message: MessageSnapshot;  // Полный снапшот обновленного сообщения
  timestamp: number;         // Время генерации события
}
```

#### Диагностическое событие LLM pipeline

**Requirements:** realtime-events.4.8, realtime-events.4.9, realtime-events.4.10

Для зеркалирования ошибок `MainPipeline` в renderer Developer Log вводится типизированное событие `llm.pipeline.diagnostic`.

```typescript
export interface LLMPipelineDiagnosticPayload extends BaseEvent {
  level: 'warn' | 'error';
  context: 'MainPipeline';
  message: string;
  details: {
    agentId: string;
    userMessageId: number;
    signalAborted: boolean;
    errorName: string;
    errorType: 'auth' | 'rate_limit' | 'provider' | 'network' | 'timeout';
  };
  timestamp: number;
}
```

Поток данных:
1. `MainPipeline` в main процессе публикует `new LLMPipelineDiagnosticEvent(...)` при ошибках выполнения запроса к LLM.
2. `MainEventBus` пересылает событие через стандартный IPC канал `events:from-main`.
3. `RendererEventBus` доставляет payload в подписчики.
4. `App` подписывается на `EVENT_TYPES.LLM_PIPELINE_DIAGNOSTIC` и пишет запись в renderer console (Developer Log) через `Logger`.
5. Toast-уведомления для этого события не показываются.

#### Генерация снапшотов

**Requirements:** realtime-events.9.5, realtime-events.9.6

Каждый менеджер модели имеет приватный метод `toEventSnapshot()` для конвертации ORM модели в снапшот:

```typescript
// В AgentManager
private toEventAgent(agent: Agent): AgentSnapshot {
  // Получить последнее сообщение для вычисления статуса
  const lastMessage = this.dbManager.messages.getLastByAgent(agent.agentId);
  const status = this.computeAgentStatus(lastMessage);

  return {
    id: agent.agentId,
    name: agent.name,
    createdAt: new Date(agent.createdAt).getTime(),  // ISO 8601 → Unix timestamp
    updatedAt: new Date(agent.updatedAt).getTime(),
    archivedAt: agent.archivedAt ? new Date(agent.archivedAt).getTime() : null,
    status,  // Вычисляемое поле
  };
}

// В MessageManager
private toEventMessage(message: Message): MessageSnapshot {
  let payload: MessagePayload;
  try {
    payload = JSON.parse(message.payloadJson) as MessagePayload;
  } catch (error) {
    const errorMsg = `Failed to parse message payload for message ${message.id}: ${error}`;
    this.logger.error(errorMsg);
    throw new Error(errorMsg);  // Бросаем ошибку, не возвращаем null
  }

  return {
    id: message.id,
    agentId: message.agentId,
    timestamp: new Date(message.timestamp).getTime(),  // ISO 8601 → Unix timestamp
    payload,  // Распарсенный JSON
  };
}
```

**Правила:**
- Метод ДОЛЖЕН бросать ошибку если конвертация невозможна (не возвращать null)
- Метод ДОЛЖЕН вычислять все вычисляемые поля
- Метод ДОЛЖЕН парсить JSON поля в объекты
- Метод ДОЛЖЕН конвертировать типы данных для IPC (даты → timestamps)

#### Использование снапшотов в UI

**Requirements:** realtime-events.9.8

UI использует данные из снапшота напрямую без дополнительных запросов:

```typescript
// В useAgents hook
useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload: AgentUpdatedPayload) => {
  setAgents((prev) =>
    prev.map((agent) =>
      agent.agentId === payload.agent.id
        ? {
            agentId: payload.agent.id,
            name: payload.agent.name,
            createdAt: new Date(payload.agent.createdAt).toISOString(),
            updatedAt: new Date(payload.agent.updatedAt).toISOString(),
            // Все данные уже в снапшоте, включая вычисляемые поля
          }
        : agent
    )
  );
});
```

**Преимущества:**
- Нет дополнительных запросов к БД из UI
- Вычисляемые поля уже готовы (например, статус агента)
- JSON уже распарсен (например, payload сообщения)
- Типы данных оптимизированы для UI (timestamps вместо ISO строк)

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

  useEventSubscription('agent.archived', (event) => {
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
| should create llm.pipeline.diagnostic payload | realtime-events.4.9 |

#### Renderer Developer Log Integration

**Файл:** `tests/unit/App.ipc-integration.test.tsx`

| Тест | Требование |
|------|------------|
| should log llm.pipeline.diagnostic events to renderer console | realtime-events.4.10 |

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
Покрытие требований обеспечивается модульными и функциональными тестами:
- Реализация и утилиты покрываются модульными тестами
- IPC и пользовательские сценарии покрываются функциональными тестами

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

## Реактивная Архитектура UI

### Принципы

**Requirements:** realtime-events.9.8

UI компоненты в Clerkly следуют реактивной архитектуре на основе событий:

1. **Компоненты не содержат бизнес-логики** - они только отображают данные
2. **Снапшоты содержат все необходимые данные** - включая вычисляемые поля
3. **Подписка на конкретные сущности** - каждый компонент подписывается только на нужные ему события
4. **Автоматическое обновление** - изменения приходят через события, не через polling
5. **Нет дополнительных запросов** - все данные уже в снапшоте события

### Архитектурная Диаграмма

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│                                                                  │
│  ┌──────────────┐                                                │
│  │ AgentManager │ ──► AgentSnapshot { id, name, status, ... }   │
│  └──────┬───────┘                                                │
│         │ publish(AGENT_UPDATED)                                 │
│         ▼                                                         │
│  ┌──────────────┐                                                │
│  │ MainEventBus │ ──► IPC ──────────────────────────────┐       │
│  └──────────────┘                                        │       │
└──────────────────────────────────────────────────────────┼───────┘
                                                           │
┌──────────────────────────────────────────────────────────┼───────┐
│                     Renderer Process                     │       │
│                                                          ▼       │
│  ┌──────────────────┐                          ┌─────────────┐  │
│  │ RendererEventBus │ ◄────────────────────────┤ IPC Listener│  │
│  └────────┬─────────┘                          └─────────────┘  │
│           │ emit(AGENT_UPDATED, snapshot)                       │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │ useAgent(id)     │ ◄── subscribe(AGENT_UPDATED)              │
│  │ - агент из state │                                           │
│  │ - обновляется    │                                           │
│  └────────┬─────────┘                                           │
│           │ return { agent, status }                            │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │ AgentIcon        │ ◄── agent.status из снапшота              │
│  │ - цвет по статусу│                                           │
│  │ - без логики     │                                           │
│  └──────────────────┘                                           │
└──────────────────────────────────────────────────────────────────┘
```

### Паттерны Подписки

#### Паттерн 1: Подписка на конкретную сущность

Компонент отображает данные одной сущности (агент, сообщение).

**Пример: Иконка агента в хедере**

```typescript
// src/renderer/components/AgentIcon.tsx
interface AgentIconProps {
  agentId: string;
}

function AgentIcon({ agentId }: AgentIconProps) {
  // Хук подписывается на события конкретного агента
  const agent = useAgent(agentId);
  
  if (!agent) return null;
  
  // Статус уже вычислен в снапшоте - просто используем
  const statusColor = getStatusColor(agent.status);
  
  return (
    <div 
      className={`w-10 h-10 rounded-full ${statusColor}`}
      data-testid={`agent-icon-${agentId}`}
    >
      {agent.name?.[0] || 'A'}
    </div>
  );
}
```

**Реализация хука:**

```typescript
// src/renderer/hooks/useAgent.ts
function useAgent(agentId: string | null): AgentSnapshot | null {
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  
  // Загрузка начального состояния
  useEffect(() => {
    if (!agentId) {
      setAgent(null);
      return;
    }
    
    // Загрузить агента из API
    window.api.agents.get(agentId).then(result => {
      if (result.success && result.data) {
        // Конвертировать DB Agent → AgentSnapshot
        setAgent(dbAgentToSnapshot(result.data));
      }
    });
  }, [agentId]);
  
  // Подписка на обновления
  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload) => {
    if (payload.agent.id === agentId) {
      // Снапшот уже содержит все данные, включая статус
      setAgent(payload.agent);
    }
  });
  
  // Подписка на архивирование
  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload) => {
    if (payload.agent.id === agentId) {
      setAgent(null);
    }
  });
  
  return agent;
}
```

**Ключевые моменты:**
- Компонент НЕ вычисляет статус - он уже в `agent.status`
- Компонент НЕ делает дополнительных запросов - все данные в снапшоте
- Компонент автоматически обновляется при изменении агента

#### Паттерн 2: Подписка на список сущностей

Компонент отображает список сущностей (список агентов, список сообщений).

**Пример: Список агентов в хедере**

```typescript
// src/renderer/components/AgentsList.tsx
function AgentsList() {
  const { agents } = useAgents();
  
  return (
    <div className="flex gap-2">
      {agents.map(agent => (
        <AgentIcon key={agent.id} agentId={agent.id} />
      ))}
    </div>
  );
}
```

**Реализация хука:**

```typescript
// src/renderer/hooks/useAgents.ts
function useAgents() {
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  
  // Загрузка начального состояния
  useEffect(() => {
    window.api.agents.list().then(result => {
      if (result.success && result.data) {
        // Конвертировать DB Agent[] → AgentSnapshot[]
        setAgents(result.data.map(dbAgentToSnapshot));
      }
    });
  }, []);
  
  // Подписка на создание
  useEventSubscription(EVENT_TYPES.AGENT_CREATED, (payload) => {
    setAgents(prev => {
      // Добавить в начало, пересортировать
      const updated = [payload.agent, ...prev];
      return sortByUpdatedAt(updated);
    });
  });
  
  // Подписка на обновление
  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload) => {
    setAgents(prev => {
      // Обновить агента, пересортировать
      const updated = prev.map(a => 
        a.id === payload.agent.id ? payload.agent : a
      );
      return sortByUpdatedAt(updated);
    });
  });
  
  // Подписка на архивирование
  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload) => {
    setAgents(prev => prev.filter(a => a.id !== payload.agent.id));
  });
  
  return { agents };
}
```

**Ключевые моменты:**
- Хук управляет списком снапшотов
- Каждое событие содержит полный снапшот - просто заменяем в списке
- Сортировка по `updatedAt` из снапшота (не нужно запрашивать)

#### Паттерн 3: Подписка на вычисляемое поле

Компонент отображает только одно вычисляемое поле сущности.

**Пример: Статус агента**

```typescript
// src/renderer/components/AgentStatusBadge.tsx
interface AgentStatusBadgeProps {
  agentId: string;
}

function AgentStatusBadge({ agentId }: AgentStatusBadgeProps) {
  const agent = useAgent(agentId);
  
  if (!agent) return null;
  
  // Статус уже вычислен - просто отображаем
  return (
    <span className={getStatusStyles(agent.status)}>
      {getStatusText(agent.status)}
    </span>
  );
}
```

**Альтернатива: Специализированный хук**

```typescript
// src/renderer/hooks/useAgentStatus.ts
function useAgentStatus(agentId: string | null): AgentStatus | null {
  const agent = useAgent(agentId);
  return agent?.status ?? null;
}

// Использование
function AgentStatusBadge({ agentId }: AgentStatusBadgeProps) {
  const status = useAgentStatus(agentId);
  
  if (!status) return null;
  
  return (
    <span className={getStatusStyles(status)}>
      {getStatusText(status)}
    </span>
  );
}
```

**Ключевые моменты:**
- Статус НЕ вычисляется в UI - он уже в снапшоте
- Компонент просто отображает значение
- Автоматическое обновление при изменении статуса

#### Паттерн 4: Подписка на связанные сущности

Компонент отображает данные нескольких связанных сущностей.

**Пример: Заголовок активного агента**

```typescript
// src/renderer/components/ActiveAgentHeader.tsx
interface ActiveAgentHeaderProps {
  agentId: string;
}

function ActiveAgentHeader({ agentId }: ActiveAgentHeaderProps) {
  const agent = useAgent(agentId);
  const lastMessage = useLastMessage(agentId);
  
  if (!agent) return null;
  
  return (
    <div>
      <h1>{agent.name}</h1>
      <p>Updated: {formatDate(agent.updatedAt)}</p>
      {lastMessage && (
        <p>Last: {lastMessage.payload.kind}</p>
      )}
    </div>
  );
}
```

**Реализация хука для последнего сообщения:**

```typescript
// src/renderer/hooks/useLastMessage.ts
function useLastMessage(agentId: string | null): MessageSnapshot | null {
  const [lastMessage, setLastMessage] = useState<MessageSnapshot | null>(null);
  
  // Загрузка начального состояния
  useEffect(() => {
    if (!agentId) {
      setLastMessage(null);
      return;
    }
    
    window.api.messages.getLast(agentId).then(result => {
      if (result.success && result.data) {
        setLastMessage(dbMessageToSnapshot(result.data));
      }
    });
  }, [agentId]);
  
  // Подписка на создание сообщений
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload) => {
    if (payload.message.agentId === agentId) {
      // Новое сообщение - оно теперь последнее
      setLastMessage(payload.message);
    }
  });
  
  // Подписка на обновление сообщений
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload) => {
    if (lastMessage && payload.message.id === lastMessage.id) {
      // Обновилось последнее сообщение
      setLastMessage(payload.message);
    }
  });
  
  return lastMessage;
}
```

**Ключевые моменты:**
- Каждая сущность имеет свой хук
- Хуки независимы - можно использовать вместе
- Payload сообщения уже распарсен в снапшоте

### Конвертация DB → Snapshot

Снапшоты используют типы, оптимизированные для IPC и UI:

```typescript
// src/renderer/utils/snapshotConverters.ts

/**
 * Конвертировать DB Agent в AgentSnapshot
 * Requirements: realtime-events.9.4
 */
function dbAgentToSnapshot(dbAgent: Agent): AgentSnapshot {
  return {
    id: dbAgent.agentId,
    name: dbAgent.name,
    createdAt: new Date(dbAgent.createdAt).getTime(),
    updatedAt: new Date(dbAgent.updatedAt).getTime(),
    archivedAt: dbAgent.archivedAt 
      ? new Date(dbAgent.archivedAt).getTime() 
      : null,
    // Статус НЕ вычисляется здесь - он должен прийти из API
    // Временно используем 'new' как fallback
    status: 'new',
  };
}

/**
 * Конвертировать DB Message в MessageSnapshot
 * Requirements: realtime-events.9.4
 */
function dbMessageToSnapshot(dbMessage: Message): MessageSnapshot {
  return {
    id: dbMessage.id,
    agentId: dbMessage.agentId,
    timestamp: new Date(dbMessage.timestamp).getTime(),
    payload: JSON.parse(dbMessage.payloadJson) as MessagePayload,
  };
}
```

**Важно:** 
- Конвертация ISO 8601 → Unix timestamp для производительности
- JSON парсится один раз при конвертации
- Статус агента должен приходить из API (вычисляется в Main Process)

### Обновление API для возврата снапшотов

**Проблема:** Текущий API возвращает DB модели, но UI нужны снапшоты.

**Решение:** API должен возвращать снапшоты напрямую.

**До (текущее состояние):**

```typescript
// Main Process
ipcMain.handle('agents:list', () => {
  return agentManager.list(); // Возвращает Agent[] из БД
});

// Renderer
const result = await window.api.agents.list();
const agents = result.data as Agent[]; // DB модели
// Нужно вычислять статус вручную
```

**После (целевое состояние):**

```typescript
// Main Process
ipcMain.handle('agents:list', () => {
  const dbAgents = agentManager.list();
  // Конвертировать в снапшоты с вычисленным статусом
  return dbAgents.map(agent => agentManager.toEventAgent(agent));
});

// Renderer
const result = await window.api.agents.list();
const agents = result.data as AgentSnapshot[]; // Снапшоты
// Статус уже вычислен!
```

**Преимущества:**
- UI не содержит логики вычисления статуса
- Единый источник истины для статуса (Main Process)
- API и события используют одинаковые типы (AgentSnapshot)

### Примеры Реактивных Компонентов

#### Пример 1: Иконка агента с цветом по статусу

```typescript
// src/renderer/components/AgentIcon.tsx
// Requirements: agents.5.6, agents.5.7

interface AgentIconProps {
  agentId: string;
  onClick?: () => void;
}

function AgentIcon({ agentId, onClick }: AgentIconProps) {
  // Подписка на агента - автоматическое обновление
  const agent = useAgent(agentId);
  
  if (!agent) return null;
  
  // Статус из снапшота - не вычисляем
  const statusColor = getStatusColor(agent.status);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`w-10 h-10 rounded-full ${statusColor} cursor-pointer`}
      data-testid={`agent-icon-${agentId}`}
    >
      {agent.name?.[0]?.toUpperCase() || 'A'}
    </motion.div>
  );
}

// Цвета по статусу - чистая функция
function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'new': return 'bg-gray-400';
    case 'in-progress': return 'bg-blue-500';
    case 'awaiting-response': return 'bg-yellow-500';
    case 'error': return 'bg-red-500';
    case 'completed': return 'bg-green-500';
  }
}
```

**Тестирование:**

```typescript
// tests/unit/components/AgentIcon.test.tsx
describe('AgentIcon', () => {
  it('should update color when agent status changes', async () => {
    const { rerender } = render(<AgentIcon agentId="agent-1" />);
    
    // Начальный статус 'new' - серый
    expect(screen.getByTestId('agent-icon-agent-1')).toHaveClass('bg-gray-400');
    
    // Эмулировать событие обновления статуса
    act(() => {
      RendererEventBus.getInstance().publish(EVENT_TYPES.AGENT_UPDATED, {
        agent: {
          id: 'agent-1',
          name: 'Test',
          status: 'in-progress', // Изменился статус
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
        },
        timestamp: Date.now(),
      });
    });
    
    // Цвет обновился автоматически - синий
    await waitFor(() => {
      expect(screen.getByTestId('agent-icon-agent-1')).toHaveClass('bg-blue-500');
    });
  });
});
```

#### Пример 2: Название агента в заголовке

```typescript
// src/renderer/components/ActiveAgentName.tsx
// Requirements: agents.3.1

interface ActiveAgentNameProps {
  agentId: string;
}

function ActiveAgentName({ agentId }: ActiveAgentNameProps) {
  const agent = useAgent(agentId);
  
  if (!agent) return <span>Loading...</span>;
  
  return (
    <h1 className="text-xl font-semibold">
      {agent.name || 'Unnamed Agent'}
    </h1>
  );
}
```

**Тестирование:**

```typescript
// tests/unit/components/ActiveAgentName.test.tsx
describe('ActiveAgentName', () => {
  it('should update name when agent is renamed', async () => {
    render(<ActiveAgentName agentId="agent-1" />);
    
    // Начальное имя
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    
    // Эмулировать событие переименования
    act(() => {
      RendererEventBus.getInstance().publish(EVENT_TYPES.AGENT_UPDATED, {
        agent: {
          id: 'agent-1',
          name: 'Renamed Agent', // Изменилось имя
          status: 'new',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
        },
        timestamp: Date.now(),
      });
    });
    
    // Имя обновилось автоматически
    await waitFor(() => {
      expect(screen.getByText('Renamed Agent')).toBeInTheDocument();
    });
  });
});
```

#### Пример 3: Дата последнего обновления

```typescript
// src/renderer/components/AgentLastUpdated.tsx
// Requirements: agents.1.4

interface AgentLastUpdatedProps {
  agentId: string;
}

function AgentLastUpdated({ agentId }: AgentLastUpdatedProps) {
  const agent = useAgent(agentId);
  
  if (!agent) return null;
  
  // updatedAt из снапшота - уже Unix timestamp
  const formattedDate = formatRelativeTime(agent.updatedAt);
  
  return (
    <span className="text-sm text-gray-500">
      {formattedDate}
    </span>
  );
}

// Форматирование относительного времени
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
```

**Тестирование:**

```typescript
// tests/unit/components/AgentLastUpdated.test.tsx
describe('AgentLastUpdated', () => {
  it('should update time when agent receives message', async () => {
    const initialTime = Date.now() - 3600000; // 1 час назад
    
    render(<AgentLastUpdated agentId="agent-1" />);
    
    // Начальное время
    expect(screen.getByText('1h ago')).toBeInTheDocument();
    
    // Эмулировать событие обновления (новое сообщение)
    act(() => {
      RendererEventBus.getInstance().publish(EVENT_TYPES.AGENT_UPDATED, {
        agent: {
          id: 'agent-1',
          name: 'Test',
          status: 'in-progress',
          createdAt: initialTime,
          updatedAt: Date.now(), // Обновилось только что
          archivedAt: null,
        },
        timestamp: Date.now(),
      });
    });
    
    // Время обновилось автоматически
    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument();
    });
  });
});
```

### Преимущества Реактивной Архитектуры

1. **Простота компонентов**: Компоненты не содержат логики - только отображение
2. **Единый источник истины**: Вычисления в Main Process, UI только отображает
3. **Автоматическое обновление**: Изменения приходят через события
4. **Тестируемость**: Легко эмулировать события в тестах
5. **Производительность**: Нет лишних запросов к API
6. **Консистентность**: События и API используют одинаковые типы (снапшоты)

### Миграция Существующего Кода

#### Шаг 1: Обновить API для возврата снапшотов

```typescript
// src/main/agents/AgentIPCHandlers.ts
class AgentIPCHandlers {
  private async handleAgentList(): Promise<IPCResult> {
    try {
      const dbAgents = this.agentManager.list();
      // Конвертировать в снапшоты
      const snapshots = dbAgents.map(agent => 
        this.agentManager.toEventAgent(agent)
      );
      return { success: true, data: snapshots };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  private async handleAgentGet(args: { agentId: string }): Promise<IPCResult> {
    try {
      const dbAgent = this.agentManager.get(args.agentId);
      if (!dbAgent) {
        return { success: false, error: 'Agent not found' };
      }
      // Конвертировать в снапшот
      const snapshot = this.agentManager.toEventAgent(dbAgent);
      return { success: true, data: snapshot };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
```

#### Шаг 2: Создать хуки для подписки

```typescript
// src/renderer/hooks/useAgent.ts
export function useAgent(agentId: string | null): AgentSnapshot | null {
  // Реализация выше
}

// src/renderer/hooks/useAgents.ts
export function useAgents() {
  // Реализация выше
}

// src/renderer/hooks/useMessages.ts
export function useMessages(agentId: string | null) {
  // Аналогично useAgent, но для сообщений
}
```

#### Шаг 3: Переписать компоненты

```typescript
// До
function AgentIcon({ agentId }) {
  const { agents } = useAgents();
  const agent = agents.find(a => a.agentId === agentId);
  const messages = useMessages(agentId);
  const status = computeAgentStatus(messages); // Вычисление в UI!
  
  return <div className={getStatusColor(status)} />;
}

// После
function AgentIcon({ agentId }) {
  const agent = useAgent(agentId); // Подписка на конкретного агента
  
  if (!agent) return null;
  
  // Статус уже в снапшоте!
  return <div className={getStatusColor(agent.status)} />;
}
```

#### Шаг 4: Обновить тесты

```typescript
// До
it('should show correct status color', () => {
  const messages = [{ kind: 'user', ... }];
  render(<AgentIcon agentId="1" messages={messages} />);
  // Проверка цвета
});

// После
it('should show correct status color', () => {
  // Эмулировать событие с нужным статусом
  act(() => {
    RendererEventBus.getInstance().publish(EVENT_TYPES.AGENT_UPDATED, {
      agent: { id: '1', status: 'in-progress', ... },
      timestamp: Date.now(),
    });
  });
  
  render(<AgentIcon agentId="1" />);
  // Проверка цвета
});
```

### Чеклист Миграции

- [ ] Обновить `AgentIPCHandlers` для возврата снапшотов
- [ ] Обновить `MessageIPCHandlers` для возврата снапшотов
- [ ] Создать `useAgent(agentId)` хук
- [ ] Создать `useAgentStatus(agentId)` хук
- [ ] Создать `useLastMessage(agentId)` хук
- [ ] Переписать `useAgents` для работы со снапшотами
- [ ] Переписать `useMessages` для работы со снапшотами
- [ ] Обновить `AgentIcon` компонент
- [ ] Обновить `ActiveAgentName` компонент
- [ ] Обновить `AgentLastUpdated` компонент
- [ ] Обновить все модульные тесты компонентов
- [ ] Обновить все функциональные тесты
- [ ] Удалить `computeAgentStatus` из renderer (если есть)
- [ ] Проверить, что все компоненты обновляются автоматически
