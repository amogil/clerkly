# Документ Дизайна - Навигация Сайдбара

## Введение

Этот документ описывает техническую архитектуру системы навигации со складывающимся сайдбаром, включая адаптивное поведение, управление состоянием и интеграцию с системой брендинга.

## Архитектурный Обзор

### Архитектура Компонента Сайдбара

```
┌─────────────────┐    Состояние     ┌─────────────────┐
│   App.tsx       │◄────────────────►│ Navigation.tsx  │
│ (State Manager) │                  │ (UI Component)  │
└─────────────────┘                  └─────────────────┘
         │                                    │
         │ IPC                               │ Props
         ▼                                    ▼
┌─────────────────┐                  ┌─────────────────┐
│   Main Process  │                  │ Logo Component  │
│ (Persistence)   │                  │ (Branding)      │
└─────────────────┘                  └─────────────────┘
         │
         ▼
┌─────────────────┐
│   SQLite DB     │
│ (app_meta)      │
└─────────────────┘
```

## Компонентная Архитектура

### 1. Navigation Component (renderer/src/app/components/navigation.tsx)

**Интерфейс Компонента**:
```typescript
interface NavigationProps {
  currentScreen: string
  onNavigate: (screen: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}
```

**Структура Навигации**:
```typescript
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "contacts", label: "Contacts", icon: Users }
]

const settingsItem = { id: "settings", label: "Settings", icon: Settings }
```

**Адаптивные Стили**:
```typescript
const navButtonClassName = (isActive: boolean): string => {
  const baseClasses = "w-full flex items-center rounded-lg transition-all mb-1 py-3"
  const stateClasses = isActive
    ? "bg-primary text-primary-foreground shadow-sm"
    : "text-foreground hover:bg-secondary"
  const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4"
  return `${baseClasses} ${layoutClasses} ${stateClasses}`
}
```

**Responsive Layout**:
```tsx
<nav className={`fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col ${
  collapsed ? "w-20" : "w-64"
}`}>
  {/* Header с логотипом */}
  <div className={`border-b border-border ${collapsed ? "pl-2 pr-1 py-3" : "p-6"}`}>
    <div className={`flex items-center justify-between ${collapsed ? "gap-1" : "gap-2"}`}>
      <Logo size="md" showText={!collapsed} />
      <button onClick={onToggleCollapse}>
        {collapsed ? <ChevronRight /> : <ChevronLeft />}
      </button>
    </div>
    {!collapsed && (
      <p className="text-sm text-muted-foreground mt-2">Stay on track</p>
    )}
  </div>
  
  {/* Основная навигация */}
  <div className="flex-1 p-3">
    {navItems.map(item => (
      <button key={item.id} className={navButtonClassName(currentScreen === item.id)}>
        <item.icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </button>
    ))}
  </div>
  
  {/* Настройки внизу */}
  <div className="p-3 border-t border-border">
    <button className={navButtonClassName(currentScreen === "settings")}>
      <Settings className="w-5 h-5 shrink-0" />
      {!collapsed && <span>Settings</span>}
    </button>
  </div>
</nav>
```

### 2. State Management (renderer/src/app/App.tsx)

**Состояние Сайдбара**:
```typescript
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

// Загрузка состояния при инициализации
useEffect(() => {
  window.clerkly
    .getSidebarState()
    .then((state) => {
      setIsSidebarCollapsed(state.collapsed)
    })
    .catch(() => {
      setIsSidebarCollapsed(false) // По умолчанию развернут
    })
}, [])

// Обработчик переключения
const handleToggleCollapse = async () => {
  const newState = !isSidebarCollapsed
  setIsSidebarCollapsed(newState)
  
  try {
    await window.clerkly.setSidebarState(newState)
  } catch (error) {
    // Откат состояния при ошибке
    setIsSidebarCollapsed(!newState)
    console.error("Failed to save sidebar state:", error)
  }
}
```

### 3. IPC Integration (main.ts)

**IPC Обработчики**:
```typescript
ipcMain.handle("sidebar:get-state", async (): Promise<{ collapsed: boolean }> => {
  try {
    const db = ensureDatabase()
    const collapsed = getSidebarCollapsed(db)
    return { collapsed }
  } catch (error) {
    logError(app.getPath("userData"), "Failed to get sidebar state", error)
    return { collapsed: false }
  }
})

ipcMain.handle("sidebar:set-state", async (_, { collapsed }: { collapsed: boolean }): Promise<{ success: boolean }> => {
  try {
    const db = ensureDatabase()
    setSidebarCollapsed(db, collapsed)
    return { success: true }
  } catch (error) {
    logError(app.getPath("userData"), "Failed to set sidebar state", error)
    return { success: false }
  }
})
```

**Persistence Functions**:
```typescript
const SIDEBAR_STATE_KEY = "sidebar_collapsed"

const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY)
  return row ? JSON.parse(row.value) : false
}

const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  db.prepare(`
    INSERT OR REPLACE INTO app_meta (key, value) 
    VALUES (?, ?)
  `).run(SIDEBAR_STATE_KEY, JSON.stringify(collapsed))
}
```

## Визуальный Дизайн

### Размеры и Анимации
```css
/* Базовые размеры */
.sidebar-expanded { width: 16rem; } /* w-64 = 256px */
.sidebar-collapsed { width: 5rem; }  /* w-20 = 80px */

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
// Скрытие текста в collapsed режиме
{!collapsed && <span className="text-sm font-medium">{item.label}</span>}

// Слоган сайдбара
{!collapsed && (
  <p className="text-sm text-muted-foreground mt-2 leading-tight">
    Stay on track
  </p>
)}
```

### Иконки и Выравнивание
```typescript
// Размер иконок остается постоянным
const navIconClassName = "w-5 h-5 shrink-0"

// Центрирование в collapsed режиме
const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4"
```

## Интеграция с Брендингом

### Logo Component Integration
```tsx
<Logo 
  size="md" 
  showText={!collapsed}  // Текст скрывается при collapse
/>
```

### Цветовая Схема
```css
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

## Accessibility (Доступность)

### Keyboard Navigation
```typescript
const handleKeyDown = (event: KeyboardEvent, itemId: string) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    onNavigate(itemId)
  }
}
```

### ARIA Attributes
```tsx
<nav role="navigation" aria-label="Main navigation">
  <button
    role="button"
    aria-label={collapsed ? item.label : undefined}
    aria-expanded={!collapsed}
    tabIndex={0}
  >
    <item.icon aria-hidden="true" />
    {!collapsed && <span>{item.label}</span>}
  </button>
</nav>
```

### Focus Management
```css
.nav-button:focus {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

## Производительность

### Мемоизация Стилей
```typescript
const navButtonClassName = useMemo(() => 
  (isActive: boolean): string => {
    // ... логика стилей
  }, [collapsed]
)
```

### Lazy State Updates
```typescript
const debouncedSetSidebarState = useMemo(
  () => debounce((collapsed: boolean) => {
    window.clerkly.setSidebarState(collapsed)
  }, 300),
  []
)
```

## Свойства Корректности

### Свойство 1: Состояние Персистентности
**Описание**: Состояние сайдбара должно сохраняться между сессиями

**Формальное Свойство**:
```
∀ collapsed_state : boolean
  WHEN setSidebarState(collapsed_state) AND app.restart()
  THEN getSidebarState() = collapsed_state
```

### Свойство 2: Визуальная Согласованность
**Описание**: Размер иконок должен оставаться постоянным в обоих режимах

**Формальное Свойство**:
```
∀ icon : NavigationIcon, mode ∈ {collapsed, expanded}
  THEN icon.width = 20px AND icon.height = 20px
```

### Свойство 3: Адаптивность Контента
**Описание**: Текстовые элементы должны скрываться в collapsed режиме

**Формальное Свойство**:
```
∀ text_element ∈ {nav_labels, tagline}
  WHEN sidebar.collapsed = true
  THEN text_element.visible = false
```

### Свойство 4: Доступность Функций
**Описание**: Все навигационные функции должны быть доступны в обоих режимах

**Формальное Свойство**:
```
∀ nav_item : NavigationItem, mode ∈ {collapsed, expanded}
  THEN nav_item.clickable = true AND nav_item.keyboard_accessible = true
```

## Тестирование

### Unit Tests
```typescript
describe("Navigation Component", () => {
  it("should render all navigation items", () => {
    // Тест рендеринга всех элементов навигации
  })
  
  it("should toggle collapse state", () => {
    // Тест переключения состояния
  })
  
  it("should hide text in collapsed mode", () => {
    // Тест скрытия текста
  })
})
```

### Integration Tests
```typescript
describe("Sidebar State Persistence", () => {
  it("should save and restore sidebar state", async () => {
    // E2E тест сохранения состояния
  })
})
```

### Visual Regression Tests
```typescript
describe("Sidebar Visual Tests", () => {
  it("should match expanded sidebar screenshot", () => {
    // Визуальный тест развернутого сайдбара
  })
  
  it("should match collapsed sidebar screenshot", () => {
    // Визуальный тест сложенного сайдбара
  })
})
```

## Интеграционные Точки

### Зависимости
- **platform-foundation**: IPC каналы, управление окнами
- **data-storage**: Сохранение состояния в SQLite
- **branding-system**: Logo компонент, цветовая схема

### Предоставляемые Интерфейсы
1. **Navigation Interface**: Переключение между экранами приложения
2. **Collapsible UI**: Адаптивный интерфейс для экономии места
3. **State Management**: Персистентное состояние UI

### IPC Каналы
- `sidebar:get-state` - получение текущего состояния
- `sidebar:set-state` - сохранение нового состояния

## Будущие Улучшения

### Анимации
- Плавные переходы между состояниями
- Микроанимации для кнопок
- Анимация появления/скрытия текста

### Кастомизация
- Пользовательские темы
- Настраиваемый порядок элементов навигации
- Скрытие неиспользуемых разделов

### Уведомления
- Бейджи с количеством непрочитанных элементов
- Индикаторы активности в разделах