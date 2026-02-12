# Список Задач: Управление Окнами

## Обзор

Данный документ содержит список задач для реализации функциональности управления главным окном приложения Clerkly, включая конфигурацию окна при запуске, сохранение состояния и интеграцию с нативными элементами macOS.

## Задачи

- [x] 1. Создать WindowStateManager и интегрировать с WindowManager
  - [x] 1.1 Создать интерфейс WindowState и класс WindowStateManager
    - Определить типы для x, y, width, height, isMaximized
    - Реализовать конструктор с зависимостью от DataManager
    - Добавить JSDoc комментарии
    - _Requirements: window-management.5_

  - [x] 1.2 Реализовать методы управления состоянием
    - Реализовать loadState() с валидацией позиции
    - Реализовать saveState() с обработкой ошибок
    - Реализовать getDefaultState() на основе workAreaSize
    - Реализовать isPositionValid() для проверки позиции
    - _Requirements: window-management.1.1, window-management.4.1, window-management.5.1, window-management.5.2, window-management.5.3, window-management.5.4, window-management.5.5, window-management.5.6_

  - [x] 1.3 Расширить WindowManager для использования WindowStateManager
    - Добавить зависимость от WindowStateManager
    - Обновить createWindow() для загрузки и применения состояния
    - Установить title: '', titleBarStyle: 'default', resizable: true
    - Реализовать setupStateTracking() для отслеживания событий
    - Реализовать saveCurrentState() для автосохранения
    - _Requirements: window-management.1.1, window-management.1.2, window-management.1.3, window-management.2.1, window-management.3.1, window-management.5_

  - [x] 1.4 Написать модульные тесты для WindowStateManager
    - Тест: should return default state when no saved state exists
    - Тест: should load saved state from database
    - Тест: should return default state for invalid position
    - Тест: should save state to database
    - Тест: should handle save errors gracefully
    - Тест: should handle corrupted state data
    - _Requirements: window-management.1.1, window-management.4.1, window-management.5_

  - [x] 1.5 Написать модульные тесты для WindowManager
    - Тест: should create window with correct initial configuration
    - Тест: should save state when window is resized
    - Тест: should save maximized state
    - Тест: should handle window creation errors
    - _Requirements: window-management.1, window-management.2, window-management.3, window-management.5_

- [x] 2. Написать property-based тесты для WindowStateManager
  - [x] 2.1 Property test: should generate default state based on screen size
    - Использовать fast-check для генерации различных размеров экрана
    - Проверить, что размеры пропорциональны размеру экрана
    - Проверить, что размеры не хардкожены
    - Минимум 100 итераций
    - **Property 5: Размер окна основан на размере экрана**
    - _Requirements: window-management.4.1, window-management.4.3_

  - [x] 2.2 Property test: should preserve state through save/load cycle
    - Использовать fast-check для генерации различных WindowState
    - Проверить round-trip: save → load → verify equivalence
    - Минимум 100 итераций
    - **Property 7: Round-trip сохранения и загрузки состояния**
    - _Requirements: window-management.5.4_

  - [x] 2.3 Property test: should save state on any window state change
    - Использовать fast-check для генерации различных WindowState
    - Проверить, что все изменения состояния сохраняются
    - Минимум 100 итераций
    - **Property 6: Изменения состояния окна сохраняются**
    - _Requirements: window-management.5.1, window-management.5.2, window-management.5.3_

- [x] 3. Написать функциональные тесты для window state persistence
  - [x] 3.1 Функциональный тест: should open at default size on first launch
    - Запустить приложение с чистой базой данных
    - Проверить, что окно открывается размером workAreaSize
    - Проверить, что окно НЕ в maximized состоянии
    - _Requirements: window-management.1.1, window-management.4.1_

  - [x] 3.2 Функциональный тест: should persist window size across restarts
    - Изменить размер окна
    - Перезапустить приложение
    - Проверить, что размер восстановлен
    - _Requirements: window-management.5.1, window-management.5.4_

  - [x] 3.3 Функциональный тест: should persist window position across restarts
    - Переместить окно
    - Перезапустить приложение
    - Проверить, что позиция восстановлена
    - _Requirements: window-management.5.2, window-management.5.4_

  - [x] 3.4 Функциональный тест: should persist maximized state across restarts
    - Развернуть окно (maximize)
    - Перезапустить приложение
    - Проверить, что окно в maximized состоянии
    - _Requirements: window-management.5.3, window-management.5.4_

  - [x] 3.5 Функциональный тест: should have empty window title
    - Запустить приложение
    - Проверить, что title пустой
    - _Requirements: window-management.2.1, window-management.2.2_

  - [x] 3.6 Функциональный тест: should have native Mac OS X window controls
    - Запустить приложение
    - Проверить наличие стандартных элементов управления macOS
    - Проверить, что окно closable, minimizable, maximizable, resizable
    - _Requirements: window-management.3.1, window-management.3.2_

  - [x] 3.7 Функциональный тест: should follow Mac OS X window close conventions
    - Закрыть окно
    - Проверить поведение приложения согласно конвенциям macOS
    - _Requirements: window-management.3.3_

  - [x] 3.8 Функциональный тест: should integrate with Mac OS X dock
    - Проверить интеграцию с dock
    - Проверить активацию приложения
    - _Requirements: window-management.3.5_

- [x] 4. Обновить документацию и провести валидацию
  - [x] 4.1 Добавить JSDoc комментарии
    - Документировать все публичные методы WindowStateManager
    - Обновить документацию WindowManager
    - Указать ссылки на требования в комментариях
    - _Requirements: window-management.1, window-management.2, window-management.3, window-management.4, window-management.5_

  - [x] 4.2 Запустить автоматическую валидацию
    - Выполнить `npm run validate`
    - Исправить все ошибки TypeScript, ESLint, Prettier
    - Убедиться, что все модульные и property-based тесты проходят
    - _Requirements: Все_

  - [x] 4.3 Проверить покрытие тестами
    - Убедиться, что покрытие >= 85%
    - Убедиться, что все требования покрыты тестами
    - Обновить таблицу покрытия в design.md при необходимости
    - _Requirements: Все_

## Примечания

- Задачи, помеченные `*`, являются опциональными (тесты) и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Функциональные тесты (раздел 3) запускаются ТОЛЬКО при явной просьбе пользователя
- Автоматическая валидация (задача 4.2) НЕ включает функциональные тесты
- Все комментарии в коде должны быть на английском языке
- Все названия компонентов должны быть на английском языке
