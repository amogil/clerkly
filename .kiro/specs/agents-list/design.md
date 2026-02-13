# Документ Дизайна: Agents List

## Обзор

Agents List - это основной интерфейс для взаимодействия с AI-агентами в приложении Clerkly. Компонент предоставляет список агентов, интерфейс чата и навигацию между агентами.

## Схема Базы Данных

Структура данных основана на спецификации AGENTS-DESIGN.md.

### Таблица users

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_users_email ON users(email);
```

**Поля:**
- `user_id` - уникальный идентификатор пользователя (случайная строка 10 символов)
- `name` - имя пользователя из Google OAuth профиля
- `email` - email пользователя из Google OAuth профиля (уникальный)

### Таблица agents

```sql
CREATE TABLE agents (
  agent_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_agents_user_archived_updated
  ON agents(user_id, archived_at, updated_at DESC);
```

**Поля:**
- `agent_id` - уникальный идентификатор агента
- `user_id` - идентификатор пользователя-владельца (FK на users.user_id, TEXT 10 символов)
- `name` - название агента (может быть NULL для новых агентов)
- `created_at` - время создания (ISO 8601 с timezone offset)
- `updated_at` - время последнего обновления
- `archived_at` - время архивирования (NULL = не архивирован)

### Таблица messages

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_timestamp ON messages(agent_id, timestamp);
```

**Поля:**
- `id` - уникальный идентификатор сообщения
- `agent_id` - ID агента
- `timestamp` - время сообщения (ISO 8601 с timezone offset в часовом поясе пользователя)
- `payload_json` - JSON с данными сообщения

### Формат payload_json

Базовая структура:

```json
{
  "kind": "user | llm | tool_call | code_exec | final_answer | request_scope | artifact",
  "timing": { "started_at": "ISO+offset", "finished_at": "ISO+offset" },
  "data": {}
}
```

**Примечание:** `timing` обязателен только для: tool_call, code_exec, request_scope

### Message Kinds для UI

Для отображения в чате используются следующие kinds:

**user** - сообщение пользователя:
```json
{ "kind": "user", "data": { "reply_to_message_id": null, "text": "string" } }
```

**llm** - ответ LLM (показывается как текст агента):
```json
{
  "kind": "llm",
  "data": {
    "reply_to_message_id": 123,
    "action": {
      "type": "text | final_answer | request_scope | code_exec",
      "content": "string"
    }
  }
}
```

**final_answer** - финальный ответ агента:
```json
{ "kind": "final_answer", "data": { "reply_to_message_id": 123, "text": "string", "format": "markdown|text" } }
```

### Определение статуса агента

Статус агента вычисляется из последних сообщений:

```typescript
function getAgentStatus(messages: Message[]): AgentStatus {
  if (messages.length === 0) return 'new';
  
  const lastMessage = messages[messages.length - 1];
  const payload = JSON.parse(lastMessage.payload_json);
  
  // Проверка на running операции
  if (payload.kind === 'tool_call' || payload.kind === 'code_exec') {
    if (payload.data?.result?.status === 'running') return 'in-progress';
  }
  
  // Проверка на ошибки
  if (payload.data?.result?.status === 'error' || 
      payload.data?.result?.status === 'crash' ||
      payload.data?.result?.status === 'timeout') {
    return 'error';
  }
  
  // Проверка на завершение
  if (payload.kind === 'final_answer') return 'completed';
  
  // Проверка на ожидание пользователя
  if (payload.kind === 'llm' && payload.data?.action?.type === 'text') {
    return 'awaiting-user';
  }
  
  return 'new';
}
```

### Timestamp нормализация

Все timestamps ДОЛЖНЫ:
- Включать timezone offset (ISO 8601)
- Храниться в часовом поясе пользователя

Пример: `2026-02-13T18:42:11+01:00`

## Архитектура Компонента

```
┌─────────────────────────────────────────────────────────┐
│                    Agents Component                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Header (h-16)                         │ │
│  │  ┌──────────────────┐  ┌──────────────────────┐   │ │
│  │  │ Active Agent Info│  │   Agents List        │   │ │
│  │  │ (50%)            │  │   (50%)              │   │ │
│  │  └──────────────────┘  └──────────────────────┘   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Messages Area                         │ │
│  │  (flex-1, overflow-y-auto)                         │ │
│  │                                                    │ │
│  │  - Empty State Placeholder (if no messages)       │ │
│  │  - Message List                                    │ │
│  │  - Skeleton Loader (during lazy load)             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Input Area                            │ │
│  │  - Text Input                                      │ │
│  │  - Send Button                                     │ │
│  │  - "Press Enter to send" hint                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Реализация Компонентов

### 1. Empty State Placeholder

**Файл:** `src/renderer/components/agents/EmptyStatePlaceholder.tsx`

```typescript
interface EmptyStatePlaceholderProps {
  onExampleClick: (text: string) => void;
}

export function EmptyStatePlaceholder({ onExampleClick }: EmptyStatePlaceholderProps) {
  const examples = [
    "Summarize the key points from today's standup meeting",
    "Create a task list from the project requirements document",
    "Help me draft an email response to the client"
  ];
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Sparkles className="w-12 h-12 text-primary mb-4" />
      <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Try one of these examples:
      </p>
      <div className="space-y-2 w-full max-w-2xl">
        {examples.map((example, index) => (
          <button
            key={index}
            onClick={() => onExampleClick(example)}
            className="w-full p-4 text-left rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-colors"
          >
            <p className="text-sm">{example}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 2. Markdown Рендеринг

**Файл:** `src/renderer/components/agents/MessageContent.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

interface MessageContentProps {
  content: string | React.ReactNode;
}

export function MessageContent({ content }: MessageContentProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  if (typeof content !== 'string') {
    return <>{content}</>;
  }
  
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children).replace(/\n$/, '');
          
          if (!inline && match) {
            return (
              <div className="relative group">
                <button
                  onClick={() => handleCopyCode(code)}
                  className="absolute top-2 right-2 p-2 rounded bg-secondary hover:bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {copiedCode === code ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <SyntaxHighlighter
                  style={prism}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          
          return (
            <code className="px-1.5 py-0.5 rounded bg-secondary text-sm" {...props}>
              {children}
            </code>
          );
        },
        a({ node, children, href, ...props }) {
          return (
            <SafeLink href={href} {...props}>
              {children}
            </SafeLink>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### 3. Безопасные Ссылки с Проверкой на Фишинг

**Файл:** `src/renderer/components/agents/SafeLink.tsx`

```typescript
interface SafeLinkProps {
  href?: string;
  children: React.ReactNode;
}

const TRUSTED_DOMAINS = [
  'github.com',
  'stackoverflow.com',
  'google.com',
  // ... другие доверенные домены
];

export function SafeLink({ href, children }: SafeLinkProps) {
  const [showWarning, setShowWarning] = useState(false);
  
  const isTrustedDomain = (url: string): boolean => {
    try {
      const domain = new URL(url).hostname;
      return TRUSTED_DOMAINS.some(trusted => domain.endsWith(trusted));
    } catch {
      return false;
    }
  };
  
  const handleClick = (e: React.MouseEvent) => {
    if (!href) return;
    
    if (!isTrustedDomain(href)) {
      e.preventDefault();
      setShowWarning(true);
    }
  };
  
  if (showWarning) {
    return (
      <div className="inline-flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
        <AlertTriangle className="w-4 h-4 text-yellow-600" />
        <span className="text-sm">
          External link: {href}
        </span>
        <button
          onClick={() => window.open(href, '_blank')}
          className="text-sm text-primary hover:underline"
        >
          Continue
        </button>
        <button
          onClick={() => setShowWarning(false)}
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }
  
  return (
    <a
      href={href}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  );
}
```

### 4. Автоопределение Ссылок

**Файл:** `src/renderer/utils/linkify.ts`

```typescript
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const PHONE_REGEX = /(tel:[0-9+\-() ]+)/g;

export function linkifyText(text: string): string {
  return text
    .replace(URL_REGEX, '[$1]($1)')
    .replace(EMAIL_REGEX, '[$ 1](mailto:$1)')
    .replace(PHONE_REGEX, '[$1]($1)');
}
```

### 5. Skeleton Loader

**Файл:** `src/renderer/components/agents/SkeletonLoader.tsx`

```typescript
interface SkeletonLoaderProps {
  type: 'messages' | 'history';
  count?: number;
}

export function SkeletonLoader({ type, count = 3 }: SkeletonLoaderProps) {
  if (type === 'messages') {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-secondary animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-secondary rounded animate-pulse w-3/4" />
              <div className="h-4 bg-secondary rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  if (type === 'history') {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg border border-border">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-secondary rounded animate-pulse w-1/3" />
                <div className="h-3 bg-secondary rounded animate-pulse w-2/3" />
                <div className="h-3 bg-secondary rounded animate-pulse w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  return null;
}
```

### 6. Контекстное Меню Агента

**Файл:** `src/renderer/components/agents/AgentContextMenu.tsx`

```typescript
interface AgentContextMenuProps {
  agentId: string;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (agentId: string) => void;
}

export function AgentContextMenu({ agentId, position, onClose, onDelete }: AgentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  const handleDelete = () => {
    onDelete(agentId);
    onClose();
  };
  
  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ top: position.y, left: position.x }}
    >
      <button
        onClick={handleDelete}
        className="w-full px-4 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-red-600"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>
    </div>
  );
}
```

**Интеграция в AgentsList:**

```typescript
const [contextMenu, setContextMenu] = useState<{
  agentId: string;
  position: { x: number; y: number };
} | null>(null);

const handleContextMenu = (e: React.MouseEvent, agentId: string) => {
  e.preventDefault();
  setContextMenu({
    agentId,
    position: { x: e.clientX, y: e.clientY }
  });
};

const handleDeleteAgent = async (agentId: string) => {
  // Пометить агента как архивный в БД
  await updateAgent(agentId, { isArchived: true });
  
  // Удалить из локального состояния
  setAgents(prev => prev.filter(a => a.id !== agentId));
  
  // Если удаляется активный агент
  if (activeAgent?.id === agentId) {
    const remainingAgents = agents.filter(a => a.id !== agentId && !a.isArchived);
    if (remainingAgents.length > 0) {
      setActiveAgent(remainingAgents[0]);
    } else {
      // Создать нового агента
      const newAgent = createNewAgent();
      setAgents([newAgent]);
      setActiveAgent(newAgent);
    }
  }
};
```

### 7. Ленивая Загрузка Сообщений

**Файл:** `src/renderer/hooks/useInfiniteScroll.ts`

```typescript
export function useInfiniteScroll(
  containerRef: React.RefObject<HTMLDivElement>,
  onLoadMore: () => void,
  hasMore: boolean
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasMore) return;
    
    const handleScroll = () => {
      // Проверяем, достиг ли пользователь верха контейнера
      if (container.scrollTop < 100) {
        onLoadMore();
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, onLoadMore, hasMore]);
}
```

## Стратегия Тестирования

### Модульные Тесты

**Файл:** `tests/unit/components/agents/AgentContextMenu.test.tsx`
- Отображение контекстного меню
- Закрытие при клике вне области
- Вызов onDelete при клике на Delete
- Позиционирование меню

**Файл:** `tests/unit/components/agents/EmptyStatePlaceholder.test.tsx`
- Отображение placeholder
- Клик на пример вставляет текст
- Скрытие при наличии сообщений

**Файл:** `tests/unit/components/agents/MessageContent.test.tsx`
- Рендеринг Markdown
- Подсветка синтаксиса code blocks
- Копирование кода
- Санитизация HTML

**Файл:** `tests/unit/components/agents/SafeLink.test.tsx`
- Проверка доверенных доменов
- Предупреждение для подозрительных ссылок
- Открытие ссылок в новой вкладке

### Property-Based Тесты

**Файл:** `tests/property/agents/MessageFormatting.property.test.ts`
- Инварианты Markdown рендеринга
- Безопасность санитизации HTML
- Корректность linkify

### Функциональные Тесты

**Файл:** `tests/functional/agents-list.spec.ts`
- Полный workflow создания агента и отправки сообщений
- Переключение между агентами с автофокусом на поле ввода
- Ленивая загрузка сообщений
- Skeleton loaders
- Копирование сообщений
- Контекстное меню и архивирование агентов
- Автоскролл при отправке сообщения пользователем

## Зависимости

### Внешние библиотеки

```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "react-syntax-highlighter": "^15.5.0",
  "lucide-react": "^0.300.0"
}
```

### Поддерживаемые языки для подсветки

- JavaScript, TypeScript
- Python, Java, C#, Go, Rust
- SQL, HTML, CSS
- JSON, YAML, Markdown

## Производительность

### Оптимизации

1. **Виртуализация не требуется** - ленивая загрузка (200 сообщений) достаточна
2. **Мемоизация** - React.memo для MessageContent
3. **Debounce** - для ленивой загрузки (300ms)
4. **Code splitting** - динамический импорт SyntaxHighlighter

### Метрики

- Рендеринг сообщения: < 50ms
- Подсветка синтаксиса: < 100ms
- Ленивая загрузка: < 200ms

## Безопасность

### XSS Защита

- Санитизация HTML через react-markdown (встроенная)
- Whitelist для HTML тегов
- Проверка ссылок на фишинг
- CSP headers для внешнего контента

### Regex Паттерны

```typescript
// Безопасные regex без ReDoS уязвимостей
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
```

## Доступность

- Semantic HTML (article, section, button)
- ARIA labels для интерактивных элементов
- Keyboard navigation (Tab, Enter, Escape)
- Focus indicators
- Screen reader friendly

## Будущие Улучшения

- LaTeX формулы (KaTeX)
- Диаграммы (Mermaid)
- Интерактивные компоненты (формы, кнопки)
- Голосовой ввод
- Вложения (файлы, изображения)
