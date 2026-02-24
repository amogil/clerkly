# Список Задач: Управление Окнами

## Обзор

Данный документ содержит список задач для реализации функциональности управления главным окном приложения Clerkly, включая конфигурацию окна при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

## Задачи

- [x] 1. Создать интерфейс WindowState и класс WindowStateManager
  - [x] 1.1 Создать интерфейс WindowState
    - Определить типы для x, y, width, height, isMaximized
    - Добавить JSDoc комментарии с описанием каждого поля
    - Добавить валидационные правила в комментариях
    - _Requirements: window-management.5_

  - [x] 1.2 Создать класс WindowStateManager
    - Реализовать конструктор с зависимостью от DataManager
    - Добавить приватное поле stateKey = 'window_state' (глобальный ключ, не зависит от пользователя)
    - Добавить JSDoc комментарии для класса
    - _Requirements: window-management.5, window-management.5.7_

  - [x] 1.3 Реализовать метод loadState()
    - Загружать состояние из DataManager по ключу 'window_state'
    - Парсить JSON и валидировать структуру
    - Проверять валидность позиции через isPositionValid()
    - Возвращать getDefaultState() при ошибках или невалидной позиции
    - Логировать ошибки через console.error
    - _Requirements: window-management.5.4, window-management.5.5, window-management.5.6_

  - [x] 1.4 Реализовать метод saveState()
    - Сериализовать WindowState в JSON
    - Сохранять в DataManager по ключу 'window_state'
    - Обрабатывать ошибки gracefully (логировать, но не бросать исключения)
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

  - [x] 1.5 Реализовать метод getDefaultState()
    - Получать размер экрана через screen.getPrimaryDisplay().workAreaSize
    - Вычислять размер окна: min(800, screenWidth) x min(600, screenHeight)
    - Центрировать окно на экране
    - Устанавливать isMaximized: false (окно НЕ максимизировано по умолчанию)
    - _Requirements: window-management.1.1, window-management.4.1, window-management.4.2, window-management.4.4_

  - [x] 1.6 Реализовать метод isPositionValid()
    - Получать список всех дисплеев через screen.getAllDisplays()
    - Проверять, что позиция (x, y) находится в пределах хотя бы одного дисплея
    - Возвращать boolean результат
    - _Requirements: window-management.5.6_

  - [x] 1.7 Написать модульные тесты для WindowStateManager
    - Тест: should return default state when no saved state exists (компактный размер 800x600)
    - Тест: should load saved state from database
    - Тест: should return default state for invalid position
    - Тест: should save state to database
    - Тест: should handle save errors gracefully
    - Тест: should handle corrupted state data
    - Использовать структуру: Preconditions, Action, Assertions, Requirements
    - _Requirements: window-management.1.1, window-management.4.1, window-management.4.2, window-management.5_

- [x] 2. Расширить WindowManager для использования WindowStateManager
  - [x] 2.1 Добавить зависимость от WindowStateManager
    - Добавить приватное поле windowStateManager: WindowStateManager
    - Инициализировать в конструкторе: new WindowStateManager(dataManager)
    - _Requirements: window-management.5_

  - [x] 2.2 Обновить метод createWindow()
    - Загружать состояние через windowStateManager.loadState()
    - Применять загруженное состояние к BrowserWindowConstructorOptions
    - Устанавливать title: '' (пустой заголовок)
    - Устанавливать titleBarStyle: 'default' (нативные элементы macOS)
    - Устанавливать resizable: true (окно можно изменять в размере)
    - НЕ вызывать maximize() сразу, даже если isMaximized: true
    - В обработчике ready-to-show: показать окно, затем применить maximize() если isMaximized: true
    - _Requirements: window-management.1.1, window-management.1.2, window-management.1.3, window-management.2.1, window-management.3.1, window-management.5.4_

  - [x] 2.3 Реализовать метод setupStateTracking()
    - Подписаться на события: resize, move, maximize, unmaximize
    - Подписаться на событие close для финального сохранения
    - Вызывать saveCurrentState() при каждом событии
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

  - [x] 2.4 Реализовать метод saveCurrentState()
    - Получать текущие bounds через mainWindow.getBounds()
    - Получать состояние maximized через mainWindow.isMaximized()
    - Вызывать windowStateManager.saveState() с текущим состоянием
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

  - [x] 2.5 Написать модульные тесты для WindowManager
    - Тест: should create window with correct initial configuration
    - Тест: should save state when window is resized
    - Тест: should save state when window is moved
    - Тест: should save maximized state
    - Тест: should save state on window close
    - Тест: should handle window creation errors
    - Использовать структуру: Preconditions, Action, Assertions, Requirements
    - _Requirements: window-management.1, window-management.2, window-management.3, window-management.5_

- [x] 3. Checkpoint - Убедиться, что все модульные тесты проходят
  - Запустить `npm run test:unit`
  - Убедиться, что все тесты проходят без ошибок
  - Если есть ошибки, исправить их перед продолжением

- [x] 4. Написать модульные тесты для WindowStateManager
  - [x] 4.1 Unit test: Размер окна адаптируется к экрану
    - Вызывать getDefaultState() с мокированным screen API
    - Проверить, что размеры <= размера экрана
    - Проверить, что размеры > 0
    - Проверить, что размеры не хардкожены (не всегда 600x400)
    - **Property 5: Размер окна адаптируется к экрану при первом запуске**
    - _Requirements: window-management.4.1, window-management.4.2_

  - [x] 4.2 Unit test: Round-trip сохранения и загрузки состояния
    - Мокировать screen API для валидации позиции
    - Вызывать saveState(), затем loadState()
    - Проверить эквивалентность загруженного и сохраненного состояния
    - **Property 7: Round-trip сохранения и загрузки состояния**
    - _Requirements: window-management.5.4_

  - [x] 4.3 Unit test: Изменения состояния окна сохраняются
    - Создать окно через WindowManager
    - Изменить состояние окна (setBounds, maximize)
    - Триггернуть события (resize, move, maximize)
    - Проверить, что DataManager.set вызван с новым состоянием
    - **Property 6: Изменения состояния окна сохраняются**
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

- [x] 5. Checkpoint - Убедиться, что все модульные тесты проходят
  - Запустить `npm run test:unit`
  - Убедиться, что все тесты проходят без ошибок
  - Если есть ошибки, исправить их перед продолжением

- [x] 6. Написать функциональные тесты для window state persistence
  - [x] 6.1 Функциональный тест: should open application with correct initial window state
    - Запустить приложение с чистой базой данных
    - Проверить размер окна: min(600, screenWidth) x min(400, screenHeight)
    - Проверить, что окно НЕ в maximized состоянии
    - Проверить пустой заголовок (title: '')
    - Проверить, что НЕ в fullscreen режиме
    - _Requirements: window-management.1.1, window-management.1.2, window-management.2.1, window-management.4.1, window-management.4.2, window-management.4.4_

  - [x] 6.2 Функциональный тест: should persist window state across restarts
    - Запустить приложение
    - Изменить размер окна (setBounds)
    - Переместить окно
    - Закрыть приложение
    - Запустить приложение снова
    - Проверить, что размер и позиция восстановлены
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.4_

  - [x] 6.3 Функциональный тест: should persist maximized state across restarts
    - Запустить приложение
    - Развернуть окно (maximize)
    - Закрыть приложение
    - Запустить приложение снова
    - Проверить, что окно в maximized состоянии
    - _Requirements: window-management.5.3, window-management.5.4_

  - [x] 6.4 Функциональный тест: should adapt window size to small screens
    - Эмулировать маленький экран (например, 1366x768)
    - Запустить приложение
    - Проверить, что размер окна не превышает размер экрана
    - Проверить, что размеры не хардкожены
    - _Requirements: window-management.4.1, window-management.4.4_

  - [x] 6.5 Функциональный тест: should have empty window title
    - Запустить приложение
    - Проверить, что title пустой
    - _Requirements: window-management.2.1, window-management.2.2_

  - [x] 6.6 Функциональный тест: should have native Mac OS X window controls
    - Запустить приложение
    - Проверить наличие стандартных элементов управления macOS
    - Проверить, что окно closable, minimizable, maximizable, resizable
    - _Requirements: window-management.3.1, window-management.3.2_

  - [x] 6.7 Функциональный тест: should follow Mac OS X window close conventions
    - Запустить приложение
    - Закрыть окно
    - Проверить поведение приложения согласно конвенциям macOS
    - _Requirements: window-management.3.3_

  - [x] 6.8 Функциональный тест: should integrate with Mac OS X dock
    - Запустить приложение
    - Проверить интеграцию с dock
    - Проверить активацию приложения
    - _Requirements: window-management.3.5_

- [x] 7. Обновить документацию и провести финальную валидацию
  - [x] 7.1 Обновить JSDoc комментарии
    - Документировать все публичные методы WindowStateManager
    - Обновить документацию WindowManager
    - Указать ссылки на требования в комментариях (формат: Requirements: window-management.X.Y)
    - _Requirements: window-management.1, window-management.2, window-management.3, window-management.4, window-management.5_

  - [x] 7.2 Обновить таблицу покрытия требований в design.md
    - Убедиться, что все требования покрыты тестами
    - Обновить таблицу покрытия при необходимости
    - _Requirements: Все_

  - [x] 7.3 Запустить автоматическую валидацию
    - Выполнить `npm run validate`
    - Исправить все ошибки TypeScript, ESLint, Prettier
    - Убедиться, что все модульные тесты проходят
    - Убедиться, что покрытие кода >= 85%
    - _Requirements: Все_

- [x] 8. Checkpoint - Финальная проверка
  - Убедиться, что все модульные тесты проходят
  - Убедиться, что покрытие кода >= 85%
  - Спросить пользователя: "Задача выполнена. Запустить функциональные тесты? (они покажут окна на экране)"

---

## 9. Рефакторинг: DataManager → DatabaseManager

### Обзор

В рамках рефакторинга системы хранения данных (см. `docs/specs/database-refactoring/tasks.md`), необходимо обновить WindowStateManager для использования DatabaseManager вместо DataManager.

**ВАЖНО:** WindowStateManager является ИСКЛЮЧЕНИЕМ из правила изоляции данных по user_id. Состояние окна является глобальным для устройства, а не для пользователя.

**Статус:** ✅ Выполнено

### 9.1 Обновить WindowStateManager
- [x] Обновить `src/main/WindowStateManager.ts`:
  - Заменить `DataManager` на `DatabaseManager` в конструкторе
  - Использовать `dbManager.getRow()` и `dbManager.runQuery()` для глобальных запросов
  - НЕ использовать методы с user_id — состояние окна глобальное
  - Обновить импорты
  - Обновить комментарии с Requirements
- _Requirements: window-management.5.7, user-data-isolation.6.8_

### 9.2 Обновить тесты WindowStateManager
- [x] Обновить `tests/unit/WindowStateManager.test.ts`:
  - Заменить моки DataManager на DatabaseManager
  - Убедиться, что тесты НЕ проверяют user_id фильтрацию
  - Обновить описания тестов
- [x] Обновить `tests/property/WindowStateManager.property.test.ts`:
  - Заменить моки DataManager на DatabaseManager
- _Requirements: window-management.5, user-data-isolation.6.8_

### 9.3 Обновить WindowManager
- [x] Обновить `src/main/WindowManager.ts`:
  - Обновить создание WindowStateManager с DatabaseManager
  - Обновить импорты
- _Requirements: window-management.5_

### 9.4 Валидация
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят
- _Requirements: window-management.5_

### Примечания

- WindowStateManager использует глобальные методы DatabaseManager (`getRow()`, `runQuery()`)
- WindowStateManager НЕ использует методы с user_id — состояние окна глобальное
- Состояние окна (размер, позиция, maximized) одинаково для всех пользователей на устройстве
- При смене пользователя окно сохраняет свое положение

---

## 10. Рефакторинг: Миграция на Drizzle ORM

### Обзор

В рамках миграции на Drizzle ORM (см. `docs/specs/user-data-isolation/requirements.md`), WindowStateManager обновлен для использования репозиториев вместо raw SQL.

**ВАЖНО:** WindowStateManager использует `dbManager.global.windowState` репозиторий для глобальных данных (не изолированных по user_id).

**Статус:** ✅ Выполнено

### 10.1 Обновить WindowStateManager на репозитории
- [x] Обновить `src/main/WindowStateManager.ts`:
  - Заменить `dbManager.getRow()` на `dbManager.global.windowState.get()`
  - Заменить `dbManager.runQuery()` на `dbManager.global.windowState.set()`
  - Удалить raw SQL запросы
  - Обновить комментарии с Requirements (добавить user-data-isolation.6.8)
- _Requirements: user-data-isolation.6.8, user-data-isolation.7.8_

### 10.2 Обновить тесты WindowStateManager
- [x] Обновить `tests/unit/WindowStateManager.test.ts`:
  - Заменить моки `mockDbManager.getRow` на `mockGlobalWindowState.get`
  - Заменить моки `mockDbManager.runQuery` на `mockGlobalWindowState.set`
  - Добавить `mockGlobalWindowState` в beforeEach
- _Requirements: user-data-isolation.6.8_

### 10.3 Валидация
- [x] Выполнить `npm run test:unit -- tests/unit/WindowStateManager.test.ts`
- [x] Убедиться, что все тесты проходят
- _Requirements: user-data-isolation.6.8_

### Примечания

- WindowStateManager теперь использует `dbManager.global.windowState` репозиторий
- Репозиторий автоматически сериализует/десериализует WindowState объект
- Нет необходимости в ручном JSON.parse/JSON.stringify
- Состояние окна остается глобальным (не изолированным по user_id)

---

## Примечания

- Задачи, помеченные `*`, являются опциональными (тесты) и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Функциональные тесты (раздел 6) запускаются ТОЛЬКО при явной просьбе пользователя
- Автоматическая валидация (задача 7.3) НЕ включает функциональные тесты
- Все комментарии в коде должны быть на английском языке
- Все названия компонентов должны быть на английском языке
- Checkpoint задачи помогают проверить прогресс на ключевых этапах
