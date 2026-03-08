# Документ Дизайна: Инфраструктура Тестирования

## Обзор

Данный документ описывает дизайн инфраструктуры тестирования для приложения Clerkly, включая архитектуру тестов, стратегию мокирования, процесс валидации, требования к окружению для запуска различных типов тестов, а также специализированные инструменты для функционального тестирования (Test IPC Handlers, Mock OAuth Server) и режим разработки с поддержкой deep links.

## Архитектура Тестирования

### Пирамида Тестирования

```
Functional Tests (Real Electron + Playwright)
---------------------------------------------
Unit Tests (Fully Mocked)
```

**Requirements**: testing.1, testing.3

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

#### 2. Функциональные Тесты (Functional Tests)

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
- Используют LLM и UI (Requirements: testing.3.12)
- **КРИТИЧЕСКИ ВАЖНО**: Каждый тест ДОЛЖЕН использовать уникальную временную директорию для полной изоляции данных (Requirements: testing.3.11)

**Исключения**:
IF функциональный тест НЕ использует LLM или UI, он допускается ТОЛЬКО при наличии явного согласия пользователя и MUST содержать комментарий с причиной исключения (Requirements: testing.3.13)

**Изоляция данных между тестами**:
```typescript
// Requirements: testing.3.11
// ПРАВИЛЬНО: Каждый тест использует уникальную временную директорию
test.beforeEach(async () => {
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  electronApp = await electron.launch({
    args: [
      path.join(__dirname, '../../dist/main/main/index.js'),
      '--user-data-dir',
      testDataPath,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
});

// НЕПРАВИЛЬНО: Использование общей директории
test.beforeEach(async () => {
  electronApp = await electron.launch({
    args: ['.'], // ❌ Все тесты используют одну БД!
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
});
```

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
5. **Покрытие кода** - `npm run test:coverage`

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

**Requirements**: testing.1.2, testing.3.2

| Компонент | Unit | Functional |
|-----------|------|------------|
| **Electron API** | ✅ Мок | ❌ Реальный |
| **Внутренние классы** | ✅ Мок | ❌ Реальные |
| **База данных** | ✅ Мок | ❌ Реальная |
| **Файловая система** | ✅ Мок | ❌ Реальная |
| **Сетевые запросы (OAuth)** | ✅ Мок | ✅ Мок (Mock OAuth Server) |

### Покрытие Требований
Покрытие требований фиксируется в таблицах покрытия соответствующих спецификаций. Для инфраструктуры тестирования применяются следующие правила:
- `testing.1.*` покрывается модульными тестами
- `testing.3.*`, `testing.5.*`, `testing.6.*`, `testing.8.*` покрывается функциональными тестами
- `testing.4.*` проверяется скриптом валидации

## Требования к Окружению

### Для Модульных Тестов

**Requirements**: testing.1

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

**Requirements**: testing.4.2, testing.5.5

```yaml
# GitHub Actions example
- name: Run validation (without functional tests)
  run: npm run validate

- name: Run functional tests on macOS for pull requests
  run: npm run test:functional
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
2. ✅ Валидация выполняется < 30 секунд (Requirements: testing.4.3)
3. ✅ Функциональные тесты используют реальный Electron через Playwright (Requirements: testing.3.1, testing.3.2, testing.3.9)
4. ✅ Test IPC Handlers доступны только в тестовом режиме (Requirements: testing.3.1.1, testing.3.1.3)
5. ✅ Mock OAuth Server эмулирует Google OAuth endpoints (Requirements: testing.3.2.1)
6. ✅ Покрытие кода > 80% (Requirements: testing.4.1)
7. ✅ Все тесты проходят без ошибок
8. ✅ Reference Code исключен из тестирования и анализа (Requirements: testing.7.6, testing.7.7, testing.7.10)
9. ✅ Development mode с deep links работает за < 30 секунд (Requirements: testing.9.5)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Test Isolation

*For any* sequence of unit tests, each test should execute independently without affecting the state of other tests.

**Validates: Requirements testing.1.4**

### Property 2: Mock Consistency

*For any* unit test, all external dependencies (Electron API, fs, database, network) should be mocked.

**Validates: Requirements testing.1.2**

### Property 3: Functional Test Real Electron

*For any* functional test, the test should use real Electron through Playwright without mocking Electron API.

**Validates: Requirements testing.3.1, testing.3.2**

### Property 4: Test IPC Handler Security

*For any* attempt to use test IPC handlers, the handlers should only be available when NODE_ENV=test.

**Validates: Requirements testing.3.1.1, testing.3.1.3**

### Property 5: Mock OAuth Token Generation

*For any* valid authorization code starting with 'test_auth_code_', the Mock OAuth Server should generate valid test tokens.

**Validates: Requirements testing.3.2.2, testing.3.2.4**

### Property 6: Temporary Directory Cleanup

*For any* functional test, temporary test data directories should be cleaned up after test completion.

**Validates: Requirements testing.3.7**

### Property 7: Validation Speed

*For any* validation run, the total execution time should be less than 30 seconds.

**Validates: Requirements testing.4.3**

### Property 8: Reference Code Exclusion

*For any* test coverage calculation, files in the `figma/` directory should be excluded from coverage metrics.

**Validates: Requirements testing.7.10**

### Property 9: Deep Link Registration

*For any* unpacked .app bundle created with `npm run dev:app`, the bundle should correctly register custom protocol handlers for OAuth deep links.

**Validates: Requirements testing.9.2, testing.9.8**

## Error Handling

### Test Failures

**Unit Tests**:
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
----------------
Unit Tests
```

**Distribution**:
- Unit Tests: 80% (fast, isolated, comprehensive coverage)
- Functional Tests: 20% (user scenarios, end-to-end validation)

### Coverage Goals

**Requirements**: testing.4.1

- Overall coverage: > 80%
- Critical components: > 85%
- Production code only (excludes `figma/`)

### Test Naming Convention

**Unit Tests**: `*.test.ts` or `*.test.tsx`
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


## Helper Функции для Функциональных Тестов

**Requirements**: testing.10

### createMockOAuthServer

Стандартизированная функция для создания Mock OAuth Server в функциональных тестах.

**Расположение**: `tests/functional/helpers/electron.ts`

**Сигнатура**:
```typescript
export async function createMockOAuthServer(port: number = 8898): Promise<MockOAuthServer>
```

**Реализация**:
```typescript
import { MockOAuthServer } from './mock-oauth-server';

export async function createMockOAuthServer(port: number = 8898): Promise<MockOAuthServer> {
  const mockServer = new MockOAuthServer({
    port,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret-67890',
  });
  
  await mockServer.start();
  return mockServer;
}
```

**Использование**:
```typescript
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  // Requirements: testing.10.1, testing.10.2
  mockServer = await createMockOAuthServer(8892);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});
```

**Преимущества**:
- Устраняет дублирование кода (создание MockOAuthServer повторяется в каждом тесте)
- Стандартизирует credentials для всех тестов
- Упрощает обновление конфигурации (изменения в одном месте)
- Автоматически запускает сервер

**Запрещено**:
```typescript
// ❌ НЕ создавать MockOAuthServer напрямую
mockServer = new MockOAuthServer({
  port: 8892,
  clientId: 'test-client-id-12345',
  clientSecret: 'test-client-secret-67890',
});
await mockServer.start();
```

## Правила Ожидания Элементов в Функциональных Тестах

**Requirements**: testing.11

### Проблема с waitForTimeout

Использование `waitForTimeout` создает следующие проблемы:
- **Нестабильность**: Тесты могут падать на медленных машинах
- **Медленность**: Тесты ждут фиксированное время, даже если элемент появился раньше
- **Race Conditions**: Элемент может появиться после таймаута

### Правильные Методы Ожидания

**Requirements**: testing.11.3

#### 1. Ожидание Видимости Элемента

```typescript
// ❌ НЕПРАВИЛЬНО
await button.click();
await window.waitForTimeout(500);
const element = window.locator('[data-testid="result"]');
expect(await element.isVisible()).toBe(true);

// ✅ ПРАВИЛЬНО
await button.click();
const element = window.locator('[data-testid="result"]');
await expect(element).toBeVisible({ timeout: 2000 });
```

#### 2. Ожидание Текста в Элементе

```typescript
// ❌ НЕПРАВИЛЬНО
await messageInput.press('Enter');
await window.waitForTimeout(500);
const messageText = await messages.first().textContent();
expect(messageText).toContain('Test message');

// ✅ ПРАВИЛЬНО
await messageInput.press('Enter');
const messages = window.locator('[data-testid="message"]');
await expect(messages.first()).toContainText('Test message');
```

#### 3. Ожидание Количества Элементов

```typescript
// ❌ НЕПРАВИЛЬНО
await createButton.click();
await window.waitForTimeout(1000);
const agents = window.locator('[data-testid="agent-icon"]');
expect(await agents.count()).toBe(2);

// ✅ ПРАВИЛЬНО
await createButton.click();
const agents = window.locator('[data-testid="agent-icon"]');
await expect(agents).toHaveCount(2, { timeout: 2000 });
```

#### 4. Ожидание Изменения Состояния

```typescript
// ❌ НЕПРАВИЛЬНО
await input.fill('value');
await window.waitForTimeout(300); // debounce
const savedValue = await getSavedValue();
expect(savedValue).toBe('value');

// ✅ ПРАВИЛЬНО
await input.fill('value');
// Ждем индикатора сохранения
await expect(window.locator('[data-testid="save-indicator"]')).toBeVisible();
await expect(window.locator('[data-testid="save-indicator"]')).toBeHidden();
```

### Исключения

**Requirements**: testing.11.6

В редких случаях `waitForTimeout` допустим:

```typescript
// ✅ ДОПУСТИМО - ожидание анимации без DOM-индикатора
await element.click();
// Анимация длится 200ms и не имеет DOM-индикатора завершения
await window.waitForTimeout(250);
await expect(element).toHaveCSS('opacity', '1');
```

```typescript
// ✅ ДОПУСТИМО - ожидание debounce с известным таймингом
await input.fill('search query');
// Input имеет debounce 300ms
await window.waitForTimeout(350);
await expect(results).toBeVisible();
```

**ВАЖНО**: В таких случаях ОБЯЗАТЕЛЬНО добавить комментарий с объяснением.

### Таймауты в Локаторах

Все методы ожидания поддерживают опцию `timeout`:

```typescript
// Дефолтный таймаут (обычно 5000ms)
await expect(element).toBeVisible();

// Кастомный таймаут
await expect(element).toBeVisible({ timeout: 10000 });

// Короткий таймаут для быстрых операций
await expect(element).toBeVisible({ timeout: 1000 });
```

### Чеклист для Code Review

При ревью функциональных тестов проверять:

- [ ] Нет безусловных `waitForTimeout` без комментариев
- [ ] Используются `await expect(locator).toBeVisible()` вместо `isVisible()`
- [ ] Используются `await expect(locator).toContainText()` вместо `textContent()` + `expect()`
- [ ] Используются `await expect(locator).toHaveCount()` вместо `count()` + `expect()`
- [ ] Если есть `waitForTimeout`, есть комментарий с объяснением


## Обнаружение Toast-ошибок в Функциональных Тестах

**Requirements**: testing.12

### Проблема

Функциональные тесты могут проходить успешно, даже если приложение показывает пользователю toast-уведомление об ошибке. Например, после OAuth flow приложение может отобразить ошибку инициализации, но тест не заметит этого и продолжит выполнение.

### Решение

Helper функция `expectNoToastError(window)` в `tests/functional/helpers/electron.ts`.

Sonner рендерит тосты в контейнере `[data-sonner-toaster]`. Каждый тост — элемент `[data-sonner-toast]`. Тосты с ошибкой имеют атрибут `data-type="error"`.

```typescript
// tests/functional/helpers/electron.ts
// Requirements: testing.12.1, testing.12.2, testing.12.3

export async function expectNoToastError(window: Page): Promise<void> {
  const errorToast = window.locator('[data-sonner-toast][data-type="error"]');
  const count = await errorToast.count();
  if (count > 0) {
    const text = await errorToast.first().textContent();
    throw new Error(`Toast error detected: ${text?.trim()}`);
  }
}
```

### Когда вызывать

- После `completeOAuthFlow` + ожидания `[data-testid="agents"]`
- После любого действия, которое может вызвать фоновую ошибку

### Покрытие требований

| Требование | Описание | Реализация |
|------------|----------|------------|
| testing.12.1 | Проверка после ключевых действий | Вызов в `launchWithMockLLM` и аналогичных helpers |
| testing.12.2 | Фейл с текстом ошибки | `throw new Error(\`Toast error detected: ${text}\`)` |
| testing.12.3 | Переиспользуемый helper | `expectNoToastError` в `helpers/electron.ts` |

## AI SDK Chat-Flow Контракты

**Requirements**: testing.13

### Unit: Stream Protocol

- `tests/unit/renderer/IPCChatTransport.test.ts` проверяет порядок `UIMessageChunk`:
  - `start -> start-step -> reasoning/text deltas -> finish-step -> finish`
- Отдельные кейсы проверяют отсутствие дублирования между delta-событиями и `message.updated`.

### Unit: Tool Loop и Status

- `tests/unit/agents/MainPipeline.test.ts` покрывает:
  - несколько `tool_call` в одном запросе;
  - продолжение `model -> tools -> model`;
  - cancel во время выполнения tools без `kind:error`.
- `tests/unit/components/agents-status-colors.test.tsx` покрывает статусные переходы для `llm/tool_call` с `done=true/false`.

### Unit: Error Normalization

- `tests/unit/llm/ErrorNormalizer.test.ts` покрывает mapping AI SDK ошибок:
  - `APICallError` (401/403/429/5xx),
  - timeout/abort,
  - transport-level network,
  - `NoSuchToolError`, `InvalidToolInputError`, `ToolExecutionError`, `ToolCallRepairError`,
  - `UIMessageStreamError`.

### Functional: End-to-End Контракты

- `tests/functional/llm-chat.spec.ts` проверяет:
  - параллельный стриминг reasoning + текста;
  - отображение persisted `tool_call` как отдельного tool-call блока (по `message.created`/`message.updated`);
  - корректный rate-limit countdown без persisted `kind:error`;
  - отсутствие `kind:error` при cancel во время tool execution.

### Покрытие требований

| Требование | Модульные тесты | Функциональные тесты |
|---|---|---|
| testing.13.1 | ✓ | - |
| testing.13.2 | ✓ | - |
| testing.13.3 | ✓ | ✓ |
| testing.13.4 | ✓ | - |
| testing.13.5 | ✓ | ✓ |
| testing.13.6 | - | ✓ |
| testing.13.7 | ✓ | ✓ |
| testing.13.8 | ✓ | ✓ |
