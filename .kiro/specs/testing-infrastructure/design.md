# Документ Дизайна: Инфраструктура Тестирования

## Обзор

Данный документ описывает дизайн инфраструктуры тестирования для приложения Clerkly, включая архитектуру тестов, стратегию мокирования, процесс валидации, требования к окружению для запуска различных типов тестов, а также специализированные инструменты для функционального тестирования (Test IPC Handlers, Mock OAuth Server) и режим разработки с поддержкой deep links.

## Архитектура Тестирования

### Пирамида Тестирования

```
        Functional Tests
       (Real Electron + Playwright)
       /                \
      /   Property-Based  \
     /    (Mocked)          \
    /________________________\
   Unit Tests (Fully Mocked)
```

**Requirements**: testing.1, testing.2, testing.3

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

#### 3. Функциональные Тесты (Functional Tests)

**Расположение**: `tests/functional/**/*.spec.ts`

**Requirements**: testing.3

**Характеристики**:
- **НЕ мокируют Electron API** (Requirements: testing.3.2)
- Используют реальный Electron через Playwright (Requirements: testing.3.1, testing.3.9)
- Используют реальные классы приложения (Requirements: testing.3.3)
- Используют реальную БД в временной директории (Requirements: testing.3.4)
- Используют реальную файловую систему (Requirements: testing.3.5)
- Показывают реальные окна на экране (Requirements: testing.3.6)
- Проверяют end-to-end пользовательские сценарии (Requirements: testing.3.10)

**Настройка Playwright**:
```typescript
// Requirements: testing.3.1, testing.3.2, testing.3.9
// playwright.config.ts

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/functional',
  timeout: 60 * 1000,
  fullyParallel: false, // Electron tests run sequentially
  workers: 1, // One test at a time
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

**Пример теста**:
```typescript
// Requirements: testing.3.1, testing.3.2, testing.3.6
// tests/functional/auth-flow.spec.ts

import { test, expect } from '@playwright/test';
import { launchElectron, closeElectron, completeOAuthFlow } from './helpers/electron';

test.describe('OAuth Authentication Flow', () => {
  test('should complete OAuth flow and show dashboard', async () => {
    // Preconditions: Launch real Electron app
    // Requirements: testing.3.1, testing.3.6
    const { app, window, testDataPath } = await launchElectron();

    try {
      // Action: Complete OAuth flow using test IPC handlers
      // Requirements: testing.3.1.2
      await completeOAuthFlow(app, window);

      // Assertions: Verify dashboard is shown
      await expect(window.locator('text=/dashboard/i')).toBeVisible();
      
      // Requirements: testing.3.10
    } finally {
      // Cleanup: Close app and remove test data
      // Requirements: testing.3.7
      await closeElectron({ app, window, testDataPath });
    }
  });
});
```

**Cleanup**:
```typescript
// Requirements: testing.3.7
afterEach(async () => {
  if (fs.existsSync(testDataPath)) {
    fs.rmSync(testDataPath, { recursive: true, force: true });
  }
});
```

## Компоненты и Интерфейсы

### Test IPC Handlers

**Requirements**: testing.3.1

**Расположение**: `tests/functional/helpers/test-ipc-handlers.ts`

**Назначение**: Предоставляет специальные IPC handlers для управления состоянием приложения из Playwright тестов без прямого использования better-sqlite3.

**Интерфейс**:
```typescript
// Requirements: testing.3.1.2
interface TestIPCHandlers {
  'test:setup-tokens': (tokens: TokenData) => Promise<void>;
  'test:clear-tokens': () => Promise<void>;
  'test:get-token-status': () => Promise<TokenStatus>;
  'test:clear-data': () => Promise<void>;
  'test:handle-deep-link': (url: string) => Promise<void>;
}
```

**Регистрация**:
```typescript
// Requirements: testing.3.1.1, testing.3.1.3
// src/main/index.ts

if (process.env.NODE_ENV === 'test') {
  // Register test IPC handlers only in test mode
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
    await userSettingsManager.clearAllData();
  });

  ipcMain.handle('test:handle-deep-link', async (event, url) => {
    // Simulate deep link handling
    await handleDeepLink(url);
  });
}
```

**Использование в тестах**:
```typescript
// Requirements: testing.3.1.4
// tests/functional/token-management.spec.ts

test('should refresh expired tokens', async () => {
  const { app, window } = await launchElectron();

  // Setup test tokens using IPC handler
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'expired_token',
      refreshToken: 'valid_refresh_token',
      expiresAt: Date.now() - 1000, // Expired
    });
  });

  // Trigger token refresh
  // ...
});
```

**Безопасность**:
```typescript
// Requirements: testing.3.1.3
// Test IPC handlers are ONLY available in test mode
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test IPC handlers can only be used in test environment');
}
```

### Mock OAuth Server

**Requirements**: testing.3.2

**Расположение**: `tests/functional/helpers/mock-oauth-server.ts`

**Назначение**: Эмулирует Google OAuth endpoints для тестирования полного OAuth flow без реальных Google credentials.

**Endpoints**:
```typescript
// Requirements: testing.3.2.1
interface MockOAuthEndpoints {
  '/auth': 'GET',           // Authorization endpoint
  '/token': 'POST',         // Token exchange endpoint
  '/refresh': 'POST',       // Token refresh endpoint
  '/oauth2/v2/userinfo': 'GET', // User info endpoint
}
```

**Конфигурация**:
```typescript
// Requirements: testing.3.2.3, testing.3.2.4
interface MockOAuthServerConfig {
  port: number;
  clientId: string;
  clientSecret: string;
}

const mockServer = new MockOAuthServer({
  port: 8888,
  clientId: 'test-client-id-12345',
  clientSecret: 'test-client-secret',
});
```

**Lifecycle**:
```typescript
// Requirements: testing.3.2.7
// tests/functional/oauth-flow.spec.ts

let mockServer: MockOAuthServer;

beforeAll(async () => {
  mockServer = new MockOAuthServer({
    port: 8888,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret',
  });
  await mockServer.start();
});

afterAll(async () => {
  await mockServer.stop();
});
```

**Token Generation**:
```typescript
// Requirements: testing.3.2.2, testing.3.2.4
class MockOAuthServer {
  private authCodes: Map<string, AuthCodeData> = new Map();

  handleTokenRequest(code: string): TokenResponse {
    // Validate authorization code
    const authData = this.authCodes.get(code);
    if (!authData) {
      throw new Error('invalid_grant');
    }

    // Generate test tokens
    return {
      access_token: `test_access_token_${Date.now()}`,
      refresh_token: `test_refresh_token_${Date.now()}`,
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/calendar',
    };
  }
}
```

**CORS Support**:
```typescript
// Requirements: testing.3.2.5
private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route requests...
}
```

**Custom User Profile**:
```typescript
// Requirements: testing.3.2
// Allow tests to customize user profile data
mockServer.setUserProfile({
  id: '123456789',
  email: 'test@example.com',
  name: 'Test User',
  given_name: 'Test',
  family_name: 'User',
  picture: 'https://example.com/avatar.jpg',
});
```

**Error Simulation**:
```typescript
// Requirements: testing.3.2
// Allow tests to simulate OAuth errors
mockServer.setUserInfoError(500, 'Internal Server Error');
mockServer.setTokenExpired(true);
mockServer.setRefreshTokenValid(false);
```

### Electron Test Helper

**Расположение**: `tests/functional/helpers/electron.ts`

**Назначение**: Утилиты для запуска и взаимодействия с Electron приложением в тестах.

**Интерфейс**:
```typescript
// Requirements: testing.3.1, testing.3.6
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

async function completeOAuthFlow(
  app: ElectronApplication,
  window: Page,
  clientId?: string
): Promise<void>;

async function clearTestTokens(window: Page): Promise<void>;
```

**Реализация**:
```typescript
// Requirements: testing.3.1, testing.3.2, testing.3.6
export async function launchElectron(
  testDataPath?: string,
  env?: Record<string, string>
): Promise<ElectronTestContext> {
  // Create temporary test data directory
  if (!testDataPath) {
    testDataPath = path.join(
      os.tmpdir(),
      `clerkly-functional-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
  }

  fs.mkdirSync(testDataPath, { recursive: true });

  // Launch Electron with Playwright
  const electronPath = require('electron') as unknown as string;
  const appPath = path.join(__dirname, '../../../dist/main/index.js');

  const app = await electron.launch({
    executablePath: electronPath,
    args: [appPath, '--user-data-dir', testDataPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...env,
    },
  });

  // Wait for first window
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { app, window, testDataPath };
}
```

**OAuth Flow Helper**:
```typescript
// Requirements: testing.3.1.2, testing.3.2
export async function completeOAuthFlow(
  electronApp: ElectronApplication,
  window: Page,
  clientId: string = 'test-client-id-12345'
): Promise<void> {
  // Verify test environment
  const isTest = process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
  if (!isTest) {
    throw new Error('completeOAuthFlow() can only be used in test environment');
  }

  // Start OAuth flow to generate PKCE parameters
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('auth:start-login');
  });

  await window.waitForTimeout(2000);

  // Get PKCE state from OAuthClientManager
  const pkceState = await electronApp.evaluate(async () => {
    const { oauthClient } = (global as any).testContext || {};
    if (!oauthClient || !oauthClient.pkceStorage) {
      throw new Error('PKCE storage not found');
    }
    return oauthClient.pkceStorage.state;
  });

  // Generate authorization code
  const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Construct deep link URL
  const redirectUri = `com.googleusercontent.apps.${clientId}:/oauth2redirect`;
  const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

  // Trigger deep link handling via test IPC handler
  await window.evaluate(async (url) => {
    return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
  }, deepLinkUrl);

  // Wait for profile to be fetched and saved
  await window.waitForTimeout(5000);
}
```

## Модели Данных

### TokenData

```typescript
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}
```

### TokenStatus

```typescript
interface TokenStatus {
  hasTokens: boolean;
  isExpired: boolean;
  expiresAt: number | null;
}
```

### MockUserProfile

```typescript
interface MockUserProfile {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}
```

### MockTokenResponse

```typescript
interface MockTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}
```

## Процесс Валидации

### Команда `npm run validate`

**Requirements**: testing.4.1, testing.4.2, testing.4.3, testing.4.4

Выполняет следующие проверки в указанном порядке:

1. **TypeScript компиляция** - `npm run typecheck`
2. **ESLint** - `npm run lint:fix` (с автофиксом)
3. **Prettier** - `npm run format` (с автофиксом)
4. **Модульные тесты** - `npm run test:unit`
5. **Property-based тесты** - `npm run test:property`
6. **Покрытие кода** - `npm run test:coverage`

**Скрипт валидации** (`scripts/validate.sh`):
```bash
#!/bin/bash
# Requirements: testing.4.1, testing.4.3, testing.4.4

set -e  # Exit on first error

echo "🔍 Running validation..."

# TypeScript compilation
echo "📝 TypeScript compilation..."
npm run typecheck

# ESLint with autofix
echo "🔧 ESLint (with autofix)..."
npm run lint:fix

# Prettier with autofix
echo "💅 Prettier (with autofix)..."
npm run format

# Unit tests
echo "🧪 Unit tests..."
npm run test:unit

# Property-based tests
echo "🎲 Property-based tests..."
npm run test:property

# Coverage check
echo "📊 Coverage check..."
npm run test:coverage

echo "✅ Validation complete!"
```

**Время выполнения**: < 30 секунд (Requirements: testing.4.3)

**НЕ включает**:
- ❌ Функциональные тесты (Requirements: testing.4.2)

### Отдельные Команды для Функциональных Тестов

**Requirements**: testing.5.1, testing.5.2, testing.5.3, testing.5.4

```bash
# Функциональные тесты (с реальным Electron, показывают окна)
npm run test:functional

# Функциональные тесты с подробным выводом
npm run test:functional:verbose

# Функциональные тесты с остановкой на первой ошибке (для отладки)
npm run test:functional:debug

# Запуск конкретного функционального теста
npm run test:functional:single -- navigation.spec.ts

# Все тесты (включая функциональные)
npm test
```

**Предупреждение пользователю**: 

**Requirements**: testing.5.4

Перед запуском функциональных тестов пользователь должен быть предупрежден о том, что будут показаны окна на экране. Это реализовано через:

1. **Сообщение в консоли** при запуске команды
2. **Документацию в README.md**
3. **Комментарии в package.json**

```json
{
  "scripts": {
    "test:functional": "echo '⚠️  Functional tests will show windows on screen' && npm run rebuild:electron && npm run build && playwright test"
  }
}
```

## Стратегия Тестирования

### Таблица Мокирования

**Requirements**: testing.1.2, testing.2.1, testing.3.2

| Компонент | Unit | Property | Functional |
|-----------|------|----------|------------|
| **Electron API** | ✅ Мок | ✅ Мок | ❌ Реальный |
| **Внутренние классы** | ✅ Мок | ✅ Мок | ❌ Реальные |
| **База данных** | ✅ Мок | ✅ Мок | ❌ Реальная |
| **Файловая система** | ✅ Мок | ✅ Мок | ❌ Реальная |
| **Сетевые запросы (OAuth)** | ✅ Мок | ✅ Мок | ✅ Мок (Mock OAuth Server) |

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| testing.1.1 | ✓ | - | - |
| testing.1.2 | ✓ | - | - |
| testing.1.3 | ✓ | - | - |
| testing.1.4 | ✓ | - | - |
| testing.2.1 | - | ✓ | - |
| testing.2.2 | - | ✓ | - |
| testing.2.3 | - | ✓ | - |
| testing.2.4 | - | ✓ | - |
| testing.3.1 | - | - | ✓ |
| testing.3.2 | - | - | ✓ |
| testing.3.3 | - | - | ✓ |
| testing.3.4 | - | - | ✓ |
| testing.3.5 | - | - | ✓ |
| testing.3.6 | - | - | ✓ |
| testing.3.7 | - | - | ✓ |
| testing.3.8 | - | - | ✓ |
| testing.3.9 | - | - | ✓ |
| testing.3.10 | - | - | ✓ |
| testing.3.11 | - | - | ✓ |
| testing.3.1.1 | - | - | ✓ |
| testing.3.1.2 | - | - | ✓ |
| testing.3.1.3 | - | - | ✓ |
| testing.3.1.4 | - | - | ✓ |
| testing.3.1.5 | - | - | ✓ |
| testing.3.1.6 | - | - | ✓ |
| testing.3.2.1 | - | - | ✓ |
| testing.3.2.2 | - | - | ✓ |
| testing.3.2.3 | - | - | ✓ |
| testing.3.2.4 | - | - | ✓ |
| testing.3.2.5 | - | - | ✓ |
| testing.3.2.6 | - | - | ✓ |
| testing.3.2.7 | - | - | ✓ |
| testing.4.1 | ✓ | ✓ | - |
| testing.4.2 | - | - | - |
| testing.4.3 | ✓ | ✓ | - |
| testing.4.4 | ✓ | ✓ | - |
| testing.5.1 | - | - | ✓ |
| testing.5.2 | - | - | ✓ |
| testing.5.3 | - | - | ✓ |
| testing.5.4 | - | - | ✓ |
| testing.6.1 | - | - | ✓ |
| testing.6.2 | - | - | ✓ |
| testing.6.3 | - | - | ✓ |
| testing.6.4 | - | - | ✓ |
| testing.6.5 | - | - | ✓ |
| testing.7.1 | ✓ | ✓ | ✓ |
| testing.7.2 | ✓ | ✓ | ✓ |
| testing.7.3 | ✓ | ✓ | ✓ |
| testing.7.4 | ✓ | ✓ | ✓ |
| testing.7.5 | - | - | - |
| testing.7.6 | - | - | - |
| testing.7.7 | - | - | - |
| testing.7.8 | - | - | - |
| testing.7.9 | - | - | - |
| testing.7.10 | ✓ | ✓ | ✓ |
| testing.8.1 | - | - | ✓ |
| testing.8.2 | - | - | ✓ |
| testing.8.3 | - | - | ✓ |
| testing.8.4 | - | - | ✓ |
| testing.8.5 | - | - | ✓ |
| testing.8.6 | - | - | ✓ |
| testing.9.1 | - | - | - |
| testing.9.2 | - | - | - |
| testing.9.3 | - | - | - |
| testing.9.4 | - | - | - |
| testing.9.5 | - | - | - |
| testing.9.6 | - | - | - |
| testing.9.7 | - | - | - |
| testing.9.8 | - | - | - |
| testing.9.9 | - | - | - |
| testing.9.10 | - | - | - |

## Требования к Окружению

### Для Модульных и Property-Based Тестов

**Requirements**: testing.1, testing.2

- Node.js 18+
- npm 9+
- Не требуется графическая среда
- Не требуется Electron

### Для Функциональных Тестов

**Requirements**: testing.6.1, testing.6.2, testing.6.3, testing.6.4

- Node.js 18+
- npm 9+
- **Графическая среда** (X11/Wayland на Linux, Window Server на macOS, графическая среда на Windows)
- **Electron** установлен как зависимость
- **Playwright** для Electron
- **xvfb** на Linux для headless режима (опционально)

**Поведение при отсутствии графической среды**: 

**Requirements**: testing.6.4

Если графическая среда недоступна, тесты должны пропускаться с предупреждением вместо падения с ошибкой.

### Использование Временных Директорий

**Requirements**: testing.6.5

Функциональные тесты должны использовать временные директории для хранения данных:

```typescript
// Requirements: testing.3.4, testing.3.5, testing.3.7
import * as os from 'os';
import * as path from 'path';

beforeEach(() => {
  testDataPath = path.join(
    os.tmpdir(),
    `clerkly-functional-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );
  fs.mkdirSync(testDataPath, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDataPath)) {
    fs.rmSync(testDataPath, { recursive: true, force: true });
  }
});
```

### Запуск в CI/CD

**Requirements**: testing.4.2

```yaml
# GitHub Actions example
- name: Run validation (without functional tests)
  run: npm run validate

# Функциональные тесты НЕ запускаются в CI автоматически
```

## Разделение Production Code и Reference Code

**Requirements**: testing.7

### Production Code

**Расположение**: `src/**/*`

**Характеристики**:
- Покрывается тестами (Requirements: testing.7.2)
- Анализируется линтерами (Requirements: testing.7.3)
- Поддерживается и обновляется (Requirements: testing.7.4)
- Включается в расчет покрытия кода (Requirements: testing.7.1)

**Конфигурация Jest**:
```javascript
// Requirements: testing.7.1, testing.7.2
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Reference Code

**Расположение**: `figma/**/*`

**Характеристики**:
- НЕ требует покрытия тестами (Requirements: testing.7.6)
- НЕ анализируется линтерами (Requirements: testing.7.7)
- НЕ требует изменений или поддержки (Requirements: testing.7.8)
- Используется только как референс (Requirements: testing.7.9)
- Исключен из расчета покрытия (Requirements: testing.7.10)

**Конфигурация ESLint**:
```javascript
// Requirements: testing.7.7
module.exports = {
  ignorePatterns: ['figma/**/*'],
};
```

**Конфигурация Jest**:
```javascript
// Requirements: testing.7.10
module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '/figma/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/figma/'],
};
```

## Development Mode с Поддержкой Deep Links

**Requirements**: testing.9

### Проблема

В обычном dev mode (`npm run dev`) приложение запускается через `electron .`, что не создает `.app` bundle. Это приводит к проблемам:

1. **Deep links не работают**: macOS не может зарегистрировать custom protocol handler без `.app` bundle с Info.plist
2. **OAuth callback не работает**: Google OAuth redirect на `clerkly://oauth/callback` не обрабатывается
3. **Невозможно тестировать OAuth flow**: Приходится использовать полный production build (`npm run start`), который занимает 60-90 секунд

### Решение: Unpacked .app Bundle

**Requirements**: testing.9.1, testing.9.2, testing.9.3, testing.9.4

Используем `electron-builder --dir` для создания unpacked `.app` bundle без DMG/ZIP архивов:

```json
{
  "scripts": {
    "dev": "npm run build && electron .",
    "dev:app": "npm run build && electron-builder --mac --dir && open release/mac-arm64/Clerkly.app"
  }
}
```

### Преимущества

**Requirements**: testing.9.5, testing.9.6, testing.9.7, testing.9.8

1. **Быстрее production build**: ~20-30 секунд vs 60-90 секунд
2. **Deep links работают**: `.app` bundle корректно регистрирует protocol handler
3. **OAuth flow работает**: Можно тестировать полный OAuth flow с Google
4. **Автоматический запуск**: Приложение открывается автоматически после сборки

### Использование

**Requirements**: testing.9.9, testing.9.10

```bash
# Быстрая разработка БЕЗ deep links (10-15 секунд)
npm run dev

# Разработка С deep links для тестирования OAuth (20-30 секунд)
npm run dev:app
```

### Workflow

1. **Обычная разработка**: Используйте `npm run dev` для быстрого цикла разработки
2. **Тестирование OAuth**: Используйте `npm run dev:app` когда нужно протестировать OAuth flow
3. **Production build**: Используйте `npm run start` перед релизом для создания DMG

### Технические Детали

**Requirements**: testing.9.2

Флаг `--dir` создает unpacked `.app` bundle в `release/mac-arm64/Clerkly.app` с:
- Правильным Info.plist с CFBundleURLTypes для custom protocol
- Правильной структурой .app bundle
- Всеми необходимыми ресурсами и зависимостями
- Корректной регистрацией protocol handler в macOS

## Критерии Успеха

1. ✅ Модульные тесты выполняются < 10 секунд (Requirements: testing.1.3)
2. ✅ Property-based тесты выполняются < 20 секунд (Requirements: testing.2.3)
3. ✅ Валидация выполняется < 30 секунд (Requirements: testing.4.3)
4. ✅ Функциональные тесты используют реальный Electron через Playwright (Requirements: testing.3.1, testing.3.2, testing.3.9)
5. ✅ Test IPC Handlers доступны только в тестовом режиме (Requirements: testing.3.1.1, testing.3.1.3)
6. ✅ Mock OAuth Server эмулирует Google OAuth endpoints (Requirements: testing.3.2.1)
7. ✅ Покрытие кода > 80% (Requirements: testing.4.1)
8. ✅ Все тесты проходят без ошибок
9. ✅ Reference Code исключен из тестирования и анализа (Requirements: testing.7.6, testing.7.7, testing.7.10)
10. ✅ Development mode с deep links работает за < 30 секунд (Requirements: testing.9.5)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Test Isolation

*For any* sequence of unit tests, each test should execute independently without affecting the state of other tests.

**Validates: Requirements testing.1.4**

### Property 2: Mock Consistency

*For any* unit or property-based test, all external dependencies (Electron API, fs, database, network) should be mocked.

**Validates: Requirements testing.1.2, testing.2.1**

### Property 3: Property Test Iterations

*For any* property-based test, the test should execute at least 100 iterations with randomly generated inputs.

**Validates: Requirements testing.2.3**

### Property 4: Functional Test Real Electron

*For any* functional test, the test should use real Electron through Playwright without mocking Electron API.

**Validates: Requirements testing.3.1, testing.3.2**

### Property 5: Test IPC Handler Security

*For any* attempt to use test IPC handlers, the handlers should only be available when NODE_ENV=test.

**Validates: Requirements testing.3.1.1, testing.3.1.3**

### Property 6: Mock OAuth Token Generation

*For any* valid authorization code starting with 'test_auth_code_', the Mock OAuth Server should generate valid test tokens.

**Validates: Requirements testing.3.2.2, testing.3.2.4**

### Property 7: Temporary Directory Cleanup

*For any* functional test, temporary test data directories should be cleaned up after test completion.

**Validates: Requirements testing.3.7**

### Property 8: Validation Speed

*For any* validation run, the total execution time should be less than 30 seconds.

**Validates: Requirements testing.4.3**

### Property 9: Reference Code Exclusion

*For any* test coverage calculation, files in the `figma/` directory should be excluded from coverage metrics.

**Validates: Requirements testing.7.10**

### Property 10: Deep Link Registration

*For any* unpacked .app bundle created with `npm run dev:app`, the bundle should correctly register custom protocol handlers for OAuth deep links.

**Validates: Requirements testing.9.2, testing.9.8**

## Error Handling

### Test Failures

**Unit/Property Tests**:
- Fail fast on first error
- Provide clear error messages with stack traces
- Log which requirement the test validates

**Functional Tests**:
- Capture screenshots on failure (Requirements: testing.3.9)
- Capture video on failure (Requirements: testing.3.9)
- Save Playwright trace for debugging
- Clean up test data even on failure (Requirements: testing.3.7)

### Missing Graphical Environment

**Requirements**: testing.6.4

```typescript
// tests/utils/checkGraphicalEnvironment.ts

export function checkGraphicalEnvironment(): boolean {
  if (process.platform === 'darwin') {
    // macOS always has graphical environment
    return true;
  }

  if (process.platform === 'linux') {
    // Check for DISPLAY or WAYLAND_DISPLAY
    return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }

  if (process.platform === 'win32') {
    // Windows always has graphical environment
    return true;
  }

  return false;
}

// In functional tests
beforeAll(() => {
  if (!checkGraphicalEnvironment()) {
    console.warn('⚠️  Graphical environment not available, skipping functional tests');
    return;
  }
});
```

### Mock OAuth Server Errors

**Requirements**: testing.3.2

The Mock OAuth Server supports error simulation for testing error handling:

```typescript
// Simulate UserInfo API error
mockServer.setUserInfoError(500, 'Internal Server Error');

// Simulate expired token
mockServer.setTokenExpired(true);

// Simulate invalid refresh token
mockServer.setRefreshTokenValid(false);

// Clear errors
mockServer.clearUserInfoError();
```

## Testing Strategy

### Test Pyramid

```
     Functional (E2E)
    /                \
   /  Property-Based  \
  /                    \
 /________________________\
        Unit Tests
```

**Distribution**:
- Unit Tests: 70% (fast, isolated, comprehensive coverage)
- Property-Based Tests: 20% (invariant validation, edge cases)
- Functional Tests: 10% (user scenarios, end-to-end validation)

### Coverage Goals

**Requirements**: testing.4.1

- Overall coverage: > 80%
- Critical components: > 85%
- Production code only (excludes `figma/`)

### Test Naming Convention

**Unit Tests**: `*.test.ts` or `*.test.tsx`
**Property Tests**: `*.property.test.ts` or `*.property.test.tsx`
**Functional Tests**: `*.spec.ts`

### Test Structure

All tests should follow this structure:

```typescript
/* Preconditions: [describe initial state]
   Action: [describe action being tested]
   Assertions: [describe expected results]
   Requirements: [list requirement IDs] */
test('should [expected behavior]', () => {
  // Test implementation
});
```
