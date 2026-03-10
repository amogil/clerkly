# Документ Дизайна: Agents

## Обзор

Agents — основной интерфейс для взаимодействия с AI-агентами в приложении Clerkly. Каждый агент представлен отдельным чатом с независимым контекстом. Компонент предоставляет список агентов, интерфейс чата и навигацию между агентами.
Этот документ описывает только UI-архитектуру модуля `Agents` и обработку persisted событий/сообщений. Логика взаимодействия с моделью и pipeline описывается в `docs/specs/llm-integration/design.md`.

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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  kind TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  reply_to_message_id INTEGER,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_timestamp ON messages(agent_id, timestamp);
```

**Примечание:** Детальный контракт хранения сообщений (`kind`, `done`, `reply_to_message_id`, `usage_json`, структура payload) задаётся в `docs/specs/llm-integration/design.md`; здесь используется его целевая схема.

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
type AgentStatus = 'new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed';
```

**Статус НЕ хранится в БД** — вычисляется из последних сообщений.

### Message Payload

```typescript
// Requirements: agents.7
interface MessagePayload {
  timing?: { started_at: string; finished_at: string };
  data: Record<string, unknown>;
}

interface Message {
  kind: 'user' | 'llm' | 'error' | 'tool_call';
  done: boolean;
  hidden: boolean;
  replyToMessageId?: number | null;
  payloadJson: string;
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
  
  // Инициализация БД
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
    
    const updatedAgent = await this.get(agentId);
    if (updatedAgent) {
      MainEventBus.getInstance().publish(new AgentUpdatedEvent(this.toEventAgent(updatedAgent)));
    }
    
    return { agentId, userId: this.userId, name: data.name!, createdAt: '', updatedAt: now };
  }
  
  // Архивирование агента
  async archive(agentId: string): Promise<void> {
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE agents SET archived_at = ?
      WHERE agent_id = ? AND user_id = ?
    `).run(now, agentId, this.userId);
    
    const archivedAgent = await this.get(agentId);
    if (archivedAgent) {
      MainEventBus.getInstance().publish(new AgentArchivedEvent(this.toEventAgent(archivedAgent)));
    }
  }
  
  // Обновление updated_at (вызывается из MessageManager)
  async touch(agentId: string): Promise<void> {
    const now = new Date().toISOString();
    
    this.db.prepare(`
      UPDATE agents SET updated_at = ? WHERE agent_id = ?
    `).run(now, agentId);
    
    const updatedAgent = await this.get(agentId);
    if (updatedAgent) {
      MainEventBus.getInstance().publish(new AgentUpdatedEvent(this.toEventAgent(updatedAgent)));
    }
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
  // Фильтруем hidden сообщения — они не видны в UI и не влияют на статус
  const visibleMessages = messages.filter(m => m.hidden !== true);

  if (visibleMessages.length === 0) {
    return 'new';
  }

  const lastMessage = visibleMessages[visibleMessages.length - 1];
  if (lastMessage.kind === 'error') return 'error';
  if (lastMessage.kind === 'user') return 'in-progress';
  if (lastMessage.kind === 'llm') {
    return lastMessage.done ? 'awaiting-response' : 'in-progress';
  }
  if (lastMessage.kind === 'tool_call') {
    if (!lastMessage.done) return 'in-progress';
    return lastMessage.payload?.data?.toolName === 'final_answer' ? 'completed' : 'awaiting-response';
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
   - Вместо локального empty-state показывается глобальный экран загрузки в \`App.tsx\` ("Loading...")

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
  
  constructor(public readonly agent: AgentSnapshot) {
    super();
  }
  
  toPayload(): EventPayloadWithoutTimestamp<AgentArchivedType> {
    return { agent: this.agent };
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
MainEventBus.getInstance().publish(new AgentUpdatedEvent(agentSnapshot));

// При архивировании агента
MainEventBus.getInstance().publish(new AgentArchivedEvent(agentSnapshot));

// При создании сообщения
MainEventBus.getInstance().publish(new MessageCreatedEvent(messageData));

// При обновлении сообщения
MainEventBus.getInstance().publish(new MessageUpdatedEvent(messageSnapshot));
```

#### Детальная Спецификация Генераторов

**AGENT_CREATED** (agents.12.1)
- **Генератор:** `AgentManager.create()`
- **Файл:** `src/main/agents/AgentManager.ts`
- **Момент:** После создания агента в БД через `AgentsRepository.create()`
- **Условие:** Всегда при создании нового агента
- **Payload:** `{ agent: agentSnapshot }`

**AGENT_UPDATED** (agents.12.2)
- **Генератор 1:** `AgentManager.update()`
  - **Файл:** `src/main/agents/AgentManager.ts`
  - **Момент:** После обновления в БД через `AgentsRepository.update()`
  - **Условие:** При изменении имени агента через API
  - **Payload:** `{ agent: agentSnapshot }`

- **Генератор 2:** `AgentManager.handleMessageCreated()`
  - **Файл:** `src/main/agents/AgentManager.ts`
  - **Триггер:** Подписка на событие `MESSAGE_CREATED` (в конструкторе)
  - **Момент:** После обновления `updatedAt` в БД через `AgentsRepository.touch()`
  - **Условие:** При создании любого сообщения в чате агента
  - **Payload:** `{ agent: agentSnapshot }`

**AGENT_ARCHIVED** (agents.12.3)
- **Генератор:** `AgentManager.archive()`
- **Файл:** `src/main/agents/AgentManager.ts`
- **Момент:** После архивирования в БД через `AgentsRepository.archive()`
- **Условие:** При архивировании агента через API
- **Payload:** `{ agent: agentSnapshot }`

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
- **Условие:** При обновлении содержимого сообщения (например, промежуточный/финальный апдейт `kind: llm`)
- **Payload:** полный snapshot сообщения

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
        └─→ useAgentChat (Renderer)
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
    setAgents(prev => [payload.agent, ...prev]);
  });
  
  useEventSubscription(EVENT_TYPES.AGENT_UPDATED, (payload) => {
    setAgents(prev => prev.map(agent => 
      agent.agentId === payload.agent.id 
        ? payload.agent
        : agent
    ));
  });
  
  useEventSubscription(EVENT_TYPES.AGENT_ARCHIVED, (payload) => {
    setAgents(prev => prev.filter(agent => agent.agentId !== payload.agent.id));
  });
  
  // Подписка на события сообщений
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, (payload) => {
    if (payload.message.agentId === activeAgentId) {
      setMessages(prev => [...prev, payload.message]);
    }
  });
  
  useEventSubscription(EVENT_TYPES.MESSAGE_UPDATED, (payload) => {
    setMessages(prev => prev.map(msg =>
      msg.id === payload.message.id
        ? payload.message
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

*Подписчик 2: useAgentChat (Renderer)*
- **Файл:** `src/renderer/hooks/useAgentChat.ts`
- **Подписка:** `useEventSubscription(MESSAGE_CREATED, handler)`
- **Фильтр:** `payload.message.agentId === activeAgentId` (только для активного агента)
- **Действия:**
  1. Конвертирует event message → renderer message
  2. Парсит payload
  3. Добавляет в `messages` state (если еще нет)
  4. Сортирует по timestamp
  5. Триггерит React re-render → сообщение появляется в чате

**MESSAGE_UPDATED** (agents.12.5, agents.12.7)

*Подписчик: useAgentChat (Renderer)*
- **Файл:** `src/renderer/hooks/useAgentChat.ts`
- **Подписка:** `useEventSubscription(MESSAGE_UPDATED, handler)`
- **Фильтр:** Нет (обрабатывает все обновления)
- **Действия:**
  1. Находит сообщение по `id` в state
  2. Заменяет snapshot сообщения целиком из `payload.message`
  3. Использует уже распарсенный payload сообщения
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
- **Фильтр:** `payload.agent.id === agent.agentId`
- **Действия:**
  1. Находит агента по `id` в state
  2. Заменяет snapshot агента целиком из `payload.agent`
  3. Использует `payload.agent.updatedAt` для пересортировки
  4. Конвертирует timestamp → ISO string
  5. **Пересортировывает список агентов по `updatedAt` DESC** (agents.1.4.1, agents.1.4.2)
  6. Триггерит React re-render → агент перемещается в начало списка

**Пересортировка при обновлении (agents.1.4.1, agents.1.4.2, agents.1.4.3):**
- Агент с обновленным `updatedAt` автоматически перемещается в начало списка
- Если агент был скрыт (за пределами видимой части хедера), он появляется в начале
- Пересортировка происходит в реальном времени при получении события
- Используется `Array.sort()` с компаратором по `updatedAt` DESC

**Анимация перехода агента (agents.1.4.4):**
- Пересортировка списка при изменении `updatedAt` выполняется без анимации перемещения.
- Для иконок списка используется только анимация появления (opacity/scale) через `motion.div`.

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
| **MESSAGE_CREATED** | `MessageManager.create()` | 1. `AgentManager` (Main)<br>2. `useAgentChat` (Renderer) | `src/main/agents/MessageManager.ts`<br>`src/main/agents/AgentManager.ts`<br>`src/renderer/hooks/useAgentChat.ts` |
| **MESSAGE_UPDATED** | `MessageManager.update()` | `useAgentChat` (Renderer) | `src/main/agents/MessageManager.ts`<br>`src/renderer/hooks/useAgentChat.ts` |
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
│  │              MessagesArea / AllAgentsPage          │ │
│  │  (flex-1, overflow-y-auto)                         │ │
│  │                                                    │ │
│  │  Chat mode:                                        │ │
│  │  - AgentWelcome (if no messages)         │ │
│  │  - MessageList                                     │ │
│  │  - ActivityIndicator (while llm/tool_call is in-progress) │ │
│  │                                                    │ │
│  │  All Agents mode (showAllAgentsPage):              │ │
│  │  - Back button                                     │ │
│  │  - "All Agents" title                              │ │
│  │  - List of all agents                              │ │
│  │  - Chat layer stays mounted and hidden via CSS     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              InputArea                             │ │
│  │  - PromptInput (AI Elements)                       │ │
│  │  - PromptInputTextarea (max 50% chat height)       │ │
│  │  - PromptInputSubmit                               │ │
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
// Requirements: agents.1.2, agents.1.5, agents.1.6, agents.3.5, agents.3.5.1, agents.3.5.2, agents.3.5.3, agents.6
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
    // Requirements: agents.3.5.3 - no native title attribute to avoid double tooltip
    <motion.div
      onClick={onClick}
      className={cn(
        'relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer',
        'hover:scale-110 transition-transform group',
        style.bgColor,
        isActive && 'ring-2 ring-primary ring-offset-2', // Requirements: agents.1.5
      )}
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
      
      {/* HelpCircle for awaiting-response */}
      {status === 'awaiting-response' && (
        <HelpCircle className="w-3 h-3 text-white absolute -bottom-0.5 -right-0.5" />
      )}

      {/* Requirements: agents.3.5, agents.3.5.1, agents.3.5.2 - Custom tooltip */}
      {/* Appears below icon with 2s delay, hides instantly on mouse leave */}
      <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 delay-0 group-hover:delay-[2000ms] z-[100] shadow-lg pointer-events-none">
        <p className="font-semibold mb-1">{agent.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-gray-300">
          <span>{style.label}</span>
        </div>
      </div>
    </motion.div>
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
        {/* Updated time - Requirements: agents.8.1, settings.3.1 */}
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

#### PromptInput (AI Elements)

```typescript
// Requirements: agents.4.1, agents.4.2, agents.4.2.1, agents.4.2.2, agents.4.3, agents.4.4, agents.4.5, agents.4.6, agents.4.7, agents.4.24
function ChatInput({
  agent,
  taskInput,
  setTaskInput,
  handleSend,
  cancelCurrentRequest,
  textareaRef,
  chatAreaRef,
}: ChatInputProps) {
  // Auto-resize remains controlled by AgentChat to preserve existing UX contracts.
  useEffect(() => {
    const textarea = textareaRef.current;
    const chatArea = chatAreaRef.current;
    if (!textarea || !chatArea) return;
    textarea.style.height = 'auto';
    const maxHeight = chatArea.offsetHeight * 0.5;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [taskInput, textareaRef, chatAreaRef]);

  const isStopMode = agent.status === 'in-progress';
  const canSend = taskInput.trim().length > 0;

  return (
    <PromptInput onSubmit={(message) => handleSend(message.text)}>
      <PromptInputBody>
        <PromptInputTextarea
          ref={textareaRef}
          data-testid="auto-expanding-textarea"
          placeholder="Ask, reply, or give command..."
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
        />
        <Button
          type={isStopMode ? 'button' : 'submit'}
          disabled={isStopMode ? false : !canSend}
          onClick={isStopMode ? () => cancelCurrentRequest() : undefined}
          aria-label={isStopMode ? 'Stop generation' : 'Send message'}
        >
          {isStopMode ? <Square /> : <Send />}
        </Button>
      </PromptInputBody>
      <PromptInputFooter>
        <p>Press Enter to send, Shift+Enter for new line</p>
      </PromptInputFooter>
    </PromptInput>
  );
}
```

**Важно:** поведение клавиатуры (`Enter` submit, `Shift+Enter` newline) делегировано `PromptInputTextarea`, без дополнительного кастомного `onKeyDown` в `AgentChat`.

**Техническое решение:** в текущей реализации поле ввода стандартизировано на AI Elements `PromptInput` и интегрировано с существующим chat send-flow.

**Алгоритм активности action-кнопки (agents.4.2, agents.4.2.1, agents.4.2.2):**
- Режим `stop` (`agent.status === 'in-progress'`) — кнопка всегда активна, независимо от текста в поле ввода.
- Режим `send` (любой статус кроме `in-progress`) — кнопка активна только если `taskInput.trim().length > 0`.

#### Автофокус на поле ввода

**Requirements:** agents.4.7.1, agents.4.7.2

При активации чата агента фокус автоматически устанавливается на поле ввода для улучшения UX.

**Реализация в Agents компоненте:**

```typescript
const textareaRef = useRef<HTMLTextAreaElement | null>(null);

// Auto-focus input when active agent changes
// Requirements: agents.4.7.1, agents.4.7.2
useEffect(() => {
  if (activeAgent) {
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

#### Автоскролл к последнему сообщению

**Requirements:** agents.4.13

Автоскролл управляется компонентом `Conversation` из `use-stick-to-bottom`. Поведение делегировано библиотеке: при положении внизу новые сообщения прокручиваются в видимую область, при положении не внизу принудительного скролла вниз не происходит.

**Реализация:**

`Conversation` (`src/renderer/components/ai-elements/conversation.tsx`) — тонкая обёртка над `StickToBottom` из `use-stick-to-bottom`. Автоматически прокручивает вниз при появлении новых сообщений, если пользователь не прокрутил вверх.

```tsx
// Requirements: agents.4.13
<Conversation className="flex-1 min-h-0">
  <ConversationContent data-testid="messages-area" className="flex flex-col gap-4 p-6 justify-end min-h-full">
    {/* сообщения */}
  </ConversationContent>
  <ConversationScrollButton /> {/* кнопка "вниз" когда пользователь прокрутил вверх */}
</Conversation>
```

**Поведение:**
- Пользователь внизу → новое сообщение → автоскролл (agents.4.13.1)
- Пользователь прокрутил вверх → новое сообщение → автоскролл НЕ срабатывает (agents.4.13.2)
- `ConversationScrollButton` показывается когда пользователь не внизу — клик возвращает вниз
- Скроллбар управляется нативно браузером через `overflow-y: auto` на контейнере `StickToBottom`

**Скролл при чтении истории:**
- Скролл работает нативно через `Conversation`
- Дополнительных обработчиков подгрузки нет

**Структура DOM:**

```tsx
{/* Messages Area */}
{/* Requirements: agents.4.13, agents.13 */}
<Conversation className="flex-1 min-h-0">
  <ConversationContent data-testid="messages-area" className="flex flex-col gap-4 p-6 justify-end min-h-full">
    {messages.length === 0 ? (
      <AgentWelcome onPromptClick={handlePromptClick} />
    ) : (
      messages.map((message) => (
        <motion.div key={message.id} data-testid="message">
          {/* Message content */}
        </motion.div>
      ))
    )}
  </ConversationContent>
  <ConversationScrollButton data-testid="scroll-to-bottom" />
</Conversation>
```

**Отображение скроллбара** (agents.4.13.4-4.13.6):

**Требования пользователя:**
- Скроллбар должен быть визуально ненавязчивым (agents.4.13.4)
- Скроллбар появляется при взаимодействии пользователя со скроллом (agents.4.13.5)
- Скроллбар автоматически скрывается после окончания скролла (agents.4.13.6)
- Автоскролл делегирован `Conversation`/`use-stick-to-bottom` без ручного `scrollTop`/`scrollIntoView` (agents.4.13.3)

**Техническая реализация:**

Используется компонент `Conversation` из AI Elements (`src/renderer/components/ai-elements/conversation.tsx`), который управляет автоскроллом через `use-stick-to-bottom`.

**Кнопка "Scroll to Bottom":**
- Реализована как `ScrollToBottomButton` внутри `AgentChat` — использует `useStickToBottomContext`
- Имеет `data-testid="scroll-to-bottom"` для функциональных тестов
- Показывается только когда пользователь не внизу (`isAtBottom === false`)

**Принцип работы:**

1. **Автоматическое сохранение** (agents.4.14): `Conversation` (`StickToBottom`) управляет скролом полностью. Поскольку компонент не размонтируется при переключении агентов, позиция сохраняется без дополнительной логики.

2. **Переключение агентов и вход/выход из All Agents** (agents.4.14.2–4.14.4, agents.5.9): CSS `absolute inset-0 opacity-0 pointer-events-none` скрывает неактивный `AgentChat`, а при открытии `All Agents` весь слой чатов скрывается через CSS (`invisible pointer-events-none`) без размонтирования. Это сохраняет `scrollTop`; при возврате `Back` `Conversation` восстанавливает ту же позицию скролла.

3. **Показ активного чата** (agents.4.14.5-4.14.6): первый показ активного чата выполняется только после достижения `startupSettled` у этого чата. До этого пользователь видит глобальный startup loader, а контент `AgentChat` не показывается, чтобы исключить скачок ширины/переносов и визуальный доскролл.

4. **После отправки сообщения** (agents.4.13.2): `AgentChatInner` НЕ выполняет ручной вызов `scrollToBottom`. Поведение остаётся у `Conversation`: если пользователь не внизу, позиция сохраняется, а кнопка `scroll-to-bottom` остаётся видимой.

**Сценарии:**

1. **Пользователь читает старые сообщения:**
   - Прокручивает вверх → позиция сохраняется в `Conversation`
   - Переключается на другого агента → `AgentChat` скрыт через CSS
   - Возвращается → `Conversation` восстанавливает позицию автоматически

2. **Пользователь отправляет сообщение:**
   - Отправляет из позиции не внизу → `Conversation` сохраняет текущую позицию
   - Кнопка `scroll-to-bottom` остаётся видимой до явного действия пользователя

3. **Агент отвечает в фоне:**
   - Пользователь читает старые сообщения (прокручен вверх)
   - Агент отвечает → автоскролл НЕ срабатывает (пользователь не внизу)
   - Переключается на другого агента и возвращается → позиция восстановлена

### AgentWelcome

Компонент пустого стейта для нового агента без сообщений.

```typescript
// Requirements: agents.4.14-4.18
import { motion } from 'framer-motion';
import { Video, CheckSquare, FileText, Calendar } from 'lucide-react';
import { Logo } from '../logo';

interface AgentWelcomeProps {
  onPromptClick?: (prompt: string) => void;
}

function AgentWelcome({ onPromptClick }: AgentWelcomeProps) {
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
- Application Logo с CSS-анимацией узлов (см. раздел "Визуальные Компоненты")
- Плавное появление с motion.div (fade in + slide up, 500ms)
- Адаптивная сетка (1 колонка на mobile, 2 на desktop)
- Анимация кнопок при hover (scale 1.02) и tap (scale 0.98)
- Изменение цвета иконки при hover (primary → primary-foreground)
- Автоматическая отправка сообщения при клике на промпт
- Выравнивание по нижнему краю области сообщений (justify-end)

### Стилизация Сообщений

**Requirements:** agents.4.9, agents.4.10, agents.4.10.1, agents.4.10.2, agents.4.22, llm-integration.3.4.4

Сообщения рендерятся через компонент `AgentMessage` (`src/renderer/components/agents/AgentMessage.tsx`). Каждое сообщение оборачивается в `motion.div` для анимации появления (fade-in + slide-up).

**Сообщения пользователя (kind: 'user'):**
```tsx
// Requirements: agents.4.9, agents.4.22
<div data-testid="message-user" className="flex justify-end">
  <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 min-w-0">
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {text}
    </p>
  </div>
</div>
```

**Сообщения агента (kind: 'llm'):**
```tsx
// Requirements: agents.4.10, agents.4.10.1, agents.4.22
<div data-testid="message-llm" className="space-y-2 w-full">
  {reasoningText && (
    <Reasoning isStreaming={isReasoningStreaming}>
      {/* App-owned trigger composition over AI Elements primitive */}
      <AgentReasoningTrigger />
      <ReasoningContent data-testid="message-llm-reasoning">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
  )}
  {text ? (
    <div data-testid="message-llm-action" className="text-sm leading-relaxed whitespace-pre-wrap break-words w-full">
      {text}
    </div>
  ) : null}
</div>
```

**Streaming контракт для `Reasoning`:**
- `Reasoning` используется как основной UI-блок reasoning из AI Elements (без замены на кастомный компонент).
- В `Reasoning` передаётся `isStreaming`, чтобы получить штатное поведение AI Elements:
  - авто-раскрытие во время стриминга;
  - авто-сворачивание после завершения стриминга;
  - возможность ручного раскрытия/сворачивания остаётся.
- `isReasoningStreaming` вычисляется только для активного LLM-сообщения, чтобы исторические сообщения не переходили в streaming-состояние.
- Порядок блоков неизменен: reasoning всегда рендерится выше `message-llm-action`.
- При активном reasoning без финального `data.text` в сообщении отображается reasoning-блок как единственный индикатор стриминга до появления текста ответа.
- Визуальный маркер reasoning-сообщения рендерится в заголовке `ReasoningTrigger` (иконка приложения + текстовый индикатор + chevron).
  Этот маркер в рамках спеки считается `Message Avatar` для reasoning-сообщений.

**Trigger иконка (`ReasoningTrigger`):**
- В app-owned компоненте `AgentReasoningTrigger` используется иконка приложения (`Logo`) вместо `BrainIcon`.
- Исходники `src/renderer/components/ai-elements/reasoning.tsx` не модифицируются.
- Иконка остаётся компактной и не ломает baseline строки trigger.
- Замена иконки не меняет API AI Elements primitives и не влияет на логику toggling.

**Сообщения об ошибке (kind: 'error'):**
```tsx
// Requirements: llm-integration.3.4.1, llm-integration.3.4.3, agents.4.10.2, agents.4.10.3, agents.4.10.4, agents.4.10.4.1, agents.4.10.5
<AgentDialog
  intent="error"
  approvalId="error"
  className="w-full max-w-full"
  message="Invalid API key. Please check your key and try again."
  actionItems={[
    { label: 'Open Settings', onClick: () => onNavigate('settings'), variant: 'outline' },
    { label: 'Retry', onClick: () => retryLast(agentId, replyToMessageId), variant: 'default' },
  ]}
/>
```

`AgentDialog` — кастомный диалог уведомлений. Поддерживает intent: `error`, `warning`, `info`, `confirmation`.
При нажатии `Retry` текущий error-диалог скрывается до старта повторного запроса.

**Диалог rate limit (agent.rate_limit):**
```tsx
// Requirements: llm-integration.3.7, agents.4.10.2
<AgentDialog
  intent="info"
  approvalId="rate-limit"
  className="w-full max-w-full"
  message="Rate limit exceeded. Retrying in N seconds..."
  actionItems={[
    { label: 'Cancel', onClick: () => cancelRetry(), variant: 'outline' },
  ]}
/>
```

**Сообщения инструментов (`kind: 'tool_call'`):**
- Для `toolName !== 'final_answer'` используется AI Elements `Tool` family как отдельный технический блок вызова инструмента.
- Для `toolName === 'final_answer'` используется отдельный компонент `"Final Answer"` на базе AI Elements `Queue`.
- Заголовок компонента: фиксированный текст `Done` + иконка `Check` (без круга).
- Тело компонента: только `summary_points`, каждый пункт с иконкой `Check` в зелёном круге.
- Компонент по умолчанию свернут, если `summary_points.length > 0`; при пустом `summary_points` рендерится в неколлапсируемом виде (без toggle).
- `Agents` не выполняет валидацию/repair `final_answer`; компонент рендерит только persisted payload.

```tsx
// Requirements: agents.7.4.1, agents.7.4.2
if (message.kind === 'tool_call' && toolName === 'final_answer') {
  const hasSummary = summaryPoints.length > 0;
  const title = 'Done';
  return (
    <Queue data-testid="message-final-answer-block">
      <QueueSection defaultOpen={false} disabled={!hasSummary}>
        {hasSummary ? (
          <div data-testid="message-final-answer-header">
            <QueueSectionTrigger data-testid="message-final-answer-toggle">
              <QueueSectionLabel
                data-testid="message-final-answer-title"
                label={title}
                icon={<Check data-testid="message-final-answer-check" className="text-green-600" />}
              />
            </QueueSectionTrigger>
          </div>
        ) : (
          <div data-testid="message-final-answer-header">
            <QueueSectionLabel
              data-testid="message-final-answer-title"
              label={title}
              icon={<Check data-testid="message-final-answer-check" className="text-green-600" />}
            />
          </div>
        )}
        {hasSummary ? (
          <QueueSectionContent data-testid="message-final-answer-summary">
            {summaryPoints.map((point) => (
              <QueueItem key={point}>
                <QueueItemIndicator completed />
                <QueueItemContent completed>{point}</QueueItemContent>
              </QueueItem>
            ))}
          </QueueSectionContent>
        ) : null}
      </QueueSection>
    </Queue>
  );
}
```

**Анимация появления:**
```tsx
// Requirements: agents.4.22
<motion.div
  key={message.id}
  data-testid="message"
  data-message-id={message.id}
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
>
  <AgentMessage message={message} onNavigate={onNavigate} />
</motion.div>
```

## Markdown рендеринг

Используется `MessageResponse` (Streamdown) с GFM и подсветкой кода. Поддерживаются:
- заголовки, параграфы, жирный/курсив/зачеркнутый
- ссылки и автоссылки (включая email)
- цитаты
- списки (маркированные/нумерованные), вложенные списки и task lists
- inline код и fenced code blocks с языком (подсветка синтаксиса)
- таблицы и горизонтальные разделители
- изображения
- Mermaid диаграммы
- математика через KaTeX (inline и block)
- сноски не поддерживаются

```typescript
// Requirements: agents.7.7
import { MessageResponse } from '../ai-elements/message';

function MarkdownMessage({ content }: { content: string }) {
  return <MessageResponse>{content}</MessageResponse>;
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
  'awaiting-response': {
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
       case 'awaiting-response':
         return { bg: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-600' };
       case 'error':
         return { bg: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600' };
       case 'completed':
         return { bg: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-600' };
     }
   }
   ```

## Визуальные Компоненты

Есть два типа анимации:
1. CSS-анимация узлов и линий (для логотипов)
2. JS-анимация появления элементов (opacity/scale) без spring-пересортировки списка

### 1. Application Logo (компонент Logo)

**Назначение:** Логотип Clerkly для брендинга

**Расположение:** Страница логина, пустой стейт чата

**Варианты:**
- Страница логина: без анимации
- Пустой стейт чата: с CSS-анимацией узлов

**Детали CSS-анимации узлов (5 узлов нейронной сети):**
- `pulse-subtle` (3.2s): верхний левый узел
  - opacity: 0.6 → 0.95 → 0.6
  - radius: 1.8 → 2.3 → 1.8
  - delay: 0s
- `pulse-medium` (2.4s-3s): боковые узлы (нижний левый, нижний правый)
  - opacity: 0.7 → 1.0 → 0.7
  - radius: 2.0 → 2.6 → 2.0
  - delay: 0.8s, 2.2s
- `pulse-strong` (2.6s): верхний правый узел
  - opacity: 0.85 → 1.0 → 0.85
  - radius: 2.2 → 2.8 → 2.2
  - delay: 1.6s
- `pulse-center` (2.88s): центральный узел, 3-фазная пульсация
  - opacity: 0.95 → 1.0 → 1.0 → 0.95
  - radius: 2.5 → 3.2 → 2.8 → 2.5
  - delay: 0.4s

**Детали CSS-анимации линий связей (4 линии):**
- `flow-fast` (2s-2.2s): линии 1 и 3
  - stroke-dasharray: 5 5
  - stroke-dashoffset: 20 → 0
  - opacity: 0.4 → 0.8 → 0.4
  - delay: 0s, 1.4s
- `flow-slow` (2.6s-2.8s): линии 2 и 4
  - stroke-dasharray: 5 5
  - stroke-dashoffset: 20 → 0
  - opacity: 0.3 → 0.7 → 0.3
  - delay: 0.7s, 2.1s

**Файл:** `src/renderer/components/logo.tsx`

**Test ID:** `data-testid="logo"`

### 2. Active Agent Icon (Logo в хедере)

**Назначение:** Иконка активного агента в левой части хедера

**Визуальное представление:** Идентичен Application Logo (те же узлы и линии)

**Условия показа анимации:**
- Иконка отражает текущий статус активного агента.
- Для `in-progress` используется вращающееся кольцо.
- Для `awaiting-response` используется пульсирующее кольцо.

**Реализация:**
```typescript
<AgentAvatar status={currentAgent.status} letter={letter} size="md" />
```

**CSS-анимация:** Статусная (spin/pulse) через компонент `AgentAvatar`

**Файл:** `src/renderer/components/agents.tsx`

**Test ID:** `data-testid="agent-header-icon"`

### 3. Agent List Icon в Agents List

**Назначение:** Иконка агента в горизонтальном списке (правая часть хедера)

**CSS-анимация статусов:**
- `in-progress`: вращающееся белое кольцо
  - `animate-spin` (Tailwind CSS)
  - `border-2 border-white border-t-transparent`
  - Непрерывное вращение, 60 FPS
- `awaiting-response`: пульсирующее цветное кольцо
  - `animate-pulse` (Tailwind CSS)
  - `ring-2` с цветом статуса (ring-amber-500/30)
  - Плавная пульсация opacity

**Перемещение без анимации:**
- Пересортировка списка происходит мгновенно, без анимации перемещения
- `layout` анимации для списка НЕ используются
- CSS-анимации статусов остаются (spin/pulse)

**Реализация:**
```typescript
{agents.slice(0, visibleChatsCount).map(agent => (
  <div key={agent.id}>
    {/* Иконка агента */}
  </div>
))}
```

**Файл:** `src/renderer/components/agents.tsx`

**Test ID:** `data-testid="agent-icon-{agentId}"`

### 4. Agent List Icon в All Agents

**Назначение:** Иконка агента на странице All Agents

**CSS-анимация статусов:** Идентична Agents List
- `in-progress`: вращающееся белое кольцо (animate-spin)
- `awaiting-response`: пульсирующее цветное кольцо (animate-pulse)

**JS-анимация:** БЕЗ spring-анимации перемещения (статичный список)

**Файл:** `src/renderer/components/agents.tsx`

**Test ID:** `data-testid="agent-card-{agentId}"`

### 5. Message Avatar

**Визуальное представление:** Идентичен Application Logo (те же узлы и линии)

**CSS-анимация:** Идентична Application Logo
- 5 узлов с pulse-анимациями (subtle, medium, strong, center)
- 4 линии с flow-анимациями (fast, slow)
- Индивидуальные задержки для органичного эффекта

**Особенности:**
- В навигационных блоках используется через компонент `AgentAvatar`
- В `kind: llm` сообщениях с reasoning используется в заголовке `AgentReasoningTrigger`

**Файл:** `src/renderer/components/agents/AgentAvatar.tsx`

**Test ID:** `data-testid="agent-avatar"`

**Файл reasoning-версии:** `src/renderer/components/agents/AgentReasoningTrigger.tsx`

#### Реализация

**Файл:** `src/renderer/components/agents.tsx`

```typescript
// Requirements: agents.6.7.2
<AgentAvatar status={currentAgent.status} letter={letter} size="md" />
```

**Ключевые свойства реализации:**
- Визуализация статуса активного агента полностью делегирована компоненту `AgentAvatar`.
- Пересортировка списка не использует JS-анимацию перемещения.
- Визуальная динамика в хедере определяется только статусными CSS-анимациями (`spin/pulse`).

#### Использование в UI

**Active Agent Icon в хедере:**
```tsx
// Requirements: agents.6.7.2
<AgentAvatar status={currentAgent.status} letter={letter} size="md" />
```

**Сообщения в чате:**
- для reasoning-сообщений визуальный маркер рендерится в заголовке `ReasoningTrigger`;
- `data.text` рендерится отдельным блоком под reasoning.
- В терминах требований это поведение покрывает `Message Avatar` для `kind: llm` с reasoning.
- В reasoning-сообщениях используется анимированная версия логотипа приложения только во время активной reasoning-фазы (`Logo animated={isStreaming}`), после завершения reasoning и автосворачивания trigger логотип остаётся статичным.

**Application Logo в пустом стейте:**
```tsx
// Requirements: agents.6.7.1, agents.4.15
import { Logo } from '../logo';

<Logo size="lg" animated={true} />
```

#### Логика работы

1. **Первый запуск приложения:**
   - Активный агент рендерится со статусным индикатором через `AgentAvatar`.
   - Дополнительная JS-анимация пересортировки не запускается.

2. **Активный агент получает сообщение:**
   - `updatedAt` обновляется.
   - Агент мгновенно пересортировывается на позицию 0 без layout/spring-анимации.

3. **Агент уже на первой позиции получает сообщение:**
   - Порядок списка не меняется, UI остается стабильным.

4. **Переключение на другого агента:**
   - Отображается статусная иконка выбранного агента.
   - Состояние списка не сопровождается дополнительной JS-анимацией пересортировки.

#### Почему пересортировка без анимации?

- Требование `agents.1.4.4` фиксирует мгновенную пересортировку без анимации перемещения.
- Это сохраняет предсказуемый порядок и исключает визуальные артефакты при частых обновлениях `updatedAt`.

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
| `tests/unit/components/ai-elements/prompt-input.test.tsx` | agents.4.2-4.7, agents.4.24 |
| `tests/unit/components/agents/AgentMessage.test.tsx` | agents.4.10, agents.4.11.1, llm-integration.2, llm-integration.7 |
| `tests/unit/components/agents/AgentReasoningTrigger.test.tsx` | agents.4.11, agents.4.11.2, llm-integration.2, llm-integration.7.2 |
| `tests/unit/renderer/IPCChatTransport.test.ts` | llm-integration.2, llm-integration.7 |
| `tests/unit/hooks/useAgentChat.test.ts` | agents.4.24, llm-integration.8.7 |
| `tests/unit/hooks/useAppCoordinatorState.test.ts` | agents.13.9.2, agents.13.9.3, agents.13.12, agents.13.16, agents.13.18 |
| `tests/unit/components/agents.test.tsx` | agents.4.22 |
| `tests/unit/components/agents-autoscroll.test.tsx` | agents.4.13 |
| `tests/unit/components/agents-scroll-position.test.tsx` | agents.4.14 |
| `tests/unit/app/AppCoordinator.test.ts` | agents.13.11-13.15, agents.13.17, navigation.1.1, navigation.1.3 |

### Функциональные тесты

| Файл | Покрытие | Примечание |
|------|----------|------------|
| `tests/functional/agent-switching.spec.ts` | agents.3 | - |
| `tests/functional/agent-messaging.spec.ts` | agents.4.2.1, agents.4.2.2, 4.3, 4.4, 4.8, 4.13.1, 4.13.2, 4.13.4 | - |
| `tests/functional/agent-scroll-position.spec.ts` | agents.4.14.1-4.14.6, agents.5.9 | - |
| `tests/functional/startup-loader.spec.ts` | agents.13.2, agents.13.9.1-13.9.4, agents.13.10, agents.13.12, agents.13.16, agents.13.18, agents.4.14.5-4.14.6 (startup settled без визуального рывка, без page-level scrollbar во время loader, стабильная ширина в раннем окне после скрытия loader) | - |
| `tests/functional/settings-ai-agent.spec.ts` | - | Кросс-фича тест для settings; не используется для покрытия agents.* |
| `tests/functional/all-agents-page.spec.ts` | agents.5 | - |
| `tests/functional/agent-status-indicators.spec.ts` | agents.6 | - |
| `tests/functional/agent-status-all-places.spec.ts` | agents.6.1-6.5 | Проверка консистентного отображения каждого статуса (`new`, `in-progress`, `awaiting-response`, `error`, `completed`) в Header, Agent List tooltip и All Agents |
| `tests/functional/message-format.spec.ts` | agents.7 | - |
| `tests/functional/llm-chat.spec.ts` | agents.4.11, agents.4.11.2, agents.7.7, agents.4.24, llm-integration.2, llm-integration.7.2, llm-integration.8.7 | - |
| `tests/functional/agent-status-calculation.spec.ts` | agents.9 | - |
| `tests/functional/agent-data-isolation.spec.ts` | agents.10 | - |
| `tests/functional/agent-activity-indicator.spec.ts` | agents.11 | - |
| `tests/functional/agent-realtime-events.spec.ts` | agents.12 | - |
| `tests/functional/agent-list-responsive.spec.ts` | agents.1.7, 1.8, 1.9 | - |
| `tests/functional/agents-always-one.spec.ts` | agents.2.7-2.11 | Сценарии: auto-create первого агента, отсутствие empty state, скрытие startup loader с сохранением видимости и интерактивности стандартного UI после `startupSettled` |
| `tests/functional/agents-error-messages.spec.ts` | agents.5.5, 5.6, 5.7 | - |
| `tests/functional/auto-expanding-textarea.spec.ts` | agents.4.5-4.7 | - |
| `tests/functional/empty-state-placeholder.spec.ts` | agents.4.15-4.19 | - |
| `tests/functional/message-text-wrapping.spec.ts` | agents.4.23 | - |
| `tests/functional/agent-activation-animation.spec.ts` | agents.6.7 | - |
| `tests/functional/agent-list-initial-animation.spec.ts` | agents.1.4.4 | - |
| `tests/functional/agent-reordering.spec.ts` | agents.1.3, 1.4 | - |
| `tests/functional/agent-date-update.spec.ts` | agents.1.4, 8.1 | - |
| `tests/functional/input-autofocus.spec.ts` | agents.4.7.1, 4.7.2 | - |
| `tests/functional/header-layout.spec.ts` | agents.8.3 | - |

#### Статус покрытия функциональными тестами

Покрытие функциональными тестами для автоскролла и управления позицией скролла зафиксировано в таблице выше.

#### Правила написания функциональных тестов

**КРИТИЧЕСКИ ВАЖНО**: При работе с агентами в функциональных тестах ВСЕГДА использовать ID агентов из HTML атрибутов, а НЕ позиции в списке.

**Проблема:**
Порядок агентов в списке может меняться:
- При создании нового агента он становится активным и добавляется в начало списка
- При переключении между агентами порядок может измениться из-за reordering
- Позиция агента в DOM не гарантирует его порядок создания

**Правильный подход:**

```typescript
// ❌ НЕПРАВИЛЬНО - использование позиции
const agentIcons = window.locator('[data-testid^="agent-icon-"]');
await agentIcons.nth(0).click(); // Может кликнуть не на того агента!

// ✅ ПРАВИЛЬНО - сохранение ID и использование селектора
// 1. Сохранить ID первого агента ДО создания других
let agentIcons = window.locator('[data-testid^="agent-icon-"]');
await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
  'agent-icon-',
  ''
);
expect(firstAgentId).toBeTruthy();

// 2. После создания второго агента - найти его ID
await newChatButton.click();
agentIcons = window.locator('[data-testid^="agent-icon-"]'); // Re-create locator!
await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

const allAgentIds = await agentIcons.evaluateAll((elements) =>
  elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
);
const secondAgentId = allAgentIds.find((id) => id && id !== firstAgentId);
expect(secondAgentId).toBeTruthy();

// 3. Использовать конкретный ID для клика
await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
```

**Ключевые правила:**
1. Сохранять ID агента сразу после его создания
2. Пересоздавать locator (`agentIcons = window.locator(...)`) после изменения списка агентов
3. Использовать `evaluateAll` для получения всех ID и поиска нужного по разнице
4. Кликать по агенту через конкретный селектор с ID: `[data-testid="agent-icon-${agentId}"]`
5. Дожидаться загрузки сообщений по содержимому, а не по таймауту:
   ```typescript
   // Дождаться появления конкретного сообщения
   await expect(window.locator('[data-testid="message"]').first())
     .toContainText('Agent 1 Message 1', { timeout: 5000 });
   ```

**Примеры из существующих тестов:**
- `tests/functional/agent-switching.spec.ts` - правильное использование ID агентов
- `tests/functional/agent-scroll-position.spec.ts` - правильное ожидание загрузки сообщений

### Покрытие требований

| Требование | Модульные | Функциональные |
|------------|-----------|----------------|
| agents.1 | ✓ | ✓ |
| agents.2 | ✓ | ✓ |
| agents.2.3, agents.2.4, agents.2.5, agents.2.6 | ✓ | ✓ |
| agents.2.7-2.11 (auto-create) | ✓ | ✓ |
| agents.2.9, agents.2.10, agents.2.11 | ✓ | ✓ |
| agents.3 | ✓ | ✓ |
| agents.3.5-3.5.3 (custom tooltip) | - | ✓ |
| agents.4 | ✓ | ✓ |
| agents.4.8 | ✓ | ✓ |
| agents.4.12 | ✓ | ✓ |
| agents.4.13.3 | ✓ | ✓ |
| agents.4.13.5 | - | Manual |
| agents.4.11 | ✓ | ✓ |
| agents.4.11.1 | ✓ | ✓ |
| agents.4.11.2 | ✓ | ✓ |
| agents.4.7.1-4.7.2 (autofocus) | - | ✓ |
| agents.4.13.1-4.13.6 (autoscroll) | ✓ | ✓ |
| agents.4.13.4-4.13.6 (scrollbar) | - | Manual |
| agents.4.14.1, agents.4.14.2, agents.4.14.3, agents.4.14.4, agents.4.14.5, agents.4.14.6 (scroll position) | ✓ | ✓ |
| agents.4.16, agents.4.17, agents.4.18, agents.4.19, agents.4.20, agents.4.21 (empty state content/animations) | ✓ | ✓ |
| agents.4.24.1, agents.4.24.2, agents.4.24.3, agents.4.24.4 (stop/cancel flow) | ✓ | ✓ |
| agents.5.9 (Back from All Agents preserves scroll) | - | ✓ |
| agents.4.23 (text wrapping) | ✓ | ✓ |
| agents.5 | ✓ | ✓ |
| agents.5.2, agents.5.4 | ✓ | ✓ |
| agents.5.5 (error messages) | ✓ | ✓ |
| agents.5.6 (filter archived) | ✓ | ✓ |
| agents.5.7 (sort by updatedAt) | ✓ | ✓ |
| agents.5.8 (optimized SQL) | ✓ | - |
| agents.6 | ✓ | ✓ |
| agents.6.1, agents.6.2, agents.6.3, agents.6.4, agents.6.5, agents.6.6 | ✓ | ✓ |
| agents.6.7 (activation animation) | ✓ | ✓ |
| agents.6.7.3, agents.6.7.4, agents.6.7.5 | ✓ | ✓ |
| agents.7 | ✓ | ✓ |
| agents.7.1, agents.7.2, agents.7.2.1, agents.7.3, agents.7.4, agents.7.5, agents.7.6, agents.7.8 | ✓ | ✓ |
| agents.8 | ✓ | ✓ |
| agents.8.2 | ✓ | ✓ |
| agents.9 | ✓ | ✓ |
| agents.9.3 | ✓ | ✓ |
| agents.10 | ✓ | ✓ |
| agents.10.1, agents.10.2, agents.10.3, agents.10.4 | ✓ | ✓ |
| agents.11 | ✓ | ✓ |
| agents.11.1, agents.11.2, agents.11.3, agents.11.4 | ✓ | ✓ |
| agents.12 | ✓ | ✓ |
| agents.13 (startup loading) | ✓ | ✓ |
| agents.13.1, agents.13.3, agents.13.4, agents.13.5, agents.13.6, agents.13.7, agents.13.8 | ✓ | ✓ |
| agents.13.9 | ✓ | ✓ |
| agents.13.9.1, agents.13.9.2, agents.13.9.3, agents.13.9.4 (границы этапа запуска) | ✓ | ✓ |
| agents.13.12, agents.13.16 (polling на этапе запуска) | ✓ | ✓ |
| agents.13.13, agents.13.14, agents.13.15 | ✓ | ✓ |
| agents.13.17 (state-changed событие) | ✓ | - |
| agents.13.18 (startup source of truth = polling) | ✓ | ✓ |
| user-data-isolation.6 | ✓ | ✓ |

## Зависимости

### Внешние библиотеки

```json
{
  "lucide-react": "^0.487.0",
  "ai": "^5.0.137",
  "@ai-sdk/react": "^3.0.99",
  "streamdown": "^2.3.0",
  "@streamdown/code": "^1.0.3",
  "@streamdown/math": "^1.0.2",
  "@streamdown/mermaid": "^1.0.2",
  "@streamdown/cjk": "^1.0.2",
  "use-stick-to-bottom": "^1.1.3"
}
```

### Внутренние компоненты

- `Logo` — компонент логотипа агента
- `MainEventBus` — шина событий main процесса
- `useEventSubscription` — React hook для подписки на события
- `IPCChatTransport` — кастомный ChatTransport для AI SDK (`src/renderer/lib/IPCChatTransport.ts`)
- `useAgentChat` — хук управления сообщениями (`src/renderer/hooks/useAgentChat.ts`)
- `AgentMessage` — компонент сообщения (`src/renderer/components/agents/AgentMessage.tsx`)
- `PromptInput` — AI Elements компонент ввода (`src/renderer/components/ai-elements/prompt-input.tsx`)

## Производительность

- Переключение между агентами: < 100ms
- Анимации: 60 FPS
- Пересчет видимых агентов при resize: < 50ms
- Рендеринг сообщения: < 50ms

## Безопасность

- Все запросы к БД фильтруются по userId
- Проверка владельца агента при операциях с сообщениями
- Санитизация HTML в сообщениях через Streamdown (rehype-harden)

## AI Elements интеграция (Фаза 9)

Для отображения `tool_call` используется смешанная стратегия:
- AI Elements `Tool` family (см. [https://elements.ai-sdk.dev/components/tool](https://elements.ai-sdk.dev/components/tool)) для всех `tool_call`, кроме `final_answer`.
- AI Elements `Queue` family для `tool_call(final_answer)`: финал отображается отдельным компонентом `Final Answer` (header + список `summary_points`).

### Архитектура

```
agents.tsx
  ├── AgentHeader (без изменений)
  ├── [для каждого агента, скрытые через CSS если не активны]
  │     AgentChat (смонтирован всё время, скрыт через CSS, но не размонтируется)
  │       ├── Conversation (use-stick-to-bottom, трекает скролл сам)
  │       │     ├── ConversationContent
  │       │     │     ├── AgentWelcome (если нет сообщений)
  │       │     │     └── motion.div > AgentMessage (для каждого сообщения)
  │       │     ├── RateLimitDialog (если активен rate limit)
  │       │     └── ConversationScrollButton
  │       └── PromptInput
  └── [лоадер пока не все чаты загружены]
```

**Ключевые принципы:**
- Все `AgentChat` монтируются при старте и остаются смонтированными
- Переключение агента = CSS-скрытие без размонтирования (`absolute inset-0 opacity-0 pointer-events-none`)
- `Conversation` каждого агента трекает скролл независимо — позиция сохраняется автоматически
- Лоадер показывается пока хотя бы один агент ещё загружает сообщения или активный чат ещё не достиг `startupSettled`

### Переключение экранов (Agents ↔ Settings)

**Причины решения:**
- Сохранить позицию скролла `Conversation` и состояние `use-stick-to-bottom` между переключениями.
- Исключить повторный initial-scroll при возврате на `Agents`.
- Соответствовать требованиям `agents.4.14` и `agents.13` (сохранение состояния без ручного scrollTop).

**Реализация:**
- Экран `Agents` остаётся смонтированным всегда.
- Переключение между `Agents` и `Settings` выполняется через CSS (скрытие через `opacity-0` и `pointer-events-none`), без размонтирования.
- Другие экраны могут монтироваться по требованию, но не должны влиять на сохранение состояния `Agents`.

### IPCChatTransport

`src/renderer/lib/IPCChatTransport.ts` — реализует интерфейс `ChatTransport` из `ai@5`. Мост между `useChat` и Electron IPC.

**Схема потока данных:**

```
Renderer                          Main Process
────────────────────────────────────────────────────────────
useChat.sendMessage()
  │
  └─► IPCChatTransport.sendMessages()
        │
        ├─► window.api.messages.create(agentId, 'user', payload)  ──► IPC ──► MessageManager.create()
        │                                                                            │
        │                                                                            └─► background message processing (см. llm-integration)
        │                                                                                      │
        └─► подписка на IPC события ◄──────────────────────────────────────────────────────────┘
              │
              ├── MESSAGE_CREATED (kind: llm)
              │     └─► enqueue: { type: 'start' }
              │         enqueue: { type: 'text-start', id: messageId }
              │
              ├── MESSAGE_LLM_REASONING_UPDATED
              │     └─► enqueue: { type: 'reasoning-start', id } (первый раз)
              │         enqueue: { type: 'reasoning-delta', id, delta }
              │
              ├── MESSAGE_LLM_TEXT_UPDATED
              │     └─► enqueue: { type: 'reasoning-end', id } (если reasoning завершен)
              │         enqueue: { type: 'text-delta', id, delta }
              │
              ├── MESSAGE_UPDATED (done: true)
              │     └─► enqueue: { type: 'text-end', id }
              │         enqueue: { type: 'finish' }
              │         controller.close()
              │
              ├── MESSAGE_CREATED (kind: error)
              │     └─► enqueue: { type: 'error', errorText }
              │         enqueue: { type: 'finish' }
              │         controller.close()
              │
              └── MESSAGE_UPDATED (hidden: true)
                    └─► controller.close()  // прерывание
```

**Методы интерфейса `ChatTransport`:**
- `sendMessages({ messages, abortSignal })` — вызывает IPC, возвращает `ReadableStream<UIMessageChunk>`
- `reconnectToStream()` — возвращает `null` (нет серверного стриминга для reconnect)

**Маппинг IPC-событий → UIMessageChunk:**
- `MESSAGE_CREATED` (kind: llm) → `{ type: 'start' }` + `{ type: 'text-start', id }`
- `MESSAGE_LLM_REASONING_UPDATED` → `{ type: 'reasoning-delta', id, delta }`
- `MESSAGE_LLM_TEXT_UPDATED` → `{ type: 'text-delta', id, delta }`
- `MESSAGE_UPDATED` с `done: true` → `{ type: 'text-end', id }` + `{ type: 'finish' }`
- `MESSAGE_CREATED` (kind: error) → `{ type: 'error', errorText }` + `{ type: 'finish' }`
- `MESSAGE_UPDATED` с `hidden: true` → закрыть stream (прерывание)

Терминологическое соответствие с `testing.13.1`:
- `start-step` в тестовом контракте соответствует chunk-типу `text-start` в transport.
- `finish-step` в тестовом контракте соответствует chunk-типу `text-end` в transport.

### useAgentChat

`src/renderer/hooks/useAgentChat.ts` — хук управления сообщениями. Оборачивает `useChat` из `@ai-sdk/react` с кастомным `IPCChatTransport`.

**Интерфейс:**
```typescript
interface UseAgentChatResult {
  messages: UIMessage[];           // AI SDK формат для рендеринга
  rawMessages: MessageSnapshot[];  // Оригинальный формат для metadata (kind, action_link)
  isLoading: boolean;              // true пока загружается история
  isStreaming: boolean;            // true когда LLM стримит ответ
  sendMessage(text: string): Promise<boolean>;
  cancelCurrentRequest(): Promise<boolean>;
}
```

**Ключевые решения:**

1. **Изоляция состояния чата по агенту** — используется `new Chat({ id: agentId, transport })` из `@ai-sdk/react`; `Chat` инстанс стабилен через `useMemo`.

2. **Параллельный массив `rawMessages`** — AI SDK `UIMessage` не хранит `kind`, `hidden`, `action_link`. Хук хранит `rawMessages: MessageSnapshot[]` синхронно с `UIMessage[]` для доступа к оригинальным данным при рендеринге `AgentMessage`.

3. **Двухфазный mount** — `useChat` создаётся с пустым состоянием, затем после загрузки начального чанка вызывается `setMessages(toUIMessages(snapshots))`.

4. **Синхронизация через события** — `MESSAGE_CREATED` добавляет в `rawMessages` (дедупликация по id), `MESSAGE_UPDATED` с `hidden: true` удаляет из обоих массивов через `setMessages()`.

5. **`isStreaming`** = `status === 'streaming' || status === 'submitted'` (внутреннее состояние запроса в `useChat`); используется для потока сообщений и reasoning, но НЕ для переключения `send/stop`.

6. **Action-кнопка по статусу и тексту** — кнопка в `AgentChat` переключается в режим `stop`, когда `agent.status === 'in-progress'`; во всех остальных статусах отображается `send`. В режиме `stop` кнопка всегда активна. В режиме `send` кнопка активна только при непустом `taskInput.trim()`. Нажатие `stop` вызывает `cancelCurrentRequest()` и IPC `messages:cancel`.

6.1. **Поведение отмены после старта ответа** — если `kind: llm` уже начал стримиться, при `stop` скрывается только in-flight `kind: llm`; исходное `kind: user` сообщение этого turn остаётся видимым.

7. **Ошибки stop без toast** — `cancelCurrentRequest()` перехватывает ошибки/`success:false` от `messages:cancel`, возвращает `false` и не инициирует toast-уведомления.

8. **`AGENT_RATE_LIMIT` не в хуке** — подписка остаётся в `agents.tsx`, т.к. rate limit — UI-состояние (показать/скрыть баннер), не часть потока сообщений.

### Загрузка чатов при старте

**Загрузка при старте:**
- Все `AgentChat` компоненты монтируются при старте приложения одновременно
- Каждый `AgentChat` при mount вызывает `useAgentChat(agentId)`, который загружает ВСЕ сообщения через `messages:list`
- Каждый `AgentChat` дополнительно выставляет локальный флаг `startupSettled` только после фактической стабилизации первого отображения: ширина контейнера сообщений перестала изменяться, новые `scroll`-события в контейнере не приходят в течение короткого окна стабильности, и финальный кадр отрисован (double `requestAnimationFrame`)
- `App.tsx` показывает экран загрузки "Loading..." пока хотя бы один `AgentChat` имеет `isLoading = true` ИЛИ активный `AgentChat` ещё не имеет `startupSettled = true`
- После загрузки всех чатов и достижения `startupSettled` активным чатом экран загрузки скрывается и показывается основной интерфейс
- Экран загрузки рендерится как `fixed`-overlay и не участвует в нормальном потоке документа, чтобы не создавать временный второй scroll-контекст
- Глобальная блокировка page-level scroll задаётся на уровне спецификации `navigation` (`navigation.1.10`); в сценарии `Agents` единственный допустимый scroll-контекст — внутренний контейнер `Conversation`

**Контракт визуальной стабильности старта (anti-regression):**
- Во время `startup-loader` не допускается появление page-level scrollbar (ни на `html`, ни на `body`)
- После скрытия `startup-loader` в раннем окне наблюдения не допускаются скачки ширины контейнера сообщений, вызванные поздним появлением/исчезновением скроллбара
- Контейнер сообщений резервирует gutter скроллбара (`scrollbar-gutter: stable`), чтобы исключить shift ширины при переходе между состояниями с/без вертикального скролла

### AppCoordinator (main process orchestration)

**Requirements:** agents.13.11-13.15, navigation.1.1, navigation.1.3

`AppCoordinator` (`src/main/app/AppCoordinator.ts`) централизует жизненный цикл приложения и убирает race condition между восстановлением сессии, загрузкой профиля и инициализацией чатов.

**Состояния:**
- `booting` — старт приложения
- `unauthenticated` — пользователь не авторизован, показывается `login`
- `preparing-session` — сессия авторизована, подготовка к загрузке рабочих экранов
- `waiting-for-chats` — ожидание IPC-сигнала `app:set-chats-ready` от renderer
- `ready` — основной UI полностью доступен
- `error` — критическая ошибка инициализации (включая timeout ожидания чатов)

**Ключевые IPC-контракты и события:**
- `app:get-state` — renderer опрашивает состояние `AppCoordinator` каждые 200мс на этапе старта; этот polling является источником истины для стартовой оркестрации
- `app:set-chats-ready` — renderer подтверждает готовность финального UI (все чаты загружены + active chat settled)
- `app.coordinator.state-changed` — main process публикует изменение состояния `AppCoordinator` через EventBus для runtime-синхронизации без постоянного polling; событие может приходить и во время старта, но не заменяет стартовый polling-контур

**Поток запуска:**
1. `src/main/index.ts` создаёт и запускает `AppCoordinator`
2. renderer получает initial state через IPC `app:get-state`
3. renderer продолжает polling `app:get-state` с интервалом 200мс до терминальной фазы
4. после готовности чатов renderer вызывает `app:set-chats-ready`
5. `AppCoordinator` переводит приложение в `ready` и публикует `app.coordinator.state-changed`
6. renderer завершает стартовый polling только после фиксации терминальной фазы в стартовом polling-контуре (или по startup timeout), а событие `app.coordinator.state-changed` использует для runtime-синхронизации после завершения этапа запуска

**Timeout-защита:**
- В фазе `waiting-for-chats` запускается таймер
- Если `app:set-chats-ready` не получен вовремя, состояние переходит в `error`
- Причина перехода публикуется в `reason` для диагностики флейков/регрессий

## Установка и обновление AI Elements компонентов

AI Elements использует **shadcn-подход**: CLI копирует исходники компонентов прямо в проект (`src/renderer/components/ai-elements/`). Нет npm-пакета для импорта — код живёт в репозитории и полностью кастомизируем.

Документация: https://elements.ai-sdk.dev

### Установленные компоненты

| Файл | Компоненты |
|------|-----------|
| `src/renderer/components/ai-elements/conversation.tsx` | `Conversation`, `ConversationContent`, `ConversationScrollButton`, `ConversationEmptyState`, `ConversationDownload` |
| `src/renderer/components/ai-elements/confirmation.tsx` | `Confirmation`, `ConfirmationRequest`, `ConfirmationActions` |
| `src/renderer/components/ai-elements/message.tsx` | `Message`, `MessageContent`, `MessageActions`, `MessageAction`, `MessageBranch`, `MessageResponse`, `MessageToolbar` |
| `src/renderer/components/ai-elements/reasoning.tsx` | `Reasoning`, `ReasoningTrigger`, `ReasoningContent` |
| `src/renderer/components/ai-elements/tool.tsx` | `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput` |
| `src/renderer/components/ai-elements/shimmer.tsx` | `Shimmer` |

### Установка нового / обновление существующего компонента

```bash
# Обновить весь набор AI Elements из pinned ref
# ref формируется из package.json -> config.ai_elements_version
# используется tag: ai-elements@<version>
npm run ai-elements:sync

# Проверить
npm run typecheck
```

Файлы попадают сразу в `src/renderer/components/ai-elements/` через симлинк `src/components → src/renderer/components`.

> Симлинк создан один раз: `ln -s renderer/components src/components` и закоммичен в репозиторий.

### Почему импорты работают без правок

`components.json` настроен с `"utils": "@/lib/utils"`. В проекте существует `src/renderer/lib/utils.ts`, который реэкспортирует `cn`, поэтому синхронизированные компоненты используют корректный путь импорта без дополнительных ручных правок.

Если CLI перезаписал ui-компоненты и они сломались — проверить что `src/renderer/lib/utils.ts` существует.

### Зависимости AI Elements

Все уже установлены в проекте:
- `use-stick-to-bottom` — автоскролл в `Conversation`
- `streamdown` + `@streamdown/*` — markdown рендеринг в `MessageResponse` и `ReasoningContent`
- `@radix-ui/react-use-controllable-state` — состояние в `Reasoning`
- shadcn ui: `button`, `tooltip`, `collapsible`, `separator`, `button-group`
