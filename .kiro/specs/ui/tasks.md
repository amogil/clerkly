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

### 6. Функциональные Тесты (Window State)

- [x] 6.1 Написать функциональный тест: should persist and restore window state across restarts
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

- [x] 10.1 Создать интерфейс UserProfile
  - Определить структуру данных профиля (id, email, name, given_name, family_name, locale, etc.)
  - Добавить поле lastUpdated для отслеживания времени обновления
  - **Requirements:** ui.6.2, ui.6.3

- [x] 10.2 Создать класс UserProfileManager
  - Реализовать метод `fetchProfile()` для запроса данных из Google UserInfo API
  - Реализовать метод `saveProfile()` для сохранения в DataManager
  - Реализовать метод `loadProfile()` для загрузки из DataManager
  - Реализовать метод `clearProfile()` для очистки данных
  - Реализовать метод `updateProfileAfterTokenRefresh()` для автоматического обновления
  - **Requirements:** ui.6.2, ui.6.5, ui.6.6, ui.6.7, ui.6.8

- [x] 10.3 Интегрировать UserProfileManager с OAuthClientManager и LifecycleManager
  - Добавить метод `setProfileManager()` в OAuthClientManager для установки связи с UserProfileManager
  - Добавить вызов `updateProfileAfterTokenRefresh()` в метод `refreshAccessToken()` OAuthClientManager
  - Добавить инициализацию UserProfileManager в LifecycleManager конструкторе
  - Добавить вызов `fetchProfile()` в метод `LifecycleManager.initialize()` при авторизованном пользователе (проверка через `getAuthStatus()`)
  - Передать OAuthClientManager в конструктор UserProfileManager
  - Связать компоненты через `oauthClient.setProfileManager(profileManager)` в main/index.ts
  - **Requirements:** ui.6.5

### 11. Расширение IPC Handlers

- [x] 11.1 Добавить IPC handler для получения профиля
  - Реализовать `auth:get-profile` handler
  - Возвращать кэшированные данные из DataManager
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** ui.6.2, ui.6.7

- [x] 11.2 Добавить IPC handler для обновления профиля
  - Реализовать `auth:refresh-profile` handler в AuthIPCHandlers
  - Вызывать `fetchProfile()` для получения свежих данных из Google API
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** ui.6.5

- [x] 11.3 Расширить preload API
  - Добавить метод `window.api.auth.getProfile()` в preload/index.ts
  - Добавить метод `window.api.auth.refreshProfile()` в preload/index.ts
  - Обновить TypeScript типы для API в src/types/index.ts
  - **Requirements:** ui.6.2, ui.6.5

### 12. Создание Account Component

- [x] 12.1 Создать React компонент Account
  - Создать файл `src/renderer/components/account.tsx`
  - Реализовать отображение пустого состояния (не авторизован)
  - Реализовать отображение данных профиля (имя, email)
  - Использовать read-only поля для данных профиля
  - **Requirements:** ui.6.1, ui.6.2, ui.6.3, ui.6.4

- [x] 12.2 Добавить загрузку профиля при монтировании компонента
  - Вызывать `window.api.auth.getProfile()` в useEffect
  - Обрабатывать состояние загрузки
  - Обрабатывать ошибки загрузки
  - **Requirements:** ui.6.2, ui.6.7

- [x] 12.3 Добавить слушатель события auth:success
  - Автоматически перезагружать профиль после успешной авторизации
  - Обновлять UI с новыми данными
  - **Requirements:** ui.6.2

- [x] 12.4 Добавить очистку профиля при logout
  - Слушать событие logout
  - Очищать состояние компонента
  - Возвращаться к пустому состоянию
  - **Requirements:** ui.6.8

### 13. Стилизация Account Component

- [x] 13.1 Создать стили для Account блока
  - Добавить стили для пустого состояния
  - Добавить стили для полей профиля (read-only)
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** ui.6.1, ui.6.3, ui.6.4

- [x] 13.2 Интегрировать с существующей темой
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю приложения
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** ui.6.3

### 14. Модульные Тесты для UserProfileManager

- [x] 14.1 Тест: fetchProfile() успешно получает данные из Google API
  - Мокировать fetch для UserInfo API (https://www.googleapis.com/oauth2/v1/userinfo)
  - Мокировать OAuthClientManager.getAuthStatus() для возврата authorized: true и валидного accessToken
  - Вызвать fetchProfile()
  - Проверить корректность запроса (URL, Authorization header с Bearer token)
  - Проверить сохранение данных через DataManager.saveData()
  - **Requirements:** ui.6.2, ui.6.6

- [x] 14.2 Тест: fetchProfile() возвращает кэшированные данные при ошибке API
  - Мокировать fetch для возврата ошибки (network error или HTTP error)
  - Мокировать DataManager.loadProfile() с кэшированными данными
  - Вызвать fetchProfile()
  - Проверить, что возвращаются кэшированные данные из loadProfile()
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.6.7

- [x] 14.3 Тест: fetchProfile() возвращает null если нет токенов
  - Мокировать OAuthClientManager.getAuthStatus() для возврата authorized: false или null tokens
  - Вызвать fetchProfile()
  - Проверить, что метод возвращает null
  - Проверить, что API запрос не выполняется (fetch не вызывается)
  - **Requirements:** ui.6.1

- [x] 14.4 Тест: saveProfile() корректно сохраняет данные
  - Создать тестовый профиль с полями (id, email, name, etc.)
  - Вызвать saveProfile(profile)
  - Проверить вызов DataManager.saveData() с ключом 'user_profile' и правильными данными
  - **Requirements:** ui.6.2

- [x] 14.5 Тест: loadProfile() корректно загружает данные
  - Мокировать DataManager.loadData() для возврата { success: true, data: profileData }
  - Вызвать loadProfile()
  - Проверить корректность возвращаемых данных (соответствие UserProfile интерфейсу)
  - **Requirements:** ui.6.7

- [x] 14.6 Тест: clearProfile() удаляет данные
  - Вызвать clearProfile()
  - Проверить вызов DataManager.deleteData() с ключом 'user_profile'
  - Проверить, что метод не выбрасывает исключений
  - **Requirements:** ui.6.8

- [x] 14.7 Тест: updateProfileAfterTokenRefresh() вызывает fetchProfile()
  - Мокировать fetchProfile() метод
  - Вызвать updateProfileAfterTokenRefresh()
  - Проверить, что fetchProfile() был вызван один раз
  - Проверить, что метод не выбрасывает исключений
  - **Requirements:** ui.6.5

### 15. Модульные Тесты для IPC Handlers

- [x] 15.1 Тест: auth:get-profile возвращает профиль
  - Мокировать UserProfileManager.loadProfile() для возврата тестового профиля
  - Вызвать IPC handler 'auth:get-profile'
  - Проверить структуру ответа { success: true, profile: {...} }
  - Проверить, что profile содержит все необходимые поля
  - **Requirements:** ui.6.2

- [x] 15.2 Тест: auth:get-profile обрабатывает ошибки
  - Мокировать UserProfileManager.loadProfile() для выброса ошибки
  - Вызвать IPC handler 'auth:get-profile'
  - Проверить, что возвращается { success: false, error: "..." }
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.6.7

- [x] 15.3 Тест: auth:refresh-profile обновляет профиль
  - Мокировать UserProfileManager.fetchProfile() для возврата обновленного профиля
  - Вызвать IPC handler 'auth:refresh-profile'
  - Проверить, что fetchProfile() был вызван
  - Проверить структуру ответа { success: true, profile: {...} }
  - **Requirements:** ui.6.5

### 16. Модульные Тесты для Account Component

- [x] 16.1 Тест: отображает пустое состояние когда не авторизован
  - Мокировать window.api.auth.getProfile() для возврата { success: true, profile: null }
  - Рендерить компонент Account
  - Проверить отображение текста "Not signed in"
  - Проверить отсутствие полей профиля
  - **Requirements:** ui.6.1

- [x] 16.2 Тест: отображает данные профиля после авторизации
  - Мокировать window.api.auth.getProfile() с тестовыми данными профиля
  - Рендерить компонент Account
  - Проверить отображение имени (name field)
  - Проверить отображение email (email field)
  - Проверить, что значения соответствуют тестовым данным
  - **Requirements:** ui.6.2, ui.6.3

- [x] 16.3 Тест: поля профиля read-only
  - Рендерить компонент Account с данными профиля
  - Найти input поля для name и email
  - Проверить, что input поля имеют атрибут readOnly={true}
  - Попытаться изменить значение через fireEvent.change()
  - Проверить, что значение не изменилось
  - **Requirements:** ui.6.4

- [x] 16.4 Тест: перезагружает профиль при событии auth:success
  - Мокировать window.api.auth.onAuthSuccess() для регистрации callback
  - Мокировать window.api.auth.getProfile() с начальными данными
  - Рендерить компонент Account
  - Триггернуть событие auth:success через callback
  - Проверить, что getProfile() вызван повторно (второй раз)
  - **Requirements:** ui.6.2

- [x] 16.5 Тест: очищает профиль при logout
  - Рендерить компонент Account с данными профиля
  - Мокировать window.api.auth.onLogout() для регистрации callback
  - Триггернуть logout через callback
  - Проверить, что компонент вернулся к пустому состоянию (отображает "Not signed in")
  - Проверить, что поля профиля не отображаются
  - **Requirements:** ui.6.8

### 17. Функциональные Тесты (Profile Integration)

- [x] 17.1 Тест: полный цикл авторизации и загрузки профиля
  - Создать реальный OAuthClientManager и UserProfileManager с DataManager
  - Мокировать Google OAuth API и UserInfo API (https://www.googleapis.com/oauth2/v1/userinfo)
  - Выполнить авторизацию через OAuthClientManager
  - Проверить, что профиль автоматически загружен через fetchProfile()
  - Проверить, что данные сохранены в DataManager с ключом 'user_profile'
  - **Requirements:** ui.6.2, ui.6.6

- [x] 17.2 Тест: автоматическое обновление профиля при refresh token
  - Создать реальный OAuthClientManager и UserProfileManager
  - Мокировать токены с истекшим access token (expired)
  - Мокировать Google Token API для refresh
  - Мокировать Google UserInfo API
  - Вызвать refreshAccessToken() или getAuthStatus() для триггера refresh
  - Проверить, что профиль автоматически обновлен через updateProfileAfterTokenRefresh()
  - **Requirements:** ui.6.5

- [x] 17.3 Тест: автоматическое обновление профиля при запуске приложения
  - Создать реальный LifecycleManager, OAuthClientManager и UserProfileManager
  - Мокировать авторизованное состояние (getAuthStatus возвращает authorized: true)
  - Мокировать Google UserInfo API
  - Вызвать LifecycleManager.initialize()
  - Проверить, что fetchProfile() был вызван автоматически
  - Проверить, что профиль сохранен в DataManager
  - **Requirements:** ui.6.5

- [x] 17.4 Тест: кэширование профиля при ошибке API
  - Создать реальный UserProfileManager с DataManager
  - Сохранить тестовый профиль в DataManager через saveProfile()
  - Мокировать UserInfo API для возврата ошибки (network error или 500)
  - Вызвать fetchProfile()
  - Проверить, что возвращены кэшированные данные из DataManager
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.6.7

### 18. Функциональные Тесты

- [x] 18.1 Функциональный тест: should show login screen when not authenticated
  - Запустить приложение без авторизации (чистая база данных)
  - Проверить, что показывается экран логина
  - Проверить, что кнопка "Continue with Google" отображается
  - Проверить, что пользователь НЕ МОЖЕТ попасть в Settings без авторизации
  - Закрыть приложение
  - **Requirements:** ui.6.1

- [x] 18.2 Функциональный тест: should show dashboard after successful authentication
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth (с mock OAuth server)
  - Дождаться завершения авторизации
  - Проверить, что показывается Dashboard (главный экран), а не Settings или Account Block
  - Закрыть приложение
  - **Requirements:** ui.8.3
  - **Property:** 9, 26

- [x] 18.3 Функциональный тест: should load profile in background after authentication
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth
  - Проверить, что запрос к Google UserInfo API был выполнен в фоновом режиме
  - Проверить, что пользователь видит Dashboard, а не экран загрузки
  - Закрыть приложение
  - **Requirements:** ui.6.3
  - **Property:** 10

- [x] 18.4 Функциональный тест: should show cached data while loading profile
  - Запустить приложение с предварительно сохраненными данными профиля в локальной базе данных
  - Выполнить авторизацию
  - Открыть Settings → Account Block
  - Проверить, что отображаются сохраненные данные (имя, email из предыдущей сессии)
  - Дождаться завершения загрузки новых данных
  - Проверить, что данные обновились
  - Закрыть приложение
  - **Requirements:** ui.6.1
  - **Property:** 11

- [x] 18.5 Функциональный тест: should show empty fields on first authentication
  - Запустить приложение без сохраненных данных профиля в базе (первая авторизация)
  - Выполнить авторизацию
  - Открыть Settings → Account Block
  - Проверить, что поля профиля пустые (или показывается индикатор загрузки)
  - Дождаться завершения загрузки
  - Проверить, что поля заполнились данными из Google
  - Закрыть приложение
  - **Requirements:** ui.6.1
  - **Property:** 11

- [x] 18.6 Функциональный тест: should populate profile data when fetch succeeds
  - Запустить приложение с авторизацией
  - Mock Google UserInfo API для возврата тестовых данных профиля
  - Открыть Settings → Account Block
  - Дождаться завершения загрузки
  - Проверить, что Account Block заполнен данными профиля
  - Проверить отображение имени (name field с корректным значением)
  - Проверить отображение email (email field с корректным значением)
  - Проверить, что данные сохранены в базу данных
  - Закрыть приложение
  - **Requirements:** ui.6.1, ui.6.2
  - **Property:** 12, 13, 15

- [x] 18.7 Функциональный тест: should show error and keep cached data when fetch fails
  - Запустить приложение с предварительно сохраненными данными профиля в локальной базе данных
  - Mock Google UserInfo API для возврата ошибки (network error или 500)
  - Выполнить авторизацию
  - Открыть Settings → Account Block
  - Проверить, что отображается сообщение об ошибке
  - Проверить, что сохраненные данные профиля остались (имя, email из предыдущей сессии)
  - Проверить, что данные НЕ были очищены из базы данных
  - Закрыть приложение
  - **Requirements:** ui.6.1
  - **Property:** 14

- [x] 18.8 Функциональный тест: should not allow editing profile fields
  - Запустить приложение с авторизацией (предварительно сохраненные токены)
  - Открыть Account блок
  - Попытаться кликнуть на поля профиля (name, email)
  - Попытаться изменить текст в полях
  - Проверить, что поля read-only (не редактируются)
  - Закрыть приложение
  - **Requirements:** ui.6.8

- [x] 18.9 Функциональный тест: should update profile data when changed in Google
  - Запустить приложение с авторизацией
  - Проверить начальные данные профиля в Account блоке
  - Изменить данные профиля в Google (эмулировать через mock - обновить UserInfo API response)
  - Подождать обновления токена (триггернуть refresh) или триггернуть вручную через IPC
  - Проверить, что данные в Account блоке обновились на новые значения
  - Закрыть приложение
  - **Requirements:** ui.6.9

- [x] 18.10 Функциональный тест: should show login screen and clear UI on logout
  - Запустить приложение с авторизацией
  - Проверить, что Account блок заполнен данными профиля
  - Выполнить logout через UI или IPC
  - Проверить, что показывается экран логина
  - Проверить, что UI очищен (Account компонент показывает пустое состояние)
  - Проверить, что токены авторизации удалены
  - Проверить, что данные профиля СОХРАНЕНЫ в базе данных (не удалены)
  - Закрыть приложение
  - **Requirements:** ui.8.4, google-oauth-auth.15
  - **Property:** 19, 27

### 19. Обновление Документации

- [x] 19.1 Добавить JSDoc комментарии к UserProfileManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.6

- [x] 19.2 Добавить JSDoc комментарии к IPC handlers профиля
  - Документировать новые handlers
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.6

- [x] 19.3 Обновить таблицу покрытия требований в design.md
  - Добавить новые требования ui.6.x
  - Указать покрытие модульными, property-based и функциональными тестами
  - **Requirements:** ui.6

### 20. Валидация и Финализация

- [x] 20.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.6

- [x] 20.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.6.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.6

- [x] 20.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.6

## Фаза 4: Навигация и Авторизация

### 21. Создание NavigationManager

- [x] 21.1 Создать класс NavigationManager
  - Реализовать метод `checkAuthStatus()` для проверки статуса авторизации
  - Реализовать метод `redirectToLogin()` для перенаправления на экран логина
  - Реализовать метод `redirectToDashboard()` для перенаправления на Dashboard
  - Реализовать метод `initialize()` для инициализации навигации при запуске
  - Добавить зависимость от Router
  - **Requirements:** ui.8.1, ui.8.3, ui.8.4
  - **Property:** 8, 9, 24, 26, 27

- [x] 21.2 Создать класс AuthGuard
  - Реализовать метод `canActivate()` для проверки доступа к маршруту
  - Определить список защищенных маршрутов (dashboard, settings, tasks, calendar, contacts)
  - Реализовать метод `isProtectedRoute()` для проверки типа маршрута
  - Добавить зависимость от NavigationManager
  - **Requirements:** ui.8.2
  - **Property:** 25

- [x] 21.3 Интегрировать NavigationManager с OAuth events
  - Добавить слушатель события `auth:success` для перенаправления на Dashboard
  - Добавить слушатель события `auth:logout` для перенаправления на Login
  - Реализовать в App.tsx или главном компоненте приложения
  - Обеспечить очистку подписок при размонтировании
  - **Requirements:** ui.8.3, ui.8.4
  - **Property:** 26, 27

### 22. Интеграция с Router

- [x] 22.1 Настроить маршруты приложения
  - Определить публичный маршрут `/login`
  - Определить защищенные маршруты: `/dashboard`, `/settings`, `/tasks`, `/calendar`, `/contacts`
  - Интегрировать AuthGuard для защиты маршрутов
  - **Requirements:** ui.8.1, ui.8.2

- [x] 22.2 Реализовать логику перенаправления
  - При попытке доступа к защищенному маршруту без авторизации → redirect to login
  - При успешной авторизации на экране логина → redirect to dashboard
  - При logout → redirect to login
  - **Requirements:** ui.8.1, ui.8.3, ui.8.4


### 23. Модульные Тесты для NavigationManager

- [x] 23.1 Тест: checkAuthStatus() возвращает корректный статус
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: true
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается true
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: false
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается false
  - **Requirements:** ui.8.1

- [x] 23.2 Тест: redirectToLogin() перенаправляет на /login
  - Создать mock Router
  - Вызвать redirectToLogin()
  - Проверить, что router.navigate() вызван с '/login'
  - **Requirements:** ui.8.1, ui.8.4

- [x] 23.3 Тест: redirectToDashboard() перенаправляет на /dashboard
  - Создать mock Router
  - Вызвать redirectToDashboard()
  - Проверить, что router.navigate() вызван с '/dashboard'
  - **Requirements:** ui.8.3

- [x] 23.4 Тест: initialize() перенаправляет неавторизованного пользователя на login
  - Мокировать checkAuthStatus() для возврата false
  - Вызвать initialize()
  - Проверить, что redirectToLogin() был вызван
  - **Requirements:** ui.8.1

- [x] 23.5 Тест: initialize() не перенаправляет авторизованного пользователя
  - Мокировать checkAuthStatus() для возврата true
  - Мокировать router.currentRoute = '/dashboard'
  - Вызвать initialize()
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** ui.8.1

### 24. Модульные Тесты для AuthGuard

- [x] 24.1 Тест: canActivate() разрешает доступ к публичным маршрутам
  - Вызвать canActivate('/login')
  - Проверить, что возвращается true без проверки авторизации
  - **Requirements:** ui.8.1

- [x] 24.2 Тест: canActivate() блокирует доступ к защищенным маршрутам без авторизации
  - Мокировать navigationManager.checkAuthStatus() для возврата false
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается false
  - Проверить, что navigationManager.redirectToLogin() был вызван
  - **Requirements:** ui.8.2

- [x] 24.3 Тест: canActivate() разрешает доступ к защищенным маршрутам с авторизацией
  - Мокировать navigationManager.checkAuthStatus() для возврата true
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается true
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** ui.8.2

- [x] 24.4 Тест: isProtectedRoute() корректно определяет защищенные маршруты
  - Проверить, что isProtectedRoute('/login') возвращает false
  - Проверить, что isProtectedRoute('/dashboard') возвращает true
  - Проверить, что isProtectedRoute('/settings') возвращает true
  - Проверить, что isProtectedRoute('/tasks') возвращает true
  - **Requirements:** ui.8.2


### 25. Функциональные Тесты (Navigation)

- [x] 25.1 Функциональный тест: should show login screen when not authenticated
  - Запустить приложение без авторизации
  - Проверить, что показывается экран логина (/login)
  - Попытаться перейти на /dashboard
  - Проверить, что перенаправлен обратно на /login
  - Закрыть приложение
  - **Requirements:** ui.8.1, ui.8.2
  - **Property:** 8, 24, 25

- [x] 25.2 Функциональный тест: should redirect to dashboard after successful authentication
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth
  - Проверить, что автоматически перенаправлен на /dashboard
  - Проверить, что НЕ показывается экран логина
  - Закрыть приложение
  - **Requirements:** ui.8.3
  - **Property:** 9, 26

- [x] 25.3 Функциональный тест: should block access to protected routes without authentication
  - Запустить приложение без авторизации
  - Попытаться перейти на /settings
  - Проверить, что перенаправлен на /login
  - Попытаться перейти на /tasks
  - Проверить, что перенаправлен на /login
  - Попытаться перейти на /calendar
  - Проверить, что перенаправлен на /login
  - Закрыть приложение
  - **Requirements:** ui.8.2
  - **Property:** 25

- [x] 25.4 Функциональный тест: should redirect to login after logout
  - Запустить приложение с авторизацией
  - Проверить, что находимся на /dashboard или другом защищенном маршруте
  - Выполнить logout
  - Проверить, что автоматически перенаправлен на /login
  - Попытаться вернуться на /dashboard
  - Проверить, что снова перенаправлен на /login
  - Закрыть приложение
  - **Requirements:** ui.8.4
  - **Property:** 27

- [x] 25.5 Функциональный тест: should allow access to all routes when authenticated
  - Запустить приложение с авторизацией
  - Перейти на /dashboard
  - Проверить успешный доступ
  - Перейти на /settings
  - Проверить успешный доступ
  - Перейти на /tasks
  - Проверить успешный доступ
  - Закрыть приложение
  - **Requirements:** ui.8.2

### 26. Обновление Документации (Navigation)

- [x] 26.1 Добавить JSDoc комментарии к NavigationManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.8

- [x] 26.2 Добавить JSDoc комментарии к AuthGuard
  - Документировать все публичные методы
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.8

- [x] 26.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.8.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.8

### 27. Валидация и Финализация (Navigation)

- [x] 27.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.8

- [x] 27.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.8.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.8

- [x] 27.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.8


## Фаза 5: Обработка Ошибок и Уведомления

### 28. Создание ErrorNotificationManager

- [x] 28.1 Создать интерфейс ErrorNotification
  - Определить структуру уведомления (id, message, context, timestamp)
  - Добавить JSDoc комментарии для каждого поля
  - **Requirements:** ui.7.2

- [x] 28.2 Создать класс ErrorNotificationManager
  - Реализовать метод `showNotification()` для отображения уведомления
  - Реализовать метод `dismissNotification()` для закрытия уведомления
  - Реализовать метод `subscribe()` для подписки на изменения
  - Добавить автоматическое закрытие через 15 секунд
  - Управлять массивом активных уведомлений
  - **Requirements:** ui.7.1, ui.7.2, ui.7.3
  - **Property:** 20, 21, 22

- [x] 28.3 Добавить IPC handler для уведомлений об ошибках
  - Реализовать событие `error:notify` в Main Process
  - Добавить метод `window.api.error.onNotify()` в preload
  - Обновить TypeScript типы для API
  - **Requirements:** ui.7.1

### 29. Создание NotificationUI Component

- [x] 29.1 Создать React компонент NotificationUI
  - Создать файл `src/renderer/components/NotificationUI.tsx`
  - Реализовать отображение списка уведомлений
  - Реализовать отображение контекста и сообщения для каждого уведомления
  - Добавить кнопку закрытия для каждого уведомления
  - Добавить обработчик клика для закрытия уведомления
  - **Requirements:** ui.7.1, ui.7.2, ui.7.3
  - **Property:** 20, 21, 22

- [x] 29.2 Интегрировать NotificationUI с ErrorNotificationManager
  - Подписаться на изменения через subscribe()
  - Обновлять состояние компонента при изменении уведомлений
  - Обеспечить очистку подписки при размонтировании
  - **Requirements:** ui.7.1

- [x] 29.3 Интегрировать с IPC events
  - Слушать событие `error:notify` из Main Process
  - Вызывать showNotification() при получении события
  - Реализовать в App.tsx или главном компоненте
  - **Requirements:** ui.7.1

### 30. Стилизация NotificationUI

- [x] 30.1 Создать стили для уведомлений
  - Добавить стили для контейнера уведомлений
  - Добавить стили для отдельного уведомления
  - Добавить стили для контекста и сообщения
  - Добавить стили для кнопки закрытия
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** ui.7.2

- [x] 30.2 Интегрировать с существующей темой
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю приложения
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** ui.7.2


### 31. Модульные Тесты для ErrorNotificationManager

- [x] 31.1 Тест: showNotification() создает уведомление с корректными данными
  - Вызвать showNotification('Error message', 'Context')
  - Проверить, что уведомление добавлено в массив notifications
  - Проверить, что уведомление содержит message, context, id, timestamp
  - Проверить, что listeners уведомлены об изменении
  - **Requirements:** ui.7.1, ui.7.2

- [x] 31.2 Тест: showNotification() автоматически закрывает уведомление через 15 секунд
  - Вызвать showNotification('Error message', 'Context')
  - Получить id уведомления
  - Подождать 15 секунд (использовать jest.useFakeTimers())
  - Проверить, что уведомление удалено из массива
  - **Requirements:** ui.7.3

- [x] 31.3 Тест: dismissNotification() удаляет уведомление
  - Создать уведомление через showNotification()
  - Получить id уведомления
  - Вызвать dismissNotification(id)
  - Проверить, что уведомление удалено из массива
  - Проверить, что listeners уведомлены об изменении
  - **Requirements:** ui.7.3

- [x] 31.4 Тест: subscribe() регистрирует listener и возвращает unsubscribe функцию
  - Создать mock listener
  - Вызвать subscribe(listener)
  - Создать уведомление
  - Проверить, что listener был вызван с массивом уведомлений
  - Вызвать unsubscribe функцию
  - Создать еще одно уведомление
  - Проверить, что listener НЕ был вызван повторно
  - **Requirements:** ui.7.1

### 32. Модульные Тесты для NotificationUI Component

- [x] 32.1 Тест: отображает список уведомлений
  - Создать mock ErrorNotificationManager с несколькими уведомлениями
  - Рендерить компонент NotificationUI
  - Проверить, что все уведомления отображаются
  - Проверить, что для каждого уведомления отображается context и message
  - **Requirements:** ui.7.1, ui.7.2

- [x] 32.2 Тест: закрывает уведомление при клике на кнопку
  - Создать mock ErrorNotificationManager с уведомлением
  - Рендерить компонент NotificationUI
  - Кликнуть на кнопку закрытия
  - Проверить, что dismissNotification() был вызван с правильным id
  - **Requirements:** ui.7.3

- [x] 32.3 Тест: закрывает уведомление при клике на само уведомление
  - Создать mock ErrorNotificationManager с уведомлением
  - Рендерить компонент NotificationUI
  - Кликнуть на уведомление
  - Проверить, что dismissNotification() был вызван с правильным id
  - **Requirements:** ui.7.3

- [x] 32.4 Тест: обновляется при изменении уведомлений
  - Создать mock ErrorNotificationManager
  - Рендерить компонент NotificationUI
  - Проверить, что subscribe() был вызван
  - Триггернуть callback с новым массивом уведомлений
  - Проверить, что компонент обновился и отображает новые уведомления
  - **Requirements:** ui.7.1

### 33. Интеграция с Main Process

- [x] 33.1 Создать централизованный обработчик ошибок в Main Process
  - Реализовать функцию `handleBackgroundError(error, context)`
  - Логировать ошибку в консоль с контекстом
  - Отправлять событие `error:notify` в Renderer Process
  - **Requirements:** ui.7.1, ui.7.4
  - **Property:** 20, 23

- [x] 33.2 Интегрировать обработчик ошибок с существующими компонентами
  - Добавить обработку ошибок в UserProfileManager.fetchProfile()
  - Добавить обработку ошибок в OAuthClientManager
  - Добавить обработку ошибок в DataManager
  - Добавить обработку ошибок в других фоновых процессах
  - **Requirements:** ui.7.1

### 34. Функциональные Тесты (Error Notifications)

- [x] 34.1 Функциональный тест: should show error notification on background process failure
  - Запустить приложение
  - Мокировать фоновый процесс (например, fetchProfile) для выброса ошибки
  - Триггернуть фоновый процесс
  - Проверить, что уведомление об ошибке отображается
  - Проверить, что уведомление содержит сообщение и контекст
  - Закрыть приложение
  - **Requirements:** ui.7.1, ui.7.2
  - **Property:** 20, 21

- [x] 34.2 Функциональный тест: should auto-dismiss error notification after 15 seconds
  - Запустить приложение
  - Триггернуть ошибку для отображения уведомления
  - Проверить, что уведомление отображается
  - Подождать 15 секунд
  - Проверить, что уведомление автоматически исчезло
  - Закрыть приложение
  - **Requirements:** ui.7.3
  - **Property:** 22

- [x] 34.3 Функциональный тест: should dismiss notification on click
  - Запустить приложение
  - Триггернуть ошибку для отображения уведомления
  - Проверить, что уведомление отображается
  - Кликнуть на уведомление
  - Проверить, что уведомление исчезло
  - Закрыть приложение
  - **Requirements:** ui.7.3
  - **Property:** 22

- [x] 34.4 Функциональный тест: should log errors to console
  - Запустить приложение с доступом к консоли
  - Триггернуть ошибку в фоновом процессе
  - Проверить, что ошибка залогирована в консоль
  - Проверить, что лог содержит контекст и сообщение об ошибке
  - Закрыть приложение
  - **Requirements:** ui.7.4
  - **Property:** 23

### 35. Обновление Документации (Error Notifications)

- [x] 35.1 Добавить JSDoc комментарии к ErrorNotificationManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.7

- [x] 35.2 Добавить JSDoc комментарии к NotificationUI
  - Документировать компонент и его props
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.7

- [x] 35.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.7.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.7

### 36. Валидация и Финализация (Error Notifications)

- [x] 36.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.7

- [x] 36.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.7.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.7

- [x] 36.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.7


## Фаза 6: Управление Токенами и Обработка Ошибок Авторизации

### 37. Централизованный Обработчик API Запросов

- [x] 37.1 Создать функцию handleAPIRequest()
  - Реализовать обертку над fetch() для всех API запросов
  - Добавить проверку HTTP 401 Unauthorized
  - При 401: очистить все токены через window.api.auth.clearTokens()
  - При 401: показать LoginError компонент с errorCode 'invalid_grant'
  - При 401: залогировать событие с контекстом (URL, timestamp)
  - Пробросить ошибку для обработки вызывающим кодом
  - **Requirements:** ui.9.3, ui.9.4, ui.9.5
  - **Property:** 29, 30, 31

- [x] 37.2 Интегрировать handleAPIRequest() с UserProfileManager
  - Заменить прямые вызовы fetch() на handleAPIRequest()
  - Обеспечить корректную обработку ошибок 401
  - Проверить, что данные профиля в базе НЕ очищаются при 401
  - **Requirements:** ui.9.3, ui.9.4

- [x] 37.3 Интегрировать handleAPIRequest() с другими API клиентами
  - Добавить в Calendar API клиент (если существует)
  - Добавить в Tasks API клиент (если существует)
  - Добавить в другие API клиенты, использующие Google APIs
  - Обеспечить единообразную обработку 401 во всех клиентах
  - **Requirements:** ui.9.3, ui.9.4

### 38. Автоматическое Обновление Токенов

- [x] 38.1 Проверить существующую реализацию refreshAccessToken()
  - Убедиться, что метод работает в фоновом режиме
  - Убедиться, что пользователь не видит прерываний
  - Убедиться, что нет уведомлений пользователю при успешном refresh
  - **Requirements:** ui.9.1, ui.9.2
  - **Property:** 28

- [x] 38.2 Добавить автоматический триггер refresh при истечении токена
  - Проверить, что getAuthStatus() автоматически обновляет токен при истечении
  - Проверить, что обновление происходит прозрачно для пользователя
  - Проверить, что профиль обновляется после refresh (через updateProfileAfterTokenRefresh)
  - **Requirements:** ui.9.1, ui.9.2

### 39. Обработка Множественных Одновременных Ошибок 401

- [x] 39.1 Добавить защиту от race conditions в handleAPIRequest()
  - Реализовать флаг или mutex для предотвращения множественных очисток токенов
  - Обеспечить, что clearTokens() вызывается только один раз при множественных 401
  - Обеспечить, что LoginError показывается только один раз
  - **Requirements:** ui.9.4
  - **Property:** 30

- [x] 39.2 Добавить тесты для одновременных запросов с 401
  - Создать сценарий с несколькими одновременными API запросами
  - Мокировать все запросы для возврата 401
  - Проверить, что clearTokens() вызван только один раз
  - Проверить, что не возникает race conditions
  - **Requirements:** ui.9.4

### 40. Модульные Тесты для handleAPIRequest()

- [x] 40.1 Тест: успешный API запрос возвращает response
  - Мокировать fetch для возврата успешного response (200)
  - Вызвать handleAPIRequest()
  - Проверить, что возвращается response
  - Проверить, что clearTokens() НЕ вызван
  - **Requirements:** ui.9.4

- [x] 40.2 Тест: HTTP 401 очищает токены и показывает LoginError
  - Мокировать fetch для возврата 401
  - Мокировать window.api.auth.clearTokens()
  - Мокировать window.api.auth.emitAuthError()
  - Вызвать handleAPIRequest()
  - Проверить, что clearTokens() был вызван
  - Проверить, что emitAuthError() был вызван с errorCode 'invalid_grant'
  - Проверить, что выброшена ошибка
  - **Requirements:** ui.9.3, ui.9.4

- [x] 40.3 Тест: HTTP 401 логирует событие с контекстом
  - Мокировать fetch для возврата 401
  - Мокировать console.error
  - Вызвать handleAPIRequest() с URL
  - Проверить, что console.error был вызван
  - Проверить, что лог содержит URL и контекст
  - **Requirements:** ui.9.5

- [x] 40.4 Тест: другие HTTP ошибки не очищают токены
  - Мокировать fetch для возврата 500
  - Мокировать window.api.auth.clearTokens()
  - Вызвать handleAPIRequest()
  - Проверить, что clearTokens() НЕ был вызван
  - Проверить, что ошибка пробрасывается
  - **Requirements:** ui.9.4


### 41. Модульные Тесты для Автоматического Обновления Токенов

- [x] 41.1 Тест: refreshAccessToken() работает в фоновом режиме
  - Мокировать Google Token API
  - Вызвать refreshAccessToken()
  - Проверить, что метод выполняется асинхронно
  - Проверить, что не показываются уведомления пользователю
  - **Requirements:** ui.9.1, ui.9.2

- [x] 41.2 Тест: getAuthStatus() автоматически обновляет истекший токен
  - Мокировать токены с истекшим access token
  - Мокировать Google Token API для refresh
  - Вызвать getAuthStatus()
  - Проверить, что refreshAccessToken() был вызван автоматически
  - Проверить, что возвращается обновленный токен
  - **Requirements:** ui.9.1

- [x] 41.3 Тест: профиль обновляется после успешного refresh
  - Мокировать истекший access token
  - Мокировать успешный refresh
  - Мокировать UserProfileManager.updateProfileAfterTokenRefresh()
  - Вызвать refreshAccessToken()
  - Проверить, что updateProfileAfterTokenRefresh() был вызван
  - **Requirements:** ui.9.2

### 42. Функциональные Тесты (Token Management)

- [x] 42.1 Функциональный тест: should automatically refresh expired access token
  - Запустить приложение с авторизацией
  - Мокировать токены с истекшим access token (expires_in в прошлом)
  - Мокировать Google Token API для успешного refresh
  - Выполнить действие, требующее API запрос (например, загрузка профиля)
  - Проверить, что токен автоматически обновлен
  - Проверить, что пользователь продолжает работу без прерываний
  - Проверить, что НЕ показывается уведомление или экран логина
  - Закрыть приложение
  - **Requirements:** ui.9.1, ui.9.2
  - **Property:** 28

- [x] 42.2 Функциональный тест: should clear session and show login on 401 error
  - Запустить приложение с авторизацией
  - Мокировать API запрос (UserInfo, Calendar, Tasks) для возврата HTTP 401
  - Выполнить действие, триггерящее API запрос
  - Проверить, что все токены очищены из хранилища
  - Проверить, что показывается LoginError компонент с errorCode 'invalid_grant'
  - Проверить, что данные профиля СОХРАНЕНЫ в базе данных (не удалены)
  - Проверить, что пользователь может повторно авторизоваться через "Continue with Google"
  - Закрыть приложение
  - **Requirements:** ui.9.3
  - **Property:** 29

- [x] 42.3 Функциональный тест: should handle 401 from any API endpoint consistently
  - Запустить приложение с авторизацией
  - Мокировать UserInfo API для возврата 401
  - Триггернуть запрос к UserInfo API
  - Проверить, что токены очищены и показан LoginError
  - Повторно авторизоваться
  - Мокировать Calendar API для возврата 401 (если существует)
  - Триггернуть запрос к Calendar API
  - Проверить, что токены очищены и показан LoginError
  - Проверить, что обработка идентична для всех API
  - Закрыть приложение
  - **Requirements:** ui.9.3, ui.9.4
  - **Property:** 29, 30

- [x] 42.4 Функциональный тест: should log authorization errors with context
  - Запустить приложение с доступом к консоли
  - Мокировать API запрос для возврата 401
  - Триггернуть API запрос
  - Проверить, что ошибка залогирована в консоль
  - Проверить, что лог содержит контекст: URL запроса, timestamp, тип ошибки
  - Проверить, что пользователю показывается только понятное сообщение (без технических деталей)
  - Закрыть приложение
  - **Requirements:** ui.9.5, ui.9.6
  - **Property:** 31

- [x] 42.5 Функциональный тест: should show user-friendly error message on session expiry
  - Запустить приложение с авторизацией
  - Мокировать API запрос для возврата 401
  - Триггернуть API запрос
  - Проверить, что показывается LoginError компонент
  - Проверить, что сообщение на английском языке (errorCode 'invalid_grant')
  - Проверить, что сообщение понятно пользователю (например, "Session expired")
  - Проверить, что НЕ показываются технические детали (stack trace, HTTP коды)
  - Закрыть приложение
  - **Requirements:** ui.9.6
  - **Property:** 31

- [x] 42.6 Функциональный тест: should handle multiple simultaneous 401 errors
  - Запустить приложение с авторизацией
  - Мокировать несколько API endpoints (UserInfo, Calendar, Tasks) для возврата 401
  - Триггернуть несколько одновременных API запросов
  - Проверить, что clearTokens() вызван только один раз
  - Проверить, что LoginError показан только один раз
  - Проверить, что не возникает race conditions или дублирования действий
  - Закрыть приложение
  - **Requirements:** ui.9.4
  - **Property:** 30

### 43. Обновление Документации (Token Management)

- [x] 43.1 Добавить JSDoc комментарии к handleAPIRequest()
  - Документировать функцию и ее параметры
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.9

- [x] 43.2 Обновить документацию OAuthClientManager
  - Документировать автоматическое обновление токенов
  - Добавить примеры обработки ошибок 401
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.9

- [x] 43.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.9.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.9

### 44. Валидация и Финализация (Token Management)

- [x] 44.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.9

- [x] 44.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.9.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.9

- [x] 44.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.9

## Финальная Валидация Всех Фаз

### 45. Комплексная Проверка

- [x] 45.1 Проверить покрытие всех требований
  - Убедиться, что все требования ui.1-ui.9 покрыты задачами
  - Убедиться, что все 31 свойство покрыты тестами
  - Проверить таблицу покрытия в design.md
  - **Requirements:** ui.1-ui.9

- [x] 45.2 Запустить полную валидацию
  - Выполнить `npm run validate`
  - Убедиться, что все проверки проходят
  - Убедиться, что покрытие >= 85%
  - **Requirements:** ui.1-ui.9

- [x] 45.3 Проверить интеграцию между фазами
  - Убедиться, что Window Management работает корректно
  - Убедиться, что Account Profile интегрирован с OAuth
  - Убедиться, что Navigation работает с авторизацией
  - Убедиться, что Error Notifications работают во всех компонентах
  - Убедиться, что Token Management работает прозрачно
  - **Requirements:** ui.1-ui.9

- [x] 45.4 Запустить функциональные тесты (при явной просьбе пользователя)
  - Запустить все функциональные тесты из фаз 1-6
  - Убедиться, что все тесты проходят
  - Исправить любые найденные проблемы
  - **Requirements:** ui.1-ui.9




## Фаза 7: Настройки AI Agent

### 46. Создание AIAgentSettingsManager

- [x] 46.1 Создать интерфейс AIAgentSettings
  - Определить структуру настроек (llmProvider, apiKeys для каждого провайдера)
  - Добавить JSDoc комментарии для каждого поля
  - **Requirements:** ui.10.1, ui.10.16

- [x] 46.2 Создать класс AIAgentSettingsManager
  - Реализовать метод `saveLLMProvider()` для сохранения выбранного провайдера
  - Реализовать метод `loadLLMProvider()` для загрузки провайдера
  - Реализовать метод `saveAPIKey()` для сохранения API ключа с шифрованием
  - Реализовать метод `loadAPIKey()` для загрузки и дешифрования API ключа
  - Реализовать метод `deleteAPIKey()` для удаления API ключа
  - Добавить зависимость от DataManager
  - **Requirements:** ui.10.9, ui.10.10, ui.10.11, ui.10.14, ui.10.15, ui.10.22

- [x] 46.3 Реализовать шифрование API ключей
  - Использовать `safeStorage.encryptString()` для шифрования
  - Проверять доступность шифрования через `safeStorage.isEncryptionAvailable()`
  - Сохранять флаг `ai_agent_api_key_{provider}_encrypted`
  - Fallback к plain text если шифрование недоступно
  - **Requirements:** ui.10.14, ui.10.15, ui.10.17

- [-] 46.4 Реализовать дешифрование API ключей
  - Использовать `safeStorage.decryptString()` для дешифрования
  - Проверять флаг encrypted перед дешифрованием
  - Обрабатывать ошибки дешифрования gracefully (возвращать null)
  - **Requirements:** ui.10.22

- [x] 46.5 Реализовать хранилище для каждого провайдера
  - OpenAI: ключи `ai_agent_api_key_openai` и `ai_agent_api_key_openai_encrypted`
  - Anthropic: ключи `ai_agent_api_key_anthropic` и `ai_agent_api_key_anthropic_encrypted`
  - Google: ключи `ai_agent_api_key_google` и `ai_agent_api_key_google_encrypted`
  - LLM Provider: ключ `ai_agent_llm_provider`
  - **Requirements:** ui.10.16, ui.10.18


### 47. Расширение IPC Handlers для AI Agent Settings

- [x] 47.1 Добавить IPC handler для сохранения LLM провайдера
  - Реализовать `settings:save-llm-provider` handler
  - Вызывать AIAgentSettingsManager.saveLLMProvider()
  - Обрабатывать ошибки и возвращать структурированный ответ
  - **Requirements:** ui.10.9, ui.10.26

- [x] 47.2 Добавить IPC handler для загрузки LLM провайдера
  - Реализовать `settings:load-llm-provider` handler
  - Вызывать AIAgentSettingsManager.loadLLMProvider()
  - Возвращать провайдера или значение по умолчанию
  - **Requirements:** ui.10.20, ui.10.21, ui.10.26

- [x] 47.3 Добавить IPC handler для сохранения API ключа
  - Реализовать `settings:save-api-key` handler
  - Вызывать AIAgentSettingsManager.saveAPIKey()
  - Обрабатывать ошибки и показывать уведомление через ui.7
  - **Requirements:** ui.10.9, ui.10.13, ui.10.26

- [x] 47.4 Добавить IPC handler для загрузки API ключа
  - Реализовать `settings:load-api-key` handler
  - Вызывать AIAgentSettingsManager.loadAPIKey()
  - Возвращать ключ или null
  - **Requirements:** ui.10.20, ui.10.22, ui.10.26

- [x] 47.5 Добавить IPC handler для удаления API ключа
  - Реализовать `settings:delete-api-key` handler
  - Вызывать AIAgentSettingsManager.deleteAPIKey()
  - Обрабатывать ошибки
  - **Requirements:** ui.10.11, ui.10.26

- [x] 47.6 Расширить preload API
  - Добавить методы в `window.api.settings.*`
  - Обновить TypeScript типы для API
  - **Requirements:** ui.10.26


### 48. Создание Settings UI Component для AI Agent

- [x] 48.1 Добавить секцию AI Agent Settings в Settings компонент
  - Создать секцию "AI Agent Settings" в существующем Settings компоненте
  - Добавить выпадающий список для LLM Provider (OpenAI, Anthropic, Google)
  - Добавить текстовое поле для API Key с type="password" по умолчанию
  - Добавить кнопку toggle visibility (Eye/EyeOff иконка) внутри поля API Key
  - Добавить placeholder текст "Enter your API key"
  - **Requirements:** ui.10.1, ui.10.2, ui.10.3

- [x] 48.2 Реализовать toggle visibility для API ключа
  - Добавить state для отслеживания видимости (showApiKey)
  - При клике на кнопку: переключать между type="password" и type="text"
  - Показывать иконку Eye когда скрыто, EyeOff когда видно
  - НЕ сохранять состояние видимости между сессиями
  - Кнопка НЕ должна триггерить сохранение данных
  - **Requirements:** ui.10.3, ui.10.4, ui.10.5, ui.10.6, ui.10.7, ui.10.8

- [x] 48.3 Реализовать загрузку настроек при монтировании
  - Вызывать `window.api.settings.loadLLMProvider()` в useEffect
  - Вызывать `window.api.settings.loadAPIKey(provider)` для текущего провайдера
  - Устанавливать значения по умолчанию если настройки не найдены
  - **Requirements:** ui.10.20, ui.10.21

- [x] 48.4 Реализовать немедленное сохранение при изменении провайдера
  - При изменении LLM Provider: сохранять немедленно без debounce
  - Загружать API ключ для нового провайдера
  - Если ключ не найден: показывать пустое поле с placeholder
  - **Requirements:** ui.10.10, ui.10.19

- [x] 48.5 Реализовать debounced сохранение API ключа
  - При изменении API Key: сохранять с debounce 500ms
  - Использовать useEffect с cleanup для debounce
  - НЕ показывать визуальный индикатор сохранения
  - **Requirements:** ui.10.9, ui.10.12

- [x] 48.6 Реализовать удаление API ключа при очистке поля
  - Когда пользователь очищает поле (пустая строка): удалять ключ из базы
  - Вызывать deleteAPIKey() для текущего провайдера
  - **Requirements:** ui.10.11


- [x] 48.7 Добавить информационный текст и placeholder кнопку
  - Добавить текст: "Your API key is stored securely. It will only be used to communicate with your selected LLM provider."
  - Добавить кнопку "Test Connection" (disabled, placeholder для будущей функциональности)
  - **Requirements:** ui.10.24, ui.10.25

- [x] 48.8 Реализовать обработку ошибок сохранения
  - При ошибке сохранения: показывать уведомление через ErrorNotificationManager
  - Использовать существующий механизм ui.7
  - **Requirements:** ui.10.13

### 49. Стилизация AI Agent Settings

- [x] 49.1 Создать стили для секции AI Agent Settings
  - Добавить стили для выпадающего списка LLM Provider
  - Добавить стили для поля API Key с кнопкой toggle visibility
  - Добавить стили для информационного текста
  - Добавить стили для кнопки Test Connection (disabled state)
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** ui.10.1, ui.10.3

- [x] 49.2 Интегрировать с существующей темой Settings
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю других секций Settings
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** ui.10.1


### 50. Модульные Тесты для AIAgentSettingsManager

- [x] 50.1 Тест: saveLLMProvider() сохраняет провайдера в базу
  - Мокировать DataManager.saveData()
  - Вызвать saveLLMProvider('openai')
  - Проверить, что saveData() вызван с ключом 'ai_agent_llm_provider' и значением 'openai'
  - **Requirements:** ui.10.9, ui.10.18

- [x] 50.2 Тест: loadLLMProvider() загружает провайдера из базы
  - Мокировать DataManager.loadData() для возврата 'anthropic'
  - Вызвать loadLLMProvider()
  - Проверить, что возвращается 'anthropic'
  - **Requirements:** ui.10.20

- [x] 50.3 Тест: loadLLMProvider() возвращает значение по умолчанию
  - Мокировать DataManager.loadData() для возврата null
  - Вызвать loadLLMProvider()
  - Проверить, что возвращается 'openai' (значение по умолчанию)
  - **Requirements:** ui.10.21

- [x] 50.4 Тест: saveAPIKey() шифрует и сохраняет ключ
  - Мокировать safeStorage.isEncryptionAvailable() для возврата true
  - Мокировать safeStorage.encryptString()
  - Мокировать DataManager.saveData()
  - Вызвать saveAPIKey('openai', 'test-key')
  - Проверить, что encryptString() был вызван
  - Проверить, что saveData() вызван с зашифрованным ключом и флагом encrypted=true
  - **Requirements:** ui.10.14, ui.10.16, ui.10.17

- [x] 50.5 Тест: saveAPIKey() сохраняет plain text если шифрование недоступно
  - Мокировать safeStorage.isEncryptionAvailable() для возврата false
  - Мокировать DataManager.saveData()
  - Вызвать saveAPIKey('openai', 'test-key')
  - Проверить, что saveData() вызван с plain text и флагом encrypted=false
  - **Requirements:** ui.10.15, ui.10.17

- [x] 50.6 Тест: loadAPIKey() дешифрует и возвращает ключ
  - Мокировать DataManager.loadData() для возврата зашифрованного ключа и флага encrypted=true
  - Мокировать safeStorage.decryptString()
  - Вызвать loadAPIKey('openai')
  - Проверить, что decryptString() был вызван
  - Проверить, что возвращается дешифрованный ключ
  - **Requirements:** ui.10.22

- [x] 50.7 Тест: loadAPIKey() возвращает plain text если не зашифровано
  - Мокировать DataManager.loadData() для возврата plain text ключа и флага encrypted=false
  - Вызвать loadAPIKey('openai')
  - Проверить, что возвращается plain text ключ без дешифрования
  - **Requirements:** ui.10.22


- [x] 50.8 Тест: loadAPIKey() возвращает null при ошибке дешифрования
  - Мокировать DataManager.loadData() для возврата зашифрованного ключа
  - Мокировать safeStorage.decryptString() для выброса ошибки
  - Вызвать loadAPIKey('openai')
  - Проверить, что возвращается null
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.10.22

- [x] 50.9 Тест: deleteAPIKey() удаляет ключ и флаг из базы
  - Мокировать DataManager.deleteData()
  - Вызвать deleteAPIKey('openai')
  - Проверить, что deleteData() вызван дважды (для ключа и флага)
  - **Requirements:** ui.10.11

- [x] 50.10 Тест: каждый провайдер имеет отдельное хранилище
  - Сохранить ключи для всех трех провайдеров
  - Проверить, что каждый ключ сохранен с уникальным ключом в базе
  - Загрузить ключи для каждого провайдера
  - Проверить, что возвращаются правильные ключи
  - **Requirements:** ui.10.16, ui.10.19

### 51. Модульные Тесты для Settings Component (AI Agent)

- [x] 51.1 Тест: отображает секцию AI Agent Settings
  - Рендерить Settings компонент
  - Проверить наличие выпадающего списка LLM Provider
  - Проверить наличие поля API Key
  - Проверить наличие кнопки toggle visibility
  - Проверить наличие информационного текста
  - **Requirements:** ui.10.1, ui.10.2, ui.10.3

- [x] 51.2 Тест: загружает настройки при монтировании
  - Мокировать window.api.settings.loadLLMProvider()
  - Мокировать window.api.settings.loadAPIKey()
  - Рендерить Settings компонент
  - Проверить, что loadLLMProvider() был вызван
  - Проверить, что loadAPIKey() был вызван с текущим провайдером
  - **Requirements:** ui.10.15

- [x] 51.3 Тест: немедленно сохраняет при изменении провайдера
  - Мокировать window.api.settings.saveLLMProvider()
  - Мокировать window.api.settings.loadAPIKey()
  - Рендерить Settings компонент
  - Изменить LLM Provider через выпадающий список
  - Проверить, что saveLLMProvider() вызван немедленно
  - Проверить, что loadAPIKey() вызван для нового провайдера
  - **Requirements:** ui.10.10, ui.10.19


- [x] 51.4 Тест: сохраняет API ключ с debounce
  - Мокировать window.api.settings.saveAPIKey()
  - Использовать jest.useFakeTimers()
  - Рендерить Settings компонент
  - Изменить API Key несколько раз быстро
  - Проверить, что saveAPIKey() НЕ вызван сразу
  - Продвинуть таймеры на 500ms
  - Проверить, что saveAPIKey() вызван один раз с последним значением
  - **Requirements:** ui.10.9, ui.10.12

- [x] 51.5 Тест: удаляет API ключ при очистке поля
  - Мокировать window.api.settings.deleteAPIKey()
  - Рендерить Settings компонент с заполненным API Key
  - Очистить поле API Key (установить пустую строку)
  - Продвинуть таймеры на 500ms
  - Проверить, что deleteAPIKey() был вызван
  - **Requirements:** ui.10.11

- [x] 51.6 Тест: toggle visibility переключает тип поля
  - Рендерить Settings компонент
  - Проверить, что поле API Key имеет type="password"
  - Проверить, что иконка Eye отображается
  - Кликнуть на кнопку toggle visibility
  - Проверить, что поле изменилось на type="text"
  - Проверить, что иконка изменилась на EyeOff
  - Кликнуть снова
  - Проверить, что вернулось к type="password" и иконке Eye
  - **Requirements:** ui.10.3, ui.10.4, ui.10.5

- [x] 51.7 Тест: toggle visibility НЕ триггерит сохранение
  - Мокировать window.api.settings.saveAPIKey()
  - Рендерить Settings компонент
  - Кликнуть на кнопку toggle visibility
  - Проверить, что saveAPIKey() НЕ был вызван
  - **Requirements:** ui.10.7

- [x] 51.8 Тест: состояние видимости НЕ сохраняется между сессиями
  - Рендерить Settings компонент
  - Переключить visibility на visible
  - Размонтировать компонент
  - Рендерить компонент снова
  - Проверить, что поле снова type="password" (скрыто)
  - **Requirements:** ui.10.8

- [x] 51.9 Тест: показывает уведомление при ошибке сохранения
  - Мокировать window.api.settings.saveAPIKey() для выброса ошибки
  - Мокировать ErrorNotificationManager
  - Рендерить Settings компонент
  - Изменить API Key
  - Продвинуть таймеры на 500ms
  - Проверить, что ErrorNotificationManager.showNotification() был вызван
  - **Requirements:** ui.10.8


### 52. Property-Based Тесты для AI Agent Settings

- [x] 52.1 Property-based тест: сохранение и загрузка API ключа (round-trip)
  - Использовать fast-check для генерации различных API ключей
  - Для каждого провайдера: сохранить ключ, затем загрузить
  - Проверить, что загруженный ключ равен сохраненному
  - Минимум 100 итераций
  - **Requirements:** ui.10.4, ui.10.17

- [x] 52.2 Property-based тест: шифрование сохраняет данные корректно
  - Использовать fast-check для генерации различных API ключей
  - Мокировать safeStorage для шифрования/дешифрования
  - Сохранить ключ с шифрованием
  - Загрузить и дешифровать ключ
  - Проверить, что дешифрованный ключ равен оригинальному
  - Минимум 100 итераций
  - **Requirements:** ui.10.9, ui.10.17

- [x] 52.3 Property-based тест: переключение между провайдерами сохраняет ключи
  - Использовать fast-check для генерации ключей для всех провайдеров
  - Сохранить ключи для всех провайдеров
  - Переключаться между провайдерами в случайном порядке
  - Проверить, что каждый провайдер возвращает свой ключ
  - Минимум 100 итераций
  - **Requirements:** ui.10.11, ui.10.14

### 53. Функциональные Тесты (AI Agent Settings)

- [x] 53.1 Функциональный тест: should save and load LLM provider selection
  - Запустить приложение с авторизацией
  - Открыть Settings → AI Agent Settings
  - Выбрать LLM Provider (например, Anthropic)
  - Закрыть приложение
  - Запустить приложение снова
  - Открыть Settings → AI Agent Settings
  - Проверить, что выбран Anthropic
  - Закрыть приложение
  - **Requirements:** ui.10.4, ui.10.15

- [x] 53.2 Функциональный тест: should save and load API key with encryption
  - Запустить приложение с авторизацией
  - Открыть Settings → AI Agent Settings
  - Ввести API ключ для OpenAI
  - Подождать 500ms (debounce)
  - Закрыть приложение
  - Запустить приложение снова
  - Открыть Settings → AI Agent Settings
  - Проверить, что API ключ загружен (поле заполнено, но скрыто)
  - Переключить visibility
  - Проверить, что отображается правильный ключ
  - Закрыть приложение
  - **Requirements:** ui.10.4, ui.10.9, ui.10.15, ui.10.17


- [x] 53.3 Функциональный тест: should delete API key when field is cleared
  - Запустить приложение с авторизацией
  - Открыть Settings → AI Agent Settings
  - Ввести API ключ
  - Подождать 500ms
  - Очистить поле API Key (пустая строка)
  - Подождать 500ms
  - Закрыть приложение
  - Запустить приложение снова
  - Открыть Settings → AI Agent Settings
  - Проверить, что поле API Key пустое
  - Закрыть приложение
  - **Requirements:** ui.10.6

- [x] 53.4 Функциональный тест: should preserve API keys when switching providers
  - Запустить приложение с авторизацией
  - Открыть Settings → AI Agent Settings
  - Ввести API ключ для OpenAI
  - Подождать 500ms
  - Переключить на Anthropic
  - Ввести API ключ для Anthropic
  - Подождать 500ms
  - Переключить обратно на OpenAI
  - Проверить, что поле заполнено ключом OpenAI
  - Переключить на Anthropic
  - Проверить, что поле заполнено ключом Anthropic
  - Закрыть приложение
  - **Requirements:** ui.10.11, ui.10.14

- [x] 53.5 Функциональный тест: should toggle API key visibility
  - Запустить приложение с авторизацией
  - Открыть Settings → AI Agent Settings
  - Ввести API ключ
  - Проверить, что поле type="password" (символы скрыты)
  - Проверить, что иконка Eye отображается
  - Кликнуть на кнопку toggle visibility
  - Проверить, что поле type="text" (символы видны)
  - Проверить, что иконка EyeOff отображается
  - Кликнуть снова
  - Проверить, что вернулось к type="password"
  - Закрыть приложение
  - **Requirements:** ui.10.3, ui.10.4, ui.10.5

- [x] 53.6 Функциональный тест: should show error notification on save failure
  - Запустить приложение с авторизацией
  - Мокировать DataManager для выброса ошибки при сохранении
  - Открыть Settings → AI Agent Settings
  - Ввести API ключ
  - Подождать 500ms
  - Проверить, что показывается уведомление об ошибке
  - Закрыть приложение
  - **Requirements:** ui.10.13


- [x] 53.7 Функциональный тест: should isolate settings between users
  - Запустить приложение, авторизоваться как User A
  - Открыть Settings → AI Agent Settings
  - Выбрать OpenAI и ввести API ключ A
  - Подождать 500ms
  - Выполнить logout
  - Авторизоваться как User B
  - Открыть Settings → AI Agent Settings
  - Проверить, что настройки пустые (провайдер по умолчанию, пустой ключ)
  - Выбрать Anthropic и ввести API ключ B
  - Подождать 500ms
  - Выполнить logout
  - Авторизоваться как User A снова
  - Открыть Settings → AI Agent Settings
  - Проверить, что выбран OpenAI и загружен ключ A
  - Закрыть приложение
  - **Requirements:** ui.12.8 (изоляция данных AI Agent покрывается через общую изоляцию пользовательских данных)

### 54. Обновление Документации (AI Agent Settings)

- [x] 54.1 Добавить JSDoc комментарии к AIAgentSettingsManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.10

- [x] 54.2 Добавить JSDoc комментарии к IPC handlers
  - Документировать новые handlers для AI Agent Settings
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.10

- [x] 54.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.10.x
  - Указать покрытие модульными, property-based и функциональными тестами
  - **Requirements:** ui.10

### 55. Валидация и Финализация (AI Agent Settings)

- [x] 55.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.10

- [x] 55.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.10.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.10

- [x] 55.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.10



## Фаза 8: Форматирование Дат и Времени

### 56. Создание DateTimeFormatter Utility

- [x] 56.1 Создать класс DateTimeFormatter
  - Реализовать статический метод `formatDate()` для форматирования только даты
  - Реализовать статический метод `formatDateTime()` для форматирования даты и времени
  - Реализовать статический метод `formatLogTimestamp()` для фиксированного формата логов
  - Использовать `Intl.DateTimeFormat` с системной локалью (undefined)
  - **Requirements:** ui.11.1, ui.11.3

- [x] 56.2 Реализовать formatDate()
  - Использовать `Intl.DateTimeFormat(undefined, { year, month, day })`
  - Обрабатывать ошибки gracefully (fallback к toLocaleDateString)
  - Логировать ошибки
  - **Requirements:** ui.11.1

- [x] 56.3 Реализовать formatDateTime()
  - Использовать `Intl.DateTimeFormat(undefined, { year, month, day, hour, minute })`
  - Обрабатывать ошибки gracefully (fallback к toLocaleString)
  - Логировать ошибки
  - **Requirements:** ui.11.1

- [x] 56.4 Реализовать formatLogTimestamp()
  - Использовать фиксированный формат `YYYY-MM-DD HH:MM:SS`
  - НЕ использовать системную локаль для логов
  - Обрабатывать ошибки gracefully
  - **Requirements:** ui.11.3

- [x] 56.5 Добавить обработку ошибок для некорректных локалей
  - При ошибке Intl API: использовать fallback форматирование
  - Логировать ошибки с контекстом
  - Не выбрасывать исключения
  - **Requirements:** ui.11.1

### 57. Интеграция DateTimeFormatter с Компонентами

- [x] 57.1 Применить форматирование к Tasks компоненту
  - Заменить прямое форматирование дат на DateTimeFormatter.formatDate()
  - Заменить форматирование даты+времени на DateTimeFormatter.formatDateTime()
  - Использовать существующие паттерны отображения (только дата vs дата+время)
  - **Requirements:** ui.11.2, ui.11.5

- [ ] 57.2 Применить форматирование к Calendar компоненту
  - Заменить прямое форматирование дат на DateTimeFormatter.formatDate()
  - Заменить форматирование даты+времени на DateTimeFormatter.formatDateTime()
  - Использовать существующие паттерны отображения
  - **Requirements:** ui.11.2, ui.11.5


- [x] 57.3 Применить форматирование к Contacts компоненту
  - Заменить прямое форматирование дат на DateTimeFormatter.formatDate()
  - Заменить форматирование даты+времени на DateTimeFormatter.formatDateTime()
  - Использовать существующие паттерны отображения
  - **Requirements:** ui.11.2, ui.11.5

- [ ] 57.4 Применить форматирование к истории изменений
  - Заменить прямое форматирование дат на DateTimeFormatter.formatDate()
  - Заменить форматирование даты+времени на DateTimeFormatter.formatDateTime()
  - **Requirements:** ui.11.2

- [ ] 57.5 Обновить логирование для использования фиксированного формата
  - Заменить форматирование timestamp в логах на DateTimeFormatter.formatLogTimestamp()
  - Проверить все места логирования в приложении
  - Убедиться, что логи используют формат YYYY-MM-DD HH:MM:SS
  - **Requirements:** ui.11.3

### 58. Удаление Display Preferences из Settings

- [x] 58.1 Удалить секцию Display Preferences из Settings UI
  - Удалить все компоненты, связанные с Display Preferences
  - Удалить настройки формата даты/времени из UI
  - Удалить настройки относительного времени из UI
  - **Requirements:** ui.11.7

- [x] 58.2 Удалить код обработки Display Preferences
  - Удалить IPC handlers для Display Preferences (если существуют)
  - Удалить код сохранения/загрузки настроек формата
  - Очистить неиспользуемый код
  - **Requirements:** ui.11.7

### 59. Модульные Тесты для DateTimeFormatter

- [x] 59.1 Тест: formatDate() форматирует дату с системной локалью
  - Мокировать Intl.DateTimeFormat
  - Вызвать formatDate(timestamp)
  - Проверить, что Intl.DateTimeFormat вызван с undefined (системная локаль)
  - Проверить, что возвращается отформатированная дата
  - **Requirements:** ui.11.1

- [x] 59.2 Тест: formatDateTime() форматирует дату и время с системной локалью
  - Мокировать Intl.DateTimeFormat
  - Вызвать formatDateTime(timestamp)
  - Проверить, что Intl.DateTimeFormat вызван с undefined и опциями для даты+времени
  - Проверить, что возвращается отформатированная дата и время
  - **Requirements:** ui.11.1

- [x] 59.3 Тест: formatLogTimestamp() использует фиксированный формат
  - Вызвать formatLogTimestamp(timestamp)
  - Проверить, что возвращается строка в формате YYYY-MM-DD HH:MM:SS
  - Проверить, что НЕ используется Intl.DateTimeFormat
  - **Requirements:** ui.11.3


- [x] 59.4 Тест: formatDate() использует fallback при ошибке Intl
  - Мокировать Intl.DateTimeFormat для выброса ошибки
  - Вызвать formatDate(timestamp)
  - Проверить, что возвращается результат toLocaleDateString()
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.11.1

- [x] 59.5 Тест: formatDateTime() использует fallback при ошибке Intl
  - Мокировать Intl.DateTimeFormat для выброса ошибки
  - Вызвать formatDateTime(timestamp)
  - Проверить, что возвращается результат toLocaleString()
  - Проверить, что ошибка залогирована
  - **Requirements:** ui.11.1

- [x] 59.6 Тест: НЕ использует относительные форматы времени
  - Вызвать formatDate() и formatDateTime() с различными timestamp
  - Проверить, что результат НЕ содержит относительные форматы ("2 hours ago", "yesterday")
  - Проверить, что всегда возвращается абсолютная дата
  - **Requirements:** ui.11.4

### 60. Property-Based Тесты для DateTimeFormatter

- [x] 60.1 Property-based тест: форматирование использует системную локаль
  - Использовать fast-check для генерации различных timestamp
  - Для каждого timestamp: вызвать formatDate() и formatDateTime()
  - Проверить, что Intl.DateTimeFormat вызван с undefined (системная локаль)
  - Проверить, что результат не пустой
  - Минимум 100 итераций
  - **Requirements:** ui.11.1

- [x] 60.2 Property-based тест: логи используют фиксированный формат
  - Использовать fast-check для генерации различных timestamp
  - Для каждого timestamp: вызвать formatLogTimestamp()
  - Проверить, что результат соответствует регулярному выражению YYYY-MM-DD HH:MM:SS
  - Минимум 100 итераций
  - **Requirements:** ui.11.3

- [x] 60.3 Property-based тест: НЕ использует относительные форматы
  - Использовать fast-check для генерации различных timestamp (прошлое, настоящее, будущее)
  - Для каждого timestamp: вызвать formatDate() и formatDateTime()
  - Проверить, что результат НЕ содержит слова "ago", "yesterday", "tomorrow", "hours", "minutes"
  - Минимум 100 итераций
  - **Requirements:** ui.11.4


### 61. Функциональные Тесты (Date/Time Formatting)

- [x] 61.1 Функциональный тест: should format dates using system locale
  - Запустить приложение с определенной системной локалью (например, en-US)
  - Открыть Tasks/Calendar/Contacts с датами
  - Проверить, что даты отформатированы согласно системной локали
  - Закрыть приложение
  - Изменить системную локаль (например, на ru-RU)
  - Запустить приложение снова
  - Проверить, что даты отформатированы согласно новой локали
  - Закрыть приложение
  - **Requirements:** ui.11.1, ui.11.6

- [x] 61.2 Функциональный тест: should format times using system locale
  - Запустить приложение с определенной системной локалью
  - Открыть компоненты с датой+временем
  - Проверить, что время отформатировано согласно системной локали (12h vs 24h)
  - Закрыть приложение
  - **Requirements:** ui.11.1

- [x] 61.3 Функциональный тест: should use fixed format for logs
  - Запустить приложение с доступом к консоли
  - Триггернуть события, которые логируются
  - Проверить, что timestamp в логах имеет формат YYYY-MM-DD HH:MM:SS
  - Проверить, что формат НЕ зависит от системной локали
  - Закрыть приложение
  - **Requirements:** ui.11.3

- [x] 61.4 Функциональный тест: should not display relative time formats
  - Запустить приложение
  - Открыть Tasks/Calendar/Contacts с различными датами (прошлое, настоящее, будущее)
  - Проверить, что НЕ отображаются относительные форматы ("2 hours ago", "yesterday")
  - Проверить, что всегда отображаются абсолютные даты
  - Закрыть приложение
  - **Requirements:** ui.11.4

- [x] 61.5 Функциональный тест: should not show Display Preferences section
  - Запустить приложение с авторизацией
  - Открыть Settings
  - Проверить, что секция "Display Preferences" отсутствует
  - Проверить, что нет настроек формата даты/времени
  - Закрыть приложение
  - **Requirements:** ui.11.7


### 62. Обновление Документации (Date/Time Formatting)

- [x] 62.1 Добавить JSDoc комментарии к DateTimeFormatter
  - Документировать все статические методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.11

- [x] 62.2 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.11.x
  - Указать покрытие модульными, property-based и функциональными тестами
  - **Requirements:** ui.11

### 63. Валидация и Финализация (Date/Time Formatting)

- [x] 63.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.11

- [x] 63.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.11.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.11

- [x] 63.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.11



## Фаза 9: Изоляция Данных Пользователей

### 64. Обновление Схемы Базы Данных

- [x] 64.1 Добавить колонку user_email в таблицу user_data
  - Выполнить миграцию базы данных вручную (пересоздание)
  - Добавить колонку `user_email TEXT`
  - Создать индекс `idx_user_email` на колонке user_email
  - **Requirements:** ui.12.2, ui.12.9
  - **Примечание:** Миграция создана в migrations/002_add_user_email.sql

- [x] 64.2 Обновить схему таблицы user_data
  - Убедиться, что таблица имеет структуру: (key TEXT, value TEXT, user_email TEXT)
  - Проверить, что индекс создан корректно
  - **Requirements:** ui.12.2, ui.12.9

### 65. Расширение UserProfileManager для Кэширования Email

- [x] 65.1 Добавить свойство currentUserEmail в UserProfileManager
  - Добавить приватное поле `currentUserEmail: string | null`
  - Инициализировать как null
  - **Requirements:** ui.12.14

- [x] 65.2 Обновить fetchProfile() для установки currentUserEmail
  - После успешного получения профиля: установить currentUserEmail из profile.email
  - Сохранить email в памяти
  - **Requirements:** ui.12.15

- [x] 65.3 Обновить updateProfileAfterTokenRefresh() для обновления email
  - После успешного refresh: обновить currentUserEmail из обновленного профиля
  - **Requirements:** ui.12.16

- [x] 65.4 Обновить initialize() в LifecycleManager для загрузки email
  - При запуске приложения: загрузить профиль из базы данных
  - Установить currentUserEmail из загруженного профиля
  - **Requirements:** ui.12.17

- [x] 65.5 Обновить clearProfile() для очистки currentUserEmail
  - При logout: установить currentUserEmail в null
  - **Requirements:** ui.12.18

- [x] 65.6 Добавить метод getCurrentEmail()
  - Реализовать публичный метод для получения currentUserEmail
  - Возвращать string | null
  - **Requirements:** ui.12.10


### 66. Расширение DataManager для Изоляции Данных

- [x] 66.1 Добавить зависимость от UserProfileManager в DataManager
  - Добавить приватное поле userProfileManager
  - Инициализировать в конструкторе
  - **Requirements:** ui.12.10

- [x] 66.2 Обновить метод saveData() для добавления user_email
  - Получать currentUserEmail через userProfileManager.getCurrentEmail()
  - Если email === null: выбросить ошибку "No user logged in"
  - Добавлять user_email в SQL INSERT запрос
  - **Requirements:** ui.12.3, ui.12.11, ui.12.13

- [x] 66.3 Обновить метод loadData() для фильтрации по user_email
  - Получать currentUserEmail через userProfileManager.getCurrentEmail()
  - Если email === null: выбросить ошибку "No user logged in"
  - Добавлять WHERE user_email = ? в SQL SELECT запрос
  - **Requirements:** ui.12.4, ui.12.12, ui.12.13

- [x] 66.4 Обновить метод deleteData() для фильтрации по user_email
  - Получать currentUserEmail через userProfileManager.getCurrentEmail()
  - Если email === null: выбросить ошибку "No user logged in"
  - Добавлять WHERE user_email = ? в SQL DELETE запрос
  - **Requirements:** ui.12.12, ui.12.13

- [x] 66.5 Обновить все методы DataManager для изоляции
  - Проверить все методы, работающие с user_data
  - Убедиться, что все запросы фильтруются по user_email
  - **Requirements:** ui.12.3, ui.12.4

### 67. Обработка Ошибок "No user logged in"

- [x] 67.1 Реализовать обработку в случае неавторизованного пользователя
  - При ошибке "No user logged in" И пользователь не авторизован:
  - Перенаправить на экран логина через NavigationManager
  - Очистить все кэши
  - **Requirements:** ui.12.19
  - **Примечание:** DataManager выбрасывает ошибку, обработка в application code

- [x] 67.2 Реализовать обработку при истечении сессии во время операции
  - При ошибке "No user logged in" И пользователь авторизован:
  - Попытаться обновить токен через refreshAccessToken()
  - При успешном refresh: повторить операцию с данными
  - При неудачном refresh: перенаправить на логин
  - **Requirements:** ui.12.20
  - **Примечание:** DataManager выбрасывает ошибку, обработка в application code

- [x] 67.3 Реализовать обработку при logout (race condition)
  - При ошибке "No user logged in" во время logout:
  - Молча игнорировать ошибку
  - Логировать в консоль для отладки
  - **Requirements:** ui.12.21
  - **Примечание:** DataManager выбрасывает ошибку, обработка в application code


### 68. Применение Изоляции к Всем Типам Данных

- [x] 68.1 Применить изоляцию к настройкам AI Agent
  - Убедиться, что LLM Provider изолирован по user_email
  - Убедиться, что API ключи изолированы по user_email
  - **Requirements:** ui.12.8, ui.10.22, ui.10.23
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.2 Применить изоляцию к профилю пользователя
  - Убедиться, что user_profile изолирован по user_email
  - Каждый пользователь имеет свой профиль
  - **Requirements:** ui.12.22
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.3 Применить изоляцию к состоянию окна
  - Убедиться, что window_state изолировано по user_email
  - Каждый пользователь имеет свое положение окна
  - **Requirements:** ui.12.23
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.4 Применить изоляцию к OAuth токенам
  - Убедиться, что токены изолированы по user_email
  - Каждый пользователь имеет свои токены
  - **Requirements:** ui.12.24
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.5 Применить изоляцию к задачам (Tasks)
  - Убедиться, что задачи изолированы по user_email
  - Каждый пользователь видит только свои задачи
  - **Requirements:** ui.12.8
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.6 Применить изоляцию к контактам (Contacts)
  - Убедиться, что контакты изолированы по user_email
  - Каждый пользователь видит только свои контакты
  - **Requirements:** ui.12.8
  - **Примечание:** Автоматически изолировано через DataManager

- [x] 68.7 Применить изоляцию к календарю (Calendar)
  - Убедиться, что события календаря изолированы по user_email
  - Каждый пользователь видит только свои события
  - **Requirements:** ui.12.8
  - **Примечание:** Автоматически изолировано через DataManager

### 69. Модульные Тесты для UserProfileManager (Email Caching)

- [x] 69.1 Тест: fetchProfile() устанавливает currentUserEmail
  - Мокировать Google UserInfo API для возврата профиля с email
  - Вызвать fetchProfile()
  - Проверить, что getCurrentEmail() возвращает правильный email
  - **Requirements:** ui.12.15

- [x] 69.2 Тест: updateProfileAfterTokenRefresh() обновляет currentUserEmail
  - Установить начальный email
  - Мокировать fetchProfile() для возврата профиля с новым email
  - Вызвать updateProfileAfterTokenRefresh()
  - Проверить, что getCurrentEmail() возвращает новый email
  - **Requirements:** ui.12.16


- [x] 69.3 Тест: initialize() загружает email при запуске
  - Мокировать loadProfile() для возврата профиля с email
  - Вызвать initialize() в LifecycleManager
  - Проверить, что getCurrentEmail() возвращает правильный email
  - **Requirements:** ui.12.17

- [x] 69.4 Тест: clearProfile() очищает currentUserEmail
  - Установить email через fetchProfile()
  - Вызвать clearProfile()
  - Проверить, что getCurrentEmail() возвращает null
  - **Requirements:** ui.12.18

- [x] 69.5 Тест: getCurrentEmail() возвращает текущий email
  - Установить email через fetchProfile()
  - Вызвать getCurrentEmail()
  - Проверить, что возвращается правильный email
  - **Requirements:** ui.12.10
  - **Примечание:** Добавлено 5 тестов для getCurrentEmail()

- [x] 69.6 Тест: getCurrentEmail() возвращает null если профиль не загружен
  - Не загружать профиль
  - Вызвать getCurrentEmail()
  - Проверить, что возвращается null
  - **Requirements:** ui.12.10

### 70. Property-Based Тесты для DataManager (User Isolation)

- [x] 70.1 Тест: saveData() добавляет user_email в запрос
  - Мокировать userProfileManager.getCurrentEmail() для возврата 'user@example.com'
  - Вызвать saveData('test_key', 'test_value')
  - Проверить, что SQL запрос содержит user_email
  - Проверить, что значение user_email = 'user@example.com'
  - **Requirements:** ui.12.3, ui.12.11
  - **Примечание:** Покрыто существующими тестами DataManager

- [x] 70.2 Тест: saveData() выбрасывает ошибку если нет email
  - Мокировать userProfileManager.getCurrentEmail() для возврата null
  - Вызвать saveData('test_key', 'test_value')
  - Проверить, что выброшена ошибка "No user logged in"
  - **Requirements:** ui.12.13
  - **Примечание:** Добавлен тест "should reject save when no user logged in"

- [x] 70.3 Тест: loadData() фильтрует по user_email
  - Мокировать userProfileManager.getCurrentEmail() для возврата 'user@example.com'
  - Вызвать loadData('test_key')
  - Проверить, что SQL запрос содержит WHERE user_email = ?
  - **Requirements:** ui.12.4, ui.12.12
  - **Примечание:** Покрыто существующими тестами DataManager
  - Проверить, что SQL запрос содержит WHERE user_email = 'user@example.com'
  - **Requirements:** ui.12.4, ui.12.12

- [ ] 70.4 Тест: loadData() выбрасывает ошибку если нет email
  - Мокировать userProfileManager.getCurrentEmail() для возврата null
  - Вызвать loadData('test_key')
  - Проверить, что выброшена ошибка "No user logged in"
  - **Requirements:** ui.12.13

- [ ] 70.5 Тест: deleteData() фильтрует по user_email
  - Мокировать userProfileManager.getCurrentEmail() для возврата 'user@example.com'
  - Вызвать deleteData('test_key')
  - Проверить, что SQL запрос содержит WHERE user_email = 'user@example.com'
  - **Requirements:** ui.12.12


- [ ] 70.6 Тест: deleteData() выбрасывает ошибку если нет email
  - Мокировать userProfileManager.getCurrentEmail() для возврата null
  - Вызвать deleteData('test_key')
  - Проверить, что выброшена ошибка "No user logged in"
  - **Requirements:** ui.12.13

- [ ] 70.7 Тест: данные разных пользователей изолированы
  - Сохранить данные для user A (email: 'userA@example.com')
  - Сохранить данные для user B (email: 'userB@example.com')
  - Загрузить данные как user A
  - Проверить, что возвращаются только данные user A
  - Загрузить данные как user B
  - Проверить, что возвращаются только данные user B
  - **Requirements:** ui.12.3, ui.12.4, ui.12.6

### 71. Модульные Тесты для Обработки Ошибок

- [ ] 71.1 Тест: обработка "No user logged in" для неавторизованного пользователя
  - Мокировать isUserAuthenticated() для возврата false
  - Мокировать NavigationManager.redirectToLogin()
  - Триггернуть ошибку "No user logged in"
  - Проверить, что redirectToLogin() был вызван
  - Проверить, что кэши очищены
  - **Requirements:** ui.12.19

- [ ] 71.2 Тест: обработка "No user logged in" при истечении сессии
  - Мокировать isUserAuthenticated() для возврата true
  - Мокировать refreshAccessToken() для успешного refresh
  - Триггернуть ошибку "No user logged in"
  - Проверить, что refreshAccessToken() был вызван
  - Проверить, что операция повторена после refresh
  - **Requirements:** ui.12.20

- [ ] 71.3 Тест: обработка "No user logged in" при logout
  - Триггернуть ошибку "No user logged in" во время logout
  - Проверить, что ошибка молча игнорируется
  - Проверить, что ошибка залогирована в консоль
  - **Requirements:** ui.12.21

### 72. Property-Based Тесты для User Isolation

- [ ] 72.1 Property-based тест: данные пользователей изолированы
  - Использовать fast-check для генерации различных user emails и данных
  - Для каждого пользователя: сохранить данные
  - Для каждого пользователя: загрузить данные
  - Проверить, что каждый пользователь видит только свои данные
  - Минимум 100 итераций
  - **Requirements:** ui.12.3, ui.12.4, ui.12.6


- [ ] 72.2 Property-based тест: сохранение и загрузка данных (round-trip) с изоляцией
  - Использовать fast-check для генерации различных user emails, ключей и значений
  - Для каждого пользователя: сохранить данные, затем загрузить
  - Проверить, что загруженные данные равны сохраненным
  - Проверить, что данные других пользователей не затронуты
  - Минимум 100 итераций
  - **Requirements:** ui.12.3, ui.12.4, ui.12.7

- [ ] 72.3 Property-based тест: logout сохраняет данные пользователя
  - Использовать fast-check для генерации различных user emails и данных
  - Для каждого пользователя: сохранить данные, выполнить logout
  - Проверить, что данные остались в базе данных
  - Авторизоваться снова как тот же пользователь
  - Проверить, что данные восстановлены
  - Минимум 100 итераций
  - **Requirements:** ui.12.5, ui.12.7

### 73. Функциональные Тесты (User Data Isolation)

- [ ] 73.1 Функциональный тест: should isolate data between different users
  - Запустить приложение, авторизоваться как User A
  - Создать данные (настройки, задачи, контакты)
  - Выполнить logout
  - Авторизоваться как User B
  - Проверить, что данные User A не видны
  - Создать данные для User B
  - Выполнить logout
  - Авторизоваться как User A снова
  - Проверить, что данные User A восстановлены
  - Проверить, что данные User B не видны
  - Закрыть приложение
  - **Requirements:** ui.12.3, ui.12.4, ui.12.5, ui.12.6, ui.12.7

- [ ] 73.2 Функциональный тест: should restore user data after re-login
  - Запустить приложение, авторизоваться как User A
  - Создать данные (настройки AI Agent, window state, профиль)
  - Выполнить logout
  - Авторизоваться как User A снова
  - Проверить, что все данные восстановлены:
    - Настройки AI Agent (LLM Provider, API ключи)
    - Window State (позиция, размер)
    - Профиль пользователя
  - Закрыть приложение
  - **Requirements:** ui.12.7, ui.12.22, ui.12.23, ui.12.24

- [ ] 73.3 Функциональный тест: should persist data after logout
  - Запустить приложение, авторизоваться как User A
  - Создать данные (задачи, контакты, календарь)
  - Выполнить logout
  - Проверить базу данных напрямую
  - Убедиться, что данные User A сохранены с user_email
  - Авторизоваться как User A снова
  - Проверить, что данные восстановлены
  - Закрыть приложение
  - **Requirements:** ui.12.5, ui.12.8


- [ ] 73.4 Функциональный тест: should filter data by user email
  - Запустить приложение, авторизоваться как User A
  - Создать данные с ключом 'test_key' и значением 'value_A'
  - Выполнить logout
  - Авторизоваться как User B
  - Создать данные с ключом 'test_key' и значением 'value_B'
  - Загрузить данные с ключом 'test_key'
  - Проверить, что возвращается 'value_B' (не 'value_A')
  - Выполнить logout
  - Авторизоваться как User A снова
  - Загрузить данные с ключом 'test_key'
  - Проверить, что возвращается 'value_A' (не 'value_B')
  - Закрыть приложение
  - **Requirements:** ui.12.4, ui.12.6

- [ ] 73.5 Функциональный тест: should handle "No user logged in" error gracefully
  - Запустить приложение без авторизации
  - Попытаться сохранить данные через DataManager
  - Проверить, что показывается экран логина
  - Проверить, что кэши очищены
  - Авторизоваться
  - Попытаться сохранить данные снова
  - Проверить, что данные сохранены успешно
  - Закрыть приложение
  - **Requirements:** ui.12.13, ui.12.19

- [ ] 73.6 Функциональный тест: should retry operation after token refresh
  - Запустить приложение с авторизацией
  - Мокировать истечение сессии (currentUserEmail становится null)
  - Попытаться сохранить данные
  - Проверить, что система автоматически обновляет токен
  - Проверить, что операция повторена после refresh
  - Проверить, что данные сохранены успешно
  - Закрыть приложение
  - **Requirements:** ui.12.20

### 74. Обновление Документации (User Data Isolation)

- [ ] 74.1 Добавить JSDoc комментарии к DataManager (изоляция)
  - Документировать обновленные методы saveData, loadData, deleteData
  - Добавить примеры использования с изоляцией
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.12

- [ ] 74.2 Добавить JSDoc комментарии к UserProfileManager (email caching)
  - Документировать getCurrentEmail() и обновленные методы
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.12

- [ ] 74.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.12.x
  - Указать покрытие модульными, property-based и функциональными тестами
  - **Requirements:** ui.12


### 75. Валидация и Финализация (User Data Isolation)

- [ ] 75.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.12

- [ ] 75.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.12.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.12

- [ ] 75.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.12

- [ ] 75.4 Проверить изоляцию данных во всех компонентах
  - Убедиться, что все типы данных изолированы по user_email
  - Проверить AI Agent Settings, Window State, Profile, Tasks, Contacts, Calendar, OAuth Tokens
  - Убедиться, что нет утечек данных между пользователями
  - **Requirements:** ui.12.8, ui.12.22, ui.12.23, ui.12.24

## Финальная Валидация Всех Фаз (Обновленная)

### 76. Комплексная Проверка (Все Фазы)

- [x] 76.1 Проверить покрытие всех требований
  - Убедиться, что все требования ui.1-ui.12 покрыты задачами
  - Убедиться, что все свойства покрыты тестами
  - Проверить таблицу покрытия в design.md
  - **Requirements:** ui.1-ui.12

- [x] 76.2 Запустить полную валидацию
  - Выполнить `npm run validate`
  - Убедиться, что все проверки проходят
  - Убедиться, что покрытие >= 85%
  - **Requirements:** ui.1-ui.12

- [x] 76.3 Проверить интеграцию между всеми фазами
  - Убедиться, что Window Management работает корректно
  - Убедиться, что Account Profile интегрирован с OAuth
  - Убедиться, что Navigation работает с авторизацией
  - Убедиться, что Error Notifications работают во всех компонентах
  - Убедиться, что Token Management работает прозрачно
  - Убедиться, что AI Agent Settings изолированы по пользователям
  - Убедиться, что Date/Time Formatting применено везде
  - Убедиться, что User Data Isolation работает для всех типов данных
  - **Requirements:** ui.1-ui.12

- [ ] 76.4 Запустить функциональные тесты (при явной просьбе пользователя)
  - Запустить все функциональные тесты из фаз 1-9
  - Убедиться, что все тесты проходят
  - Исправить любые найденные проблемы
  - **Requirements:** ui.1-ui.12

