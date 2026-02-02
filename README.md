# Clerkly - AI Agent для менеджеров

Clerkly - это Electron-приложение для Mac OS X, представляющее собой AI-ассистента для менеджеров. На текущем этапе реализуется базовая платформа приложения с локальным хранением данных, нативным Mac OS X интерфейсом и комплексным тестовым покрытием.

## Требования к системе

- **Node.js**: 18.0.0 или выше
- **Mac OS X**: 10.13 (High Sierra) или выше
- **npm**: 8.0.0 или выше

## Установка

```bash
# Установка зависимостей
npm install
```

## Разработка

```bash
# Запуск приложения в режиме разработки
npm run dev

# Сборка проекта
npm run build

# Сборка отдельных компонентов
npm run build:main      # Main process
npm run build:renderer  # Renderer process
npm run build:preload   # Preload script
```

## Тестирование

```bash
# Запуск всех тестов
npm test

# Запуск модульных тестов
npm run test:unit

# Запуск property-based тестов
npm run test:property

# Запуск функциональных тестов (ТОЛЬКО вручную!)
# ⚠️ Внимание: Функциональные тесты показывают окна на экране
npm run test:functional

# Запуск тестов с отчетом о покрытии
npm run test:coverage

# Запуск тестов в watch режиме
npm run test:watch
```

## Валидация кода

```bash
# Полная валидация (тесты + линтинг + форматирование)
npm run validate

# Линтинг
npm run lint
npm run lint:fix

# Форматирование
npm run format
npm run format:check
```

## Упаковка приложения

```bash
# Создание дистрибутива для Mac OS X
npm run package

# Создание только Mac OS X версии
npm run package:mac
```

## Структура проекта

```
clerkly/
├── src/
│   ├── main/           # Main process (Electron)
│   ├── renderer/       # Renderer process (UI)
│   ├── preload/        # Preload script (IPC bridge)
│   └── types/          # TypeScript типы и интерфейсы
├── tests/
│   ├── unit/           # Модульные тесты
│   ├── property/       # Property-based тесты
│   └── functional/     # Функциональные тесты
├── migrations/         # Миграции базы данных SQLite
├── scripts/            # Скрипты для разработки
└── dist/               # Скомпилированные файлы
```

## Технологический стек

- **Electron** 28+ - Desktop приложение
- **TypeScript** 5+ - Язык программирования
- **SQLite** (better-sqlite3) - Локальное хранение данных
- **Jest** - Тестирование
- **fast-check** - Property-based тестирование
- **ESLint** - Линтинг
- **Prettier** - Форматирование кода

## Архитектура

Приложение следует стандартной архитектуре Electron:

- **Main Process**: Управляет жизненным циклом приложения, окнами, хранением данных
- **Renderer Process**: Отвечает за UI и взаимодействие с пользователем
- **Preload Script**: Обеспечивает безопасную IPC коммуникацию между процессами

## Тестирование

Проект использует комплексный подход к тестированию:

- **Модульные тесты**: Проверяют конкретные примеры и граничные случаи
- **Property-based тесты**: Проверяют универсальные свойства на множестве входных данных
- **Функциональные тесты**: Проверяют интеграцию компонентов

### Требования к покрытию

- Минимум 80% покрытие для бизнес-логики
- 100% покрытие для критических компонентов (Data Manager, Lifecycle Manager, IPC Handlers)

## Документация

Полная документация проекта находится в директории `.kiro/specs/clerkly/`:

- `requirements.md` - Требования к проекту
- `design.md` - Дизайн и архитектура
- `tasks.md` - План реализации

## Лицензия

MIT

## Контакты

Clerkly Team
