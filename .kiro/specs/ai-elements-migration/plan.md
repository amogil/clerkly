# План миграции на AI Elements + кастомный IPC Transport

## Статус: ЧЕРНОВИК — ожидает подтверждения

---

## Обзор архитектуры

Ключевая идея: `useChat` из `@ai-sdk/react` получает кастомный `ChatTransport`, который вместо HTTP делает `window.api.messages.create()` через IPC. Стриминг reasoning и обновления сообщений приходят через существующую систему событий (`MESSAGE_CREATED`, `MESSAGE_UPDATED`, `message.llm.reasoning.updated`) и конвертируются в AI SDK UI message stream.

### Что заменяется

| Старое | Новое |
|--------|-------|
| `MessageBubble.tsx` | `Message` + `MessageContent` + `MessageResponse` + `Reasoning` (AI Elements) |
| `ChatInput.tsx` + `AutoExpandingTextarea.tsx` | `PromptInput` + `PromptInputTextarea` + `PromptInputButton` (AI Elements) |
| `ScrollArea` + ручной скролл-менеджмент | `AgentChat` (per-agent компонент) + `Conversation` + `ConversationContent` + `ConversationScrollButton` (AI Elements). CSS show/hide вместо ремонта при смене агента |
| `useMessages` hook | `useAgentChat` (обёртка над `useChat` с кастомным transport) |
| `AnthropicProvider.ts` / `OpenAIProvider.ts` / `GoogleProvider.ts` | нативный HTTP+SSE для всех трёх провайдеров (chat() реализован, интерфейс ILLMProvider сохранён) |

### Что НЕ меняется (граница скоупа)

**КРИТИЧЕСКИ ВАЖНО**: Всё что выше области сообщений — не трогается:

- `AgentHeader` — полностью сохраняется (иконка активного агента, список агентов, анимации, кнопка New Chat, кнопка +N, тултипы, spring-анимация перестановки)
- `AllAgentsPage` — не трогается
- `AgentWelcome` — не трогается
- `RateLimitBanner` — остаётся отдельным компонентом, рендерится внутри `Conversation` (см. Фазу 6)
- `useAgents` hook — не трогается
- Весь main process, IPC handlers, события — не трогается (кроме LLM провайдеров)
- `AgentAvatar` — не трогается
- Функциональные тесты — не трогать, **кроме тестов скролла** (`agent-scroll-position.spec.ts` и scroll-тесты в `llm-chat.spec.ts`) — их можно переписать, сохраняя суть поведения

---

## Инвентарь data-testid (критично для функциональных тестов)

Все эти атрибуты ДОЛЖНЫ быть сохранены после миграции:

### Из `agents.tsx` (сохраняются без изменений)
- `data-testid="agents"` — корневой контейнер (не трогается)
- `data-testid="message"` — каждое сообщение (motion.div обёртка в agents.tsx)
- `data-message-id={message.id}` — каждое сообщение (motion.div обёртка в agents.tsx)

### Из `llm-chat.spec.ts` (должны быть в новых компонентах)
- `data-testid="messages-area"` — скроллируемый viewport (тесты скролла будут переписаны — см. секцию ниже)
- `data-testid="message-user"` — пузырь пользователя (в `AgentMessage`)
- `data-testid="message-llm"` — пузырь агента kind:llm (в `AgentMessage`)
- `data-testid="message-llm-action"` — блок action.content внутри llm пузыря (в `AgentMessage`)
- `data-testid="message-llm-reasoning"` — блок reasoning внутри llm пузыря (в `AgentMessage`)
- `data-testid="message-error"` — пузырь ошибки kind:error (в `AgentMessage`)
- `data-testid="message-error-action-link"` — кнопка action_link внутри error пузыря (в `AgentMessage`)
- `data-testid="auto-expanding-textarea"` — textarea в поле ввода (в `AgentPromptInput`)
- `data-testid="rate-limit-banner"` — баннер rate limit (в `RateLimitBanner`)
- `data-testid="rate-limit-cancel"` — кнопка Cancel в баннере (в `RateLimitBanner`)

### Функциональные тесты скролла — МОЖНО менять

Тесты в `agent-scroll-position.spec.ts` и часть тестов в `llm-chat.spec.ts` используют прямой доступ к `el.scrollTop`:
```js
messagesArea.evaluate(el => el.scrollTop)
messagesArea.evaluate(el => { el.scrollTop = 100 })
messagesArea.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)
```

**Эти тесты МОЖНО переписать.** Главное — сохранить суть проверяемого поведения:
- Если пользователь "внизу" чата, при появлении нового сообщения (от него или агента) должен быть автоскролл
- Если пользователь прокрутил вверх — автоскролл не должен срабатывать
- При переключении агентов позиция скролла должна сохраняться/восстанавливаться

Вместо прямого `scrollTop` тесты можно переписать на проверку видимости элементов:
```js
// Вместо: expect(scrollTop).toBe(100)
// Использовать: await expect(lastMessage).toBeVisible()
// Или: await expect(lastMessage).toBeInViewport()
```

Обновление этих тестов — отдельная задача в Фазе 10.

---

## Анализ совместимости (критические блокеры)

### ⚠️ React версия
- Текущая: `react: ^18.3.1`
- AI Elements требует: React 19
- **Действие:** Апгрейд React 18 → 19 перед установкой AI Elements

### ✅ Tailwind версия
- Текущая: `tailwindcss: ^4.1.12`
- AI Elements требует: Tailwind v4
- **Статус:** Уже совместимо

### ⚠️ AI SDK версия
- Текущая: не установлен
- Нужна: `ai` v5+ (для `DirectChatTransport`, кастомного `ChatTransport`)
- **Действие:** Установить `ai@5`, `@ai-sdk/react@5`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`

### ⚠️ `framer-motion` vs `motion`
- Текущая: `motion: ^12.23.24` (новый пакет)
- В коде используется: `import { motion } from 'framer-motion'` — нужно проверить совместимость
- AI Elements использует собственные анимации — конфликтов быть не должно

---

## Анализ требований (что нужно учесть при реализации)

### Из `agents/requirements.md`

1. **agents.4.13.8-11 (ScrollArea)** — текущий `ScrollArea` из radix-ui заменяется `Conversation`. `Conversation` из AI Elements управляет автоскроллом из коробки. Функциональные тесты скролла будут переписаны на проверку видимости элементов вместо прямого `scrollTop`.

2. **agents.4.14 (сохранение позиции скролла)** — весь ручной механизм (`scrollPositions` Map, `restoredAgents` Set) заменяется. `Conversation` (use-stick-to-bottom) управляет скролом автоматически — компонент остаётся смонтированным, позиция сохраняется без дополнительной логики.

3. **agents.4.7.1 (автофокус)** — `textareaRef` с `AutoExpandingTextareaHandle` заменяется. `PromptInputTextarea` должен поддерживать `ref` для программного фокуса.

4. **agents.4.6 (max height 50% чата)** — `AutoExpandingTextarea` вычисляет `maxHeight = chatArea.offsetHeight * 0.5`. Нужно проверить поддерживает ли `PromptInputTextarea` кастомный `maxHeight`.

5. **agents.4.9 (стилизация user messages)** — `rounded-2xl bg-secondary/70 border border-border` — нужно кастомизировать стили `Message from="user"` в AI Elements.

6. **agents.4.22 (text wrapping)** — `whitespace-pre-wrap break-words` — нужно убедиться что AI Elements `MessageContent` сохраняет эти стили.

7. **agents.6.7.2 (activation animation)** — логика `showActivationAnimation` в `agents.tsx` — не связана с заменяемыми компонентами, остаётся без изменений.

### Из `llm-integration/requirements.md`

8. **llm-integration.2 (стриминг reasoning)** — `message.llm.reasoning.updated` событие с `{ delta, accumulatedText }` — `IPCChatTransport` должен конвертировать это в `reasoning-delta` stream part для `useChat`.

9. **llm-integration.3.4.1 (action_link в error)** — `kind: error` с `action_link: { label, screen }` — нужен кастомный рендер для error сообщений.

10. **llm-integration.3.7 (rate limit banner)** — `RateLimitBanner` переносится на AI SDK компоненты (см. Фазу 6).

11. **llm-integration.3.8 (dismissed errors)** — сообщения с `dismissed: true` не должны отображаться — фильтровать в `messageMapper`.

12. **llm-integration.8.5 (interrupted messages)** — сообщения с `interrupted: true` не должны отображаться — фильтровать в `messageMapper`.

---

## Задачи

### Фаза 0: Подготовка и исследование

- [x] **0.1** Проверить совместимость React 18 → 19: `npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19`, запустить `npm run validate`
- [x] **0.2** Установить AI SDK v5: `npm install ai@5 @ai-sdk/react@5 @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google`, проверить что нет конфликтов
- [x] **0.3** Изучить интерфейс `ChatTransport` из пакета `ai@5` — понять какие методы нужно реализовать (`sendMessages`, обработка UI message stream)
- [x] **0.4** Изучить формат `UIMessage` из `@ai-sdk/react@5` — понять как маппить `MessageSnapshot` (kind: user/llm/error) в AI SDK формат, особенно reasoning parts
- [x] **0.5** Изучить исходники AI Elements компонентов через registry API. **Решение:**
  - `Conversation` — установить через CLI (`npx ai-elements@latest add conversation`). Тонкая обёртка над `use-stick-to-bottom`.
  - `Message` — установить через CLI (`npx ai-elements@latest add message`). Использует `streamdown` для markdown — это нормально, зависимость уже установлена.
  - `Reasoning` — установить через CLI (`npx ai-elements@latest add reasoning`). Использует `streamdown` для markdown.
  - `PromptInput` — **пропустить** (зависит от `nanoid`, `Command`, `DropdownMenu`, `HoverCard`, `InputGroup`, `Select`, `Spinner` — избыточно). Сохранить `ChatInput` + `AutoExpandingTextarea` → переименовать в `AgentPromptInput`.
  - **Итог:** Устанавливать через CLI. Инструкция по установке — `.kiro/specs/agents/design.md` (секция "Установка и обновление AI Elements компонентов").
- [x] **0.6** `AutoExpandingTextarea` уже поддерживает: `ref` через `useImperativeHandle` (focus/blur), `maxHeight = chatArea.offsetHeight * 0.5`, Enter/Shift+Enter, `data-testid="auto-expanding-textarea"`. Дополнительных изменений не требуется.
- [x] **0.7** `Conversation` (`use-stick-to-bottom`): автоскролл при новых сообщениях — ✅ (StickToBottom с `initial="smooth"`), кнопка scroll-to-bottom — ✅ (`ConversationScrollButton` через `useStickToBottomContext`), поведение при смене `key` — стандартное React remount.
- [x] **0.8** Изучить API `streamText` из `ai@5`. **Выводы:**
  - `streamText` из `ai@5` несовместим с `@ai-sdk/anthropic@3`/`@ai-sdk/google@3`/`@ai-sdk/openai@3` — они используют `LanguageModelV3`, а `ai@5` ожидает `LanguageModelV2`
  - **Решение для Phase 9:** Сохранить нативный fetch+SSE для OpenAI (уже работал), реализовать Anthropic и Google аналогично через нативный HTTP+SSE
  - `ai@5` используется только в renderer (для `useChat`, `UIMessage`) — в main process не импортируется
- [x] **0.9** Обновить `requirements.md`:
  - Добавлен раздел `agents.13` (AI Elements интеграция)
  - Обновлён `agents.4.13.11` — заменено требование ScrollArea из radix-ui на `Conversation` из AI Elements
  - Обновлён `agents.4.14.5` — допускается хранение ID последнего видимого сообщения вместо `scrollTop`
- [x] **0.10** Обновить `design.md` — добавлена секция "AI Elements интеграция (Фаза 9)" с архитектурой `IPCChatTransport`, `useAgentChat`, маппинга сообщений, ленивой загрузки
- [x] **0.11** Обновить `tasks.md` — задачи 9.0 и 9.1 отмечены выполненными


---

### Фаза 1: Установка зависимостей

- [x] **1.1** Апгрейд React: `npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19`
- [x] **1.2** Установить AI SDK: `npm install ai@5 @ai-sdk/react@5 @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google`
- [x] **1.3** Установить AI Elements компоненты: `yes | npx ai-elements@latest add conversation message reasoning` (PromptInput пропущен — см. 0.5)
- [x] **1.4** Компоненты появились в `src/renderer/components/ai-elements/`: `conversation.tsx`, `message.tsx`, `reasoning.tsx`, `shimmer.tsx`
- [x] **1.5** `npm run typecheck && npm run build:renderer` — проходят без ошибок. Unit-тесты (1419) проходят.

---

### Фаза 2: Кастомный IPC ChatTransport

Ключевой компонент — мост между `useChat` и Electron IPC.

**Файл:** `src/renderer/lib/IPCChatTransport.ts`

**Результаты исследования (0.3, 0.4):**

`ChatTransport<UI_MESSAGE>` требует реализации двух методов:
```typescript
interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
    // + headers, body, metadata
  }): Promise<ReadableStream<UIMessageChunk>>;

  reconnectToStream(options: {
    chatId: string;
    // + headers, body, metadata
  }): Promise<ReadableStream<UIMessageChunk> | null>;
}
```

`UIMessageChunk` — это union type. Нужные нам чанки:
- `{ type: 'start', messageId?: string }` — начало сообщения
- `{ type: 'reasoning-start', id: string }` — начало reasoning
- `{ type: 'reasoning-delta', id: string, delta: string }` — дельта reasoning
- `{ type: 'reasoning-end', id: string }` — конец reasoning
- `{ type: 'text-start', id: string }` — начало текста
- `{ type: 'text-delta', id: string, delta: string }` — дельта текста
- `{ type: 'text-end', id: string }` — конец текста
- `{ type: 'finish' }` — завершение
- `{ type: 'error', errorText: string }` — ошибка
- `{ type: 'abort' }` — отмена

`UIMessage` структура:
```typescript
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  metadata?: unknown;
  parts: Array<TextUIPart | ReasoningUIPart | ...>;
}
// TextUIPart: { type: 'text', text: string, state?: 'streaming' | 'done' }
// ReasoningUIPart: { type: 'reasoning', text: string, state?: 'streaming' | 'done' }
```

`useChat` из `@ai-sdk/react` принимает `ChatInit` (или `{ chat: Chat }`):
```typescript
// UseChatHelpers возвращает:
{
  id: string;
  messages: UIMessage[];
  setMessages: (msgs) => void;
  sendMessage: (message?) => void;
  stop: () => void;
  status: 'idle' | 'streaming' | 'submitted' | 'error';
  error: Error | undefined;
  // + regenerate, resumeStream, addToolResult, clearError
}
```

**Стратегия реализации `IPCChatTransport`:**
- `sendMessages()` — вызывает `window.api.messages.create()`, затем подписывается на IPC события и пишет чанки в `ReadableStream`
- `reconnectToStream()` — возвращает `null` (нет серверного стриминга для reconnect)
- Маппинг событий → чанки:
  - `MESSAGE_CREATED` (kind: llm) → `start` + `reasoning-start` (если будет reasoning)
  - `MESSAGE_LLM_REASONING_UPDATED` → `reasoning-delta`
  - `MESSAGE_UPDATED` с `action` → `reasoning-end` + `text-start` + `text-delta` + `text-end` + `finish`
  - `MESSAGE_CREATED` (kind: error) → `error` + `finish`

**Контекст для реализации:**
- Текущий `useMessages` hook (`src/renderer/hooks/useMessages.ts`) подписывается на 3 события:
  - `MESSAGE_CREATED` — новое сообщение (kind: user/llm/error). Payload: `{ message: MessageSnapshot }`. Если `message.hidden === true` — не добавлять.
  - `MESSAGE_UPDATED` — обновление сообщения. Payload: `{ message: MessageSnapshot }`. Если `message.hidden === true` — удалить из списка.
  - `MESSAGE_LLM_REASONING_UPDATED` — стриминг reasoning. Payload: `{ messageId, agentId, delta, accumulatedText }`.
- Отправка сообщения: `window.api.messages.create(agentId, 'user', payload)` где payload = `{ data: { text, reply_to_message_id: null } }`
- `IPCChatTransport` должен конвертировать эти IPC-события в `ReadableStream<UIMessageStreamPart>` для `useChat`

- [x] **2.1** Создать `src/renderer/lib/IPCChatTransport.ts` (`tests/unit/renderer/IPCChatTransport.test.ts`)
- [x] **2.2** Реализовать интерфейс `ChatTransport`:
  - Метод `sendMessages({ messages, abortSignal })` — вызывает `window.api.messages.create(agentId, 'user', payload)` через IPC
  - Возвращает `ReadableStream<UIMessageStreamPart>` — поток обновлений для `useChat`
- [x] **2.3** Реализовать конвертацию IPC-событий в UI message stream:
  - `MESSAGE_CREATED` (kind: llm) → `{ type: 'text-start' }`
  - `MESSAGE_LLM_REASONING_UPDATED` → `{ type: 'reasoning-delta', delta }`
  - `MESSAGE_UPDATED` с `action` → `{ type: 'text-delta', delta: action.content }` + `{ type: 'finish' }`
  - `MESSAGE_CREATED` (kind: error) → `{ type: 'error', error }`
- [x] **2.4** Реализовать отмену через `abortSignal` — при abort отписаться от событий и закрыть stream
- [x] **2.5** Реализовать сценарий прерывания при новом сообщении (llm-integration.8)
- [x] **2.6** Написать unit-тесты для `IPCChatTransport` (`tests/unit/renderer/IPCChatTransport.test.ts`)
- [x] **2.7** Обновить `design.md` — добавить детальную схему `IPCChatTransport`

---

### Фаза 3: Маппинг сообщений + ленивая загрузка истории

**Файл:** `src/renderer/lib/messageMapper.ts`

**Контекст для реализации:**
- Текущий `useMessages` загружает ВСЮ историю сообщений при смене агента через `window.api.messages.list(agentId)`. Это проблема для агентов с длинной историей.
- `MessageSnapshot` из API имеет поля: `{ id, agentId, kind, timestamp, payload: { data, timing }, hidden }`.
- `UIMessage` из AI SDK имеет поля: `{ id, role: 'user'|'assistant', parts: MessagePart[], createdAt, metadata }`.
- Фильтрация: `hidden === true` (dismissed errors, interrupted llm) → не включать в результат.

#### Ленивая загрузка истории

**Архитектура:** Все `AgentChat` монтируются при старте приложения. Каждый при mount загружает последние 50 сообщений через `messages:list-paginated`. Остальные сообщения подгружаются лениво при скролле вверх.

**Детали реализации:**

1. **Новый IPC endpoint:** `messages:list-paginated`
   - Параметры: `{ agentId, limit, beforeId? }`
   - `limit` — количество сообщений (по умолчанию 50)
   - `beforeId` — ID сообщения, до которого загружать (для пагинации вверх)
   - Возвращает: `{ messages: MessageSnapshot[], hasMore: boolean }`
   - SQL: `SELECT ... FROM messages WHERE agent_id = ? AND id < ? ORDER BY id DESC LIMIT ?` (затем reverse)

2. **Новый метод в `MessagesRepository`:** `listByAgentPaginated(agentId, limit, beforeId?)`
   - Если `beforeId` не указан — загружает последние `limit` сообщений
   - Если `beforeId` указан — загружает `limit` сообщений с `id < beforeId`
   - Возвращает `{ messages: Message[], hasMore: boolean }` (hasMore = true если в БД есть ещё сообщения)

3. **В `useAgentChat`:**
   - При mount загружает последние 50 сообщений через `messages:list-paginated`
   - Передаёт их как `initialMessages` в `useChat` (через `toUIMessages()`)
   - Хранит `hasMore` флаг и `oldestMessageId` для пагинации
   - Экспортирует `loadMore()` функцию для подгрузки при скролле вверх
   - Экспортирует `isLoading` — `true` пока идёт загрузка начального чанка

4. **В `AgentChat`:**
   - При скролле к верхней границе вызывает `loadMore()`
   - `loadMore()` загружает следующие 50 сообщений через `messages:list-paginated` с `beforeId = oldestMessageId`
   - Новые (старые) сообщения prepend-ятся в начало списка
   - Позиция скролла сохраняется (не прыгает вверх при подгрузке)

- [x] **3.1** Создать `src/renderer/lib/messageMapper.ts` (`tests/unit/renderer/messageMapper.test.ts`)
- [x] **3.2** Реализовать маппинг типов
- [x] **3.3** Добавить IPC endpoint `messages:list-paginated` в main process
- [x] **3.4** Написать unit-тесты для `messageMapper` (`tests/unit/renderer/messageMapper.test.ts`)
- [x] **3.5** Написать property-based тесты для `messageMapper` (`tests/property/renderer/messageMapper.property.test.ts`)
- [x] **3.6** Написать unit-тесты для `listByAgentPaginated`
- [x] **3.7** Написать unit-тесты для `MessageManager.listPaginated` и `AgentIPCHandlers` (handler `messages:list-paginated`)
- [ ] **3.8** Написать функциональный тест для ленивой загрузки:
  - `tests/functional/lazy-loading.spec.ts` — "should load last 50 messages on agent open"
  - `tests/functional/lazy-loading.spec.ts` — "should load more messages on scroll to top"
  - `tests/functional/lazy-loading.spec.ts` — "should not trigger load more when all messages loaded"

---

### Фаза 4: Хук useAgentChat

Заменяет `useMessages` (`src/renderer/hooks/useMessages.ts`), оборачивает `useChat` с кастомным transport.

**Файл:** `src/renderer/hooks/useAgentChat.ts`

**Контекст для реализации:**
- Текущий `useMessages(agentId)` возвращает `{ messages: MessageSnapshot[], isLoading, sendMessage, refreshMessages }`.
- Новый `useAgentChat(agentId)` должен возвращать совместимый интерфейс, но использовать `useChat` внутри.
- `useChat` из `@ai-sdk/react@5` принимает `{ id, transport, initialMessages }`.
- `id` = agentId — `useChat` автоматически изолирует состояние по `id`.
- Хук используется внутри `AgentChat` компонента — каждый `AgentChat` монтируется при старте и вызывает `useAgentChat(agentId)`.
- `isLoading = true` пока идёт загрузка начального чанка (50 сообщений). `agents.tsx` показывает лоадер пока хотя бы один агент имеет `isLoading === true`.
- `initialMessages` — загружаются асинхронно через `messages:list-paginated`, поэтому нужен двухфазный mount:
  1. Сначала `useChat` создаётся с пустым `initialMessages`
  2. После загрузки начального чанка — вызвать `setMessages(loaded)` (если `useChat` поддерживает) или пересоздать через `key`

**Интерфейс:**
```typescript
interface UseAgentChatResult {
  messages: UIMessage[];           // AI SDK формат
  rawMessages: MessageSnapshot[];  // Оригинальный формат (для data-testid, metadata)
  isLoading: boolean;              // true пока загружается начальный чанк (50 сообщений)
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<boolean>;
  loadMore: () => Promise<void>;   // Ленивая подгрузка при скролле вверх
  hasMore: boolean;                // Есть ли ещё сообщения для подгрузки
}
```

**Почему `rawMessages`:** AI SDK `UIMessage` не хранит `kind`, `hidden`, `agentStatus` и другие поля из `MessageSnapshot`. Для рендеринга `AgentMessage` нужен доступ к оригинальным данным (например, `kind: 'error'` для красного стиля, `action_link` для навигации). Поэтому хук хранит параллельный массив `rawMessages` и синхронизирует его с `UIMessage[]`.

**Обработка `AGENT_RATE_LIMIT` события (llm-integration.3.7):**
- Сейчас `agents.tsx` подписывается на `EVENT_TYPES.AGENT_RATE_LIMIT` и хранит `rateLimitBanner` state (`{ agentId, userMessageId, retryAfterSeconds }`).
- После миграции: подписка на `AGENT_RATE_LIMIT` остаётся в `agents.tsx` (НЕ переносится в `useAgentChat`), потому что rate limit — это UI-состояние (показать/скрыть баннер), а не часть потока сообщений `useChat`.
- `RateLimitBanner` рендерится внутри `Conversation` как отдельный элемент (не как `AgentMessage`), управляемый `rateLimitBanner` state из `agents.tsx`.
- **Альтернатива:** Если при исследовании (Фаза 0) окажется что `Conversation` плохо поддерживает рендер элементов вне списка сообщений — перенести подписку в `useAgentChat` и экспортировать `rateLimitInfo` из хука.

**Обработка Cancel rate limit (llm-integration.3.7.4):**
- При Cancel: `cancelRetry(agentId, userMessageId)` удаляет исходное `kind: user` сообщение из БД.
- Main process эмитит `MESSAGE_UPDATED` с `hidden: true` для удалённого user message.
- `IPCChatTransport` / `useAgentChat` получает это событие и удаляет сообщение из `rawMessages`.
- Для `useChat` state: нужно вызвать `setMessages()` чтобы убрать user message из `UIMessage[]`. Хук `useAgentChat` должен слушать `MESSAGE_UPDATED` с `hidden: true` и синхронизировать оба массива.

- [x] **4.1** Создать `src/renderer/hooks/useAgentChat.ts`
- [x] **4.2** Реализовать хук с `useChat` + `IPCChatTransport`
- [x] **4.3** Реализовать загрузку начального чанка (последние 50 сообщений) через `messages:list-paginated` + `toUIMessages()`
- [x] **4.4** Реализовать `loadMore()` — подгрузка старых сообщений при скролле вверх
- [x] **4.5** Реализовать синхронизацию `rawMessages` с `UIMessage[]` (для доступа к kind, metadata)
- [x] **4.6** Реализовать обработку `MESSAGE_UPDATED` с `hidden: true`
- [x] **4.7** Написать unit-тесты для `useAgentChat` (`tests/unit/hooks/useAgentChat.test.ts`)
- [x] **4.8** Обновить `design.md` — добавить описание `useAgentChat`

---

### Фаза 5: Компонент Conversation (скролл)

Заменяет `ScrollArea` + весь ручной скролл-менеджмент.

**Удаляемый код из `agents.tsx`:**
- `scrollPositions` ref (Map) — сохранение позиции скролла
- `shouldScrollOnNextMessage` ref — флаг автоскролла после отправки
- `restoredAgents` ref (Set) — трекинг восстановленных позиций
- `messagesAreaRef`, `scrollAreaRootRef`, `resizeObserverRef` — DOM refs
- `viewportCallbackRef` функция — CSS variable `--viewport-height`
- `handleScroll` функция — сохранение позиции + отмена автоскролла
- `scrollToBottom` функция — скролл к низу с подавлением скроллбара
- `isUserAtBottom` функция — проверка позиции
- `scrollbarHidden` state — подавление вспышки скроллбара
- useEffect для восстановления позиции скролла при смене агента
- useEffect для сброса `restoredAgents`
- CSS `.scrollbar-hidden` из `src/renderer/styles/index.css`

**Контекст:** `Conversation` из AI Elements управляет скроллом автоматически (автоскролл при новых сообщениях, кнопка "scroll to bottom"). Каждый `AgentChat` имеет свой `Conversation` — он остаётся смонтированным всё время, поэтому позиция скролла сохраняется автоматически без дополнительной логики.

**AgentWelcome внутри Conversation:**
- Сейчас `AgentWelcome` рендерится внутри `ScrollArea` с выравниванием `min-h-full flex flex-col justify-end` (agents.4.20).
- После миграции `AgentWelcome` будет рендериться внутри `Conversation` / `ConversationContent`.
- Нужно убедиться что `Conversation` поддерживает рендер произвольного контента (не только сообщений) и что выравнивание `justify-end` работает корректно.
- Если `Conversation` ожидает только `Message` компоненты — `AgentWelcome` может потребовать обёртки или рендера вне `ConversationContent`.

- [x] **5.1** Изучить API `Conversation`, `ConversationContent`, `ConversationScrollButton`
- [x] **5.2** Создать `AgentChat` компонент (`src/renderer/components/agents/AgentChat.tsx`):
  - Использует `useAgentChat(agentId)` для загрузки сообщений
  - Содержит `Conversation` + `ConversationContent` + список `AgentMessage` + `AgentPromptInput`
  - Экспортирует `isLoading` через props callback или через ref
- [x] **5.3** Добавить `data-testid="messages-area"` на контейнер сообщений (для функциональных тестов)
- [x] **5.4** `AgentWelcome` рендерится внутри `ConversationContent` с `justify-end min-h-full` — корректно
- [x] **5.5** В `agents.tsx` рендерить все `AgentChat` одновременно, скрывать неактивные через CSS `hidden`. НЕ использовать `key={currentAgent.id}`.
- [x] **5.6** Реализовать подгрузку при скролле вверх — `onScroll` на `Conversation`, проверка `scrollTop < 50`
- [x] **5.7** Написать unit-тесты (`tests/unit/components/agents/AgentChat.test.tsx`) — 19 тестов
- [ ] **5.7.1** Написать функциональные тесты автоскролла и ленивой подгрузки (`tests/functional/agent-scroll-position.spec.ts`):
  - "should autoscroll to bottom when user is at bottom and new message arrives"
  - "should NOT autoscroll when user has scrolled up"
  - "should load more messages when scrolled to top (scrollTop < 50)"
  - "should NOT trigger load more when all messages are loaded (hasMore = false)"
  - "should preserve scroll position when switching between agents"
- [ ] **5.7.2** Написать функциональный тест стартового лоадера (`tests/functional/startup-loader.spec.ts`):
  - "should show loader while agents are loading initial messages" — лоадер (три точки) виден сразу после запуска, пока идёт загрузка
  - "should load last 50 messages per agent on startup" — после исчезновения лоадера каждый агент показывает до 50 сообщений
  - "should hide loader and show chat UI after all agents finish loading" — после загрузки всех агентов лоадер скрывается и отображается интерфейс чата (textarea, сообщения)
- [x] **5.8** Обновить `design.md` — убраны пометки ⚠️ УСТАРЕЛО, заменены на актуальные описания

---

### Фаза 6: Компонент AgentMessage (Message + Error)

Заменяет `MessageBubble.tsx`. `RateLimitBanner` остаётся отдельным компонентом.

**Файл:** `src/renderer/components/agents/AgentMessage.tsx`

**Контекст — текущий внешний вид MessageBubble:**

1. **User message (kind: 'user'):**
   ```html
   <div class="flex justify-end">
     <div data-testid="message-user"
          class="rounded-2xl bg-secondary/70 border border-border px-4 py-3 min-w-0">
       <p class="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
         {text}
       </p>
     </div>
   </div>
   ```

2. **LLM message (kind: 'llm'):**
   ```html
   <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > Avatar (Logo) показывается перед первым llm-сообщением в последовательности -->
   {showAvatar && <Logo size="sm" showText={false} animated={isInProgress(agentStatus)} />}
   <div data-testid="message-llm" class="space-y-2">
     <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > Reasoning (если есть) -->
     <div data-testid="message-llm-reasoning"
          class="text-xs text-muted-foreground italic whitespace-pre-wrap break-words">
       {reasoning.text}
     </div>
     <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > Action content (если есть) -->
     <div data-testid="message-llm-action"
          class="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
       {action.content}
     </div>
     <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > Loading indicator (если нет action — стриминг) -->
     <div data-testid="message-llm-loading" class="flex gap-1 items-center py-1">
       <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
       <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
       <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
     </div>
   </div>
   ```

3. **Error message (kind: 'error'):**
   ```html
   {showAvatar && <Logo size="sm" showText={false} animated={false} />}
   <div data-testid="message-error"
        class="text-sm leading-relaxed text-red-500 whitespace-pre-wrap break-words
               rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
     {error.message}
     <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > action_link (если есть) — кликабельная ссылка -->
     <button data-testid="message-error-action-link"
             class="ml-2 underline text-red-600 hover:text-red-800 font-medium">
       {action_link.label}  <- 
    - 
        - dd if=/dev/zero bs=1M count=1 | base64 > например "Open Settings" -->
     </button>
   </div>
   ```

4. **RateLimitBanner (текущий внешний вид):**
   ```html
   <div data-testid="rate-limit-banner"
        class="flex items-center gap-3 px-4 py-2 bg-yellow-50 border border-yellow-200
               rounded-lg text-sm text-yellow-800">
     <span>Rate limit exceeded. Retrying in {N} second(s)...</span>
     <button data-testid="rate-limit-cancel"
             class="ml-auto text-yellow-700 hover:text-yellow-900 font-medium underline">
       Cancel
     </button>
   </div>
   ```
   - Обратный отсчёт: `useState(retryAfterSeconds)` + `setTimeout` каждую секунду
   - При `secondsLeft <= 0`: вызывает `window.api.messages.retryLast(agentId, userMessageId)` и `onDismiss()`
   - При Cancel: вызывает `window.api.messages.cancelRetry(agentId, userMessageId)` и `onDismiss()`

**Миграция RateLimitBanner на AI SDK:**
- `RateLimitBanner` остаётся отдельным компонентом (НЕ становится `AgentMessage`) — это UI-overlay с countdown, а не сообщение в потоке
- Рендерится внутри `Conversation` как отдельный элемент, управляемый `rateLimitBanner` state из `agents.tsx`
- Подписка на `AGENT_RATE_LIMIT` событие остаётся в `agents.tsx`
- Сохраняет точно такой же внешний вид (жёлтый фон, countdown, кнопка Cancel)
- Сохраняет `data-testid="rate-limit-banner"` и `data-testid="rate-limit-cancel"`
- Логика countdown и IPC вызовов (`retryLast`, `cancelRetry`) остаётся без изменений
- При Cancel: `cancelRetry` удаляет user message из БД → main process эмитит `MESSAGE_UPDATED` с `hidden: true` → `useAgentChat` удаляет сообщение из обоих массивов (см. Фаза 4.6)

**Миграция Error на AI SDK:**
- Error messages рендерятся через `AgentMessage` с проверкой `metadata.isError`
- Сохраняют точно такой же внешний вид (красный фон, border, текст ошибки)
- `action_link` рендерится как кнопка с `onNavigate` callback
- Сохраняют `data-testid="message-error"` и `data-testid="message-error-action-link"`

- [x] **6.1** Создать `src/renderer/components/agents/AgentMessage.tsx` (`tests/unit/components/agents/AgentMessage.test.tsx`)
- [x] **6.2** Обновить `RateLimitBanner` — сохранить как отдельный компонент
- [x] **6.3** Написать unit-тесты для `AgentMessage` (`tests/unit/components/agents/AgentMessage.test.tsx`)
- [x] **6.4** Обновить `design.md`

---

### Фаза 7: Компонент Reasoning

**Контекст:** Текущий reasoning рендерится как простой `<div>` с `text-xs text-muted-foreground italic`. AI Elements `Reasoning` компонент добавляет collapsible UI (кнопка "Show thinking" / "Hide thinking").

- [x] **7.1** Интегрировать `Reasoning` из AI Elements в `AgentMessage` для llm сообщений
- [x] **7.2** Написать unit-тесты
- [x] **7.3** Обновить `design.md`

---

### Фаза 8: Компонент AgentPromptInput

Заменяет `ChatInput.tsx` + `AutoExpandingTextarea.tsx`.

**Файл:** `src/renderer/components/agents/AgentPromptInput.tsx`

**Контекст — текущий внешний вид ChatInput:**
```html
<div class="p-4 border-t border-border bg-card flex-shrink-0">
  <div class="flex gap-2 items-end">
    <textarea data-testid="auto-expanding-textarea"
              class="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg
                     text-sm text-foreground placeholder:text-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Ask, reply, or give command..."
              rows="1" />
    <button class="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg
                   hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
      <Send class="w-4 h-4" />
    </button>
  </div>
  <p class="text-xs text-muted-foreground mt-1.5 px-0.5">
    Press Enter to send, Shift+Enter for new line
  </p>
</div>
```

**Поведение AutoExpandingTextarea:**
- `rows="1"` — начальная высота 1 строка
- При вводе текста: `textarea.style.height = Math.min(scrollHeight, chatArea.offsetHeight * 0.5)`
- `overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'`
- Enter без Shift → submit, Shift+Enter → новая строка
- `ref` с `focus()` / `blur()` через `useImperativeHandle`

- [x] **8.1** Создать `src/renderer/components/agents/AgentPromptInput.tsx` (`tests/unit/components/agents/AgentPromptInput.test.tsx`)
- [x] **8.2** Написать unit-тесты (`tests/unit/components/agents/AgentPromptInput.test.tsx`)
- [x] **8.3** Обновить `design.md`

---

### Фаза 9: Миграция LLM провайдеров (main process)

Реализует `chat()` для Anthropic и Google провайдеров через нативный HTTP+SSE (по образцу OpenAI).

**Контекст:**
- `OpenAIProvider.ts` — уже реализован через нативный fetch+SSE, тесты написаны
- `AnthropicProvider.ts` — `chat()` бросал `not implemented`, теперь реализован через Anthropic Messages API (SSE)
- `GoogleProvider.ts` — `chat()` бросал `not implemented`, теперь реализован через Gemini `streamGenerateContent?alt=sse`
- `ai@5` используется только в renderer (для `useChat`, `UIMessage`). В main process — не используется.
- Интерфейс `ILLMProvider` сохранён без изменений

**Почему не AI SDK streamText:**
- `ai@5` использует `LanguageModelV2`, а `@ai-sdk/anthropic@3`/`@ai-sdk/google@3`/`@ai-sdk/openai@3` реализуют `LanguageModelV3` — несовместимы

- [x] **9.1** `OpenAIProvider.ts` — уже реализован через нативный fetch+SSE (без изменений)
- [x] **9.2** Реализовать `AnthropicProvider.chat()` через нативный HTTP+SSE (Anthropic Messages API)
- [x] **9.3** Реализовать `GoogleProvider.chat()` через нативный HTTP+SSE (Gemini streamGenerateContent)
- [x] **9.4** Обработка ошибок: 401 → "Invalid API key", 429 → rate limit, 5xx → "Provider unavailable"
- [x] **9.5** Написать unit-тесты: `AnthropicProvider.chat.test.ts`, `GoogleProvider.chat.test.ts`
- [x] **9.6** Запустить `npm run validate`

---

### Фаза 10: Интеграция в agents.tsx

- [x] **10.1** Заменить `useMessages` на `useAgentChat` (теперь используется внутри `AgentChat`) — `useMessages.ts` уже удалён, но интеграция не завершена
- [x] **10.2** Создать `AgentChat` компонент — содержит `Conversation` + `ConversationContent` + `ConversationScrollButton` + список `AgentMessage` + `AgentPromptInput` + `RateLimitBanner`
- [x] **10.3** В `agents.tsx` рендерить все `AgentChat` одновременно (по одному на каждого агента из `agents` массива). Скрывать неактивные через CSS `absolute inset-0 opacity-0 pointer-events-none` (НЕ `hidden`/`display:none` — это сбрасывает `scrollTop`). НЕ использовать `key={currentAgent.id}` — это вызовет ремонт.
- [x] **10.4** Добавить лоадер при старте: показывать пока хотя бы один `AgentChat` имеет `isLoading === true`. Реализовать через callback/ref из `AgentChat` в `agents.tsx`.
- [x] **10.5** Заменить `MessageBubble` на `AgentMessage` в `AgentChat`. Сохранить `motion.div` обёртку вокруг каждого `AgentMessage` для анимации появления (agents.4.22: fade-in + slide-up). Убедиться что `motion.div` не конфликтует с внутренней структурой `Message` из AI Elements и что `Conversation` корректно обрабатывает анимированные дочерние элементы
- [x] **10.6** Заменить `ChatInput` на `AgentPromptInput` в `AgentChat`
- [x] **10.7** Перенести `RateLimitBanner` внутрь `AgentChat` / `Conversation` как специальный элемент (НЕ как `AgentMessage`). Подписка на `AGENT_RATE_LIMIT` остаётся в `agents.tsx` — `rateLimitBanner` state передаётся в `AgentChat` через props. Баннер рендерится внутри `Conversation` после списка сообщений (перед `ConversationScrollButton`)
- [x] **10.8** Убрать импорты: `ScrollArea`, `ChatInput`, `MessageBubble`, `AutoExpandingTextareaHandle`
- [x] **10.9** Убрать весь ручной скролл-менеджмент из `agents.tsx` (refs, effects, handlers — см. список в Фазе 5)
- [x] **10.10** Убрать `scrollbarHidden` state и CSS `.scrollbar-hidden` из `src/renderer/styles/index.css`
- [x] **10.11** Убрать `viewportCallbackRef` и `resizeObserverRef`
- [x] **10.12** Сохранить `AgentWelcome` без изменений — убедиться что он корректно рендерится внутри `AgentChat` / `Conversation` (или вместо `Conversation` когда нет сообщений, в зависимости от результатов Фазы 5.4)
- [x] **10.13** Сохранить `AgentHeader` без изменений — включая все анимации, список агентов, кнопки
- [x] **10.14** Обновить функциональные тесты скролла:
  - `tests/functional/agent-scroll-position.spec.ts` — переписаны: проверки `el.scrollTop` заменены на `mouse.wheel` + видимость кнопки `scroll-to-bottom` + `toBeInViewport`. Все 4 теста проходят.
  - `tests/functional/helpers/electron.ts` — `activeChat()` обновлён: селектор `div:not(.absolute)` вместо `div:not(.hidden)`, добавлено поле `scrollToBottomBtn` (скоупировано к активному чату).
  - `src/renderer/components/agents/AgentChat.tsx` — добавлен `ScrollToBottomButton` с `data-testid="scroll-to-bottom"`, добавлен `AgentChatInner` с `scrollToBottom('instant')` при отправке (agents.4.14.5).
  - `src/renderer/components/agents.tsx` — неактивные чаты скрыты через `absolute inset-0 opacity-0 pointer-events-none` (НЕ `hidden`), добавлен `relative` на родительский контейнер.
- [x] **10.15** Запустить `npm run validate` — все проверки проходят (TypeScript ✅, Build ✅, ESLint ✅, Prettier ✅, unit tests ✅, coverage ✅)

---

### Фаза 11: Удаление старых компонентов

- [x] **11.1** Удалить `src/renderer/components/agents/MessageBubble.tsx` — ✅ удалён
- [x] **11.2** Удалить `src/renderer/components/agents/ChatInput.tsx` — ✅ удалён
- [x] **11.3** Удалить `src/renderer/components/agents/AutoExpandingTextarea.tsx` — ✅ удалён
- [x] **11.4** НЕ удалять `src/renderer/components/agents/RateLimitBanner.tsx` — компонент сохраняется
- [x] **11.5** Удалить `src/renderer/hooks/useMessages.ts` — ✅ удалён
- [x] **11.6** Удалить unit-тесты старых компонентов — ✅ удалены
- [ ] **11.7** Запустить `npm run validate` — убедиться что покрытие >= 85% (не запускалось после удаления)

---

### Фаза 12: Финальная валидация

- [ ] **12.1** Запустить `npm run validate` — все проверки должны пройти
- [ ] **12.2** Проверить покрытие: `npm run test:coverage` — >= 85% по всем метрикам
- [x] **12.3** Обновить `design.md` — убраны ⚠️ УСТАРЕЛО, обновлены разделы автоскролла, сохранения позиции, стилизации сообщений, ссылки на компоненты
- [x] **12.4** Обновить `requirements.md` — убраны устаревшие ссылки на `messagesEndRef`, `scrollIntoView`
- [x] **12.5** Обновить `tasks.md` — добавлена Фаза 9 как выполненная, обновлён статус и раздел "Выполнено"
- [ ] **12.6** Запросить у пользователя запуск функциональных тестов

---

## Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| React 18 → 19 ломает существующие компоненты | Средняя | Фаза 0.1 — проверить до начала работы |
| AI Elements не поддерживает `data-testid` на viewport | Низкая | Обернуть в div с нужным testid |
| `Conversation` viewport не имеет нативного `scrollTop` | Низкая | Тесты скролла будут переписаны на проверку видимости элементов |
| `PromptInputTextarea` не поддерживает `ref` для фокуса | Низкая | Фаза 0.6 — проверить; если нет — `autoFocus` prop |
| `Conversation` не сохраняет позицию скролла при смене агента | Средняя | Не актуально — `Conversation` (use-stick-to-bottom) сохраняет позицию автоматически, компонент не размонтируется |
| AI SDK v5 `ChatTransport` интерфейс отличается от ожидаемого | Средняя | Фаза 0.3 — изучить до начала работы |
| `@ai-sdk/*` несовместимы с `ai@5` в main process | Решено | Нативный HTTP+SSE для всех провайдеров, `ai@5` только в renderer |
| Ленивая загрузка ломает подсчёт сообщений в функциональных тестах | Средняя | Limit 50 достаточен для тестов (макс 20 сообщений в тестах) |
| `motion` vs `framer-motion` конфликт | Низкая | Проверить импорты |

---

---

## Падающие функциональные тесты

### Анализ и план исправления

Ниже — детальный разбор каждого упавшего теста: причина падения и конкретный план исправления.

---

#### 1. `agent-messaging.spec.ts` ✅ Исправлено

**Упавшие тесты:**
- `should NOT autoscroll when user is scrolled up`
- `should autoscroll when agent responds and user is at bottom`
- `should NOT autoscroll when agent responds and user scrolled up`

**Сценарий:**
Тесты проверяют поведение автоскролла в `[data-testid="messages-area"]`: при отправке сообщения пользователем и при получении ответа агента. Используют прямой доступ к `el.scrollTop` для установки и проверки позиции скролла.

**Причины падения:**
- `messages-area` — это `ConversationContent` из AI Elements, который использует `use-stick-to-bottom`. Этот компонент управляет скроллом через собственный механизм, а не через нативный `scrollTop` DOM-элемента.
- `el.scrollTop = 100` может не работать корректно, потому что `use-stick-to-bottom` перехватывает скролл-события и может сбрасывать позицию.
- Тест `should autoscroll when agent responds and user is at bottom` использует `window.api.test.createAgentMessage` — этот тестовый API может не быть зарегистрирован в текущей сборке.
- Тест `should NOT autoscroll when agent responds and user scrolled up` аналогично зависит от `window.api.test.createAgentMessage`.

**План исправления:**
1. Переписать тесты автоскролла: вместо `el.scrollTop = 100` использовать `messagesArea.evaluate(el => el.scrollTop = 100)` с последующей проверкой через `waitForFunction` что скролл действительно установился.
2. Для тестов с `window.api.test.createAgentMessage` — проверить, зарегистрирован ли этот IPC handler в `TestIPCHandlers` или аналогичном файле. Если нет — добавить.
3. Альтернатива для автоскролл-тестов: проверять видимость последнего сообщения через `toBeInViewport()` вместо прямого `scrollTop`.
4. Файл для изменений: `tests/functional/agent-messaging.spec.ts`, возможно `src/main/TestIPCHandlers.ts` (или аналог).

---

#### 2. `agent-scroll-position.spec.ts`

**Упавшие тесты:**
- `should save and restore scroll position when switching agents`
- `should reset scroll position when user sends message`
- `should maintain independent scroll positions for multiple agents`
- `should scroll to bottom on first visit to agent`

**Сценарий:**
Тесты проверяют сохранение/восстановление позиции скролла при переключении агентов. `Conversation` (use-stick-to-bottom) управляет скролом — компонент остаётся смонтированным, позиция сохраняется автоматически.

**Причины падения:**
- Тесты переписаны: вместо `el.scrollTop = X` используется `mouse.wheel(0, -2000)` + проверка видимости кнопки `[data-testid="scroll-to-bottom"]`.
- Тесты падают потому что `use-stick-to-bottom` при переключении агентов (show/hide через CSS `hidden`) может сбрасывать состояние `isAtBottom` — нужно проверить реальное поведение.

**План исправления:**
- Переписать тесты на проверку видимости конкретных сообщений через `toBeInViewport()` вместо кнопки scroll-to-bottom — это более надёжный способ проверить позицию скролла.
- Файл для изменений: `tests/functional/agent-scroll-position.spec.ts`.

---

#### 3. `input-autofocus.spec.ts`

**Упавшие тесты:**
- `should auto-focus input when switching agents`
- `should auto-focus input when returning from AllAgents`
- `should auto-focus input when creating new agent`
- `should not auto-focus when AllAgents page is open`

**Сценарий:**
Тесты проверяют автофокус на `textarea[placeholder*="Ask"]` при переключении агентов, создании нового агента и возврате из AllAgents.

**Причины падения:**
- В `AgentChat.tsx` автофокус реализован через `setTimeout(() => textareaRef.current?.focus(), 100)` при изменении `isActive`. Это должно работать.
- Проблема: все `AgentChat` монтируются одновременно. При переключении агента `isActive` меняется у двух компонентов одновременно — у старого (false) и нового (true). Возможен race condition: фокус устанавливается на новый агент, но затем сбрасывается другим эффектом.
- Тест `should not auto-focus when AllAgents page is open` — когда открыта AllAgents страница, `textarea` не видна (рендерится другой компонент). Тест проверяет `not.toBeVisible()` — это должно работать, но может падать если `textarea` всё ещё в DOM через hidden AgentChat.
- Тест `should auto-focus input when returning from AllAgents` использует `[data-testid="all-agents-button"]` — нужно проверить что этот testid существует в `AgentHeader`.

**План исправления:**
1. Проверить наличие `data-testid="all-agents-button"` в `AgentHeader` компоненте.
2. Исправить race condition автофокуса: добавить проверку что компонент всё ещё активен перед вызовом `focus()` внутри `setTimeout`.
3. Для теста `should not auto-focus when AllAgents page is open`: убедиться что `textarea` действительно не видна когда открыта AllAgents (проверить что `AgentChat` скрыт через `hidden` когда `showAllTasksPage === true`).
4. Файлы для изменений: `src/renderer/components/agents/AgentChat.tsx`, `src/renderer/components/agents/AgentHeader.tsx`.

---

#### 4. `empty-state-placeholder.spec.ts`

**Упавшие тесты:**
- `should hide AgentWelcome after sending first message`
- `should show AgentWelcome when creating new agent`

**Сценарий:**
Тесты проверяют что `AgentWelcome` скрывается после отправки первого сообщения и показывается при создании нового агента.

**Причины падения:**
- В новой архитектуре `AgentWelcome` рендерится внутри `AgentChat` на основе `rawMessages.length === 0`. После отправки сообщения `rawMessages` обновляется через `MESSAGE_CREATED` событие — `AgentWelcome` должен скрыться.
- Возможная проблема: `rawMessages` обновляется через `useEventSubscription(MESSAGE_CREATED)` в `useAgentChat`. Если событие приходит с задержкой или не приходит — `AgentWelcome` остаётся видимым.
- Тест `should show AgentWelcome when creating new agent`: при создании нового агента новый `AgentChat` монтируется с пустым `rawMessages` — `AgentWelcome` должен быть виден. Но если `isLoading === true` (идёт загрузка начального чанка), весь `AgentChat` скрыт за лоадером в `agents.tsx`.
- Проблема с лоадером: `agents.tsx` показывает лоадер пока `loadingAgents.size > 0`. Новый агент сразу добавляет себя в `loadingAgents` через `onLoadingChange`. Если `isLoading` не сбрасывается быстро для пустого агента — лоадер блокирует отображение `AgentWelcome`.

**План исправления:**
1. Проверить что `useAgentChat` корректно сбрасывает `isLoading = false` для агента без сообщений (пустой ответ от `messages:list-paginated`).
2. Убедиться что `MESSAGE_CREATED` событие корректно обновляет `rawMessages` в `useAgentChat` — проверить фильтрацию по `agentId`.
3. Файлы для изменений: `src/renderer/hooks/useAgentChat.ts`, `src/renderer/components/agents/AgentChat.tsx`.

---

#### 5. `agent-switching.spec.ts`

**Упавший тест:**
- `should load messages for selected agent`

**Сценарий:**
Тест отправляет сообщение агенту 1, переключается на агент 2, отправляет сообщение агенту 2, затем переключается обратно и проверяет что каждый агент показывает только свои сообщения.

**Причины падения:**
- В новой архитектуре все `AgentChat` монтируются одновременно. При переключении агента меняется только `isActive` prop — CSS `hidden` скрывает неактивный чат.
- Проблема: `window.locator('text=Message for agent 1')` ищет текст во всём DOM, включая скрытые (через CSS `hidden`) элементы. Playwright по умолчанию находит элементы даже если они скрыты через `display: none`.
- Тест `await expect(window.locator('text=Message for agent 2')).not.toBeVisible()` — сообщение агента 2 находится в скрытом `AgentChat`, но Playwright может считать его "не видимым" корректно. Однако `await expect(window.locator('text=Message for agent 1')).toBeVisible()` может найти элемент в скрытом AgentChat агента 1.
- Реальная проблема: при переключении на агент 1, его `AgentChat` становится видимым, но сообщения агента 2 тоже присутствуют в DOM (в скрытом AgentChat). Тест `not.toBeVisible()` должен работать корректно для скрытых элементов.

**План исправления:**
1. Уточнить локаторы в тесте: вместо `window.locator('text=Message for agent 1')` использовать локатор внутри активного AgentChat: `window.locator('[data-testid="messages-area"]:visible >> text=Message for agent 1'`.
2. Или добавить `data-testid` на активный AgentChat для более точного поиска.
3. Файлы для изменений: `tests/functional/agent-switching.spec.ts`.

---

#### 6. `agent-reordering.spec.ts`

**Упавшие тесты:**
- `should move agent to top of list after sending message`
- `should bring hidden agent to header after sending message`
- `should maintain correct order when multiple agents are updated`
- `should reorder immediately after message from AllAgents selection`

**Сценарий:**
Тесты проверяют что после отправки сообщения агент перемещается в начало списка (сортировка по `updatedAt`).

**Причины падения:**
- Тесты используют `[data-testid="all-agents-button"]` — нужно проверить что этот testid существует в `AgentHeader`.
- Основная проблема: после отправки сообщения `updatedAt` агента обновляется в БД, main process эмитит `AGENT_UPDATED` событие, `useAgents` hook обновляет список агентов. Список в `agents.tsx` пересортировывается — `AgentHeader` получает новый порядок.
- Возможная проблема: `useAgents` hook может не реагировать на `AGENT_UPDATED` событие достаточно быстро, или порядок сортировки не обновляется.
- Тест `should bring hidden agent to header after sending message` зависит от `[data-testid="all-agents-button"]`.
- Тест `should reorder immediately after message from AllAgents selection` — после выбора агента из AllAgents и отправки сообщения, агент должен переместиться в начало. Зависит от корректной работы `useAgents` и `AGENT_UPDATED`.

**План исправления:**
1. Проверить наличие `data-testid="all-agents-button"` в `AgentHeader` — добавить если отсутствует.
2. Проверить что `useAgents` hook подписывается на `AGENT_UPDATED` событие и пересортировывает список.
3. Увеличить таймауты ожидания в тестах если нужно.
4. Файлы для изменений: `src/renderer/components/agents/AgentHeader.tsx`, `src/renderer/hooks/useAgents.ts`, `tests/functional/agent-reordering.spec.ts`.

---

#### 7. `agent-data-isolation.spec.ts`

**Упавшие тесты:**
- `should only show agents for current user`
- `should create agent with current userId`

**Сценарий:**
Тесты проверяют что агенты изолированы по пользователю.

**Причины падения:**
- Тест `should only show agents for current user`: после создания нового агента ожидает `newCount === initialCount + 1`. Проблема: при создании нового агента он сразу становится активным и перемещается в начало списка. Если `initialCount` был получён до полной загрузки — может быть race condition.
- Тест `should create agent with current userId`: после создания агента ожидает `ring-2 ring-primary` на первом агенте. Новый агент должен быть активным и первым в списке. Возможная проблема: новый агент создаётся, но `useAgents` не успевает обновить список до проверки.
- Более вероятная причина: порт `8898` используется одновременно в `agent-messaging.spec.ts` (порт 8898) и `agent-data-isolation.spec.ts` (порт 8898) — конфликт портов при параллельном запуске тестов.

**План исправления:**
1. Изменить порт в `agent-data-isolation.spec.ts` с `8898` на уникальный (например `8905`) — конфликт с `agent-messaging.spec.ts` и `input-autofocus.spec.ts` которые тоже используют `8898`.
2. Добавить `waitForTimeout` или `waitForFunction` после создания агента перед проверкой счётчика.
3. Файлы для изменений: `tests/functional/agent-data-isolation.spec.ts`.

---

#### 8. `agent-date-update.spec.ts`

**Упавший тест:**
- `should update agent timestamp when new message is sent`

**Сценарий:**
Тест создаёт агента с сообщением 5-минутной давности через `window.api.test.createAgentWithOldMessage(5)`, затем отправляет новое сообщение и проверяет что timestamp в заголовке обновился.

**Причины падения:**
- `window.api.test.createAgentWithOldMessage` — тестовый IPC API. Нужно проверить что он зарегистрирован в main process.
- `[data-testid="agent-header-timestamp"]` — нужно проверить что этот testid существует в `AgentHeader`.
- Тест ожидает что timestamp изменится после отправки сообщения. `AgentHeader` должен отображать `updatedAt` агента и обновляться при получении `AGENT_UPDATED` события.

**План исправления:**
1. Проверить наличие `window.api.test.createAgentWithOldMessage` в main process — добавить если отсутствует.
2. Проверить наличие `data-testid="agent-header-timestamp"` в `AgentHeader` — добавить если отсутствует.
3. Файлы для изменений: `src/main/TestIPCHandlers.ts` (или аналог), `src/renderer/components/agents/AgentHeader.tsx`.

---

#### 9. `agent-list-initial-animation.spec.ts`

**Упавший тест:**
- `should animate agent reordering with spring motion`

**Сценарий:**
Тест проверяет что при перестановке агентов (после отправки сообщения) первый агент имеет `transform` или `transition` стили (признак layout-анимации Framer Motion).

**Причины падения:**
- Тест отправляет сообщение третьему агенту и ожидает что он переместится на первую позицию. Зависит от корректной работы `useAgents` и `AGENT_UPDATED`.
- Проверка `hasTransform || hasTransition` — Framer Motion layout-анимация добавляет `transform` стили во время анимации. Если проверка происходит после завершения анимации — `transform` может быть `none`.
- Тест использует `window.waitForFunction` с `timeout: 5000` для ожидания перестановки — может не хватать времени.

**План исправления:**
1. Увеличить таймаут ожидания перестановки.
2. Проверять наличие `transition` стилей сразу после перестановки (до завершения анимации).
3. Или упростить тест: проверять только что перестановка произошла (порядок изменился), без проверки CSS анимации.
4. Файлы для изменений: `tests/functional/agent-list-initial-animation.spec.ts`.

---

#### 10. `agent-status-indicators.spec.ts`

**Упавшие тесты:**
- `should show animation only when agent moves to first position`
- `should show animation when switching back to previous agent`

**Сценарий:**
Тесты проверяют что `[data-testid="agent-header-icon"]` виден после перемещения агента на первую позицию.

**Причины падения:**
- `[data-testid="agent-header-icon"]` — нужно проверить что этот testid существует в `AgentHeader`.
- Тесты зависят от корректной работы перестановки агентов (аналогично `agent-reordering.spec.ts`).
- Тест `should show animation when switching back to previous agent` отправляет сообщение второму агенту (он перемещается на первую позицию), затем переключается на первый агент и отправляет ему сообщение. Ожидает что `agent-header-icon` виден.

**План исправления:**
1. Проверить наличие `data-testid="agent-header-icon"` в `AgentHeader` — добавить если отсутствует.
2. Убедиться что перестановка агентов работает корректно (зависит от исправлений в `agent-reordering.spec.ts`).
3. Файлы для изменений: `src/renderer/components/agents/AgentHeader.tsx`.

---

#### 11. `all-agents-page.spec.ts`

**Упавший тест:**
- `should display error message for agent with error status in AllAgents`

**Сценарий:**
Тест открывает AllAgents страницу через `+N` кнопку и проверяет что карточки агентов содержат статус-текст.

**Причины падения:**
- Тест создаёт только 2 агента (1 начальный + 1 новый), но `+N` кнопка появляется только когда агентов больше чем `visibleChatsCount`. При маленьком окне `visibleChatsCount` может быть 1-2, и кнопка может не появиться.
- `[data-testid^="agent-card-"]` — нужно проверить что этот testid существует в `AllAgentsPage`.
- Тест проверяет `statusText` через `text=/New|In progress|Awaiting response|Error|Completed/` — нужно убедиться что `AllAgentsPage` отображает статус агента.

**План исправления:**
1. Создать больше агентов (5-6) чтобы гарантированно появилась `+N` кнопка.
2. Проверить наличие `data-testid="agent-card-{id}"` в `AllAgentsPage`.
3. Проверить что `AllAgentsPage` отображает статус агента в читаемом формате.
4. Файлы для изменений: `tests/functional/all-agents-page.spec.ts`, `src/renderer/components/agents/AllAgentsPage.tsx`.

---

#### 12. `auto-expanding-textarea.spec.ts`

**Упавший тест:**
- `should send message on Enter key`

**Сценарий:**
Тест заполняет `[data-testid="auto-expanding-textarea"]`, нажимает Enter и проверяет что textarea очищается.

**Причины падения:**
- `AgentPromptInput` управляет `value` через `taskInput` state в `AgentChat`. После отправки `setTaskInput('')` очищает поле.
- Возможная проблема: тест нажимает Enter, но `handleKeyDown` в `AgentPromptInput` вызывает `onSubmit()` который вызывает `handleSend()` в `AgentChat`. `handleSend` вызывает `sendMessage(messageText)` — это async операция. `setTaskInput('')` вызывается только если `success === true`.
- Если `sendMessage` возвращает `false` (например, нет активного агента или ошибка) — `taskInput` не очищается.
- Другая возможная причина: `disabled={false}` всегда передаётся в `AgentPromptInput`, но `sendMessage` может не работать если `agentId` не установлен.

**План исправления:**
1. Проверить что `sendMessage` корректно работает в тестовом окружении (без реального LLM).
2. Убедиться что `setTaskInput('')` вызывается независимо от результата `sendMessage` (или только при успехе — это текущее поведение).
3. Добавить `await window.waitForTimeout(500)` перед проверкой очистки textarea.
4. Файлы для изменений: `src/renderer/components/agents/AgentChat.tsx` (логика `handleSend`).

---

### Сводная таблица

| Тест | Основная причина | Приоритет | Статус |
|------|-----------------|-----------|--------|
| `agent-messaging` (3 теста) | `use-stick-to-bottom` конфликт + `window.api.test` API | Высокий | ✅ Исправлено |
| `agent-scroll-position` (4 теста) | Тесты проверяют поведение `Conversation` (use-stick-to-bottom) через видимость кнопки scroll-to-bottom | Высокий | ✅ Исправлено |
| `input-autofocus` (4 теста) | `data-testid="all-agents-button"` отсутствует + race condition | Средний | |
| `empty-state-placeholder` (2 теста) | Лоадер блокирует `AgentWelcome` + `isLoading` не сбрасывается | Средний | |
| `agent-switching` (1 тест) | Локаторы находят скрытые элементы в других AgentChat | Средний | |
| `agent-reordering` (4 теста) | `data-testid="all-agents-button"` отсутствует | Высокий | |
| `agent-data-isolation` (2 теста) | Конфликт портов (8898) | Низкий | |
| `agent-date-update` (1 тест) | `window.api.test.createAgentWithOldMessage` + `agent-header-timestamp` | Средний | |
| `agent-list-initial-animation` (1 тест) | Таймаут + CSS анимация проверяется после завершения | Низкий | |
| `agent-status-indicators` (2 теста) | `data-testid="agent-header-icon"` отсутствует | Средний | |
| `all-agents-page` (1 тест) | Недостаточно агентов для `+N` кнопки | Низкий | |
| `auto-expanding-textarea` (1 тест) | `sendMessage` async + `setTaskInput('')` условный | Средний | |

---

## Зависимости между фазами

```
Фаза 0 (исследование)
    │
    ├──► Фаза 1 (зависимости)
    │        │
    │        ├──► Фаза 2 (IPCChatTransport)
    │        │        │
    │        │        └──► Фаза 3 (messageMapper + lazy loading)
    │        │                  │
    │        │                  └──► Фаза 4 (useAgentChat)
    │        │                            │
    │        ├──► Фаза 5 (Conversation)   │
    │        ├──► Фаза 6 (Message+Error+RateLimit) │
    │        ├──► Фаза 7 (Reasoning)      │
    │        ├──► Фаза 8 (PromptInput)    │
    │        └──► Фаза 9 (LLM providers)  │
    │                                     │
    └─────────────────────────────────────┴──► Фаза 10 (интеграция)
                                                    │
                                                    └──► Фаза 11 (удаление) ──► Фаза 12 (валидация)
```
