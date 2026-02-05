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
  - Использовать workAreaSize (полный размер доступного экрана)
  - Устанавливать isMaximized: false (окно не максимизировано, но занимает весь экран)
  - Устанавливать позицию x: 0, y: 0
  - **Requirements:** ui.1.1, ui.1.3, ui.4.1, ui.4.2, ui.4.3

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
  - Устанавливать resizable: true
  - Применять загруженные x, y, width, height
  - Вызывать maximize() ТОЛЬКО если isMaximized === true (восстановление сохраненного состояния)
  - НЕ вызывать maximize() при первом запуске (isMaximized: false по умолчанию)
  - Вызывать setupStateTracking() после создания окна
  - **Requirements:** ui.1.1, ui.1.2, ui.1.3, ui.2.1, ui.3.1, ui.4.1, ui.4.2, ui.5.4, ui.5.5

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
  - Проверить isMaximized: false (не максимизировано по умолчанию)
  - Проверить, что размеры равны workAreaSize
  - **Requirements:** ui.1.1, ui.1.3, ui.4.1, ui.5.5

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
  - Проверить, что окно НЕ в состоянии maximized (isMaximized: false)
  - Проверить, что окно занимает весь экран (размер = workAreaSize)
  - Проверить, что окно resizable (можно изменять размер)
  - Проверить, что title пустой
  - Проверить, что не в fullscreen режиме
  - Закрыть приложение
  - **Requirements:** ui.1.1, ui.1.2, ui.1.3, ui.2.1, ui.3.1

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


## Фаза 3: Блок Account (Профиль Пользователя)

### 10. Создание UserProfileManager

- [ ] 10.1 Создать интерфейс UserProfile
  - Определить структуру данных профиля (id, email, name, given_name, family_name, locale, etc.)
  - Добавить поле lastUpdated для отслеживания времени обновления
  - **Requirements:** ui.6.2, ui.6.3

- [ ] 10.2 Создать класс UserProfileManager
  - Реализовать метод `fetchProfile()` для запроса данных из Google UserInfo API
  - Реализовать метод `saveProfile()` для сохранения в DataManager
  - Реализовать метод `loadProfile()` для загрузки из DataManager
  - Реализовать метод `clearProfile()` для очистки данных
  - Реализовать метод `updateProfileAfterTokenRefresh()` для автоматического обновления
  - **Requirements:** ui.6.2, ui.6.5, ui.6.6, ui.6.7, ui.6.8

- [ ] 10.3 Интегрировать UserProfileManager с OAuthClientManager и LifecycleManager
  - Добавить вызов `updateProfileAfterTokenRefresh()` в метод `refreshAccessToken()`
  - Добавить вызов `fetchProfile()` в метод `LifecycleManager.initialize()` при авторизованном пользователе
  - Передать OAuthClientManager в конструктор UserProfileManager
  - **Requirements:** ui.6.5

### 11. Расширение IPC Handlers

- [ ] 11.1 Добавить IPC handler для получения профиля
  - Реализовать `auth:get-profile` handler
  - Возвращать кэшированные данные из DataManager
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** ui.6.2, ui.6.7

- [ ] 11.2 Добавить IPC handler для обновления профиля (опционально для Варианта C)
  - Реализовать `auth:refresh-profile` handler
  - Вызывать `fetchProfile()` для получения свежих данных
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** ui.6.5

- [ ] 11.3 Расширить preload API
  - Добавить метод `window.api.auth.getProfile()`
  - Добавить метод `window.api.auth.refreshProfile()` (опционально)
  - Обновить TypeScript типы для API
  - **Requirements:** ui.6.2, ui.6.5

### 12. Создание Account Component

- [ ] 12.1 Создать React компонент Account
  - Создать файл `src/renderer/components/account.tsx`
  - Реализовать отображение пустого состояния (не авторизован)
  - Реализовать отображение данных профиля (имя, email)
  - Использовать read-only поля для данных профиля
  - **Requirements:** ui.6.1, ui.6.2, ui.6.3, ui.6.4

- [ ] 12.2 Добавить загрузку профиля при монтировании компонента
  - Вызывать `window.api.auth.getProfile()` в useEffect
  - Обрабатывать состояние загрузки
  - Обрабатывать ошибки загрузки
  - **Requirements:** ui.6.2, ui.6.7

- [ ] 12.3 Добавить слушатель события auth:success
  - Автоматически перезагружать профиль после успешной авторизации
  - Обновлять UI с новыми данными
  - **Requirements:** ui.6.2

- [ ] 12.4 Добавить очистку профиля при logout
  - Слушать событие logout
  - Очищать состояние компонента
  - Возвращаться к пустому состоянию
  - **Requirements:** ui.6.8

### 13. Стилизация Account Component

- [ ] 13.1 Создать стили для Account блока
  - Добавить стили для пустого состояния
  - Добавить стили для полей профиля (read-only)
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** ui.6.1, ui.6.3, ui.6.4

- [ ] 13.2 Интегрировать с существующей темой
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю приложения
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** ui.6.3

### 14. Модульные Тесты для UserProfileManager

- [ ] 14.1 Тест: fetchProfile() успешно получает данные из Google API
  - Мокировать fetch для UserInfo API
  - Мокировать OAuthClientManager.getTokens()
  - Проверить корректность запроса (URL, headers)
  - Проверить сохранение данных через DataManager
  - **Requirements:** ui.6.2, ui.6.6

- [ ] 14.2 Тест: fetchProfile() возвращает кэшированные данные при ошибке API
  - Мокировать fetch для возврата ошибки
  - Мокировать DataManager.loadData() с кэшированными данными
  - Проверить, что возвращаются кэшированные данные
  - **Requirements:** ui.6.7

- [ ] 14.3 Тест: fetchProfile() возвращает null если нет токенов
  - Мокировать OAuthClientManager.getTokens() для возврата null
  - Проверить, что метод возвращает null
  - Проверить, что API запрос не выполняется
  - **Requirements:** ui.6.1

- [ ] 14.4 Тест: saveProfile() корректно сохраняет данные
  - Создать тестовый профиль
  - Вызвать saveProfile()
  - Проверить вызов DataManager.saveData() с правильными параметрами
  - **Requirements:** ui.6.2

- [ ] 14.5 Тест: loadProfile() корректно загружает данные
  - Мокировать DataManager.loadData()
  - Вызвать loadProfile()
  - Проверить корректность возвращаемых данных
  - **Requirements:** ui.6.7

- [ ] 14.6 Тест: clearProfile() удаляет данные
  - Вызвать clearProfile()
  - Проверить вызов DataManager.deleteData() с ключом 'user_profile'
  - **Requirements:** ui.6.8

- [ ] 14.7 Тест: updateProfileAfterTokenRefresh() вызывает fetchProfile()
  - Мокировать fetchProfile()
  - Вызвать updateProfileAfterTokenRefresh()
  - Проверить, что fetchProfile() был вызван
  - **Requirements:** ui.6.5

### 15. Модульные Тесты для IPC Handlers

- [ ] 15.1 Тест: auth:get-profile возвращает профиль
  - Мокировать UserProfileManager.loadProfile()
  - Вызвать IPC handler
  - Проверить структуру ответа
  - **Requirements:** ui.6.2

- [ ] 15.2 Тест: auth:get-profile обрабатывает ошибки
  - Мокировать UserProfileManager.loadProfile() для выброса ошибки
  - Вызвать IPC handler
  - Проверить, что возвращается ошибка
  - **Requirements:** ui.6.7

- [ ] 15.3 Тест: auth:refresh-profile обновляет профиль
  - Мокировать UserProfileManager.fetchProfile()
  - Вызвать IPC handler
  - Проверить, что fetchProfile() был вызван
  - Проверить структуру ответа
  - **Requirements:** ui.6.5

### 16. Модульные Тесты для Account Component

- [ ] 16.1 Тест: отображает пустое состояние когда не авторизован
  - Мокировать window.api.auth.getProfile() для возврата null
  - Рендерить компонент
  - Проверить отображение "Not signed in"
  - **Requirements:** ui.6.1

- [ ] 16.2 Тест: отображает данные профиля после авторизации
  - Мокировать window.api.auth.getProfile() с тестовыми данными
  - Рендерить компонент
  - Проверить отображение имени, email
  - **Requirements:** ui.6.2, ui.6.3

- [ ] 16.3 Тест: поля профиля read-only
  - Рендерить компонент с данными профиля
  - Проверить, что input поля имеют атрибут readOnly
  - Попытаться изменить значение
  - Проверить, что значение не изменилось
  - **Requirements:** ui.6.4

- [ ] 16.4 Тест: перезагружает профиль при событии auth:success
  - Мокировать window.api.auth.onAuthSuccess()
  - Рендерить компонент
  - Триггернуть событие auth:success
  - Проверить, что getProfile() вызван повторно
  - **Requirements:** ui.6.2

- [ ] 16.5 Тест: очищает профиль при logout
  - Рендерить компонент с данными профиля
  - Триггернуть logout
  - Проверить, что компонент вернулся к пустому состоянию
  - **Requirements:** ui.6.8

### 17. Интеграционные Тесты

- [ ] 17.1 Тест: полный цикл авторизации и загрузки профиля
  - Создать реальный OAuthClientManager и UserProfileManager
  - Мокировать Google OAuth API и UserInfo API
  - Выполнить авторизацию
  - Проверить, что профиль автоматически загружен
  - Проверить, что данные сохранены в DataManager
  - **Requirements:** ui.6.2, ui.6.6

- [ ] 17.2 Тест: автоматическое обновление профиля при refresh token
  - Создать реальный OAuthClientManager и UserProfileManager
  - Мокировать токены с истекшим access token
  - Вызвать getAuthStatus() для триггера refresh
  - Проверить, что профиль автоматически обновлен
  - **Requirements:** ui.6.5

- [ ] 17.3 Тест: автоматическое обновление профиля при запуске приложения
  - Создать реальный LifecycleManager и UserProfileManager
  - Мокировать авторизованное состояние
  - Вызвать initialize()
  - Проверить, что профиль автоматически загружен
  - **Requirements:** ui.6.5

- [ ] 17.4 Тест: кэширование профиля при ошибке API
  - Создать реальный UserProfileManager
  - Сохранить тестовый профиль в DataManager
  - Мокировать UserInfo API для возврата ошибки
  - Вызвать fetchProfile()
  - Проверить, что возвращены кэшированные данные
  - **Requirements:** ui.6.7

### 18. Функциональные Тесты

- [ ] 18.1 Функциональный тест: should show empty profile when not authenticated
  - Запустить приложение без авторизации
  - Открыть Account блок
  - Проверить отображение пустого состояния
  - Закрыть приложение
  - **Requirements:** ui.6.1

- [ ] 18.2 Функциональный тест: should populate profile data after Google OAuth login
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth
  - Проверить, что Account блок заполнен данными профиля
  - Проверить отображение имени, email
  - Закрыть приложение
  - **Requirements:** ui.6.2, ui.6.3

- [ ] 18.3 Функциональный тест: should not allow editing profile fields
  - Запустить приложение с авторизацией
  - Открыть Account блок
  - Попытаться изменить поля профиля
  - Проверить, что поля read-only
  - Закрыть приложение
  - **Requirements:** ui.6.4

- [ ] 18.4 Функциональный тест: should update profile data when changed in Google
  - Запустить приложение с авторизацией
  - Изменить данные профиля в Google (эмулировать через mock)
  - Подождать обновления токена или триггернуть вручную
  - Проверить, что данные в Account блоке обновились
  - Закрыть приложение
  - **Requirements:** ui.6.5

- [ ] 18.5 Функциональный тест: should clear profile data on logout
  - Запустить приложение с авторизацией
  - Проверить, что Account блок заполнен
  - Выполнить logout
  - Проверить, что Account блок очищен
  - Закрыть приложение
  - **Requirements:** ui.6.8

### 19. Обновление Документации

- [ ] 19.1 Добавить JSDoc комментарии к UserProfileManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.6

- [ ] 19.2 Добавить JSDoc комментарии к IPC handlers профиля
  - Документировать новые handlers
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.6

- [ ] 19.3 Обновить таблицу покрытия требований в design.md
  - Добавить новые требования ui.6.x
  - Указать покрытие модульными, property-based и функциональными тестами
  - **Requirements:** ui.6

### 20. Валидация и Финализация

- [ ] 20.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.6

- [ ] 20.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.6.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.6

- [ ] 20.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.6
