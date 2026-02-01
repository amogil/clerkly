# План Реализации: Очистка Интерфейса

## Обзор

Данный план описывает пошаговое удаление всех UI компонентов кроме авторизации и упрощение приложения до минимального состояния. Порядок задач оптимизирован для минимизации ошибок компиляции и тестирования.

## Задачи

- [x] 1. Удалить функциональные тесты UI
  - Удалить файлы тестов навигации, сайдбара, фокуса, клавиатуры
  - Удалить утилиты валидации навигации и toggle
  - Удалить тесты утилит
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 2. Удалить модульные тесты UI
  - Удалить тесты IPC обработчиков сайдбара
  - Удалить тесты персистентности сайдбара
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 3. Упростить App.tsx
  - [x] 3.1 Удалить импорты UI компонентов
    - Удалить импорты Navigation, Dashboard, Calendar, Tasks, Contacts, Settings, MeetingDetail
    - Оставить только импорт AuthGate
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 Удалить состояние навигации и сайдбара
    - Удалить состояние currentScreen
    - Удалить состояние selectedMeetingId
    - Удалить состояние isSidebarCollapsed
    - Удалить состояние isSidebarLoading
    - _Requirements: 1.4, 1.5_

  - [x] 3.3 Удалить методы навигации и сайдбара
    - Удалить handleNavigateToMeeting
    - Удалить handleBackToDashboard
    - Удалить handleNavigateToCalendar
    - Удалить handleToggleSidebar
    - Удалить renderScreen
    - _Requirements: 1.3, 1.5_

  - [x] 3.4 Удалить useLayoutEffect для сайдбара
    - Удалить useLayoutEffect который загружает состояние сайдбара
    - Удалить вызовы window.clerkly.getSidebarState()
    - _Requirements: 1.5_

  - [x] 3.5 Упростить рендеринг
    - Для авторизованного состояния рендерить `<div className="min-h-screen bg-white" />`
    - Для неавторизованного состояния рендерить AuthGate
    - Удалить условный рендеринг Navigation и других компонентов
    - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3_

  - [x] 3.6 Написать тесты на основе свойств для App.tsx
    - **Property 1: Auth Gate для неавторизованных**
    - **Validates: Requirements 1.1, 10.1**

  - [x] 3.7 Написать тесты на основе свойств для белого окна
    - **Property 2: Белое окно для авторизованных**
    - **Validates: Requirements 1.2, 9.1, 9.2, 9.3, 10.3**

- [x] 4. Удалить UI компоненты
  - Удалить renderer/src/app/components/navigation.tsx
  - Удалить renderer/src/app/components/dashboard-updated.tsx
  - Удалить renderer/src/app/components/calendar-view.tsx
  - Удалить renderer/src/app/components/tasks-new.tsx
  - Удалить renderer/src/app/components/contacts.tsx
  - Удалить renderer/src/app/components/settings.tsx
  - Удалить renderer/src/app/components/meeting-detail.tsx
  - Удалить renderer/src/app/components/logo.tsx
  - Удалить renderer/src/app/components/status-badge.tsx
  - Оставить renderer/src/app/components/auth-gate.tsx
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 5. Удалить IPC обработчики сайдбара из main.ts
  - [x] 5.1 Удалить функцию registerSidebarHandlers
    - Удалить всю функцию registerSidebarHandlers(db: SqliteDatabase)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Удалить вспомогательные функции сайдбара
    - Удалить функцию getSidebarCollapsed
    - Удалить функцию setSidebarCollapsed
    - Удалить константу SIDEBAR_STATE_KEY
    - _Requirements: 3.3_

  - [x] 5.3 Удалить вызов registerSidebarHandlers
    - Удалить вызов registerSidebarHandlers(db) из app.whenReady()
    - Обновить логирование для отражения удаленных обработчиков
    - _Requirements: 3.1, 3.2_

  - [x] 5.4 Написать тест для проверки отсутствия IPC обработчиков
    - Проверить, что вызов sidebar:get-state приводит к ошибке
    - Проверить, что вызов sidebar:set-state приводит к ошибке
    - **Example 3: Удаление IPC обработчиков сайдбара**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 6. Обновить типы IPC
  - [x] 6.1 Удалить методы сайдбара из ClerklyAPI
    - Удалить getSidebarState из интерфейса ClerklyAPI
    - Удалить setSidebarState из интерфейса ClerklyAPI
    - _Requirements: 3.4, 8.2_

  - [x] 6.2 Удалить импорт SidebarState (если не используется)
    - Проверить, используется ли SidebarState в других местах
    - Если нет, удалить из импортов
    - _Requirements: 3.4_

  - [x] 6.3 Написать тест для проверки типов IPC
    - Проверить, что ClerklyAPI содержит только методы авторизации
    - Проверить, что методы сайдбара отсутствуют
    - **Example 4: Удаление типов IPC для сайдбара**
    - **Validates: Requirements 3.4, 8.1, 8.2**

- [x] 7. Обновить preload.ts
  - Удалить реализацию getSidebarState из preload.ts
  - Удалить реализацию setSidebarState из preload.ts
  - Убедиться, что только методы авторизации экспонируются
  - _Requirements: 3.4, 8.1_

- [x] 8. Checkpoint - Проверка компиляции и тестов
  - Запустить `npx tsc --noEmit` для проверки типов
  - Запустить `npm run lint` для проверки стиля кода
  - Запустить `npm test` для проверки модульных тестов
  - Убедиться, что нет ошибок компиляции или тестирования
  - Если есть ошибки, исправить их перед продолжением
  - _Requirements: 8.3_

- [ ] 9. Удалить спецификации UI
  - Удалить директорию .kiro/specs/sidebar-navigation/ со всеми файлами
  - Удалить директорию .kiro/specs/branding-system/ со всеми файлами
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 10. Написать тесты для проверки структуры файлов
  - [ ] 10.1 Написать тест для проверки удаленных файлов
    - Проверить, что все удаленные компоненты не существуют
    - Проверить, что все удаленные тесты не существуют
    - Проверить, что удаленные спецификации не существуют
    - **Example 2: Удаление UI компонентов и тестов**
    - **Validates: Requirements 2.1-2.10, 4.1-4.10, 5.1-5.3, 6.1-6.3**

  - [ ] 10.2 Написать тест для проверки сохраненных файлов
    - Проверить, что auth-gate.tsx существует
    - Проверить, что спецификации platform-foundation, data-storage, google-oauth-auth, testing-infrastructure существуют
    - Проверить, что функциональные тесты авторизации существуют
    - **Example 6: Сохранение базовой инфраструктуры**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

  - [ ] 10.3 Написать тест для проверки отсутствия логики навигации
    - Проверить, что App.tsx не содержит currentScreen
    - Проверить, что App.tsx не содержит selectedMeetingId
    - Проверить, что App.tsx не содержит isSidebarCollapsed
    - Проверить, что App.tsx не содержит методы навигации
    - **Example 1: Отсутствие логики навигации в App Component**
    - **Validates: Requirements 1.3, 1.4, 1.5**

- [ ] 11. Финальная валидация
  - [ ] 11.1 Запустить полную проверку TypeScript
    - Выполнить `npx tsc --noEmit`
    - Убедиться, что нет ошибок типов
    - _Requirements: 8.3_

  - [ ] 11.2 Запустить линтинг
    - Выполнить `npm run lint`
    - Исправить все найденные проблемы
    - _Requirements: 8.3_

  - [ ] 11.3 Запустить все модульные тесты
    - Выполнить `npm test`
    - Убедиться, что все тесты проходят
    - _Requirements: 8.3_

  - [ ] 11.4 Запустить функциональные тесты авторизации
    - Выполнить `npm run test:functional -- auth-flow.spec.ts`
    - Выполнить `npm run test:functional -- auth-completion.spec.ts`
    - Выполнить `npm run test:functional -- sign-out.spec.ts`
    - Убедиться, что все тесты проходят
    - _Requirements: 7.5_

  - [ ] 11.5 Запустить приложение и проверить визуально
    - Выполнить `npm run dev`
    - Проверить, что показывается экран авторизации
    - Выполнить авторизацию
    - Проверить, что показывается белое окно
    - Проверить, что нет ошибок в консоли
    - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

- [ ] 12. Финальный checkpoint - Убедиться, что все работает
  - Все тесты проходят
  - TypeScript компилируется без ошибок
  - ESLint не находит проблем
  - Приложение запускается и работает корректно
  - Белое окно отображается после авторизации
  - Нет ошибок в консоли или логах
  - Спросить пользователя, если возникли вопросы

## Примечания

- Каждая задача ссылается на конкретные требования для отслеживаемости
- Checkpoint задачи обеспечивают инкрементальную валидацию
- Тесты на основе свойств валидируют универсальные свойства корректности
- Модульные тесты валидируют конкретные примеры и граничные случаи
- Все задачи обязательны для комплексного тестирования
