# План Разбиения Больших Спецификаций

**Issue:** #9 - Сделать документы с требованиями и спеками меньше
**Branch:** feature/9-split-large-specs
**Цель:** Разбить большие документы спецификаций (>1000 строк) на логические фичи

## Критерии Приемки

1. ✅ Нет документов с дизайном и списком задач больше 1000 строк
2. ✅ Все дизайны и списки задач приведены в соответствие требованиям и друг другу
3. ✅ Ссылки на требования в коде и тестах обновлены
4. ✅ Все валидации и тесты проходят

## Текущее Состояние

### Проблемные Документы
- `ui/design.md` - 4895 строк ❌
- `ui/tasks.md` - 2695 строк ❌
- `clerkly/design.md` - 2731 строка ❌
- `google-oauth-auth/design.md` - 1323 строки ❌

### Новые Спецификации (из ui)

1. **window-management** - Управление окнами (ui.1-5)
2. **navigation** - Навигация и роутинг (ui.8)
3. **account-profile** - Профиль пользователя (ui.6)
4. **error-notifications** - Обработка ошибок (ui.7)
5. **token-management-ui** - UI управления токенами (ui.9)
6. **settings** - Настройки приложения (ui.10, ui.11)
7. **user-data-isolation** - Изоляция данных пользователей (ui.12)

---

## Этап 1: Создание Requirements для Новых Спецификаций

### 1.0 Добавить архитектурный принцип в clerkly/requirements.md
- [x] Добавить секцию "Архитектурные Принципы"
- [x] Добавить "Принцип Единого Источника Истины (Single Source of Truth)"
- [x] Указать применение принципа ко всем спецификациям
- [x] Коммит: включено в общий коммит Этапа 1

### 1.1 Создать window-management/requirements.md
- [x] Создать директорию `.kiro/specs/window-management/`
- [x] Извлечь требования ui.1-5 из `ui/requirements.md`
- [x] Создать `window-management/requirements.md` с:
  - Введение
  - Глоссарий (Window State, Maximized State, etc.)
  - Архитектурный принцип (Single Source of Truth)
  - Требования window-management.1-5 (переименованные из ui.1-5)
  - Функциональные тесты
  - Вне области применения
- [x] Коммит: "feat: create window-management requirements"

### 1.2 Создать navigation/requirements.md
- [x] Создать директорию `.kiro/specs/navigation/`
- [x] Извлечь требование ui.8 из `ui/requirements.md`
- [x] Создать `navigation/requirements.md` с:
  - Введение
  - Глоссарий (Protected Routes, Auth Guard, etc.)
  - Архитектурный принцип (Single Source of Truth, БЕЗ Token Management - он в google-oauth-auth)
  - Требование navigation.1 (переименованное из ui.8)
  - Зависимости на google-oauth-auth
  - Функциональные тесты
  - Вне области применения
- [x] Исправлено: убран "Принцип Управления Токенами" (он относится к google-oauth-auth)
- [x] Коммит: "feat: create navigation requirements"

### 1.3 Создать account-profile/requirements.md
- [x] Создать директорию `.kiro/specs/account-profile/`
- [x] Извлечь требование ui.6 из `ui/requirements.md`
- [x] Создать `account-profile/requirements.md` с:
  - Введение
  - Глоссарий (Account Block, User Profile, etc.)
  - Архитектурный принцип (Single Source of Truth)
  - Требование account-profile.1 (переименованное из ui.6)
  - Зависимости на google-oauth-auth
  - Функциональные тесты
  - Вне области применения
- [x] Коммит: "feat: create account-profile requirements"

### 1.4 Создать error-notifications/requirements.md
- [x] Создать директорию `.kiro/specs/error-notifications/`
- [x] Извлечь требование ui.7 из `ui/requirements.md`
- [x] Создать `error-notifications/requirements.md` с:
  - Введение
  - Глоссарий (Error Notification, Toast, etc.)
  - Требование error-notifications.1 (переименованное из ui.7)
  - Зависимости на clerkly.3 (Logger)
  - Функциональные тесты
  - Вне области применения
- [x] Коммит: "feat: create error-notifications requirements"

### 1.5 Создать token-management-ui/requirements.md
- [x] Создать директорию `.kiro/specs/token-management-ui/`
- [x] Извлечь требование ui.9 из `ui/requirements.md`
- [x] Создать `token-management-ui/requirements.md` с:
  - Введение
  - Глоссарий (Access Token, Refresh Token, HTTP 401, etc.)
  - Примечание о том, что backend логика токенов в google-oauth-auth
  - Требование token-management-ui.1 (переименованное из ui.9)
  - Зависимости на google-oauth-auth
  - Функциональные тесты
  - Вне области применения
- [x] Исправлено: убран "Архитектурный Принцип Управления Токенами" (он относится к google-oauth-auth)
- [x] Коммит: "feat: create token-management-ui requirements"

### 1.6 Создать settings/requirements.md
- [x] Создать директорию `.kiro/specs/settings/`
- [x] Извлечь требования ui.10, ui.11 из `ui/requirements.md`
- [x] Создать `settings/requirements.md` с:
  - Введение
  - Глоссарий (AI Agent Settings, LLM Provider, System Locale, etc.)
  - Требование settings.1 (переименованное из ui.10) - AI Agent
  - Требование settings.2 (переименованное из ui.11) - Date/Time Formatting
  - Зависимости на user-data-isolation
  - Функциональные тесты
  - Вне области применения
- [x] Коммит: "feat: create settings requirements"

### 1.7 Создать user-data-isolation/requirements.md
- [x] Создать директорию `.kiro/specs/user-data-isolation/`
- [x] Извлечь требование ui.12 из `ui/requirements.md`
- [x] Создать `user-data-isolation/requirements.md` с:
  - Введение
  - Глоссарий (User Email, Data Isolation, etc.)
  - Архитектурный принцип (Single Source of Truth)
  - Требование user-data-isolation.1 (переименованное из ui.12)
  - Зависимости на google-oauth-auth
  - Функциональные тесты
  - Вне области применения
- [x] Коммит: "feat: create user-data-isolation requirements"

---

## Этап 2: Создание Design для Новых Спецификаций

### 2.1 Создать window-management/design.md
- [x] Извлечь соответствующие секции из `ui/design.md`
- [x] Создать `window-management/design.md` с:
  - Обзор
  - Архитектура (WindowManager, WindowStateManager)
  - Компоненты и интерфейсы
  - Модели данных (WindowState)
  - Свойства корректности (Properties 1-7)
  - Стратегия тестирования
  - Таблица покрытия требований
- [x] Коммит: "feat: create window-management design"

### 2.2 Создать navigation/design.md
- [x] Извлечь соответствующие секции из `ui/design.md`
- [x] Создать `navigation/design.md` с:
  - Обзор
  - Архитектура (Router, AuthGuard)
  - Компоненты и интерфейсы
  - Модели данных (Routes)
  - Свойства корректности (Properties 29-33)
  - Стратегия тестирования
  - Таблица покрытия требований
- [x] Коммит: "feat: create navigation design"

### 2.3 Создать account-profile/design.md
- [x] Извлечь соответствующие секции из `ui/design.md`
- [x] Создать `account-profile/design.md` с:
  - Обзор
  - Архитектура (Account компонент)
  - Компоненты и интерфейсы
  - Модели данных (UserProfile)
  - Свойства корректности (Properties 15-20)
  - Стратегия тестирования
  - Таблица покрытия требований
- [x] Коммит: "feat: create account-profile design"

### 2.4 Создать error-notifications/design.md
- [x] Извлечь соответствующие секции из `ui/design.md`
- [x] Создать `error-notifications/design.md` с:
  - Обзор
  - Архитектура (ErrorNotification компонент)
  - Компоненты и интерфейсы
  - Модели данных (ErrorNotification)
  - Свойства корректности (Properties 25-28)
  - Стратегия тестирования
  - Таблица покрытия требований
- [x] Коммит: "feat: create error-notifications design"

### 2.5 Создать token-management-ui/design.md
- [ ] Извлечь соответствующие секции из `ui/design.md`
- [ ] Создать `token-management-ui/design.md` с:
  - Обзор
  - Архитектура (Token refresh flow)
  - Компоненты и интерфейсы
  - Модели данных
  - Свойства корректности (Properties 22-24)
  - Стратегия тестирования
  - Таблица покрытия требований
- [ ] Коммит: "feat: create token-management-ui design"

### 2.6 Создать settings/design.md
- [ ] Извлечь соответствующие секции из `ui/design.md`
- [ ] Создать `settings/design.md` с:
  - Обзор
  - Архитектура (Settings компонент, AIAgentSettings, DateTimeFormatter)
  - Компоненты и интерфейсы
  - Модели данных (AIAgentSettings)
  - Свойства корректности
  - Стратегия тестирования
  - Таблица покрытия требований
- [ ] Коммит: "feat: create settings design"

### 2.7 Создать user-data-isolation/design.md
- [ ] Извлечь соответствующие секции из `ui/design.md`
- [ ] Создать `user-data-isolation/design.md` с:
  - Обзор
  - Архитектура (DataManager с user_email фильтрацией)
  - Компоненты и интерфейсы
  - Модели данных (user_data таблица)
  - Свойства корректности
  - Стратегия тестирования
  - Таблица покрытия требований
- [ ] Коммит: "feat: create user-data-isolation design"

---

## Этап 3: Создание Tasks для Новых Спецификаций

### 3.1 Создать window-management/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `window-management/tasks.md` с задачами для:
  - WindowManager расширение
  - WindowStateManager реализация
  - Тесты (модульные, property-based, функциональные)
- [ ] Коммит: "feat: create window-management tasks"

### 3.2 Создать navigation/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `navigation/tasks.md` с задачами для:
  - Router реализация
  - AuthGuard реализация
  - Тесты
- [ ] Коммит: "feat: create navigation tasks"

### 3.3 Создать account-profile/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `account-profile/tasks.md` с задачами для:
  - Account компонент
  - Интеграция с UserProfileManager
  - Тесты
- [ ] Коммит: "feat: create account-profile tasks"

### 3.4 Создать error-notifications/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `error-notifications/tasks.md` с задачами для:
  - ErrorNotification компонент
  - IPC события для ошибок
  - Тесты
- [ ] Коммит: "feat: create error-notifications tasks"

### 3.5 Создать token-management-ui/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `token-management-ui/tasks.md` с задачами для:
  - Автоматический refresh токенов
  - Обработка 401 ошибок
  - Тесты
- [ ] Коммит: "feat: create token-management-ui tasks"

### 3.6 Создать settings/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `settings/tasks.md` с задачами для:
  - Settings компонент
  - AIAgentSettings
  - DateTimeFormatter
  - Тесты
- [ ] Коммит: "feat: create settings tasks"

### 3.7 Создать user-data-isolation/tasks.md
- [ ] Извлечь соответствующие задачи из `ui/tasks.md`
- [ ] Создать `user-data-isolation/tasks.md` с задачами для:
  - DataManager обновление
  - UserProfileManager обновление
  - Миграция БД
  - Тесты
- [ ] Коммит: "feat: create user-data-isolation tasks"

---

## Этап 4: Обновление Ссылок в Коде и Тестах

### 4.1 Найти все ссылки на ui требования
- [ ] Выполнить: `grep -r "ui\.[0-9]" src/ tests/ --include="*.ts" --include="*.tsx" > ui_references.txt`
- [ ] Проанализировать файл с ссылками

### 4.2 Обновить ссылки в src/
- [ ] Обновить `src/renderer/App.tsx`:
  - ui.6 → account-profile.1
  - ui.7 → error-notifications.1
  - ui.8 → navigation.1
  - ui.9 → token-management-ui.1
- [ ] Обновить `src/main/WindowManager.ts`:
  - ui.1-5 → window-management.1-5
- [ ] Обновить `src/main/WindowStateManager.ts`:
  - ui.5 → window-management.5
- [ ] Обновить `src/main/DataManager.ts`:
  - ui.12 → user-data-isolation.1
- [ ] Обновить `src/main/auth/UserProfileManager.ts`:
  - ui.6, ui.12 → account-profile.1, user-data-isolation.1
- [ ] Обновить `src/renderer/components/auth/*`:
  - ui.8 → navigation.1
- [ ] Обновить `src/renderer/components/settings/*`:
  - ui.10, ui.11 → settings.1, settings.2
- [ ] Коммит: "refactor: update requirement references in src/"

### 4.3 Обновить ссылки в tests/unit/
- [ ] Найти все тесты со ссылками на ui
- [ ] Обновить комментарии Requirements в тестах
- [ ] Коммит: "refactor: update requirement references in tests/unit/"

### 4.4 Обновить ссылки в tests/property/
- [ ] Найти все property-based тесты со ссылками на ui
- [ ] Обновить комментарии Requirements в тестах
- [ ] Коммит: "refactor: update requirement references in tests/property/"

### 4.5 Обновить ссылки в tests/functional/
- [ ] Обновить `tests/functional/window-state-persistence.spec.ts`:
  - ui.1-5 → window-management.1-5
- [ ] Обновить `tests/functional/navigation.spec.ts`:
  - ui.8 → navigation.1
- [ ] Обновить `tests/functional/account-profile.spec.ts`:
  - ui.6 → account-profile.1
- [ ] Обновить `tests/functional/error-notifications.spec.ts`:
  - ui.7 → error-notifications.1
- [ ] Обновить `tests/functional/token-management.spec.ts`:
  - ui.9 → token-management-ui.1
- [ ] Обновить `tests/functional/settings-ai-agent.spec.ts`:
  - ui.10 → settings.1
- [ ] Обновить `tests/functional/date-time-formatting.spec.ts`:
  - ui.11 → settings.2
- [ ] Обновить `tests/functional/user-data-isolation.spec.ts`:
  - ui.12 → user-data-isolation.1
- [ ] Коммит: "refactor: update requirement references in tests/functional/"

### 4.6 Обновить ссылки в других спецификациях
- [ ] Проверить `google-oauth-auth/requirements.md` на ссылки на ui
- [ ] Проверить `google-oauth-auth/design.md` на ссылки на ui
- [ ] Проверить `clerkly/requirements.md` на ссылки на ui
- [ ] Проверить `clerkly/design.md` на ссылки на ui
- [ ] Обновить все найденные ссылки
- [ ] Коммит: "refactor: update ui references in other specs"

---

## Этап 5: Удаление Старой Спецификации UI

### 5.1 Создать архивную копию
- [ ] Создать директорию `.kiro/specs/_archive/`
- [ ] Переместить `ui/` в `.kiro/specs/_archive/ui/`
- [ ] Коммит: "chore: archive old ui specification"

### 5.2 Удалить архивную копию (опционально)
- [ ] Удалить `.kiro/specs/_archive/ui/` если не нужна
- [ ] Коммит: "chore: remove archived ui specification"

---

## Этап 6: Оптимизация Других Больших Спецификаций

### 6.1 Оптимизировать clerkly/design.md (2731 строка)
- [ ] Проанализировать содержимое
- [ ] Вынести детали тестирования в testing-infrastructure
- [ ] Оставить только высокоуровневую архитектуру
- [ ] Цель: < 1000 строк
- [ ] Коммит: "refactor: optimize clerkly design document"

### 6.2 Оптимизировать google-oauth-auth/design.md (1323 строки)
- [ ] Проанализировать возможность разбиения на:
  - oauth-flow (процесс авторизации)
  - token-management (управление токенами - backend)
- [ ] Если разбиение целесообразно - создать новые спецификации
- [ ] Если нет - оптимизировать текущую
- [ ] Цель: < 1000 строк на документ
- [ ] Коммит: "refactor: optimize google-oauth-auth design"

---

## Этап 7: Валидация и Финализация

### 7.1 Проверить размеры документов
- [ ] Выполнить: `find .kiro/specs -name "*.md" -type f -exec wc -l {} \; | sort -rn`
- [ ] Убедиться, что все design.md и tasks.md < 1000 строк

### 7.2 Запустить валидацию
- [ ] Выполнить: `npm run validate`
- [ ] Исправить все ошибки TypeScript
- [ ] Исправить все ошибки ESLint
- [ ] Исправить все ошибки Prettier
- [ ] Убедиться, что все модульные тесты проходят
- [ ] Убедиться, что все property-based тесты проходят

### 7.3 Запустить функциональные тесты (с подтверждением)
- [ ] Спросить пользователя о запуске функциональных тестов
- [ ] Если да: `npm run test:functional`
- [ ] Убедиться, что все функциональные тесты проходят

### 7.4 Обновить README.md
- [ ] Обновить секцию "Документация" с новыми спецификациями
- [ ] Коммит: "docs: update README with new spec structure"

### 7.5 Финальный коммит
- [ ] Коммит: "feat: complete spec splitting - closes #9"
- [ ] Push в remote: `git push origin feature/9-split-large-specs`

---

## Прогресс

**Этап 1:** ✅ 8/8 задач
**Этап 2:** ⬜ 4/7 задач
**Этап 3:** ⬜ 0/7 задач
**Этап 4:** ⬜ 0/6 задач
**Этап 5:** ⬜ 0/2 задач
**Этап 6:** ⬜ 0/2 задач
**Этап 7:** ⬜ 0/5 задач

**Общий прогресс:** 12/37 задач (32%)

---

## Примечания

- Каждый этап требует подтверждения пользователя перед началом
- После каждого подэтапа делается коммит
- Все ссылки на требования должны быть обновлены
- Валидация должна проходить без ошибок
- Функциональные тесты запускаются только с явного разрешения пользователя
