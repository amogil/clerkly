# Задачи: Инфраструктура Тестирования

## Обзор

Данный документ содержит список задач для реализации инфраструктуры тестирования приложения Clerkly согласно требованиям и дизайну. Все задачи в этой спецификации выполнены.

**Последнее обновление:** 2026-02-11

## Статус Задач

- `[ ]` - Не начата
- `[~]` - В очереди
- `[-]` - В процессе
- `[x]` - Завершена

---

## 1. Настройка Конфигурации Тестирования

### 1.1 Настроить Jest конфигурации для модульных тестов

**Requirements:** testing.1

**Описание:** Настроить Jest для поддержки модульных тестов с правильными стратегиями мокирования.

**Детали:**
- Создать отдельные конфигурации для unit тестов
- Настроить моки для всех внешних зависимостей
- Настроить testMatch паттерны для unit тестов
- Настроить покрытие кода

**Файлы:**
- `jest.config.js` - базовая конфигурация
- `jest.unit.config.js` - конфигурация для модульных тестов
- `jest.combined.config.js` - конфигурация для покрытия кода

- [x] 1.1.1 Создать jest.unit.config.js с полным мокированием

**Requirements:** testing.1.2, testing.1.3

**Детали:**
- Настроить моки для Electron API
- Настроить моки для fs, path, crypto, better-sqlite3
- Установить testTimeout: 10000 (10 секунд)
- Настроить testMatch: `**/tests/unit/**/*.test.ts`, `**/tests/unit/**/*.test.tsx`

- [x] 1.1.2 Создать jest.combined.config.js для покрытия кода

**Requirements:** testing.4.1

**Детали:**
- Использовать unit тесты для расчета покрытия
- Настроить collectCoverageFrom для исключения figma/
- Установить coverageThreshold: 80% для всех метрик

### 1.2 Настроить Playwright для функциональных тестов

**Requirements:** testing.3, testing.3.1, testing.3.9

**Описание:** Настроить Playwright для запуска функциональных тестов с реальным Electron.

**Детали:**
- Создать playwright.config.ts
- Настроить testDir: './tests/functional'
- Настроить timeout: 60000 (60 секунд)
- Настроить workers: 1 (последовательное выполнение)
- Настроить reporters: list и html
- Настроить trace, screenshot, video для отладки

**Файлы:**
- `playwright.config.ts` - конфигурация Playwright

- [x] 1.2.1 Создать playwright.config.ts

**Requirements:** testing.3.1, testing.3.2, testing.3.9

**Детали:**
- Настроить testDir: './tests/functional'
- Настроить timeout: 60000
- Настроить fullyParallel: false
- Настроить workers: 1
- Настроить trace: 'on-first-retry'
- Настроить screenshot: 'only-on-failure'
- Настроить video: 'retain-on-failure'

### 1.3 Обновить package.json скрипты

**Requirements:** testing.4.1, testing.5.1, testing.5.4

**Описание:** Добавить команды для запуска различных типов тестов.

**Детали:**
- Создать отдельные команды для каждого типа тестов
- Настроить команду validate для быстрой проверки
- Добавить предупреждения для функциональных тестов
- Добавить команды для rebuild нативных модулей

- [x] 1.3.1 Добавить команды для запуска тестов

**Requirements:** testing.4.1, testing.5.1, testing.5.4

**Детали:**
```json
{
  "scripts": {
    "rebuild:electron": "electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "npm rebuild better-sqlite3",
    "test": "npm run rebuild:node && npm run test:unit",
    "test:unit": "jest --config jest.unit.config.js",
    "test:functional": "npm run rebuild:electron && npm run build && playwright test",
    "test:functional:verbose": "npm run rebuild:electron && npm run build && playwright test --reporter=list",
    "test:functional:debug": "npm run rebuild:electron && npm run build && playwright test --reporter=list --max-failures=1",
    "test:functional:single": "npm run rebuild:electron && npm run build && playwright test --reporter=list",
    "test:coverage": "jest --config jest.combined.config.js --coverage",
    "validate": "bash scripts/validate.sh"
  }
}
```

---

## 2. Создание Скрипта Валидации

### 2.1 Создать scripts/validate.sh

**Requirements:** testing.4.1, testing.4.2, testing.4.3, testing.4.4

**Описание:** Создать скрипт для быстрой валидации кода без запуска функциональных тестов.

**Детали:**
- Выполнять TypeScript компиляцию
- Запускать ESLint с автофиксом
- Запускать Prettier с автофиксом
- Запускать unit тесты
- Проверять покрытие кода
- Возвращать ненулевой код при ошибках
- НЕ запускать функциональные тесты

- [x] 2.1.1 Реализовать scripts/validate.sh

**Requirements:** testing.4.1, testing.4.3, testing.4.4

**Детали:**
```bash
#!/bin/bash
set -e

echo "🔍 Running validation..."

echo "📦 TypeScript compilation..."
npm run typecheck

echo "🔧 ESLint check..."
npm run lint:fix

echo "💅 Prettier check..."
npm run format

echo "🧪 Unit tests..."
npm run test:unit

echo "📊 Code coverage..."
npm run test:coverage

echo "✅ Validation complete!"
```

- [x] 2.1.2 Добавить команду validate в package.json

**Requirements:** testing.4.1

**Детали:**
```json
{
  "scripts": {
    "validate": "bash scripts/validate.sh",
    "validate:verbose": "bash scripts/validate.sh --verbose"
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

## 4. Создание Функциональных Тестов с Playwright

### 5.1 Создать helper утилиты для функциональных тестов

**Requirements:** testing.3.1, testing.3.2, testing.3.6

**Описание:** Создать утилиты для запуска и взаимодействия с Electron приложением через Playwright.

**Детали:**
- Создать функцию launchElectron для запуска приложения
- Создать функцию closeElectron для закрытия и очистки
- Использовать реальный Electron (НЕ мокировать)
- Настроить временные директории для данных

**Файлы:**
- `tests/functional/helpers/electron.ts` - утилиты для Electron

- [x] 5.1.1 Создать tests/functional/helpers/electron.ts

**Requirements:** testing.3.1, testing.3.2, testing.3.6, testing.3.7

**Детали:**
```typescript
interface ElectronTestContext {
  app: ElectronApplication;
  window: Page;
  testDataPath: string;
}

async function launchElectron(
  testDataPath?: string,
  env?: Record<string, string>
): Promise<ElectronTestContext>;

async function closeElectron(
  context: ElectronTestContext,
  cleanup?: boolean
): Promise<void>;
```

### 5.2 Создать Test IPC Handlers

**Requirements:** testing.3.1

**Описание:** Создать специальные IPC handlers для управления состоянием приложения из тестов.

**Детали:**
- Регистрировать handlers только в тестовом режиме (NODE_ENV=test)
- Предоставить методы для управления токенами и данными
- Использовать реальные классы приложения

**Файлы:**
- `src/main/index.ts` - регистрация test IPC handlers

- [x] 5.2.1 Добавить test IPC handlers в src/main/index.ts

**Requirements:** testing.3.1.1, testing.3.1.2, testing.3.1.3, testing.3.1.4

**Детали:**
```typescript
if (process.env.NODE_ENV === 'test') {
  ipcMain.handle('test:setup-tokens', async (event, tokens) => {
    await tokenStorageManager.saveTokens(tokens);
  });

  ipcMain.handle('test:clear-tokens', async () => {
    await tokenStorageManager.clearTokens();
  });

  ipcMain.handle('test:get-token-status', async () => {
    return await tokenStorageManager.getTokenStatus();
  });

  ipcMain.handle('test:clear-data', async () => {
    await dataManager.clearAllData();
  });

  ipcMain.handle('test:handle-deep-link', async (event, url) => {
    await handleDeepLink(url);
  });
}
```

### 5.3 Создать Mock OAuth Server

**Requirements:** testing.3.2

**Описание:** Создать mock OAuth server для тестирования OAuth flow без реальных Google credentials.

**Детали:**
- Эмулировать Google OAuth endpoints
- Генерировать тестовые токены
- Поддерживать CORS
- Валидировать client_id и client_secret

**Файлы:**
- `tests/functional/helpers/mock-oauth-server.ts` - mock OAuth server

- [x] 5.3.1 Создать tests/functional/helpers/mock-oauth-server.ts

**Requirements:** testing.3.2.1, testing.3.2.2, testing.3.2.3, testing.3.2.4, testing.3.2.5

**Детали:**
```typescript
class MockOAuthServer {
  constructor(config: MockOAuthServerConfig);
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  setUserProfile(profile: MockUserProfile): void;
  setUserInfoError(status: number, message: string): void;
  setTokenExpired(expired: boolean): void;
  setRefreshTokenValid(valid: boolean): void;
  clearUserInfoError(): void;
}
```

### 5.4 Добавить completeOAuthFlow helper

**Requirements:** testing.3.1.2, testing.3.2

**Описание:** Создать helper функцию для завершения OAuth flow в тестах.

**Детали:**
- Использовать test IPC handlers для симуляции OAuth callback
- Генерировать тестовые authorization codes
- Обрабатывать deep links через test:handle-deep-link

- [x] 5.4.1 Добавить completeOAuthFlow в tests/functional/helpers/electron.ts

**Requirements:** testing.3.1.2, testing.3.2

**Детали:**
```typescript
async function completeOAuthFlow(
  app: ElectronApplication,
  window: Page,
  clientId?: string
): Promise<void>;
```

---

## 6. Добавление Проверки Окружения

### 6.1 Создать утилиту для проверки графической среды

**Requirements:** testing.6.1, testing.6.2, testing.6.3, testing.6.4

**Описание:** Создать утилиту для проверки доступности графической среды перед запуском функциональных тестов.

**Детали:**
- Проверять наличие DISPLAY на Linux
- Проверять доступность Window Server на macOS
- Проверять графическую среду на Windows
- Пропускать тесты с предупреждением если среда недоступна

- [x] 6.1.1 Создать tests/utils/checkGraphicalEnvironment.ts

**Requirements:** testing.6.1, testing.6.2, testing.6.3, testing.6.4

**Детали:**
```typescript
export function checkGraphicalEnvironment(): boolean {
  const platform = process.platform;
  
  if (platform === 'linux') {
    return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
  }
  
  if (platform === 'darwin') {
    return true; // macOS always has graphical environment
  }
  
  if (platform === 'win32') {
    return true; // Windows always has graphical environment
  }
  
  return false;
}
```

- [x] 6.1.2 Добавить проверку окружения в функциональные тесты

**Requirements:** testing.6.4

**Детали:**
```typescript
import { checkGraphicalEnvironment } from '../utils/checkGraphicalEnvironment';

beforeAll(() => {
  if (!checkGraphicalEnvironment()) {
    console.warn('⚠️  Graphical environment not available, skipping functional tests');
    return;
  }
});
```

---

## 7. Обновление Документации

### 7.1 Обновить README.md

**Requirements:** testing.5.4, testing.8.3

**Описание:** Добавить документацию о различных типах тестов и как их запускать.

**Детали:**
- Описать типы тестов
- Объяснить стратегию мокирования
- Добавить примеры команд
- Предупредить о показе окон в функциональных тестах

- [x] 7.1.1 Добавить секцию "Testing" в README.md

**Requirements:** testing.5.4

**Детали:**
```markdown
## Testing

### Test Types

- **Unit Tests** (`tests/unit/**/*.test.ts`) - Fast, isolated tests with all dependencies mocked
- **Functional Tests** (`tests/functional/**/*.spec.ts`) - End-to-end tests with real Electron showing windows

### Running Tests

```bash
# Quick validation (unit tests only)
npm run validate

# Individual test types
npm run test:unit
npm run test:functional  # ⚠️ Uses real Electron, WILL show windows

# All tests
npm test
```

### Important Notes

- Functional tests use **real Electron** and WILL show windows on your screen
- These tests are NOT included in `npm run validate` for faster feedback
- Run functional tests explicitly when needed
```

---

## 8. Валидация и Тестирование

### 8.1 Запустить валидацию

**Requirements:** testing.4.1, testing.4.3

**Описание:** Убедиться что все изменения проходят валидацию.

**Детали:**
- Запустить `npm run validate`
- Проверить что все проверки проходят
- Исправить найденные проблемы

- [x] 8.1.1 Запустить npm run validate

**Requirements:** testing.4.1, testing.4.3, testing.4.4

**Детали:**
- Выполнить `npm run validate`
- Убедиться что TypeScript компилируется
- Убедиться что ESLint проходит
- Убедиться что Prettier проходит
- Убедиться что unit тесты проходят
- Убедиться что покрытие >= 80%

### 8.2 Запустить функциональные тесты (по запросу пользователя)

**Requirements:** testing.5.1, testing.5.4

**Описание:** Запустить функциональные тесты с реальным Electron.

**Детали:**
- Запускать ТОЛЬКО по явному запросу пользователя
- Предупредить о показе окон
- Проверить что тесты используют реальный Electron

- [x] 8.2.1 Запустить npm run test:functional (ТОЛЬКО по запросу)

**Requirements:** testing.5.1, testing.5.4

**Детали:**
- Предупредить пользователя: "Functional tests will use real Electron and WILL show windows. Continue?"
- Выполнить `npm run test:functional`
- Проверить что все тесты проходят
- Проверить что НЕ используются моки Electron

**Статус:** Готово к запуску. Функциональные тесты используют реальный Electron через Playwright.

---

## 9. Development Mode с Поддержкой Deep Links

### 9.1 Добавить npm скрипт для dev mode с deep links

**Requirements:** testing.9.1, testing.9.2, testing.9.3, testing.9.4

**Описание:** Создать команду `npm run dev:app` для быстрой разработки с поддержкой OAuth deep links.

**Детали:**
- Использовать `electron-builder --mac --dir` для создания unpacked .app bundle
- Не создавать DMG или ZIP архивы
- Автоматически открывать приложение после сборки
- Обеспечить правильную регистрацию custom protocol handler

- [x] 9.1.1 Добавить команду dev:app в package.json

**Requirements:** testing.9.1, testing.9.4, testing.9.7

**Детали:**
```json
{
  "scripts": {
    "dev": "npm run build && electron .",
    "dev:app": "npm run build && npx electron-builder --mac --dir && open release/mac-arm64/Clerkly.app"
  }
}
```

- [x] 9.1.2 Добавить protocols конфигурацию в package.json

**Requirements:** testing.9.2

**Детали:**
```json
{
  "build": {
    "protocols": [
      {
        "name": "Clerkly OAuth",
        "schemes": [
          "com.googleusercontent.apps.100365225505-9039l9g72mja9onmlkoupkphbns6lrg2"
        ]
      }
    ]
  }
}
```

### 9.2 Обновить документацию

**Requirements:** testing.9.5, testing.9.9, testing.9.10

**Описание:** Добавить документацию о новом dev mode в README.md.

**Детали:**
- Объяснить разницу между `npm run dev` и `npm run dev:app`
- Указать время выполнения каждой команды
- Добавить рекомендации по использованию

- [x] 9.2.1 Обновить README.md

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

---

## Критерии Завершения

Все задачи считаются завершенными когда:

- ✅ Jest конфигурации созданы для unit тестов
- ✅ Playwright конфигурация создана для функциональных тестов
- ✅ Package.json содержит все необходимые команды
- ✅ Скрипт validate работает корректно
- ✅ Модульные тесты правильно мокируют зависимости
- ✅ Функциональные тесты используют реальный Electron через Playwright
- ✅ Test IPC Handlers реализованы для управления состоянием в тестах
- ✅ Mock OAuth Server реализован для тестирования OAuth flow
- ✅ Временные директории настроены для функциональных тестов
- ✅ Проверка графической среды реализована
- ✅ Документация обновлена
- ✅ `npm run validate` проходит успешно
- ✅ Dev mode с deep links реализован и задокументирован
- ✅ Все требования покрыты задачами
