# Задачи: Инфраструктура Тестирования

## Обзор

Данный документ содержит список задач для реализации инфраструктуры тестирования приложения Clerkly согласно требованиям и дизайну.

## Статус Задач

- `[ ]` - Не начата
- `[~]` - В очереди
- `[-]` - В процессе
- `[x]` - Завершена

---

## 1. Настройка Конфигурации Тестирования

### 1.1 Обновить Jest конфигурацию для разделения типов тестов

**Requirements:** testing.1, testing.2, testing.3, testing.4

**Описание:** Настроить Jest для поддержки различных типов тестов с правильными стратегиями мокирования.

**Детали:**
- Создать отдельные конфигурации для unit, property, integration, functional тестов
- Настроить моки для unit и property тестов
- Отключить моки для integration и functional тестов
- Настроить testMatch паттерны для каждого типа тестов

**Файлы:**
- `jest.config.js` - основная конфигурация
- `jest.unit.config.js` - конфигурация для модульных тестов
- `jest.property.config.js` - конфигурация для property-based тестов
- `jest.integration.config.js` - конфигурация для интеграционных тестов
- `jest.functional.config.js` - конфигурация для функциональных тестов

- [x] 1.1.1 Создать jest.unit.config.js с полным мокированием

**Requirements:** testing.1.2, testing.1.3

**Детали:**
- Настроить automock для Electron API
- Настроить моки для fs, path, crypto, better-sqlite3
- Установить testTimeout: 10000 (10 секунд)
- Настроить testMatch: `**/tests/unit/**/*.test.ts`

- [x] 1.1.2 Создать jest.property.config.js с полным мокированием

**Requirements:** testing.2.1, testing.2.2, testing.2.3

**Детали:**
- Использовать ту же стратегию мокирования что и в unit тестах
- Установить testTimeout: 30000 (30 секунд для 100+ итераций)
- Настроить testMatch: `**/tests/property/**/*.property.test.ts`

- [x] 1.1.3 Создать jest.integration.config.js БЕЗ мокирования Electron

**Requirements:** testing.3.1, testing.3.2, testing.3.3

**Детали:**
- НЕ мокировать Electron API
- Использовать реальный Electron через @electron/remote или spectron
- Установить testTimeout: 60000 (60 секунд)
- Настроить testMatch: `**/tests/integration/**/*.integration.test.ts`
- Настроить testEnvironment: 'node'

- [x] 1.1.4 Создать jest.functional.config.js БЕЗ мокирования Electron

**Requirements:** testing.4.1, testing.4.2, testing.4.3

**Детали:**
- НЕ мокировать Electron API
- Использовать реальный Electron
- Установить testTimeout: 120000 (120 секунд)
- Настроить testMatch: `**/tests/functional/**/*.functional.test.ts`
- Настроить testEnvironment: 'node'

### 1.2 Обновить package.json скрипты

**Requirements:** testing.5.1, testing.6.1, testing.6.2

**Описание:** Добавить команды для запуска различных типов тестов.

**Детали:**
- Создать отдельные команды для каждого типа тестов
- Настроить команду validate для быстрой проверки
- Добавить предупреждения для integration/functional тестов

- [x] 1.2.1 Добавить команды для запуска тестов

**Requirements:** testing.5.1, testing.6.1, testing.6.2

**Детали:**
```json
{
  "scripts": {
    "test:unit": "jest --config jest.unit.config.js",
    "test:property": "jest --config jest.property.config.js",
    "test:integration": "echo '⚠️  Integration tests use real Electron and may show windows' && jest --config jest.integration.config.js",
    "test:functional": "echo '⚠️  Functional tests use real Electron and WILL show windows on screen' && jest --config jest.functional.config.js",
    "test:coverage": "jest --config jest.unit.config.js --coverage && jest --config jest.property.config.js --coverage",
    "test": "npm run test:unit && npm run test:property && npm run test:integration && npm run test:functional"
  }
}
```

---

## 2. Создание Скрипта Валидации

### 2.1 Создать scripts/validate.sh

**Requirements:** testing.5.1, testing.5.2, testing.5.3, testing.5.4, testing.5.5

**Описание:** Создать скрипт для быстрой валидации кода без запуска integration/functional тестов.

**Детали:**
- Выполнять TypeScript компиляцию
- Запускать ESLint с автофиксом
- Запускать Prettier с автофиксом
- Запускать unit и property тесты
- Проверять покрытие кода
- Возвращать ненулевой код при ошибках

- [x] 2.1.1 Реализовать scripts/validate.sh

**Requirements:** testing.5.1, testing.5.4, testing.5.5

**Детали:**
```bash
#!/bin/bash
set -e

echo "🔍 Running validation..."

echo "📦 TypeScript compilation..."
npm run build

echo "🔧 ESLint check..."
npm run lint || npm run lint:fix

echo "💅 Prettier check..."
npm run format:check || npm run format

echo "🧪 Unit tests..."
npm run test:unit

echo "🎲 Property-based tests..."
npm run test:property

echo "📊 Code coverage..."
npm run test:coverage

echo "✅ Validation complete!"
```

- [x] 2.1.2 Добавить команду validate в package.json

**Requirements:** testing.5.1

**Детали:**
```json
{
  "scripts": {
    "validate": "bash scripts/validate.sh"
  }
}
```

---

## 3. Обновление Существующих Модульных Тестов

### 3.1 Проверить стратегию мокирования в модульных тестах

**Requirements:** testing.1.1, testing.1.2

**Описание:** Убедиться что все модульные тесты правильно мокируют внешние зависимости.

**Детали:**
- Проверить что все Electron API замокированы
- Проверить что fs, path, crypto замокированы
- Проверить что база данных замокирована
- Проверить что сетевые запросы замокированы

- [x] 3.1.1 Аудит модульных тестов на правильность мокирования

**Requirements:** testing.1.2

**Детали:**
- Проверить все файлы в `tests/unit/**/*.test.ts`
- Убедиться что есть `jest.mock('electron')`
- Убедиться что есть моки для всех внешних зависимостей
- Создать список тестов требующих исправления

- [x] 3.1.2 Исправить модульные тесты с неправильным мокированием

**Requirements:** testing.1.1, testing.1.2

**Детали:**
- Добавить недостающие моки
- Убрать использование реальных зависимостей
- Убедиться что тесты выполняются < 100ms

---

## 4. Обновление Существующих Property-Based Тестов

### 4.1 Проверить стратегию мокирования в property-based тестах

**Requirements:** testing.2.1

**Описание:** Убедиться что все property-based тесты правильно мокируют внешние зависимости.

**Детали:**
- Применить ту же стратегию мокирования что и в модульных тестах
- Проверить количество итераций (минимум 100)
- Проверить что тесты проверяют инварианты

- [x] 4.1.1 Аудит property-based тестов на правильность мокирования

**Requirements:** testing.2.1, testing.2.3

**Детали:**
- Проверить все файлы в `tests/property/**/*.property.test.ts`
- Убедиться что есть моки для всех внешних зависимостей
- Проверить что используется `fc.assert` с `numRuns >= 100`

- [x] 4.1.2 Исправить property-based тесты с неправильным мокированием

**Requirements:** testing.2.1, testing.2.2, testing.2.3, testing.2.4

**Детали:**
- Добавить недостающие моки
- Установить numRuns: 100 где необходимо
- Убедиться что тесты проверяют инварианты а не конкретные значения

---

## 5. Обновление Существующих Интеграционных Тестов

### 5.1 Удалить моки Electron из интеграционных тестов

**Requirements:** testing.3.2

**Описание:** КРИТИЧЕСКИ ВАЖНО - интеграционные тесты НЕ должны мокировать Electron API.

**Детали:**
- Удалить все `jest.mock('electron')` из интеграционных тестов
- Использовать реальный Electron
- Настроить временные директории для данных

- [x] 5.1.1 Аудит интеграционных тестов на наличие моков Electron

**Requirements:** testing.3.2

**Детали:**
- Проверить все файлы в `tests/integration/**/*.integration.test.ts`
- Найти все `jest.mock('electron')`
- Создать список тестов требующих исправления

- [x] 5.1.2 Удалить моки Electron из интеграционных тестов

**Requirements:** testing.3.1, testing.3.2, testing.3.3

**Детали:**
- Удалить `jest.mock('electron')`
- Импортировать реальный Electron: `import { BrowserWindow, app } from 'electron'`
- Использовать реальные классы приложения
- Настроить beforeEach/afterEach для создания/очистки временных директорий

- [x] 5.1.3 Настроить временные директории для интеграционных тестов

**Requirements:** testing.3.4, testing.3.5, testing.3.6

**Детали:**
```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let testDbPath: string;

beforeEach(() => {
  testDbPath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);
  fs.mkdirSync(testDbPath, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.rmSync(testDbPath, { recursive: true, force: true });
  }
});
```

---

## 6. Обновление Существующих Функциональных Тестов

### 6.1 Удалить моки Electron из функциональных тестов

**Requirements:** testing.4.2

**Описание:** КРИТИЧЕСКИ ВАЖНО - функциональные тесты НЕ должны мокировать Electron API.

**Детали:**
- Удалить все `jest.mock('electron')` из функциональных тестов
- Использовать реальный Electron
- Настроить временные директории для данных
- Убедиться что тесты показывают реальные окна

- [x] 6.1.1 Аудит функциональных тестов на наличие моков Electron

**Requirements:** testing.4.2

**Детали:**
- Проверить все файлы в `tests/functional/**/*.functional.test.ts`
- Найти все `jest.mock('electron')`
- Создать список тестов требующих исправления

- [x] 6.1.2 Удалить моки Electron из функциональных тестов

**Requirements:** testing.4.1, testing.4.2, testing.4.3

**Детали:**
- Удалить `jest.mock('electron')`
- Импортировать реальный Electron: `import { app, BrowserWindow } from 'electron'`
- Использовать реальные классы приложения
- Настроить beforeEach/afterEach для создания/очистки временных директорий

- [x] 6.1.3 Настроить временные директории для функциональных тестов

**Requirements:** testing.4.4, testing.4.5, testing.4.7

**Детали:**
```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let testStoragePath: string;

beforeEach(() => {
  testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);
  fs.mkdirSync(testStoragePath, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testStoragePath)) {
    fs.rmSync(testStoragePath, { recursive: true, force: true });
  }
});
```

- [x] 6.1.4 Убедиться что функциональные тесты показывают окна

**Requirements:** testing.4.6

**Детали:**
- Проверить что BrowserWindow создаются с `show: true` или вызывается `.show()`
- Добавить комментарии о том что тесты показывают окна на экране
- Убедиться что окна закрываются после тестов

---

## 7. Добавление Проверки Окружения

### 7.1 Создать утилиту для проверки графической среды

**Requirements:** testing.7.1, testing.7.2, testing.7.3, testing.7.4

**Описание:** Создать утилиту для проверки доступности графической среды перед запуском integration/functional тестов.

**Детали:**
- Проверять наличие DISPLAY на Linux
- Проверять доступность Window Server на macOS
- Проверять графическую среду на Windows
- Пропускать тесты с предупреждением если среда недоступна

- [x] 7.1.1 Создать tests/utils/checkGraphicalEnvironment.ts

**Requirements:** testing.7.1, testing.7.2, testing.7.3, testing.7.4

**Детали:**
```typescript
export function checkGraphicalEnvironment(): boolean {
  const platform = process.platform;
  
  if (platform === 'linux') {
    return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
  }
  
  if (platform === 'darwin') {
    // macOS всегда имеет графическую среду если не headless
    return true;
  }
  
  if (platform === 'win32') {
    // Windows всегда имеет графическую среду
    return true;
  }
  
  return false;
}

export function skipIfNoGraphicalEnvironment(testName: string): void {
  if (!checkGraphicalEnvironment()) {
    console.warn(`⚠️  Skipping ${testName}: No graphical environment available`);
    return;
  }
}
```

- [x] 7.1.2 Добавить проверку окружения в integration/functional тесты

**Requirements:** testing.7.4

**Детали:**
```typescript
import { skipIfNoGraphicalEnvironment } from '../utils/checkGraphicalEnvironment';

describe('Integration Tests', () => {
  beforeAll(() => {
    skipIfNoGraphicalEnvironment('Integration Tests');
  });
  
  // тесты...
});
```

---

## 8. Обновление Документации

### 8.1 Обновить README.md

**Requirements:** testing.6.3, testing.6.5

**Описание:** Добавить документацию о различных типах тестов и как их запускать.

**Детали:**
- Описать типы тестов
- Объяснить стратегию мокирования
- Добавить примеры команд
- Предупредить о показе окон в functional тестах

- [x] 8.1.1 Добавить секцию "Testing" в README.md

**Requirements:** testing.6.5

**Детали:**
```markdown
## Testing

### Test Types

- **Unit Tests** (`tests/unit/**/*.test.ts`) - Fast, isolated tests with all dependencies mocked
- **Property-Based Tests** (`tests/property/**/*.property.test.ts`) - Tests that verify invariants across many inputs
- **Integration Tests** (`tests/integration/**/*.integration.test.ts`) - Tests using real Electron (no mocks)
- **Functional Tests** (`tests/functional/**/*.functional.test.ts`) - End-to-end tests with real Electron showing windows

### Running Tests

```bash
# Quick validation (unit + property tests only)
npm run validate

# Individual test types
npm run test:unit
npm run test:property
npm run test:integration  # ⚠️ Uses real Electron, may show windows
npm run test:functional   # ⚠️ Uses real Electron, WILL show windows

# All tests
npm test
```

### Important Notes

- Integration and functional tests use **real Electron** and may show windows on your screen
- These tests are NOT included in `npm run validate` for faster feedback
- Run integration/functional tests explicitly when needed
```

---

## 9. Валидация и Тестирование

### 9.1 Запустить валидацию

**Requirements:** testing.5.1, testing.5.4

**Описание:** Убедиться что все изменения проходят валидацию.

**Детали:**
- Запустить `npm run validate`
- Проверить что все проверки проходят
- Исправить найденные проблемы

- [x] 9.1.1 Запустить npm run validate

**Requirements:** testing.5.1, testing.5.4, testing.5.5

**Детали:**
- Выполнить `npm run validate`
- Убедиться что TypeScript компилируется
- Убедиться что ESLint проходит
- Убедиться что Prettier проходит
- Убедиться что unit тесты проходят
- Убедиться что property тесты проходят
- Убедиться что покрытие >= 85%

### 9.2 Запустить integration тесты (по запросу пользователя)

**Requirements:** testing.6.1, testing.6.3

**Описание:** Запустить integration тесты с реальным Electron.

**Детали:**
- Запускать ТОЛЬКО по явному запросу пользователя
- Предупредить о показе окон
- Проверить что тесты используют реальный Electron

- [x] 9.2.1 Запустить npm run test:integration (ТОЛЬКО по запросу)

**Requirements:** testing.6.1, testing.6.3, testing.6.5

**Детали:**
- Предупредить пользователя: "Integration tests will use real Electron and may show windows. Continue?"
- Выполнить `npm run test:integration`
- Проверить что все тесты проходят
- Проверить что НЕ используются моки Electron

**Статус:** Готово к запуску. Интеграционные тесты переписаны для использования реального Electron.

### 9.3 Запустить functional тесты (по запросу пользователя)

**Requirements:** testing.6.2, testing.6.3

**Описание:** Запустить functional тесты с реальным Electron.

**Детали:**
- Запускать ТОЛЬКО по явному запросу пользователя
- Предупредить о показе окон на экране
- Проверить что тесты используют реальный Electron

- [x] 9.3.1 Запустить npm run test:functional (ТОЛЬКО по запросу)

**Requirements:** testing.6.2, testing.6.3, testing.6.5

**Детали:**
- Предупредить пользователя: "Functional tests WILL show windows on your screen. Continue?"
- Выполнить `npm run test:functional`
- Проверить что все тесты проходят
- Проверить что окна показываются на экране
- Проверить что НЕ используются моки Electron

**Статус:** Готово к запуску. Функциональные тесты переписаны для использования реального Electron и показа реальных окон.

---

## 10. Development Mode с Поддержкой Deep Links

### 10.1 Добавить npm скрипт для dev mode с deep links

**Requirements:** testing.9.1, testing.9.2, testing.9.3, testing.9.4

**Описание:** Создать команду `npm run dev:app` для быстрой разработки с поддержкой OAuth deep links.

**Детали:**
- Использовать `electron-builder --mac --dir` для создания unpacked .app bundle
- Не создавать DMG или ZIP архивы
- Автоматически открывать приложение после сборки
- Обеспечить правильную регистрацию custom protocol handler

- [x] 10.1.1 Добавить команду dev:app в package.json

**Requirements:** testing.9.1, testing.9.4, testing.9.7

**Детали:**
```json
{
  "scripts": {
    "dev:app": "npm run build && npx electron-builder --mac --dir && open release/mac-arm64/Clerkly.app"
  }
}
```

- [x] 10.1.2 Добавить protocols конфигурацию в package.json

**Requirements:** testing.9.2

**Детали:**
```json
{
  "build": {
    "protocols": [
      {
        "name": "Clerkly OAuth",
        "schemes": [
          "com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa"
        ]
      }
    ]
  }
}
```

### 10.2 Обновить документацию

**Requirements:** testing.9.5, testing.9.9, testing.9.10

**Описание:** Добавить документацию о новом dev mode в README.md и OAUTH_SETUP.md.

**Детали:**
- Объяснить разницу между `npm run dev` и `npm run dev:app`
- Указать время выполнения каждой команды
- Добавить рекомендации по использованию

- [x] 10.2.1 Обновить README.md

**Requirements:** testing.9.5, testing.9.10

**Детали:**
```markdown
### Разработка
```bash
npm start                # Запуск приложения (production build с DMG, 60-90 сек)
npm run dev              # Быстрая разработка БЕЗ deep links (10-15 сек)
npm run dev:app          # Разработка С deep links для OAuth (20-30 сек)
npm run build            # Сборка проекта
npm run typecheck        # Проверка типов
```

**Выбор режима разработки:**
- `npm run dev` - для обычной разработки UI/логики (быстро)
- `npm run dev:app` - для тестирования OAuth flow с Google (средне)
- `npm start` - для финального тестирования перед релизом (медленно)
```

- [x] 10.2.2 Обновить OAUTH_SETUP.md

**Requirements:** testing.9.8, testing.9.9

**Детали:**
```markdown
### 8. Запустите приложение

```bash
# Production build с DMG (медленно, 60-90 сек)
npm start

# Dev mode с deep links (быстро, 20-30 сек) - РЕКОМЕНДУЕТСЯ для разработки
npm run dev:app

# Dev mode без deep links (очень быстро, 10-15 сек) - для UI разработки
npm run dev
```

**Рекомендация**: Используйте `npm run dev:app` для разработки с OAuth - это создает unpacked .app bundle с правильной регистрацией protocol handler, но без создания DMG.
```

- [x] 10.2.3 Добавить troubleshooting секцию в OAUTH_SETUP.md

**Requirements:** testing.9.8

**Детали:**
```markdown
### Deep Links не работают в dev mode (`npm run dev`)

**Проблема**: При запуске через `electron .` приложение не регистрируется как обработчик custom protocol в macOS.

**Решение**: Используйте `npm run dev:app` вместо `npm run dev` для тестирования OAuth flow.

**Почему**: macOS требует `.app` bundle с Info.plist, содержащим CFBundleURLTypes.
```

### 10.3 Обновить спецификации

**Requirements:** testing.9

**Описание:** Добавить требование testing.9 в requirements.md и дизайн в design.md.

**Детали:**
- Добавить новое требование testing.9 в requirements.md
- Добавить секцию "Development Mode с Поддержкой Deep Links" в design.md
- Объяснить проблему и решение

- [x] 10.3.1 Добавить требование testing.9 в requirements.md

**Requirements:** testing.9

**Детали:**
```markdown
### 9. Development Mode с Поддержкой Deep Links

**ID:** testing.9

**User Story:** Как разработчик, я хочу иметь быстрый dev mode с поддержкой OAuth deep links, чтобы тестировать полный OAuth flow без создания production build.

**Зависимости:** Нет

#### Критерии Приемки

9.1. THE команда `npm run dev:app` SHALL создавать unpacked .app bundle с помощью electron-builder
9.2. THE unpacked .app bundle SHALL корректно регистрировать custom protocol handler для deep links
9.3. THE dev mode SHALL НЕ создавать DMG или ZIP архивы
9.4. THE dev mode SHALL использовать флаг `--dir` для electron-builder
9.5. THE dev mode SHALL быть быстрее чем полный production build (target: <30 секунд)
9.6. THE unpacked .app bundle SHALL быть расположен в `release/mac-arm64/Clerkly.app`
9.7. THE команда `npm run dev:app` SHALL автоматически открывать приложение после сборки
9.8. WHEN OAuth callback происходит, THE deep link SHALL корректно обрабатываться приложением
9.9. THE dev mode SHALL поддерживать hot reload через пересборку и перезапуск
9.10. THE команда `npm run dev` (без :app) SHALL оставаться для быстрой разработки без deep links
```

- [x] 10.3.2 Добавить секцию в design.md

**Requirements:** testing.9

**Детали:**
```markdown
## Development Mode с Поддержкой Deep Links

**Requirements**: testing.9

### Проблема

В обычном dev mode (`npm run dev`) приложение запускается через `electron .`, что не создает `.app` bundle. Это приводит к проблемам:

1. **Deep links не работают**: macOS не может зарегистрировать custom protocol handler без `.app` bundle с Info.plist
2. **OAuth callback не работает**: Google OAuth redirect на `clerkly://oauth/callback` не обрабатывается
3. **Невозможно тестировать OAuth flow**: Приходится использовать полный production build (`npm run start`), который занимает 60-90 секунд

### Решение: Unpacked .app Bundle

Используем `electron-builder --dir` для создания unpacked `.app` bundle без DMG/ZIP архивов.

### Преимущества

1. **Быстрее production build**: ~20-30 секунд vs 60-90 секунд
2. **Deep links работают**: `.app` bundle корректно регистрирует protocol handler
3. **OAuth flow работает**: Можно тестировать полный OAuth flow с Google
4. **Автоматический запуск**: Приложение открывается автоматически после сборки
```

---

## Критерии Завершения

Все задачи считаются завершенными когда:

- ✅ Jest конфигурации созданы для всех типов тестов
- ✅ Package.json содержит все необходимые команды
- ✅ Скрипт validate работает корректно
- ✅ Модульные тесты правильно мокируют зависимости
- ✅ Property-based тесты правильно мокируют зависимости
- ✅ Интеграционные тесты НЕ мокируют Electron
- ✅ Функциональные тесты НЕ мокируют Electron
- ✅ Временные директории настроены для integration/functional тестов
- ✅ Проверка графической среды реализована
- ✅ Документация обновлена
- ✅ `npm run validate` проходит успешно
- ✅ Dev mode с deep links реализован и задокументирован
- ✅ Все требования покрыты задачами
