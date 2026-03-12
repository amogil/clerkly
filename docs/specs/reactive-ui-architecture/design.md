# Дизайн: Reactive UI Architecture

## Обзор

Данный документ описывает кросс-фичевую верхнеуровневую архитектуру реактивных UI-подписок в приложении Clerkly.

## Фокус Документа

Этот документ описывает только app-level UI data-flow паттерны:
- принципы реактивного обновления UI через snapshot-события;
- типовые паттерны подписки (single entity, list, computed field, related entities);
- миграционные шаги перехода на snapshot-first модель.

В документ НЕ входят:
- transport/IPC/event delivery и типизация событий (`docs/specs/realtime-events/*`);
- рендер-детали конкретных feature-компонентов (`docs/specs/agents/*` и другие профильные UI-спеки).

---

## Реактивная Архитектура UI (Кросс-Фичевый Уровень)

### Граница Раздела

Этот раздел описывает верхнеуровневую приложенческую архитектуру реактивных UI-подписок (кросс-фичевый уровень) и является основным источником этой архитектуры.

Раздел НЕ описывает:
- детальный рендер и поведение конкретных UI-компонентов (это `docs/specs/agents/*`);
- transport/typing/delivery контракт event-шины и IPC (это `docs/specs/realtime-events/*`).

Ниже по документу допускаются только иллюстративные feature-specific примеры как non-normative material (для объяснения паттернов). Нормативные требования к конкретным фичам ДОЛЖНЫ оставаться в профильных спеках (`agents/*` и др.).

### Принципы

**Requirements:** reactive-ui-architecture.1, realtime-events.9.8

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
    // Статус приходит из Main Process в snapshot
    status: dbAgent.status,
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

Целевой контракт API: обработчик `agents:list` возвращает `AgentSnapshot[]`.

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

## Стратегия Тестирования

### Модульные Тесты

- `tests/unit/events/RendererEventBus.test.ts` — корректная доставка snapshot-событий подписчикам renderer
- `tests/unit/events/MainEventBus.test.ts` — публикация snapshot-событий и контракт подписки

### Функциональные Тесты

- `tests/functional/agent-realtime-events.spec.ts` — реактивное обновление UI по `agent/message` событиям без ручного refresh
- `tests/functional/agent-reordering.spec.ts` — обновление/пересортировка списка агентов по snapshot-событиям
- `tests/functional/agent-switching.spec.ts` — консистентность состояния чатов при переключении между агентами

### Покрытие Требований

| Требование | Модульные тесты | Функциональные тесты |
|------------|-----------------|----------------------|
| reactive-ui-architecture.1 | ✓ | ✓ |
