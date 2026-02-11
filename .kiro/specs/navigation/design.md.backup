# Документ Дизайна: Система Навигации

## Обзор

Данный документ описывает архитектуру и дизайн системы навигации приложения Clerkly, включая управление переходами между экранами, защиту маршрутов и интеграцию с системой авторизации.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DataManager) является единственным источником истины для всех данных приложения**.

**Ключевые аспекты:**

1. **UI отображает данные из базы**: Все компоненты интерфейса читают данные из базы данных, а не хранят собственное состояние данных
2. **Реактивное обновление**: При изменении данных в базе UI автоматически обновляется через систему событий (IPC)
3. **Фоновая синхронизация**: Фоновые процессы обновляют базу данных, изменения автоматически попадают в UI

**Поток данных:**
```
External API → Main Process → Database → IPC Event → Renderer → UI Update
```

Этот принцип обеспечивает:
- Консистентность данных во всем приложении
- Offline-first подход (приложение работает с локальными данными)
- Плавный UX без мерцания пустых состояний
- Простоту отладки и тестирования
- Надежность (данные персистентны)

### Цели Дизайна

- Обеспечить защиту маршрутов от неавторизованного доступа
- Автоматически перенаправлять пользователей в зависимости от статуса авторизации
- Интегрироваться с системой OAuth для реагирования на события авторизации
- Предоставить централизованное управление навигацией
- Обеспечить простоту добавления новых защищенных маршрутов

### Технологический Стек

- **React Router**: Библиотека для маршрутизации в React приложениях
- **TypeScript**: Язык программирования для типобезопасности
- **IPC (Inter-Process Communication)**: Electron API для связи между процессами
- **OAuth Events**: События авторизации для синхронизации состояния


## Архитектура

### Компоненты Системы

Система навигации состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐                                    │
│  │ OAuthClientManager   │                                    │
│  │                      │                                    │
│  │ - getAuthStatus()    │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │ IPC: auth:status
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │     NavigationManager          │         │
   │  │                                │         │
   │  │  - checkAuthStatus()           │         │
   │  │  - redirectToLogin()           │         │
   │  │  - redirectToDashboard()       │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │        AuthGuard               │         │
   │  │                                │         │
   │  │  - canActivate()               │         │
   │  │  - protectedRoutes[]           │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │         Router                 │         │
   │  │                                │         │
   │  │  - /login                      │         │
   │  │  - /dashboard (protected)      │         │
   │  │  - /settings (protected)       │         │
   │  │  - /tasks (protected)          │         │
   │  │  - /calendar (protected)       │         │
   │  │  - /contacts (protected)       │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Данных

1. **Запуск приложения**:
   - `NavigationManager` проверяет статус авторизации через IPC
   - Если пользователь не авторизован → перенаправление на `/login`
   - Если пользователь авторизован → остается на текущем маршруте или перенаправляется на `/dashboard`

2. **Попытка доступа к защищенному маршруту**:
   - `AuthGuard` проверяет, является ли маршрут защищенным
   - Если маршрут защищен → проверяет статус авторизации
   - Если не авторизован → блокирует доступ и перенаправляет на `/login`
   - Если авторизован → разрешает доступ

3. **Успешная авторизация**:
   - OAuth система генерирует событие `auth:success`
   - `NavigationManager` слушает событие и перенаправляет на `/dashboard`

4. **Выход из системы**:
   - OAuth система генерирует событие `auth:logout`
   - `NavigationManager` слушает событие и перенаправляет на `/login`


## Компоненты и Интерфейсы

### NavigationManager

Класс для управления навигацией и перенаправлениями.

```typescript
// Requirements: navigation.1.1, navigation.1.7, navigation.1.9

class NavigationManager {
  private router: Router;
  
  constructor(router: Router) {
    this.router = router;
  }

  /**
   * Check authentication status and redirect if needed
   * Requirements: navigation.1.1
   */
  async checkAuthStatus(): Promise<boolean> {
    try {
      const result = await window.api.auth.getAuthStatus();
      return result.authorized;
    } catch (error) {
      console.error('[NavigationManager] Failed to check auth status:', error);
      return false;
    }
  }

  /**
   * Redirect to login screen
   * Requirements: navigation.1.1, navigation.1.9
   */
  redirectToLogin(): void {
    console.log('[NavigationManager] Redirecting to login');
    this.router.navigate('/login');
  }

  /**
   * Redirect to dashboard
   * Requirements: navigation.1.7
   */
  redirectToDashboard(): void {
    console.log('[NavigationManager] Redirecting to dashboard');
    this.router.navigate('/dashboard');
  }

  /**
   * Initialize navigation on app start
   * Requirements: navigation.1.1, navigation.1.7
   */
  async initialize(): Promise<void> {
    const isAuthenticated = await this.checkAuthStatus();
    
    if (!isAuthenticated) {
      this.redirectToLogin();
    } else {
      // If already on login screen, redirect to dashboard
      if (this.router.currentRoute === '/login') {
        this.redirectToDashboard();
      }
    }
  }
}
```

**Ключевые методы:**
- `checkAuthStatus()`: Проверяет статус авторизации через IPC
- `redirectToLogin()`: Перенаправляет на экран логина
- `redirectToDashboard()`: Перенаправляет на главный экран
- `initialize()`: Инициализирует навигацию при запуске приложения


### AuthGuard

Компонент для защиты маршрутов от неавторизованного доступа.

```typescript
// Requirements: navigation.1.2

class AuthGuard {
  private navigationManager: NavigationManager;
  private protectedRoutes: string[] = [
    '/dashboard',
    '/settings',
    '/tasks',
    '/calendar',
    '/contacts'
  ];

  constructor(navigationManager: NavigationManager) {
    this.navigationManager = navigationManager;
  }

  /**
   * Check if route can be activated
   * Requirements: navigation.1.2
   */
  async canActivate(route: string): Promise<boolean> {
    // Public routes are always accessible
    if (!this.isProtectedRoute(route)) {
      return true;
    }

    // Check authentication for protected routes
    const isAuthenticated = await this.navigationManager.checkAuthStatus();
    
    if (!isAuthenticated) {
      console.log('[AuthGuard] Access denied to protected route:', route);
      this.navigationManager.redirectToLogin();
      return false;
    }

    return true;
  }

  /**
   * Check if route is protected
   */
  private isProtectedRoute(route: string): boolean {
    return this.protectedRoutes.some(protected => route.startsWith(protected));
  }
}
```

**Ключевые особенности:**
- Список защищенных маршрутов: `/dashboard`, `/settings`, `/tasks`, `/calendar`, `/contacts`
- Публичные маршруты (например, `/login`) доступны всем
- Автоматическое перенаправление на логин при попытке доступа к защищенному маршруту

### Интеграция с OAuth Events

```typescript
// Requirements: navigation.1.7, navigation.1.9

// In App.tsx or main application component
useEffect(() => {
  // Requirements: navigation.1.7 - Redirect to dashboard after successful auth
  const unsubscribeAuthSuccess = window.api.auth.onAuthSuccess(() => {
    console.log('[App] Auth success event received, redirecting to dashboard');
    navigationManager.redirectToDashboard();
  });

  // Requirements: navigation.1.9 - Redirect to login after logout
  const unsubscribeLogout = window.api.auth.onLogout(() => {
    console.log('[App] Logout event received, redirecting to login');
    navigationManager.redirectToLogin();
  });

  return () => {
    unsubscribeAuthSuccess();
    unsubscribeLogout();
  };
}, []);
```

**События OAuth:**
- `auth:success`: Генерируется при успешной авторизации → перенаправление на Dashboard
- `auth:logout`: Генерируется при выходе из системы → перенаправление на Login


## Потоки Навигации

### 1. Запуск приложения (неавторизованный пользователь)

```
App Start → NavigationManager.initialize() → checkAuthStatus() → not authorized → redirectToLogin()
```

**Шаги:**
1. Приложение запускается
2. `NavigationManager.initialize()` вызывается
3. `checkAuthStatus()` проверяет статус авторизации через IPC
4. Статус: не авторизован
5. `redirectToLogin()` перенаправляет на `/login`

**Результат:** Пользователь видит экран логина

### 2. Запуск приложения (авторизованный пользователь)

```
App Start → NavigationManager.initialize() → checkAuthStatus() → authorized → stay on current route or redirectToDashboard()
```

**Шаги:**
1. Приложение запускается
2. `NavigationManager.initialize()` вызывается
3. `checkAuthStatus()` проверяет статус авторизации через IPC
4. Статус: авторизован
5. Если текущий маршрут `/login` → `redirectToDashboard()`
6. Иначе → остается на текущем маршруте

**Результат:** Пользователь видит Dashboard или последний открытый экран

### 3. Успешная авторизация

```
OAuth Success → auth:success event → onAuthSuccess() → redirectToDashboard()
```

**Шаги:**
1. Пользователь успешно авторизуется через Google OAuth
2. OAuth система генерирует событие `auth:success`
3. `onAuthSuccess()` обработчик получает событие
4. `redirectToDashboard()` перенаправляет на `/dashboard`

**Результат:** Пользователь автоматически перенаправляется на Dashboard

### 4. Попытка доступа к защищенному маршруту

```
Navigate to /settings → AuthGuard.canActivate() → checkAuthStatus() → not authorized → redirectToLogin()
```

**Шаги:**
1. Неавторизованный пользователь пытается перейти на `/settings`
2. `AuthGuard.canActivate()` проверяет маршрут
3. Маршрут защищен → проверяет статус авторизации
4. Статус: не авторизован
5. `redirectToLogin()` перенаправляет на `/login`
6. `canActivate()` возвращает `false` (доступ заблокирован)

**Результат:** Доступ заблокирован, пользователь перенаправлен на логин

### 5. Выход из системы

```
Logout → auth:logout event → onLogout() → redirectToLogin()
```

**Шаги:**
1. Пользователь нажимает кнопку выхода
2. OAuth система очищает токены и генерирует событие `auth:logout`
3. `onLogout()` обработчик получает событие
4. `redirectToLogin()` перенаправляет на `/login`

**Результат:** Пользователь автоматически перенаправляется на экран логина


## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Показ экрана логина для неавторизованных пользователей

*Для любого* пользователя, который не авторизован, приложение должно показывать экран логина при запуске или при попытке доступа к приложению.

**Validates: Requirements navigation.1.1**

### Property 2: Блокировка доступа к защищенным экранам

*Для любого* неавторизованного пользователя, попытка доступа к защищенным экранам (Dashboard, Settings, Tasks, Calendar, Contacts) должна быть заблокирована, и пользователь должен быть перенаправлен на экран логина.

**Validates: Requirements navigation.1.2**

### Property 3: Открытие системного браузера для авторизации

*Для любого* пользователя, нажимающего кнопку "Continue with Google", приложение должно открыть системный браузер для авторизации через Google OAuth.

**Validates: Requirements navigation.1.3**

### Property 4: Кнопка авторизации остается активной

*Для любого* пользователя, открывшего браузер для авторизации, кнопка "Continue with Google" должна оставаться активной, позволяя открыть несколько вкладок браузера.

**Validates: Requirements navigation.1.4**

### Property 5: Показ loader при получении authorization code

*Для любого* пользователя, завершившего авторизацию в браузере, когда authorization code получен, приложение должно показать loader с текстом "Signing in...".

**Validates: Requirements navigation.1.5**

### Property 6: Синхронный обмен кода и загрузка профиля

*Для любого* пользователя, для которого отображается loader, приложение должно синхронно выполнить обмен authorization code на токены И загрузить профиль пользователя из Google UserInfo API.

**Validates: Requirements navigation.1.6**

### Property 7: Показ Dashboard после успешной авторизации и загрузки профиля

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth И для которого профиль успешно загружен, приложение должно показывать Dashboard (главный экран), а не Account Block или Settings.

**Validates: Requirements navigation.1.7**

### Property 8: Показ LoginError при ошибке авторизации

*Для любого* пользователя, для которого произошла ошибка авторизации (обмен токенов ИЛИ загрузка профиля), приложение должно показать LoginError компонент с описанием ошибки.

**Validates: Requirements navigation.1.8**

### Property 9: Перенаправление на Dashboard после успешной авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, приложение должно автоматически перенаправить пользователя на Dashboard (главный экран приложения).

**Validates: Requirements navigation.1.7**

### Property 10: Перенаправление на Login после logout

*Для любого* авторизованного пользователя, при выходе из системы (logout) приложение должно автоматически перенаправить пользователя на экран логина.

**Validates: Requirements navigation.1.9**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Не авторизован (navigation.1.1, navigation.1.2)**: Когда пользователь не авторизован, приложение показывает экран логина, и пользователь НЕ МОЖЕТ попасть в Settings (где находится Account Block). Это не edge case для Account компонента, так как компонент не должен быть доступен неавторизованным пользователям.

2. **Множественные попытки авторизации (navigation.1.3, navigation.1.4)**: Когда пользователь нажимает кнопку "Continue with Google", браузер открывается для авторизации, но кнопка остается активной. Пользователь может открыть несколько вкладок браузера для авторизации. Система корректно обрабатывает только первый успешный authorization code.

3. **Синхронная загрузка профиля при авторизации (navigation.1.5, navigation.1.6, navigation.1.7, navigation.1.8)**: Когда пользователь авторизуется через Google OAuth, система должна:
   - Показать loader с текстом "Signing in..." после получения authorization code (navigation.1.5)
   - Синхронно обменять код на токены И загрузить профиль во время отображения loader (navigation.1.6)
   - При успехе: показать Dashboard с заполненным Account Block (navigation.1.7)
   - При ошибке обмена токенов ИЛИ загрузки профиля: очистить токены и показать LoginError компонент с errorCode 'profile_fetch_failed' (navigation.1.8)


## Обработка Ошибок

### Стратегия Обработки Ошибок

Система навигации должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка проверки статуса авторизации

**Причины:**
- Ошибка IPC коммуникации
- Main process недоступен
- Таймаут запроса

**Обработка:**
```typescript
// Requirements: navigation.1.1
async checkAuthStatus(): Promise<boolean> {
  try {
    const result = await window.api.auth.getAuthStatus();
    return result.authorized;
  } catch (error) {
    console.error('[NavigationManager] Failed to check auth status:', error);
    return false; // Assume not authorized on error
  }
}
```

**Результат:** При ошибке считаем пользователя неавторизованным, перенаправляем на логин. Это безопасный fallback.

#### 2. Ошибка навигации

**Причины:**
- Некорректный маршрут
- Router не инициализирован
- Ошибка React Router

**Обработка:**
```typescript
// Requirements: navigation.1.1, navigation.1.7, navigation.1.9
redirectToLogin(): void {
  try {
    console.log('[NavigationManager] Redirecting to login');
    this.router.navigate('/login');
  } catch (error) {
    console.error('[NavigationManager] Failed to redirect to login:', error);
    // Fallback: reload page to /login
    window.location.href = '/login';
  }
}
```

**Результат:** При ошибке используется fallback через `window.location.href`.

#### 3. Ошибка AuthGuard

**Причины:**
- Ошибка проверки статуса авторизации
- NavigationManager недоступен

**Обработка:**
```typescript
// Requirements: navigation.1.2
async canActivate(route: string): Promise<boolean> {
  try {
    if (!this.isProtectedRoute(route)) {
      return true;
    }

    const isAuthenticated = await this.navigationManager.checkAuthStatus();
    
    if (!isAuthenticated) {
      console.log('[AuthGuard] Access denied to protected route:', route);
      this.navigationManager.redirectToLogin();
      return false;
    }

    return true;
  } catch (error) {
    console.error('[AuthGuard] Error checking route access:', error);
    // On error, deny access to protected routes
    if (this.isProtectedRoute(route)) {
      this.navigationManager.redirectToLogin();
      return false;
    }
    return true;
  }
}
```

**Результат:** При ошибке блокируем доступ к защищенным маршрутам и перенаправляем на логин.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс (clerkly.3):

```typescript
// Navigation errors
console.error('[NavigationManager] Failed to check auth status:', error);
console.error('[NavigationManager] Failed to redirect to login:', error);
console.error('[NavigationManager] Failed to redirect to dashboard:', error);
console.error('[NavigationManager] Failed to initialize navigation:', error);

// AuthGuard errors
console.error('[AuthGuard] Error checking route access:', error);
console.log('[AuthGuard] Access denied to protected route:', route);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace


## Стратегия Тестирования

### Двойной Подход к Тестированию

Система навигации будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Property-based тесты**: Проверяют универсальные свойства на множестве входных данных

Оба подхода необходимы для комплексного покрытия.

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Избегать написания слишком большого количества модульных тестов - property-based тесты покрывают множество входных данных
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок
- Property-based тесты должны фокусироваться на:
  - Универсальных свойствах, которые истинны для всех входных данных
  - Комплексном покрытии входных данных через рандомизацию

### Конфигурация Property-Based Тестов

- **Библиотека**: `fast-check` для TypeScript/JavaScript
- **Минимум итераций**: 100 итераций на property-based тест
- **Тегирование**: Каждый тест должен ссылаться на свойство из документа дизайна
- **Формат тега**: `Feature: navigation, Property {number}: {property_text}`

### Модульные Тесты

#### NavigationManager Tests

```typescript
describe('NavigationManager', () => {
  /* Preconditions: OAuthClientManager returns authorized status
     Action: call checkAuthStatus()
     Assertions: returns true
     Requirements: navigation.1.1 */
  it('should return true when user is authorized', async () => {
    // Тест проверки авторизованного пользователя
  });

  /* Preconditions: OAuthClientManager returns unauthorized status
     Action: call checkAuthStatus()
     Assertions: returns false
     Requirements: navigation.1.1 */
  it('should return false when user is not authorized', async () => {
    // Тест проверки неавторизованного пользователя
  });

  /* Preconditions: IPC call fails
     Action: call checkAuthStatus()
     Assertions: returns false, error logged
     Requirements: navigation.1.1 */
  it('should return false on IPC error', async () => {
    // Тест обработки ошибки IPC
  });

  /* Preconditions: NavigationManager initialized
     Action: call redirectToLogin()
     Assertions: router.navigate called with '/login'
     Requirements: navigation.1.1, navigation.1.9 */
  it('should redirect to login screen', () => {
    // Тест перенаправления на логин
  });

  /* Preconditions: NavigationManager initialized
     Action: call redirectToDashboard()
     Assertions: router.navigate called with '/dashboard'
     Requirements: navigation.1.7 */
  it('should redirect to dashboard', () => {
    // Тест перенаправления на dashboard
  });

  /* Preconditions: user not authorized
     Action: call initialize()
     Assertions: redirectToLogin called
     Requirements: navigation.1.1 */
  it('should redirect to login on app start when not authorized', async () => {
    // Тест инициализации для неавторизованного пользователя
  });

  /* Preconditions: user authorized, current route is /login
     Action: call initialize()
     Assertions: redirectToDashboard called
     Requirements: navigation.1.7 */
  it('should redirect to dashboard on app start when authorized and on login screen', async () => {
    // Тест инициализации для авторизованного пользователя на экране логина
  });

  /* Preconditions: user authorized, current route is /settings
     Action: call initialize()
     Assertions: no redirect, stays on /settings
     Requirements: navigation.1.1 */
  it('should stay on current route when authorized', async () => {
    // Тест сохранения текущего маршрута для авторизованного пользователя
  });
});
```


#### AuthGuard Tests

```typescript
describe('AuthGuard', () => {
  /* Preconditions: route is /login (public)
     Action: call canActivate('/login')
     Assertions: returns true, no auth check
     Requirements: navigation.1.1 */
  it('should allow access to public routes', async () => {
    // Тест доступа к публичным маршрутам
  });

  /* Preconditions: route is /dashboard (protected), user authorized
     Action: call canActivate('/dashboard')
     Assertions: returns true
     Requirements: navigation.1.2 */
  it('should allow access to protected routes when authorized', async () => {
    // Тест доступа к защищенным маршрутам для авторизованного пользователя
  });

  /* Preconditions: route is /dashboard (protected), user not authorized
     Action: call canActivate('/dashboard')
     Assertions: returns false, redirectToLogin called
     Requirements: navigation.1.2 */
  it('should deny access to protected routes when not authorized', async () => {
    // Тест блокировки доступа к защищенным маршрутам
  });

  /* Preconditions: route is /settings (protected), user not authorized
     Action: call canActivate('/settings')
     Assertions: returns false, redirectToLogin called
     Requirements: navigation.1.2 */
  it('should deny access to settings when not authorized', async () => {
    // Тест блокировки доступа к настройкам
  });

  /* Preconditions: checkAuthStatus throws error, route is protected
     Action: call canActivate('/dashboard')
     Assertions: returns false, redirectToLogin called, error logged
     Requirements: navigation.1.2 */
  it('should deny access on auth check error', async () => {
    // Тест обработки ошибки проверки авторизации
  });

  /* Preconditions: AuthGuard initialized
     Action: call isProtectedRoute with various routes
     Assertions: correct identification of protected routes
     Requirements: navigation.1.2 */
  it('should correctly identify protected routes', () => {
    // Тест идентификации защищенных маршрутов
  });
});
```

#### OAuth Events Integration Tests

```typescript
describe('OAuth Events Integration', () => {
  /* Preconditions: auth:success event emitted
     Action: event handler triggered
     Assertions: redirectToDashboard called
     Requirements: navigation.1.7 */
  it('should redirect to dashboard on auth success event', () => {
    // Тест перенаправления после успешной авторизации
  });

  /* Preconditions: auth:logout event emitted
     Action: event handler triggered
     Assertions: redirectToLogin called
     Requirements: navigation.1.9 */
  it('should redirect to login on logout event', () => {
    // Тест перенаправления после выхода
  });

  /* Preconditions: component unmounted
     Action: auth:success event emitted
     Assertions: no redirect (event unsubscribed)
     Requirements: navigation.1.7 */
  it('should unsubscribe from events on unmount', () => {
    // Тест отписки от событий
  });
});
```

### Property-Based Тесты

```typescript
import fc from 'fast-check';

describe('NavigationManager Property Tests', () => {
  /* Feature: navigation, Property 1: Показ экрана логина для неавторизованных пользователей
     Preconditions: various auth statuses
     Action: call initialize() with different auth states
     Assertions: redirectToLogin called when not authorized
     Requirements: navigation.1.1 */
  it('should always redirect to login when not authorized', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        async (isAuthorized) => {
          // Mock auth status
          mockAuthStatus(isAuthorized);

          // Initialize navigation
          await navigationManager.initialize();

          // Verify redirect behavior
          if (!isAuthorized) {
            expect(mockRouter.navigate).toHaveBeenCalledWith('/login');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: navigation, Property 2: Блокировка доступа к защищенным экранам
     Preconditions: various routes and auth statuses
     Action: call canActivate() with different routes
     Assertions: protected routes blocked when not authorized
     Requirements: navigation.1.2 */
  it('should block access to protected routes when not authorized', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/dashboard', '/settings', '/tasks', '/calendar', '/contacts'),
        fc.boolean(),
        async (route, isAuthorized) => {
          // Mock auth status
          mockAuthStatus(isAuthorized);

          // Check route access
          const canAccess = await authGuard.canActivate(route);

          // Verify access control
          if (!isAuthorized) {
            expect(canAccess).toBe(false);
            expect(mockNavigationManager.redirectToLogin).toHaveBeenCalled();
          } else {
            expect(canAccess).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы навигации в реальных условиях использования.

```typescript
describe('Navigation Functional Tests', () => {
  /* Preconditions: fresh application start, user not authorized
     Action: launch application
     Assertions: login screen displayed, cannot access protected routes
     Requirements: navigation.1.1, navigation.1.2 */
  it('should show login screen for unauthorized user on app start', async () => {
    // Запустить приложение без авторизации
    const app = await launchApp({ authorized: false });
    
    // Проверить, что показан экран логина
    const loginScreen = await app.findElement('[data-testid="login-screen"]');
    expect(loginScreen).toBeVisible();
    
    // Попытаться перейти на защищенный маршрут
    await app.navigate('/settings');
    
    // Проверить, что все еще на экране логина
    expect(await app.getCurrentRoute()).toBe('/login');
    
    await app.close();
  });

  /* Preconditions: application running, user authorized
     Action: navigate to protected routes
     Assertions: access granted to all protected routes
     Requirements: navigation.1.2 */
  it('should allow access to protected routes when authorized', async () => {
    // Запустить приложение с авторизацией
    const app = await launchApp({ authorized: true });
    
    // Проверить доступ к защищенным маршрутам
    const protectedRoutes = ['/dashboard', '/settings', '/tasks', '/calendar', '/contacts'];
    
    for (const route of protectedRoutes) {
      await app.navigate(route);
      expect(await app.getCurrentRoute()).toBe(route);
    }
    
    await app.close();
  });

  /* Preconditions: user on login screen
     Action: complete OAuth authorization
     Assertions: redirected to dashboard
     Requirements: navigation.1.7 */
  it('should redirect to dashboard after successful authorization', async () => {
    // Запустить приложение без авторизации
    const app = await launchApp({ authorized: false });
    
    // Проверить, что на экране логина
    expect(await app.getCurrentRoute()).toBe('/login');
    
    // Выполнить авторизацию
    await app.clickButton('[data-testid="google-login-button"]');
    await app.completeOAuthFlow();
    
    // Проверить перенаправление на dashboard
    await app.waitForNavigation();
    expect(await app.getCurrentRoute()).toBe('/dashboard');
    
    await app.close();
  });

  /* Preconditions: user authorized and on dashboard
     Action: logout
     Assertions: redirected to login screen
     Requirements: navigation.1.9 */
  it('should redirect to login after logout', async () => {
    // Запустить приложение с авторизацией
    const app = await launchApp({ authorized: true });
    
    // Перейти на dashboard
    await app.navigate('/dashboard');
    expect(await app.getCurrentRoute()).toBe('/dashboard');
    
    // Выполнить logout
    await app.clickButton('[data-testid="logout-button"]');
    
    // Проверить перенаправление на login
    await app.waitForNavigation();
    expect(await app.getCurrentRoute()).toBe('/login');
    
    // Проверить, что доступ к защищенным маршрутам заблокирован
    await app.navigate('/settings');
    expect(await app.getCurrentRoute()).toBe('/login');
    
    await app.close();
  });

  /* Preconditions: user not authorized
     Action: attempt to access multiple protected routes
     Assertions: all attempts blocked, redirected to login
     Requirements: navigation.1.2 */
  it('should block all protected routes when not authorized', async () => {
    // Запустить приложение без авторизации
    const app = await launchApp({ authorized: false });
    
    // Попытаться получить доступ к каждому защищенному маршруту
    const protectedRoutes = ['/dashboard', '/settings', '/tasks', '/calendar', '/contacts'];
    
    for (const route of protectedRoutes) {
      await app.navigate(route);
      
      // Проверить, что перенаправлен на login
      expect(await app.getCurrentRoute()).toBe('/login');
    }
    
    await app.close();
  });
});
```

#### Функциональные Тесты

- `tests/functional/navigation.spec.ts` - "should show login screen on first launch"
- `tests/functional/navigation.spec.ts` - "should redirect to dashboard after successful login"
- `tests/functional/navigation.spec.ts` - "should block access to protected routes when not authenticated"
- `tests/functional/auth-flow.spec.ts` - "should complete full authentication flow"
- `tests/functional/auth-flow.spec.ts` - "should redirect to login after logout"


### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| navigation.1.1 | ✓ | ✓ | ✓ |
| navigation.1.2 | ✓ | ✓ | ✓ |
| navigation.1.3 | ✓ | - | ✓ |
| navigation.1.4 | ✓ | - | ✓ |
| navigation.1.5 | ✓ | - | ✓ |
| navigation.1.6 | ✓ | - | ✓ |
| navigation.1.7 | ✓ | - | ✓ |
| navigation.1.8 | ✓ | - | ✓ |
| navigation.1.9 | ✓ | - | ✓ |

### Критерии Успеха

- Все модульные тесты проходят
- Все property-based тесты проходят (минимум 100 итераций каждый)
- Покрытие кода минимум 85%
- Все требования покрыты тестами
- Все граничные случаи обработаны корректно

## Технические Решения

### Решение 1: Архитектура Навигации

**Решение:** Использовать комбинацию NavigationManager + AuthGuard + Router для управления навигацией и защиты маршрутов.

**Альтернативы:**
- Использовать только React Router с custom hooks
- Использовать глобальное состояние (Redux/Zustand) для навигации
- Проверять авторизацию в каждом компоненте отдельно

**Обоснование:**
- **Централизация**: NavigationManager предоставляет единую точку управления навигацией
- **Безопасность**: AuthGuard обеспечивает защиту маршрутов на уровне роутера
- **Разделение ответственности**: Каждый компонент имеет четкую роль
- **Тестируемость**: Легко мокировать и тестировать каждый компонент отдельно
- **Расширяемость**: Легко добавлять новые защищенные маршруты

**Недостатки альтернатив:**
- Custom hooks: Дублирование логики в каждом компоненте
- Глобальное состояние: Избыточная сложность для простой навигации
- Проверка в компонентах: Риск пропустить проверку, сложность тестирования

### Решение 2: Интеграция с OAuth Events

**Решение:** Использовать систему событий (IPC events) для реагирования на изменения статуса авторизации.

**Альтернативы:**
- Polling (периодическая проверка статуса)
- Глобальное состояние с подпиской
- Прямые вызовы методов навигации из OAuth компонентов

**Обоснование:**
- **Реактивность**: Немедленная реакция на изменения статуса авторизации
- **Разделение ответственности**: OAuth система не знает о навигации
- **Надежность**: События гарантируют доставку уведомлений
- **Простота**: Стандартный паттерн для Electron приложений

**Недостатки альтернатив:**
- Polling: Задержка реакции, лишняя нагрузка
- Глобальное состояние: Избыточная сложность
- Прямые вызовы: Сильная связанность компонентов

### Решение 3: Fallback при ошибках

**Решение:** При ошибках навигации использовать `window.location.href` как fallback.

**Альтернативы:**
- Показывать ошибку пользователю
- Перезагружать приложение
- Игнорировать ошибку

**Обоснование:**
- **Надежность**: Гарантирует навигацию даже при ошибках роутера
- **Простота**: Нативный браузерный механизм
- **Безопасность**: Всегда перенаправляет на безопасный маршрут (логин)

**Недостатки альтернатив:**
- Показ ошибки: Плохой UX, пользователь не знает что делать
- Перезагрузка: Потеря состояния приложения
- Игнорирование: Пользователь может остаться на неправильном экране

## Интеграция с Другими Системами

### OAuth Система

Система навигации тесно интегрирована с OAuth системой авторизации:

**События:**
- `auth:success`: Генерируется при успешной авторизации → перенаправление на Dashboard
- `auth:logout`: Генерируется при выходе из системы → перенаправление на Login

**IPC Методы:**
- `auth:status`: Проверка текущего статуса авторизации

**Зависимости:**
- NavigationManager зависит от OAuthClientManager для проверки статуса
- AuthGuard зависит от NavigationManager для перенаправлений

### Router

Система навигации использует React Router для управления маршрутами:

**Маршруты:**
- `/login` - Публичный маршрут (экран логина)
- `/dashboard` - Защищенный маршрут (главный экран)
- `/settings` - Защищенный маршрут (настройки)
- `/tasks` - Защищенный маршрут (задачи)
- `/calendar` - Защищенный маршрут (календарь)
- `/contacts` - Защищенный маршрут (контакты)

**Интеграция:**
- AuthGuard проверяет доступ перед активацией маршрута
- NavigationManager использует router.navigate() для перенаправлений

## Заключение

Система навигации обеспечивает защиту маршрутов и автоматическое перенаправление пользователей в зависимости от статуса авторизации. NavigationManager и AuthGuard работают совместно для предотвращения несанкционированного доступа к защищенным экранам.

**Ключевые преимущества:**
- Централизованное управление навигацией
- Автоматическая защита маршрутов
- Интеграция с OAuth системой через события
- Graceful обработка ошибок
- Высокая тестируемость

**Следующие шаги:**
- Реализация NavigationManager класса
- Реализация AuthGuard компонента
- Интеграция с React Router
- Написание модульных и property-based тестов
- Написание функциональных тестов
