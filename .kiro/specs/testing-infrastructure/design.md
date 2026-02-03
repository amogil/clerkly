# Документ Дизайна: Инфраструктура Тестирования

## Обзор

Данный документ описывает дизайн инфраструктуры тестирования для приложения Clerkly, включая архитектуру тестов, стратегию мокирования, процесс валидации и требования к окружению для запуска различных типов тестов.

## Архитектура Тестирования

### Пирамида Тестирования

```
        Integration/Functional
       (Real Electron)
       /                \
      /   Property-Based  \
     /    (Mocked)          \
    /________________________\
   Unit Tests (Fully Mocked)
```

### Типы Тестов

#### 1. Модульные Тесты (Unit Tests)

**Расположение**: `tests/unit/**/*.test.ts`

**Характеристики**:
- Полностью изолированные
- Все зависимости замокированы
- Быстрые (< 100ms на тест)
- Проверяют логику отдельных функций/классов

**Моки**:
```typescript
// Requirements: testing.1.2
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  app: { getPath: jest.fn() },
  screen: { getPrimaryDisplay: jest.fn() }
}));

jest.mock('fs');
jest.mock('better-sqlite3');
```

#### 2. Property-Based Тесты

**Расположение**: `tests/property/**/*.property.test.ts`

**Характеристики**:
- Проверяют инварианты на множестве входных данных
- Используют fast-check для генерации данных
- Все зависимости замокированы
- Выполняют 100+ итераций

**Пример**:
```typescript
// Requirements: testing.2.2, testing.2.3
fc.assert(
  fc.property(
    fc.record({
      width: fc.integer({ min: 800, max: 3840 }),
      height: fc.integer({ min: 600, max: 2160 })
    }),
    (screenSize) => {
      // Проверка инварианта
      const state = windowStateManager.loadState();
      expect(state.width).toBeLessThanOrEqual(screenSize.width);
    }
  ),
  { numRuns: 100 }
);
```

#### 3. Интеграционные Тесты

**Расположение**: `tests/integration/**/*.integration.test.ts`

**Характеристики**:
- **НЕ мокируют Electron** (Requirements: testing.3.2)
- Используют реальный Electron
- Используют реальные классы приложения
- Используют реальную БД в временной директории
- Проверяют взаимодействие компонентов

**Настройка**:
```typescript
// Requirements: testing.3.1, testing.3.2
// НЕТ jest.mock('electron') - используем реальный Electron!

import { BrowserWindow, screen } from 'electron';
import { DataManager } from '../../src/main/DataManager';
import WindowManager from '../../src/main/WindowManager';

describe('Window State Integration Tests', () => {
  let testDbPath: string;
  let dataManager: DataManager;
  let windowManager: WindowManager;

  beforeEach(() => {
    // Requirements: testing.3.4
    testDbPath = path.join(os.tmpdir(), `test-${Date.now()}`);
    dataManager = new DataManager(testDbPath); // Реальная БД
    windowManager = new WindowManager(dataManager); // Реальный класс
  });

  afterEach(() => {
    // Requirements: testing.3.6
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true });
    }
  });
});
```

#### 4. Функциональные Тесты

**Расположение**: `tests/functional/**/*.functional.test.ts`

**Характеристики**:
- **НЕ мокируют Electron** (Requirements: testing.4.2)
- Используют реальный Electron
- Показывают реальные окна на экране (Requirements: testing.4.6)
- Проверяют end-to-end сценарии
- Используют реальную БД и файловую систему

**Настройка**:
```typescript
// Requirements: testing.4.1, testing.4.2
// НЕТ jest.mock('electron') - используем реальный Electron!

import { app, BrowserWindow } from 'electron';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

describe('Window State Persistence Functional Tests', () => {
  let testStoragePath: string;
  let dataManager: DataManager;
  let windowManager: WindowManager;

  beforeEach(() => {
    // Requirements: testing.4.4, testing.4.5
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();
    windowManager = new WindowManager(dataManager);
  });

  afterEach(() => {
    // Requirements: testing.4.7
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });
});
```

## Процесс Валидации

### Команда `npm run validate`

**Requirements**: testing.5.1, testing.5.2, testing.5.3

Выполняет следующие проверки:

1. **TypeScript компиляция** - `npm run build`
2. **ESLint** - `npm run lint` (с автофиксом при необходимости)
3. **Prettier** - `npm run format:check` (с автофиксом при необходимости)
4. **Модульные тесты** - `npm run test:unit`
5. **Property-based тесты** - `npm run test:property`
6. **Покрытие кода** - `npm run test:coverage`

**НЕ включает**:
- ❌ Интеграционные тесты
- ❌ Функциональные тесты

### Отдельные Команды для Интеграционных и Функциональных Тестов

**Requirements**: testing.6.1, testing.6.2, testing.6.3, testing.6.5

```bash
# Интеграционные тесты (с реальным Electron)
npm run test:integration

# Функциональные тесты (с реальным Electron, показывают окна)
npm run test:functional

# Все тесты (включая интеграционные и функциональные)
npm test
```

**Предупреждение пользователю**: 

**Requirements**: testing.6.5

Перед запуском интеграционных или функциональных тестов пользователь должен быть предупрежден о том, что будут показаны окна на экране. Это можно реализовать через:

1. Сообщение в консоли при запуске команды
2. Документацию в README.md
3. Интерактивное подтверждение (опционально)

## Стратегия Тестирования

### Таблица Мокирования

**Requirements**: testing.1.2, testing.2.1, testing.3.2, testing.4.2

| Компонент | Unit | Property | Integration | Functional |
|-----------|------|----------|-------------|------------|
| **Electron API** | ✅ Мок | ✅ Мок | ❌ Реальный | ❌ Реальный |
| **Внутренние классы** | ✅ Мок | ✅ Мок | ❌ Реальные | ❌ Реальные |
| **База данных** | ✅ Мок | ✅ Мок | ❌ Реальная | ❌ Реальная |
| **Файловая система** | ✅ Мок | ✅ Мок | ❌ Реальная | ❌ Реальная |
| **Сетевые запросы** | ✅ Мок | ✅ Мок | ✅ Мок | ✅ Мок |

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Интеграционные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|----------------------|
| testing.1.1 | ✓ | - | - | - |
| testing.1.2 | ✓ | - | - | - |
| testing.1.3 | ✓ | - | - | - |
| testing.1.4 | ✓ | - | - | - |
| testing.2.1 | - | ✓ | - | - |
| testing.2.2 | - | ✓ | - | - |
| testing.2.3 | - | ✓ | - | - |
| testing.2.4 | - | ✓ | - | - |
| testing.3.1 | - | - | ✓ | - |
| testing.3.2 | - | - | ✓ | - |
| testing.3.3 | - | - | ✓ | - |
| testing.3.4 | - | - | ✓ | - |
| testing.3.5 | - | - | ✓ | - |
| testing.3.6 | - | - | ✓ | - |
| testing.4.1 | - | - | - | ✓ |
| testing.4.2 | - | - | - | ✓ |
| testing.4.3 | - | - | - | ✓ |
| testing.4.4 | - | - | - | ✓ |
| testing.4.5 | - | - | - | ✓ |
| testing.4.6 | - | - | - | ✓ |
| testing.4.7 | - | - | - | ✓ |
| testing.5.1 | ✓ | ✓ | - | - |
| testing.5.2 | - | - | - | - |
| testing.5.3 | - | - | - | - |
| testing.5.4 | ✓ | ✓ | - | - |
| testing.5.5 | ✓ | ✓ | - | - |
| testing.6.1 | - | - | ✓ | - |
| testing.6.2 | - | - | - | ✓ |
| testing.6.3 | - | - | ✓ | ✓ |
| testing.6.4 | - | - | ✓ | ✓ |
| testing.6.5 | - | - | ✓ | ✓ |
| testing.7.1 | - | - | ✓ | ✓ |
| testing.7.2 | - | - | ✓ | ✓ |
| testing.7.3 | - | - | ✓ | ✓ |
| testing.7.4 | - | - | ✓ | ✓ |
| testing.7.5 | - | - | ✓ | ✓ |

## Требования к Окружению

### Для Модульных и Property-Based Тестов

**Requirements**: testing.1, testing.2

- Node.js 18+
- npm 9+
- Не требуется графическая среда
- Не требуется Electron

### Для Интеграционных и Функциональных Тестов

**Requirements**: testing.7.1, testing.7.2, testing.7.3, testing.7.4

- Node.js 18+
- npm 9+
- **Графическая среда** (X11/Wayland на Linux, Window Server на macOS, графическая среда на Windows)
- **Electron** установлен как зависимость
- **xvfb** на Linux для headless режима (опционально)

**Поведение при отсутствии графической среды**: 

**Requirements**: testing.7.4

Если графическая среда недоступна, тесты должны пропускаться с предупреждением вместо падения с ошибкой.

### Использование Временных Директорий

**Requirements**: testing.7.5

Интеграционные и функциональные тесты должны использовать временные директории для хранения данных:

```typescript
import * as os from 'os';
import * as path from 'path';

beforeEach(() => {
  testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);
  dataManager = new DataManager(testStoragePath);
});

afterEach(() => {
  if (fs.existsSync(testStoragePath)) {
    fs.rmSync(testStoragePath, { recursive: true, force: true });
  }
});
```

### Запуск в CI/CD

**Requirements**: testing.6.4

```yaml
# GitHub Actions example
- name: Run validation (without integration/functional tests)
  run: npm run validate

# Интеграционные и функциональные тесты НЕ запускаются в CI
```

## Критерии Успеха

1. ✅ Модульные тесты выполняются < 10 секунд
2. ✅ Property-based тесты выполняются < 20 секунд
3. ✅ Валидация выполняется < 30 секунд
4. ✅ Интеграционные тесты используют реальный Electron
5. ✅ Функциональные тесты используют реальный Electron
6. ✅ Покрытие кода > 85%
7. ✅ Все тесты проходят без ошибок
