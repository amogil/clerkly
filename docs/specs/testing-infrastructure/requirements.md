# Документ Требований: Инфраструктура Тестирования

## Введение

Данный документ описывает требования к инфраструктуре тестирования приложения Clerkly, включая типы тестов, стратегию мокирования и процесс валидации.
Документ описывает только тестовую инфраструктуру (процессы, инструменты, правила написания и запуска тестов) и SHALL NOT задавать продуктовые UI-контракты или runtime-логику приложения.
Продуктовые требования определяются профильными спецификациями фич в `docs/specs/*`; `testing-infrastructure` использует их только как внешние источники проверяемых контрактов.

## Глоссарий

- **Unit Tests** - Модульные тесты, проверяющие отдельные функции/классы изолированно
- **Functional Tests** - Функциональные тесты, проверяющие пользовательские сценарии с реальным Electron через Playwright
- **Mock** - Имитация внешней зависимости для изоляции тестируемого кода
- **Real Electron** - Запуск реального Electron процесса в тестовой среде через Playwright

## Требования

### 1. Стратегия Мокирования в Модульных Тестах

**ID:** testing.1

**User Story:** Как разработчик, я хочу чтобы модульные тесты были быстрыми и изолированными, чтобы быстро получать обратную связь о качестве кода.

**Зависимости:** Нет

#### Критерии Приемки

1.1. WHEN модульный тест выполняется, ALL внешние зависимости SHALL быть замокированы

1.2. THE следующие зависимости SHALL быть замокированы в модульных тестах:
- Electron API (`BrowserWindow`, `app`, `screen`, `ipcMain`)
- Внешние модули (`fs`, `path`, `crypto`)
- Зависимости класса (например, `DatabaseManager`, `UserSettingsManager`)
- Сетевые запросы (`fetch`, `https`)
- База данных (SQLite)

1.3. EACH модульный тест SHALL выполняться менее чем за 100ms

1.4. EACH модульный тест SHALL быть полностью изолирован от других тестов

### 3. Функциональные Тесты для Пользовательских Сценариев

**ID:** testing.3

**User Story:** Как разработчик, я хочу чтобы функциональные тесты проверяли пользовательские сценарии с реальным Electron, чтобы убедиться в корректности работы приложения с точки зрения пользователя.

**Зависимости:** Нет

#### Критерии Приемки

3.1. WHEN функциональный тест выполняется, THE реальный Electron SHALL быть запущен через Playwright

3.2. THE функциональные тесты SHALL НЕ мокировать Electron API

3.3. THE функциональные тесты SHALL использовать реальные классы приложения

3.4. THE функциональные тесты SHALL использовать реальную базу данных (SQLite в временной директории)

3.5. THE функциональные тесты SHALL использовать реальную файловую систему

3.6. THE функциональные тесты SHALL показывать реальные окна на экране

3.7. EACH функциональный тест SHALL очищать временные файлы после выполнения

3.8. THE функциональные тесты SHALL быть расположены в `tests/functional/**/*.spec.ts`

3.9. THE функциональные тесты SHALL использовать Playwright для Electron

3.10. EACH пользовательский сценарий из requirements.md SHALL быть покрыт функциональным тестом

3.11. EACH требование с пользовательским сценарием SHALL указывать функциональные тесты, которые его покрывают

3.12. THE функциональные тесты SHALL использовать LLM и UI

3.13. IF функциональный тест НЕ использует LLM или UI, THE тест SHALL быть выполнен ТОЛЬКО при наличии явного согласия пользователя и SHALL содержать комментарий с причиной исключения

### 3.1 Test IPC Handlers для Функциональных Тестов

**ID:** testing.3.1

**User Story:** Как разработчик, я хочу иметь специальные IPC handlers для тестов, чтобы управлять состоянием приложения из Playwright тестов без использования better-sqlite3 напрямую.

**Зависимости:** testing.3

#### Критерии Приемки

3.1.1. WHEN приложение запущено в тестовом режиме (NODE_ENV=test), THE test IPC handlers SHALL быть зарегистрированы

3.1.2. THE test IPC handlers SHALL предоставлять следующие методы:
- `test:setup-tokens` - установка тестовых токенов в БД
- `test:clear-tokens` - очистка всех токенов из БД
- `test:get-token-status` - получение статуса токенов
- `test:clear-data` - очистка всех данных из БД
- `test:handle-deep-link` - симуляция обработки OAuth callback/deep link в тестовой среде

3.1.3. THE test IPC handlers SHALL быть доступны ТОЛЬКО в тестовом режиме

3.1.4. THE test IPC handlers SHALL использовать реальные классы приложения (TokenStorageManager, DatabaseManager, UserSettingsManager)

3.1.5. THE test IPC handlers SHALL быть расположены в `tests/functional/helpers/test-ipc-handlers.ts`

3.1.6. THE preload script SHALL экспортировать `window.electron.ipcRenderer.invoke` для доступа к test IPC handlers

### 3.2 Mock OAuth Server для Функциональных Тестов

**ID:** testing.3.2

**User Story:** Как разработчик, я хочу иметь mock OAuth server, чтобы тестировать полный OAuth flow без реальных Google credentials.

**Зависимости:** testing.3

#### Критерии Приемки

3.2.1. THE mock OAuth server SHALL эмулировать Google OAuth endpoints:
- `/auth` - authorization endpoint
- `/token` - token exchange endpoint
- `/refresh` - token refresh endpoint

3.2.2. THE mock OAuth server SHALL возвращать тестовые токены в формате Google OAuth

3.2.3. THE mock OAuth server SHALL валидировать client_id и client_secret

3.2.4. THE mock OAuth server SHALL генерировать уникальные authorization codes

3.2.5. THE mock OAuth server SHALL поддерживать CORS для browser requests

3.2.6. THE mock OAuth server SHALL быть расположен в `tests/functional/helpers/mock-oauth-server.ts`

3.2.7. THE mock OAuth server SHALL запускаться перед функциональными тестами и останавливаться после

### 4. Процесс Валидации

**ID:** testing.4

**User Story:** Как разработчик, я хочу чтобы процесс валидации был быстрым и не мешал работе, чтобы часто проверять качество кода.

**Зависимости:** testing.1

#### Критерии Приемки

4.1. WHEN команда `npm run validate` выполняется, THE следующие проверки SHALL быть выполнены:
- TypeScript компиляция
- ESLint проверка
- Prettier проверка
- Модульные тесты
- Проверка покрытия кода

4.2. THE команда `npm run validate` SHALL НЕ запускать функциональные тесты

4.3. THE процесс валидации SHALL завершаться менее чем за 30 секунд

4.4. WHEN валидация проваливается, THE скрипт SHALL возвращать ненулевой код выхода

### 5. Запуск Функциональных Тестов

**ID:** testing.5

**User Story:** Как разработчик, я хочу иметь возможность запускать функциональные тесты отдельно, чтобы проверять реальное поведение приложения в пользовательских сценариях.

**Зависимости:** testing.3

#### Критерии Приемки

5.1. THE команда `npm run test:functional` SHALL запускать только функциональные тесты

5.2. THE функциональные тесты SHALL запускаться по явному запросу разработчика локально и автоматически в pull request workflow CI

5.3. THE функциональные тесты SHALL НЕ запускаться автоматически в `npm run validate`

5.4. WHEN функциональные тесты запускаются, THE пользователь SHALL быть предупрежден о том, что будут показаны окна на экране

5.5. WHEN pull request workflow CI выполняется, THE функциональные тесты SHALL запускаться на macOS runner и SHALL завершаться успешно

### 6. Требования к Окружению для Функциональных Тестов

**ID:** testing.6

**User Story:** Как разработчик, я хочу чтобы функциональные тесты работали в любом окружении, чтобы не зависеть от конкретной конфигурации.

**Зависимости:** testing.3

#### Критерии Приемки

6.1. THE функциональные тесты SHALL работать на macOS с графической средой

6.2. THE функциональные тесты SHALL работать на Linux с X11 или Wayland

6.3. THE функциональные тесты SHALL работать на Windows с графической средой

6.4. WHEN графическая среда недоступна, THE тесты SHALL пропускаться с предупреждением

6.5. THE функциональные тесты SHALL использовать временные директории для данных

### 7. Разделение Production Code и Reference Code

**ID:** testing.7

**User Story:** Как разработчик, я хочу четко разделять production код и референсный код, чтобы не тратить время на тестирование и анализ прототипов.

**Зависимости:** Нет

#### Критерии Приемки

7.1. THE код в директории `src/` SHALL считаться Production Code

7.2. THE Production Code SHALL быть покрыт тестами согласно требованиям testing.1-testing.3

7.3. THE Production Code SHALL анализироваться линтерами и статическими анализаторами

7.4. THE Production Code SHALL поддерживаться и обновляться

7.5. THE код в директории `figma/` SHALL считаться Reference Code

7.6. THE Reference Code SHALL НЕ требовать покрытия тестами

7.7. THE Reference Code SHALL НЕ анализироваться линтерами (может быть исключен из конфигурации)

7.8. THE Reference Code SHALL НЕ требовать изменений или поддержки

7.9. THE Reference Code SHALL использоваться только как референс для визуального дизайна и прототипирования

7.10. WHEN измеряется покрытие кода тестами, THE Reference Code SHALL быть исключен из расчетов

### 8. Покрытие Пользовательских Сценариев Функциональными Тестами

**ID:** testing.8

**User Story:** Как разработчик, я хочу чтобы каждый пользовательский сценарий был покрыт функциональным тестом, чтобы гарантировать корректность работы приложения с точки зрения пользователя.

**Зависимости:** testing.3

#### Критерии Приемки

8.1. EACH пользовательский сценарий (User Story) в requirements.md SHALL быть покрыт минимум одним функциональным тестом

8.2. EACH требование с пользовательским сценарием SHALL содержать секцию "Функциональные Тесты" с перечислением тестов

8.3. THE секция "Функциональные Тесты" SHALL указывать путь к файлу теста и название теста

8.4. THE функциональные тесты SHALL проверять пользовательский сценарий от начала до конца

8.5. THE функциональные тесты SHALL использовать реальный Electron и показывать реальные окна

8.6. WHEN новый пользовательский сценарий добавляется, THE соответствующий функциональный тест SHALL быть создан

**Примечание:** Секция "Функциональные Тесты" в requirements.md должна использовать следующий формат:

```markdown
#### Функциональные Тесты

- `tests/functional/app-lifecycle.spec.ts` - "should launch application successfully"
- `tests/functional/auth-flow.spec.ts` - "should show login screen on first launch"
```

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

## Вне Области Применения

Следующие элементы явно исключены из данной спецификации:

- Визуальное регрессионное тестирование
- Тесты производительности
- Нагрузочное тестирование
- Тестирование безопасности
- Продуктовые UI-контракты
- Runtime-логика приложения


### 10. Helper Функции для Функциональных Тестов

**ID:** testing.10

**User Story:** Как разработчик, я хочу использовать стандартизированные helper функции в функциональных тестах, чтобы избежать дублирования кода и упростить поддержку.

**Зависимости:** testing.3, testing.3.2

#### Критерии Приемки

10.1. THE функция `createMockOAuthServer(port)` SHALL быть использована для создания Mock OAuth Server во всех функциональных тестах

10.2. THE функция `createMockOAuthServer(port)` SHALL:
- Создавать MockOAuthServer с дефолтными тестовыми credentials
- Автоматически запускать сервер
- Возвращать готовый к использованию экземпляр MockOAuthServer

10.3. THE функциональные тесты SHALL НЕ создавать MockOAuthServer напрямую через `new MockOAuthServer()`

10.4. THE функция `createMockOAuthServer(port)` SHALL быть расположена в `tests/functional/helpers/electron.ts`

10.5. EACH функциональный тест SHALL импортировать `createMockOAuthServer` из `./helpers/electron`

**Пример использования:**

```typescript
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8892);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});
```

### 11. Ожидание Элементов в Функциональных Тестах

**ID:** testing.11

**User Story:** Как разработчик, я хочу использовать правильные методы ожидания элементов в функциональных тестах, чтобы тесты были стабильными и не падали из-за race conditions.

**Зависимости:** testing.3

#### Критерии Приемки

11.1. THE функциональные тесты SHALL использовать локаторы с встроенным ожиданием вместо `waitForTimeout`

11.2. THE функциональные тесты SHALL НЕ использовать безусловные `waitForTimeout` для ожидания элементов

11.3. THE функциональные тесты SHALL использовать следующие методы ожидания:
- `await expect(locator).toBeVisible()` - ожидание видимости элемента
- `await expect(locator).toContainText(text)` - ожидание текста в элементе
- `await expect(locator).toHaveCount(n)` - ожидание количества элементов
- `await locator.waitFor({ state: 'visible' })` - явное ожидание состояния

11.4. WHEN элемент должен появиться после действия, THE тест SHALL использовать `await expect(locator).toBeVisible()` вместо `await waitForTimeout()`

11.5. WHEN нужно дождаться изменения текста, THE тест SHALL использовать `await expect(locator).toContainText(text)` вместо `await waitForTimeout()`

11.6. THE использование `waitForTimeout` SHALL быть допустимо ТОЛЬКО в исключительных случаях:
- Ожидание анимации, которая не имеет DOM-индикатора завершения
- Ожидание debounce/throttle функций с известным таймингом
- В таких случаях MUST быть добавлен комментарий с объяснением

**Примеры:**

```typescript
// ❌ НЕПРАВИЛЬНО - безусловное ожидание
await messageInput.press('Enter');
await window.waitForTimeout(500);
const messages = window.locator('[data-testid="message"]');
await expect(messages).toHaveCount(1);

// ✅ ПРАВИЛЬНО - ожидание локатора
await messageInput.press('Enter');
const messages = window.locator('[data-testid="message"]');
await expect(messages.first()).toBeVisible({ timeout: 2000 });
await expect(messages).toHaveCount(1);
```

```typescript
// ❌ НЕПРАВИЛЬНО - ожидание перед проверкой текста
await button.click();
await window.waitForTimeout(1000);
const text = await element.textContent();
expect(text).toContain('Success');

// ✅ ПРАВИЛЬНО - ожидание текста в локаторе
await button.click();
await expect(element).toContainText('Success');
```


### 12. Обнаружение Toast-ошибок в Функциональных Тестах

**ID:** testing.12

**User Story:** Как разработчик, я хочу чтобы функциональные тесты автоматически обнаруживали toast-уведомления об ошибках, чтобы тесты не проходили молча когда приложение показывает ошибку пользователю.

**Зависимости:** testing.3, testing.11

#### Критерии Приемки

12.1. THE функциональные тесты SHALL проверять отсутствие toast-ошибок после ключевых действий (завершение OAuth, навигация на основные экраны, действия пользователя).

12.2. WHEN в DOM присутствует toast-уведомление с типом `error`, THE тест SHALL завершаться с ошибкой, содержащей текст этого уведомления.

12.3. THE проверка toast-ошибок SHALL быть реализована как переиспользуемый helper в модуле тестовых утилит.
