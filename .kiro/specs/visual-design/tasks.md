# Задачи: Визуальное Оформление Приложения

## Обзор

Данный документ содержит список задач для реализации системы управления визуальным оформлением приложения Clerkly. Задачи организованы в логические группы и должны выполняться последовательно.

## Статус Задач

- `[ ]` - Не начата
- `[-]` - В процессе
- `[x]` - Завершена
- `[~]` - В очереди

## Задачи

### 1. Настройка Инфраструктуры

- [ ] 1.1 Создать типы данных для системы управления компонентами
  - Создать `src/types/visual-design.ts` с интерфейсами:
    - `ComponentMetadata`
    - `FigmaReference`
    - `TransferRequest`
    - `TransferResult`
    - `ConflictResolution`
    - `DependencyInfo`
    - `ImportStatement`
  - **Requirements**: visual-design.1.1, visual-design.2.1

- [ ] 1.2 Создать утилиты для работы с файловой системой
  - Создать `src/utils/file-utils.ts` с функциями:
    - `readFile(path: string): Promise<string>`
    - `writeFile(path: string, content: string): Promise<void>`
    - `fileExists(path: string): Promise<boolean>`
    - `copyFile(source: string, target: string): Promise<void>`
  - **Requirements**: visual-design.2.1, visual-design.2.3

- [ ] 1.3 Создать утилиты для работы с путями
  - Создать `src/utils/path-utils.ts` с функциями:
    - `resolvePath(base: string, relative: string): string`
    - `extractComponentName(path: string): string`
    - `getComponentPath(name: string, type: 'ui' | 'feature'): string`
  - **Requirements**: visual-design.1.1, visual-design.2.3

### 2. Реализация Figma Reference Manager

- [ ] 2.1 Создать класс FigmaReferenceManager
  - Создать `src/services/FigmaReferenceManager.ts`
  - Реализовать конструктор и инициализацию
  - Определить константы путей (FIGMA_DIR, RENDERER_DIR)
  - **Requirements**: visual-design.1.1

- [ ] 2.2 Реализовать сканирование компонентов
  - Реализовать метод `scanComponents(): Promise<ComponentMetadata[]>`
  - Сканировать директории `figma/src/app/components/ui/` и `figma/src/app/components/`
  - Извлекать метаданные компонентов (имя, путь, тип, дата изменения)
  - **Requirements**: visual-design.1.1

- [ ] 2.3 Реализовать получение компонента по имени
  - Реализовать метод `getComponent(name: string): Promise<ComponentMetadata | null>`
  - Поиск компонента в кэше или файловой системе
  - Возврат null если компонент не найден
  - **Requirements**: visual-design.1.2

- [ ] 2.4 Реализовать листинг компонентов
  - Реализовать метод `listComponents(type?: 'ui' | 'feature'): Promise<ComponentMetadata[]>`
  - Фильтрация по типу компонента
  - Сортировка по имени
  - **Requirements**: visual-design.1.1

### 3. Реализация Dependency Resolver

- [ ] 3.1 Создать класс DependencyResolver
  - Создать `src/services/DependencyResolver.ts`
  - Реализовать конструктор
  - **Requirements**: visual-design.2.3

- [ ] 3.2 Реализовать извлечение импортов
  - Реализовать метод `extractImports(fileContent: string): Promise<ImportStatement[]>`
  - Парсинг import statements с использованием регулярных выражений
  - Определение относительных и абсолютных импортов
  - **Requirements**: visual-design.2.3

- [ ] 3.3 Реализовать анализ зависимостей
  - Реализовать метод `analyzeDependencies(componentPath: string): Promise<DependencyInfo>`
  - Рекурсивный анализ зависимостей компонента
  - Построение дерева зависимостей
  - Определение отсутствующих зависимостей
  - **Requirements**: visual-design.2.3

- [ ] 3.4 Реализовать разрешение дерева зависимостей
  - Реализовать метод `resolveDependencyTree(componentName: string): Promise<string[]>`
  - Построение полного списка зависимостей (прямых и транзитивных)
  - Обнаружение циклических зависимостей
  - **Requirements**: visual-design.2.3

- [ ] 3.5 Реализовать валидацию зависимостей
  - Реализовать метод `validateDependencies(componentName: string, targetDir: string): Promise<string[]>`
  - Проверка наличия всех зависимостей в целевой директории
  - Возврат списка отсутствующих зависимостей
  - **Requirements**: visual-design.2.3

### 4. Реализация Component Transfer Service

- [ ] 4.1 Создать класс ComponentTransferService
  - Создать `src/services/ComponentTransferService.ts`
  - Реализовать конструктор с зависимостями (FigmaReferenceManager, DependencyResolver)
  - **Requirements**: visual-design.2.1

- [ ] 4.2 Реализовать проверку конфликтов
  - Реализовать метод `checkConflicts(componentName: string): Promise<string[]>`
  - Проверка существования файлов в целевой директории
  - Возврат списка конфликтующих файлов
  - **Requirements**: visual-design.2.4

- [ ] 4.3 Реализовать разрешение конфликтов
  - Реализовать метод `resolveConflict(resolution: ConflictResolution): Promise<void>`
  - Обработка действий: overwrite, skip, merge
  - **Requirements**: visual-design.2.4

- [ ] 4.4 Реализовать перенос компонента
  - Реализовать метод `transferComponent(request: TransferRequest): Promise<TransferResult>`
  - Проверка явного запроса пользователя
  - Получение компонента из Figma Reference
  - Проверка конфликтов
  - Анализ и валидация зависимостей
  - Копирование файла компонента
  - Копирование стилей при необходимости
  - **Requirements**: visual-design.2.1, visual-design.2.2, visual-design.2.3, visual-design.2.4

- [ ] 4.5 Реализовать уведомления о результатах
  - Реализовать метод `notifyTransferComplete(result: TransferResult): Promise<void>`
  - Форматирование сообщения о результате
  - Вывод информации о перенесенных файлах или конфликтах
  - **Requirements**: visual-design.2.5

### 5. Реализация CLI Интерфейса

- [ ] 5.1 Создать CLI скрипт для листинга компонентов
  - Создать `scripts/figma-list.ts`
  - Парсинг аргументов командной строки (--type)
  - Вызов FigmaReferenceManager.listComponents()
  - Форматированный вывод списка компонентов
  - **Requirements**: visual-design.1.1

- [ ] 5.2 Создать CLI скрипт для переноса компонентов
  - Создать `scripts/figma-transfer.ts`
  - Парсинг аргументов (--component, --include-styles, --overwrite)
  - Вызов ComponentTransferService.transferComponent()
  - Обработка результата и вывод сообщений
  - **Requirements**: visual-design.2.1, visual-design.2.5

- [ ] 5.3 Создать CLI скрипт для проверки зависимостей
  - Создать `scripts/figma-deps.ts`
  - Парсинг аргументов (--component)
  - Вызов DependencyResolver.analyzeDependencies()
  - Форматированный вывод дерева зависимостей
  - **Requirements**: visual-design.2.3

- [ ] 5.4 Создать CLI скрипт для проверки конфликтов
  - Создать `scripts/figma-check.ts`
  - Парсинг аргументов (--component)
  - Вызов ComponentTransferService.checkConflicts()
  - Вывод списка конфликтов
  - **Requirements**: visual-design.2.4

- [ ] 5.5 Добавить npm скрипты в package.json
  - Добавить `figma:list`: запуск `scripts/figma-list.ts`
  - Добавить `figma:transfer`: запуск `scripts/figma-transfer.ts`
  - Добавить `figma:deps`: запуск `scripts/figma-deps.ts`
  - Добавить `figma:check`: запуск `scripts/figma-check.ts`
  - **Requirements**: visual-design.1.1, visual-design.2.1

### 6. Модульное Тестирование

- [ ] 6.1 Написать тесты для FigmaReferenceManager
  - Создать `tests/unit/FigmaReferenceManager.test.ts`
  - Тесты для scanComponents()
  - Тесты для getComponent()
  - Тесты для listComponents()
  - **Requirements**: visual-design.1.1, visual-design.1.2

- [ ] 6.2 Написать тесты для DependencyResolver
  - Создать `tests/unit/DependencyResolver.test.ts`
  - Тесты для extractImports()
  - Тесты для analyzeDependencies()
  - Тесты для resolveDependencyTree()
  - Тесты для validateDependencies()
  - Тесты для обнаружения циклических зависимостей
  - **Requirements**: visual-design.2.3

- [ ] 6.3 Написать тесты для ComponentTransferService
  - Создать `tests/unit/ComponentTransferService.test.ts`
  - Тесты для checkConflicts()
  - Тесты для resolveConflict()
  - Тесты для transferComponent() - успешный перенос
  - Тесты для transferComponent() - отклонение автоматического переноса
  - Тесты для transferComponent() - обработка конфликтов
  - Тесты для notifyTransferComplete()
  - **Requirements**: visual-design.2.1, visual-design.2.2, visual-design.2.3, visual-design.2.4, visual-design.2.5

### 7. Property-Based Тестирование

- [ ] 7.1 Написать property-based тест для изоляции Figma Reference
  - Создать `tests/property/VisualDesign.property.test.ts`
  - Реализовать Property 1: Изоляция Figma Reference
  - Генерация случайных операций (read, write, update, delete)
  - Проверка независимости Figma Reference и Main Application
  - **Requirements**: visual-design.1.1, visual-design.1.2

- [ ] 7.2 Написать property-based тест для контролируемого переноса
  - Реализовать Property 2: Контролируемый перенос
  - Генерация случайных запросов переноса
  - Проверка отклонения автоматических переносов
  - Проверка выполнения только явных запросов
  - **Requirements**: visual-design.2.1, visual-design.2.2

- [ ] 7.3 Написать property-based тест для сохранения зависимостей
  - Реализовать Property 3: Сохранение зависимостей
  - Генерация случайных компонентов с зависимостями
  - Проверка наличия всех зависимостей после переноса
  - **Requirements**: visual-design.2.3

- [ ] 7.4 Написать property-based тест для обработки конфликтов
  - Реализовать Property 4: Обработка конфликтов
  - Генерация случайных конфликтных ситуаций
  - Проверка корректной обработки с/без флага overwrite
  - **Requirements**: visual-design.2.4

- [ ] 7.5 Написать property-based тест для уведомлений
  - Реализовать Property 5: Уведомления о результатах
  - Генерация случайных операций переноса
  - Проверка наличия уведомлений для всех операций
  - Проверка корректности содержимого TransferResult
  - **Requirements**: visual-design.2.5

### 8. Функциональное Тестирование

- [ ] 8.1 Написать функциональный тест для переноса UI компонента
  - Создать `tests/functional/ComponentTransfer.functional.test.ts`
  - Тест полного цикла переноса UI компонента с зависимостями
  - Проверка корректности перенесенных файлов
  - **Requirements**: visual-design.2.1, visual-design.2.3

- [ ] 8.2 Написать функциональный тест для переноса Feature компонента
  - Тест полного цикла переноса Feature компонента со стилями
  - Проверка переноса стилей (theme.css, tailwind.css, fonts.css, index.css)
  - **Requirements**: visual-design.2.1, visual-design.2.3

- [ ] 8.3 Написать функциональный тест для workflow разрешения конфликтов
  - Тест полного workflow обнаружения и разрешения конфликтов
  - Проверка запроса подтверждения
  - Проверка перезаписи при явном разрешении
  - **Requirements**: visual-design.2.4

- [ ] 8.4 Написать функциональный тест для валидации полного процесса
  - Тест end-to-end процесса: листинг → проверка → перенос → валидация
  - Проверка интеграции всех компонентов системы
  - **Requirements**: visual-design.1.1, visual-design.2.1, visual-design.2.3, visual-design.2.4, visual-design.2.5

### 9. Документация и Финализация

- [ ] 9.1 Создать README для системы управления визуальным оформлением
  - Создать `docs/visual-design-system.md`
  - Описание архитектуры системы
  - Примеры использования CLI команд
  - Troubleshooting guide
  - **Requirements**: visual-design.1.1, visual-design.2.1

- [ ] 9.2 Добавить JSDoc комментарии ко всем публичным API
  - Документировать все классы, методы и интерфейсы
  - Добавить примеры использования
  - **Requirements**: visual-design.1.1, visual-design.2.1, visual-design.2.3

- [ ] 9.3 Запустить финальную валидацию
  - Выполнить `npm run validate`
  - Проверить покрытие тестами (минимум 85%)
  - Убедиться в прохождении всех тестов
  - **Requirements**: visual-design.1.1, visual-design.1.2, visual-design.2.1, visual-design.2.2, visual-design.2.3, visual-design.2.4, visual-design.2.5

## Порядок Выполнения

Рекомендуемый порядок выполнения задач:

1. **Фаза 1: Инфраструктура** (Задачи 1.1 - 1.3)
2. **Фаза 2: Core Services** (Задачи 2.1 - 4.5)
3. **Фаза 3: CLI Interface** (Задачи 5.1 - 5.5)
4. **Фаза 4: Testing** (Задачи 6.1 - 8.4)
5. **Фаза 5: Финализация** (Задачи 9.1 - 9.3)

## Примечания

- Все задачи должны включать комментарии с ссылками на требования (формат: `// Requirements: visual-design.X.Y`)
- Все тесты должны содержать структурированные комментарии (Preconditions, Action, Assertions, Requirements)
- Функциональные тесты (раздел 8) запускаются ТОЛЬКО при явной просьбе пользователя
- Перед завершением каждой задачи необходимо запустить `npm run validate` (кроме функциональных тестов)
