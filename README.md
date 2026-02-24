# Clerkly - AI Agent для менеджеров

Electron-приложение для Mac OS X с локальным хранением данных и комплексным тестовым покрытием.

## Требования к системе

- **Node.js**: 18.0.0 или выше
- **Mac OS X**: 10.13 (High Sierra) или выше
- **Свободное место**: минимум 500 MB

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск приложения (production build с полной функциональностью)
npm start

# Валидация проекта
npm run validate
```

## Настройка Google OAuth

1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com/)
2. Настройте OAuth consent screen (External, scopes: openid, email, profile)
3. Создайте OAuth 2.0 Client ID (тип: Desktop app)
4. Обновите `src/main/auth/OAuthConfig.ts`:
   ```typescript
   export const OAUTH_CONFIG = {
     clientId: 'your-client-id.apps.googleusercontent.com',
     clientSecret: 'your-client-secret',
     redirectUri: 'com.googleusercontent.apps.YOUR_CLIENT_ID:/oauth2redirect',
     // ...
   };
   ```

## Основные команды

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

### Тестирование
```bash
npm test                 # Модульные + property-based тесты
npm run test:unit        # Модульные тесты
npm run test:property    # Property-based тесты
npm run test:functional  # Функциональные тесты (Playwright, показывает окна)
npm run test:coverage    # Отчет о покрытии
```

### Качество кода
```bash
npm run validate         # Полная валидация (рекомендуется перед коммитом)
npm run lint             # ESLint проверка
npm run lint:fix         # ESLint с автофиксом
npm run format           # Prettier форматирование
```

### Упаковка
```bash
npm run package          # Создание дистрибутива (DMG + ZIP)
```

## Типы тестов

1. **Модульные тесты** (`tests/unit/`)
   - Изолированное тестирование с моками
   - Скорость: < 100ms на тест

2. **Property-based тесты** (`tests/property/`)
   - Проверка инвариантов на 100+ итерациях
   - Библиотека: fast-check

3. **Функциональные тесты** (`tests/functional/`)
   - End-to-end с реальным Electron через Playwright
   - ⚠️ Показывают окна на экране

## Структура проекта

```
clerkly/
├── src/
│   ├── main/           # Main process (Electron)
│   ├── renderer/       # Renderer process (React UI)
│   ├── preload/        # Preload script (IPC bridge)
│   └── types/          # TypeScript типы
├── tests/
│   ├── unit/           # Модульные тесты
│   ├── property/       # Property-based тесты
│   └── functional/     # Функциональные тесты (Playwright)
├── migrations/         # Миграции SQLite
├── specs/specs/        # Спецификации проекта
└── dist/               # Скомпилированные файлы
```

## Технологический стек

- **Electron** 28+ - Desktop приложение
- **TypeScript** 5+ - Язык программирования
- **React** 18+ - UI библиотека
- **Tailwind CSS** 4+ - CSS фреймворк
- **SQLite** (better-sqlite3) - Локальное хранение
- **Vite** 6+ - Сборщик
- **Jest** + **Playwright** - Тестирование
- **fast-check** - Property-based тестирование

## Workflow разработки

**Перед коммитом:**
```bash
npm run validate
```

**Перед релизом:**
```bash
npm run validate
npm run test:functional
npm run package
```

## Документация

Полная документация в `specs/specs/`:

**Основные спецификации:**
- `clerkly/` - Общие требования и архитектура приложения
- `testing-infrastructure/` - Стратегия тестирования
- `visual-design/` - Визуальный дизайн и UI/UX

**Авторизация:**
- `google-oauth-auth/` - OAuth авторизация через Google

**UI компоненты:**
- `window-management/` - Управление окнами приложения
- `navigation/` - Навигация и роутинг
- `account-profile/` - Профиль пользователя
- `error-notifications/` - Обработка и отображение ошибок
- `token-management-ui/` - UI управления токенами
- `settings/` - Настройки приложения
- `user-data-isolation/` - Изоляция данных пользователей

## Устранение неполадок

**Ошибка компиляции better-sqlite3:**
```bash
npm rebuild better-sqlite3
```

**Приложение не запускается:**
```bash
npm run build
node --version  # Проверьте версию >= 18.0.0
```

**Тесты не проходят:**
```bash
npm test -- --clearCache
npm test -- --verbose
```

## Лицензия

MIT

---

**Версия**: 1.0.0  
**Платформа**: Mac OS X 10.13+
