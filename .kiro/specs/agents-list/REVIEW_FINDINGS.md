# Результаты Проверки Спецификации Agents List

## Дата проверки
2026-02-13

## Статус
⚠️ Требуются уточнения и согласования

---

## История Изменений

| Дата | Изменение | Статус |
|------|-----------|--------|
| 2026-02-13 | Первичная проверка спецификации | ✅ Выполнено |
| 2026-02-13 | Схема БД - отложено на потом | ⏳ Ожидает |
| 2026-02-13 | Добавлено поле userId и требование изоляции данных | ✅ Выполнено |
| 2026-02-13 | Уточнено: agent.deleted не противоречит архивированию (для пользователя это "удаление") | ✅ Закрыто |
| 2026-02-13 | Добавлено форматирование времени (ссылка на settings.2) | ✅ Выполнено |
| 2026-02-13 | Счетчик символов - не нужен | ✅ Закрыто |

---

## 1. Что забыли обсудить

### 1.1. Схема базы данных ⏳ ОТЛОЖЕНО

**Проблема:** Отсутствует описание структуры таблиц БД.

**Статус:** Обсудим позже

**Рекомендация (предварительная):**
```sql
-- Таблица agents
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,  -- Связь с пользователем (user-data-isolation)
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('new', 'in-progress', 'awaiting-user', 'error', 'completed')),
  createdAt TEXT NOT NULL,  -- ISO 8601 format
  updatedAt TEXT NOT NULL,  -- ISO 8601 format
  completedAt TEXT,
  errorMessage TEXT,
  isArchived INTEGER NOT NULL DEFAULT 0,  -- Boolean: 0 = false, 1 = true
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_agents_userId ON agents(userId);
CREATE INDEX idx_agents_updatedAt ON agents(updatedAt DESC);
CREATE INDEX idx_agents_isArchived ON agents(isArchived);

-- Таблица messages
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agentId INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('user', 'agent')),
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,  -- ISO 8601 format
  FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_agentId ON messages(agentId);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
```

**Действие:** ⏳ Отложено - обсудим позже

---

### 1.2. Интеграция с Real-time Events System ✅ ДОБАВЛЕНО

**Проблема:** Нет явной зависимости на realtime-events спецификацию.

**Рекомендация:**
Добавить в requirements.md раздел "Зависимости":

```markdown
## Зависимости

### Внешние спецификации

- **realtime-events** - Система событий для автоматического обновления UI
  - Подписка на события: agent.created, agent.updated, agent.archived, agent.status.changed
  - Подписка на события: message.created
  - Синхронизация между вкладками через BroadcastChannel

- **user-data-isolation** - Изоляция данных между пользователями
  - Фильтрация агентов по userId
  - Связь агентов с текущим пользователем

- **clerkly** - Архитектурные принципы
  - Single Source of Truth (БД как источник истины)
  - Logger для логирования
  - DateTimeFormatter для форматирования времени
```

**Действие:** ✅ Добавлено в requirements.md

---

### 1.3. Формат времени ✅ ДОБАВЛЕНО

**Проблема:** Не указано использование DateTimeFormatter.

**Решение:**
- Для отображения дат в UI используется DateTimeFormatter.formatDate() / formatDateTime()
- Системная локаль через Intl.DateTimeFormat
- Зависимость: settings.2 (Форматирование Дат и Времени)

**Действие:** ✅ Добавлено в requirements.md

---

### 1.4. Обработка больших сообщений ✅ ЗАКРЫТО

**Проблема:** Есть лимит 20000 символов, но не описано поведение UI.

**Решение:** Счетчик символов НЕ нужен. При достижении лимита просто блокируется ввод.

**Действие:** ✅ Закрыто - не требуется

---

### 1.5. Изоляция данных между пользователями ✅ ДОБАВЛЕНО

**Проблема:** Не описана связь агентов с пользователями.

**Решение:** Добавлено поле userId в структуру Agent и требование 9 "Изоляция данных пользователей"

**Действие:** ✅ Добавлено в requirements.md

---

## 2. Противоречия с другими спецификациями

### 2.1. Терминология agent.deleted vs архивирование ✅ ЗАКРЫТО

**Проблема:**
- agents-list использует термин "архивирование" (isArchived = true)
- realtime-events использует событие "agent.deleted"

**Решение:** Это НЕ противоречие. Для пользователя действие выглядит как "удаление", хотя технически это архивирование. Событие agent.deleted корректно описывает пользовательское действие.

**Действие:** ✅ Закрыто - противоречия нет

---

## 3. Оставшиеся вопросы

### 3.1. Схема базы данных ⏳

Требуется обсудить:
- Структура таблицы agents
- Структура таблицы messages
- Индексы для производительности
- Миграции БД

---

## 4. Внесенные изменения в спецификацию

### requirements.md

1. ✅ Добавлено поле `userId` в структуру Agent (Глоссарий)
2. ✅ Добавлен раздел "Зависимости" с внешними спецификациями
3. ✅ Добавлено требование 9 "Изоляция данных пользователей"
4. ✅ Добавлено требование о форматировании времени (ссылка на settings.2)

### tasks.md

1. ✅ Будет обновлен после добавления требований

---

## Заключение

Спецификация agents-list обновлена:
- ✅ Добавлена изоляция данных пользователей (userId)
- ✅ Добавлены зависимости на внешние спецификации
- ✅ Добавлено форматирование времени
- ⏳ Схема БД - обсудим позже
- ✅ Противоречие с realtime-events закрыто (не является противоречием)
