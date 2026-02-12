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
    - Вычислять размер окна: min(600, screenWidth) x min(400, screenHeight)
    - Центрировать окно на экране
    - Устанавливать isMaximized: false (окно НЕ максимизировано по умолчанию)
    - _Requirements: window-management.1.1, window-management.4.1, window-management.4.2, window-management.4.4_

  - [x] 1.6 Реализовать метод isPositionValid()
    - Получать список всех дисплеев через screen.getAllDisplays()
    - Проверять, что позиция (x, y) находится в пределах хотя бы одного дисплея
    - Возвращать boolean результат
    - _Requirements: window-management.5.6_

  - [x] 1.7 Написать модульные тесты для WindowStateManager
    - Тест: should return default state when no saved state exists (компактный размер 600x400)
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

- [x] 4. Написать property-based тесты для WindowStateManager
  - [x] 4.1 Property test: Размер окна адаптируется к экрану
    - Использовать fast-check для генерации различных размеров экрана (800-3840 x 600-2160)
    - Вызывать getDefaultState() с мокированным screen API
    - Проверить, что размеры <= размера экрана
    - Проверить, что размеры > 0
    - Проверить, что размеры не хардкожены (не всегда 600x400)
    - Минимум 100 итераций
    - **Property 5: Размер окна адаптируется к экрану при первом запуске**
    - _Requirements: window-management.4.1, window-management.4.2_

  - [x] 4.2 Property test: Round-trip сохранения и загрузки состояния
    - Использовать fast-check для генерации различных WindowState
    - Мокировать screen API для валидации позиции
    - Вызывать saveState(), затем loadState()
    - Проверить эквивалентность загруженного и сохраненного состояния
    - Минимум 100 итераций
    - **Property 7: Round-trip сохранения и загрузки состояния**
    - _Requirements: window-management.5.4_

  - [x] 4.3 Property test: Изменения состояния окна сохраняются
    - Использовать fast-check для генерации различных WindowState
    - Создать окно через WindowManager
    - Изменить состояние окна (setBounds, maximize)
    - Триггернуть события (resize, move, maximize)
    - Проверить, что DataManager.set вызван с новым состоянием
    - Минимум 100 итераций
    - **Property 6: Изменения состояния окна сохраняются**
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

- [x] 5. Checkpoint - Убедиться, что все property-based тесты проходят
  - Запустить `npm run test:property`
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
    - Убедиться, что все модульные и property-based тесты проходят
    - Убедиться, что покрытие кода >= 85%
    - _Requirements: Все_

- [x] 8. Checkpoint - Финальная проверка
  - Убедиться, что все модульные и property-based тесты проходят
  - Убедиться, что покрытие кода >= 85%
  - Спросить пользователя: "Задача выполнена. Запустить функциональные тесты? (они покажут окна на экране)"

## Примечания

- Задачи, помеченные `*`, являются опциональными (тесты) и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Функциональные тесты (раздел 6) запускаются ТОЛЬКО при явной просьбе пользователя
- Автоматическая валидация (задача 7.3) НЕ включает функциональные тесты
- Все комментарии в коде должны быть на английском языке
- Все названия компонентов должны быть на английском языке
- Checkpoint задачи помогают проверить прогресс на ключевых этапах
