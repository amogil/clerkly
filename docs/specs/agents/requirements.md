# Документ Требований: Agents

## Введение

Данный документ описывает требования к интерфейсу "Agents" - основному экрану для взаимодействия с AI-агентами в приложении Clerkly. Компонент предоставляет список агентов (каждый чат - отдельный агент), интерфейс чата для общения с выбранным агентом, и навигацию между различными агентами.
Документ `agents` фиксирует только поведение интерфейса и отображение persisted данных. Логика взаимодействия с моделью (оркестрация LLM, tool-loop, retry/repair, провайдерные контракты) определяется исключительно в `docs/specs/llm-integration/*`.

## Глоссарий

- **Agent** - AI-агент, представленный отдельным чатом
- **Agent Status** - Вычисляемый статус агента (new, in-progress, awaiting-response, error, completed). Определяется динамически из последних сообщений, НЕ хранится в БД
- **Active Agent** - Текущий выбранный агент, чат которого отображается
- **Agents List** - Горизонтальный список иконок агентов в хедере
- **All Agents** - Страница со всеми агентами для просмотра истории
- **Message** - Сообщение в чате. Хранится в таблице messages с payload_json
- **Message Avatar** - Визуальный маркер сообщения агента в чате (для reasoning отображается в заголовке reasoning-блока)
- **updatedAt** - Время последнего обновления агента (последнее сообщение в чате)
- **agentId** - Уникальный идентификатор агента (TEXT, 10-символьная alphanumeric строка)

### Визуальные Компоненты

Есть два типа анимации:
1. Само лого анимированное (CSS-анимация узлов и линий)
2. JS-анимация появления элементов списка (opacity/scale), без анимации пересортировки

**1. Application Logo (Логотип приложения)**
1. Логотип Clerkly для брендинга
2. Расположение: страница логина, пустой стейт чата
3. Варианты: без анимации (логин) / с CSS-анимацией узлов (пустой чат агента)

**2. Active Agent Icon (Иконка активного агента)**
1. Иконка активного агента в левой части хедера
2. Визуально дублирует Agent List Icon активного агента

**3. Agent List Icon (Иконка агента в списке)**
1. Иконка агента в списках
2. Два контекста: Agents List / All Agents
3. Сама иконка использует CSS-анимацию
4. Пересортировка в Agents List происходит без JS-анимации перемещения

**4. Message Avatar (Иконка сообщения агента)**
1. Визуальный маркер сообщения агента в чате
2. Для `kind: llm` с reasoning отображается в заголовке reasoning-блока
3. Использует CSS-анимацию узлов и линий в едином стиле с Application Logo

## Архитектурный Принцип

**Важно:** Каждый чат представляет отдельного AI-агента. Это не один агент с множеством задач, а множество независимых агентов, каждый со своим чатом и контекстом.

## Требования

### 1. Просмотр списка агентов

**ID:** agents.1

**User Story:** Как пользователь, я хочу видеть список всех моих агентов (чатов), чтобы быстро переключаться между разными агентами и разговорами.

#### Критерии Приемки

1.1. Список агентов ДОЛЖЕН отображаться в хедере компонента в виде горизонтального списка круглых иконок

1.2. Каждый агент ДОЛЖЕН иметь визуальный индикатор статуса (цвет, иконка, анимация)

1.3. Агенты ДОЛЖНЫ отображаться в порядке от новых к старым по времени последнего обновления (updatedAt)

1.4. updatedAt ДОЛЖЕН обновляться при каждом новом сообщении в чате агента

1.4.1. КОГДА updatedAt агента обновляется, ТО агент ДОЛЖЕН автоматически перемещаться в начало списка

1.4.2. Пересортировка ДОЛЖНА происходить в реальном времени при получении события AGENT_UPDATED

1.4.3. Агент, получивший новое сообщение, ДОЛЖЕН появиться в видимой части хедера (если был скрыт)

1.4.4. Переход агента в начало списка ДОЛЖЕН происходить без анимации

1.5. Активный агент ДОЛЖЕН быть визуально выделен кольцом (ring-2 ring-primary)

1.6. Каждая иконка агента ДОЛЖНА иметь размер 32px (w-8 h-8) с расстоянием 8px (gap-2) между иконками

1.7. Количество видимых агентов ДОЛЖНО автоматически адаптироваться к ширине экрана

1.8. Минимум 1 агент ДОЛЖЕН быть всегда виден

1.9. КОГДА не все агенты помещаются в список, ТО ДОЛЖНА отображаться кнопка "+N" с количеством скрытых агентов

#### Функциональные Тесты

- `tests/functional/agent-list-responsive.spec.ts` - "should adapt visible agents count to window width"
- `tests/functional/agent-reordering.spec.ts` - "should maintain correct order when multiple agents are updated"
- `tests/functional/agent-reordering.spec.ts` - "should move agent to top of list after sending message"
- `tests/functional/agent-reordering.spec.ts` - "should bring hidden agent to header after sending message"
- `tests/functional/agent-reordering.spec.ts` - "should reorder immediately after message from AllAgents selection"
- `tests/functional/agent-list-responsive.spec.ts` - "should show +N button for hidden agents"

### 2. Создание нового агента

**ID:** agents.2

**User Story:** Как пользователь, я хочу создать нового агента (новый чат), чтобы начать новый разговор с новым агентом.

#### Критерии Приемки

2.1. Кнопка "New chat" ДОЛЖНА быть всегда видна в хедере как первый элемент списка

2.2. Кнопка "New chat" ДОЛЖНА иметь светло-голубой цвет (bg-sky-400)

2.3. КОГДА пользователь кликает на "New chat", ТО ДОЛЖЕН создаваться новый агент с:
   - Уникальным agentId (10-символьная alphanumeric строка)
   - Названием "New Agent"
   - Текущим временем в createdAt и updatedAt

2.4. Новый агент ДОЛЖЕН автоматически становиться активным

2.5. Новый агент ДОЛЖЕН добавляться в начало списка агентов

2.6. Интерфейс чата ДОЛЖЕН очищаться для нового разговора

2.7. **AUTO-CREATE FIRST AGENT:** У пользователя ВСЕГДА ДОЛЖЕН быть хотя бы один агент

2.8. КОГДА список агентов пуст (первый вход, удаление всех агентов), ТО ДОЛЖЕН автоматически создаваться новый агент с названием "New Agent"

2.9. Автоматически созданный агент ДОЛЖЕН иметь пустую историю сообщений

2.10. Интерфейс Agents ДОЛЖЕН всегда показывать стандартный UI (хедер, список агентов, область чата, поле ввода)

2.11. Empty state ("No agents yet") НЕ ДОЛЖЕН показываться никогда

#### Функциональные Тесты

- `tests/functional/agents-always-one.spec.ts` - "should auto-create first agent for new user after login"
- `tests/functional/agents-always-one.spec.ts` - "should auto-create agent when last agent is archived"
- `tests/functional/agents-always-one.spec.ts` - "should never show empty state UI"
- `tests/functional/agents-always-one.spec.ts` - "should hide startup loading state and keep UI visible after startup settles"

### 3. Переключение между агентами

**ID:** agents.3

**User Story:** Как пользователь, я хочу переключаться между существующими агентами, чтобы продолжить предыдущие разговоры с разными агентами.

#### Критерии Приемки

3.1. КОГДА пользователь кликает по иконке агента в списке, ТО этот агент ДОЛЖЕН становиться активным

3.2. История сообщений ДОЛЖНА загружаться для выбранного агента

3.3. Визуальный индикатор (кольцо выделения) ДОЛЖЕН показывать активного агента

3.4. Переключение ДОЛЖНО происходить мгновенно (< 100ms)

3.5. Каждый агент ДОЛЖЕН иметь кастомный тултип с полной информацией (название, статус) при наведении

3.5.1. Тултип ДОЛЖЕН появляться снизу иконки агента с задержкой 2 секунды после наведения

3.5.2. Тултип ДОЛЖЕН скрываться мгновенно при уходе курсора

3.5.3. Тултип НЕ ДОЛЖЕН использовать нативный атрибут `title` (чтобы избежать двойного тултипа)

#### Функциональные Тесты

- `tests/functional/agent-switching.spec.ts` - "should switch active agent on click"
- `tests/functional/agent-switching.spec.ts` - "should load messages for selected agent"

### 4. Общение с агентом

**ID:** agents.4

**User Story:** Как пользователь, я хочу отправлять сообщения выбранному агенту и получать ответы, чтобы решать свои задачи с помощью AI.

#### Критерии Приемки

4.1. Поле ввода ДОЛЖНО быть доступно для ввода текста с placeholder "Ask, reply, or give command..."

4.2. Состояние и активность кнопки в поле ввода ДОЛЖНЫ определяться по двум факторам:
   - статус активного агента (`in-progress` или любой другой)
   - наличие текста в поле ввода

4.2.1. КОГДА статус активного агента равен `in-progress`, кнопка ДОЛЖНА работать в режиме остановки (`stop generation`) и ДОЛЖНА быть активной независимо от текста в поле ввода

4.2.2. КОГДА статус активного агента отличается от `in-progress`, кнопка ДОЛЖНА работать в режиме отправки (`send`) и ДОЛЖНА быть активной только при наличии текста в поле ввода

4.3. КОГДА пользователь нажимает Enter (без Shift), ТО сообщение ДОЛЖНО отправляться

4.4. КОГДА пользователь нажимает Shift+Enter, ТО ДОЛЖНА добавляться новая строка

4.5. Поле ввода ДОЛЖНО автоматически увеличивать высоту при вводе многострочного текста

4.6. Максимальная высота поля ввода ДОЛЖНА быть ограничена 50% высоты области чата

4.7. КОГДА текст превышает максимальную высоту поля ввода, ТО ДОЛЖЕН появляться вертикальный скролл

4.7.1. КОГДА активируется чат агента (выбор агента, возврат из AllAgents, первая загрузка), ТО фокус ввода ДОЛЖЕН автоматически устанавливаться на поле ввода сообщения

4.7.2. Автофокус ДОЛЖЕН срабатывать при:
   - Клике на иконку агента в списке
   - Возврате из AllAgents после выбора агента
   - Первой загрузке приложения (на автоматически созданном агенте)
   - Создании нового агента через кнопку "+"

4.8. Сообщения ДОЛЖНЫ отображаться в хронологическом порядке

4.9. Сообщения пользователя ДОЛЖНЫ отображаться справа с серым полупрозрачным фоном (bg-secondary/70), тонкой серой рамкой (border border-border) и скругленными углами (rounded-2xl)

4.10. Сообщения агента ДОЛЖНЫ отображаться слева без рамки

4.10.1. Сообщения агента ДОЛЖНЫ занимать всю ширину области чата

4.10.2. Диалоги уведомлений в чате агента ДОЛЖНЫ занимать всю ширину области чата

4.10.3. КОГДА `kind:error` содержит действия "Open Settings" и "Retry", ТО UI ДОЛЖЕН отображать обе кнопки действий в диалоге ошибки.

4.10.4. КОГДА отображаются действия "Open Settings" и "Retry", ТО порядок кнопок ДОЛЖЕН быть фиксированным: сначала "Open Settings", затем "Retry".

4.10.4.1. Для действий "Open Settings" и "Retry" визуальные варианты ДОЛЖНЫ быть фиксированными: "Open Settings" — `outline`, "Retry" — `default`.

4.10.5. КОГДА пользователь нажимает "Retry" в диалоге ошибки авторизации/ключа, ТО текущий диалог ошибки ДОЛЖЕН скрываться перед запуском повтора запроса.

4.11. КОГДА сообщение агента (`kind: llm`) содержит блок reasoning, заголовок reasoning-блока ДОЛЖЕН содержать Message Avatar (иконка приложения), текстовый индикатор размышления и управляющий chevron

4.11.1. КОГДА сообщение агента (`kind: llm`) содержит текст ответа модели, блок с ответом ДОЛЖЕН отображаться под reasoning-блоком

4.11.2. КОГДА reasoning-фаза завершена и reasoning-блок автоматически свёрнут, иконка в заголовке reasoning-блока ДОЛЖНА оставаться статичной (`animated=false`)

4.12. Сообщения агента ДОЛЖНЫ поддерживать React-компоненты (для rich content)

4.13. ДОЛЖЕН выполняться автоскролл к последнему сообщению при появлении новых сообщений

4.13.1. КОГДА пользователь находится внизу чата, ТО автоскролл ДОЛЖЕН срабатывать при появлении любого нового сообщения, которое отображается в чате (например, `user`, `llm`, `error`)

4.13.2. КОГДА пользователь находится НЕ внизу чата, ТО автоскролл НЕ ДОЛЖЕН принудительно переводить его вниз (включая отправку сообщения пользователем); вместо этого ДОЛЖНА оставаться доступной кнопка перехода вниз

4.13.3. Автоскролл и управление скроллом ДОЛЖНЫ быть полностью делегированы компоненту `Conversation` (use-stick-to-bottom) — ручное управление через `scrollTop`, `scrollIntoView`, `messagesEndRef` НЕ используется

4.13.4. Скроллбар ДОЛЖЕН быть визуально ненавязчивым и не отвлекать от содержимого

4.13.5. Скроллбар ДОЛЖЕН появляться при взаимодействии пользователя со скроллом (колесо мыши, тачпад, перетаскивание скроллбара)

4.13.6. Скроллбар ДОЛЖЕН автоматически скрываться после окончания скролла

4.14. Позиция скролла ДОЛЖНА сохраняться для каждого агента независимо

4.14.1. КОГДА пользователь переключается на другого агента, ТО чат предыдущего агента ДОЛЖЕН скрываться через CSS (`absolute inset-0 opacity-0 pointer-events-none`), но НЕ размонтироваться — это сохраняет `scrollTop` в DOM

4.14.2. Позиция скролла сохраняется автоматически — компонент `Conversation` каждого агента трекает скролл независимо, т.к. остаётся смонтированным

4.14.3. При переключении обратно к агенту позиция скролла восстанавливается автоматически (компонент не пересоздаётся)

4.14.4. Ручное сохранение/восстановление `scrollTop` НЕ используется

4.14.5. При первой загрузке приложения активный чат ДОЛЖЕН впервые отображаться пользователю только в финальном стартовом состоянии: корректная ширина контента, корректные переносы текста и позиция на последнем сообщении без визуального доскролла

4.14.6. ПОКА активный чат не достиг финального стартового состояния, содержимое чата НЕ ДОЛЖНО показываться пользователю

4.15. КОГДА у агента нет сообщений (новый агент), ТО ДОЛЖЕН отображаться пустой стейт с промпт-подсказками

4.16. Пустой стейт ДОЛЖЕН содержать:
   - Application Logo (размер lg, animated=true)
   - Заголовок "Assign a task to the agent"
   - Подзаголовок "Transcribes meetings, extracts tasks, creates Jira tickets"
   - Сетку из 4 промпт-кнопок (2 колонки на desktop, 1 на mobile)

4.17. Каждая промпт-кнопка ДОЛЖНА содержать:
   - Иконку (Video, CheckSquare, FileText, Calendar)
   - Текст промпта
   - Анимацию при hover (scale 1.02) и tap (scale 0.98)
   - Изменение цвета иконки при hover (primary → primary-foreground)

4.18. Промпты ДОЛЖНЫ быть:
   - "Transcribe my latest meeting"
   - "Extract action items from today's standup"
   - "Create Jira tickets from meeting notes"
   - "Send summary to the team"

4.19. КОГДА пользователь кликает на промпт-кнопку, ТО:
   - Текст промпта ДОЛЖЕН вставляться в поле ввода
   - Сообщение ДОЛЖНО автоматически отправляться через 100ms
   - Пустой стейт ДОЛЖЕН исчезать

4.20. Пустой стейт ДОЛЖЕН быть выровнен по нижнему краю области сообщений:
   - Контейнер сообщений ДОЛЖЕН иметь `min-h-full flex flex-col justify-end`
   - Пустой стейт ДОЛЖЕН прижиматься к нижней части, над полем ввода
   - При появлении первого сообщения выравнивание ДОЛЖНО сохраняться

4.21. Анимации пустого стейта ДОЛЖНЫ быть плавными:
   - Появление: fade in (opacity 0→1) + slide up (y: 20→0) за 500ms
   - Easing: cubic-bezier(0.4, 0, 0.2, 1)
   - Промпт-кнопки: scale 1.02 при hover, scale 0.98 при tap
   - Длительность анимации кнопок: 150ms

4.22. Сообщения ДОЛЖНЫ анимироваться при появлении:
   - Fade in (opacity 0→1) + slide up (y: 10→0) за 300ms
   - Easing: cubic-bezier(0.4, 0, 0.2, 1)
   - Каждое новое сообщение анимируется независимо

4.23. Сообщения ДОЛЖНЫ корректно переноситься по ширине:
   - Длинные слова и текст без пробелов ДОЛЖНЫ переноситься (word-break: break-word)
   - Ширина сообщения НЕ ДОЛЖНА превышать ширину области чата
   - Горизонтальная полоса прокрутки НЕ ДОЛЖНА появляться из-за длинных сообщений
   - Переносы строк внутри текста сообщения ДОЛЖНЫ сохраняться (white-space: pre-wrap)
   - Пробелы в начале и конце текста ДОЛЖНЫ удаляться (trim)
   - Пробелы внутри текста ДОЛЖНЫ сохраняться

4.24. КОГДА статус активного агента равен `in-progress`, кнопка отправки ДОЛЖНА переключаться в режим остановки (`stop`) с иконкой остановки `Square` и текстом доступности `Stop generation`

4.24.1. КОГДА пользователь нажимает кнопку `stop`, текущий активный запрос ДОЛЖЕН быть отменён для текущего агента

4.24.2. Отмена через кнопку `stop` НЕ ДОЛЖНА создавать `kind:error` сообщение, так как это штатное действие

4.24.3. ЕСЛИ при попытке остановки запроса возникает ошибка отмены, ТО приложение НЕ ДОЛЖНО показывать toast-уведомление об ошибке

4.24.4. КОГДА статус активного агента отличается от `in-progress`, кнопка ДОЛЖНА отображаться в режиме отправки (`send`)

4.24.5. КОГДА пользователь нажимает `stop` после начала ответа модели (появился `kind: llm`), исходное `kind: user` сообщение этого turn ДОЛЖНО оставаться видимым в чате

#### Функциональные Тесты

- `tests/functional/agent-messaging.spec.ts` - "should send message on Enter key"
- `tests/functional/agent-messaging.spec.ts` - "should add new line on Shift+Enter"
- `tests/functional/agent-messaging.spec.ts` - "should enable send button only when input has text"
- `tests/functional/agent-messaging.spec.ts` - "should keep stop button enabled regardless of input text in in-progress status"
- `tests/functional/agent-messaging.spec.ts` - "should display messages in chronological order"
- `tests/functional/agent-messaging.spec.ts` - "should autoscroll to last message"
- `tests/functional/auto-expanding-textarea.spec.ts` - "AutoExpandingTextarea - Functional Tests"
- `tests/functional/input-autofocus.spec.ts` - "Functional tests for input autofocus on agent activation"
- `tests/functional/empty-state-placeholder.spec.ts` - "should display empty state for new agent"
- `tests/functional/empty-state-placeholder.spec.ts` - "should show 4 prompt suggestions"
- `tests/functional/empty-state-placeholder.spec.ts` - "should send message on prompt click"
- `tests/functional/empty-state-placeholder.spec.ts` - "should center AgentWelcome in messages area"
- `tests/functional/message-text-wrapping.spec.ts` - "should wrap long words without spaces in user messages"
- `tests/functional/message-text-wrapping.spec.ts` - "should preserve line breaks in user messages"
- `tests/functional/message-text-wrapping.spec.ts` - "should have correct CSS classes for agent messages"
- `tests/functional/message-text-wrapping.spec.ts` - "should not exceed chat area width with long content"
- `tests/functional/message-text-wrapping.spec.ts` - "should handle mixed content with long words and line breaks"
- `tests/functional/message-text-wrapping.spec.ts` - "should preserve multiple consecutive line breaks"
- `tests/functional/message-text-wrapping.spec.ts` - "should wrap long text with spaces naturally"
- `tests/functional/message-text-wrapping.spec.ts` - "should wrap code-like content without horizontal scroll"
- `tests/functional/message-text-wrapping.spec.ts` - "should preserve internal whitespace and trim leading/trailing"
- `tests/functional/message-text-wrapping.spec.ts` - "should maintain text wrapping after window resize"
- `tests/functional/message-text-wrapping.spec.ts` - "should handle emoji and Unicode characters correctly"
- `tests/functional/llm-chat.spec.ts` - "should cancel active request via stop button without creating error message"
- `tests/functional/llm-chat.spec.ts` - "should keep reasoning trigger logo static after finish and auto-collapse"

### 5. Просмотр всех агентов

**ID:** agents.5

**User Story:** Как пользователь, я хочу видеть полный список агентов в All Agents, чтобы найти старые разговоры с разными агентами.

#### Критерии Приемки

5.1. КОГДА пользователь кликает на кнопку "+N", ТО ДОЛЖНА открываться страница истории всех агентов

5.2. Страница All Agents ДОЛЖНА содержать:
   - Кнопку "Back" для возврата к чату
   - Заголовок "All Agents" с количеством агентов
   - Полный список агентов

5.3. Каждый агент в All Agents ДОЛЖЕН показывать:
   - Иконку статуса
   - Название
   - Описание
   - Статус (текстовое описание с цветом в зависимости от статуса, см. agents.6)
   - Время последнего обновления (updatedAt), отформатированное через DateTimeFormatter.formatDateTime() (см. settings.3.1)

5.4. КОГДА пользователь кликает по агенту в All Agents, ТО:
   - Должен открываться чат этого агента
   - Должен происходить автоматический возврат к интерфейсу чата
   - Выбранный агент должен становиться активным

5.5. Агенты со статусом "error" ДОЛЖНЫ показывать сообщение об ошибке (errorMessage) из последнего сообщения

5.6. Архивированные агенты НЕ ДОЛЖНЫ отображаться в All Agents

5.7. Агенты ДОЛЖНЫ быть отсортированы по updatedAt (от новых к старым)

5.8. Для получения error message ДОЛЖЕН использоваться оптимизированный SQL запрос с ORDER BY timestamp DESC LIMIT 1

5.9. КОГДА пользователь открывает `All Agents` и возвращается кнопкой `Back` без выбора другого агента, ТО активный чат НЕ ДОЛЖЕН размонтироваться, а его текущая позиция скролла ДОЛЖНА сохраняться без визуального доскролла сверху вниз

#### Функциональные Тесты

- `tests/functional/all-agents-page.spec.ts` - "should open all agents page on +N button click"
- `tests/functional/all-agents-page.spec.ts` - "should display all agents in history"
- `tests/functional/all-agents-page.spec.ts` - "should open agent chat from history"
- `tests/functional/agent-scroll-position.spec.ts` - "should preserve active chat scroll position when returning from All Agents via Back"
- `tests/functional/agents-error-messages.spec.ts` - "should display error message for agent with error status in AllAgents"
- `tests/functional/agents-error-messages.spec.ts` - "should not display archived agents in AllAgents"
- `tests/functional/agents-error-messages.spec.ts` - "should sort agents by updatedAt in AllAgents"
- `tests/functional/agents-error-messages.spec.ts` - "should display only the last error message in AllAgents"

### 6. Визуальные индикаторы статусов

**ID:** agents.6

**User Story:** Как пользователь, я хочу видеть текущий статус каждого агента, чтобы понимать, что происходит с моими запросами к разным агентам.

#### Критерии Приемки

6.1. Статус "new" ДОЛЖЕН отображаться:
   - Цвет фона: bg-sky-400
   - Цвет кольца: ring-sky-400/30
   - Цвет текста: text-sky-600
   - Иконка: первая буква названия агента
   - Текстовое описание: "New"

6.2. Статус "in-progress" ДОЛЖЕН отображаться:
   - Цвет фона: bg-blue-500
   - Цвет кольца: ring-blue-500/30
   - Цвет текста: text-blue-600
   - Анимация: вращающееся кольцо (animate-spin, 60 FPS)
   - Иконка: первая буква названия агента
   - Текстовое описание: "In progress"

6.3. Статус "awaiting-response" ДОЛЖЕН отображаться:
   - Цвет фона: bg-amber-500
   - Цвет кольца: ring-amber-500/30 с пульсацией (animate-pulse)
   - Цвет текста: text-amber-600
   - Иконка: первая буква названия агента
   - Дополнительная иконка: HelpCircle в правом нижнем углу
   - Текстовое описание: "Awaiting response"

6.4. Статус "error" ДОЛЖЕН отображаться:
   - Цвет фона: bg-red-500
   - Цвет кольца: ring-red-500/30
   - Цвет текста: text-red-600
   - Иконка: X (крестик)
   - Текстовое описание: "Error"

6.5. Статус "completed" ДОЛЖЕН отображаться:
   - Цвет фона: bg-green-500
   - Цвет кольца: ring-green-500/30
   - Цвет текста: text-green-600
   - Иконка: `Check` в зелёном круге
   - Текстовое описание: "Completed"

6.6. Все анимации ДОЛЖНЫ быть плавными (60 FPS) и не вызывать задержек в UI

6.7. **Визуальные компоненты и анимации:**

6.7.1. Application Logo:
   - Без CSS-анимации узлов на странице логина
   - С CSS-анимацией узлов в пустом стейте чата

6.7.2. Active Agent Icon:
   - Визуально дублирует Agent List Icon активного агента
   - CSS-анимация: вращающееся кольцо (in-progress), пульсирующее кольцо (awaiting-response)

6.7.3. Agent List Icon в Agents List (правая часть хедера):
   - CSS-анимация: вращающееся кольцо (in-progress), пульсирующее кольцо (awaiting-response)
   - JS-анимация пересортировки НЕ используется (перемещение при reorder — без анимации)

6.7.4. Agent List Icon в All Agents:
   - CSS-анимация: вращающееся кольцо (in-progress), пульсирующее кольцо (awaiting-response)
   - БЕЗ JS-анимации перемещения

6.7.5. Message Avatar:
   - CSS-анимация узлов и линий в стиле Application Logo
   - Для `kind: llm` с reasoning отображается в заголовке reasoning-блока

#### Функциональные Тесты

- `tests/functional/agent-status-indicators.spec.ts` - "should display correct visual indicators for each status"
- `tests/functional/agent-status-indicators.spec.ts` - "should animate in-progress status"
- `tests/functional/agent-status-indicators.spec.ts` - "should pulse awaiting-response status"
- `tests/functional/agent-status-indicators.spec.ts` - "should show animation only when agent moves to first position"
- `tests/functional/agent-status-indicators.spec.ts` - "should not show animation when agent status updates without position change"
- `tests/functional/agent-status-indicators.spec.ts` - "should show animation when switching back to previous agent"
- `tests/functional/agent-status-all-places.spec.ts` - "should render \"new\" status consistently in all places"
- `tests/functional/agent-status-all-places.spec.ts` - "should render \"in-progress\" status consistently in all places"
- `tests/functional/agent-status-all-places.spec.ts` - "should render \"awaiting-response\" status consistently in all places"
- `tests/functional/agent-status-all-places.spec.ts` - "should render \"error\" status consistently in all places"
- `tests/functional/agent-status-all-places.spec.ts` - "should render \"completed\" status consistently in all places"

### 7. Формат сообщений в чате

**ID:** agents.7

**User Story:** Как пользователь, я хочу видеть сообщения в понятном формате, чтобы понимать ход разговора с агентом.

#### Критерии Приемки

7.1. Сообщения ДОЛЖНЫ храниться в таблице `messages` с полями:
   - `id INTEGER PRIMARY KEY` - уникальный идентификатор
   - `agent_id TEXT NOT NULL` - ID агента
   - `timestamp TIMESTAMP NOT NULL` - время сообщения (ISO 8601 с timezone offset)
   - `kind TEXT NOT NULL` - тип сообщения (хранится в отдельной колонке, не в payload_json)
   - `hidden INTEGER NOT NULL DEFAULT 0` - флаг скрытия сообщения (скрытые сообщения не участвуют в UI и в расчёте статуса)
   - `done INTEGER NOT NULL DEFAULT 0` - флаг завершённости сообщения (`0` пока сообщение формируется/стримится, `1` после полного получения)
   - `reply_to_message_id INTEGER` - связь с сообщением, на которое даётся ответ (null для первого)
   - `payload_json TEXT NOT NULL` - JSON с данными сообщения (без поля `kind`)

7.2. Формат `payload_json` (поле `kind` убрано — оно в колонке БД):
   ```json
   {
     "timing": { "started_at": "ISO+offset", "finished_at": "ISO+offset" },
     "data": {}
   }
   ```

7.2.1. Допустимые значения `kind`: `user | llm | error | tool_call`

7.2.2. Для сценария завершения задачи в истории сообщений ДОЛЖНО присутствовать сообщение `kind: tool_call` c `toolName = "final_answer"` и `done = true`.

7.3. В UI чата ДОЛЖНЫ отображаться следующие kinds:
   - `user` - сообщение пользователя (справа, серый полупрозрачный фон, тонкая серая рамка, скругленные углы)
   - `llm` - ответ агента (слева), включая streaming reasoning/text и финальное состояние `done = true`
   - `tool_call` - вызов инструмента и его результат/статус

7.4. `tool_call` с `toolName != "final_answer"` НЕ ДОЛЖЕН отображаться как обычный текстовый bubble (`user`/`llm`); для него ДОЛЖЕН использоваться специализированный tool-call блок.

7.4.1. `tool_call` с `toolName = "final_answer"` ДОЛЖЕН отображаться как отдельный компонент `"Final Answer"` (на базе `Queue`), а не как обычный текстовый bubble `kind: llm`.

7.4.1.1. Заголовок компонента `"Final Answer"` для `final_answer` ДОЛЖЕН содержать фиксированный текст `Done` и иконку `Check` (без круга).

7.4.2. Внутри компонента `"Final Answer"` для `tool_call(final_answer)` ДОЛЖНЫ отображаться только пункты `summary_points`; каждый пункт ДОЛЖЕН отображаться с иконкой `Check` в зелёном круге.

7.4.2.1. Компонент `"Final Answer"` ДОЛЖЕН использовать фиксированный заголовок `Done`.

7.4.2.2. КОГДА `summary_points` пустой (или отсутствует), компонент `"Final Answer"` ДОЛЖЕН отображаться в неколлапсируемом виде (без toggle-контрола).

7.4.2.3. Контракт и лимиты аргументов `final_answer` задаются в спецификации `llm-integration`; `agents` использует только persisted payload для отображения.

7.4.4. Для `tool_call(final_answer)` UI ДОЛЖЕН иметь отдельные тестовые идентификаторы:
  - `data-testid="message-final-answer-block"` для корневого блока,
  - `data-testid="message-final-answer-header"` для заголовка,
  - `data-testid="message-final-answer-title"` для фиксированного текста `Done`,
  - `data-testid="message-final-answer-check"` для иконки `Check` в заголовке (без круга),
  - `data-testid="message-final-answer-summary"` для контейнера списка `summary_points`,
  - `data-testid="message-final-answer-toggle"` для toggle (только когда `summary_points` не пустой).

7.5. Сообщение `user` ДОЛЖНО содержать:
   ```json
   { "data": { "text": "string" } }
   ```

7.6. Сообщение `llm` ДОЛЖНО содержать:
   ```json
   { "data": { "text": "string", "format": "markdown|text" } }
   ```

7.7. КОГДА `format = "markdown"`, ТО текст ДОЛЖЕН рендериться с поддержкой Markdown

7.8. Все timestamps ДОЛЖНЫ включать timezone offset и храниться в часовом поясе пользователя

#### Функциональные Тесты

- `tests/functional/agent-messaging.spec.ts` - "should display messages in chronological order"
- `tests/functional/llm-chat.spec.ts` - "should show llm response after user message"
- `tests/functional/llm-chat.spec.ts` - "should render markdown headings"
- `tests/functional/llm-chat.spec.ts` - "should render markdown paragraphs"
- `tests/functional/llm-chat.spec.ts` - "should render markdown emphasis"
- `tests/functional/llm-chat.spec.ts` - "should render markdown strikethrough"
- `tests/functional/llm-chat.spec.ts` - "should render markdown links"
- `tests/functional/llm-chat.spec.ts` - "should render markdown autolinks"
- `tests/functional/llm-chat.spec.ts` - "should render markdown email autolinks"
- `tests/functional/llm-chat.spec.ts` - "should render markdown blockquotes"
- `tests/functional/llm-chat.spec.ts` - "should render markdown unordered list"
- `tests/functional/llm-chat.spec.ts` - "should render markdown ordered list"
- `tests/functional/llm-chat.spec.ts` - "should render markdown nested list"
- `tests/functional/llm-chat.spec.ts` - "should render markdown task list"
- `tests/functional/llm-chat.spec.ts` - "should render markdown inline code"
- `tests/functional/llm-chat.spec.ts` - "should render markdown fenced code"
- `tests/functional/llm-chat.spec.ts` - "should render markdown tables"
- `tests/functional/llm-chat.spec.ts` - "should render markdown horizontal rule"
- `tests/functional/llm-chat.spec.ts` - "should render markdown images"
- `tests/functional/llm-chat.spec.ts` - "should render markdown mermaid diagrams"
- `tests/functional/llm-chat.spec.ts` - "should render markdown inline math"
- `tests/functional/llm-chat.spec.ts` - "should render markdown block math"
- `tests/functional/llm-chat.spec.ts` - "should avoid duplicate line breaks between markdown blocks"

---

### 8. Хедер активного агента

**ID:** agents.8

**User Story:** Как пользователь, я хочу видеть информацию об активном агенте в хедере, чтобы понимать с каким агентом я сейчас общаюсь.

#### Критерии Приемки

8.1. Левая часть хедера (50% ширины) ДОЛЖНА отображать информацию об активном агенте:
   - Иконку статуса (32px)
   - Название агента (с truncate при переполнении)
   - Статус агента (текстовое описание с цветом в зависимости от статуса, см. agents.6)
   - Время последнего обновления агента (updatedAt), отформатированное через DateTimeFormatter.formatDateTime() (см. settings.3.1)

8.2. Правая часть хедера (50% ширины) ДОЛЖНА отображать список агентов с выравниванием по правому краю (justify-end)

8.3. Хедер ДОЛЖЕН иметь высоту 64px (h-16) с нижней границей (border-b border-border)

#### Функциональные Тесты

- `tests/functional/header-layout.spec.ts` - "should split header into 50% left (active agent info) and 50% right (agent list)"
- `tests/functional/header-layout.spec.ts` - "should maintain 50%/50% split with long agent name"
- `tests/functional/agent-date-update.spec.ts` - "should update agent timestamp when new message is sent"

---

### 9. Определение статуса агента

**ID:** agents.9

**User Story:** Как система, я хочу вычислять статус агента из его сообщений, чтобы отображать актуальное состояние без дублирования данных.

**Зависимости:** agents.7 (формат сообщений)

#### Критерии Приемки

9.1. Статус агента ДОЛЖЕН вычисляться динамически из последних сообщений, а НЕ храниться в таблице agents

9.2. Алгоритм определения статуса:
   - ЕСЛИ у агента нет сообщений, ТО статус `new`
   - Далее из истории исключаются все сообщения с `hidden = true`
   - ЕСЛИ после исключения сообщений не осталось, ТО статус `new`
   - Далее статус определяется по последнему видимому сообщению:
     - `kind = 'user'` → `in-progress`
     - `kind = 'llm'` и `done = false` → `in-progress`
     - `kind = 'llm'` и `done = true` → `awaiting-response`
     - `kind = 'tool_call'` и `done = false` → `in-progress`
     - `kind = 'tool_call'` и `toolName = 'final_answer'` и `done = true` → `completed`
     - `kind = 'tool_call'` и `toolName != 'final_answer'` и `done = true` → `awaiting-response`
     - `kind = 'error'` → `error`

9.3. Статус ДОЛЖЕН пересчитываться при получении любого нового сообщения в чате агента

9.4. Функция определения статуса ДОЛЖНА быть чистой (pure function) и детерминированной

#### Функциональные Тесты

- `tests/functional/agent-status-calculation.spec.ts` - "should calculate agent status from messages"
- `tests/functional/agent-status-calculation.spec.ts` - "should update status on new message"

---

### 10. Изоляция данных по пользователю

**ID:** agents.10

**User Story:** Как пользователь, я хочу видеть только своих агентов, чтобы мои данные были изолированы от других пользователей.

**Зависимости:** user-data-isolation (изоляция данных пользователей)

#### Критерии Приемки

10.1. Каждый агент ДОЛЖЕН быть привязан к userId текущего пользователя

10.2. При загрузке списка агентов ДОЛЖНА выполняться фильтрация по userId текущего пользователя

10.3. При создании нового агента ДОЛЖЕН автоматически устанавливаться userId текущего пользователя

10.4. Пользователь НЕ ДОЛЖЕН иметь доступ к агентам других пользователей

#### Функциональные Тесты

- `tests/functional/agent-data-isolation.spec.ts` - "should only show agents for current user"
- `tests/functional/agent-data-isolation.spec.ts` - "should create agent with current userId"

---

### 11. Индикатор активности агента

**ID:** agents.11

**User Story:** Как пользователь, я хочу видеть что агент выполняет работу, чтобы понимать что мой запрос обрабатывается.

#### Критерии Приемки

11.1. КОГДА активное сообщение `kind: llm` ИЛИ `kind: tool_call` имеет `done = false`, ТО ДОЛЖЕН отображаться индикатор активности (`in-progress`)

11.2. Индикатор активности ДОЛЖЕН показывать анимированный спиннер

11.3. Индикатор ДОЛЖЕН отображаться в области сообщений под последним сообщением

11.4. Индикатор ДОЛЖЕН исчезать, когда активное сообщение `kind: llm` ИЛИ `kind: tool_call` переходит в `done = true` ИЛИ скрывается через `hidden: true`; для `tool_call(toolName='final_answer', done=true)` итоговый статус ДОЛЖЕН быть `completed`

#### Функциональные Тесты

- `tests/functional/agent-activity-indicator.spec.ts` - "should show activity indicator while llm message is in-progress"
- `tests/functional/agent-activity-indicator.spec.ts` - "should hide activity indicator when operation completes"

---

### 12. Real-time Events интеграция

**ID:** agents.12

**User Story:** Как система, я хочу синхронизировать UI с изменениями данных в реальном времени, чтобы пользователь видел актуальное состояние.

**Зависимости:** realtime-events (система событий реального времени)

#### Критерии Приемки

**События агентов:**

12.1. КОГДА создаётся новый агент, Main процесс ДОЛЖЕН генерировать событие `agent.created`
   - **Генератор:** `AgentManager.create()`
   - **Момент:** После создания агента в БД через `AgentsRepository.create()`
   - **Payload:** полный snapshot созданного агента

12.2. КОГДА обновляется агент (name, updatedAt), Main процесс ДОЛЖЕН генерировать событие `agent.updated`
   - **Генератор 1:** `AgentManager.update()` - при изменении имени агента
     - **Момент:** После обновления в БД через `AgentsRepository.update()`
     - **Payload:** полный snapshot агента
   - **Генератор 2:** `AgentManager.handleMessageCreated()` - при создании сообщения
     - **Триггер:** Подписка на событие `MESSAGE_CREATED`
     - **Момент:** После обновления `updatedAt` в БД через `AgentsRepository.touch()`
     - **Payload:** полный snapshot агента

12.3. КОГДА агент архивируется, Main процесс ДОЛЖЕН генерировать событие `agent.archived`
   - **Генератор:** `AgentManager.archive()`
   - **Момент:** После архивирования в БД через `AgentsRepository.archive()`
   - **Payload:** полный snapshot архивированного агента

**События сообщений:**

12.4. КОГДА создаётся новое сообщение в чате, Main процесс ДОЛЖЕН генерировать событие `message.created`
   - **Генератор:** `MessageManager.create()`
   - **Момент:** После создания сообщения в БД через `MessagesRepository.create()`
   - **Payload:** полный snapshot созданного сообщения
   - **Побочный эффект:** Триггерит `AgentManager.handleMessageCreated()` который генерирует `agent.updated`

12.5. КОГДА обновляется сообщение (например, промежуточный/финальный апдейт `kind: llm`), Main процесс ДОЛЖЕН генерировать событие `message.updated`
   - **Генератор:** `MessageManager.update()`
   - **Момент:** После обновления payload в БД через `MessagesRepository.update()`
   - **Payload:** полный snapshot обновлённого сообщения

**Подписки UI (Renderer):**

12.6. Компонент Agents ДОЛЖЕН подписываться на события:
   - `agent.created` — добавить агента в список
   - `agent.updated` — обновить данные агента в списке
   - `agent.archived` — удалить агента из списка

12.7. Компонент чата ДОЛЖЕН подписываться на события:
   - `message.created` — добавить сообщение в чат (если agentId совпадает с активным)
   - `message.updated` — обновить сообщение в чате
   - `message.llm.reasoning.updated` — применить reasoning delta для активного стриминга
   - `message.llm.text.updated` — применить text delta для активного стриминга

12.8. При получении `message.created` или `message.updated` ДОЛЖЕН пересчитываться статус агента

#### Функциональные Тесты

- `tests/functional/agent-realtime-events.spec.ts` - "should add agent to list on agent.created event"
- `tests/functional/agent-realtime-events.spec.ts` - "should update agent on agent.updated event"
- `tests/functional/agent-realtime-events.spec.ts` - "should remove agent on agent.archived event"
- `tests/functional/agent-realtime-events.spec.ts` - "should add message on message.created event"

---

### 13. Загрузка всех чатов при старте

**ID:** agents.13

**User Story:** Как пользователь, я хочу мгновенно переключаться между агентами без задержек и потери позиции скролла, потому что все чаты уже загружены.

#### Критерии Приемки

13.1. При старте приложения ДОЛЖНЫ загружаться сообщения ВСЕХ агентов одновременно

13.2. Основной интерфейс ДОЛЖЕН показываться ТОЛЬКО после того, как одновременно выполнены два условия: загружены чаты всех агентов и активный чат достиг финального стартового состояния

13.3. Каждый агент ДОЛЖЕН иметь независимый компонент `AgentChat`, который монтируется при старте и остаётся смонтированным всё время работы приложения

13.4. КОГДА пользователь кликает на агента, ТО показывается уже смонтированный чат этого агента (без перезагрузки, без ремонта)

13.5. Скрытые чаты ДОЛЖНЫ скрываться через CSS без размонтирования

13.6. Позиция скролла каждого агента сохраняется автоматически — компонент `Conversation` остаётся смонтированным и трекает скролл сам

13.7. КОГДА создаётся новый агент, ТО его `AgentChat` компонент ДОЛЖЕН монтироваться немедленно

13.8. При монтировании `AgentChat` ДОЛЖНЫ загружаться ВСЕ сообщения агента через `messages:list`

13.9. Для этой спецификации ДОЛЖНЫ использоваться следующие границы этапа запуска:

13.9.1. Старт приложения ДОЛЖЕН начинаться в момент первого рендера `App` в renderer process (до получения первого состояния `AppCoordinator`)

13.9.2. Интервал между первым рендером `App` и первым запросом `app:get-state` ДОЛЖЕН относиться к этапу запуска; в этом интервале renderer ДОЛЖЕН показывать стартовый экран и запускать стартовый polling-контур

13.9.3. Этап запуска приложения ДОЛЖЕН считаться активным с первого запроса `app:get-state` и продолжаться до первого достижения терминальной фазы `AppCoordinator` (`ready`/`unauthenticated`/`error`) по polling IPC `app:get-state` ИЛИ до диагностического timeout

13.9.4. Этап запуска приложения ДОЛЖЕН считаться завершённым после фиксации терминальной фазы из пункта 13.9.3; после этого переходы состояния считаются runtime-этапом

13.10. Экран загрузки ДОЛЖЕН оставаться видимым, ПОКА хотя бы один `AgentChat` ещё загружает начальный чанк сообщений ИЛИ активный чат ещё не достиг финального стартового состояния

13.11. Оркестрация стартового workflow ДОЛЖНА выполняться централизованно в main process через `AppCoordinator` (единый source of truth для фаз запуска)

13.12. Renderer ДОЛЖЕН получать стартовое состояние через polling IPC `app:get-state` с интервалом 200мс только в границах этапа запуска, определённых в пунктах 13.9.1–13.9.4

13.13. Renderer ДОЛЖЕН определять показ глобального loading-экрана и целевого экрана (`login`/`agents`/`settings`) по состоянию `AppCoordinator`, а НЕ по локально-разрозненным флагам

13.14. КОГДА чаты полностью загружены и активный чат достиг `startupSettled`, ТО Renderer ДОЛЖЕН вызвать IPC `app:set-chats-ready`, после чего `AppCoordinator` ДОЛЖЕН перевести приложение в фазу `ready`

13.15. ЕСЛИ в фазе `waiting-for-chats` не получен IPC-сигнал `app:set-chats-ready` за timeout, `AppCoordinator` ДОЛЖЕН перевести приложение в фазу `error` с диагностической причиной

13.16. КОГДА renderer находится в стартовых фазах, ТО polling `app:get-state` ДОЛЖЕН продолжаться до терминальной фазы (`ready`/`unauthenticated`/`error`) или до диагностического timeout

13.17. КОГДА `AppCoordinator` меняет фазу, ТО main process ДОЛЖЕН публиковать событие `app.coordinator.state-changed` (событие МОЖЕТ приходить как во время старта, так и после старта)

13.18. Стартовая оркестрация (показ стартовых экранов, переходы стартовых фаз и готовность к показу финального UI) ДОЛЖНА определяться по polling IPC `app:get-state`; событие `app.coordinator.state-changed` НЕ ДОЛЖНО быть единственным источником истины для принятия стартовых решений

#### Функциональные Тесты

- `tests/functional/agent-switching.spec.ts` - "should preserve scroll position when switching agents"
- `tests/functional/agent-switching.spec.ts` - "should show correct chat immediately on agent click"
- `tests/functional/startup-loader.spec.ts` - стартовый экран скрывается только после полной готовности чатов и стабилизации первого отображения активного чата
- `tests/functional/settings-ai-agent.spec.ts` - "53.1: should save and load LLM provider selection"
- `tests/functional/settings-ai-agent.spec.ts` - "53.2: should save and load API key with encryption"
- `tests/functional/settings-ai-agent.spec.ts` - "53.3: should delete API key when field is cleared"
- `tests/unit/hooks/useAppCoordinatorState.test.ts` - "should resync state via IPC polling during bootstrap"
- `tests/unit/hooks/useAppCoordinatorState.test.ts` - "should update state from app coordinator state-changed event after startup"

---

## Нефункциональные Требования

### Производительность

- Переключение между агентами должно происходить мгновенно (< 100ms)
- Все анимации должны работать с частотой 60 FPS
- Пересчет видимых агентов при изменении размера окна должен выполняться < 50ms

### Адаптивность

- Компонент должен корректно работать при минимальной ширине окна 320px
- Список агентов должен автоматически адаптироваться к ширине экрана
- При изменении размера окна должен срабатывать event listener на resize с cleanup при unmount

### Доступность

- Каждая интерактивная иконка агента ДОЛЖНА иметь доступное имя через `aria-label` или `aria-labelledby`
- Основной контейнер должен иметь data-testid="agents"
- Поле ввода должно иметь понятный placeholder
- Тултипы должны показываться при hover с задержкой 2 секунды и содержать полную информацию
- Нативный HTML-атрибут `title` НЕ ДОЛЖЕН использоваться для agent icons, чтобы избежать двойного тултипа

## Зависимости

### Внешние компоненты
- `Logo` - компонент логотипа Clerkly (из `src/renderer/components/logo.tsx`). Используется для Application Logo в пустом стейте чата
- `AgentAvatar` - компонент аватара агента (из `src/renderer/components/agents/AgentAvatar.tsx`). Используется в Active Agent Icon и Agent List Icon
- `AgentReasoningTrigger` - компонент заголовка reasoning-блока (из `src/renderer/components/agents/AgentReasoningTrigger.tsx`). Используется для отображения Message Avatar в `kind: llm` сообщениях с reasoning
- `lucide-react` - библиотека иконок (Send, AlertCircle, X, HelpCircle, ArrowLeft, Plus, FileText, Calendar, Video)

### Типы
- `Agent` - тип агента (agentId, userId, name, createdAt, updatedAt, archivedAt)
- `AgentStatus` - вычисляемый тип статуса агента ('new' | 'in-progress' | 'awaiting-response' | 'error' | 'completed')
- `Message` - тип сообщения в чате

### React хуки
- `useState` - управление состоянием компонента
- `useRef` - ссылки на DOM элементы (chatListRef)
- `useEffect` - побочные эффекты (resize listener, autofocus)

## Ограничения

### Scope первой версии

Первая версия реализует базовый чат-интерфейс:
- Создание и переключение между агентами (чатами)
- Отправка и отображение сообщений
- Сохранение сообщений в базу данных
- Визуальные индикаторы статусов
- Изоляция данных по пользователю

## Вне Области Применения

Следующие элементы явно исключены из данной спецификации:

- Редактирование названий агентов
- Экспорт истории чатов
- Поиск по сообщениям
- Фильтрация агентов по статусу
- Группировка агентов по категориям
- Настройка поведения агентов
- Управление контекстом агентов
- Busy agent + coalescing (объединение сообщений)
- Retry-механики вне LLM-интеграции (например, общий retry для произвольных UI-ошибок)
