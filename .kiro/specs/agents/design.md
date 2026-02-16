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

Бизнес-логика сообщений. Использует MessagesRepository для доступа к БД.

**Файл:** `src/main/agents/MessageManager.ts`

```typescript
// Requirements: agents.4, agents.7, user-data-isolation.6.5
class MessageManager {
  private messagesRepo: MessagesRepository;
  
  constructor(messagesRepo: MessagesRepository) {
    this.messagesRepo = messagesRepo;
  }
  
  // Список сообщений агента
  async list(agentId: string): Promise<Message[]> {
    return this.messagesRepo.listByAgent(agentId);
  }
  
  // Создание сообщения
  async create(agentId: string, payload: MessagePayload): Promise<Message> {
    const payloadJson = JSON.stringify(payload);
    const message = this.messagesRepo.create(agentId, payloadJson);
    
    MainEventBus.getInstance().publish(new MessageCreatedEvent({
      id: String(message.id),
      agentId,
      role: payload.kind === 'user' ? 'user' : 'assistant',
      content: (payload.data as { text?: string })?.text || '',
      createdAt: Date.parse(message.timestamp)
    }));
    
    return message;
  }
  
  // Обновление сообщения
  async update(messageId: number, agentId: string, payload: MessagePayload): Promise<void> {
    const payloadJson = JSON.stringify(payload);
    this.messagesRepo.update(messageId, agentId, payloadJson);
    
    MainEventBus.getInstance().publish(new MessageUpdatedEvent(String(messageId), {
      content: (payload.data as { text?: string })?.text || ''
    }));
  }
  
  // Получение последнего сообщения агента
  // Requirements: agents.5.5
  async getLastMessage(agentId: string): Promise<Message | null> {
    return this.messagesRepo.getLastByAgent(agentId);
  }
}
```

### MessagesRepository

Repository для работы с сообщениями через Drizzle ORM. Обеспечивает изоляцию данных и фильтрацию архивированных агентов.

**Файл:** `src/main/db/repositories/MessagesRepository.ts`

```typescript
// Requirements: user-data-isolation.6.2, user-data-isolation.7.6, agents.5.5
import { eq, and, asc, desc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { messages, Message } from '../schema';
import { AgentsRepository } from './AgentsRepository';

class MessagesRepository {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private getUserId: () => string,
    private agentsRepo: AgentsRepository
  ) {}
  
  // Проверка доступа к агенту (принадлежит текущему пользователю)
  private checkAccess(agentId: string): void {
    const agent = this.agentsRepo.findById(agentId);
    if (!agent) {
      throw new Error('Access denied');
    }
  }
  
  // Список сообщений агента (сортировка по id ASC)
  listByAgent(agentId: string): Message[] {
    this.checkAccess(agentId);
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.agentId, agentId))
      .orderBy(asc(messages.id))
      .all();
  }
  
  // Получение последнего сообщения (сортировка по timestamp DESC, LIMIT 1)
  // Работает для активных и архивированных агентов (фильтрация на уровне AgentsRepository.list)
  // Requirements: agents.5.5, agents.5.8
  getLastByAgent(agentId: string): Message | null {
    this.checkAccess(agentId);
    
    const result = this.db
      .select()
      .from(messages)
      .where(eq(messages.agentId, agentId))
      .orderBy(desc(messages.timestamp))
      .limit(1)
      .all();
    
    return result.length > 0 ? result[0] : null;
  }
  
  // Создание сообщения
  create(agentId: string, payloadJson: string): Message {
    this.checkAccess(agentId);
    const now = new Date().toISOString();
    
    const message = this.db
      .insert(messages)
      .values({ agentId, timestamp: now, payloadJson })
      .returning()
      .get();
    
    // Обновление updated_at агента
    this.agentsRepo.touch(agentId);
    
    return message;
  }
  
  // Обновление сообщения
  update(messageId: number, agentId: string, payloadJson: string): void {
    this.checkAccess(agentId);
    
    this.db
      .update(messages)
      .set({ payloadJson })
      .where(and(eq(messages.id, messageId), eq(messages.agentId, agentId)))
      .run();
  }
}
```

**Важно:** 
- `getLastByAgent` использует сортировку по `timestamp` (не по `id`), так как timestamp точно отражает время создания сообщения
- `getLastByAgent` работает для активных и архивированных агентов - фильтрация архивированных происходит на уровне `AgentsRepository.list()`
- `checkAccess` проверяет только принадлежность агента текущему пользователю
- Drizzle ORM обеспечивает type-safety и защиту от SQL injection

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
    
    // Requirements: agents.5.5 - Get last message for error display
    ipcMain.handle('messages:get-last', (_, { agentId }) => 
      this.messageManager.getLastMessage(agentId));
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
      ipcRenderer.invoke('messages:update', { messageId, agentId, payload }),
    
    // Requirements: agents.5.5 - Get last message for error display
    getLast: (agentId: string) => 
      ipcRenderer.invoke('messages:get-last', { agentId })
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

## Auto-create First Agent

**Requirements:** agents.2.7-2.11

### Принцип

Пользователь ВСЕГДА должен иметь хотя бы одного агента. Это фундаментальное правило системы.

### Реализация

Auto-create first agent обеспечивается на уровне UI (renderer process) в хуке \`useAgents\`:

1. **При первой загрузке** (пользователь впервые вошел в систему):
   - \`useAgents.loadAgents()\` получает пустой список от API
   - Автоматически создается новый агент с именем "New Agent"
   - Новый агент становится активным

2. **При архивировании последнего агента**:
   - \`useAgents.archiveAgent()\` проверяет \`agents.length === 1\`
   - Если это последний агент, автоматически создается новый агент
   - Новый агент становится активным

3. **Empty state UI никогда не показывается**:
   - Компонент \`agents.tsx\` не имеет UI для пустого состояния
   - Если \`agents.length === 0\`, это означает загрузку или ошибку
   - Показывается "Loading..." вместо "No agents yet"

### Почему на уровне UI, а не Main Process?

**Решение:** Auto-create first agent обеспечивается в renderer process (useAgents hook), а НЕ в main process (AgentManager).

**Причины:**

1. **Разделение ответственности:**
   - Main process отвечает за бизнес-логику и данные
   - Renderer process отвечает за UX и пользовательские правила

2. **Гибкость:**
   - В будущем могут появиться другие UI (мобильное приложение, web)
   - Каждый UI может иметь свои правила отображения

3. **Простота тестирования:**
   - Main process остается простым и предсказуемым
   - UI тесты проверяют auto-create в контексте пользовательского опыта

4. **Избежание race conditions:**
   - Если Main process проверяет правило, возможны race conditions между процессами
   - UI контролирует auto-create синхронно в одном потоке

### Код реализации

\`\`\`typescript
// src/renderer/hooks/useAgents.ts
// Requirements: agents.2.7, agents.2.8

const loadAgents = useCallback(async () => {
  try {
    setIsLoading(true);
    const result = await window.api.agents.list();
    
    if (result.success && result.data) {
      const agentList = result.data as Agent[];
      
      // AUTO-CREATE FIRST AGENT: Если список пуст, создать первого агента
      if (agentList.length === 0) {
        const firstAgentResult = await window.api.agents.create('New Agent');
        if (firstAgentResult.success && firstAgentResult.data) {
          const firstAgent = firstAgentResult.data as Agent;
          setAgents([firstAgent]);
          setActiveAgentId(firstAgent.agentId);
          return;
        }
      }
      
      setAgents(agentList);
      if (!activeAgentId && agentList.length > 0) {
        setActiveAgentId(agentList[0].agentId);
      }
    }
  } finally {
    setIsLoading(false);
  }
}, [activeAgentId]);

const archiveAgent = useCallback(async (agentId: string): Promise<boolean> => {
  try {
    // AUTO-CREATE FIRST AGENT: Проверить, архивируем ли последнего агента
    const isLastAgent = agents.length === 1;
    
    const result = await window.api.agents.archive(agentId);
    if (result.success) {
      // Выбрать следующего агента
      if (activeAgentId === agentId) {
        const remaining = agents.filter((a) => a.agentId !== agentId);
        setActiveAgentId(remaining.length > 0 ? remaining[0].agentId : null);
      }
      
      // AUTO-CREATE FIRST AGENT: Если архивировали последнего, создать нового
      if (isLastAgent) {
        const newAgentResult = await window.api.agents.create('New Agent');
        if (newAgentResult.success && newAgentResult.data) {
          const newAgent = newAgentResult.data as Agent;
          setActiveAgentId(newAgent.agentId);
        }
      }
      
      return true;
    }
    return false;
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to archive agent');
    return false;
  }
}, [activeAgentId, agents]);
\`\`\`
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

#### Детальная Спецификация Генераторов

**AGENT_CREATED** (agents.12.1)
- **Генератор:** `AgentManager.create()`
- **Файл:** `src/main/agents/AgentManager.ts`
- **Момент:** После создания агента в БД через `AgentsRepository.create()`
- **Условие:** Всегда при создании нового агента
- **Payload:** `{ data: { id, name, createdAt, updatedAt } }`

**AGENT_UPDATED** (agents.12.2)
- **Генератор 1:** `AgentManager.update()`
  - **Файл:** `src/main/agents/AgentManager.ts`
  - **Момент:** После обновления в БД через `AgentsRepository.update()`
  - **Условие:** При изменении имени агента через API
  - **Payload:** `{ id: agentId, changedFields: { name } }`

- **Генератор 2:** `AgentManager.handleMessageCreated()`
  - **Файл:** `src/main/agents/AgentManager.ts`
  - **Триггер:** Подписка на событие `MESSAGE_CREATED` (в конструкторе)
  - **Момент:** После обновления `updatedAt` в БД через `AgentsRepository.touch()`
  - **Условие:** При создании любого сообщения в чате агента
  - **Payload:** `{ id: agentId, changedFields: { updatedAt } }`

**AGENT_ARCHIVED** (agents.12.3)
- **Генератор:** `AgentManager.archive()`
- **Файл:** `src/main/agents/AgentManager.ts`
- **Момент:** После архивирования в БД через `AgentsRepository.archive()`
- **Условие:** При архивировании агента через API
- **Payload:** `{ id: agentId }`

**MESSAGE_CREATED** (agents.12.4)
- **Генератор:** `MessageManager.create()`
- **Файл:** `src/main/agents/MessageManager.ts`
- **Момент:** После создания сообщения в БД через `MessagesRepository.create()`
- **Условие:** При создании нового сообщения в чате
- **Payload:** `{ data: { id, agentId, timestamp, payloadJson } }`
- **Побочный эффект:** Триггерит `AgentManager.handleMessageCreated()` → генерирует `AGENT_UPDATED`

**MESSAGE_UPDATED** (agents.12.5)
- **Генератор:** `MessageManager.update()`
- **Файл:** `src/main/agents/MessageManager.ts`
- **Момент:** После обновления payload в БД через `MessagesRepository.update()`
- **Условие:** При обновлении содержимого сообщения (например, завершение tool_call)
- **Payload:** `{ id: messageId, changedFields: { payloadJson } }`

#### Flow Событий: Создание Сообщения

```
User отправляет сообщение
    ↓
MessageManager.create()
    → Сохраняет в БД (MessagesRepository)
    → Генерирует MESSAGE_CREATED
        ↓
        ├─→ AgentManager.handleMessageCreated() (Main Process)
        │   → Обновляет agent.updatedAt в БД
        │   → Генерирует AGENT_UPDATED
        │       ↓
        │       └─→ useAgents (Renderer)
        │           → Обновляет timestamp в UI
        │
        └─→ useMessages (Renderer)
            → Добавляет сообщение в чат
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

#### Детальная Спецификация Подписчиков

**MESSAGE_CREATED** (agents.12.4, agents.12.7)

*Подписчик 1: AgentManager (Main Process)*
- **Файл:** `src/main/agents/AgentManager.ts`
- **Метод:** `handleMessageCreated()`
- **Подписка:** В конструкторе через `subscribeToEvents()`
- **Фильтр:** Нет (обрабатывает все сообщения)
- **Действия:**
  1. Обновляет `agent.updatedAt` в БД
  2. Получает обновленного агента из БД
  3. Генерирует событие `AGENT_UPDATED`

*Подписчик 2: useMessages (Renderer)*
- **Файл:** `src/renderer/hooks/useMessages.ts`
- **Подписка:** `useEventSubscription(MESSAGE_CREATED, handler)`
- **Фильтр:** `payload.data.agentId === activeAgentId` (только для активного агента)
- **Действия:**
  1. Конвертирует event message → renderer message
  2. Парсит payload
  3. Добавляет в `messages` state (если еще нет)
  4. Сортирует по timestamp
  5. Триггерит React re-render → сообщение появляется в чате

**MESSAGE_UPDATED** (agents.12.5, agents.12.7)

*Подписчик: useMessages (Renderer)*
- **Файл:** `src/renderer/hooks/useMessages.ts`
- **Подписка:** `useEventSubscription(MESSAGE_UPDATED, handler)`
- **Фильтр:** Нет (обрабатывает все обновления)
- **Действия:**
  1. Находит сообщение по `id` в state
  2. Обновляет `payloadJson` из `changedFields`
  3. Парсит новый payload
  4. Триггерит React re-render → сообщение обновляется в чате

**AGENT_CREATED** (agents.12.1, agents.12.6)

*Подписчик: useAgents (Renderer)*
- **Файл:** `src/renderer/hooks/useAgents.ts`
- **Подписка:** `useEventSubscription(AGENT_CREATED, handler)`
- **Фильтр:** Нет (обрабатывает все новые агенты)
- **Действия:**
  1. Конвертирует event agent → renderer agent
  2. Добавляет в начало `agents` state
  3. Пересортировывает по `updatedAt` (DESC)
  4. Триггерит React re-render → агент появляется в списке

**AGENT_UPDATED** (agents.12.2, agents.12.6)

*Подписчик: useAgents (Renderer)*
- **Файл:** `src/renderer/hooks/useAgents.ts`
- **Подписка:** `useEventSubscription(AGENT_UPDATED, handler)`
- **Фильтр:** `payload.id === agent.agentId`
- **Действия:**
  1. Находит агента по `id` в state
  2. Обновляет `name` (если есть в `changedFields`)
  3. Обновляет `updatedAt` (если есть в `changedFields`)
  4. Конвертирует timestamp → ISO string
  5. **Пересортировывает список агентов по `updatedAt` DESC** (agents.1.4.1, agents.1.4.2)
  6. Триггерит React re-render → агент перемещается в начало списка

**Пересортировка при обновлении (agents.1.4.1, agents.1.4.2, agents.1.4.3):**
- Агент с обновленным `updatedAt` автоматически перемещается в начало списка
- Если агент был скрыт (за пределами видимой части хедера), он появляется в начале
- Пересортировка происходит в реальном времени при получении события
- Используется `Array.sort()` с компаратором по `updatedAt` DESC

**Анимация перехода агента (agents.1.4.4):**
- Используется `framer-motion` с `AnimatePresence` и `motion.div`
- `AnimatePresence` с `mode="popLayout"` для управления анимацией списка
- Каждый агент обернут в `motion.div` с `layout` prop для плавного перемещения
- Spring анимация с параметрами:
  - `type: 'spring'`
  - `stiffness: 400` - жесткость пружины
  - `damping: 30` - затухание
  - `mass: 0.8` - масса элемента
- Анимация появления/исчезновения:
  - `initial={{ opacity: 0, scale: 0.8 }}`
  - `animate={{ opacity: 1, scale: 1 }}`
  - `exit={{ opacity: 0, scale: 0.8 }}`
  - `duration: 0.2` для opacity и scale

**AGENT_ARCHIVED** (agents.12.3, agents.12.6)

*Подписчик: useAgents (Renderer)*
- **Файл:** `src/renderer/hooks/useAgents.ts`
- **Подписка:** `useEventSubscription(AGENT_ARCHIVED, handler)`
- **Фильтр:** Нет (обрабатывает все архивирования)
- **Действия:**
  1. Удаляет агента из `agents` state
  2. Если список пустой → auto-create нового агента (agents.2.7)
  3. Триггерит React re-render → агент исчезает из списка

#### Справочная Таблица: События

| Событие | Генератор | Подписчики | Файлы |
|---------|-----------|------------|-------|
| **MESSAGE_CREATED** | `MessageManager.create()` | 1. `AgentManager` (Main)<br>2. `useMessages` (Renderer) | `src/main/agents/MessageManager.ts`<br>`src/main/agents/AgentManager.ts`<br>`src/renderer/hooks/useMessages.ts` |
| **MESSAGE_UPDATED** | `MessageManager.update()` | `useMessages` (Renderer) | `src/main/agents/MessageManager.ts`<br>`src/renderer/hooks/useMessages.ts` |
| **AGENT_CREATED** | `AgentManager.create()` | `useAgents` (Renderer) | `src/main/agents/AgentManager.ts`<br>`src/renderer/hooks/useAgents.ts` |
| **AGENT_UPDATED** | 1. `AgentManager.update()`<br>2. `AgentManager.handleMessageCreated()` | `useAgents` (Renderer) | `src/main/agents/AgentManager.ts`<br>`src/renderer/hooks/useAgents.ts` |
| **AGENT_ARCHIVED** | `AgentManager.archive()` | `useAgents` (Renderer) | `src/main/agents/AgentManager.ts`<br>`src/renderer/hooks/useAgents.ts` |

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
        {/* Updated time - Requirements: agents.8.1, settings.2.1 */}
        <p className="text-xs text-muted-foreground">
          {DateTimeFormatter.formatDateTime(agent.updatedAt)}
        </p>
      </div>
    </div>
  );
}
```

#### AllAgents Component

```typescript
// Requirements: agents.5.1-5.5
interface AllAgentsProps {
  agents: Agent[];
  messagesMap: Map<string, Message[]>;
  onBack: () => void;
  onAgentClick: (agentId: string) => void;
}

function AllAgents({ agents, messagesMap, onBack, onAgentClick }: AllAgentsProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="p-2 hover:bg-secondary rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="text-lg font-semibold">All Agents</h3>
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
// Requirements: agents.4.5, agents.4.6, agents.4.7, agents.4.7.1
function AutoExpandingTextarea({ 
  value, 
  onChange, 
  onSubmit,
  chatAreaRef 
}: AutoExpandingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Expose focus method to parent via ref
  // Requirements: agents.4.7.1
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
  }));
  
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

#### Автофокус на поле ввода

**Requirements:** agents.4.7.1, agents.4.7.2

При активации чата агента фокус автоматически устанавливается на поле ввода для улучшения UX.

**Реализация в Agents компоненте:**

```typescript
const textareaRef = useRef<AutoExpandingTextareaHandle>(null);

// Auto-focus input when active agent changes
// Requirements: agents.4.7.1, agents.4.7.2
useEffect(() => {
  if (activeAgent && textareaRef.current) {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }
}, [activeAgent?.agentId]);
```

**Сценарии автофокуса:**
1. Клик на иконку агента в списке → меняется `activeAgent` → срабатывает `useEffect` → фокус
2. Возврат из AllAgents → меняется `activeAgent` → срабатывает `useEffect` → фокус
3. Первая загрузка → устанавливается первый агент → срабатывает `useEffect` → фокус
4. Создание нового агента → новый агент становится активным → срабатывает `useEffect` → фокус

### EmptyStatePlaceholder

Компонент пустого стейта для нового агента без сообщений.

```typescript
// Requirements: agents.4.14-4.18
import { motion } from 'framer-motion';
import { Video, CheckSquare, FileText, Calendar } from 'lucide-react';
import { Logo } from '../logo';

interface EmptyStatePlaceholderProps {
  onPromptClick?: (prompt: string) => void;
}

function EmptyStatePlaceholder({ onPromptClick }: EmptyStatePlaceholderProps) {
  const prompts = [
    { icon: <Video className="w-4 h-4" />, prompt: 'Transcribe my latest meeting' },
    { icon: <CheckSquare className="w-4 h-4" />, prompt: "Extract action items from today's standup" },
    { icon: <FileText className="w-4 h-4" />, prompt: 'Create Jira tickets from meeting notes' },
    { icon: <Calendar className="w-4 h-4" />, prompt: 'Send summary to the team' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center justify-center space-y-8 py-12"
    >
      {/* Logo and title */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <Logo size="lg" animated={true} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">
            Assign a task to the agent
          </h2>
          <p className="text-sm text-muted-foreground">
            Transcribes meetings, extracts tasks, creates Jira tickets
          </p>
        </div>
      </div>

      {/* Prompt suggestions grid */}
      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
        {prompts.map((item, index) => (
          <motion.button
            key={index}
            onClick={() => onPromptClick?.(item.prompt)}
            className="group flex items-center gap-3 p-4 bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 rounded-xl transition-all text-left"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              {item.icon}
            </div>
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              {item.prompt}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
```

**Особенности:**
- Анимированный логотип с улучшенной анимацией узлов и линий (см. ниже)
- Плавное появление с motion.div (fade in + slide up, 500ms)
- Адаптивная сетка (1 колонка на mobile, 2 на desktop)
- Анимация кнопок при hover (scale 1.02) и tap (scale 0.98)
- Изменение цвета иконки при hover (primary → primary-foreground)
- Автоматическая отправка сообщения при клике на промпт
- Выравнивание по нижнему краю области сообщений (justify-end)

**Анимация логотипа:**

Логотип использует 4 типа анимаций пульсации для узлов:
- `pulse-subtle` (3.2s): Легкая пульсация для верхнего левого узла
- `pulse-medium` (2.4s-3s): Средняя пульсация для боковых узлов
- `pulse-strong` (2.6s): Сильная пульсация для верхнего правого узла
- `pulse-center` (2.88s): Сложная пульсация для центрального узла (3 фазы)

Анимация линий связей:
- `flow-fast` (2s): Быстрое движение для линий 1 и 3
- `flow-slow` (2.6s-2.8s): Медленное движение для линий 2 и 4
- Изменение opacity во время анимации (0.3-0.8)

Каждый узел и линия имеют индивидуальные задержки (0s-2.2s) для создания органичного эффекта.

### Стилизация Сообщений

**Сообщения пользователя:**
```tsx
// Requirements: agents.4.9, agents.4.22
<div className="flex justify-end">
  <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {message.content}
    </p>
  </div>
</div>
```

**Особенности:**
- `rounded-2xl` (16px) - более скругленные углы для мягкого вида
- `bg-secondary/70` - серый полупрозрачный фон (70% opacity)
- `border border-border` - тонкая серая рамка (1px)
- `max-w-[75%]` - максимальная ширина 75% для длинных сообщений
- `whitespace-pre-wrap` - сохранение переносов строк из текста
- `break-words` - перенос длинных слов без пробелов
- Выравнивание справа через `justify-end`
- Текст выравнен слева внутри баллона (без `text-right`)

**Сообщения агента:**
```tsx
// Requirements: agents.4.10, agents.4.22
<>
  {showAvatar && (
    <div className="mb-2">
      <Logo size="sm" showText={false} animated={isInProgress} />
    </div>
  )}
  <div className="max-w-[85%] text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
    {message.content}
  </div>
</>
```

**Особенности:**
- Без фона и рамки - чистый текст
- Аватар показывается только для первого сообщения в последовательности
- `max-w-[85%]` - немного шире чем сообщения пользователя
- `whitespace-pre-wrap` - сохранение переносов строк из текста
- `break-words` - перенос длинных слов без пробелов
- Анимированный логотип при статусе `in-progress`

## Markdown рендеринг

Для первой версии — простой рендеринг без подсветки синтаксиса:

```typescript
// Requirements: agents.7.7
import ReactMarkdown from 'react-markdown';

function MarkdownMessage({ content, format }: { content: string; format?: 'markdown' | 'text' }) {
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

### Использование цветов статуса в UI

**Requirements: agents.6, agents.8.1, agents.5.3**

Цвет текста статуса (`textColor`) используется в следующих местах:

1. **Хедер активного агента** (agents.8.1):
   ```tsx
   <span className={`${style.text}`}>{getStatusText(currentAgent.status)}</span>
   ```
   - Отображается под названием агента в левой части хедера
   - Цвет меняется динамически в зависимости от статуса

2. **AllAgents страница** (agents.5.3):
   ```tsx
   <div className={`${style.text}`}>
     <span>{getStatusText(agent.status)}</span>
   </div>
   ```
   - Отображается в карточке каждого агента
   - Помогает быстро идентифицировать статус агента в списке

3. **Реализация** (`src/shared/utils/agentStatus.ts`):
   ```typescript
   export function getStatusStyles(status: AgentStatus): {
     bg: string;
     ring: string;
     text: string;
   } {
     switch (status) {
       case 'new':
         return { bg: 'bg-sky-400', ring: 'ring-sky-400/30', text: 'text-sky-600' };
       case 'in-progress':
         return { bg: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-600' };
       case 'awaiting-user':
         return { bg: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-600' };
       case 'error':
         return { bg: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600' };
       case 'completed':
         return { bg: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-600' };
     }
   }
   ```

## Стратегия тестирования

### Модульные тесты

| Файл | Покрытие |
|------|----------|
| `tests/unit/DatabaseManager.test.ts` | user-data-isolation.6 |
| `tests/unit/db/repositories/AgentsRepository.test.ts` | agents.5.6, user-data-isolation.6.3, user-data-isolation.7.6 |
| `tests/unit/db/repositories/MessagesRepository.test.ts` | agents.5.5, agents.5.8, user-data-isolation.7.6 |
| `tests/unit/agents/AgentManager.test.ts` | agents.2, agents.10 |
| `tests/unit/agents/MessageManager.test.ts` | agents.4, agents.7 |
| `tests/unit/agents/AgentIPCHandlers.test.ts` | agents.2, agents.4, agents.5.5 |
| `tests/unit/agents/computeAgentStatus.test.ts` | agents.9 |
| `tests/unit/agents/ActivityIndicator.test.tsx` | agents.11 |
| `tests/unit/agents/AutoExpandingTextarea.test.tsx` | agents.4.5-4.7 |
| `tests/unit/components/agents.test.tsx` | agents.4.22 |

### Property-Based тесты

| Файл | Покрытие |
|------|----------|
| `tests/property/agents/agentId.property.test.ts` | agents.2.3 |
| `tests/property/agents/status.property.test.ts` | agents.9 |

### Функциональные тесты

| Файл | Покрытие | Тесты |
|------|----------|-------|
| `tests/functional/agents.spec.ts` | agents.1-12 | Основные сценарии работы с агентами |
| `tests/functional/agents-always-one.spec.ts` | agents.2.7-2.11 | Автосоздание первого агента |
| `tests/functional/agents-error-messages.spec.ts` | agents.5.5, 5.6, 5.7 | Отображение ошибок в AllAgents |
| `tests/functional/auto-expanding-textarea.spec.ts` | agents.4.3-4.7 | Автоувеличение поля ввода |
| `tests/functional/empty-state-placeholder.spec.ts` | agents.4 | Пустой стейт с промптами |
| `tests/functional/message-text-wrapping.spec.ts` | agents.4.22 | 12 тестов переноса текста (см. ниже) |

#### Детальное покрытие agents.4.22 (message-text-wrapping.spec.ts)

1. "should wrap long words without spaces in user messages" - перенос длинных слов без пробелов
2. "should preserve line breaks in user messages" - сохранение переносов строк
3. "should have correct CSS classes for agent messages" - проверка CSS классов
4. "should not exceed chat area width with long content" - ограничение ширины сообщений
5. "should handle mixed content with long words and line breaks" - смешанный контент
6. "should preserve multiple consecutive line breaks" - множественные переносы строк
7. "should wrap long text with spaces naturally" - естественный перенос текста с пробелами
8. "should wrap code-like content without horizontal scroll" - перенос кода
9. "should preserve leading and trailing whitespace" - сохранение пробелов в начале/конце
10. "should maintain text wrapping after window resize" - перенос после изменения размера окна
11. "should handle emoji and Unicode characters correctly" - поддержка emoji и Unicode

### Покрытие требований

| Требование | Модульные | Property-Based | Функциональные |
|------------|-----------|----------------|----------------|
| agents.1 | ✓ | - | ✓ |
| agents.2 | ✓ | ✓ | ✓ |
| agents.2.7-2.11 (auto-create) | ✓ | ✓ | ✓ |
| agents.3 | ✓ | - | ✓ |
| agents.4 | ✓ | - | ✓ |
| agents.4.7.1-4.7.2 (autofocus) | - | - | ✓ |
| agents.4.22 (text wrapping) | ✓ | - | ✓ |
| agents.5 | ✓ | - | ✓ |
| agents.5.5 (error messages) | ✓ | - | ✓ |
| agents.5.6 (filter archived) | ✓ | - | ✓ |
| agents.5.7 (sort by updatedAt) | ✓ | - | ✓ |
| agents.5.8 (optimized SQL) | ✓ | - | - |
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
