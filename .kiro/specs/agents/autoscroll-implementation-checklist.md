# Чеклист Реализации Автоскролла и Сохранения Позиции

## Этап 1: Обновление Кода в `agents.tsx`

### 1.1. Добавить функцию `isUserAtBottom()`
- [x] Добавить функцию после `scrollToBottom()` (строка ~47)
- [x] Проверить формулу: `distanceFromBottom < clientHeight / 3`
- [x] Добавить комментарий: `// Requirements: agents.4.13.2, agents.4.13.3`

### 1.2. Добавить `useEffect` для автоскролла при новых сообщениях
- [x] Добавить useEffect после useEffect для autofocus (строка ~70)
- [x] Проверить условие: `messages.length > 0 && isUserAtBottom()`
- [x] Вызвать `scrollToBottom()` внутри
- [x] Добавить комментарий: `// Requirements: agents.4.13.1, agents.4.13.2`

### 1.3. Добавить состояние для сохранения позиций скролла
- [x] Добавить `scrollPositions` после `messagesEndRef` (строка ~43)
- [x] Использовать `useRef<Map<string, number>>(new Map())`
- [x] Добавить комментарий: `// Requirements: agents.4.14.5`

### 1.4. Добавить обработчик скролла `handleScroll()`
- [x] Добавить функцию после `isUserAtBottom()` (строка ~55)
- [x] Сохранять `scrollTop` в Map по `activeAgent.id`
- [x] Добавить проверки на `messagesAreaRef.current` и `activeAgent`
- [x] Добавить комментарий: `// Requirements: agents.4.14.1`

### 1.5. Добавить `useEffect` для восстановления позиции
- [x] Добавить useEffect после useEffect для автоскролла (строка ~78)
- [x] Проверить наличие сохраненной позиции
- [x] Если есть → восстановить `scrollTop`
- [x] Если нет → вызвать `scrollToBottom()` (первый визит)
- [x] Добавить комментарий: `// Requirements: agents.4.14.2, agents.4.14.3, agents.4.14.4, agents.4.14.7`
- [x] Зависимости: `[activeAgent?.id, messages]`

### 1.6. Обновить `handleSend()` для сброса позиции
- [x] Добавить `scrollPositions.current.delete(activeAgent.id)` перед `scrollToBottom()`
- [x] Обновить комментарий: `// Requirements: agents.4.13.4, agents.4.14.6`

### 1.7. Добавить `onScroll` к messages area
- [x] Найти `<div ref={messagesAreaRef}` в JSX (строка ~460)
- [x] Добавить `onScroll={handleScroll}`

---

## Этап 2: Обновление Модульных Тестов

### 2.1. Обновить `agents-autoscroll.test.tsx`

#### Обновить существующие тесты:
- [x] Обновить комментарий в "should call scrollIntoView when user sends message" → agents.4.13.4
- [x] УДАЛИТЬ тест "should NOT scroll when messages change without user action" (устаревший)

#### Добавить новые тесты:
- [x] Тест: "should scroll when new message arrives and user is in bottom third"
  - Requirements: agents.4.13.1, agents.4.13.2
  - Проверить: useEffect вызывает scrollToBottom при isUserAtBottom() === true

- [x] Тест: "should NOT scroll when new message arrives and user is above bottom third"
  - Requirements: agents.4.13.2
  - Проверить: useEffect НЕ вызывает scrollToBottom при isUserAtBottom() === false

- [x] Тест: "should calculate bottom third correctly"
  - Requirements: agents.4.13.3
  - Проверить формулу: `scrollHeight - scrollTop - clientHeight < clientHeight / 3`
  - Тестовые случаи:
    - scrollTop = 0, clientHeight = 300 → distanceFromBottom = 700 → НЕ в нижней трети
    - scrollTop = 700, clientHeight = 300 → distanceFromBottom = 0 → в нижней трети
    - scrollTop = 650, clientHeight = 300 → distanceFromBottom = 50 → в нижней трети (< 100)

- [x] Тест: "should always scroll when user sends message regardless of position"
  - Requirements: agents.4.13.4
  - Проверить: handleSend вызывает scrollToBottom даже если прокручен вверх

### 2.2. Обновить `agents-scroll-position.test.tsx`

#### Добавить новый тест:
- [x] Тест: "should scroll to bottom on first visit to agent"
  - Requirements: agents.4.14.4
  - Проверить: при переключении на агента без сохраненной позиции → scrollToBottom

---

## Этап 3: Обновление Функциональных Тестов

### 3.1. Добавить в `agent-messaging.spec.ts`

- [x] Тест: "should autoscroll when new message arrives and user is at bottom"
  - Requirements: agents.4.13.1, agents.4.13.2
  - Сценарий:
    1. Отправить несколько сообщений
    2. Убедиться что пользователь внизу
    3. Отправить еще одно сообщение
    4. Проверить что чат прокрутился вниз

- [x] Тест: "should NOT autoscroll when user is scrolled up"
  - Requirements: agents.4.13.2
  - Сценарий:
    1. Отправить много сообщений
    2. Прокрутить вверх (scrollTop = 100)
    3. Проверить что позиция сохраняется

### 3.2. Добавить в `agent-scroll-position.spec.ts`

- [x] Тест: "should scroll to bottom on first visit to agent"
  - Requirements: agents.4.14.4
  - Сценарий:
    1. Создать агента с сообщениями
    2. Создать второго агента с сообщениями
    3. Проверить что второй агент прокручен вниз (первый визит)
    4. Переключиться на первого агента
    5. Проверить что позиция восстановлена (не прокручено вниз)
    6. Создать третьего агента
    7. Проверить что третий агент прокручен вниз (первый визит)

---

## Этап 4: Запуск Тестов

### 4.1. Модульные тесты
- [x] Запустить: `npm run test:unit -- tests/unit/components/agents-autoscroll.test.tsx`
- [x] Все тесты проходят
- [x] Запустить: `npm run test:unit -- tests/unit/components/agents-scroll-position.test.tsx`
- [x] Все тесты проходят

### 4.2. Функциональные тесты
- [x] Запустить: `npm run test:functional:single -- agent-messaging.spec.ts`
- [x] Все тесты проходят
- [x] Запустить: `npm run test:functional:single -- agent-scroll-position.spec.ts`
- [x] Все тесты проходят

### 4.3. Полная валидация
- [x] Запустить: `npm run validate`
- [x] TypeScript компиляция ✓
- [x] ESLint ✓
- [x] Prettier ✓
- [x] Модульные тесты ✓
- [x] Property-based тесты ✓
- [x] Покрытие кода ≥ 85% ✓

---

## Этап 5: Проверка Покрытия Требований

### agents.4.13 - Автоскролл
- [x] agents.4.13.1 - автоскролл при любом новом сообщении (useEffect с messages, строка 88-92)
- [x] agents.4.13.2 - только если в нижней трети (isUserAtBottom(), строка 53-59)
- [x] agents.4.13.3 - формула проверки `clientHeight / 3` (строка 57)
- [x] agents.4.13.4 - всегда при отправке пользователем (handleSend, строка 149-161)
- [x] agents.4.13.5 - `scrollIntoView({ behavior: 'smooth' })` (scrollToBottom, строка 48-50)
- [x] agents.4.13.6 - невидимый div с `messagesEndRef` (строка 520)
- [x] agents.4.13.7 - полная видимость последнего сообщения (scrollIntoView обеспечивает)

### agents.4.14 - Сохранение позиции скролла
- [x] agents.4.14.1 - сохранение при скролле (handleScroll, строка 62-66)
- [x] agents.4.14.2 - сохранение при переключении (useEffect сохраняет через handleScroll)
- [x] agents.4.14.3 - восстановление при возврате (useEffect, строка 97-108)
- [x] agents.4.14.4 - автоскролл при первом визите (useEffect, строка 104-106)
- [x] agents.4.14.5 - хранение в `Map<agentId, scrollTop>` (scrollPositions, строка 45)
- [x] agents.4.14.6 - сброс при отправке сообщения (handleSend, строка 158)
- [x] agents.4.14.7 - восстановление до рендеринга UI (useEffect с activeAgent?.id, строка 97-108)

---

## Финальная Проверка

- [x] Код соответствует requirements.md
- [x] Код соответствует design.md
- [x] Все комментарии с Requirements добавлены
- [x] Все тесты имеют структуру (Preconditions, Action, Assertions, Requirements)
- [x] Нет eslint/prettier ошибок
- [x] Покрытие кода достаточное
- [x] Функциональные тесты проходят

---

## Примечания

- Не запускать функциональные тесты автоматически (они показывают окна)
- При падении тестов запускать ТОЛЬКО упавшие для отладки
- Использовать `npm run rebuild:node` если есть проблемы с нативными модулями
