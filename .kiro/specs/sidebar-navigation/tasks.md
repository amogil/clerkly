# Список Задач - Навигация Сайдбара

## Текущий Статус

**Анализ соответствия коду**: 90% (18/20 требований реализовано)

### Реализованные Компоненты
- ✅ Базовая структура Navigation компонента
- ✅ Адаптивное поведение складывания
- ✅ Интеграция с Logo компонентом
- ✅ Основные элементы навигации
- ✅ Responsive стили и анимации

### Пропущенные Компоненты
- ❌ Сохранение состояния в SQLite
- ❌ IPC интеграция для состояния сайдбара

## Задачи

### 1. Интеграция Сохранения Состояния

#### 1.1 Реализовать IPC обработчики для состояния сайдбара
- [ ] Добавить IPC обработчики в `main.ts`
- [ ] Создать каналы `sidebar:get-state` и `sidebar:set-state`
- [ ] Интегрировать с функциями БД из data-storage
- [ ] Добавить обработку ошибок и логирование

**Детали реализации**:
```typescript
// В main.ts
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

**Критерии приемки**:
- IPC каналы зарегистрированы корректно
- Состояние сохраняется в SQLite
- Ошибки обрабатываются и логируются
- Возвращаются корректные типы данных

#### 1.2 Обновить preload.ts для sidebar API
- [ ] Добавить методы `getSidebarState()` и `setSidebarState()` в clerkly API
- [ ] Обеспечить типизацию для TypeScript
- [ ] Добавить JSDoc документацию
- [ ] Протестировать IPC коммуникацию

**Детали реализации**:
```typescript
// В preload.ts
const clerklyAPI = {
  // ... существующие методы
  
  getSidebarState: (): Promise<{ collapsed: boolean }> => 
    ipcRenderer.invoke("sidebar:get-state"),
    
  setSidebarState: (collapsed: boolean): Promise<{ success: boolean }> => 
    ipcRenderer.invoke("sidebar:set-state", { collapsed })
}

// Типы для renderer
interface ClerklyAPI {
  // ... существующие типы
  getSidebarState(): Promise<{ collapsed: boolean }>
  setSidebarState(collapsed: boolean): Promise<{ success: boolean }>
}
```

**Критерии приемки**:
- API методы доступны в renderer процессе
- TypeScript типы корректны
- JSDoc документация добавлена
- Нет утечек IPC каналов

### 2. Улучшение Navigation Компонента

#### 2.1 Интегрировать сохранение состояния в App.tsx
- [ ] Добавить загрузку состояния при инициализации
- [ ] Реализовать сохранение при изменении состояния
- [ ] Добавить обработку ошибок с откатом состояния
- [ ] Оптимизировать частоту сохранения

**Детали реализации**:
```typescript
// В App.tsx
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

// Обработчик переключения с сохранением
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

**Критерии приемки**:
- Состояние загружается при запуске приложения
- Изменения сохраняются немедленно
- Ошибки обрабатываются с откатом UI
- Нет лишних вызовов API

#### 2.2 Улучшить адаптивность Navigation компонента
- [ ] Добавить debounce для частых переключений
- [ ] Улучшить анимации переходов
- [ ] Оптимизировать рендеринг с useMemo
- [ ] Добавить поддержку keyboard shortcuts

**Детали реализации**:
```typescript
// Debounced сохранение состояния
const debouncedSetSidebarState = useMemo(
  () => debounce((collapsed: boolean) => {
    window.clerkly.setSidebarState(collapsed)
  }, 300),
  []
)

// Мемоизация стилей
const navButtonClassName = useMemo(() => 
  (isActive: boolean): string => {
    const baseClasses = "w-full flex items-center rounded-lg transition-all mb-1 py-3"
    const stateClasses = isActive
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-foreground hover:bg-secondary"
    const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4"
    return `${baseClasses} ${layoutClasses} ${stateClasses}`
  }, [collapsed]
)

// Keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault()
      handleToggleCollapse()
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [handleToggleCollapse])
```

**Критерии приемки**:
- Debounce предотвращает лишние сохранения
- Анимации плавные и производительные
- Мемоизация улучшает производительность
- Keyboard shortcuts работают корректно

### 3. Accessibility Улучшения

#### 3.1 Добавить ARIA атрибуты и keyboard navigation
- [ ] Добавить правильные ARIA роли и атрибуты
- [ ] Реализовать keyboard navigation между элементами
- [ ] Добавить focus management
- [ ] Обеспечить screen reader поддержку

**Детали реализации**:
```typescript
// ARIA атрибуты для навигации
<nav role="navigation" aria-label="Main navigation">
  <button
    role="button"
    aria-label={collapsed ? `${item.label} (collapsed)` : item.label}
    aria-expanded={!collapsed}
    aria-current={currentScreen === item.id ? "page" : undefined}
    tabIndex={0}
    onKeyDown={(e) => handleKeyDown(e, item.id)}
  >
    <item.icon aria-hidden="true" className="w-5 h-5 shrink-0" />
    {!collapsed && <span>{item.label}</span>}
  </button>
</nav>

// Keyboard navigation
const handleKeyDown = (event: KeyboardEvent, itemId: string) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    onNavigate(itemId)
  }
  // Arrow key navigation
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    focusNextItem(event.key === "ArrowDown")
  }
}
```

**Критерии приемки**:
- Все элементы имеют правильные ARIA атрибуты
- Keyboard navigation работает интуитивно
- Focus visible и управляется корректно
- Screen readers читают контент правильно

#### 3.2 Улучшить контрастность и визуальные индикаторы
- [ ] Проверить цветовой контраст для всех состояний
- [ ] Добавить focus indicators
- [ ] Улучшить hover states
- [ ] Добавить high contrast mode поддержку

**Детали реализации**:
```css
/* Focus indicators */
.nav-button:focus {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .nav-button {
    border: 1px solid var(--border);
  }
  
  .nav-button-active {
    border: 2px solid var(--primary);
    background-color: var(--primary);
  }
}

/* Hover states */
.nav-button:hover:not(.nav-button-active) {
  background-color: var(--secondary);
  transform: translateX(2px);
}
```

**Критерии приемки**:
- Контраст соответствует WCAG AA (4.5:1)
- Focus indicators четко видны
- Hover states улучшают UX
- High contrast mode поддерживается

### 4. Тестирование

#### 4.1 Unit тесты для Navigation компонента
- [ ] Тестировать рендеринг в обоих состояниях
- [ ] Проверить обработку событий
- [ ] Тестировать интеграцию с Logo
- [ ] Проверить accessibility атрибуты

**Детали реализации**:
```typescript
describe("Navigation Component", () => {
  it("should render all navigation items", () => {
    render(<Navigation currentScreen="dashboard" onNavigate={jest.fn()} collapsed={false} onToggleCollapse={jest.fn()} />)
    
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.getByText("Calendar")).toBeInTheDocument()
    expect(screen.getByText("Tasks")).toBeInTheDocument()
    expect(screen.getByText("Contacts")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })
  
  it("should hide text labels when collapsed", () => {
    render(<Navigation currentScreen="dashboard" onNavigate={jest.fn()} collapsed={true} onToggleCollapse={jest.fn()} />)
    
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument()
    expect(screen.queryByText("Stay on track")).not.toBeInTheDocument()
  })
  
  it("should call onToggleCollapse when toggle button is clicked", () => {
    const mockToggle = jest.fn()
    render(<Navigation currentScreen="dashboard" onNavigate={jest.fn()} collapsed={false} onToggleCollapse={mockToggle} />)
    
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }))
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })
})
```

**Критерии приемки**:
- Все основные сценарии покрыты тестами
- Тесты проходят стабильно
- Mock функции используются корректно
- Accessibility тестируется

#### 4.2 Integration тесты для состояния сайдбара
- [ ] Тестировать сохранение/загрузку состояния
- [ ] Проверить IPC коммуникацию
- [ ] Тестировать обработку ошибок
- [ ] E2E тесты с реальной БД

**Property-Based Test 1: Персистентность Состояния Сайдбара**
```typescript
// **Validates: sidebar-navigation.4.2**
describe("Sidebar State Persistence Property", () => {
  it("should persist sidebar state across app restarts", () => {
    fc.assert(fc.property(
      fc.boolean(),
      async (collapsed) => {
        // Сохраняем состояние
        const saveResult = await window.clerkly.setSidebarState(collapsed)
        expect(saveResult.success).toBe(true)
        
        // Симулируем перезапуск (новый запрос состояния)
        const loadResult = await window.clerkly.getSidebarState()
        
        return loadResult.collapsed === collapsed
      }
    ))
  })
})
```

#### 4.3 Visual regression тесты
- [ ] Снимки экрана для expanded состояния
- [ ] Снимки экрана для collapsed состояния
- [ ] Тестирование анимаций переходов
- [ ] Проверка на разных размерах экрана

**Property-Based Test 2: Визуальная Согласованность**
```typescript
// **Validates: sidebar-navigation.2.2**
describe("Visual Consistency Property", () => {
  it("should maintain icon sizes in both states", () => {
    fc.assert(fc.property(
      fc.boolean(),
      (collapsed) => {
        render(<Navigation currentScreen="dashboard" onNavigate={jest.fn()} collapsed={collapsed} onToggleCollapse={jest.fn()} />)
        
        const icons = screen.getAllByRole("img", { hidden: true })
        
        return icons.every(icon => {
          const styles = window.getComputedStyle(icon)
          return styles.width === "20px" && styles.height === "20px"
        })
      }
    ))
  })
})
```

#### 4.4 Accessibility тесты
- [ ] Проверить keyboard navigation
- [ ] Тестировать screen reader поддержку
- [ ] Проверить цветовой контраст
- [ ] Тестировать focus management

**Property-Based Test 3: Доступность Навигации**
```typescript
// **Validates: sidebar-navigation.5.3**
describe("Navigation Accessibility Property", () => {
  it("should maintain keyboard accessibility in both states", () => {
    fc.assert(fc.property(
      fc.boolean(),
      (collapsed) => {
        render(<Navigation currentScreen="dashboard" onNavigate={jest.fn()} collapsed={collapsed} onToggleCollapse={jest.fn()} />)
        
        const buttons = screen.getAllByRole("button")
        
        return buttons.every(button => {
          return button.tabIndex >= 0 && 
                 button.getAttribute("aria-label") !== null &&
                 button.getAttribute("role") === "button"
        })
      }
    ))
  })
})
```

### 5. Производительность и Оптимизация

#### 5.1 Оптимизировать рендеринг компонента
- [ ] Добавить React.memo для Navigation
- [ ] Мемоизировать callback функции
- [ ] Оптимизировать CSS transitions
- [ ] Добавить lazy loading для иконок

**Детали реализации**:
```typescript
// Мемоизация компонента
const Navigation = React.memo(({ currentScreen, onNavigate, collapsed, onToggleCollapse }: NavigationProps) => {
  // ... компонент
})

// Мемоизация callbacks в App.tsx
const handleNavigate = useCallback((screen: string) => {
  setCurrentScreen(screen)
}, [])

const handleToggleCollapse = useCallback(async () => {
  // ... логика переключения
}, [isSidebarCollapsed])
```

**Критерии приемки**:
- Компонент не перерендеривается без необходимости
- Callbacks стабильны между рендерами
- CSS анимации не блокируют UI
- Иконки загружаются эффективно

#### 5.2 Мониторинг производительности
- [ ] Добавить метрики времени переключения
- [ ] Мониторить частоту сохранения состояния
- [ ] Отслеживать размер bundle для компонента
- [ ] Профилировать memory usage

**Критерии приемки**:
- Переключение происходит < 100ms
- Состояние сохраняется < 50ms
- Bundle size оптимален
- Нет memory leaks

## Критерии Завершения

### Функциональные Требования
- [ ] Состояние сайдбара сохраняется в SQLite
- [ ] IPC интеграция работает корректно
- [ ] Все элементы навигации функциональны
- [ ] Анимации плавные и производительные

### Качество Кода
- [ ] Покрытие тестами > 90%
- [ ] Все property-based тесты проходят
- [ ] Accessibility соответствует WCAG AA
- [ ] Код соответствует стандартам проекта

### Интеграция
- [ ] Совместимость с branding-system
- [ ] Интеграция с data-storage
- [ ] IPC каналы стабильны
- [ ] Нет конфликтов с другими компонентами

## Приоритизация

**Высокий приоритет**:
1. IPC интеграция для состояния (1.1, 1.2)
2. Сохранение состояния в App.tsx (2.1)
3. Unit тесты (4.1)

**Средний приоритет**:
4. Accessibility улучшения (3.1, 3.2)
5. Integration тесты (4.2)
6. Производительность (5.1)

**Низкий приоритет**:
7. Visual regression тесты (4.3)
8. Мониторинг производительности (5.2)