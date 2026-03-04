# Документ Дизайна: Визуальное Оформление Приложения

## Обзор

Данный документ описывает архитектуру и дизайн системы управления визуальным оформлением приложения Clerkly. Система обеспечивает контролируемый процесс переноса визуальных компонентов из Figma-референса в основное приложение с сохранением целостности и согласованности визуального оформления.

## Архитектура Системы

### Структура Директорий

```
project-root/
├── figma/                          # Figma Reference - эталонные компоненты
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── ui/            # UI компоненты (shadcn/ui)
│   │   │   │   └── *.tsx          # Feature компоненты
│   │   │   └── App.tsx
│   │   └── styles/
│   │       ├── index.css
│   │       ├── tailwind.css
│   │       ├── theme.css
│   │       └── fonts.css
│   ├── package.json
│   └── vite.config.ts
│
└── src/renderer/                   # Main Application - рабочее приложение
    ├── components/
    │   ├── ui/                     # UI компоненты
    │   └── *.tsx                   # Feature компоненты
    ├── styles/
    │   ├── index.css
    │   ├── tailwind.css
    │   ├── theme.css
    │   └── fonts.css
    ├── App.tsx
    └── index.tsx
```

### Компоненты Системы

#### 1. Figma Reference Manager
Управляет эталонными компонентами из Figma.

**Ответственность:**
- Хранение эталонных визуальных компонентов
- Изоляция от основного приложения
- Независимое обновление при изменениях в Figma

#### 2. Component Transfer Service
Выполняет контролируемый перенос компонентов.

**Ответственность:**
- Копирование компонентов из Figma Reference в Main Application
- Сохранение импортов и зависимостей
- Обработка конфликтов при перезаписи
- Уведомление о результатах операции

#### 3. Dependency Resolver
Разрешает зависимости между компонентами.

**Ответственность:**
- Анализ импортов компонента
- Определение зависимых компонентов
- Проверка наличия всех зависимостей в целевой директории

## Детальный Дизайн

### 1. Figma Reference Manager

#### Структура Данных

```typescript
interface ComponentMetadata {
  name: string;                    // Имя компонента
  path: string;                    // Относительный путь к файлу
  type: 'ui' | 'feature';         // Тип компонента
  dependencies: string[];          // Список зависимостей
  lastModified: Date;             // Дата последнего изменения
}

interface FigmaReference {
  components: Map<string, ComponentMetadata>;
  styles: {
    theme: string;                 // Путь к theme.css
    tailwind: string;              // Путь к tailwind.css
    fonts: string;                 // Путь к fonts.css
    index: string;                 // Путь к index.css
  };
}
```

#### Операции

```typescript
class FigmaReferenceManager {
  // Requirements: visual-design.1.1
  async scanComponents(): Promise<ComponentMetadata[]>;
  
  // Requirements: visual-design.1.2
  async getComponent(name: string): Promise<ComponentMetadata | null>;
  
  // Requirements: visual-design.1.1
  async listComponents(type?: 'ui' | 'feature'): Promise<ComponentMetadata[]>;
}
```

### 2. Component Transfer Service

#### Структура Данных

```typescript
interface TransferRequest {
  componentName: string;           // Имя компонента для переноса
  includeStyles: boolean;          // Переносить ли стили
  overwrite: boolean;              // Перезаписывать существующие
}

interface TransferResult {
  success: boolean;                // Успешность операции
  componentName: string;           // Имя компонента
  filesTransferred: string[];      // Список перенесенных файлов
  conflicts: string[];             // Список конфликтов
  message: string;                 // Сообщение о результате
}

interface ConflictResolution {
  componentName: string;
  action: 'overwrite' | 'skip' | 'merge';
}
```

#### Операции

```typescript
class ComponentTransferService {
  // Requirements: visual-design.2.1, visual-design.2.3
  async transferComponent(request: TransferRequest): Promise<TransferResult>;
  
  // Requirements: visual-design.2.4
  async checkConflicts(componentName: string): Promise<string[]>;
  
  // Requirements: visual-design.2.4
  async resolveConflict(resolution: ConflictResolution): Promise<void>;
  
  // Requirements: visual-design.2.5
  async notifyTransferComplete(result: TransferResult): Promise<void>;
}
```

### 3. Dependency Resolver

#### Структура Данных

```typescript
interface DependencyInfo {
  component: string;               // Имя компонента
  dependencies: string[];          // Прямые зависимости
  transitiveDependencies: string[]; // Транзитивные зависимости
  missingDependencies: string[];   // Отсутствующие зависимости
}

interface ImportStatement {
  source: string;                  // Источник импорта
  imports: string[];               // Импортируемые элементы
  isRelative: boolean;             // Относительный импорт
}
```

#### Операции

```typescript
class DependencyResolver {
  // Requirements: visual-design.2.3
  async analyzeDependencies(componentPath: string): Promise<DependencyInfo>;
  
  // Requirements: visual-design.2.3
  async extractImports(fileContent: string): Promise<ImportStatement[]>;
  
  // Requirements: visual-design.2.3
  async resolveDependencyTree(componentName: string): Promise<string[]>;
  
  // Requirements: visual-design.2.3
  async validateDependencies(componentName: string, targetDir: string): Promise<string[]>;
}
```

## Алгоритмы

### Алгоритм Переноса Компонента

```
FUNCTION transferComponent(request: TransferRequest) -> TransferResult
  // Requirements: visual-design.2.1, visual-design.2.2
  IF NOT request.explicitUserRequest THEN
    RETURN error("Automatic transfer not allowed")
  END IF
  
  // Requirements: visual-design.2.1
  component = figmaReferenceManager.getComponent(request.componentName)
  IF component IS NULL THEN
    RETURN error("Component not found in Figma Reference")
  END IF
  
  // Requirements: visual-design.2.4
  conflicts = checkConflicts(request.componentName)
  IF conflicts.length > 0 AND NOT request.overwrite THEN
    RETURN {
      success: false,
      conflicts: conflicts,
      message: "Component already exists. Confirmation required."
    }
  END IF
  
  // Requirements: visual-design.2.3
  dependencies = dependencyResolver.analyzeDependencies(component.path)
  missingDeps = dependencies.missingDependencies
  
  IF missingDeps.length > 0 THEN
    RETURN error("Missing dependencies: " + missingDeps.join(", "))
  END IF
  
  // Копирование файла компонента
  sourcePath = path.join(FIGMA_DIR, component.path)
  targetPath = path.join(RENDERER_DIR, component.path)
  
  fileContent = readFile(sourcePath)
  writeFile(targetPath, fileContent)
  
  filesTransferred = [component.path]
  
  // Requirements: visual-design.2.3
  // Копирование стилей если требуется
  IF request.includeStyles THEN
    FOR EACH styleFile IN ["theme.css", "tailwind.css", "fonts.css", "index.css"]
      sourceStyle = path.join(FIGMA_DIR, "styles", styleFile)
      targetStyle = path.join(RENDERER_DIR, "styles", styleFile)
      
      styleContent = readFile(sourceStyle)
      writeFile(targetStyle, styleContent)
      
      filesTransferred.push("styles/" + styleFile)
    END FOR
  END IF
  
  // Requirements: visual-design.2.5
  result = {
    success: true,
    componentName: request.componentName,
    filesTransferred: filesTransferred,
    conflicts: [],
    message: "Component transferred successfully"
  }
  
  notifyTransferComplete(result)
  
  RETURN result
END FUNCTION
```

### Алгоритм Анализа Зависимостей

```
FUNCTION analyzeDependencies(componentPath: string) -> DependencyInfo
  // Requirements: visual-design.2.3
  fileContent = readFile(componentPath)
  imports = extractImports(fileContent)
  
  directDeps = []
  transitiveDeps = []
  missingDeps = []
  
  FOR EACH import IN imports
    IF import.isRelative THEN
      // Относительный импорт - локальный компонент
      depPath = resolvePath(componentPath, import.source)
      depName = extractComponentName(depPath)
      
      directDeps.push(depName)
      
      // Рекурсивный анализ зависимостей
      IF fileExists(depPath) THEN
        subDeps = analyzeDependencies(depPath)
        transitiveDeps.push(...subDeps.dependencies)
      ELSE
        missingDeps.push(depName)
      END IF
    END IF
  END FOR
  
  RETURN {
    component: extractComponentName(componentPath),
    dependencies: unique(directDeps),
    transitiveDependencies: unique(transitiveDeps),
    missingDependencies: unique(missingDeps)
  }
END FUNCTION
```

### Алгоритм Проверки Конфликтов

```
FUNCTION checkConflicts(componentName: string) -> string[]
  // Requirements: visual-design.2.4
  component = figmaReferenceManager.getComponent(componentName)
  IF component IS NULL THEN
    RETURN []
  END IF
  
  targetPath = path.join(RENDERER_DIR, component.path)
  conflicts = []
  
  IF fileExists(targetPath) THEN
    conflicts.push(component.path)
  END IF
  
  RETURN conflicts
END FUNCTION
```

## Интерфейс Командной Строки

### Команды

```bash
# Список всех компонентов в Figma Reference
npm run figma:list

# Список только UI компонентов
npm run figma:list -- --type=ui

# Список только Feature компонентов
npm run figma:list -- --type=feature

# Перенос компонента
npm run figma:transfer -- --component=button

# Перенос компонента со стилями
npm run figma:transfer -- --component=dashboard --include-styles

# Перенос с перезаписью существующих
npm run figma:transfer -- --component=calendar-view --overwrite

# Проверка зависимостей компонента
npm run figma:deps -- --component=tasks-view

# Проверка конфликтов перед переносом
npm run figma:check -- --component=login-screen
```

## Свойства Корректности

### Property 1: Изоляция Figma Reference

**Validates: Requirements 1.1, 1.2**

```
PROPERTY: Figma Reference изолирован от Main Application

FORALL operations IN [read, write, update, delete]:
  WHEN operation выполняется в "Figma Reference"
  THEN "Main Application" НЕ изменяется
  
FORALL operations IN [read, write, update, delete]:
  WHEN operation выполняется в "Main Application"
  THEN "Figma Reference" НЕ изменяется
```

### Property 2: Контролируемый Перенос

**Validates: Requirements 2.1, 2.2**

```
PROPERTY: Компоненты переносятся только при явном запросе

FORALL components IN FigmaReference:
  WHEN component обновляется в "Figma Reference"
  THEN component в "Main Application" НЕ изменяется автоматически
  
FORALL transferRequests:
  WHEN transferRequest.explicitUserRequest = false
  THEN transfer НЕ выполняется
```

### Property 3: Сохранение Зависимостей

**Validates: Requirements 2.3**

```
PROPERTY: При переносе сохраняются все зависимости

FORALL components IN FigmaReference:
  LET deps = analyzeDependencies(component)
  WHEN transferComponent(component) выполняется
  THEN FORALL dep IN deps.dependencies:
    dep существует в "Main Application" OR
    dep переносится вместе с component
```

### Property 4: Обработка Конфликтов

**Validates: Requirements 2.4**

```
PROPERTY: Конфликты обрабатываются корректно

FORALL components IN FigmaReference:
  LET conflicts = checkConflicts(component)
  WHEN conflicts.length > 0 AND overwrite = false
  THEN transfer НЕ выполняется AND
       пользователь получает запрос подтверждения
       
FORALL components IN FigmaReference:
  LET conflicts = checkConflicts(component)
  WHEN conflicts.length > 0 AND overwrite = true
  THEN transfer выполняется AND
       существующие файлы перезаписываются
```

### Property 5: Уведомления о Результатах

**Validates: Requirements 2.5**

```
PROPERTY: Пользователь уведомляется о результатах

FORALL transferOperations:
  WHEN transfer завершается
  THEN пользователь получает TransferResult WITH
    result.success = true/false AND
    result.message содержит описание результата AND
    result.filesTransferred содержит список файлов OR
    result.conflicts содержит список конфликтов
```

## Тестирование

### Модульные Тесты

```typescript
describe('FigmaReferenceManager', () => {
  // Requirements: visual-design.1.1
  it('should scan all components in Figma Reference');
  it('should list UI components only');
  it('should list feature components only');
  
  // Requirements: visual-design.1.2
  it('should get component by name');
  it('should return null for non-existent component');
});

describe('ComponentTransferService', () => {
  // Requirements: visual-design.2.1
  it('should transfer component on explicit request');
  
  // Requirements: visual-design.2.2
  it('should reject automatic transfer without user request');
  
  // Requirements: visual-design.2.3
  it('should preserve all imports when transferring');
  it('should transfer styles when requested');
  it('should validate dependencies before transfer');
  
  // Requirements: visual-design.2.4
  it('should detect conflicts with existing components');
  it('should request confirmation when conflicts exist');
  it('should overwrite when explicitly requested');
  
  // Requirements: visual-design.2.5
  it('should notify user on successful transfer');
  it('should notify user on failed transfer');
});

describe('DependencyResolver', () => {
  // Requirements: visual-design.2.3
  it('should extract all imports from component');
  it('should resolve relative imports');
  it('should build complete dependency tree');
  it('should detect missing dependencies');
  it('should detect circular dependencies');
});
```

### Функциональные Тесты

```typescript
describe('End-to-End Component Transfer', () => {
  it('should transfer UI component with all dependencies');
  it('should transfer feature component with styles');
  it('should handle conflict resolution workflow');
  it('should validate complete transfer workflow');
});
```

## Фреймворк для Тестирования

- **Модульные тесты**: Jest
- **Функциональные тесты**: Jest + file system mocks

## Ограничения и Предположения

### Ограничения

1. Система работает только с TypeScript/TSX компонентами
2. Поддерживаются только относительные импорты для локальных компонентов
3. Стили должны быть в формате CSS (не SCSS/LESS)
4. Компоненты должны следовать структуре директорий проекта

### Предположения

1. Figma Reference всегда содержит валидный TypeScript код
2. Все компоненты используют React
3. Стили используют CSS переменные для темизации
4. Импорты следуют стандартным соглашениям ES6

## Будущие Улучшения

1. Поддержка автоматической синхронизации с Figma API
2. Визуальная валидация компонентов (screenshot comparison)
3. Автоматическое разрешение конфликтов при merge
4. Поддержка частичного переноса (только стили или только разметка)
5. История переносов с возможностью отката
6. Интеграция с системой контроля версий (Git)
