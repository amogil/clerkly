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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_timestamp ON messages(agent_id, timestamp);
```

**Примечание:** Колонка `kind` добавлена в рамках llm-integration.6. `kind` не хранится в `payload_json` — всегда передаётся явно при вставке.

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
  kind: 'user' | 'llm' | 'error' | 'tool_call' | 'code_exec' | 'final_answer' | 'request_scope' | 'artifact';
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

  // Фильтруем interrupted сообщения — они не видны в UI и не влияют на статус
  const visibleMessages = messages.filter(m => {
    const p = JSON.parse(m.payloadJson);
    return !(p.data?.interrupted === true);
  });

  if (visibleMessages.length === 0) {
    return 'new';
  }

  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const payload = JSON.parse(lastMessage.payloadJson) as MessagePayload;

  // Ошибка — последнее видимое сообщение kind: error
  if (lastMessage.kind === 'error') {
    return 'error';
  }

  // Финальный ответ
  if (lastMessage.kind === 'final_answer') {
    return 'completed';
  }

  // in-progress: есть user-сообщение и после него нет финализированного ответа агента
  // Ищем с конца: если встречаем user раньше чем финализированный llm/final_answer — in-progress
  for (let i = visibleMessages.length - 1; i >= 0; i--) {
    const msg = visibleMessages[i];
    if (msg.kind === 'user') {
      return 'in-progress';
    }
    if (msg.kind === 'llm') {
      const p = JSON.parse(msg.payloadJson);
      if (p.data?.action) {
        // Финализированный llm-ответ — агент ответил
        return 'awaiting-response';
      }
      // llm без action — ещё в процессе стриминга
      return 'in-progress';
    }
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
│  │              MessagesArea / AllAgentsPage          │ │
│  │  (flex-1, overflow-y-auto)                         │ │
│  │                                                    │ │
│  │  Chat mode:                                        │ │
│  │  - AgentWelcome (if no messages)         │ │
│  │  - MessageList                                     │ │
│  │  - ActivityIndicator (during tool_call/code_exec) │ │
│  │                                                    │ │
│  │  All Agents mode (showAllAgentsPage):              │ │
│  │  - Back button                                     │ │
│  │  - "All Agents" title                              │ │
│  │  - List of all agents                             │ │
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

#### PromptInput (AI Elements)

```typescript
// Requirements: agents.4.1, agents.4.3, agents.4.4, agents.4.5, agents.4.6, agents.4.7
function ChatInput({
  taskInput,
  setTaskInput,
  handleSend,
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
        <PromptInputSubmit disabled={!taskInput.trim()} />
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
  <ConversationContent
    data-testid="messages-area"
    className="flex flex-col gap-4 p-6 justify-end min-h-full"
  >
    {/* сообщения */}
  >
    {messages.length === 0 ? (
      <AgentWelcome onPromptClick={handlePromptClick} />
    ) : (
      messages.map((message) => (
        <motion.div key={message.id} data-testid="message">
          {/* Message content */}
        </motion.div>
      ))
    )}
    {/* Requirements: agents.4.13.6 - Invisible div for autoscroll */}
    <div ref={messagesEndRef} />
  </div>
</ScrollArea>
```

**Отображение скроллбара** (agents.4.13.8-11):

**Требования пользователя:**
- Скроллбар должен быть визуально ненавязчивым (agents.4.13.8)
- Скроллбар появляется при взаимодействии пользователя со скроллом (agents.4.13.9)
- Скроллбар автоматически скрывается после окончания скролла (agents.4.13.10)
- Используется компонент `Conversation` из AI Elements (`use-stick-to-bottom`) (agents.4.13.11)

**Техническая реализация:**

Используется компонент `Conversation` из AI Elements (`src/renderer/components/ai-elements/conversation.tsx`), который управляет автоскроллом через `use-stick-to-bottom`.

**Кнопка "Scroll to Bottom":**
- Реализована как `ScrollToBottomButton` внутри `AgentChat` — использует `useStickToBottomContext`
- Имеет `data-testid="scroll-to-bottom"` для функциональных тестов
- Показывается только когда пользователь не внизу (`isAtBottom === false`)

**Принцип работы:**

1. **Автоматическое сохранение** (agents.4.14): `Conversation` (`StickToBottom`) управляет скролом полностью. Поскольку компонент не размонтируется при переключении агентов, позиция сохраняется без дополнительной логики.

2. **Переключение агентов** (agents.4.14.2–4.14.4): CSS `absolute inset-0 opacity-0 pointer-events-none` скрывает неактивный `AgentChat`, но не размонтирует его и не сбрасывает `scrollTop` (в отличие от `display:none`). При возврате к агенту `Conversation` восстанавливает ту же позицию скролла.

3. **Первый визит** (agents.4.14.4): При первой загрузке `Conversation` с `initial="smooth"` автоматически прокручивает к последнему сообщению.

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
// Requirements: agents.4.10, agents.4.10.1, agents.4.22, llm-integration.7
<div data-testid="message-llm" className="space-y-2 w-full">
  {showAvatar && <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />}
  {reasoning && (
    <div data-testid="message-llm-reasoning">
      <Reasoning>{/* collapsible reasoning */}</Reasoning>
    </div>
  )}
  {action?.content ? (
    <div data-testid="message-llm-action" className="text-sm leading-relaxed whitespace-pre-wrap break-words w-full">
      {action.content}
    </div>
  ) : (
    <div data-testid="message-llm-loading">{/* loading dots */}</div>
  )}
</div>
```

**Сообщения об ошибке (kind: 'error'):**
```tsx
// Requirements: llm-integration.3.4.1, llm-integration.3.4.3, llm-integration.3.4.4, agents.4.10.2
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

**Диалог rate limit (agent.rate_limit):**
```tsx
// Requirements: llm-integration.3.7, llm-integration.3.4.4, agents.4.10.2
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
  <AgentMessage message={message} showAvatar={showAvatar} agentStatus={agent.status} onNavigate={onNavigate} />
</motion.div>
```

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
2. JS spring-анимация перемещения (для списка агентов)

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
- Анимация включается только при перемещении агента на первую позицию
- Условие: агент был НЕ на первой позиции → получил сообщение → переместился на первую позицию
- Длительность показа: 3 секунды (затем анимация отключается)
- НЕ показывается при запуске приложения или переключении между агентами

**Реализация:**
```typescript
// Отслеживание изменения позиции агента
useEffect(() => {
  const currentPosition = agents.findIndex(a => a.id === currentAgentId);
  const previousPosition = previousAgentPositionRef.current;
  const orderChanged = currentAgentsOrder !== previousAgentsOrder;
  
  // Показать анимацию если агент переместился на позицию 0
  if (orderChanged && currentAgentId === previousAgentId && 
      currentPosition === 0 && previousPosition > 0) {
    setShowActivationAnimation(true);
    setTimeout(() => setShowActivationAnimation(false), 3000);
  }
}, [activeAgent?.id, agents]);
```

**CSS-анимация:** Идентична Application Logo (узлы и линии)

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

**JS spring-анимация перемещения (framer-motion):**
- `layout` prop для автоматической анимации позиции при изменении порядка
- Параметры spring:
  - `type: 'spring'`
  - `stiffness: 400` - жесткость пружины
  - `damping: 30` - затухание
  - `mass: 0.8` - масса элемента
- Анимация появления/исчезновения:
  - `initial={{ opacity: 0, scale: 0.8 }}` - ТОЛЬКО для новых агентов
  - `initial={false}` - при первой загрузке (отключает анимацию)
  - `animate={{ opacity: 1, scale: 1 }}`
  - `exit={{ opacity: 0, scale: 0.8 }}`
  - `duration: 0.2` для opacity и scale
- `AnimatePresence` с `mode="popLayout"` для управления анимацией списка

**Логика отключения initial анимации:**
```typescript
const [isInitialLoad, setIsInitialLoad] = useState(true);

// Track initial load completion
useEffect(() => {
  if (!isLoading && agents.length > 0 && isInitialLoad) {
    setIsInitialLoad(false);
  }
}, [isLoading, agents.length, isInitialLoad]);

// In motion.div
initial={isInitialLoad ? false : { opacity: 0, scale: 0.8 }}
```

**Реализация:**
```typescript
<AnimatePresence mode="popLayout">
  {agents.slice(0, visibleChatsCount).map(agent => (
    <motion.div
      key={agent.id}
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        layout: { type: 'spring', stiffness: 400, damping: 30, mass: 0.8 },
        opacity: { duration: 0.2 },
        scale: { duration: 0.2 }
      }}
    >
      {/* Иконка агента */}
    </motion.div>
  ))}
</AnimatePresence>
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

### 5. Message Avatar (компонент AgentAvatar)

**Назначение:** Маленькая иконка слева сверху от сообщений агента

**Визуальное представление:** Идентичен Application Logo (те же узлы и линии)

**CSS-анимация:** Идентична Application Logo
- 5 узлов с pulse-анимациями (subtle, medium, strong, center)
- 4 линии с flow-анимациями (fast, slow)
- Индивидуальные задержки для органичного эффекта

**Особенности:**
- Показывается перед первым сообщением агента в последовательности
- Всегда анимирован (`animated={true}`)

**Файл:** `src/renderer/components/agents/AgentAvatar.tsx`

**Test ID:** `data-testid="agent-avatar"`

#### Реализация

**Файл:** `src/renderer/components/agents.tsx`

```typescript
// Requirements: agents.6.7
const [showActivationAnimation, setShowActivationAnimation] = useState(false);
const previousActiveAgentIdRef = useRef<string | null>(null);
const previousAgentPositionRef = useRef<number>(-1);
const previousAgentsOrderRef = useRef<string>('');

// Track agent position changes and trigger activation animation
// Requirements: agents.6.7.1, agents.6.7.2, agents.6.7.4, agents.6.7.5
useEffect(() => {
  if (!activeAgent) return;

  const currentAgentId = activeAgent.id;
  const currentPosition = agents.findIndex(a => a.id === currentAgentId);
  const previousPosition = previousAgentPositionRef.current;
  const previousAgentId = previousActiveAgentIdRef.current;
  const currentAgentsOrder = agents.map(a => a.id).join(',');
  const previousAgentsOrder = previousAgentsOrderRef.current;

  // Initialize on first render (empty previousAgentsOrder)
  if (previousAgentsOrder === '') {
    previousActiveAgentIdRef.current = currentAgentId;
    previousAgentPositionRef.current = currentPosition;
    previousAgentsOrderRef.current = currentAgentsOrder;
    return;
  }

  // Check if order actually changed (not just array reference)
  const orderChanged = currentAgentsOrder !== previousAgentsOrder;

  // Same agent moved to position 0 from non-zero position AND order changed - show animation
  if (
    orderChanged &&
    currentAgentId === previousAgentId &&
    currentPosition === 0 &&
    previousPosition > 0
  ) {
    setShowActivationAnimation(true);
    // Hide animation after 3 seconds
    const timer = setTimeout(() => {
      setShowActivationAnimation(false);
    }, 3000);

    // Update refs
    previousActiveAgentIdRef.current = currentAgentId;
    previousAgentPositionRef.current = currentPosition;
    previousAgentsOrderRef.current = currentAgentsOrder;

    return () => clearTimeout(timer);
  }

  // Update refs
  previousActiveAgentIdRef.current = currentAgentId;
  previousAgentPositionRef.current = currentPosition;
  previousAgentsOrderRef.current = currentAgentsOrder;
}, [activeAgent?.id, agents]);
```

**Ключевые изменения:**
- Добавлен `previousAgentsOrderRef` для отслеживания порядка агентов
- Анимация срабатывает ТОЛЬКО когда порядок агентов реально изменился
- Это предотвращает срабатывание анимации при запуске приложения
- Refs обновляются ВСЕГДА после проверки условия анимации

#### Использование в UI

**Иконка агента в хедере (с анимацией):**
#### Использование в UI

**Active Agent Icon в хедере:**
```tsx
// Requirements: agents.6.7.2
<div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
  <span className="text-white text-sm font-semibold">A</span>
  {/* CSS-анимация: вращающееся кольцо для in-progress */}
  {isInProgress(selectedAgent) && (
    <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
  )}
</div>
```

**Message Avatar в сообщениях:**
```tsx
// Requirements: agents.6.7.5
import { AgentAvatar } from './agents/AgentAvatar';

{showAvatar && (
  <div className="mb-2">
    <AgentAvatar size="sm" animated={true} />
  </div>
)}
```

**Application Logo в пустом стейте:**
```tsx
// Requirements: agents.6.7.1, agents.4.15
import { Logo } from '../logo';

<Logo size="lg" animated={true} />
```

#### Логика работы

1. **Первый запуск приложения:**
   - Агент на позиции 0
   - `previousPosition = -1` (не инициализирован)
   - Анимация НЕ показывается

2. **Активный агент получает сообщение:**
   - Агент был на позиции 2
   - updatedAt обновляется → агент пересортировывается на позицию 0
   - `currentPosition = 0`, `previousPosition = 2`
   - `currentAgentId === previousAgentId` → анимация показывается

3. **Агент уже на первой позиции получает сообщение:**
   - Агент был на позиции 0
   - updatedAt обновляется → агент остается на позиции 0
   - `currentPosition = 0`, `previousPosition = 0`
   - Условие не выполняется → анимация НЕ показывается

4. **Переключение на другого агента:**
   - `currentAgentId !== previousAgentId`
   - Условие не выполняется → анимация НЕ показывается

#### Почему отслеживаем позицию, а не клики?

- Анимация показывает **физическое перемещение** агента в списке
- Это визуальная обратная связь о том, что агент "подпрыгнул" на первое место
- Связано с spring-анимацией перемещения (agents.1.4.4)
- Не зависит от способа активации агента (клик, событие, автовыбор)

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
| `tests/unit/components/ai-elements/prompt-input.test.tsx` | agents.4.3-4.7 |
| `tests/unit/components/agents.test.tsx` | agents.4.22 |
| `tests/unit/components/agents-autoscroll.test.tsx` | agents.4.13 |
| `tests/unit/components/agents-scroll-position.test.tsx` | agents.4.14 |
| `tests/unit/app/AppCoordinator.test.ts` | agents.13.11-13.15, navigation.1.1, navigation.1.3 |

### Функциональные тесты

| Файл | Покрытие | Недостающие тесты |
|------|----------|-------------------|
| `tests/functional/agent-switching.spec.ts` | agents.3 | - |
| `tests/functional/agent-messaging.spec.ts` | agents.4.3, 4.4, 4.8, 4.13.1, 4.13.2, 4.13.4 | - |
| `tests/functional/agent-scroll-position.spec.ts` | agents.4.14.1-4.14.5 | - |
| `tests/functional/settings-ai-agent.spec.ts` | agents.13.11-13.15 (регрессия startup/loading orchestration) | - |
| `tests/functional/all-agents-page.spec.ts` | agents.5 | - |
| `tests/functional/agent-status-indicators.spec.ts` | agents.6 | - |
| `tests/functional/message-format.spec.ts` | agents.7 | - |
| `tests/functional/agent-status-calculation.spec.ts` | agents.9 | - |
| `tests/functional/agent-data-isolation.spec.ts` | agents.10 | - |
| `tests/functional/agent-activity-indicator.spec.ts` | agents.11 | - |
| `tests/functional/agent-realtime-events.spec.ts` | agents.12 | - |
| `tests/functional/agent-list-responsive.spec.ts` | agents.1.7, 1.8, 1.9 | - |
| `tests/functional/agents-always-one.spec.ts` | agents.2.7-2.11 | - |
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

#### Недостающие функциональные тесты

Все функциональные тесты для автоскролла и управления позицией скролла реализованы.

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
| agents.2.7-2.11 (auto-create) | ✓ | ✓ |
| agents.3 | ✓ | ✓ |
| agents.3.5-3.5.3 (custom tooltip) | - | ✓ |
| agents.4 | ✓ | ✓ |
| agents.4.7.1-4.7.2 (autofocus) | - | ✓ |
| agents.4.13.1-4.13.6 (autoscroll) | ✓ | ✓ |
| agents.4.13.4-4.13.6 (scrollbar) | - | Manual |
| agents.4.14.1-4.14.5 (scroll position) | ✓ | ✓ |
| agents.4.23 (text wrapping) | ✓ | ✓ |
| agents.5 | ✓ | ✓ |
| agents.5.5 (error messages) | ✓ | ✓ |
| agents.5.6 (filter archived) | ✓ | ✓ |
| agents.5.7 (sort by updatedAt) | ✓ | ✓ |
| agents.5.8 (optimized SQL) | ✓ | - |
| agents.6 | ✓ | ✓ |
| agents.6.7 (activation animation) | ✓ | ✓ |
| agents.7 | ✓ | ✓ |
| agents.8 | ✓ | ✓ |
| agents.9 | ✓ | ✓ |
| agents.10 | ✓ | ✓ |
| agents.11 | ✓ | ✓ |
| agents.12 | ✓ | ✓ |
| agents.13 (startup loading) | ✓ | ✓ |
| user-data-isolation.6 | ✓ | ✓ |

## Зависимости

### Внешние библиотеки

```json
{
  "lucide-react": "^0.300.0",
  "react-markdown": "^10.0.0",
  "ai": "^5.0.0",
  "@ai-sdk/react": "^3.0.0",
  "use-stick-to-bottom": "latest"
}
```

### Внутренние компоненты

- `Logo` — компонент логотипа агента
- `MainEventBus` — шина событий main процесса
- `useEventSubscription` — React hook для подписки на события
- `IPCChatTransport` — кастомный ChatTransport для AI SDK (`src/renderer/lib/IPCChatTransport.ts`)
- `useAgentChat` — хук управления сообщениями, заменяет `useMessages` (`src/renderer/hooks/useAgentChat.ts`)
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
- Санитизация HTML в сообщениях через react-markdown

## AI Elements интеграция (Фаза 9)

### Архитектура

```
agents.tsx
  ├── AgentHeader (без изменений)
  ├── [для каждого агента, скрытые через CSS если не активны]
  │     AgentChat (смонтирован всё время, скрыт через className="hidden" если не активен)
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
- Переключение агента = CSS `display: none/block`, без ремонта
- `Conversation` каждого агента трекает скролл независимо — позиция сохраняется автоматически
- Лоадер показывается пока хотя бы один агент ещё загружает сообщения

### Переключение экранов (Agents ↔ Settings)

**Причины решения:**
- Сохранить позицию скролла `Conversation` и состояние `use-stick-to-bottom` между переключениями.
- Исключить повторный initial-scroll при возврате на `Agents`.
- Соответствовать требованиям `agents.4.14` и `agents.13` (сохранение состояния без ручного scrollTop).

**Реализация:**
- Экран `Agents` остаётся смонтированным всегда.
- Переключение между `Agents` и `Settings` выполняется через CSS (скрытие через `opacity-0` и `pointer-events-none`), без размонтирования.
- Другие экраны могут монтироваться по требованию, но не должны влиять на сохранение состояния `Agents`.
- При возврате на `Agents` layout-анимация иконок в хедере временно отключается на один кадр, чтобы избежать визуального “подпрыгивания” при смене режима отображения.

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
        │                                                                            └─► MainPipeline.run()
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
              ├── MESSAGE_UPDATED (с action.content)
              │     └─► enqueue: { type: 'reasoning-end', id } (если было reasoning)
              │         enqueue: { type: 'text-delta', id, delta: action.content }
              │         enqueue: { type: 'text-end', id }
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
- `MESSAGE_UPDATED` с action → `{ type: 'text-delta', id, delta: action.content }` + `{ type: 'finish' }`
- `MESSAGE_CREATED` (kind: error) → `{ type: 'error', errorText }` + `{ type: 'finish' }`
- `MESSAGE_UPDATED` с `hidden: true` → закрыть stream (прерывание)

### useAgentChat

`src/renderer/hooks/useAgentChat.ts` — заменяет `useMessages`. Оборачивает `useChat` из `@ai-sdk/react` с кастомным `IPCChatTransport`.

**Интерфейс:**
```typescript
interface UseAgentChatResult {
  messages: UIMessage[];           // AI SDK формат для рендеринга
  rawMessages: MessageSnapshot[];  // Оригинальный формат для metadata (kind, action_link)
  isLoading: boolean;              // true пока загружается история
  isStreaming: boolean;            // true когда LLM стримит ответ
  sendMessage(text: string): Promise<boolean>;
}
```

**Ключевые решения:**

1. **`Chat` вместо прямого `useChat`** — используется `new Chat({ id: agentId, transport })` из `@ai-sdk/react` для изоляции состояния по `agentId`. `Chat` инстанс стабилен через `useMemo`.

2. **Параллельный массив `rawMessages`** — AI SDK `UIMessage` не хранит `kind`, `hidden`, `action_link`. Хук хранит `rawMessages: MessageSnapshot[]` синхронно с `UIMessage[]` для доступа к оригинальным данным при рендеринге `AgentMessage`.

3. **Двухфазный mount** — `useChat` создаётся с пустым состоянием, затем после загрузки начального чанка вызывается `setMessages(toUIMessages(snapshots))`.

4. **Синхронизация через события** — `MESSAGE_CREATED` добавляет в `rawMessages` (дедупликация по id), `MESSAGE_UPDATED` с `hidden: true` удаляет из обоих массивов через `setMessages()`.

5. **`isStreaming`** = `status === 'streaming' || status === 'submitted'` (оба состояния означают активный запрос к LLM).

6. **`AGENT_RATE_LIMIT` не в хуке** — подписка остаётся в `agents.tsx`, т.к. rate limit — UI-состояние (показать/скрыть баннер), не часть потока сообщений.

### Загрузка чатов при старте

**Загрузка при старте:**
- Все `AgentChat` компоненты монтируются при старте приложения одновременно
- Каждый `AgentChat` при mount вызывает `useAgentChat(agentId)`, который загружает ВСЕ сообщения через `messages:list`
- `isLoading = true` пока идёт загрузка истории
- `App.tsx` показывает экран загрузки "Loading..." пока хотя бы один `AgentChat` имеет `isLoading = true`
- После загрузки всех чатов экран загрузки скрывается и показывается основной интерфейс

### AppCoordinator (main process orchestration)

**Requirements:** agents.13.11-13.15, navigation.1.1, navigation.1.3

`AppCoordinator` (`src/main/app/AppCoordinator.ts`) централизует жизненный цикл приложения и убирает race condition между восстановлением сессии, загрузкой профиля и инициализацией чатов.

**Состояния:**
- `booting` — старт приложения
- `unauthenticated` — пользователь не авторизован, показывается `login`
- `preparing-session` — сессия авторизована, подготовка к загрузке рабочих экранов
- `waiting-for-chats` — ожидание явного сигнала `app.chats.ready` от renderer
- `ready` — основной UI полностью доступен
- `error` — критическая ошибка инициализации (включая timeout ожидания чатов)

**Ключевые события:**
- `app.state.changed` — публикуется `AppCoordinator` при каждом переходе состояния
- `app.chats.ready` — публикуется renderer (`Agents`) после завершения начальной загрузки чатов
- `app.chats.failed` — публикуется renderer при критической ошибке загрузки чатов

**Поток запуска:**
1. `src/main/index.ts` создаёт и запускает `AppCoordinator`
2. renderer получает initial state через IPC `app:get-state`
3. renderer подписывается на `app.state.changed` через event bus
4. после готовности чатов renderer публикует `app.chats.ready`
5. `AppCoordinator` переводит приложение в `ready`, loading-экран скрывается

**Timeout-защита:**
- В фазе `waiting-for-chats` запускается таймер
- Если `app.chats.ready` не получен вовремя, состояние переходит в `error`
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
| `src/renderer/components/ai-elements/shimmer.tsx` | `Shimmer` |

### Установка нового / обновление существующего компонента

```bash
# Установить или обновить (yes на все вопросы)
yes | npx ai-elements@latest add <component-name>

# Проверить
npm run typecheck
```

Файлы попадают сразу в `src/renderer/components/ai-elements/` через симлинк `src/components → src/renderer/components`.

> Симлинк создан один раз: `ln -s renderer/components src/components` и закоммичен в репозиторий.

### Почему импорты работают без правок

`components.json` настроен с `"utils": "@/lib/utils"`. В проекте существует `src/renderer/lib/utils.ts` который реэкспортирует `cn`. Поэтому CLI генерирует корректные импорты автоматически — ручных правок не требуется.

Если CLI перезаписал ui-компоненты и они сломались — проверить что `src/renderer/lib/utils.ts` существует.

### Зависимости AI Elements

Все уже установлены в проекте:
- `use-stick-to-bottom` — автоскролл в `Conversation`
- `streamdown` + `@streamdown/*` — markdown рендеринг в `MessageResponse` и `ReasoningContent`
- `@radix-ui/react-use-controllable-state` — состояние в `Reasoning`
- shadcn ui: `button`, `tooltip`, `collapsible`, `separator`, `button-group`
