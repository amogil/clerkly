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
| `ScrollArea` + ручной скролл-менеджмент | `Conversation` + `ConversationContent` + `ConversationScrollButton` (AI Elements) |
| `useMessages` hook | `useAgentChat` (обёртка над `useChat` с кастомным transport) |
| `AnthropicProvider.ts` / `OpenAIProvider.ts` / `GoogleProvider.ts` | AI SDK `streamText` + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` |

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

2. **agents.4.14 (сохранение позиции скролла)** — весь ручной механизм (`scrollPositions` Map, `restoredAgents` Set) заменяется. Если `Conversation` не поддерживает сохранение позиции при смене агента — реализовать через хранение ID последнего видимого сообщения и `scrollIntoView` при возврате.

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
  - `streamText({ model, messages, onChunk })` возвращает `StreamTextResult` с `fullStream` (AsyncIterable) и `text` (Promise)
  - Чанки reasoning: `{ type: 'reasoning', textDelta: string }` — заменяет ручной SSE-парсинг
  - Чанки текста: `{ type: 'text-delta', textDelta: string }` — для накопления content
  - Ошибки: `{ type: 'error', error: unknown }` — для обработки 401/429/5xx
  - Structured output: `generateObject({ schema })` или `streamObject` — но текущий подход (JSON schema в response_format) работает через `streamText` с накоплением JSON
  - **Решение для Phase 9:** Заменить ручной fetch+SSE на `streamText` с `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`. Сохранить интерфейс `ILLMProvider.chat()` без изменений — только внутренняя реализация меняется.
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

- [x] **2.1** Создать `src/renderer/lib/IPCChatTransport.ts`
- [x] **2.2** Реализовать интерфейс `ChatTransport`:
  - Метод `sendMessages({ messages, abortSignal })` — вызывает `window.api.messages.create(agentId, 'user', payload)` через IPC
  - Возвращает `ReadableStream<UIMessageStreamPart>` — поток обновлений для `useChat`
- [x] **2.3** Реализовать конвертацию IPC-событий в UI message stream:
  - `MESSAGE_CREATED` (kind: llm) → `{ type: 'text-start' }`
  - `MESSAGE_LLM_REASONING_UPDATED` → `{ type: 'reasoning-delta', delta }`
  - `MESSAGE_UPDATED` с `action` → `{ type: 'text-delta', delta: action.content }` + `{ type: 'finish' }`
  - `MESSAGE_CREATED` (kind: error) → `{ type: 'error', error }`
- [x] **2.4** Реализовать отмену через `abortSignal` — при abort отписаться от событий и закрыть stream
- [x] **2.5** Реализовать сценарий прерывания при новом сообщении (llm-integration.8):
  - КОГДА пользователь отправляет новое сообщение пока агент стримит, `useChat` вызывает `stop()` (abort текущего stream) и затем `sendMessages()` с новым сообщением
  - `IPCChatTransport.sendMessages()` при получении `abortSignal` уже в aborted состоянии — должен корректно обработать (не подписываться на события, вернуть пустой/закрытый stream)
  - Main process сам обрабатывает прерывание: `MainPipeline` отменяет текущий запрос, помечает llm `interrupted: true`, создаёт новый user message и запускает новый `run()`
  - `IPCChatTransport` просто слушает события — прерванные сообщения придут как `MESSAGE_UPDATED` с `hidden: true` и будут отфильтрованы
  - **Ключевой момент:** Проверить как `useChat` обрабатывает ситуацию когда `stop()` вызван и сразу после — новый `sendMessages()`. Если `useChat` не поддерживает это нативно — может потребоваться `key` remount или `setMessages()` для очистки состояния
- [x] **2.6** Написать unit-тесты для `IPCChatTransport`
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

**Проблема:** Текущий `useMessages` загружает все сообщения агента одним запросом. При длинной истории (100+ сообщений) это замедляет переключение между агентами.

**Решение:** Пагинация с загрузкой последних N сообщений + подгрузка при скролле вверх.

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

4. **В `Conversation`:**
   - При скролле к верхней границе вызывает `loadMore()`
   - `loadMore()` загружает следующие 50 сообщений через `messages:list-paginated` с `beforeId = oldestMessageId`
   - Новые (старые) сообщения prepend-ятся в начало списка
   - Позиция скролла сохраняется (не прыгает вверх при подгрузке)

- [x] **3.1** Создать `src/renderer/lib/messageMapper.ts` с функциями:
  - `toUIMessages(messages: MessageSnapshot[]): UIMessage[]`
  - `toUIMessage(msg: MessageSnapshot): UIMessage | null` (null для hidden)
- [x] **3.2** Реализовать маппинг типов:
  - `kind: 'user'` → `{ role: 'user', parts: [{ type: 'text', text: data.text }] }`
  - `kind: 'llm'` с `action` → `{ role: 'assistant', parts: [{ type: 'reasoning', reasoning: reasoning.text }, { type: 'text', text: action.content }] }`
  - `kind: 'llm'` без `action` (стриминг) → `{ role: 'assistant', parts: [] }` (пустой, будет заполняться через stream)
  - `kind: 'error'` → `{ role: 'assistant', parts: [{ type: 'text', text: error.message }], metadata: { isError: true, errorMessage: error.message, actionLink: error.action_link } }`
  - Фильтрация: `hidden === true` → вернуть null (не включать)
- [x] **3.3** Добавить IPC endpoint `messages:list-paginated` в main process:
  - `MessagesRepository.listByAgentPaginated(agentId, limit, beforeId?)`
  - `MessageManager.listPaginated(agentId, limit, beforeId?)`
  - `AgentIPCHandlers` — зарегистрировать `messages:list-paginated`
  - Preload API — добавить `messages.listPaginated(agentId, limit, beforeId?)`
- [x] **3.4** Написать unit-тесты для `messageMapper`
- [x] **3.5** Написать property-based тесты для `messageMapper`:
  - инвариант: количество UIMessages ≤ количества MessageSnapshots
  - инвариант: user messages всегда role: 'user'
  - инвариант: hidden сообщения никогда не попадают в результат
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
- `initialMessages` — загружаются асинхронно через `messages:list-paginated`, поэтому нужен двухфазный mount:
  1. Сначала `useChat` создаётся с пустым `initialMessages`
  2. После загрузки истории — вызвать `setMessages(loaded)` (если `useChat` поддерживает) или пересоздать через `key`

**Интерфейс:**
```typescript
interface UseAgentChatResult {
  messages: UIMessage[];           // AI SDK формат
  rawMessages: MessageSnapshot[];  // Оригинальный формат (для data-testid, metadata)
  isLoading: boolean;
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
- [x] **4.3** Реализовать загрузку начальной истории (последние 50 сообщений) через `messages:list-paginated` + `toUIMessages()`
- [x] **4.4** Реализовать `loadMore()` — подгрузка старых сообщений при скролле вверх
- [x] **4.5** Реализовать синхронизацию `rawMessages` с `UIMessage[]` (для доступа к kind, metadata)
- [x] **4.6** Реализовать обработку `MESSAGE_UPDATED` с `hidden: true` — удалять сообщение из `rawMessages` и вызывать `setMessages()` для `useChat` (нужно для Cancel rate limit и interrupted messages)
- [x] **4.7** Написать unit-тесты для `useAgentChat`
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

**Контекст:** `Conversation` из AI Elements управляет скроллом автоматически (автоскролл при новых сообщениях, кнопка "scroll to bottom"). Но сохранение позиции при смене агента — скорее всего нужно реализовать самостоятельно поверх `Conversation`.

**AgentWelcome внутри Conversation:**
- Сейчас `AgentWelcome` рендерится внутри `ScrollArea` с выравниванием `min-h-full flex flex-col justify-end` (agents.4.20).
- После миграции `AgentWelcome` будет рендериться внутри `Conversation` / `ConversationContent`.
- Нужно убедиться что `Conversation` поддерживает рендер произвольного контента (не только сообщений) и что выравнивание `justify-end` работает корректно.
- Если `Conversation` ожидает только `Message` компоненты — `AgentWelcome` может потребовать обёртки или рендера вне `ConversationContent`.

- [x] **5.1** Изучить API `Conversation`, `ConversationContent`, `ConversationScrollButton`
- [x] **5.2** Интегрировать `Conversation` в `agents.tsx` вместо `ScrollArea`
- [x] **5.3** Добавить `data-testid="messages-area"` на контейнер сообщений (для функциональных тестов)
- [x] **5.4** Убедиться что `AgentWelcome` корректно рендерится внутри `Conversation` с выравниванием `justify-end` (agents.4.20). Если `Conversation` не поддерживает произвольный контент — рендерить `AgentWelcome` вне `ConversationContent` (условно: показывать вместо `Conversation` когда нет сообщений)
- [x] **5.5** Реализовать сохранение/восстановление позиции скролла при смене агента (если `Conversation` не поддерживает из коробки). `key={currentAgent.id}` на `Conversation` — remount при смене агента, скролл к низу автоматически
- [x] **5.6** Реализовать подгрузку при скролле вверх — вызов `loadMore()` из `useAgentChat` при достижении верхней границы
- [x] **5.7** Написать unit-тесты
- [x] **5.8** Обновить `design.md`

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

- [x] **6.1** Создать `src/renderer/components/agents/AgentMessage.tsx` с использованием AI Elements `Message`:
  - User: `<Message>` с кастомными стилями `rounded-2xl bg-secondary/70 border border-border`; `data-testid="message-user"`
  - LLM: `<Message>` + `<Reasoning>` + action content; `data-testid="message-llm"`, `data-testid="message-llm-action"`, `data-testid="message-llm-reasoning"`
  - Error: `<Message>` с красными стилями `border-red-500/30 bg-red-500/10 text-red-500`; `data-testid="message-error"`, `data-testid="message-error-action-link"`
  - Loading: три анимированных точки (bounce) когда llm без action
  - Avatar: `<Logo>` перед первым llm/error в последовательности
- [x] **6.2** Обновить `RateLimitBanner` — сохранить как отдельный компонент (не AgentMessage):
  - Сохранить жёлтый стиль: `bg-yellow-50 border-yellow-200 text-yellow-800`
  - Сохранить countdown логику (useState + setTimeout)
  - Сохранить IPC вызовы: `window.api.messages.retryLast()`, `window.api.messages.cancelRetry()`
  - Сохранить `data-testid="rate-limit-banner"` и `data-testid="rate-limit-cancel"`
  - Убедиться что компонент корректно рендерится внутри `Conversation`
- [x] **6.3** Написать unit-тесты для `AgentMessage` (все виды: user, llm, error)
- [x] **6.4** Обновить `design.md`

---

### Фаза 7: Компонент Reasoning

**Контекст:** Текущий reasoning рендерится как простой `<div>` с `text-xs text-muted-foreground italic`. AI Elements `Reasoning` компонент добавляет collapsible UI (кнопка "Show thinking" / "Hide thinking").

- [x] **7.1** Интегрировать `Reasoning` из AI Elements в `AgentMessage` для llm сообщений:
  - `<ReasoningTrigger>` — кнопка toggle
  - `<ReasoningContent>` — текст reasoning; добавить `data-testid="message-llm-reasoning"`
  - Стриминг reasoning работает через `useChat` + `IPCChatTransport` автоматически
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

- [x] **8.1** Создать `src/renderer/components/agents/AgentPromptInput.tsx` с AI Elements:
  - `<PromptInput>` контейнер
  - `<PromptInputTextarea>` — добавить `data-testid="auto-expanding-textarea"`, placeholder "Ask, reply, or give command..."
  - `<PromptInputButton>` — иконка Send, disabled при пустом поле
  - Максимальная высота 50% области чата (agents.4.6)
  - Автофокус при смене агента через ref (agents.4.7.1)
  - Сохранить подсказку "Press Enter to send, Shift+Enter for new line"
- [x] **8.2** Написать unit-тесты
- [x] **8.3** Обновить `design.md`

---

### Фаза 9: Миграция LLM провайдеров (main process)

Заменяет ручной SSE-парсинг в провайдерах на AI SDK `streamText`.

**Контекст:**
- Текущие провайдеры (`AnthropicProvider.ts`, `OpenAIProvider.ts`, `GoogleProvider.ts`) реализуют `ILLMProvider.chat(messages, options, onChunk): Promise<LLMAction>`
- Они вручную парсят SSE-стримы от API провайдеров
- AI SDK `streamText` делает это автоматически через `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`
- Нужно сохранить интерфейс `ILLMProvider` и обработку ошибок (401, 429, 5xx)

- [ ] **9.1** Обновить `OpenAIProvider.ts` — заменить ручной HTTP + SSE на `streamText` с `@ai-sdk/openai`
- [ ] **9.2** Обновить `AnthropicProvider.ts` — аналогично с `@ai-sdk/anthropic`
- [ ] **9.3** Обновить `GoogleProvider.ts` — аналогично с `@ai-sdk/google`
- [ ] **9.4** Сохранить обработку ошибок: 401 → "Invalid API key", 429 → rate limit с retry-after, 5xx → "Provider unavailable"
- [ ] **9.5** Обновить unit-тесты провайдеров
- [ ] **9.6** Запустить `npm run validate`

---

### Фаза 10: Интеграция в agents.tsx

- [x] **10.1** Заменить `useMessages` на `useAgentChat`
- [x] **10.2** Заменить `ScrollArea` блок на `Conversation` + `ConversationContent` + `ConversationScrollButton`
- [x] **10.3** Заменить `MessageBubble` на `AgentMessage` в списке сообщений. Сохранить `motion.div` обёртку вокруг каждого `AgentMessage` для анимации появления (agents.4.22: fade-in + slide-up). Убедиться что `motion.div` не конфликтует с внутренней структурой `Message` из AI Elements и что `Conversation` корректно обрабатывает анимированные дочерние элементы
- [x] **10.4** Заменить `ChatInput` на `AgentPromptInput`
- [x] **10.5** Перенести `RateLimitBanner` внутрь `Conversation` как специальный элемент (НЕ как `AgentMessage`). Подписка на `AGENT_RATE_LIMIT` остаётся в `agents.tsx` — `rateLimitBanner` state управляет показом баннера. Баннер рендерится внутри `Conversation` после списка сообщений (перед `ConversationScrollButton`)
- [x] **10.6** Убрать импорты: `ScrollArea`, `ChatInput`, `MessageBubble`, `AutoExpandingTextareaHandle`
- [x] **10.7** Убрать весь ручной скролл-менеджмент (refs, effects, handlers — см. список в Фазе 5)
- [x] **10.8** Убрать `scrollbarHidden` state и CSS `.scrollbar-hidden` из `src/renderer/styles/index.css`
- [x] **10.9** Убрать `viewportCallbackRef` и `resizeObserverRef`
- [x] **10.10** Сохранить `AgentWelcome` без изменений — убедиться что он корректно рендерится внутри `Conversation` (или вместо `Conversation` когда нет сообщений, в зависимости от результатов Фазы 5.4)
- [x] **10.11** Сохранить `AgentHeader` без изменений — включая все анимации, список агентов, кнопки
- [ ] **10.12** Обновить функциональные тесты скролла:
  - `tests/functional/agent-scroll-position.spec.ts` — переписать проверки с `el.scrollTop` на проверку видимости сообщений (`toBeVisible`, `toBeInViewport`). Суть тестов сохранить:
    - При переключении агентов позиция скролла восстанавливается (последнее видимое сообщение остаётся видимым)
    - При отправке нового сообщения — автоскролл к низу
    - Каждый агент хранит свою позицию независимо
    - Первый визит к агенту — скролл к последнему сообщению
  - `tests/functional/llm-chat.spec.ts` — обновить тест `should scroll to show llm response after user message`:
    - Вместо `messagesArea.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)` проверять что `message-llm-action` видим в viewport
  - `tests/functional/llm-chat.spec.ts` — обновить тест `should not flicker scrollbar`:
    - Если `Conversation` не использует Radix ScrollArea — тест может стать неактуальным, заменить на проверку что скроллбар не мигает визуально (или удалить если `Conversation` управляет скроллбаром сам)
- [x] **10.13** Запустить `npm run validate`

---

### Фаза 11: Удаление старых компонентов

- [x] **11.1** Удалить `src/renderer/components/agents/MessageBubble.tsx`
- [x] **11.2** Удалить `src/renderer/components/agents/ChatInput.tsx`
- [x] **11.3** Удалить `src/renderer/components/agents/AutoExpandingTextarea.tsx`
- [x] **11.4** НЕ удалять `src/renderer/components/agents/RateLimitBanner.tsx` — компонент сохраняется
- [x] **11.5** Удалить `src/renderer/hooks/useMessages.ts`
- [x] **11.6** Удалить unit-тесты старых компонентов
- [x] **11.7** Запустить `npm run validate` — убедиться что покрытие >= 85%

---

### Фаза 12: Финальная валидация

- [ ] **12.1** Запустить `npm run validate` — все проверки должны пройти
- [ ] **12.2** Проверить покрытие: `npm run test:coverage` — >= 85% по всем метрикам
- [ ] **12.3** Обновить `design.md` — привести в актуальное состояние после миграции:
  - Удалить пометки `⚠️ УСТАРЕЛО` из разделов "Автоскролл", "Сохранение позиции скролла", "Стилизация Сообщений"
  - Заменить содержимое этих разделов на описание новой реализации (`Conversation`, `AgentMessage`, `AgentPromptInput`)
  - Обновить схему архитектуры компонентов (заменить `ScrollArea` → `Conversation`, `MessageBubble` → `AgentMessage`, `ChatInput` → `AgentPromptInput`)
  - Обновить таблицу покрытия требований — добавить `agents.13` с реальными тестами
  - Убрать секцию "AI Elements интеграция (Фаза 9)" как отдельный раздел — влить её содержимое в основные разделы дизайна
- [ ] **12.4** Обновить `requirements.md` — привести в актуальное состояние:
  - Проверить актуальность `agents.4.13.3` (формула `scrollHeight - scrollTop - clientHeight`) — заменить на поведенческое описание если `Conversation` управляет этим сам
  - Проверить актуальность `agents.4.13.5` (`scrollIntoView`) — заменить если `use-stick-to-bottom` использует другой механизм
  - Проверить актуальность `agents.4.13.6` (невидимый `div ref={messagesEndRef}`) — удалить если больше не нужен
  - Добавить функциональные тесты к разделу `agents.13` (ленивая загрузка)
- [ ] **12.5** Обновить `tasks.md` — отметить все задачи выполненными
- [ ] **12.6** Запросить у пользователя запуск функциональных тестов

---

## Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| React 18 → 19 ломает существующие компоненты | Средняя | Фаза 0.1 — проверить до начала работы |
| AI Elements не поддерживает `data-testid` на viewport | Низкая | Обернуть в div с нужным testid |
| `Conversation` viewport не имеет нативного `scrollTop` | Низкая | Тесты скролла будут переписаны на проверку видимости элементов |
| `PromptInputTextarea` не поддерживает `ref` для фокуса | Низкая | Фаза 0.6 — проверить; если нет — `autoFocus` prop |
| `Conversation` не сохраняет позицию скролла при смене агента | Средняя | Фаза 5.4 — реализовать через ID последнего видимого сообщения |
| AI SDK v5 `ChatTransport` интерфейс отличается от ожидаемого | Средняя | Фаза 0.3 — изучить до начала работы |
| `streamText` не поддерживает structured output (LLMAction) | Средняя | Фаза 0.8 — изучить; если нет — `generateObject` |
| Ленивая загрузка ломает подсчёт сообщений в функциональных тестах | Средняя | Limit 50 достаточен для тестов (макс 20 сообщений в тестах) |
| `motion` vs `framer-motion` конфликт | Низкая | Проверить импорты |

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
