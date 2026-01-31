# Список Задач - Система Брендинга

## Текущий Статус

**Анализ соответствия коду**: 95% (19/20 требований реализовано)

### Реализованные Компоненты

- ✅ Logo компонент с адаптивными размерами
- ✅ Цветовая система (light/dark themes)
- ✅ Типографическая система
- ✅ Интеграция с Navigation и AuthGate
- ✅ Responsive поведение логотипа

### Пропущенные Компоненты

- ❌ Формальная валидация соответствия дизайну
- ❌ Автоматизированные тесты брендинга

## Задачи

### 1. Валидация Соответствия Дизайну

#### 1.1 Реализовать автоматическую проверку цветовой палитры

- [ ] Создать функцию валидации CSS переменных
- [ ] Добавить проверку соответствия Figma спецификации
- [ ] Реализовать тесты цветового контраста
- [ ] Добавить валидацию в CI/CD pipeline

**Детали реализации**:

```typescript
// В src/utils/design-validation.ts
export const validateDesignCompliance = (): DesignValidationResult => {
  const computedStyles = getComputedStyle(document.documentElement);

  const expectedColors = {
    light: {
      primary: "#5b6cf2",
      background: "#fafafa",
      foreground: "#1a1a1a",
      card: "#ffffff",
    },
    dark: {
      primary: "#6366f1",
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.145 0 0)",
    },
  };

  const isDark = document.documentElement.classList.contains("dark");
  const expected = isDark ? expectedColors.dark : expectedColors.light;

  const results = Object.entries(expected).map(([key, expectedValue]) => {
    const actualValue = computedStyles.getPropertyValue(`--${key}`).trim();
    return {
      property: key,
      expected: expectedValue,
      actual: actualValue,
      matches: actualValue === expectedValue,
    };
  });

  return {
    theme: isDark ? "dark" : "light",
    results,
    allMatch: results.every((r) => r.matches),
  };
};
```

**Критерии приемки**:

- Все цвета соответствуют спецификации
- Контраст соответствует WCAG AA (4.5:1)
- Валидация работает в обеих темах
- Результаты логируются для отладки

#### 1.2 Создать тесты соответствия UI референсу

- [ ] Добавить visual regression тесты для Logo компонента
- [ ] Проверить размеры и пропорции в разных состояниях
- [ ] Тестировать цветовые схемы
- [ ] Валидировать типографику

**Детали реализации**:

```typescript
describe("Design Compliance Tests", () => {
  it("should match Figma color specifications", () => {
    const validation = validateDesignCompliance()
    expect(validation.allMatch).toBe(true)

    if (!validation.allMatch) {
      validation.results.forEach(result => {
        if (!result.matches) {
          console.error(`Color mismatch for ${result.property}: expected ${result.expected}, got ${result.actual}`)
        }
      })
    }
  })

  it("should maintain correct logo proportions", () => {
    ['sm', 'md', 'lg'].forEach(size => {
      render(<Logo size={size} showText={true} />)
      const logo = screen.getByRole('img')
      const expectedSize = size === 'sm' ? 24 : size === 'md' ? 32 : 48

      expect(logo).toHaveAttribute('width', expectedSize.toString())
      expect(logo).toHaveAttribute('height', expectedSize.toString())
    })
  })
})
```

**Критерии приемки**:

- Visual regression тесты проходят
- Размеры логотипа корректны для всех размеров
- Цветовые схемы соответствуют дизайну
- Типографика соответствует спецификации

### 2. Улучшения Accessibility

#### 2.1 Улучшить поддержку screen readers для Logo

- [ ] Добавить правильные ARIA атрибуты
- [ ] Реализовать альтернативный текст
- [ ] Добавить поддержку high contrast режима
- [ ] Тестировать с реальными screen readers

**Детали реализации**:

```tsx
// Улучшенный Logo компонент
export function Logo({ size = "md", showText = true, ariaLabel }: LogoProps) {
  const gradientId = useMemo(
    () => `logo-gradient-${size}-${Math.random().toString(36).substr(2, 9)}`,
    [size],
  );

  return (
    <div className="flex items-center gap-2">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel || "Clerkly logo"}
        focusable="false"
      >
        <title>Clerkly</title>
        <desc>
          Clerkly application logo featuring sound waves in a circular gradient background
        </desc>
        {/* SVG content */}
      </svg>

      {showText && (
        <span className={`font-semibold text-foreground ${textClass}`} aria-hidden={!showText}>
          Clerkly
        </span>
      )}
    </div>
  );
}

// Типы
interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  ariaLabel?: string;
}
```

**Критерии приемки**:

- Screen readers читают логотип корректно
- ARIA атрибуты соответствуют стандартам
- High contrast режим поддерживается
- Альтернативный текст информативен

#### 2.2 Добавить поддержку motion preferences

- [ ] Реализовать respect для prefers-reduced-motion
- [ ] Добавить опциональные анимации
- [ ] Создать статичные варианты компонентов
- [ ] Тестировать с различными настройками

**Детали реализации**:

```css
/* Уважение к настройкам анимации */
@media (prefers-reduced-motion: reduce) {
  .logo-transition,
  .nav-button-transition,
  .sidebar-transition {
    transition: none;
  }

  .logo-pulse {
    animation: none;
  }
}

/* Опциональные анимации */
@media (prefers-reduced-motion: no-preference) {
  .logo-hover {
    transition: transform 0.2s ease-in-out;
  }

  .logo-hover:hover {
    transform: scale(1.05);
  }
}
```

**Критерии приемки**:

- Анимации отключаются при prefers-reduced-motion
- Статичные варианты функциональны
- UX не страдает без анимаций
- Настройки применяются автоматически

### 3. Расширение Цветовой Системы

#### 3.1 Добавить поддержку кастомных тем

- [ ] Создать интерфейс для кастомных тем
- [ ] Реализовать применение пользовательских цветов
- [ ] Добавить валидацию цветовых схем
- [ ] Создать предустановленные темы

**Детали реализации**:

```typescript
// Интерфейс кастомной темы
interface CustomTheme {
  name: string;
  displayName: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    card: string;
    border: string;
  };
  metadata: {
    author?: string;
    version: string;
    description?: string;
  };
}

// Применение кастомной темы
export const applyCustomTheme = (theme: CustomTheme): void => {
  const root = document.documentElement;

  Object.entries(theme.colors).forEach(([key, value]) => {
    if (isValidColor(value)) {
      root.style.setProperty(`--${key}`, value);
    } else {
      console.warn(`Invalid color value for ${key}: ${value}`);
    }
  });

  // Сохранение в localStorage
  localStorage.setItem("custom-theme", JSON.stringify(theme));
};

// Валидация цветов
const isValidColor = (color: string): boolean => {
  const testElement = document.createElement("div");
  testElement.style.color = color;
  return testElement.style.color !== "";
};
```

**Критерии приемки**:

- Кастомные темы применяются корректно
- Валидация предотвращает некорректные цвета
- Темы сохраняются между сессиями
- Предустановленные темы качественные

#### 3.2 Реализовать адаптивную типографику

- [ ] Добавить fluid typography с clamp()
- [ ] Создать responsive размеры для разных экранов
- [ ] Оптимизировать читаемость на мобильных
- [ ] Добавить поддержку пользовательских размеров шрифта

**Детали реализации**:

```css
/* Fluid typography */
:root {
  --font-size-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --font-size-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --font-size-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --font-size-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --font-size-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --font-size-2xl: clamp(1.5rem, 1.3rem + 1vw, 2rem);
  --font-size-3xl: clamp(1.875rem, 1.6rem + 1.375vw, 2.5rem);
  --font-size-4xl: clamp(2.25rem, 1.9rem + 1.75vw, 3rem);
}

/* Responsive logo text */
.logo-text-sm {
  font-size: var(--font-size-lg);
}
.logo-text-md {
  font-size: var(--font-size-2xl);
}
.logo-text-lg {
  font-size: var(--font-size-4xl);
}

/* Поддержка пользовательских настроек */
@media (prefers-reduced-data: reduce) {
  :root {
    --font-size-base: 1rem; /* Фиксированные размеры для экономии данных */
  }
}
```

**Критерии приемки**:

- Типографика адаптируется к размеру экрана
- Читаемость сохраняется на всех устройствах
- Пользовательские настройки уважаются
- Производительность не страдает

### 4. Тестирование и Качество

#### 4.1 Comprehensive unit тесты для Logo компонента

- [ ] Тестировать все размеры и состояния
- [ ] Проверить accessibility атрибуты
- [ ] Тестировать интеграцию с темами
- [ ] Проверить производительность рендеринга

**Property-Based Test 1: Размерная Согласованность**

```typescript
// **Validates: branding-system.2.2**
describe("Logo Size Consistency Property", () => {
  it("should render correct sizes for all size variants", () => {
    fc.assert(fc.property(
      fc.constantFrom("sm", "md", "lg"),
      fc.boolean(),
      (size, showText) => {
        render(<Logo size={size} showText={showText} />)

        const expectedSizes = { sm: 24, md: 32, lg: 48 }
        const expectedSize = expectedSizes[size]

        const svg = screen.getByRole('img')
        const width = parseInt(svg.getAttribute('width') || '0')
        const height = parseInt(svg.getAttribute('height') || '0')

        return width === expectedSize && height === expectedSize
      }
    ))
  })
})
```

#### 4.2 Integration тесты с другими компонентами

- [ ] Тестировать интеграцию с Navigation
- [ ] Проверить поведение в AuthGate
- [ ] Тестировать theme switching
- [ ] Проверить responsive поведение

**Property-Based Test 2: Контекстная Адаптивность**

```typescript
// **Validates: branding-system.4.3**
describe("Logo Context Adaptivity Property", () => {
  it("should adapt text visibility based on context", () => {
    fc.assert(fc.property(
      fc.constantFrom("auth-gate", "sidebar", "header"),
      fc.boolean(),
      (context, collapsed) => {
        const shouldShowText = context === "auth-gate" ? true :
                              context === "sidebar" ? !collapsed :
                              true

        render(<Logo size="md" showText={shouldShowText} />)

        const textElement = screen.queryByText("Clerkly")
        const isTextVisible = textElement !== null

        return isTextVisible === shouldShowText
      }
    ))
  })
})
```

#### 4.3 Visual regression и screenshot тесты

- [ ] Создать baseline screenshots для всех состояний
- [ ] Тестировать в разных браузерах
- [ ] Проверить на разных разрешениях экрана
- [ ] Автоматизировать в CI/CD

**Property-Based Test 3: Цветовая Согласованность**

```typescript
// **Validates: branding-system.1.3**
describe("Color Consistency Property", () => {
  it("should use colors from unified palette", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // isDark theme
        (isDark) => {
          if (isDark) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }

          const validation = validateDesignCompliance();

          return validation.allMatch;
        },
      ),
    );
  });
});
```

#### 4.4 Performance тесты

- [ ] Измерить время рендеринга Logo
- [ ] Проверить memory usage при частых re-renders
- [ ] Тестировать bundle size impact
- [ ] Оптимизировать критические пути

**Критерии приемки**:

- Logo рендерится < 16ms
- Memory leaks отсутствуют
- Bundle size увеличивается < 5KB
- Critical rendering path оптимизирован

### 5. Документация и Developer Experience

#### 5.1 Создать comprehensive style guide

- [ ] Документировать все цветовые переменные
- [ ] Создать примеры использования Logo
- [ ] Добавить guidelines для кастомных тем
- [ ] Создать interactive documentation

**Детали реализации**:

````markdown
# Clerkly Brand Style Guide

## Logo Usage

### Sizes

- `sm`: 24x24px - для мелких элементов UI
- `md`: 32x32px - стандартный размер для навигации
- `lg`: 48x48px - для заголовков и hero секций

### Context Guidelines

- **AuthGate**: Всегда с текстом (`showText={true}`)
- **Sidebar**: Адаптивно (`showText={!collapsed}`)
- **Header**: Зависит от размера экрана

### Color Palette

```css
/* Light Theme */
--primary: #5b6cf2; /* Основной бренд-цвет */
--background: #fafafa; /* Фон приложения */
--foreground: #1a1a1a; /* Основной текст */

/* Dark Theme */
--primary: #6366f1; /* Более яркий в темной теме */
--background: oklch(0.145 0 0); /* Темный фон */
--foreground: oklch(0.985 0 0); /* Светлый текст */
```
````

````

**Критерии приемки**:
- Документация полная и актуальная
- Примеры кода работают
- Guidelines понятны разработчикам
- Interactive docs удобны в использовании

#### 5.2 Создать design tokens и tooling
- [ ] Экспортировать design tokens в JSON
- [ ] Создать CLI для валидации брендинга
- [ ] Добавить Figma plugin для синхронизации
- [ ] Автоматизировать обновления из дизайна

**Детали реализации**:
```json
// design-tokens.json
{
  "colors": {
    "primary": {
      "light": "#5b6cf2",
      "dark": "#6366f1"
    },
    "background": {
      "light": "#fafafa",
      "dark": "oklch(0.145 0 0)"
    }
  },
  "typography": {
    "sizes": {
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem"
    }
  },
  "spacing": {
    "xs": "0.25rem",
    "sm": "0.5rem",
    "md": "1rem"
  }
}
````

**Критерии приемки**:

- Design tokens экспортируются корректно
- CLI валидирует брендинг
- Figma sync работает автоматически
- Обновления применяются без ошибок

## Критерии Завершения

### Функциональные Требования

- [ ] Все компоненты соответствуют дизайн-системе
- [ ] Accessibility соответствует WCAG AA
- [ ] Кастомные темы поддерживаются
- [ ] Performance оптимизирована

### Качество Кода

- [ ] Покрытие тестами > 95%
- [ ] Все property-based тесты проходят
- [ ] Visual regression тесты стабильны
- [ ] Код соответствует стандартам

### Developer Experience

- [ ] Документация полная и актуальная
- [ ] Design tokens доступны
- [ ] Tooling работает корректно
- [ ] CI/CD интеграция настроена

## Приоритизация

**Высокий приоритет**:

1. Валидация соответствия дизайну (1.1, 1.2)
2. Accessibility улучшения (2.1, 2.2)
3. Unit тесты (4.1)

**Средний приоритет**: 4. Кастомные темы (3.1) 5. Integration тесты (4.2) 6. Style guide (5.1)

**Низкий приоритет**: 7. Адаптивная типографика (3.2) 8. Design tokens tooling (5.2) 9. Performance тесты (4.4)
