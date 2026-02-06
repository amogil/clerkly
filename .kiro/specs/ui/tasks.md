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

- [~] 23.1 Тест: checkAuthStatus() возвращает корректный статус
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: true
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается true
  - Мокировать window.api.auth.getAuthStatus() для возврата authorized: false
  - Вызвать checkAuthStatus()
  - Проверить, что возвращается false
  - **Requirements:** ui.8.1

- [~] 23.2 Тест: redirectToLogin() перенаправляет на /login
  - Создать mock Router
  - Вызвать redirectToLogin()
  - Проверить, что router.navigate() вызван с '/login'
  - **Requirements:** ui.8.1, ui.8.4

- [~] 23.3 Тест: redirectToDashboard() перенаправляет на /dashboard
  - Создать mock Router
  - Вызвать redirectToDashboard()
  - Проверить, что router.navigate() вызван с '/dashboard'
  - **Requirements:** ui.8.3

- [~] 23.4 Тест: initialize() перенаправляет неавторизованного пользователя на login
  - Мокировать checkAuthStatus() для возврата false
  - Вызвать initialize()
  - Проверить, что redirectToLogin() был вызван
  - **Requirements:** ui.8.1

- [~] 23.5 Тест: initialize() не перенаправляет авторизованного пользователя
  - Мокировать checkAuthStatus() для возврата true
  - Мокировать router.currentRoute = '/dashboard'
  - Вызвать initialize()
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** ui.8.1

### 24. Модульные Тесты для AuthGuard

- [~] 24.1 Тест: canActivate() разрешает доступ к публичным маршрутам
  - Вызвать canActivate('/login')
  - Проверить, что возвращается true без проверки авторизации
  - **Requirements:** ui.8.1

- [~] 24.2 Тест: canActivate() блокирует доступ к защищенным маршрутам без авторизации
  - Мокировать navigationManager.checkAuthStatus() для возврата false
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается false
  - Проверить, что navigationManager.redirectToLogin() был вызван
  - **Requirements:** ui.8.2

- [~] 24.3 Тест: canActivate() разрешает доступ к защищенным маршрутам с авторизацией
  - Мокировать navigationManager.checkAuthStatus() для возврата true
  - Вызвать canActivate('/dashboard')
  - Проверить, что возвращается true
  - Проверить, что redirectToLogin() НЕ был вызван
  - **Requirements:** ui.8.2

- [~] 24.4 Тест: isProtectedRoute() корректно определяет защищенные маршруты
  - Проверить, что isProtectedRoute('/login') возвращает false
  - Проверить, что isProtectedRoute('/dashboard') возвращает true
  - Проверить, что isProtectedRoute('/settings') возвращает true
  - Проверить, что isProtectedRoute('/tasks') возвращает true
  - **Requirements:** ui.8.2


### 25. Функциональные Тесты (Navigation)

- [~] 25.1 Функциональный тест: should show login screen when not authenticated
  - Запустить приложение без авторизации
  - Проверить, что показывается экран логина (/login)
  - Попытаться перейти на /dashboard
  - Проверить, что перенаправлен обратно на /login
  - Закрыть приложение
  - **Requirements:** ui.8.1, ui.8.2
  - **Property:** 8, 24, 25

- [~] 25.2 Функциональный тест: should redirect to dashboard after successful authentication
  - Запустить приложение
  - Выполнить авторизацию через Google OAuth
  - Проверить, что автоматически перенаправлен на /dashboard
  - Проверить, что НЕ показывается экран логина
  - Закрыть приложение
  - **Requirements:** ui.8.3
  - **Property:** 9, 26

- [~] 25.3 Функциональный тест: should block access to protected routes without authentication
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

- [~] 25.4 Функциональный тест: should redirect to login after logout
  - Запустить приложение с авторизацией
  - Проверить, что находимся на /dashboard или другом защищенном маршруте
  - Выполнить logout
  - Проверить, что автоматически перенаправлен на /login
  - Попытаться вернуться на /dashboard
  - Проверить, что снова перенаправлен на /login
  - Закрыть приложение
  - **Requirements:** ui.8.4
  - **Property:** 27

- [~] 25.5 Функциональный тест: should allow access to all routes when authenticated
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

- [~] 26.1 Добавить JSDoc комментарии к NavigationManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.8

- [~] 26.2 Добавить JSDoc комментарии к AuthGuard
  - Документировать все публичные методы
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.8

- [~] 26.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.8.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.8

### 27. Валидация и Финализация (Navigation)

- [~] 27.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.8

- [~] 27.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.8.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.8

- [~] 27.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.8


## Фаза 5: Обработка Ошибок и Уведомления

### 28. Создание ErrorNotificationManager

- [~] 28.1 Создать интерфейс ErrorNotification
  - Определить структуру уведомления (id, message, context, timestamp)
  - Добавить JSDoc комментарии для каждого поля
  - **Requirements:** ui.7.2

- [~] 28.2 Создать класс ErrorNotificationManager
  - Реализовать метод `showNotification()` для отображения уведомления
  - Реализовать метод `dismissNotification()` для закрытия уведомления
  - Реализовать метод `subscribe()` для подписки на изменения
  - Добавить автоматическое закрытие через 15 секунд
  - Управлять массивом активных уведомлений
  - **Requirements:** ui.7.1, ui.7.2, ui.7.3
  - **Property:** 20, 21, 22

- [~] 28.3 Добавить IPC handler для уведомлений об ошибках
  - Реализовать событие `error:notify` в Main Process
  - Добавить метод `window.api.error.onNotify()` в preload
  - Обновить TypeScript типы для API
  - **Requirements:** ui.7.1

### 29. Создание NotificationUI Component

- [~] 29.1 Создать React компонент NotificationUI
  - Создать файл `src/renderer/components/NotificationUI.tsx`
  - Реализовать отображение списка уведомлений
  - Реализовать отображение контекста и сообщения для каждого уведомления
  - Добавить кнопку закрытия для каждого уведомления
  - Добавить обработчик клика для закрытия уведомления
  - **Requirements:** ui.7.1, ui.7.2, ui.7.3
  - **Property:** 20, 21, 22

- [~] 29.2 Интегрировать NotificationUI с ErrorNotificationManager
  - Подписаться на изменения через subscribe()
  - Обновлять состояние компонента при изменении уведомлений
  - Обеспечить очистку подписки при размонтировании
  - **Requirements:** ui.7.1

- [ ] 29.3 Интегрировать с IPC events
  - Слушать событие `error:notify` из Main Process
  - Вызывать showNotification() при получении события
  - Реализовать в App.tsx или главном компоненте
  - **Requirements:** ui.7.1

### 30. Стилизация NotificationUI

- [ ] 30.1 Создать стили для уведомлений
  - Добавить стили для контейнера уведомлений
  - Добавить стили для отдельного уведомления
  - Добавить стили для контекста и сообщения
  - Добавить стили для кнопки закрытия
  - Обеспечить адаптивность на разных размерах экрана
  - **Requirements:** ui.7.2

- [ ] 30.2 Интегрировать с существующей темой
  - Использовать существующие цвета и шрифты
  - Следовать визуальному стилю приложения
  - Обеспечить консистентность с другими компонентами
  - **Requirements:** ui.7.2


### 31. Модульные Тесты для ErrorNotificationManager

- [ ] 31.1 Тест: showNotification() создает уведомление с корректными данными
  - Вызвать showNotification('Error message', 'Context')
  - Проверить, что уведомление добавлено в массив notifications
  - Проверить, что уведомление содержит message, context, id, timestamp
  - Проверить, что listeners уведомлены об изменении
  - **Requirements:** ui.7.1, ui.7.2

- [ ] 31.2 Тест: showNotification() автоматически закрывает уведомление через 15 секунд
  - Вызвать showNotification('Error message', 'Context')
  - Получить id уведомления
  - Подождать 15 секунд (использовать jest.useFakeTimers())
  - Проверить, что уведомление удалено из массива
  - **Requirements:** ui.7.3

- [ ] 31.3 Тест: dismissNotification() удаляет уведомление
  - Создать уведомление через showNotification()
  - Получить id уведомления
  - Вызвать dismissNotification(id)
  - Проверить, что уведомление удалено из массива
  - Проверить, что listeners уведомлены об изменении
  - **Requirements:** ui.7.3

- [ ] 31.4 Тест: subscribe() регистрирует listener и возвращает unsubscribe функцию
  - Создать mock listener
  - Вызвать subscribe(listener)
  - Создать уведомление
  - Проверить, что listener был вызван с массивом уведомлений
  - Вызвать unsubscribe функцию
  - Создать еще одно уведомление
  - Проверить, что listener НЕ был вызван повторно
  - **Requirements:** ui.7.1

### 32. Модульные Тесты для NotificationUI Component

- [ ] 32.1 Тест: отображает список уведомлений
  - Создать mock ErrorNotificationManager с несколькими уведомлениями
  - Рендерить компонент NotificationUI
  - Проверить, что все уведомления отображаются
  - Проверить, что для каждого уведомления отображается context и message
  - **Requirements:** ui.7.1, ui.7.2

- [ ] 32.2 Тест: закрывает уведомление при клике на кнопку
  - Создать mock ErrorNotificationManager с уведомлением
  - Рендерить компонент NotificationUI
  - Кликнуть на кнопку закрытия
  - Проверить, что dismissNotification() был вызван с правильным id
  - **Requirements:** ui.7.3

- [ ] 32.3 Тест: закрывает уведомление при клике на само уведомление
  - Создать mock ErrorNotificationManager с уведомлением
  - Рендерить компонент NotificationUI
  - Кликнуть на уведомление
  - Проверить, что dismissNotification() был вызван с правильным id
  - **Requirements:** ui.7.3

- [ ] 32.4 Тест: обновляется при изменении уведомлений
  - Создать mock ErrorNotificationManager
  - Рендерить компонент NotificationUI
  - Проверить, что subscribe() был вызван
  - Триггернуть callback с новым массивом уведомлений
  - Проверить, что компонент обновился и отображает новые уведомления
  - **Requirements:** ui.7.1

### 33. Интеграция с Main Process

- [ ] 33.1 Создать централизованный обработчик ошибок в Main Process
  - Реализовать функцию `handleBackgroundError(error, context)`
  - Логировать ошибку в консоль с контекстом
  - Отправлять событие `error:notify` в Renderer Process
  - **Requirements:** ui.7.1, ui.7.4
  - **Property:** 20, 23

- [ ] 33.2 Интегрировать обработчик ошибок с существующими компонентами
  - Добавить обработку ошибок в UserProfileManager.fetchProfile()
  - Добавить обработку ошибок в OAuthClientManager
  - Добавить обработку ошибок в DataManager
  - Добавить обработку ошибок в других фоновых процессах
  - **Requirements:** ui.7.1

### 34. Функциональные Тесты (Error Notifications)

- [ ] 34.1 Функциональный тест: should show error notification on background process failure
  - Запустить приложение
  - Мокировать фоновый процесс (например, fetchProfile) для выброса ошибки
  - Триггернуть фоновый процесс
  - Проверить, что уведомление об ошибке отображается
  - Проверить, что уведомление содержит сообщение и контекст
  - Закрыть приложение
  - **Requirements:** ui.7.1, ui.7.2
  - **Property:** 20, 21

- [ ] 34.2 Функциональный тест: should auto-dismiss error notification after 15 seconds
  - Запустить приложение
  - Триггернуть ошибку для отображения уведомления
  - Проверить, что уведомление отображается
  - Подождать 15 секунд
  - Проверить, что уведомление автоматически исчезло
  - Закрыть приложение
  - **Requirements:** ui.7.3
  - **Property:** 22

- [ ] 34.3 Функциональный тест: should dismiss notification on click
  - Запустить приложение
  - Триггернуть ошибку для отображения уведомления
  - Проверить, что уведомление отображается
  - Кликнуть на уведомление
  - Проверить, что уведомление исчезло
  - Закрыть приложение
  - **Requirements:** ui.7.3
  - **Property:** 22

- [ ] 34.4 Функциональный тест: should log errors to console
  - Запустить приложение с доступом к консоли
  - Триггернуть ошибку в фоновом процессе
  - Проверить, что ошибка залогирована в консоль
  - Проверить, что лог содержит контекст и сообщение об ошибке
  - Закрыть приложение
  - **Requirements:** ui.7.4
  - **Property:** 23

### 35. Обновление Документации (Error Notifications)

- [ ] 35.1 Добавить JSDoc комментарии к ErrorNotificationManager
  - Документировать все публичные методы
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.7

- [ ] 35.2 Добавить JSDoc комментарии к NotificationUI
  - Документировать компонент и его props
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.7

- [ ] 35.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.7.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.7

### 36. Валидация и Финализация (Error Notifications)

- [ ] 36.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.7

- [ ] 36.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.7.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.7

- [ ] 36.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.7


## Фаза 6: Управление Токенами и Обработка Ошибок Авторизации

### 37. Централизованный Обработчик API Запросов

- [ ] 37.1 Создать функцию handleAPIRequest()
  - Реализовать обертку над fetch() для всех API запросов
  - Добавить проверку HTTP 401 Unauthorized
  - При 401: очистить все токены через window.api.auth.clearTokens()
  - При 401: показать LoginError компонент с errorCode 'invalid_grant'
  - При 401: залогировать событие с контекстом (URL, timestamp)
  - Пробросить ошибку для обработки вызывающим кодом
  - **Requirements:** ui.9.3, ui.9.4, ui.9.5
  - **Property:** 29, 30, 31

- [ ] 37.2 Интегрировать handleAPIRequest() с UserProfileManager
  - Заменить прямые вызовы fetch() на handleAPIRequest()
  - Обеспечить корректную обработку ошибок 401
  - Проверить, что данные профиля в базе НЕ очищаются при 401
  - **Requirements:** ui.9.3, ui.9.4

- [ ] 37.3 Интегрировать handleAPIRequest() с другими API клиентами
  - Добавить в Calendar API клиент (если существует)
  - Добавить в Tasks API клиент (если существует)
  - Добавить в другие API клиенты, использующие Google APIs
  - Обеспечить единообразную обработку 401 во всех клиентах
  - **Requirements:** ui.9.3, ui.9.4

### 38. Автоматическое Обновление Токенов

- [ ] 38.1 Проверить существующую реализацию refreshAccessToken()
  - Убедиться, что метод работает в фоновом режиме
  - Убедиться, что пользователь не видит прерываний
  - Убедиться, что нет уведомлений пользователю при успешном refresh
  - **Requirements:** ui.9.1, ui.9.2
  - **Property:** 28

- [ ] 38.2 Добавить автоматический триггер refresh при истечении токена
  - Проверить, что getAuthStatus() автоматически обновляет токен при истечении
  - Проверить, что обновление происходит прозрачно для пользователя
  - Проверить, что профиль обновляется после refresh (через updateProfileAfterTokenRefresh)
  - **Requirements:** ui.9.1, ui.9.2

### 39. Обработка Множественных Одновременных Ошибок 401

- [ ] 39.1 Добавить защиту от race conditions в handleAPIRequest()
  - Реализовать флаг или mutex для предотвращения множественных очисток токенов
  - Обеспечить, что clearTokens() вызывается только один раз при множественных 401
  - Обеспечить, что LoginError показывается только один раз
  - **Requirements:** ui.9.4
  - **Property:** 30

- [ ] 39.2 Добавить тесты для одновременных запросов с 401
  - Создать сценарий с несколькими одновременными API запросами
  - Мокировать все запросы для возврата 401
  - Проверить, что clearTokens() вызван только один раз
  - Проверить, что не возникает race conditions
  - **Requirements:** ui.9.4

### 40. Модульные Тесты для handleAPIRequest()

- [ ] 40.1 Тест: успешный API запрос возвращает response
  - Мокировать fetch для возврата успешного response (200)
  - Вызвать handleAPIRequest()
  - Проверить, что возвращается response
  - Проверить, что clearTokens() НЕ вызван
  - **Requirements:** ui.9.4

- [ ] 40.2 Тест: HTTP 401 очищает токены и показывает LoginError
  - Мокировать fetch для возврата 401
  - Мокировать window.api.auth.clearTokens()
  - Мокировать window.api.auth.emitAuthError()
  - Вызвать handleAPIRequest()
  - Проверить, что clearTokens() был вызван
  - Проверить, что emitAuthError() был вызван с errorCode 'invalid_grant'
  - Проверить, что выброшена ошибка
  - **Requirements:** ui.9.3, ui.9.4

- [ ] 40.3 Тест: HTTP 401 логирует событие с контекстом
  - Мокировать fetch для возврата 401
  - Мокировать console.error
  - Вызвать handleAPIRequest() с URL
  - Проверить, что console.error был вызван
  - Проверить, что лог содержит URL и контекст
  - **Requirements:** ui.9.5

- [ ] 40.4 Тест: другие HTTP ошибки не очищают токены
  - Мокировать fetch для возврата 500
  - Мокировать window.api.auth.clearTokens()
  - Вызвать handleAPIRequest()
  - Проверить, что clearTokens() НЕ был вызван
  - Проверить, что ошибка пробрасывается
  - **Requirements:** ui.9.4


### 41. Модульные Тесты для Автоматического Обновления Токенов

- [ ] 41.1 Тест: refreshAccessToken() работает в фоновом режиме
  - Мокировать Google Token API
  - Вызвать refreshAccessToken()
  - Проверить, что метод выполняется асинхронно
  - Проверить, что не показываются уведомления пользователю
  - **Requirements:** ui.9.1, ui.9.2

- [ ] 41.2 Тест: getAuthStatus() автоматически обновляет истекший токен
  - Мокировать токены с истекшим access token
  - Мокировать Google Token API для refresh
  - Вызвать getAuthStatus()
  - Проверить, что refreshAccessToken() был вызван автоматически
  - Проверить, что возвращается обновленный токен
  - **Requirements:** ui.9.1

- [ ] 41.3 Тест: профиль обновляется после успешного refresh
  - Мокировать истекший access token
  - Мокировать успешный refresh
  - Мокировать UserProfileManager.updateProfileAfterTokenRefresh()
  - Вызвать refreshAccessToken()
  - Проверить, что updateProfileAfterTokenRefresh() был вызван
  - **Requirements:** ui.9.2

### 42. Функциональные Тесты (Token Management)

- [ ] 42.1 Функциональный тест: should automatically refresh expired access token
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

- [ ] 42.2 Функциональный тест: should clear session and show login on 401 error
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

- [ ] 42.3 Функциональный тест: should handle 401 from any API endpoint consistently
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

- [ ] 42.4 Функциональный тест: should log authorization errors with context
  - Запустить приложение с доступом к консоли
  - Мокировать API запрос для возврата 401
  - Триггернуть API запрос
  - Проверить, что ошибка залогирована в консоль
  - Проверить, что лог содержит контекст: URL запроса, timestamp, тип ошибки
  - Проверить, что пользователю показывается только понятное сообщение (без технических деталей)
  - Закрыть приложение
  - **Requirements:** ui.9.5, ui.9.6
  - **Property:** 31

- [ ] 42.5 Функциональный тест: should show user-friendly error message on session expiry
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

- [ ] 42.6 Функциональный тест: should handle multiple simultaneous 401 errors
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

- [ ] 43.1 Добавить JSDoc комментарии к handleAPIRequest()
  - Документировать функцию и ее параметры
  - Добавить примеры использования
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.9

- [ ] 43.2 Обновить документацию OAuthClientManager
  - Документировать автоматическое обновление токенов
  - Добавить примеры обработки ошибок 401
  - Указать ссылки на требования в комментариях
  - **Requirements:** ui.9

- [ ] 43.3 Обновить таблицу покрытия требований в design.md
  - Добавить требования ui.9.x
  - Указать покрытие модульными и функциональными тестами
  - **Requirements:** ui.9

### 44. Валидация и Финализация (Token Management)

- [ ] 44.1 Запустить автоматическую валидацию
  - Выполнить `npm run validate`
  - Исправить все ошибки TypeScript
  - Исправить все ошибки ESLint
  - Исправить форматирование Prettier
  - **Requirements:** ui.9

- [ ] 44.2 Проверить покрытие тестами
  - Убедиться, что покрытие >= 85%
  - Убедиться, что все требования ui.9.x покрыты тестами
  - Обновить таблицу покрытия в design.md
  - **Requirements:** ui.9

- [ ] 44.3 Проверить комментарии с требованиями
  - Убедиться, что все функции имеют комментарии // Requirements:
  - Убедиться, что все тесты имеют структурированные комментарии
  - Проверить корректность ссылок на требования
  - **Requirements:** ui.9

## Финальная Валидация Всех Фаз

### 45. Комплексная Проверка

- [ ] 45.1 Проверить покрытие всех требований
  - Убедиться, что все требования ui.1-ui.9 покрыты задачами
  - Убедиться, что все 31 свойство покрыты тестами
  - Проверить таблицу покрытия в design.md
  - **Requirements:** ui.1-ui.9

- [ ] 45.2 Запустить полную валидацию
  - Выполнить `npm run validate`
  - Убедиться, что все проверки проходят
  - Убедиться, что покрытие >= 85%
  - **Requirements:** ui.1-ui.9

- [ ] 45.3 Проверить интеграцию между фазами
  - Убедиться, что Window Management работает корректно
  - Убедиться, что Account Profile интегрирован с OAuth
  - Убедиться, что Navigation работает с авторизацией
  - Убедиться, что Error Notifications работают во всех компонентах
  - Убедиться, что Token Management работает прозрачно
  - **Requirements:** ui.1-ui.9

- [ ] 45.4 Запустить функциональные тесты (при явной просьбе пользователя)
  - Запустить все функциональные тесты из фаз 1-6
  - Убедиться, что все тесты проходят
  - Исправить любые найденные проблемы
  - **Requirements:** ui.1-ui.9


