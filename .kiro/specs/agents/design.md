# Документ Дизайна: Agents

## Обзор

Agents — основной интерфейс для взаимодействия с AI-агентами в приложении Clerkly. Каждый агент представлен отдельным чатом с независимым контекстом. Компонент предоставляет список агентов, интерфейс чата и навигацию между агентами.

## Схема Базы Данных

### Таблица agents

```sql
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NULL
);

CREATE INDEX idx_agents_user_archived_updated
  ON agents(user_id, archived_at, updated_at DESC);
```

**Поля:**
- `agent_id` — уникальный идентификатор (10-символьная alphanumeric строка)
- `user_id` — владелец агента
- `name` — название агента (по умолчанию "New Agent")
- `created_at` — время создания (ISO 8601 с timezone offset)
- `updated_at` — время последнего обновления (обновляется при создании сообщения)
- `archived_at` — время архивирования (NULL = активен)

### Таблица messages

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_timestamp ON messages(agent_id, timestamp);
```

## Типы данных

### Agent (TypeScript)

```typescript
// Requirements: agents.1, agents.10
interface Agent {
  agentId: string;      // 10-символьная alphanumeric строка
  userId: string;
  name: string;
  createdAt: string;    // ISO 8601 с timezone offset
  updatedAt: string;
  archivedAt?: string;
}
```

### AgentStatus (вычисляемый)

```typescript
// Requirements: agents.9
type AgentStatus = 'new' | 'in-progress' | 'awaiting-user' | 'error' | 'completed';
```

**Статус НЕ хранится в БД** — вычисляется из последних сообщений.

### Message Payload

```typescript
// Requirements: agents.7
interface MessagePayload {
  kind: 'user' | 'llm' | 'tool_call' | 'code_exec' | 'final_answer' | 'request_scope' | 'artifact';
  timing?: { started_at: string; finished_at: string };
  data: Record<string, unknown>;
}
```

## Архитектура Main Process

### DatabaseManager

Единая точка входа для доступа к БД (см. user-data-isolation.6).

**Файл:** `src/main/DatabaseManager.ts`

```typescript
// Requirements: user-data-isolation.6
class DatabaseManager {
  private db: Database.Database | null = null;
  private userManager: UserManager | null = null;
  
  // Инициализация БД и миграции
  initialize(storagePath: string): void { ... }
  
  // Установка UserManager для получения userId
  setUserManager(userManager: UserManager): void {
    this.userManager = userManager;
  }
  
  // Доступ к SQLite
  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }
  
  // Текущий userId (автоматическая изоляция)
  getCurrentUserId(): string {
    const userId = this.userManager?.getCurrentUserId();
    if (!userId) throw new Error('No user logged in');
    return userId;
  }
  
  close(): void { ... }
}
```

### AgentManager

Бизнес-логика агентов. Использует DatabaseManager для доступа к БД и автоматической изоляции.

**Файл:** `src/main/agents/AgentManager.ts`

```typescript
// Requirements: agents.2, agents.10, user-data-isolation.6.5, user-data-isolation.6.6
class AgentManager {
  private dbManager: DatabaseManager;
  
  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }
  
  private get db() {
    return this.dbManager.getDatabase();
  }
  
  private get userId() {
    return this.dbManager.getCurrentUserId();
  }
  
  // Создание агента (userId получается автоматически)
  async create(): Promise<Agent> {
    const agentId = this.generateAgentId();
    const now = new Date().toISOString();
    
    this.db.prepare(`
      INSERT INTO agents (agent_id, user_id, name, created_at, updated_at)
      VALUES (?, ?, 'New Agent', ?, ?)
    `).run(agentId, this.userId, now, now);
    
    const agent = { agentId, userId: this.userId, name: 'New Agent', createdAt: now, updatedAt: now };
    
    MainEventBus.getInstance().publish(new AgentCreatedEvent({
      id: agentId,
      name: 'New Agent',
      createdAt: Date.parse(now),
      updatedAt: Date.parse(now)
    }));
    
    return agent;
  }
  
  // Список агентов (фильтрация по userId автоматическая)
  async list(): Promise<Agent[]> {
    return this.db.prepare(`
      SELECT agent_id as agentId, user_id as userId, name, 
             created_at as createdAt, updated_at as updatedAt
      FROM agents 
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY updated_at DESC
    `).all(this.userId) as Agent[];
  }
  
  // Получение агента
  async get(agentId: string): Promise<Agent | null> {
    return this.db.prepare(`
      SELECT agent_id as agentId, user_id as userId, name,
             created_at as createdAt, updated_at as updatedAt
      FROM agents 
      WHERE agent_id = ? AND user_id = ?
    `).get(agentId, this.userId) as Agent | null;
  }
  
  // Обновление агента
  async update(agentId: string, data: { name?: string }): Promise<Agent> {
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE agents SET name = ?, updated_at = ?
      WHERE agent_id = ? AND user_id = ?
    `).run(data.name, now, agentId, this.userId);
    
    MainEventBus.getInstance().publish(new AgentUpdatedEvent(agentId, data));
    
    return { agentId, userId: this.userId, name: data.name!, createdAt: '', updatedAt: now };
  }
  
  // Архивирование агента
  async archive(agentId: string): Promise<void> {
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE agents SET archived_at = ?
      WHERE agent_id = ? AND user_id = ?
    `).run(now, agentId, this.userId);
    
    MainEventBus.getInstance().publish(new AgentArchivedEvent(agentId));
  }
  
  // Обновление updated_at (вызывается из MessageManager)
  async touch(agentId: string): Promise<void> {
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE agents SET updated_at = ? WHERE agent_id = ?
    `).run(now, agentId);
    
    MainEventBus.getInstance().publish(new AgentUpdatedEvent(agentId, {
      updatedAt: Date.parse(now)
    }));
  }
  
  private generateAgentId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
```

### MessageManager

Бизнес-логика сообщений.

**Файл:** `src/main/agents/MessageManager.ts`

```typescript
// Requirements: agents.4, agents.7, user-data-isolation.6.5
class MessageManager {
  private dbManager: DatabaseManager;
  private agentManager: AgentManager;
  
  constructor(dbManager: DatabaseManager, agentManager: AgentManager) {
    this.dbManager = dbManager;
    this.agentManager = agentManager;
  }
  
  private get db() {
    return this.dbManager.getDatabase();
  }
  
  private get userId() {
    return this.dbManager.getCurrentUserId();
  }
  
  // Проверка доступа к агенту
  private checkAccess(agentId: string): void {
    const agent = this.db.prepare(
      'SELECT user_id FROM agents WHERE agent_id = ?'
    ).get(agentId) as { user_id: string } | undefined;
    
    if (!agent || agent.user_id !== this.userId) {
      throw new Error('Access denied');
    }
  }
  
  // Список сообщений агента
  async list(agentId: string): Promise<Message[]> {
    this.checkAccess(agentId);
    
    return this.db.prepare(`
      SELECT id, agent_id as agentId, timestamp, payload_json as payloadJson
      FROM messages 
      WHERE agent_id = ?
      ORDER BY id ASC
    `).all(agentId) as Message[];
  }
  
  // Создание сообщения
  async create(agentId: string, payload: MessagePayload): Promise<Message> {
    this.checkAccess(agentId);
    
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    
    const result = this.db.prepare(`
      INSERT INTO messages (agent_id, timestamp, payload_json)
      VALUES (?, ?, ?)
    `).run(agentId, now, payloadJson);
    
    // Обновление updated_at агента
    await this.agentManager.touch(agentId);
    
    const message = {
      id: result.lastInsertRowid as number,
      agentId,
      timestamp: now,
      payloadJson
    };
    
    MainEventBus.getInstance().publish(new MessageCreatedEvent({
      id: String(result.lastInsertRowid),
      agentId,
      role: payload.kind === 'user' ? 'user' : 'assistant',
      content: (payload.data as { text?: string })?.text || '',
      createdAt: Date.parse(now)
    }));
    
    return message;
  }
  
  // Обновление сообщения
  async update(messageId: number, agentId: string, payload: MessagePayload): Promise<void> {
    this.checkAccess(agentId);
    
    const payloadJson = JSON.stringify(payload);
    
    this.db.prepare(`
      UPDATE messages SET payload_json = ?
      WHERE id = ? AND agent_id = ?
    `).run(payloadJson, messageId, agentId);
    
    MainEventBus.getInstance().publish(new MessageUpdatedEvent(String(messageId), {
      content: (payload.data as { text?: string })?.text || ''
    }));
  }
}
```

### AgentIPCHandlers

Тонкий слой IPC. userId НЕ передаётся через IPC — получается автоматически из DatabaseManager.

**Файл:** `src/main/agents/AgentIPCHandlers.ts`

```typescript
// Requirements: agents.2, agents.4, agents.10, user-data-isolation.6.6
class AgentIPCHandlers {
  private agentManager: AgentManager;
  private messageManager: MessageManager;
  
  constructor(agentManager: AgentManager, messageManager: MessageManager) {
    this.agentManager = agentManager;
    this.messageManager = messageManager;
  }
  
  register(): void {
    // Agents — userId получается автоматически из DatabaseManager
    ipcMain.handle('agents:create', () => 
      this.agentManager.create());
    
    ipcMain.handle('agents:list', () => 
      this.agentManager.list());
    
    ipcMain.handle('agents:get', (_, { agentId }) => 
      this.agentManager.get(agentId));
    
    ipcMain.handle('agents:update', (_, { agentId, ...data }) => 
      this.agentManager.update(agentId, data));
    
    ipcMain.handle('agents:archive', (_, { agentId }) => 
      this.agentManager.archive(agentId));
    
    // Messages — userId получается автоматически из DatabaseManager
    ipcMain.handle('messages:list', (_, { agentId }) => 
      this.messageManager.list(agentId));
    
    ipcMain.handle('messages:create', (_, { agentId, payload }) => 
      this.messageManager.create(agentId, payload));
    
    ipcMain.handle('messages:update', (_, { messageId, agentId, payload }) => 
      this.messageManager.update(messageId, agentId, payload));
  }
}
```

## Preload API

userId НЕ передаётся через API — получается автоматически на стороне main процесса.

**Файл:** `src/preload/index.ts`

```typescript
// Requirements: agents.2, agents.4, user-data-isolation.6.6
contextBridge.exposeInMainWorld('api', {
  // ... existing API ...
  
  agents: {
    create: () => 
      ipcRenderer.invoke('agents:create'),
    
    list: () => 
      ipcRenderer.invoke('agents:list'),
    
    get: (agentId: string) => 
      ipcRenderer.invoke('agents:get', { agentId }),
    
    update: (agentId: string, data: { name?: string }) => 
      ipcRenderer.invoke('agents:update', { agentId, ...data }),
    
    archive: (agentId: string) => 
      ipcRenderer.invoke('agents:archive', { agentId })
  },
  
  messages: {
    list: (agentId: string) => 
      ipcRenderer.invoke('messages:list', { agentId }),
    
    create: (agentId: string, payload: MessagePayload) => 
      ipcRenderer.invoke('messages:create', { agentId, payload }),
    
    update: (messageId: number, agentId: string, payload: MessagePayload) => 
      ipcRenderer.invoke('messages:update', { messageId, agentId, payload })
  }
});
```

## Алгоритм определения статуса

```typescript
// Requirements: agents.9.1, agents.9.2, agents.9.4
function computeAgentStatus(messages: Message[]): AgentStatus {
  if (messages.length === 0) {
    return 'new';
  }
  
  const lastMessage = messages[messages.length - 1];
  const payload = JSON.parse(lastMessage.payloadJson) as MessagePayload;
  
  // Проверка на ошибки
  if (payload.data?.result?.status === 'error' ||
      payload.data?.result?.status === 'crash' ||
      payload.data?.result?.status === 'timeout') {
    return 'error';
  }
  
  // Финальный ответ
  if (payload.kind === 'final_answer') {
    return 'completed';
  }
  
  // Последнее сообщение от пользователя
  if (payload.kind === 'user') {
    return 'in-progress';
  }
  
  // Последнее сообщение от LLM (не final_answer)
  if (payload.kind === 'llm') {
    return 'awaiting-user';
  }
  
  return 'new';
}
```

## Real-time Events

### Типы событий

Событие `AgentArchivedEvent` определено в `src/shared/events/types.ts`:

```typescript
// Requirements: agents.12.3
export class AgentArchivedEvent extends TypedEventClass<AgentArchivedType> {
  readonly type = EVENT_TYPES.AGENT_ARCHIVED; // 'agent.archived'
  
  constructor(public readonly id: string) {
    super();
  }
  
  toPayload(): EventPayloadWithoutTimestamp<AgentArchivedType> {
    return { id: this.id };
  }
}
```

**Примечание:** В UI архивирование называется "удалением" для простоты понимания пользователем, но технически это soft delete через установку `archived_at`.

### Генерация событий (Main Process)

```typescript
// Requirements: agents.12.1 - agents.12.5

// При создании агента
MainEventBus.getInstance().publish(new AgentCreatedEvent(agentData));

// При обновлении агента (name, updatedAt)
MainEventBus.getInstance().publish(new AgentUpdatedEvent(agentId, changedFields));

// При архивировании агента
MainEventBus.getInstance().publish(new AgentArchivedEvent(agentId));

// При создании сообщения
MainEventBus.getInstance().publish(new MessageCreatedEvent(messageData));

// При обновлении сообщения
MainEventBus.getInstance().publish(new MessageUpdatedEvent(messageId, changedFields));
```

### Подписка на события (Renderer)

```typescript
// Requirements: agents.12.6, agents.12.7, agents.12.8

function AgentsComponent() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  
  // Подписка на события агентов
  useEventSubscription(EVENT_TYPES.AGENT_CREATED, (payload) => {
    setAgents(prev => [payload.data, ...prev]);
  });
  
  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload) => {
    setAgents(prev => prev.map(agent => 
      agent.agentId === payload.id 
        ? { ...agent, ...payload.changedFields }
        : agent
    ));
  });
  
  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload) => {
    setAgents(prev => prev.filter(agent => agent.agentId !== payload.id));
  });
  
  // Подписка на события сообщений
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload) => {
    if (payload.data.agentId === activeAgentId) {
      setMessages(prev => [...prev, payload.data]);
    }
  });
  
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload) => {
    setMessages(prev => prev.map(msg =>
      msg.id === payload.id
        ? { ...msg, ...payload.changedFields }
        : msg
    ));
  });
}
```

## Архитектура компонентов

```
┌─────────────────────────────────────────────────────────┐
│                    Agents Component                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Header (h-16)                         │ │
│  │  ┌──────────────────┐  ┌──────────────────────┐   │ │
│  │  │ ActiveAgentInfo  │  │   AgentsList         │   │ │
│  │  │ (50%)            │  │   (50%, justify-end) │   │ │
│  │  └──────────────────┘  └──────────────────────┘   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              MessagesArea / HistoryPage            │ │
│  │  (flex-1, overflow-y-auto)                         │ │
│  │                                                    │ │
│  │  Chat mode:                                        │ │
│  │  - EmptyStatePlaceholder (if no messages)         │ │
│  │  - MessageList                                     │ │
│  │  - ActivityIndicator (during tool_call/code_exec) │ │
│  │                                                    │ │
│  │  History mode (showAllTasksPage):                 │ │
│  │  - Back button                                     │ │
│  │  - "Agents History" title                         │ │
│  │  - List of all agents                             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              InputArea                             │ │
│  │  - AutoExpandingTextarea (max 50% chat height)    │ │
│  │  - SendButton                                      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Компоненты

#### AgentsList

```typescript
// Requirements: agents.1.1, agents.1.5-1.9, agents.2.1-2.2
interface AgentsListProps {
  agents: Agent[];
  activeAgentId: string | null;
  messagesMap: Map<string, Message[]>; // Для вычисления статусов
  onAgentClick: (agentId: string) => void;
  onNewChat: () => void;
  onShowHistory: () => void;
}

function AgentsList({ agents, activeAgentId, messagesMap, onAgentClick, onNewChat, onShowHistory }: AgentsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  
  // Requirements: agents.1.7 — адаптивность к ширине экрана
  useEffect(() => {
    const calculateVisibleCount = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      // Каждая иконка: 32px + 8px gap = 40px
      // New chat button: 40px, +N button: 40px
      const availableWidth = containerWidth - 80;
      const maxChats = Math.floor(availableWidth / 40);
      setVisibleCount(Math.max(1, maxChats)); // Requirements: agents.1.8
    };
    
    calculateVisibleCount();
    window.addEventListener('resize', calculateVisibleCount);
    return () => window.removeEventListener('resize', calculateVisibleCount);
  }, []);
  
  const visibleAgents = agents.slice(0, visibleCount);
  const hiddenCount = agents.length - visibleCount;
  
  return (
    <div ref={containerRef} className="flex items-center gap-2 justify-end">
      {/* Requirements: agents.2.1, agents.2.2 — New chat button */}
      <button
        onClick={onNewChat}
        className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center"
        title="New chat"
      >
        <Plus className="w-4 h-4 text-white" />
      </button>
      
      {/* Requirements: agents.1.1, agents.1.6 — Agent icons */}
      {visibleAgents.map(agent => {
        const messages = messagesMap.get(agent.agentId) || [];
        const status = computeAgentStatus(messages);
        return (
          <AgentIcon
            key={agent.agentId}
            agent={agent}
            status={status}
            isActive={agent.agentId === activeAgentId}
            onClick={() => onAgentClick(agent.agentId)}
          />
        );
      })}
      
      {/* Requirements: agents.1.9 — +N button */}
      {hiddenCount > 0 && (
        <button
          onClick={onShowHistory}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium"
          title={`${hiddenCount} more agents`}
        >
          +{hiddenCount}
        </button>
      )}
    </div>
  );
}
```

#### AgentIcon

```typescript
// Requirements: agents.1.2, agents.1.5, agents.1.6, agents.3.5, agents.6
interface AgentIconProps {
  agent: Agent;
  status: AgentStatus;
  isActive: boolean;
  onClick: () => void;
}

function AgentIcon({ agent, status, isActive, onClick }: AgentIconProps) {
  const style = STATUS_STYLES[status];
  const letter = agent.name.charAt(0).toUpperCase();
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center relative',
        style.bgColor,
        isActive && 'ring-2 ring-primary', // Requirements: agents.1.5
        style.animation === 'animate-pulse' && 'animate-pulse'
      )}
      title={`${agent.name} - ${style.label}`} // Requirements: agents.3.5
    >
      {/* Spinning ring for in-progress */}
      {style.animation === 'animate-spin' && (
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
      )}
      
      {/* Icon or letter */}
      {status === 'error' ? (
        <X className="w-4 h-4 text-white" />
      ) : status === 'completed' ? (
        <Check className="w-4 h-4 text-white" />
      ) : (
        <span className="text-xs font-semibold text-white">{letter}</span>
      )}
      
      {/* HelpCircle for awaiting-user */}
      {status === 'awaiting-user' && (
        <HelpCircle className="w-3 h-3 text-white absolute -bottom-0.5 -right-0.5" />
      )}
    </button>
  );
}
```

#### ActiveAgentInfo

```typescript
// Requirements: agents.8.1, agents.8.3
interface ActiveAgentInfoProps {
  agent: Agent;
  status: AgentStatus;
}

function ActiveAgentInfo({ agent, status }: ActiveAgentInfoProps) {
  const style = STATUS_STYLES[status];
  
  return (
    <div className="flex items-center gap-3 w-1/2">
      {/* Status icon (32px) */}
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', style.bgColor)}>
        {status === 'error' ? (
          <X className="w-4 h-4 text-white" />
        ) : status === 'completed' ? (
          <Check className="w-4 h-4 text-white" />
        ) : (
          <span className="text-xs font-semibold text-white">
            {agent.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        {/* Agent name with truncate */}
        <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
        {/* Status text */}
        <p className={cn('text-xs', style.textColor)}>{style.label}</p>
        {/* Created time */}
        <p className="text-xs text-muted-foreground">
          {new Date(agent.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
```

#### HistoryPage

```typescript
// Requirements: agents.5.1-5.5
interface HistoryPageProps {
  agents: Agent[];
  messagesMap: Map<string, Message[]>;
  onBack: () => void;
  onAgentClick: (agentId: string) => void;
}

function HistoryPage({ agents, messagesMap, onBack, onAgentClick }: HistoryPageProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="p-2 hover:bg-secondary rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="text-lg font-semibold">Agents History</h3>
          <p className="text-xs text-muted-foreground">{agents.length} agents</p>
        </div>
      </div>
      
      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {agents.map(agent => {
          const messages = messagesMap.get(agent.agentId) || [];
          const status = computeAgentStatus(messages);
          const style = STATUS_STYLES[status];
          
          return (
            <button
              key={agent.agentId}
              onClick={() => onAgentClick(agent.agentId)}
              className="w-full p-4 rounded-lg border border-border hover:border-primary/50 text-left"
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', style.bgColor)}>
                  {status === 'error' ? (
                    <X className="w-5 h-5 text-white" />
                  ) : status === 'completed' ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <span className="text-sm font-semibold text-white">
                      {agent.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm">{agent.name}</h4>
                  <p className={cn('text-xs', style.textColor)}>{style.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created: {new Date(agent.createdAt).toLocaleString()}
                  </p>
                  {/* Requirements: agents.5.5 — error message */}
                  {status === 'error' && messages.length > 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      {getErrorMessage(messages[messages.length - 1])}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getErrorMessage(message: Message): string {
  try {
    const payload = JSON.parse(message.payloadJson);
    return payload.data?.result?.error?.message || 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}
```

#### Переключение агентов

```typescript
// Requirements: agents.3.1-3.4
async function handleAgentSwitch(agentId: string) {
  // Requirements: agents.3.1 — становится активным
  setActiveAgentId(agentId);
  
  // Requirements: agents.3.3 — визуальный индикатор обновляется автоматически через state
  
  // Requirements: agents.3.2 — загрузка сообщений
  const messages = await window.api.messages.list(agentId, userId);
  setMessages(messages);
  
  // Requirements: agents.3.4 — < 100ms (IPC + SQLite query)
}
```

#### ActivityIndicator

```typescript
// Requirements: agents.11
function ActivityIndicator({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  
  return (
    <div className="flex items-center gap-2 p-4">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  );
}
```

#### AutoExpandingTextarea

```typescript
// Requirements: agents.4.5, agents.4.6, agents.4.7
function AutoExpandingTextarea({ 
  value, 
  onChange, 
  onSubmit,
  chatAreaRef 
}: AutoExpandingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    const textarea = textareaRef.current;
    const chatArea = chatAreaRef.current;
    if (!textarea || !chatArea) return;
    
    // Reset height to auto to get scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate max height (50% of chat area)
    const maxHeight = chatArea.offsetHeight * 0.5;
    
    // Set height to scrollHeight, capped at maxHeight
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    
    // Show scrollbar if content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, chatAreaRef]);
  
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder="Ask, reply, or give command..."
      className="w-full resize-none border rounded-lg p-3"
    />
  );
}
```

## Markdown рендеринг

Для первой версии — простой рендеринг без подсветки синтаксиса:

```typescript
// Requirements: agents.7.7
import ReactMarkdown from 'react-markdown';

function MessageContent({ content, format }: { content: string; format?: 'markdown' | 'text' }) {
  if (format === 'markdown') {
    return (
      <ReactMarkdown className="prose prose-sm max-w-none">
        {content}
      </ReactMarkdown>
    );
  }
  
  return <p>{content}</p>;
}
```

## Визуальные индикаторы статусов

```typescript
// Requirements: agents.6
const STATUS_STYLES: Record<AgentStatus, StatusStyle> = {
  new: {
    bgColor: 'bg-sky-400',
    ringColor: 'ring-sky-400/30',
    textColor: 'text-sky-600',
    icon: null,
    animation: null,
    label: 'New'
  },
  'in-progress': {
    bgColor: 'bg-blue-500',
    ringColor: 'ring-blue-500/30',
    textColor: 'text-blue-600',
    icon: null,
    animation: 'animate-spin',
    label: 'In progress'
  },
  'awaiting-user': {
    bgColor: 'bg-amber-500',
    ringColor: 'ring-amber-500/30',
    textColor: 'text-amber-600',
    icon: HelpCircle,
    animation: 'animate-pulse',
    label: 'Awaiting response'
  },
  error: {
    bgColor: 'bg-red-500',
    ringColor: 'ring-red-500/30',
    textColor: 'text-red-600',
    icon: X,
    animation: null,
    label: 'Error'
  },
  completed: {
    bgColor: 'bg-green-500',
    ringColor: 'ring-green-500/30',
    textColor: 'text-green-600',
    icon: Check,
    animation: null,
    label: 'Completed'
  }
};
```

## Стратегия тестирования

### Модульные тесты

| Файл | Покрытие |
|------|----------|
| `tests/unit/DatabaseManager.test.ts` | user-data-isolation.6 |
| `tests/unit/agents/AgentManager.test.ts` | agents.2, agents.10 |
| `tests/unit/agents/MessageManager.test.ts` | agents.4, agents.7 |
| `tests/unit/agents/computeAgentStatus.test.ts` | agents.9 |
| `tests/unit/agents/ActivityIndicator.test.tsx` | agents.11 |
| `tests/unit/agents/AutoExpandingTextarea.test.tsx` | agents.4.5-4.7 |

### Property-Based тесты

| Файл | Покрытие |
|------|----------|
| `tests/property/agents/agentId.property.test.ts` | agents.2.3 |
| `tests/property/agents/status.property.test.ts` | agents.9 |

### Функциональные тесты

| Файл | Покрытие |
|------|----------|
| `tests/functional/agents.spec.ts` | agents.1-12 |

### Покрытие требований

| Требование | Модульные | Property-Based | Функциональные |
|------------|-----------|----------------|----------------|
| agents.1 | ✓ | - | ✓ |
| agents.2 | ✓ | ✓ | ✓ |
| agents.3 | ✓ | - | ✓ |
| agents.4 | ✓ | - | ✓ |
| agents.5 | ✓ | - | ✓ |
| agents.6 | ✓ | - | ✓ |
| agents.7 | ✓ | - | ✓ |
| agents.8 | ✓ | - | ✓ |
| agents.9 | ✓ | ✓ | ✓ |
| agents.10 | ✓ | - | ✓ |
| agents.11 | ✓ | - | ✓ |
| agents.12 | ✓ | - | ✓ |
| user-data-isolation.6 | ✓ | - | ✓ |

## Зависимости

### Внешние библиотеки

```json
{
  "lucide-react": "^0.300.0",
  "react-markdown": "^9.0.0"
}
```

### Внутренние компоненты

- `Logo` — компонент логотипа агента
- `MainEventBus` — шина событий main процесса
- `useEventSubscription` — React hook для подписки на события

## Производительность

- Переключение между агентами: < 100ms
- Анимации: 60 FPS
- Пересчет видимых агентов при resize: < 50ms
- Рендеринг сообщения: < 50ms

## Безопасность

- Все запросы к БД фильтруются по userId
- Проверка владельца агента при операциях с сообщениями
- Санитизация HTML в сообщениях через react-markdown
