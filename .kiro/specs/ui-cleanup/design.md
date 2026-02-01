# Документ Дизайна: Очистка Интерфейса

## Обзор

Данный дизайн описывает полную переделку пользовательского интерфейса приложения Clerkly с целью максимального упрощения. Приложение будет сведено к минимальному состоянию: экран авторизации для неавторизованных пользователей и простое белое окно для авторизованных пользователей.

### Цели Дизайна

1. **Минимализм**: Удалить всю сложную навигацию и UI компоненты
2. **Простота**: Оставить только базовую функциональность авторизации
3. **Чистота кода**: Удалить неиспользуемый код, тесты и спецификации
4. **Сохранение инфраструктуры**: Оставить базовую платформу для будущего развития

### Текущее Состояние

Приложение имеет:

- Сложный UI с навигацией, сайдбаром, дашбордом, календарем, задачами, контактами, настройками
- 9 UI компонентов в renderer/src/app/components/
- IPC обработчики для сайдбара (get-state, set-state)
- Множество функциональных тестов UI (focus-management, keyboard-navigation, navigation, sidebar и т.д.)
- Спецификации sidebar-navigation и branding-system

### Целевое Состояние

Приложение будет иметь:

- Только компонент Auth Gate для авторизации
- Белое окно после успешной авторизации
- Упрощенный App.tsx без логики навигации
- Только IPC обработчики авторизации
- Только функциональные тесты авторизации
- Только спецификации platform-foundation, data-storage, google-oauth-auth, testing-infrastructure

## Архитектура

### Компонентная Структура

```
renderer/src/app/
├── App.tsx (упрощенный)
└── components/
    └── auth-gate.tsx (единственный оставшийся компонент)
```

### Поток Данных

```
Пользователь не авторизован
    ↓
Auth Gate отображается
    ↓
Пользователь нажимает "Sign In"
    ↓
IPC: auth:open-google
    ↓
Google OAuth Flow
    ↓
IPC: auth:result event
    ↓
App.tsx обновляет authState
    ↓
Белое окно отображается
```

## Компоненты и Интерфейсы

### App Component (Упрощенный)

**Назначение**: Главный компонент приложения, управляющий состоянием авторизации и отображением соответствующего UI.

**Состояние**:

```typescript
type AuthState = "unauthorized" | "authorizing" | "authorized" | "error";

interface AppState {
  authState: AuthState;
  authError: string | null;
}
```

**Методы**:

- `handleSignIn()`: Инициирует процесс авторизации через Google OAuth
- `handleSignOut()`: Выполняет выход из системы

**Рендеринг**:

```typescript
if (authState === "authorized") {
  return <div className="min-h-screen bg-white" />;
} else {
  return <AuthGate isAuthorizing={...} errorMessage={...} onSignIn={...} />;
}
```

**Удаляемая Функциональность**:

- Состояние currentScreen
- Состояние selectedMeetingId
- Состояние isSidebarCollapsed
- Состояние isSidebarLoading
- Метод handleNavigateToMeeting
- Метод handleBackToDashboard
- Метод handleNavigateToCalendar
- Метод handleToggleSidebar
- Метод renderScreen
- useLayoutEffect для загрузки состояния сайдбара

### Auth Gate Component (Сохраняется)

**Назначение**: Отображает экран авторизации для неавторизованных пользователей.

**Props**:

```typescript
interface AuthGateProps {
  isAuthorizing: boolean;
  errorMessage: string | null;
  onSignIn: () => void;
}
```

**Функциональность**: Остается без изменений.

### Удаляемые Компоненты

Следующие компоненты будут полностью удалены:

1. **Navigation Component** (`navigation.tsx`)
   - Боковая панель навигации
   - Кнопки навигации между экранами
   - Логика сворачивания/разворачивания

2. **Dashboard Component** (`dashboard-updated.tsx`)
   - Главный экран с информацией
   - Карточки встреч и задач

3. **Calendar Component** (`calendar-view.tsx`)
   - Календарь встреч
   - Навигация по датам

4. **Tasks Component** (`tasks-new.tsx`)
   - Список задач
   - Управление задачами

5. **Contacts Component** (`contacts.tsx`)
   - Список контактов
   - Управление контактами

6. **Settings Component** (`settings.tsx`)
   - Настройки приложения
   - Кнопка выхода

7. **Meeting Detail Component** (`meeting-detail.tsx`)
   - Детальная информация о встрече

8. **Logo Component** (`logo.tsx`)
   - Логотип приложения

9. **Status Badge Component** (`status-badge.tsx`)
   - Бейджи статусов

## Модели Данных

### IPC Types (Обновленные)

**Текущий ClerklyAPI Interface**:

```typescript
export interface ClerklyAPI {
  // Authentication methods
  openGoogleAuth: () => Promise<AuthResult>;
  getAuthState: () => Promise<AuthState>;
  signOut: () => Promise<OperationResult>;

  // Sidebar methods (УДАЛИТЬ)
  getSidebarState: () => Promise<SidebarState>;
  setSidebarState: (collapsed: boolean) => Promise<OperationResult>;

  // Event listeners
  onAuthResult: (callback: (result: AuthResult) => void) => () => void;
}
```

**Целевой ClerklyAPI Interface**:

```typescript
export interface ClerklyAPI {
  // Authentication methods
  openGoogleAuth: () => Promise<AuthResult>;
  getAuthState: () => Promise<AuthState>;
  signOut: () => Promise<OperationResult>;

  // Event listeners
  onAuthResult: (callback: (result: AuthResult) => void) => () => void;
}
```

**Удаляемые Типы**:

- `SidebarState` (если не используется в других местах)
- Методы `getSidebarState` и `setSidebarState` из интерфейса

### Main Process (Обновленный)

**Удаляемые IPC Handlers**:

- `sidebar:get-state`
- `sidebar:set-state`

**Удаляемые Функции**:

- `registerSidebarHandlers(db: SqliteDatabase): void`
- `getSidebarCollapsed(db: SqliteDatabase): boolean`
- `setSidebarCollapsed(db: SqliteDatabase, collapsed: boolean): void`

**Удаляемые Константы**:

- `SIDEBAR_STATE_KEY`

**Сохраняемые IPC Handlers**:

- `auth:open-google`
- `auth:get-state`
- `auth:sign-out`
- `performance:get-metrics`
- `security:audit`
- `preload:log`

### Database Schema

База данных остается без изменений. Таблица `app_meta` сохраняется для будущего использования, хотя ключ `sidebar_collapsed` больше не будет использоваться.

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно выполняться во всех допустимых выполнениях системы - по сути, формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Отображение Auth Gate для Неавторизованных Пользователей

_Для любого_ состояния приложения где пользователь не авторизован (authState = "unauthorized", "authorizing", или "error"), App Component должен рендерить только Auth Gate компонент с соответствующими props.

**Validates: Requirements 1.1, 10.1**

### Property 2: Отображение Белого Окна для Авторизованных Пользователей

_Для любого_ состояния приложения где пользователь авторизован (authState = "authorized"), App Component должен рендерить div элемент с классами "min-h-screen bg-white" без каких-либо дочерних элементов.

**Validates: Requirements 1.2, 9.1, 9.2, 9.3, 10.3**

### Example 1: Отсутствие Логики Навигации в App Component

App.tsx не должен содержать:

- Состояние `currentScreen` или аналогичное
- Состояние `selectedMeetingId` или аналогичное
- Состояние `isSidebarCollapsed` или аналогичное
- Состояние `isSidebarLoading` или аналогичное
- Методы навигации между экранами
- Методы управления сайдбаром
- useLayoutEffect для загрузки состояния сайдбара

**Validates: Requirements 1.3, 1.4, 1.5**

### Example 2: Удаление UI Компонентов и Тестов

Следующие файлы не должны существовать в кодовой базе:

- `renderer/src/app/components/navigation.tsx`
- `renderer/src/app/components/dashboard-updated.tsx`
- `renderer/src/app/components/calendar-view.tsx`
- `renderer/src/app/components/tasks-new.tsx`
- `renderer/src/app/components/contacts.tsx`
- `renderer/src/app/components/settings.tsx`
- `renderer/src/app/components/meeting-detail.tsx`
- `renderer/src/app/components/logo.tsx`
- `renderer/src/app/components/status-badge.tsx`
- `tests/functional/focus-management.spec.ts`
- `tests/functional/keyboard-navigation.spec.ts`
- `tests/functional/navigation.spec.ts`
- `tests/functional/navigation-active-state.spec.ts`
- `tests/functional/sidebar-collapse.spec.ts`
- `tests/functional/sidebar-state-loading.spec.ts`
- `tests/functional/settings-toggles.spec.ts`
- `tests/functional/utils/navigation-validation.ts`
- `tests/functional/utils/toggle-validation.ts`
- `tests/utils/navigation-validation.test.ts`
- `tests/utils/toggle-validation.test.ts`
- `tests/unit/sidebar-ipc-handlers.test.ts`
- `tests/unit/sidebar-persistence.test.ts`
- `.kiro/specs/sidebar-navigation/` (вся директория)
- `.kiro/specs/branding-system/` (вся директория)

При этом файл `renderer/src/app/components/auth-gate.tsx` должен существовать.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3**

### Example 3: Удаление IPC Обработчиков Сайдбара

IPC каналы `sidebar:get-state` и `sidebar:set-state` не должны быть зарегистрированы в main process. Попытка вызвать эти каналы должна приводить к ошибке.

Функции `registerSidebarHandlers`, `getSidebarCollapsed`, `setSidebarCollapsed` и константа `SIDEBAR_STATE_KEY` не должны существовать в `main.ts`.

**Validates: Requirements 3.1, 3.2, 3.3**

### Example 4: Удаление Типов IPC для Сайдбара

Интерфейс `ClerklyAPI` в `renderer/src/types/ipc.d.ts` не должен содержать методы:

- `getSidebarState: () => Promise<SidebarState>`
- `setSidebarState: (collapsed: boolean) => Promise<OperationResult>`

Интерфейс должен содержать только методы авторизации:

- `openGoogleAuth: () => Promise<AuthResult>`
- `getAuthState: () => Promise<AuthState>`
- `signOut: () => Promise<OperationResult>`
- `onAuthResult: (callback: (result: AuthResult) => void) => () => void`

**Validates: Requirements 3.4, 8.1, 8.2**

### Example 5: Успешная Компиляция TypeScript

Команда `npx tsc --noEmit` должна завершаться без ошибок типов после всех изменений.

**Validates: Requirements 8.3**

### Example 6: Сохранение Базовой Инфраструктуры

Следующие спецификации и их тесты должны остаться без изменений:

- `.kiro/specs/platform-foundation/` (вся директория)
- `.kiro/specs/data-storage/` (вся директория)
- `.kiro/specs/google-oauth-auth/` (вся директория)
- `.kiro/specs/testing-infrastructure/` (вся директория)
- `tests/functional/auth-flow.spec.ts`
- `tests/functional/auth-completion.spec.ts`
- `tests/functional/sign-out.spec.ts`

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

## Обработка Ошибок

### Ошибки Компиляции

**Проблема**: После удаления компонентов и IPC обработчиков могут возникнуть ошибки компиляции TypeScript.

**Решение**:

1. Удалить все импорты удаленных компонентов из App.tsx
2. Удалить все ссылки на удаленные типы из ipc.d.ts
3. Удалить вызовы удаленных IPC обработчиков из main.ts
4. Запустить `npx tsc --noEmit` для проверки

### Ошибки Тестов

**Проблема**: Оставшиеся тесты могут ссылаться на удаленные компоненты или IPC каналы.

**Решение**:

1. Проверить все тесты на наличие импортов удаленных компонентов
2. Удалить или обновить тесты, которые зависят от удаленной функциональности
3. Запустить `npm test` для проверки

### Ошибки Линтинга

**Проблема**: ESLint может обнаружить неиспользуемые импорты или переменные.

**Решение**:

1. Запустить `npm run lint` для обнаружения проблем
2. Исправить или удалить неиспользуемый код
3. Запустить `npm run lint:fix` для автоматического исправления

### Ошибки Runtime

**Проблема**: Приложение может попытаться вызвать удаленные IPC обработчики.

**Решение**:

1. Убедиться, что все вызовы `window.clerkly.getSidebarState()` и `window.clerkly.setSidebarState()` удалены
2. Проверить, что нет условной логики, зависящей от удаленных компонентов
3. Запустить приложение и проверить консоль на наличие ошибок

## Стратегия Тестирования

### Двойной Подход к Тестированию

Данная спецификация использует комбинацию модульных тестов и тестов на основе свойств:

- **Модульные тесты**: Проверяют конкретные примеры, граничные случаи и условия ошибок
- **Тесты на основе свойств**: Проверяют универсальные свойства для всех входных данных
- Вместе они обеспечивают комплексное покрытие (модульные тесты выявляют конкретные баги, тесты свойств проверяют общую корректность)

### Модульные Тесты

**Тесты Структуры Файлов**:

- Проверить, что удаленные файлы не существуют
- Проверить, что сохраненные файлы существуют
- Проверить, что директории спецификаций удалены

**Тесты Компиляции**:

- Проверить, что TypeScript компилируется без ошибок
- Проверить, что ESLint не находит проблем

**Тесты IPC**:

- Проверить, что вызов `sidebar:get-state` приводит к ошибке
- Проверить, что вызов `sidebar:set-state` приводит к ошибке
- Проверить, что вызовы авторизации работают корректно

### Тесты на Основе Свойств

**Property 1: Auth Gate для Неавторизованных**:

- Генерировать случайные неавторизованные состояния
- Проверять, что рендерится только Auth Gate

**Property 2: Белое Окно для Авторизованных**:

- Генерировать случайные авторизованные состояния
- Проверять, что рендерится белый div без дочерних элементов

### Конфигурация Тестов на Основе Свойств

- Использовать библиотеку `fast-check` для TypeScript
- Минимум 100 итераций на тест свойства
- Каждый тест должен ссылаться на свойство из дизайна
- Формат тега: **Feature: ui-cleanup, Property {number}: {property_text}**

### Функциональные Тесты

**Тесты Авторизации** (сохраняются):

- `auth-flow.spec.ts`: Проверка полного потока авторизации
- `auth-completion.spec.ts`: Проверка завершения авторизации
- `sign-out.spec.ts`: Проверка выхода из системы

**Тесты UI** (удаляются):

- Все тесты навигации, сайдбара, фокуса, клавиатуры удаляются

### Критерии Завершения

Работа считается завершенной, когда:

- ✅ Все удаленные файлы не существуют
- ✅ Все сохраненные файлы существуют
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Все модульные тесты проходят
- ✅ Все тесты на основе свойств проходят (минимум 100 итераций каждый)
- ✅ Функциональные тесты авторизации проходят
- ✅ Приложение запускается и показывает белое окно после авторизации
- ✅ Нет ошибок в консоли браузера или main process

## Примечания по Реализации

### Порядок Удаления

Рекомендуемый порядок удаления для минимизации ошибок:

1. **Удалить функциональные тесты UI** (чтобы они не падали при удалении компонентов)
2. **Удалить модульные тесты UI** (чтобы они не падали при удалении IPC обработчиков)
3. **Упростить App.tsx** (удалить логику навигации и сайдбара)
4. **Удалить UI компоненты** (после того как они больше не используются)
5. **Удалить IPC обработчики сайдбара** (из main.ts)
6. **Обновить типы IPC** (удалить методы сайдбара)
7. **Удалить спецификации** (sidebar-navigation, branding-system)
8. **Запустить валидацию** (TypeScript, ESLint, тесты)

### Откат Изменений

Если что-то пойдет не так, можно откатить изменения используя git:

```bash
git checkout HEAD -- <file>
```

Или откатить все изменения:

```bash
git reset --hard HEAD
```

### Проверка После Удаления

После каждого шага удаления рекомендуется:

1. Запустить `npx tsc --noEmit` для проверки типов
2. Запустить `npm run lint` для проверки стиля кода
3. Запустить `npm test` для проверки тестов
4. Запустить приложение для проверки runtime поведения
