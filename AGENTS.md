# Руководство для Агентов

## Определения и Термины

- **Максимальное покрытие кода**: Минимум 85% покрытия строк кода тестами, стремление к 90%+
- **Краевые случаи**: Тестирование граничных значений, пустых данных, null/undefined, максимальных/минимальных значений
- **Исключительные ситуации**: Тестирование ошибок сети, недоступности ресурсов, таймаутов, некорректных входных данных
- **Компонент**: Логическая единица системы (класс, модуль, функция, UI-компонент)

## Правила Языка Документации

### Язык Спецификаций и Документации

- **Требования (requirements.md)**: Должны быть написаны на русском языке
- **Дизайн (design.md)**: Должны быть написан на русском языке
- **Списки задач (tasks.md)**: Должны быть написаны на русском языке
- **Комментарии в коде**: Должны быть на английском языке
- **Названия файлов и переменных**: Должны быть на английском языке

### Исключения

- **Технические термины**: Можно использовать английские термины в русском тексте (например, "OAuth", "IPC", "API")
- **Названия компонентов**: Всегда на английском языке (см. раздел ниже)

## Правила Именования Компонентов

При написании спецификаций и документации:

- **Названия компонентов** должны быть написаны на английском языке
- **Не используйте подчеркивания** в названиях компонентов
- **Можно использовать несколько слов** для описания компонента
- **При ссылке на компоненты** всегда заключайте их в кавычки

### Примеры правильного именования:

✅ **Правильно:**

- "Main Process" (вместо Главный_Процесс)
- "OAuth Flow" (вместо Поток_OAuth)
- "Sidebar State" (вместо Состояние_Сайдбара)
- "Database Connection" (вместо Соединение*С*Базой_Данных)
- "Logo Component" (вместо Компонент_Логотипа)

❌ **Неправильно:**

- Главный_Процесс
- OAuth_Flow
- Sidebar_State
- Database_Connection
- Logo_Component

### Использование в тексте:

```markdown
КОГДА "Main Process" инициализируется, ТО "Renderer Process" ДОЛЖЕН запуститься
ЕСЛИ "OAuth Flow" завершается успешно, ТО "User Session" ДОЛЖНА быть создана
```

## Правила Написания Кода

### Обязательные Комментарии с Требованиями

**КРИТИЧЕСКИ ВАЖНО**: Каждый фрагмент кода ДОЛЖЕН содержать комментарии со ссылками на требования, которые он реализует.

#### Формат комментариев:

```typescript
// Requirements: requirement-id.1.1, requirement-id.1.2
function implementFeature() {
  // Код реализации
}
```

#### Примеры правильного оформления:

✅ **Правильно:**

```typescript
// Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2
export function generateOauthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Requirements: sidebar-navigation.1.3, sidebar-navigation.1.4
export class SidebarComponent {
  // Requirements: sidebar-navigation.1.5
  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }
}
```

```typescript
// Requirements: platform-foundation.3.1, platform-foundation.3.4
describe("IPC Handlers", () => {
  /* Preconditions: requirement test files exist.
     Action: scan tests for requirement IDs.
     Assertions: each requirement is referenced in test comments.
     Requirements: testing-infrastructure.1.1 */
  it("covers each requirement in unit tests", () => {
    // Тест реализация
  });
});
```

❌ **Неправильно:**

```typescript
// Генерирует состояние OAuth
function generateOauthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Компонент сайдбара
class SidebarComponent {
  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }
}
```

#### Требования к комментариям:

- **Обязательность**: Каждая функция, класс, метод ДОЛЖНЫ иметь комментарий с требованиями
- **Точность**: Указывать только те требования, которые непосредственно реализует данный код
- **Актуальность**: Обновлять комментарии при изменении кода или требований
- **Формат**: Использовать точный формат `// Requirements: req-id.1.1, req-id.1.2`

### Обязательная Структура Тестов

**КРИТИЧЕСКИ ВАЖНО**: Каждый тест ДОЛЖЕН содержать структурированный комментарий с описанием всех аспектов тестирования.

#### Формат комментариев для тестов:

```typescript
/* Preconditions: описание начального состояния системы
   Action: описание выполняемого действия
   Assertions: описание ожидаемых результатов и проверок
   Requirements: requirement-id.1.1, requirement-id.1.2 */
it("should perform expected behavior", () => {
  // Тест реализация
});
```

#### Примеры правильного оформления тестов:

✅ **Правильно:**

```typescript
describe("Auth IPC Handlers", () => {
  /* Preconditions: Google OAuth client is configured, no existing tokens
     Action: call auth:open-google IPC handler with no parameters
     Assertions: returns success true, opens external browser with auth URL
     Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2 */
  it("should handle valid auth:open-google request", async () => {
    const result = await handler({}, undefined);
    expect(result).toEqual({ success: true });
    expect(mockedShell.openExternal).toHaveBeenCalled();
  });

  /* Preconditions: database contains valid non-expired tokens
     Action: call auth:get-state IPC handler
     Assertions: returns authorized true
     Requirements: google-oauth-auth.1.5, google-oauth-auth.1.6 */
  it("should return authorized true for valid tokens", async () => {
    mockedReadTokens.mockReturnValue({
      accessToken: "valid-token",
      expiresAt: Date.now() + 120000,
    });

    const result = await handler({}, undefined);
    expect(result).toEqual({ authorized: true });
  });
});
```

```typescript
describe("Sidebar State Management", () => {
  /* Preconditions: database is empty, no sidebar state stored
     Action: call sidebar:get-state IPC handler
     Assertions: returns collapsed false (default state)
     Requirements: sidebar-navigation.1.1, sidebar-navigation.1.2 */
  it("should return default state when no database record exists", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await handler({}, undefined);
    expect(result).toEqual({ collapsed: false });
  });

  /* Preconditions: valid collapsed parameter provided
     Action: call sidebar:set-state with collapsed: true
     Assertions: database updated with "1", returns success true
     Requirements: sidebar-navigation.1.3, sidebar-navigation.1.4 */
  it("should save collapsed state to database", async () => {
    const result = await handler({}, { collapsed: true });

    expect(result).toEqual({ success: true });
    expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "1");
  });
});
```

❌ **Неправильно:**

```typescript
// Тест авторизации
it("should handle auth request", async () => {
  const result = await handler({}, undefined);
  expect(result.success).toBe(true);
});

// Проверяет состояние сайдбара
it("gets sidebar state", async () => {
  const result = await handler({}, undefined);
  expect(result.collapsed).toBe(false);
});
```

#### Требования к структуре тестов:

- **Предусловия (Preconditions)**: Четко описать начальное состояние системы, моков, данных
- **Действие (Action)**: Конкретно указать, какое действие выполняется в тесте
- **Постусловия (Assertions)**: Детально описать все ожидаемые результаты и проверки
- **Требования (Requirements)**: Перечислить все требования, которые покрывает данный тест
- **Обязательность**: Каждый тест ДОЛЖЕН содержать все четыре компонента
- **Формат**: Использовать точный формат многострочного комментария перед `it()`

## Обязательная Валидация Изменений

**КРИТИЧЕСКИ ВАЖНО**: Каждое изменение в коде, спецификациях или тестах ДОЛЖНО быть провалидировано перед завершением работы.

### 1. Валидация Спецификаций

Все спецификации ДОЛЖНЫ быть:

- **Полными**: Покрывать все аспекты функциональности
- **Непротиворечивыми**: Не содержать конфликтующих требований
- **Не избыточными**: Не дублировать требования между спецификациями

**Действия при нарушении:**

- Исправить спецификации самостоятельно, если проблема очевидна
- Уточнить у пользователя при неясностях или конфликтах требований

### 2. Автоматическая Валидация

Для упрощения процесса валидации используйте:

```bash
npm run validate
```

Скрипт автоматически выполняет все необходимые проверки в правильном порядке и исправляет проблемы ESLint/Prettier где возможно.

**Требования:**

- Все проверки ДОЛЖНЫ проходить без ошибок
- При падении проверок: исправить код или обновить тесты
- Новая функциональность ДОЛЖНА быть покрыта тестами
- **МАКСИМАЛЬНОЕ ПОКРЫТИЕ**: Код и требования ДОЛЖНЫ быть максимально покрыты как модульными, так и функциональными тестами (см. определения терминов)
- **КРАЕВЫЕ СЛУЧАИ**: Особое внимание ДОЛЖНО уделяться тестированию согласно определениям "Краевые случаи" и "Исключительные ситуации"

### 3. Порядок Валидации

Используйте автоматический скрипт валидации:

```bash
npm run validate
```

### 4. Критерии Завершения

Работа считается завершенной ТОЛЬКО когда:

- ✅ Все спецификации корректны и согласованы
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Prettier форматирование корректно
- ✅ Все модульные тесты проходят
- ✅ Все функциональные тесты проходят
- ✅ Покрытие тестами соответствует требованиям
- ✅ Все требования покрыты тестами
- ✅ Соблюдены стандарты "Максимального покрытия кода", "Краевых случаев" и "Исключительных ситуаций" (см. определения терминов)
- ✅ **Код содержит комментарии с требованиями**: Все функции, классы и методы имеют ссылки на реализуемые требования
- ✅ **Тесты имеют правильную структуру**: Каждый тест содержит Preconditions, Action, Assertions, Requirements
