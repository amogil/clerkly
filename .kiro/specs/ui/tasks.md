# Список Задач: UI Приложения

## Обзор

Данный документ содержит список задач для реализации функциональности управления UI приложения Clerkly, включая конфигурацию главного окна, сохранение состояния и интеграцию с нативными элементами macOS.

## Задачи

### 1. Создание WindowStateManager

- [x] 1.1 Создать интерфейс WindowState
  - Определить типы для x, y, width, height, isMaximized
  - Добавить JSDoc комментарии для каждого поля
  - **Requirements:** ui.5

- [x] 1.2 Создать класс WindowStateManager
  - Реализовать конструктор с зависимостью от DataManager
  - Определить константу stateKey = 'window_state'
  - **Requirements:** ui.5

- [x] 1.3 Реализовать метод loadState()
  - Загружать состояние из DataManager
  - Парсить JSON в объект WindowState
  - Валидировать позицию через isPositionValid()
  - Возвращать getDefaultState() при ошибках или невалидной позиции
  - Логировать ошибки
  - **Requirements:** ui.5.4, ui.5.5, ui.5.6

- [x] 1.4 Реализовать метод saveState()
  - Сериализовать WindowState в JSON
  - Сохранять через DataManager.set()
  - Обрабатывать ошибки gracefully
  - Логировать ошибки
  - **Requirements:** ui.5.1, ui.5.2, ui.5.3

- [x] 1.5 Реализовать метод getDefaultState()
  - Получать размер экрана через screen.getPrimaryDisplay()
  - Вычислять размеры как 90% от размера экрана
  - Устанавливать isMaximized: true
  - Вычислять позицию с отступом 5%
  - **Requirements:** ui.1.1, ui.4.1, ui.4.2, ui.4.3

- [x] 1.6 Реализовать метод isPositionValid()
  - Получать список всех дисплеев через screen.getAllDisplays()
  - Проверять, находится ли позиция в пределах хотя бы одного дисплея
  - Возвращать boolean результат
  - **Requirements:** ui.5.6

### 2. Расширение WindowManager

- [x] 2.1 Добавить зависимость от WindowStateManager
  - Добавить приватное поле windowStateManager
  - Инициализировать в конструкторе с DataManager
  - **Requirements:** ui.5

- [x] 2.2 Обновить метод createWindow()
  - Загружать состояние через windowStateManager.loadState()
  - Устанавливать title: '' в конфигурации
  - Устанавливать titleBarStyle: 'default'
  - Применять загруженные x, y, width, height
  - Вызывать maximize() если isMaximized === true
  - Вызывать setupStateTracking() после создания окна
  - **Requirements:** ui.1.1, ui.1.2, ui.2.1, ui.3.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5

- [x] 2.3 Реализовать метод setupStateTracking()
  - Подписаться на событие 'resize'
  - Подписаться на событие 'move'
  - Подписаться на событие 'maximize'
  - Подписаться на событие 'unmaximize'
  - Подписаться на событие 'close'
  - Вызывать saveCurrentState() для каждого события
  - **Requirements:** ui.5.1, ui.5.2, ui.5.3

- [x] 2.4 Реализовать метод saveCurrentState()
  - Получать текущие bounds через getBounds()
  - Получать состояние maximized через isMaximized()
  - Формировать объект WindowState
  - Вызывать windowStateManager.saveState()
  - **Requirements:** ui.5.1, ui.5.2, ui.5.3

### 3. Модульные Тесты для WindowStateManager

- [x] 3.1 Написать тест: should return default state when no saved state exists
  - Mock DataManager.get() возвращает undefined
  - Вызвать loadState()
  - Проверить, что возвращается состояние по умолчанию
  - Проверить isMaximized: true
  - Проверить, что размеры основаны на размере экрана
  - **Requirements:** ui.4.1, ui.5.5

- [x] 3.2 Написать тест: should load saved state from database
  - Mock DataManager.get() возвращает валидный JSON
  - Mock screen API для валидации позиции
  - Вызвать loadState()
  - Проверить, что возвращается сохраненное состояние
  - **Requirements:** ui.5.4

- [x] 3.3 Написать тест: should return default state for invalid position
  - Mock DataManager.get() возвращает состояние с невалидной позицией
  - Mock screen API возвращает дисплеи, не содержащие позицию
  - Вызвать loadState()
  - Проверить, что возвращается состояние по умолчанию
  - **Requirements:** ui.5.6

- [x] 3.4 Написать тест: should save state to database
  - Создать валидный объект WindowState
  - Вызвать saveState()
  - Проверить, что DataManager.set() вызван с правильными параметрами
  - Проверить, что значение является валидным JSON
  - **Requirements:** ui.5.1, ui.5.2, ui.5.3

- [x] 3.5 Написать тест: should handle save errors gracefully
  - Mock DataManager.set() выбрасывает ошибку
  - Вызвать saveState()
  - Проверить, что ошибка не пробрасывается
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.5

- [x] 3.6 Написать тест: should handle corrupted state data
  - Mock DataManager.get() возвращает невалидный JSON
  - Вызвать loadState()
  - Проверить, что возвращается состояние по умолчанию
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.5

### 4. Модульные Тесты для WindowManager

- [x] 4.1 Написать тест: should create window with correct initial configuration
  - Mock WindowStateManager.loadState()
  - Вызвать createWindow()
  - Проверить, что BrowserWindow создан с title: ''
  - Проверить titleBarStyle: 'default'
  - Проверить, что fullscreen не установлен
  - **Requirements:** ui.1, ui.2, ui.3

- [x] 4.2 Написать тест: should save state when window is resized
  - Создать окно
  - Mock DataManager.set()
  - Эмитировать событие 'resize'
  - Проверить, что saveState() вызван
  - **Requirements:** ui.5.1

- [x] 4.3 Написать тест: should save maximized state
  - Создать окно
  - Mock DataManager.set()
  - Эмитировать событие 'maximize'
  - Проверить, что saveState() вызван с isMaximized: true
  - **Requirements:** ui.5.3

- [x] 4.4 Написать тест: should handle window creation errors
  - Mock BrowserWindow конструктор выбрасывает ошибку
  - Вызвать createWindow()
  - Проверить, что ошибка пробрасывается с описательным сообщением
  - **Requirements:** ui.1

### 5. Property-Based Тесты

- [x] 5.1 Написать property-based тест: should generate default state based on screen size
  - Использовать fast-check для генерации различных размеров экрана
  - Mock screen API с сгенерированными размерами
  - Вызвать getDefaultState()
  - Проверить, что размеры пропорциональны размеру экрана
  - Проверить, что размеры не хардкожены (не 1920x1080)
  - Минимум 100 итераций
  - **Property 5**
  - **Requirements:** ui.4.1, ui.4.3

- [x] 5.2 Написать property-based тест: should preserve state through save/load cycle
  - Использовать fast-check для генерации различных WindowState
  - Mock screen API для валидации позиций
  - Сохранить состояние через saveState()
  - Загрузить состояние через loadState()
  - Проверить эквивалентность состояний
  - Минимум 100 итераций
  - **Property 7**
  - **Requirements:** ui.5.4

- [x] 5.3 Написать property-based тест: should save state on any window state change
  - Использовать fast-check для генерации различных WindowState
  - Создать окно
  - Изменить состояние окна (bounds, maximize)
  - Эмитировать события resize/move/maximize
  - Проверить, что DataManager.set() вызван с обновленным состоянием
  - Минимум 100 итераций
  - **Property 6**
  - **Requirements:** ui.5.1, ui.5.2, ui.5.3

### 6. Интеграционные Тесты

- [x] 6.1 Написать интеграционный тест: should persist and restore window state across restarts
  - Создать WindowManager с реальным DataManager
  - Создать окно
  - Изменить размер и позицию окна
  - Закрыть окно
  - Создать новый WindowManager
  - Создать новое окно
  - Проверить, что состояние восстановлено
  - **Requirements:** ui.1, ui.4, ui.5

### 7. Функциональные Тесты

- [x] 7.1 Написать функциональный тест: should open application with correct initial window state
  - Запустить приложение с чистой базой данных
  - Получить главное окно
  - Проверить, что окно в состоянии maximized
  - Проверить, что title пустой
  - Проверить, что не в fullscreen режиме
  - Закрыть приложение
  - **Requirements:** ui.1.1, ui.1.2, ui.2.1, ui.3.1

- [x] 7.2 Написать функциональный тест: should persist window state across restarts
  - Запустить приложение
  - Изменить размер и позицию окна
  - Подождать сохранения
  - Закрыть приложение
  - Запустить приложение снова
  - Проверить, что размер и позиция восстановлены
  - Закрыть приложение
  - **Requirements:** ui.5.1, ui.5.2, ui.5.4

- [x] 7.3 Написать функциональный тест: should persist maximized state across restarts
  - Запустить приложение
  - Свернуть окно (unmaximize)
  - Развернуть окно (maximize)
  - Подождать сохранения
  - Закрыть приложение
  - Запустить приложение снова
  - Проверить, что окно в состоянии maximized
  - Закрыть приложение
  - **Requirements:** ui.5.3, ui.5.4

- [x] 7.4 Написать функциональный тест: should adapt window size to small screens
  - Эмулировать маленький экран (1366x768)
  - Запустить приложение
  - Получить размеры окна
  - Проверить, что окно не превышает размер экрана
  - Проверить, что размеры не хардкожены (не 1920x1080)
  - Закрыть приложение
  - **Requirements:** ui.4.1, ui.4.4

### 8. Обновление Документации

- [x] 8.1 Добавить JSDoc комментарии к WindowStateManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.5

- [x] 8.2 Добавить JSDoc комментарии к расширениям WindowManager
  - Документировать новые методы
  - Обновить существующую документацию
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.1, ui.2, ui.3, ui.4, ui.5

### 9. Валидация и Финализация

- [x] 9.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** Все

- [x] 9.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования покрыты тестами
  - Проверить таблицу покрытия в design.md
  - **Requirements:** Все

- [x] 9.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** Все

## Примечания

- Все задачи должны выполняться последовательно в указанном порядке
- Каждая задача должна быть завершена и протестирована перед переходом к следующей
- Функциональные тесты (раздел 7) запускаются ТОЛЬКО при явной просьбе пользователя
- Автоматическая валидация (задача 9.1) НЕ включает функциональные тесты
- Все комментарии в коде должны быть на английском языке
- Все названия компонентов должны быть на английском языке
