# Функциональные Тесты

## Обзор

Функциональные тесты используют Playwright для автоматизации браузера и тестирования пользовательских сценариев через UI. Тесты выполняются в изолированной среде с автоматической очисткой состояния между тестами.

## Изоляция Тестов

**Requirements**: testing-infrastructure.5.3

Система изоляции тестов обеспечивает:

- **Автоматическую очистку состояния**: Каждый тест получает свежую изолированную среду
- **Изолированные браузерные контексты**: Тесты не делятся состоянием браузера
- **Уникальные директории данных**: Каждый тест использует отдельную временную директорию
- **Параллельное выполнение**: Тесты могут безопасно выполняться параллельно

### Использование Изоляции

#### Вариант 1: Автоматическая изоляция (рекомендуется)

```typescript
import { test, expect } from "./fixtures/test-isolation";

test("my test", async ({ isolatedApp }) => {
  const { page } = isolatedApp;
  // Тест выполняется в изолированной среде
  // Очистка происходит автоматически
});
```

#### Вариант 2: Ручная изоляция (для кастомных сценариев)

```typescript
import { test, expect } from "@playwright/test";
import { createUserDataDir, cleanupUserDataDir, launchApp } from "./utils/app";

test("my test", async () => {
  const userDataDir = await createUserDataDir();
  const { app, page } = await launchApp(userDataDir, { authMode: "success" });

  // Тест код

  await app.close();
  await cleanupUserDataDir(userDataDir);
});
```

Подробнее см. [Migration Guide](./fixtures/MIGRATION_GUIDE.md).

## Доступные NPM Скрипты

### Основные Скрипты

#### `npm run test:functional`

Запускает все функциональные тесты во всех браузерах (Chromium, Firefox, WebKit) в headless режиме с параллельным выполнением (4 воркера).

```bash
npm run test:functional
```

#### `npm run test:functional:headed`

Запускает тесты с видимым браузером (headed mode) для отладки и наблюдения за выполнением тестов.

```bash
npm run test:functional:headed
```

#### `npm run test:functional:debug`

Запускает тесты в режиме отладки с пошаговым выполнением и инспектором Playwright.

```bash
npm run test:functional:debug
```

### Скрипты для Отдельных Браузеров

#### `npm run test:functional:chromium`

Запускает тесты только в браузере Chromium.

```bash
npm run test:functional:chromium
```

#### `npm run test:functional:firefox`

Запускает тесты только в браузере Firefox.

```bash
npm run test:functional:firefox
```

#### `npm run test:functional:webkit`

Запускает тесты только в браузере WebKit (Safari).

```bash
npm run test:functional:webkit
```

### Скрипты для Управления Параллелизмом

#### `npm run test:functional:parallel`

Явно запускает тесты с 4 воркерами для максимальной скорости выполнения.

```bash
npm run test:functional:parallel
```

#### `npm run test:functional:serial`

Запускает тесты последовательно (1 воркер) для отладки проблем с параллельным выполнением.

```bash
npm run test:functional:serial
```

## Конфигурация

Конфигурация Playwright находится в `tests/functional/playwright.config.ts` и включает:

- **Timeout**: 60 секунд на тест
- **Retries**: 2 повторные попытки при неудаче
- **Workers**: 4 параллельных воркера (по умолчанию)
- **Screenshot**: Только при неудаче теста
- **Video**: Сохраняется только при неудаче
- **Trace**: Сохраняется только при неудаче

## Структура Тестов

```
tests/functional/
├── playwright.config.ts          # Конфигурация Playwright
├── README.md                      # Эта документация
├── auth/                          # Тесты аутентификации
├── navigation/                    # Тесты навигации
└── settings/                      # Тесты настроек
```

## Требования

- **Requirements**: testing-infrastructure.5.2
- Все функциональные тесты должны выполняться в изолированной среде
- Автоматическая очистка состояния между тестами
- Поддержка параллельного выполнения с несколькими воркерами

## Примеры Использования

### Запуск всех тестов

```bash
npm run test:functional
```

### Отладка конкретного теста

```bash
npm run test:functional:debug -- playwright-config-validation.spec.ts
```

### Запуск тестов в конкретном браузере

```bash
npm run test:functional:chromium
```

### Запуск с пользовательским количеством воркеров

```bash
npm run build && playwright test --config tests/functional/playwright.config.ts --workers=2
```

## Отчеты

После выполнения тестов HTML отчет доступен в `test-results/html/index.html`.

Для просмотра отчета:

```bash
npx playwright show-report test-results/html
```
