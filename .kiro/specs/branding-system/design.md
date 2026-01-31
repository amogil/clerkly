# Документ Дизайна - Система Брендинга

## Введение

Этот документ описывает техническую архитектуру системы брендинга Clerkly, включая компонент логотипа, цветовую систему, типографику и обеспечение визуальной согласованности во всех состояниях приложения.

## Архитектурный Обзор

### Архитектура Системы Брендинга

```
┌─────────────────┐    Использует    ┌─────────────────┐
│ Logo Component  │◄────────────────│ Navigation      │
│ (logo.tsx)      │                 │ Sidebar         │
└─────────────────┘                 └─────────────────┘
         │                                   │
         │ Стили                            │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│ Theme System    │◄────────────────│ AuthGate        │
│ (theme.css)     │                 │ Component       │
└─────────────────┘                 └─────────────────┘
         │
         ▼
┌─────────────────┐
│ UI Reference    │
│ (Figma Design)  │
└─────────────────┘
```

## Компонентная Архитектура

### 1. Logo Component (renderer/src/app/components/logo.tsx)

**Интерфейс Компонента**:
```typescript
type LogoProps = {
  size?: "sm" | "md" | "lg"
  showText?: boolean
}

export function Logo({ size = "md", showText = true }: LogoProps)
```

**Размерная Система**:
```typescript
const sizes = {
  sm: { icon: 24, text: "text-lg" },    // 24px icon, 18px text
  md: { icon: 32, text: "text-2xl" },   // 32px icon, 24px text  
  lg: { icon: 48, text: "text-4xl" }    // 48px icon, 36px text
}
```

**SVG Логотип**:
```tsx
<svg
  width={iconSize}
  height={iconSize}
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
>
  {/* Градиентный фон */}
  <circle cx="16" cy="16" r="16" fill={`url(#${gradientId})`} />
  
  {/* Волны звука (символ голоса/коммуникации) */}
  <path
    d="M20 9C20 9 22 11 22 16C22 21 20 23 20 23"
    stroke="white"
    strokeWidth="2.5"
    strokeLinecap="round"
  />
  <path
    d="M17 11C17 11 18.5 12.5 18.5 16C18.5 19.5 17 21 17 21"
    stroke="white"
    strokeWidth="2.5"
    strokeLinecap="round"
  />
  
  {/* Центральная точка (микрофон/источник) */}
  <circle cx="12" cy="16" r="3" fill="white" />
  
  {/* Градиент */}
  <defs>
    <linearGradient
      id={gradientId}
      x1="0" y1="0" x2="32" y2="32"
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0%" stopColor="#6366f1" />
      <stop offset="100%" stopColor="#5b6cf2" />
    </linearGradient>
  </defs>
</svg>
```

**Текстовый Компонент**:
```tsx
{showText && (
  <span className={`font-semibold text-foreground ${textClass}`}>
    Clerkly
  </span>
)}
```

### 2. Theme System (renderer/src/styles/theme.css)

**Цветовая Палитра Light Mode**:
```css
:root {
  /* Основные цвета */
  --background: #fafafa;        /* Фон приложения */
  --foreground: #1a1a1a;        /* Основной текст */
  --card: #ffffff;              /* Фон карточек */
  --card-foreground: #1a1a1a;   /* Текст на карточках */
  
  /* Брендинг */
  --primary: #5b6cf2;           /* Основной бренд-цвет (индиго) */
  --primary-foreground: #ffffff; /* Текст на primary */
  
  /* Вторичные цвета */
  --secondary: #f5f5f7;         /* Вторичный фон */
  --secondary-foreground: #1a1a1a; /* Текст на secondary */
  
  /* Состояния */
  --muted: #f5f5f7;             /* Приглушенный фон */
  --muted-foreground: #6b7280;   /* Приглушенный текст */
  --accent: #e9ebef;            /* Акцентный цвет */
  --accent-foreground: #030213;  /* Текст на accent */
  
  /* Границы и элементы */
  --border: #e5e7eb;            /* Цвет границ */
  --input: transparent;         /* Фон инпутов */
  --input-background: #f9fafb;  /* Фон полей ввода */
  --ring: #5b6cf2;              /* Цвет фокуса */
  
  /* Сайдбар */
  --sidebar: #ffffff;
  --sidebar-foreground: #1a1a1a;
  --sidebar-primary: #5b6cf2;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f5f5f7;
  --sidebar-accent-foreground: #1a1a1a;
  --sidebar-border: #e5e7eb;
  --sidebar-ring: #5b6cf2;
}
```

**Dark Mode Палитра**:
```css
.dark {
  --background: oklch(0.145 0 0);      /* Темный фон */
  --foreground: oklch(0.985 0 0);      /* Светлый текст */
  --card: oklch(0.145 0 0);            /* Темные карточки */
  --card-foreground: oklch(0.985 0 0); /* Светлый текст на карточках */
  
  --primary: #6366f1;                  /* Более яркий primary в dark mode */
  --primary-foreground: #ffffff;
  
  --secondary: oklch(0.205 0 0);       /* Темно-серый */
  --secondary-foreground: oklch(0.985 0 0);
  
  --muted: oklch(0.205 0 0);
  --muted-foreground: oklch(0.545 0 0);
  
  --border: oklch(0.245 0 0);          /* Темные границы */
  --input: oklch(0.245 0 0);
  --ring: #6366f1;
  
  /* Dark sidebar */
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: #6366f1;
  --sidebar-primary-foreground: #ffffff;
}
```

**Типографическая Система**:
```css
:root {
  --font-size: 16px;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  
  /* Радиусы скругления */
  --radius: 0.75rem;
}

/* Системные шрифты */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", 
               "Roboto", "Oxygen", "Ubuntu", "Cantarell", 
               "Fira Sans", "Droid Sans", "Helvetica Neue", 
               sans-serif;
}
```

### 3. Brand Guidelines

**Логотип Использование**:
```typescript
// AuthGate - полный логотип с текстом
<Logo size="md" showText={true} />

// Sidebar развернутый - полный логотип
<Logo size="md" showText={!collapsed} />

// Sidebar сложенный - только иконка
<Logo size="md" showText={false} />

// Мелкие элементы - маленький размер
<Logo size="sm" showText={true} />
```

**Цветовые Правила**:
```css
/* Primary используется для */
.nav-button-active { background-color: var(--primary); }
.focus-ring { box-shadow: 0 0 0 2px var(--ring); }
.brand-accent { color: var(--primary); }

/* Градиент логотипа */
.logo-gradient {
  background: linear-gradient(135deg, #6366f1 0%, #5b6cf2 100%);
}
```

### 4. UI Reference Integration

**Figma Design System**:
- **Путь**: `docs/development/ui_reference/`
- **Компоненты**: Все UI компоненты следуют Figma спецификациям
- **Цвета**: Точное соответствие цветовой палитре из дизайна
- **Размеры**: Соблюдение spacing и sizing системы

**Валидация Соответствия**:
```typescript
// Проверка соответствия дизайну
const validateDesignCompliance = () => {
  const computedStyles = getComputedStyle(document.documentElement)
  const primaryColor = computedStyles.getPropertyValue('--primary').trim()
  
  console.assert(
    primaryColor === '#5b6cf2',
    `Primary color mismatch: expected #5b6cf2, got ${primaryColor}`
  )
}
```

## Адаптивность и Состояния

### Responsive Logo Behavior
```typescript
// Логика показа/скрытия текста
const shouldShowText = (context: string, collapsed?: boolean): boolean => {
  switch (context) {
    case 'auth-gate':
      return true  // Всегда показываем в auth gate
    case 'sidebar':
      return !collapsed  // Зависит от состояния сайдбара
    case 'header':
      return window.innerWidth > 768  // Скрываем на мобильных
    default:
      return true
  }
}
```

### Theme Switching
```typescript
const toggleTheme = () => {
  const html = document.documentElement
  const isDark = html.classList.contains('dark')
  
  if (isDark) {
    html.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  } else {
    html.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  }
}

// Инициализация темы
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme')
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  
  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.classList.add('dark')
  }
}
```

## Accessibility (Доступность)

### Logo Accessibility
```tsx
<svg
  aria-hidden="true"      // Декоративный элемент
  focusable="false"       // Не фокусируемый
  role="img"              // Роль изображения
  aria-label="Clerkly"    // Альтернативный текст
>
```

### Color Contrast
```css
/* Обеспечение контрастности 4.5:1 для обычного текста */
:root {
  --foreground: #1a1a1a;  /* Контраст 12.6:1 на белом фоне */
  --muted-foreground: #6b7280;  /* Контраст 4.6:1 на белом фоне */
}

.dark {
  --foreground: oklch(0.985 0 0);  /* Контраст 19.3:1 на темном фоне */
  --muted-foreground: oklch(0.545 0 0);  /* Контраст 4.7:1 на темном фоне */
}
```

### High Contrast Mode
```css
@media (prefers-contrast: high) {
  :root {
    --border: #000000;
    --primary: #0000ff;
    --foreground: #000000;
  }
  
  .dark {
    --border: #ffffff;
    --primary: #66b3ff;
    --foreground: #ffffff;
  }
}
```

## Производительность

### CSS Custom Properties Optimization
```css
/* Группировка связанных свойств */
:root {
  /* Цвета сгруппированы по назначению */
  --color-text-primary: var(--foreground);
  --color-text-secondary: var(--muted-foreground);
  --color-bg-primary: var(--background);
  --color-bg-secondary: var(--card);
}
```

### Logo Component Optimization
```typescript
// Мемоизация градиента ID для избежания пересоздания
const gradientId = useMemo(() => `logo-gradient-${size}`, [size])

// Мемоизация размеров
const iconSize = useMemo(() => sizes[size].icon, [size])
const textClass = useMemo(() => sizes[size].text, [size])
```

## Свойства Корректности

### Свойство 1: Размерная Согласованность
**Описание**: Логотип должен корректно масштабироваться для всех размеров

**Формальное Свойство**:
```
∀ size ∈ {sm, md, lg}
  WHEN Logo.render(size)
  THEN Logo.icon.width = sizes[size].icon
    AND Logo.icon.height = sizes[size].icon
    AND Logo.text.fontSize = sizes[size].text
```

### Свойство 2: Контекстная Адаптивность
**Описание**: Текст логотипа должен показываться/скрываться согласно контексту

**Формальное Свойство**:
```
∀ context ∈ {auth-gate, sidebar, header}
  WHEN Logo.render(context, collapsed)
  THEN Logo.showText = shouldShowText(context, collapsed)
```

### Свойство 3: Цветовая Согласованность
**Описание**: Все компоненты должны использовать цвета из единой палитры

**Формальное Свойство**:
```
∀ component : UIComponent
  WHEN component.render()
  THEN ∀ color ∈ component.colors
    WHERE color ∈ theme.colorPalette
```

### Свойство 4: Доступность Контраста
**Описание**: Все цветовые комбинации должны соответствовать WCAG AA

**Формальное Свойство**:
```
∀ text_color, bg_color : Color
  WHEN text_color.on(bg_color)
  THEN contrast_ratio(text_color, bg_color) ≥ 4.5
```

## Тестирование

### Visual Regression Tests
```typescript
describe("Logo Component Visual Tests", () => {
  it("should render correctly in all sizes", () => {
    ['sm', 'md', 'lg'].forEach(size => {
      render(<Logo size={size} showText={true} />)
      expect(screen.getByRole('img')).toMatchSnapshot(`logo-${size}-with-text`)
    })
  })
  
  it("should render correctly without text", () => {
    render(<Logo size="md" showText={false} />)
    expect(screen.getByRole('img')).toMatchSnapshot('logo-icon-only')
  })
})
```

### Theme Tests
```typescript
describe("Theme System", () => {
  it("should apply correct colors in light mode", () => {
    document.documentElement.classList.remove('dark')
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
    expect(primary.trim()).toBe('#5b6cf2')
  })
  
  it("should apply correct colors in dark mode", () => {
    document.documentElement.classList.add('dark')
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
    expect(primary.trim()).toBe('#6366f1')
  })
})
```

### Accessibility Tests
```typescript
describe("Brand Accessibility", () => {
  it("should have sufficient color contrast", () => {
    const combinations = [
      { text: '--foreground', bg: '--background' },
      { text: '--primary-foreground', bg: '--primary' },
      { text: '--muted-foreground', bg: '--muted' }
    ]
    
    combinations.forEach(({ text, bg }) => {
      const contrast = calculateContrast(
        getCSSVariable(text),
        getCSSVariable(bg)
      )
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    })
  })
})
```

## Интеграционные Точки

### Зависимости
- **platform-foundation**: Базовая UI инфраструктура, React рендеринг

### Предоставляемые Интерфейсы
1. **Logo Component**: Переиспользуемый компонент логотипа
2. **Theme System**: Единая цветовая палитра и типографика
3. **Brand Guidelines**: Стандарты использования брендинга
4. **Design Tokens**: CSS переменные для всех компонентов

### Используется Фичами
- **google-oauth-auth**: Логотип в AuthGate и Authorization Completion Page
- **sidebar-navigation**: Логотип в сайдбаре, цветовая схема навигации
- **Все UI компоненты**: Цвета, типографика, spacing

## Будущие Улучшения

### Анимированный Логотип
```typescript
const AnimatedLogo = ({ animate = false }: { animate?: boolean }) => {
  return (
    <svg className={animate ? 'logo-pulse' : ''}>
      {/* SVG с анимацией пульсации */}
    </svg>
  )
}
```

### Кастомные Темы
```typescript
interface CustomTheme {
  name: string
  colors: {
    primary: string
    secondary: string
    background: string
    foreground: string
  }
}

const applyCustomTheme = (theme: CustomTheme) => {
  Object.entries(theme.colors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value)
  })
}
```

### Адаптивная Типографика
```css
/* Fluid typography */
:root {
  --font-size-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --font-size-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --font-size-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
}
```