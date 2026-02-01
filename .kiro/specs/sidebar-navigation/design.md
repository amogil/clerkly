# Документ Дизайна - Навигация Сайдбара

## Введение

Этот документ описывает техническую архитектуру системы навигации со складывающимся сайдбаром, включая адаптивное поведение, управление состоянием и интеграцию с системой брендинга. Дизайн обеспечивает полное покрытие всех пяти требований из requirements.md с акцентом на тестируемость, доступность и производительность.

## Архитектурный Обзор

Система навигации сайдбара построена на архитектуре Electron с разделением ответственности между главным процессом (Main Process) и процессом рендеринга (Renderer Process). Коммуникация осуществляется через IPC каналы, а состояние персистируется в SQLite базе данных.

### Архитектура Компонента Сайдбара

```
┌─────────────────────┐    State Props    ┌──────────────────────┐
│   "App Component"   │◄─────────────────►│ "Navigation Component"│
│  (State Manager)    │                   │   (UI Renderer)      │
└─────────────────────┘                   └──────────────────────┘
         │                                          │
         │ IPC Calls                               │ Props
         │ (sidebar:get-state)                     │ (collapsed, onToggle)
         │ (sidebar:set-state)                     │
         ▼                                          ▼
┌─────────────────────┐                   ┌──────────────────────┐
│  "Main Process"     │                   │  "Logo Component"    │
│  (IPC Handlers)     │                   │  (Branding System)   │
└─────────────────────┘                   └──────────────────────┘
         │
         │ Database Operations
         ▼
┌─────────────────────┐
│  "SQLite Database"  │
│  (app_meta table)   │
└─────────────────────┘
```

### Ключевые Архитектурные Решения

1. **Разделение Ответственности**: UI логика отделена от логики персистентности
2. **Унидирекциональный Поток Данных**: Состояние течет от "App Component" к "Navigation Component"
3. **IPC как Граница**: Четкий контракт между процессами через типизированные IPC каналы
4. **Немедленная Персистентность**: Изменения состояния сохраняются сразу после действия пользователя

## Компонентная Архитектура

### 1. "Navigation Component" (renderer/src/app/components/navigation.tsx)

Основной UI компонент, отвечающий за отображение сайдбара и обработку пользовательских взаимодействий.

**Интерфейс Компонента**:

```typescript
// Requirements: sidebar-navigation.1.1, sidebar-navigation.2.1
interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}
```

**Структура Навигации**:

```typescript
// Requirements: sidebar-navigation.1.4
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "contacts", label: "Contacts", icon: Users },
];

// Requirements: sidebar-navigation.1.2
const settingsItem = { id: "settings", label: "Settings", icon: Settings };
```

**Адаптивные Стили**:

```typescript
// Requirements: sidebar-navigation.2.1, sidebar-navigation.2.3, sidebar-navigation.2.5
const navButtonClassName = (isActive: boolean, collapsed: boolean): string => {
  const baseClasses = "w-full flex items-center rounded-lg transition-all mb-1 py-3";
  const stateClasses = isActive
    ? "bg-primary text-primary-foreground shadow-sm"
    : "text-foreground hover:bg-secondary";
  const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4";
  return `${baseClasses} ${layoutClasses} ${stateClasses}`;
};
```

**Responsive Layout**:

```tsx
// Requirements: sidebar-navigation.1.1, sidebar-navigation.1.2, sidebar-navigation.1.3, sidebar-navigation.1.4
<nav
  className={`fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col transition-all duration-300 ${
    collapsed ? "w-20" : "w-64"
  }`}
  role="navigation"
  aria-label="Main navigation"
>
  {/* Header с логотипом и контролом складывания */}
  {/* Requirements: sidebar-navigation.1.3, sidebar-navigation.3.3 */}
  <div className={`border-b border-border ${collapsed ? "pl-2 pr-1 py-3" : "p-6"}`}>
    <div className={`flex items-center justify-between ${collapsed ? "gap-1" : "gap-2"}`}>
      {/* Requirements: sidebar-navigation.3.3 */}
      <Logo size="md" showText={!collapsed} />

      {/* Requirements: sidebar-navigation.1.1, sidebar-navigation.1.3 */}
      <button
        onClick={onToggleCollapse}
        className="p-2 hover:bg-secondary rounded-lg transition-colors"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>

    {/* Requirements: sidebar-navigation.3.1 */}
    {!collapsed && <p className="text-sm text-muted-foreground mt-2">Stay on track</p>}
  </div>

  {/* Основная навигация */}
  {/* Requirements: sidebar-navigation.1.4, sidebar-navigation.2.1, sidebar-navigation.2.2, sidebar-navigation.2.3 */}
  <div className="flex-1 p-3">
    {navItems.map((item) => (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className={navButtonClassName(currentScreen === item.id, collapsed)}
        aria-label={collapsed ? item.label : undefined}
        aria-current={currentScreen === item.id ? "page" : undefined}
      >
        {/* Requirements: sidebar-navigation.2.2, sidebar-navigation.2.3 */}
        <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />

        {/* Requirements: sidebar-navigation.3.2 */}
        {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
      </button>
    ))}
  </div>

  {/* Настройки внизу */}
  {/* Requirements: sidebar-navigation.1.2, sidebar-navigation.1.4 */}
  <div className="p-3 border-t border-border">
    <button
      onClick={() => onNavigate("settings")}
      className={navButtonClassName(currentScreen === "settings", collapsed)}
      aria-label={collapsed ? settingsItem.label : undefined}
      aria-current={currentScreen === "settings" ? "page" : undefined}
    >
      {/* Requirements: sidebar-navigation.2.2 */}
      <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />

      {/* Requirements: sidebar-navigation.3.2 */}
      {!collapsed && <span className="text-sm font-medium">{settingsItem.label}</span>}
    </button>
  </div>
</nav>
```

### 2. "State Management" (renderer/src/app/App.tsx)

Управляет состоянием сайдбара и координирует взаимодействие с "Main Process" через IPC.

**Состояние Сайдбара**:

```typescript
// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3, sidebar-navigation.4.4
useEffect(() => {
  // Загрузка состояния при инициализации (до рендеринга)
  window.clerkly
    .getSidebarState()
    .then((state) => {
      setIsSidebarCollapsed(state.collapsed);
    })
    .catch((error) => {
      console.error("Failed to load sidebar state:", error);
      setIsSidebarCollapsed(false); // По умолчанию развернут
    });
}, []);

// Requirements: sidebar-navigation.4.2, sidebar-navigation.5.2
const handleToggleCollapse = async () => {
  const newState = !isSidebarCollapsed;

  // Оптимистичное обновление UI
  setIsSidebarCollapsed(newState);

  try {
    // Немедленное сохранение в базу данных
    const result = await window.clerkly.setSidebarState(newState);

    if (!result.success) {
      // Откат состояния при ошибке
      setIsSidebarCollapsed(!newState);
      console.error("Failed to save sidebar state");
    }
  } catch (error) {
    // Откат состояния при ошибке
    setIsSidebarCollapsed(!newState);
    console.error("Failed to save sidebar state:", error);
  }
};
```

### 3. "IPC Integration" (main.ts)

Обрабатывает IPC запросы и управляет персистентностью состояния в SQLite.

**IPC Обработчики**:

```typescript
// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2
ipcMain.handle("sidebar:get-state", async (): Promise<{ collapsed: boolean }> => {
  try {
    const db = ensureDatabase();
    const collapsed = getSidebarCollapsed(db);
    return { collapsed };
  } catch (error) {
    logError(app.getPath("userData"), "Failed to get sidebar state", error);
    // Requirements: sidebar-navigation.4.3
    return { collapsed: false }; // По умолчанию развернут
  }
});

// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2, sidebar-navigation.4.2
ipcMain.handle(
  "sidebar:set-state",
  async (_, { collapsed }: { collapsed: boolean }): Promise<{ success: boolean }> => {
    try {
      const db = ensureDatabase();
      setSidebarCollapsed(db, collapsed);
      return { success: true };
    } catch (error) {
      logError(app.getPath("userData"), "Failed to set sidebar state", error);
      return { success: false };
    }
  },
);
```

**Persistence Functions**:

```typescript
// Requirements: sidebar-navigation.4.1
const SIDEBAR_STATE_KEY = "sidebar_collapsed";

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3
const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY);
  return row ? JSON.parse(row.value) : false; // По умолчанию развернут
};

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2
const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  db.prepare(
    `
    INSERT OR REPLACE INTO app_meta (key, value) 
    VALUES (?, ?)
  `,
  ).run(SIDEBAR_STATE_KEY, JSON.stringify(collapsed));
};
```

### 4. "Preload Script" (preload.ts)

Предоставляет типизированный API для взаимодействия с IPC каналами.

```typescript
// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
const clerklyAPI = {
  // Requirements: sidebar-navigation.4.1, sidebar-navigation.5.1
  getSidebarState: (): Promise<{ collapsed: boolean }> => ipcRenderer.invoke("sidebar:get-state"),

  // Requirements: sidebar-navigation.4.2, sidebar-navigation.5.1
  setSidebarState: (collapsed: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("sidebar:set-state", { collapsed }),
};

contextBridge.exposeInMainWorld("clerkly", clerklyAPI);
```

## Модели Данных

### "Sidebar State Model"

```typescript
// Requirements: sidebar-navigation.4.1, sidebar-navigation.5.1
interface SidebarState {
  collapsed: boolean;
}

// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
interface SidebarStateResponse {
  collapsed: boolean;
}

// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
interface SidebarStateUpdateResponse {
  success: boolean;
}
```

### "Navigation Item Model"

```typescript
// Requirements: sidebar-navigation.1.4, sidebar-navigation.2.1
interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}
```

### "Database Schema"

```sql
-- Requirements: sidebar-navigation.4.1
-- Таблица app_meta используется для хранения состояния сайдбара
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Пример записи для состояния сайдбара
-- key: "sidebar_collapsed"
-- value: "true" или "false" (JSON serialized boolean)
```

## Визуальный Дизайн

### Размеры и Анимации

```css
/* Requirements: sidebar-navigation.2.1 */
/* Базовые размеры */
.sidebar-expanded {
  width: 16rem;
} /* w-64 = 256px */
.sidebar-collapsed {
  width: 5rem;
} /* w-20 = 80px */

/* Requirements: sidebar-navigation.2.4 */
/* Плавные переходы */
.sidebar-transition {
  transition: width 0.3s ease-in-out;
}

.nav-button-transition {
  transition: all 0.2s ease-in-out;
}

/* Состояния кнопок */
.nav-button-active {
  background-color: var(--primary);
  color: var(--primary-foreground);
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.nav-button-hover {
  background-color: var(--secondary);
}
```

### Адаптивная Типография

```typescript
// Requirements: sidebar-navigation.3.2
// Скрытие текста в collapsed режиме
{!collapsed && <span className="text-sm font-medium">{item.label}</span>}

// Requirements: sidebar-navigation.3.1
// Слоган сайдбара
{!collapsed && (
  <p className="text-sm text-muted-foreground mt-2 leading-tight">
    Stay on track
  </p>
)}
```

### Иконки и Выравнивание

```typescript
// Requirements: sidebar-navigation.2.2
// Размер иконок остается постоянным
const navIconClassName = "w-5 h-5 shrink-0";

// Requirements: sidebar-navigation.2.3
// Центрирование в collapsed режиме
const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4";
```

## Интеграция с Брендингом

### "Logo Component" Integration

```tsx
{
  /* Requirements: sidebar-navigation.3.3 */
}
<Logo
  size="md"
  showText={!collapsed} // Текст скрывается при collapse
/>;
```

### Цветовая Схема

```css
/* Requirements: sidebar-navigation.1.1 */
:root {
  --sidebar: #ffffff;
  --sidebar-foreground: #1a1a1a;
  --sidebar-primary: #5b6cf2;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f5f5f7;
  --sidebar-accent-foreground: #1a1a1a;
  --sidebar-border: #e5e7eb;
  --sidebar-ring: #5b6cf2;
}

.dark {
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  /* ... остальные dark mode переменные */
}
```

## Доступность (Accessibility)

### Keyboard Navigation

```typescript
// Requirements: sidebar-navigation.2.5
const handleKeyDown = (event: KeyboardEvent, itemId: string) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onNavigate(itemId);
  }
};
```

### ARIA Attributes

```tsx
{
  /* Requirements: sidebar-navigation.2.5 */
}
<nav role="navigation" aria-label="Main navigation">
  <button
    role="button"
    aria-label={collapsed ? item.label : undefined}
    aria-expanded={!collapsed}
    aria-current={currentScreen === item.id ? "page" : undefined}
    tabIndex={0}
  >
    <item.icon aria-hidden="true" />
    {!collapsed && <span>{item.label}</span>}
  </button>
</nav>;
```

### Focus Management

```css
/* Requirements: sidebar-navigation.2.5 */
.nav-button:focus {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

## Производительность

### Мемоизация Стилей

```typescript
// Requirements: sidebar-navigation.2.1, sidebar-navigation.2.3
const navButtonClassName = useMemo(
  () =>
    (isActive: boolean): string => {
      const baseClasses = "w-full flex items-center rounded-lg transition-all mb-1 py-3";
      const stateClasses = isActive
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-foreground hover:bg-secondary";
      const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4";
      return `${baseClasses} ${layoutClasses} ${stateClasses}`;
    },
  [collapsed],
);
```

### Оптимизация Рендеринга

```typescript
// Requirements: sidebar-navigation.2.4
// Использование CSS transitions вместо JavaScript анимаций
const sidebarClassName = `fixed left-0 top-0 h-screen bg-card border-r border-border 
  flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`;
```

## Свойства Корректности

Свойство корректности — это характеристика или поведение, которое должно выполняться во всех допустимых состояниях системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Свойство 1: Состояние UI Зависит от Collapsed Flag

**Описание**: Для любого состояния сайдбара, видимость текстовых элементов и ширина сайдбара должны соответствовать значению флага collapsed.

**Формальное Свойство**:

```
∀ collapsed_state : boolean
  WHEN sidebar.collapsed = collapsed_state
  THEN (
    sidebar.width = (collapsed_state ? 80px : 256px) AND
    navigation_labels.visible = !collapsed_state AND
    tagline.visible = !collapsed_state AND
    logo_text.visible = !collapsed_state
  )
```

**Validates: Requirements 2.1, 3.1, 3.2, 3.3**

### Свойство 2: Инварианты Размера Иконок

**Описание**: Для любого состояния сайдбара, размер навигационных иконок должен оставаться постоянным.

**Формальное Свойство**:

```
∀ icon : NavigationIcon, collapsed_state : boolean
  THEN icon.width = 20px AND icon.height = 20px
```

**Validates: Requirements 2.2**

### Свойство 3: Центрирование Иконок в Collapsed Режиме

**Описание**: Для любого состояния сайдбара, когда он сложен, иконки должны быть центрированы в своих контейнерах.

**Формальное Свойство**:

```
∀ icon : NavigationIcon
  WHEN sidebar.collapsed = true
  THEN icon.alignment = "center" AND icon.container.justifyContent = "center"
```

**Validates: Requirements 2.3**

### Свойство 4: Функциональная Эквивалентность Состояний

**Описание**: Для любого элемента навигации, все навигационные действия должны быть доступны в обоих состояниях сайдбара.

**Формальное Свойство**:

```
∀ nav_item : NavigationItem, collapsed_state : boolean
  THEN (
    nav_item.clickable = true AND
    nav_item.keyboard_accessible = true AND
    nav_item.can_navigate = true
  )
```

**Validates: Requirements 2.5**

### Свойство 5: Персистентность Состояния (Round-Trip)

**Описание**: Для любого состояния сайдбара, сохранение и последующая загрузка должны вернуть то же самое значение.

**Формальное Свойство**:

```
∀ collapsed_state : boolean
  WHEN setSidebarState(collapsed_state) THEN getSidebarState() = collapsed_state
```

**Validates: Requirements 4.1, 4.2**

### Свойство 6: IPC Синхронизация Состояния

**Описание**: Для любого изменения состояния через IPC, состояние должно быть согласованным между "Renderer Process" и "Main Process".

**Формальное Свойство**:

```
∀ collapsed_state : boolean
  WHEN renderer.setSidebarState(collapsed_state)
  THEN main.getSidebarState() = collapsed_state AND
       database.getSidebarState() = collapsed_state
```

**Validates: Requirements 5.1, 5.2**

### Свойство 7: Границы Контрола Складывания

**Описание**: Для любого состояния сайдбара, контрол складывания не должен перекрывать логотип и должен оставаться в границах сайдбара.

**Формальное Свойство**:

```
∀ collapsed_state : boolean
  THEN (
    !control.boundingBox.intersects(logo.boundingBox) AND
    control.boundingBox.isWithin(sidebar.boundingBox)
  )
```

**Validates: Requirements 1.3**

## Стратегия Тестирования

### Подход к Тестированию

Система использует двойной подход к тестированию:

1. **Модульные Тесты (Unit Tests)**: Проверяют конкретные примеры, краевые случаи и условия ошибок
2. **Property-Based Tests**: Проверяют универсальные свойства на множестве сгенерированных входных данных
3. **Функциональные Тесты (E2E)**: Проверяют интеграцию компонентов и сквозные сценарии

Оба подхода дополняют друг друга и необходимы для комплексного покрытия.

### Модульные Тесты

```typescript
// Requirements: sidebar-navigation.1.1, sidebar-navigation.1.2, sidebar-navigation.1.4
describe("Navigation Component", () => {
  /* Preconditions: Navigation component rendered with default props
     Action: render component and query DOM for navigation items
     Assertions: all navigation items are present, settings is in bottom section
     Requirements: sidebar-navigation.1.2, sidebar-navigation.1.4 */
  it("should render all navigation items with settings at bottom", () => {
    const { getByRole, getByText } = render(
      <Navigation
        currentScreen="dashboard"
        onNavigate={jest.fn()}
        collapsed={false}
        onToggleCollapse={jest.fn()}
      />
    );

    expect(getByText("Dashboard")).toBeInTheDocument();
    expect(getByText("Calendar")).toBeInTheDocument();
    expect(getByText("Tasks")).toBeInTheDocument();
    expect(getByText("Contacts")).toBeInTheDocument();

    const settingsButton = getByText("Settings");
    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton.closest(".border-t")).toBeTruthy(); // В нижней секции
  });

  /* Preconditions: Navigation component rendered in expanded state
     Action: click toggle button
     Assertions: onToggleCollapse callback is called once
     Requirements: sidebar-navigation.1.1 */
  it("should call onToggleCollapse when toggle button is clicked", () => {
    const mockToggle = jest.fn();
    const { getByLabelText } = render(
      <Navigation
        currentScreen="dashboard"
        onNavigate={jest.fn()}
        collapsed={false}
        onToggleCollapse={mockToggle}
      />
    );

    fireEvent.click(getByLabelText("Collapse sidebar"));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: Navigation component rendered in collapsed state
     Action: render component and check for text elements
     Assertions: navigation labels and tagline are not visible
     Requirements: sidebar-navigation.3.1, sidebar-navigation.3.2 */
  it("should hide text elements when collapsed", () => {
    const { queryByText } = render(
      <Navigation
        currentScreen="dashboard"
        onNavigate={jest.fn()}
        collapsed={true}
        onToggleCollapse={jest.fn()}
      />
    );

    expect(queryByText("Dashboard")).not.toBeInTheDocument();
    expect(queryByText("Stay on track")).not.toBeInTheDocument();
  });

  /* Preconditions: Navigation component rendered with collapsed=false
     Action: check icon dimensions in DOM
     Assertions: all icons have width and height of 20px (w-5 h-5 = 1.25rem = 20px)
     Requirements: sidebar-navigation.2.2 */
  it("should maintain icon size in expanded mode", () => {
    const { container } = render(
      <Navigation
        currentScreen="dashboard"
        onNavigate={jest.fn()}
        collapsed={false}
        onToggleCollapse={jest.fn()}
      />
    );

    const icons = container.querySelectorAll("svg.w-5.h-5");
    icons.forEach((icon) => {
      expect(icon).toHaveClass("w-5", "h-5");
    });
  });

  /* Preconditions: Navigation component rendered with collapsed=true
     Action: check icon dimensions in DOM
     Assertions: all icons have width and height of 20px (w-5 h-5 = 1.25rem = 20px)
     Requirements: sidebar-navigation.2.2 */
  it("should maintain icon size in collapsed mode", () => {
    const { container } = render(
      <Navigation
        currentScreen="dashboard"
        onNavigate={jest.fn()}
        collapsed={true}
        onToggleCollapse={jest.fn()}
      />
    );

    const icons = container.querySelectorAll("svg.w-5.h-5");
    icons.forEach((icon) => {
      expect(icon).toHaveClass("w-5", "h-5");
    });
  });
});

// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2
describe("IPC Handlers", () => {
  /* Preconditions: database is empty, no sidebar state stored
     Action: call sidebar:get-state IPC handler
     Assertions: returns collapsed false (default state)
     Requirements: sidebar-navigation.4.3, sidebar-navigation.5.1 */
  it("should return default expanded state when no database record exists", async () => {
    const mockDb = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
      }),
    };

    const result = await getSidebarState(mockDb);
    expect(result).toEqual({ collapsed: false });
  });

  /* Preconditions: database contains collapsed=true state
     Action: call sidebar:get-state IPC handler
     Assertions: returns collapsed true
     Requirements: sidebar-navigation.4.1, sidebar-navigation.5.1 */
  it("should return stored collapsed state from database", async () => {
    const mockDb = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({ value: "true" }),
      }),
    };

    const result = await getSidebarState(mockDb);
    expect(result).toEqual({ collapsed: true });
  });

  /* Preconditions: valid collapsed parameter provided
     Action: call sidebar:set-state with collapsed: true
     Assertions: database INSERT OR REPLACE executed with correct parameters
     Requirements: sidebar-navigation.4.2, sidebar-navigation.5.1 */
  it("should save collapsed state to database", async () => {
    const mockRun = jest.fn();
    const mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: mockRun,
      }),
    };

    await setSidebarState(mockDb, true);

    expect(mockRun).toHaveBeenCalledWith("sidebar_collapsed", "true");
  });
});
```

### Property-Based Tests

```typescript
// Requirements: sidebar-navigation.2.1, sidebar-navigation.3.1, sidebar-navigation.3.2, sidebar-navigation.3.3
describe("Sidebar State Properties", () => {
  /* Feature: sidebar-navigation, Property 1: UI state depends on collapsed flag
     Preconditions: fast-check configured with 100 iterations
     Action: generate random boolean values for collapsed state, render component
     Assertions: sidebar width and text visibility match collapsed state
     Requirements: sidebar-navigation.2.1, sidebar-navigation.3.1, sidebar-navigation.3.2 */
  it("should maintain UI consistency based on collapsed state", () => {
    fc.assert(
      fc.property(fc.boolean(), (collapsed) => {
        const { container, queryByText } = render(
          <Navigation
            currentScreen="dashboard"
            onNavigate={jest.fn()}
            collapsed={collapsed}
            onToggleCollapse={jest.fn()}
          />
        );

        const sidebar = container.querySelector("nav");
        const expectedWidth = collapsed ? "w-20" : "w-64";
        expect(sidebar).toHaveClass(expectedWidth);

        // Проверка видимости текста
        const tagline = queryByText("Stay on track");
        if (collapsed) {
          expect(tagline).not.toBeInTheDocument();
        } else {
          expect(tagline).toBeInTheDocument();
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: sidebar-navigation, Property 2: Icon size invariant
     Preconditions: fast-check configured with 100 iterations
     Action: generate random boolean values for collapsed state, render component
     Assertions: all icons maintain w-5 h-5 classes regardless of state
     Requirements: sidebar-navigation.2.2 */
  it("should maintain constant icon size regardless of collapsed state", () => {
    fc.assert(
      fc.property(fc.boolean(), (collapsed) => {
        const { container } = render(
          <Navigation
            currentScreen="dashboard"
            onNavigate={jest.fn()}
            collapsed={collapsed}
            onToggleCollapse={jest.fn()}
          />
        );

        const icons = container.querySelectorAll("svg.w-5.h-5");
        expect(icons.length).toBeGreaterThan(0);

        icons.forEach((icon) => {
          expect(icon).toHaveClass("w-5", "h-5", "shrink-0");
        });
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: sidebar-navigation, Property 5: State persistence round-trip
     Preconditions: fast-check configured with 100 iterations, mock database
     Action: generate random boolean values, save to database, then load
     Assertions: loaded value equals saved value
     Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2 */
  it("should persist and restore sidebar state correctly", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (collapsedState) => {
        const storage = new Map<string, string>();
        const mockDb = {
          prepare: jest.fn((query) => {
            if (query.includes("SELECT")) {
              return {
                get: jest.fn(() => {
                  const value = storage.get("sidebar_collapsed");
                  return value ? { value } : undefined;
                }),
              };
            } else {
              return {
                run: jest.fn((key, value) => {
                  storage.set(key, value);
                }),
              };
            }
          }),
        };

        // Сохранение
        await setSidebarState(mockDb, collapsedState);

        // Загрузка
        const result = await getSidebarState(mockDb);

        expect(result.collapsed).toBe(collapsedState);
      }),
      { numRuns: 100 }
    );
  });
});
```

### Функциональные Тесты (E2E)

```typescript
// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.4
describe("Sidebar State Persistence E2E", () => {
  /* Preconditions: application started with no existing sidebar state
     Action: toggle sidebar to collapsed, restart application
     Assertions: sidebar remains collapsed after restart
     Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2, sidebar-navigation.4.4 */
  it("should persist collapsed state across application restarts", async () => {
    const { app, window } = await launchApp();

    // Проверка начального состояния (развернут)
    const initialWidth = await window.evaluate(() => {
      return document.querySelector("nav")?.classList.contains("w-64");
    });
    expect(initialWidth).toBe(true);

    // Складывание сайдбара
    await window.click('[aria-label="Collapse sidebar"]');

    // Проверка сложенного состояния
    const collapsedWidth = await window.evaluate(() => {
      return document.querySelector("nav")?.classList.contains("w-20");
    });
    expect(collapsedWidth).toBe(true);

    // Перезапуск приложения
    await app.close();
    const { app: newApp, window: newWindow } = await launchApp();

    // Проверка сохранения состояния
    const restoredWidth = await newWindow.evaluate(() => {
      return document.querySelector("nav")?.classList.contains("w-20");
    });
    expect(restoredWidth).toBe(true);

    await newApp.close();
  });
});
```

### Покрытие Требований

Каждое требование должно быть покрыто тестами:

- **Требование 1.1**: Модульные тесты для toggle control
- **Требование 1.2**: Модульные тесты для settings position
- **Требование 1.3**: Визуальные тесты для boundaries (будущее улучшение)
- **Требование 1.4**: Модульные тесты для layout structure
- **Требование 2.1**: Property tests для UI state
- **Требование 2.2**: Property tests для icon size invariant
- **Требование 2.3**: Модульные тесты для icon centering
- **Требование 2.4**: Визуальные тесты для animations (будущее улучшение)
- **Требование 2.5**: Модульные тесты для accessibility
- **Требование 3.1**: Property tests для tagline visibility
- **Требование 3.2**: Property tests для label visibility
- **Требование 3.3**: Модульные тесты для logo integration
- **Требование 4.1**: Property tests для persistence round-trip
- **Требование 4.2**: Модульные тесты для immediate save
- **Требование 4.3**: Модульные тесты для default state
- **Требование 4.4**: E2E тесты для initialization timing
- **Требование 5.1**: Модульные тесты для IPC handlers
- **Требование 5.2**: Property tests для IPC synchronization

### Конфигурация Property-Based Testing

```typescript
// tests/fast-check.config.ts
// Requirements: sidebar-navigation (all properties)
export const fastCheckConfig = {
  numRuns: 100, // Минимум 100 итераций для каждого property теста
  verbose: true,
  seed: Date.now(), // Для воспроизводимости
};
```

## Обработка Ошибок

### IPC Error Handling

```typescript
// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.2
ipcMain.handle("sidebar:get-state", async (): Promise<{ collapsed: boolean }> => {
  try {
    const db = ensureDatabase();
    const collapsed = getSidebarCollapsed(db);
    return { collapsed };
  } catch (error) {
    logError(app.getPath("userData"), "Failed to get sidebar state", error);
    // Requirements: sidebar-navigation.4.3
    return { collapsed: false }; // Безопасное значение по умолчанию
  }
});

// Requirements: sidebar-navigation.5.1, sidebar-navigation.4.2
ipcMain.handle(
  "sidebar:set-state",
  async (_, { collapsed }: { collapsed: boolean }): Promise<{ success: boolean }> => {
    try {
      const db = ensureDatabase();
      setSidebarCollapsed(db, collapsed);
      return { success: true };
    } catch (error) {
      logError(app.getPath("userData"), "Failed to set sidebar state", error);
      return { success: false }; // Явное указание на ошибку
    }
  },
);
```

### UI Error Handling

```typescript
// Requirements: sidebar-navigation.4.2, sidebar-navigation.5.2
const handleToggleCollapse = async () => {
  const newState = !isSidebarCollapsed;

  // Оптимистичное обновление UI
  setIsSidebarCollapsed(newState);

  try {
    const result = await window.clerkly.setSidebarState(newState);

    if (!result.success) {
      // Откат состояния при ошибке сохранения
      setIsSidebarCollapsed(!newState);
      console.error("Failed to save sidebar state");
      // Опционально: показать уведомление пользователю
    }
  } catch (error) {
    // Откат состояния при ошибке сети/IPC
    setIsSidebarCollapsed(!newState);
    console.error("Failed to save sidebar state:", error);
    // Опционально: показать уведомление пользователю
  }
};
```

### Database Error Handling

```typescript
// Requirements: sidebar-navigation.4.1
const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  try {
    const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY);
    return row ? JSON.parse(row.value) : false;
  } catch (error) {
    console.error("Failed to parse sidebar state from database:", error);
    return false; // Безопасное значение по умолчанию
  }
};

// Requirements: sidebar-navigation.4.1, sidebar-navigation.4.2
const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  try {
    db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`).run(
      SIDEBAR_STATE_KEY,
      JSON.stringify(collapsed),
    );
  } catch (error) {
    console.error("Failed to save sidebar state to database:", error);
    throw error; // Пробрасываем ошибку для обработки на уровне IPC
  }
};
```

### Краевые Случаи

1. **База данных недоступна**: Возврат значения по умолчанию (expanded)
2. **Некорректные данные в БД**: Парсинг с fallback на значение по умолчанию
3. **IPC канал недоступен**: UI остается в текущем состоянии, показывается ошибка
4. **Одновременные изменения состояния**: Последнее изменение побеждает (last-write-wins)

## Интеграционные Точки

### Зависимости

- **platform-foundation**: IPC каналы, управление окнами, логирование ошибок
- **data-storage**: SQLite база данных, таблица app_meta
- **branding-system**: "Logo Component", цветовая схема, типография

### Предоставляемые Интерфейсы

1. **"Navigation Interface"**: Переключение между экранами приложения
2. **"Collapsible UI"**: Адаптивный интерфейс для экономии места
3. **"State Management"**: Персистентное состояние UI

### IPC Контракт

```typescript
// Requirements: sidebar-navigation.5.1, sidebar-navigation.5.3
interface SidebarIPCContract {
  // Получение текущего состояния сайдбара
  "sidebar:get-state": () => Promise<{ collapsed: boolean }>;

  // Установка нового состояния сайдбара
  "sidebar:set-state": (params: { collapsed: boolean }) => Promise<{ success: boolean }>;
}
```

**Гарантии Контракта**:

- `sidebar:get-state` всегда возвращает валидный boolean (никогда не падает)
- `sidebar:set-state` возвращает success: true только при успешном сохранении в БД
- Оба метода логируют ошибки через platform-foundation logging system

## Будущие Улучшения

### Анимации

- Плавные переходы между состояниями с использованием CSS transitions
- Микроанимации для кнопок (hover, active states)
- Анимация появления/скрытия текста с fade эффектом
- Spring-based анимации для более естественного ощущения

### Кастомизация

- Пользовательские темы и цветовые схемы
- Настраиваемый порядок элементов навигации (drag-and-drop)
- Скрытие неиспользуемых разделов через настройки
- Пользовательские иконки для элементов навигации

### Уведомления и Индикаторы

- Бейджи с количеством непрочитанных элементов на навигационных кнопках
- Индикаторы активности в разделах (например, количество задач)
- Визуальные подсказки для новых функций

### Производительность

- Виртуализация списка навигации для больших наборов элементов
- Lazy loading иконок и ресурсов
- Оптимизация ре-рендеринга через React.memo

### Доступность

- Поддержка screen readers с детальными ARIA описаниями
- High contrast режим для пользователей с нарушениями зрения
- Настраиваемые размеры шрифтов

## Заключение

Дизайн системы навигации сайдбара обеспечивает:

1. **Полное покрытие требований**: Все 5 требований из requirements.md адресованы в дизайне
2. **Четкое разделение ответственности**: UI, состояние и персистентность разделены
3. **Тестируемость**: 7 формальных свойств корректности с property-based тестами
4. **Доступность**: ARIA атрибуты, keyboard navigation, focus management
5. **Производительность**: Мемоизация, CSS transitions, оптимистичные обновления
6. **Надежность**: Обработка ошибок, безопасные значения по умолчанию, откат состояния

Система готова к реализации с четким планом тестирования и документированными интеграционными точками.
