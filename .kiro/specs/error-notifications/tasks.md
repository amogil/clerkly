# План Реализации: Error Notifications

## Обзор

Данный документ содержит список задач для реализации системы уведомлений об ошибках в приложении Clerkly. Система включает отображение ошибок фоновых процессов, автоматическое закрытие уведомлений, логирование через централизованный Logger класс и фильтрацию race condition ошибок.

## Задачи

- [ ] 1. Создать ErrorNotificationManager в Renderer Process
  - Создать файл `src/renderer/ErrorNotificationManager.ts`
  - Реализовать класс с методами `showNotification()`, `dismissNotification()`, `subscribe()`
  - Реализовать автоматическое закрытие уведомлений через 15 секунд
  - Реализовать управление списком активных уведомлений
  - _Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3_

- [ ]* 1.1 Написать модульные тесты для ErrorNotificationManager
  - Тест: показ уведомления с сообщением и контекстом
  - Тест: закрытие уведомления по требованию
  - Тест: автоматическое закрытие через 15 секунд
  - Тест: уведомление слушателей при изменениях
  - _Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3_

- [ ] 2. Создать NotificationUI компонент
  - [ ] 2.1 Создать React компонент NotificationUI
    - Создать файл `src/renderer/components/NotificationUI.tsx`
    - Реализовать отображение списка уведомлений
    - Реализовать отображение контекста и сообщения об ошибке
    - Реализовать кнопку закрытия уведомления
    - Реализовать закрытие по клику на уведомление
    - _Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3_

  - [ ] 2.2 Создать стили для NotificationUI
    - Создать CSS стили для toast уведомлений
    - Добавить анимацию появления/исчезновения
    - Обеспечить адаптивность на разных размерах экрана
    - Использовать существующие цвета и шрифты темы
    - _Requirements: error-notifications.1.1, error-notifications.1.2_

  - [ ]* 2.3 Написать модульные тесты для NotificationUI
    - Тест: отображение уведомления с контекстом и сообщением
    - Тест: закрытие уведомления по клику
    - Тест: закрытие уведомления по кнопке dismiss
    - Тест: обработка ошибок рендеринга
    - _Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3_

- [ ] 3. Создать Error Handler в Main Process
  - [ ] 3.1 Создать функцию handleBackgroundError
    - Создать файл `src/main/ErrorHandler.ts` (или добавить в существующий файл)
    - Реализовать функцию `handleBackgroundError(error, context)`
    - Интегрировать с централизованным Logger классом (clerkly.3)
    - Реализовать отправку IPC события `error:notify` в Renderer
    - _Requirements: error-notifications.1.1, error-notifications.1.4, clerkly.3.1, clerkly.3.6_

  - [ ] 3.2 Реализовать фильтрацию race condition ошибок
    - Создать функцию `shouldFilterError(error, context)`
    - Реализовать фильтрацию "No user logged in" во время logout
    - Реализовать фильтрацию отмененных операций
    - Реализовать фильтрацию race condition ошибок
    - Логировать отфильтрованные ошибки без отправки уведомления
    - _Requirements: error-notifications.1.5, user-data-isolation.1.21_

  - [ ]* 3.3 Написать модульные тесты для Error Handler
    - Тест: логирование ошибки и отправка IPC уведомления
    - Тест: обработка отсутствующего окна gracefully
    - Тест: фильтрация "No user logged in" во время logout
    - Тест: фильтрация отмененных операций
    - Тест: фильтрация race condition ошибок
    - _Requirements: error-notifications.1.1, error-notifications.1.4, error-notifications.1.5, user-data-isolation.1.21_

- [ ] 4. Интегрировать IPC события
  - [ ] 4.1 Обновить preload script
    - Добавить API для подписки на событие `error:notify`
    - Реализовать безопасную передачу данных через contextBridge
    - Реализовать автоматическую очистку слушателей
    - _Requirements: error-notifications.1.1_

  - [ ] 4.2 Интегрировать с App.tsx
    - Создать экземпляр ErrorNotificationManager
    - Добавить компонент NotificationUI в главный компонент
    - Подписаться на событие `error:notify` через window.api
    - Вызывать `showNotification()` при получении события
    - _Requirements: error-notifications.1.1_

- [ ] 5. Checkpoint - Убедиться что базовая функциональность работает
  - Убедиться что все тесты проходят, спросить пользователя если возникли вопросы.

- [ ] 6. Интегрировать с существующими компонентами
  - [ ] 6.1 Обновить обработку ошибок в OAuth flow
    - Использовать `handleBackgroundError()` для ошибок авторизации
    - Передавать контекст "OAuth Flow" или "Token Refresh"
    - _Requirements: error-notifications.1.1, error-notifications.1.4_

  - [ ] 6.2 Обновить обработку ошибок в UserProfileManager
    - Использовать `handleBackgroundError()` для ошибок загрузки профиля
    - Передавать контекст "Profile Loading"
    - _Requirements: error-notifications.1.1, error-notifications.1.4_

  - [ ] 6.3 Обновить обработку ошибок в других фоновых процессах
    - Использовать `handleBackgroundError()` для ошибок синхронизации данных
    - Использовать `handleBackgroundError()` для ошибок API запросов
    - Передавать соответствующий контекст для каждой операции
    - _Requirements: error-notifications.1.1, error-notifications.1.4_

- [ ]* 7. Написать функциональные тесты
  - [ ]* 7.1 Тест: показ уведомления при ошибке фонового процесса
    - **Validates: Requirements error-notifications.1.1, error-notifications.1.2**
    - Запустить приложение
    - Симулировать ошибку фонового процесса
    - Проверить что уведомление отображается с контекстом и сообщением

  - [ ]* 7.2 Тест: автоматическое закрытие уведомления через 15 секунд
    - **Validates: Requirements error-notifications.1.3**
    - Показать уведомление
    - Подождать 15 секунд
    - Проверить что уведомление исчезло

  - [ ]* 7.3 Тест: закрытие уведомления по клику
    - **Validates: Requirements error-notifications.1.3**
    - Показать уведомление
    - Кликнуть на уведомление
    - Проверить что уведомление исчезло немедленно

  - [ ]* 7.4 Тест: логирование ошибок в консоль
    - **Validates: Requirements error-notifications.1.4**
    - Симулировать ошибку фонового процесса
    - Проверить что ошибка залогирована в консоль с контекстом

  - [ ]* 7.5 Тест: фильтрация race condition ошибок во время logout
    - **Validates: Requirements error-notifications.1.5, user-data-isolation.1.21**
    - Симулировать ошибку "No user logged in" во время logout
    - Проверить что ошибка залогирована
    - Проверить что уведомление НЕ показано пользователю
    - Проверить что залогировано сообщение о фильтрации

- [ ] 8. Final checkpoint - Убедиться что все тесты проходят
  - Убедиться что все тесты проходят, спросить пользователя если возникли вопросы.

## Примечания

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для отслеживаемости
- Checkpoints обеспечивают инкрементальную валидацию
- Модульные тесты проверяют конкретные примеры и граничные случаи
- Функциональные тесты проверяют end-to-end сценарии с реальным Electron
- Все комментарии в коде должны быть на английском языке
- Функциональные тесты запускаются ТОЛЬКО при явной просьбе пользователя
