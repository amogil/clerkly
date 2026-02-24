# Документ Дизайна: Account Profile

## Обзор

Данный документ описывает архитектуру и дизайн блока Account Profile в приложении Clerkly, включая отображение информации о профиле пользователя, полученной из Google OAuth, и синхронизацию с локальной базой данных.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DatabaseManager и UserSettingsManager) является единственным источником истины для всех данных приложения**.

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

- Отображать информацию о Google аккаунте пользователя в приложении
- Обеспечить автоматическую синхронизацию данных профиля с Google
- Гарантировать актуальность данных профиля
- Предоставить read-only интерфейс для просмотра профиля
- Следовать принципу единого источника истины (база данных)

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **Google UserInfo API**: API для получения информации о пользователе
- **SQLite**: База данных для хранения профиля (через DatabaseManager и UserSettingsManager)
- **React**: Библиотека для создания UI компонентов

## Архитектура

### Компоненты Системы

Система управления профилем пользователя состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ OAuthClientManager   │──────▶│ UserProfileManager  │     │
│  │                      │       │                     │     │
│  │ - refreshAccessToken()│       │ - fetchProfile()    │     │
│  │ - getAuthStatus()    │       │ - saveProfile()     │     │
│  └──────────────────────┘       │ - loadProfile()     │     │
│           │                      │ - clearProfile()    │     │
│           │                      └─────────────────────┘     │
│           │                                │                 │
│           ▼                                ▼                 │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ Google UserInfo API  │       │  UserSettingsManager  │     │
│  │ (HTTPS Request)      │       │     (SQLite)          │     │
│  └──────────────────────┘       └─────────────────────┘     │
│           │                                │                 │
└───────────┼────────────────────────────────┼─────────────────┘
            │                                │
            ▼                                ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │     Account Component          │         │
   │  │                                │         │
   │  │  - Display name                │         │
   │  │  - Display email               │         │
   │  │  - Read-only fields            │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Данных

1. **Авторизация пользователя**:
   - Пользователь авторизуется через Google OAuth
   - `UserProfileManager` синхронно загружает профиль из Google UserInfo API
   - Профиль сохраняется в базу данных через `UserSettingsManager`
   - UI отображает данные профиля

2. **Запуск приложения**:
   - `LifecycleManager` проверяет статус авторизации
   - Если пользователь авторизован, `UserProfileManager` загружает свежие данные профиля
   - Профиль обновляется в базе данных
   - UI отображает актуальные данные

3. **Обновление токена**:
   - `OAuthClientManager` автоматически обновляет access token
   - После успешного обновления вызывается `UserProfileManager.updateProfileAfterTokenRefresh()`
   - Профиль обновляется в базе данных
   - UI автоматически обновляется через систему событий

4. **Выход из системы**:
   - Токены очищаются из хранилища
   - UI очищает отображение профиля (состояние компонента)
   - Данные профиля в базе данных сохраняются для следующей авторизации

## Компоненты и Интерфейсы

### UserProfileManager

Класс для управления данными профиля пользователя.

```typescript
// Requirements: account-profile.1.2, account-profile.1.3, account-profile.1.4, account-profile.1.5

interface UserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  locale: string;
  picture?: string; // Optional: URL to profile picture
  lastUpdated: number; // Unix timestamp
}

class UserProfileManager {
  private userSettingsManager: UserSettingsManager;
  private oauthClient: OAuthClientManager;
  private readonly profileKey = 'user_profile';
  
  constructor(userSettingsManager: UserSettingsManager, oauthClient: OAuthClientManager) {
    this.userSettingsManager = userSettingsManager;
    this.oauthClient = oauthClient;
  }

  /**
   * Fetch user profile from Google UserInfo API
   * Requirements: account-profile.1.2, account-profile.1.3
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      // Requirements: account-profile.1.3 - Check authentication status
      const authStatus = await this.oauthClient.getAuthStatus();
      if (!authStatus.authorized || !authStatus.tokens?.accessToken) {
        console.log('[UserProfileManager] Not authenticated, cannot fetch profile');
        return null;
      }

      // Requirements: account-profile.1.3 - Use Google UserInfo API endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${authStatus.tokens.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`UserInfo API error: ${response.status} ${response.statusText}`);
      }

      const profileData = await response.json();
      const profile: UserProfile = {
        ...profileData,
        lastUpdated: Date.now()
      };

      // Requirements: account-profile.1.3 - Save to local storage
      await this.saveProfile(profile);
      
      console.log('[UserProfileManager] Profile fetched and saved successfully');
      return profile;
    } catch (error) {
      console.error('[UserProfileManager] Failed to fetch profile:', error);
      // Requirements: account-profile.1.1 - Return cached profile on error
      return await this.loadProfile();
    }
  }

  /**
   * Save user profile to local storage
   * Requirements: account-profile.1.3
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    try {
      await this.userSettingsManager.saveData(this.profileKey, profile);
      console.log('[UserProfileManager] Profile saved to local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to save profile:', error);
      throw error;
    }
  }

  /**
   * Load user profile from local storage
   * Requirements: account-profile.1.1
   */
  async loadProfile(): Promise<UserProfile | null> {
    try {
      const result = await this.userSettingsManager.loadData(this.profileKey);
      if (result.success && result.data) {
        console.log('[UserProfileManager] Profile loaded from local storage');
        return result.data as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('[UserProfileManager] Failed to load profile:', error);
      return null;
    }
  }

  /**
   * Clear user profile from local storage
   * 
   * @deprecated This method is not currently used in the application flow.
   * Profile data persists in database even after logout or session expiry (HTTP 401)
   * to provide better UX when user re-authenticates. Only tokens are cleared on
   * logout/401 errors, not profile data. This allows the UI to display cached
   * profile information immediately upon re-authentication.
   * 
   * Requirements: N/A (method exists for potential future use)
   */
  async clearProfile(): Promise<void> {
    try {
      await this.userSettingsManager.deleteData(this.profileKey);
      console.log('[UserProfileManager] Profile cleared from local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to clear profile:', error);
      throw error;
    }
  }

  /**
   * Update profile after token refresh
   * Called automatically by OAuthClientManager after successful token refresh
   * Requirements: account-profile.1.3
   */
  async updateProfileAfterTokenRefresh(): Promise<void> {
    console.log('[UserProfileManager] Updating profile after token refresh');
    await this.fetchProfile();
  }
}
```

### IPC Handlers для Profile

Расширение `AuthIPCHandlers` для работы с профилем пользователя.

```typescript
// Requirements: account-profile.1.2, account-profile.1.3

interface IPCResult {
  success: boolean;
  profile?: UserProfile | null;
  error?: string;
}

class AuthIPCHandlers {
  private profileManager: UserProfileManager;

  constructor(profileManager: UserProfileManager) {
    this.profileManager = profileManager;
  }

  /**
   * Register profile-related IPC handlers
   * Should be called during app initialization
   */
  registerProfileHandlers(): void {
    ipcMain.handle('auth:get-profile', this.handleGetProfile.bind(this));
    ipcMain.handle('auth:refresh-user', this.handleRefreshProfile.bind(this));
    console.log('[AuthIPCHandlers] Profile handlers registered');
  }

  /**
   * Handle get profile request
   * Returns cached profile from local storage
   * Requirements: account-profile.1.2
   */
  private async handleGetProfile(): Promise<IPCResult> {
    try {
      const profile = await this.profileManager.loadProfile();
      return {
        success: true,
        profile: profile
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to get profile:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Handle refresh profile request
   * Fetches fresh profile data from Google API
   * Requirements: account-profile.1.3
   */
  private async handleRefreshProfile(): Promise<IPCResult> {
    try {
      const profile = await this.profileManager.fetchProfile();
      return {
        success: true,
        profile: profile
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthIPCHandlers] Failed to refresh profile:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
```

### Account Component (Renderer)

React компонент для отображения профиля пользователя.

```typescript
// Requirements: account-profile.1.1, account-profile.1.2, account-profile.1.3

import { useState, useEffect } from 'react';

interface UserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  locale: string;
  picture?: string;
  lastUpdated: number;
}

interface AccountProps {
  className?: string;
}

export function Account({ className }: AccountProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load profile on mount
    loadProfile();
    
    // Requirements: account-profile.1.3 - Listen for auth success to reload profile
    const unsubscribeAuthSuccess = window.api.auth.onAuthSuccess(() => {
      console.log('[Account] Auth success event received, reloading profile');
      loadProfile();
    });

    // Listen for logout to clear profile from UI
    const unsubscribeLogout = window.api.auth.onLogout(() => {
      console.log('[Account] Logout event received, clearing profile from UI');
      setProfile(null);
      setError(null);
    });

    return () => {
      unsubscribeAuthSuccess();
      unsubscribeLogout();
    };
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.auth.getProfile();
      if (result.success && result.profile) {
        setProfile(result.profile);
        console.log('[Account] Profile loaded successfully');
      } else if (result.error) {
        setError(result.error);
        console.error('[Account] Failed to load profile:', result.error);
      } else {
        // Not authenticated
        setProfile(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[Account] Failed to load profile:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Requirements: account-profile.1.1 - Display empty state when not authenticated
  if (loading) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-loading">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-error">
          <p>Error loading profile: {error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`account-block ${className || ''}`}>
        <div className="profile-empty">
          <p>Not signed in</p>
        </div>
      </div>
    );
  }

  // Requirements: account-profile.1.1, account-profile.1.2 - Display name and email as read-only fields
  return (
    <div className={`account-block ${className || ''}`}>
      <div className="profile-info">
        {profile.picture && (
          <div className="profile-picture">
            <img src={profile.picture} alt={profile.name} />
          </div>
        )}
        <div className="profile-fields">
          <div className="profile-field">
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={profile.name}
              readOnly
              className="profile-input"
            />
          </div>
          <div className="profile-field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="text"
              value={profile.email}
              readOnly
              className="profile-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Ключевые особенности:**
- Автоматическая загрузка профиля при монтировании компонента
- Слушатели событий для auth:success и logout
- Отображение состояний: loading, error, empty (не авторизован), filled (с данными)
- Read-only поля для имени и email (account-profile.1.2)
- Опциональное отображение аватара пользователя
- Очистка подписок при размонтировании компонента

## Модели Данных

### UserProfile

Интерфейс для представления профиля пользователя.

```typescript
interface UserProfile {
  /**
   * Уникальный идентификатор пользователя Google
   */
  id: string;

  /**
   * Email адрес пользователя
   */
  email: string;

  /**
   * Флаг верификации email
   */
  verified_email: boolean;

  /**
   * Полное имя пользователя
   */
  name: string;

  /**
   * Имя пользователя
   */
  given_name: string;

  /**
   * Фамилия пользователя
   */
  family_name: string;

  /**
   * Локаль пользователя (например, "en", "ru")
   */
  locale: string;

  /**
   * URL аватара пользователя (опционально)
   */
  picture?: string;

  /**
   * Timestamp последнего обновления профиля
   */
  lastUpdated: number;
}
```

**Валидация:**
- `id`, `email`, `name`: Обязательные строковые поля
- `verified_email`: Булево значение
- `lastUpdated`: Unix timestamp в миллисекундах
- `picture`: Опциональный URL

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Синхронная загрузка профиля при авторизации

*Для любого* пользователя, успешно авторизовавшегося через Google OAuth, система должна синхронно загрузить данные профиля из Google UserInfo API перед показом Agents. При ошибке загрузки профиля авторизация должна считаться неуспешной.

**Validates: Requirements account-profile.1.4, account-profile.1.5**

### Property 2: Показ loader при синхронной загрузке профиля

*Для любого* пользователя, авторизующегося через Google OAuth, во время синхронной загрузки профиля система должна показывать loader, а не Agents или Account Block.

**Validates: Requirements account-profile.1.4**

### Property 3: Показ Agents после успешной загрузки профиля

*Для любого* пользователя, для которого профиль успешно загружен синхронно во время авторизации, система должна показать Agents (главный экран приложения).

**Validates: Requirements account-profile.1.4**

### Property 4: Показ LoginError при ошибке загрузки профиля

*Для любого* пользователя, для которого загрузка профиля не удалась синхронно во время авторизации, система должна очистить токены И показать LoginError компонент с errorCode 'profile_fetch_failed'.

**Validates: Requirements account-profile.1.4, account-profile.1.5**

### Property 5: Сохранение данных профиля при успешной загрузке

*Для любого* успешного запроса к UserInfo API (синхронного или фонового), полученные данные профиля должны быть сохранены в локальную базу данных (SQLite через UserSettingsManager).

**Validates: Requirements account-profile.1.3**

### Property 6: Отображение обязательных полей профиля

*Для любого* профиля пользователя, Account Block должен отображать поля "Name" (имя пользователя) и "Email" (email адрес).

**Validates: Requirements account-profile.1.1**

### Property 7: Read-only поля профиля

*Для любого* отображаемого профиля, все поля в Account Block должны иметь атрибут `readOnly` и не позволять пользователю редактировать данные.

**Validates: Requirements account-profile.1.2**

### Property 8: Автоматическое обновление при refresh token

*Для любого* авторизованного пользователя, при каждом успешном обновлении access token (refresh token operation), система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API в фоновом режиме и обновлять отображение в Account Block.

**Validates: Requirements account-profile.1.3**

### Property 9: Автоматическое обновление при запуске приложения

*Для любого* авторизованного пользователя, при запуске приложения система должна автоматически запрашивать актуальные данные профиля из Google UserInfo API в фоновом режиме и отображать их в Account Block.

**Validates: Requirements account-profile.1.3**

### Property 10: Очистка UI при logout

*Для любого* авторизованного пользователя, при выходе из системы (logout) приложение должно очистить все данные профиля из памяти (UI state) и очистить все токены авторизации. Данные профиля в базе данных сохраняются для отображения при следующей авторизации.

**Validates: Requirements account-profile.1.3**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Синхронная загрузка профиля при авторизации (account-profile.1.4, account-profile.1.5)**: Когда пользователь авторизуется через Google OAuth, система должна:
   - Показать loader с текстом "Signing in..." после получения authorization code
   - Синхронно обменять код на токены И загрузить профиль во время отображения loader
   - При успехе: показать Agents с заполненным Account Block
   - При ошибке обмена токенов ИЛИ загрузки профиля: очистить токены и показать LoginError компонент с errorCode 'profile_fetch_failed'

2. **Первая авторизация (account-profile.1.1, account-profile.1.3)**: Когда пользователь авторизуется впервые и в локальной базе данных нет данных профиля, система синхронно загружает профиль во время авторизации. После успешной загрузки показывается Agents с заполненным Account Block.

3. **Ошибка загрузки профиля в фоновом режиме (account-profile.1.1, account-profile.1.3)**: Когда загрузка данных профиля не удается в фоновом режиме (при запуске приложения или refresh token), Account Block должен показать сообщение об ошибке и сохранить данные из локальной базы данных (предыдущие значения или пустые поля), НЕ очищая существующие данные.

4. **Повторная авторизация с сохраненными данными (account-profile.1.1, account-profile.1.3)**: Когда пользователь авторизуется повторно и в локальной базе данных есть данные профиля, система синхронно загружает свежие данные профиля во время авторизации. После успешной загрузки показывается Agents с обновленными данными в Account Block.

## Обработка Ошибок

### Стратегия Обработки Ошибок

Система управления профилем пользователя должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка получения профиля из Google API

**Причины:**
- Ошибка сети (нет интернета)
- Таймаут запроса
- Ошибка сервера Google (5xx)
- Невалидный access token
- Превышен лимит запросов API

**Обработка:**

**Случай 1: Синхронная загрузка профиля во время авторизации (account-profile.1.4, account-profile.1.5)**

Когда профиль загружается синхронно во время авторизации (после обмена authorization code на токены), ошибка получения профиля должна привести к неуспешной авторизации:

```typescript
// Requirements: account-profile.1.4, account-profile.1.5
async handleAuthorizationCallback(code: string): Promise<void> {
  try {
    // Show loader when authorization code received
    this.showLoader('Signing in...');
    
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);
    await this.tokenStorage.saveTokens(tokens);
    
    // Requirements: account-profile.1.4 - Synchronous profile fetch during authorization
    try {
      const profile = await this.userProfileManager.fetchProfile();
      if (!profile) {
        throw new Error('Profile fetch returned null');
      }
      
      // Success: show Agents
      this.hideLoader();
      this.navigationManager.redirectToAgents();
    } catch (profileError) {
      // Requirements: account-profile.1.4, account-profile.1.5 - Profile fetch failed during authorization
      console.error('[Auth] Profile fetch failed during authorization:', profileError);
      
      // Clear tokens - authorization is considered unsuccessful
      await this.tokenStorage.clearTokens();
      
      // Hide loader and show LoginError with profile_fetch_failed error code
      this.hideLoader();
      this.showLoginError('Unable to load your Google profile information.', 'profile_fetch_failed');
    }
  } catch (error) {
    // Token exchange failed
    console.error('[Auth] Authorization failed:', error);
    this.hideLoader();
    this.showLoginError('Authorization failed', 'unknown_error');
  }
}
```

**Результат:** Токены очищаются, loader скрывается, пользователь видит LoginError компонент с сообщением:
- **Title**: "Profile loading failed"
- **Message**: "Unable to load your Google profile information."
- **Suggestion**: "Please check your internet connection and try signing in again."

**Случай 2: Фоновая загрузка профиля (account-profile.1.3)**

Когда профиль загружается в фоновом режиме (при запуске приложения или refresh token), ошибка НЕ должна прерывать работу приложения:

```typescript
// Requirements: account-profile.1.1, account-profile.1.3
async fetchProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`UserInfo API error: ${response.status}`);
    }
    
    const profile = await response.json();
    await this.saveProfile(profile);
    return profile;
  } catch (error) {
    console.error('[UserProfileManager] Failed to fetch profile:', error);
    // Return cached profile on error - don't interrupt user workflow
    return await this.loadProfile();
  }
}
```

**Результат:** Возвращаются кэшированные данные профиля, пользователь продолжает видеть последние известные данные.

#### 2. Ошибка сохранения профиля

**Причины:**
- Ошибка записи в базу данных
- Недостаточно места на диске
- Проблемы с правами доступа

**Обработка:**
```typescript
// Requirements: account-profile.1.3
async saveProfile(profile: UserProfile): Promise<void> {
  try {
    await this.userSettingsManager.saveData('user_profile', profile);
  } catch (error) {
    console.error('[UserProfileManager] Failed to save profile:', error);
    throw error; // Propagate error to caller
  }
}
```

**Результат:** Ошибка логируется и пробрасывается. Профиль не сохраняется в кэш, но текущая сессия продолжает работать с данными в памяти.

#### 3. Ошибка загрузки профиля из кэша

**Причины:**
- Поврежденные данные в базе данных
- Ошибка чтения из базы данных
- Несовместимый формат данных (после обновления приложения)

**Обработка:**
```typescript
// Requirements: account-profile.1.1
async loadProfile(): Promise<UserProfile | null> {
  try {
    const result = await this.userSettingsManager.loadData('user_profile');
    if (result.success && result.data) {
      return result.data as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('[UserProfileManager] Failed to load profile:', error);
    return null; // Return null instead of throwing
  }
}
```

**Результат:** Возвращается null, компонент отображает пустое состояние. При следующем успешном запросе к API данные будут восстановлены.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс:

```typescript
// Profile management errors
console.error('[UserProfileManager] Failed to fetch profile:', error);
console.error('[UserProfileManager] Failed to save profile:', error);
console.error('[UserProfileManager] Failed to load profile:', error);
console.error('[UserProfileManager] Failed to clear profile:', error);

// IPC handler errors
console.error('[AuthIPCHandlers] Failed to get profile:', errorMessage);
console.error('[AuthIPCHandlers] Failed to refresh profile:', errorMessage);

// Component errors
console.error('[Account] Failed to load profile:', errorMessage);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace

## Стратегия Тестирования

### Подход к Тестированию

Система Account Profile будет тестироваться модульными и функциональными тестами:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют пользовательские сценарии в UI

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок

### Модульные Тесты

#### UserProfileManager Tests

```typescript
describe('UserProfileManager', () => {
  /* Preconditions: OAuthClientManager returns valid tokens, Google UserInfo API mocked
     Action: call fetchProfile()
     Assertions: correct API request (URL, headers), profile data saved to UserSettingsManager
     Requirements: account-profile.1.2, account-profile.1.3 */
  it('should fetch profile from Google UserInfo API', async () => {
    // Тест успешного получения профиля
  });

  /* Preconditions: Google UserInfo API returns error, cached profile exists in UserSettingsManager
     Action: call fetchProfile()
     Assertions: returns cached profile data, error logged
     Requirements: account-profile.1.1, account-profile.1.3 */
  it('should return cached profile on API error', async () => {
    // Тест возврата кэшированных данных при ошибке
  });

  /* Preconditions: OAuthClientManager returns null tokens
     Action: call fetchProfile()
     Assertions: returns null, no API request made
     Requirements: account-profile.1.1 */
  it('should return null when not authenticated', async () => {
    // Тест возврата null для неавторизованного пользователя
  });

  /* Preconditions: valid profile object
     Action: call saveProfile()
     Assertions: UserSettingsManager.saveData called with correct key and data
     Requirements: account-profile.1.3 */
  it('should save profile to UserSettingsManager', async () => {
    // Тест сохранения профиля
  });

  /* Preconditions: profile exists in UserSettingsManager
     Action: call loadProfile()
     Assertions: returns correct profile data
     Requirements: account-profile.1.1 */
  it('should load profile from UserSettingsManager', async () => {
    // Тест загрузки профиля
  });

  /* Preconditions: profile exists in UserSettingsManager
     Action: call clearProfile()
     Assertions: UserSettingsManager.deleteData called with correct key
     Requirements: N/A (method exists but not currently used in application flow) */
  it('should clear profile from UserSettingsManager', async () => {
    // Тест очистки профиля (метод существует, но не используется в текущем flow)
  });

  /* Preconditions: UserProfileManager initialized
     Action: call updateProfileAfterTokenRefresh()
     Assertions: fetchProfile() called
     Requirements: account-profile.1.3 */
  it('should update profile after token refresh', async () => {
    // Тест обновления профиля после refresh token
  });
});
```

#### IPC Handlers Tests

```typescript
describe('AuthIPCHandlers - Profile', () => {
  /* Preconditions: UserProfileManager.loadProfile() returns profile
     Action: invoke 'auth:get-profile' handler
     Assertions: returns success response with profile data
     Requirements: account-profile.1.2 */
  it('should handle get-profile request', async () => {
    // Тест получения профиля через IPC
  });

  /* Preconditions: UserProfileManager.loadProfile() throws error
     Action: invoke 'auth:get-profile' handler
     Assertions: returns error response
     Requirements: account-profile.1.1 */
  it('should handle get-profile errors', async () => {
    // Тест обработки ошибок получения профиля
  });

  /* Preconditions: UserProfileManager.fetchProfile() returns updated profile
     Action: invoke 'auth:refresh-user' handler
     Assertions: returns success response with fresh profile data
     Requirements: account-profile.1.3 */
  it('should handle refresh-profile request', async () => {
    // Тест обновления профиля через IPC
  });
});
```

#### Account Component Tests

```typescript
describe('Account Component', () => {
  /* Preconditions: window.api.auth.getProfile() returns null
     Action: render Account component
     Assertions: displays "Not signed in" message, no profile fields shown
     Requirements: account-profile.1.1 
     Note: В реальном приложении пользователь не может попасть в Settings без авторизации,
     но компонент должен корректно обрабатывать случай отсутствия профиля */
  it('should display empty state when not authenticated', () => {
    // Тест отображения пустого состояния
  });

  /* Preconditions: window.api.auth.getProfile() returns profile data
     Action: render Account component
     Assertions: displays name and email fields with correct values
     Requirements: account-profile.1.1, account-profile.1.2 */
  it('should display profile data after authentication', () => {
    // Тест отображения данных профиля
  });

  /* Preconditions: Account component rendered with profile data
     Action: inspect input fields
     Assertions: all input fields have readOnly attribute
     Requirements: account-profile.1.2 */
  it('should have read-only profile fields', () => {
    // Тест read-only полей
  });

  /* Preconditions: Account component mounted, auth:success event triggered
     Action: trigger auth:success event
     Assertions: getProfile() called again, UI updated with new data
     Requirements: account-profile.1.3 */
  it('should reload profile on auth success event', () => {
    // Тест перезагрузки профиля при успешной авторизации
  });

  /* Preconditions: Account component with profile data, logout triggered
     Action: trigger logout event
     Assertions: component returns to empty state (UI state cleared), profile data in database persists
     Requirements: account-profile.1.3 */
  it('should clear profile from UI on logout', () => {
    // Тест очистки профиля из UI при logout
  });
});
```

### Функциональные Тесты

```typescript
describe('Account Functional Tests - Profile Integration', () => {
  /* Preconditions: real OAuthClientManager and UserProfileManager, mocked Google APIs
     Action: perform OAuth login, wait for profile fetch
     Assertions: profile automatically loaded, data saved to UserSettingsManager
     Requirements: account-profile.1.2, account-profile.1.3 */
  it('should load profile after OAuth login', async () => {
    // Тест полного цикла авторизации и загрузки профиля
  });

  /* Preconditions: expired access token, valid refresh token
     Action: trigger token refresh
     Assertions: profile automatically updated after refresh
     Requirements: account-profile.1.3 */
  it('should update profile after token refresh', async () => {
    // Тест автоматического обновления при refresh token
  });

  /* Preconditions: authenticated user, LifecycleManager initialized
     Action: call LifecycleManager.initialize()
     Assertions: profile automatically fetched on startup
     Requirements: account-profile.1.3 */
  it('should fetch profile on app startup', async () => {
    // Тест загрузки профиля при запуске
  });

  /* Preconditions: cached profile in UserSettingsManager, Google API returns error
     Action: call fetchProfile()
     Assertions: returns cached data, no exception thrown
     Requirements: account-profile.1.1, account-profile.1.3 */
  it('should use cached profile on API error', async () => {
    // Тест использования кэша при ошибке API
  });
});
```

```typescript
describe('Account Functional Tests', () => {
  /* Preconditions: fresh app start, no authentication
     Action: launch app, navigate to Account block
     Assertions: displays empty state with "Not signed in"
     Requirements: account-profile.1.1 */
  it('should show empty profile when not authenticated', async () => {
    // Функциональный тест пустого состояния
  });

  /* Preconditions: fresh app start
     Action: perform Google OAuth login, check Account block
     Assertions: Account block populated with name and email from Google
     Requirements: account-profile.1.1, account-profile.1.2 */
  it('should populate profile after Google OAuth login', async () => {
    // Функциональный тест заполнения профиля
  });

  /* Preconditions: authenticated user with profile displayed
     Action: attempt to edit profile fields
     Assertions: fields are read-only, cannot be edited
     Requirements: account-profile.1.2 */
  it('should not allow editing profile fields', async () => {
    // Функциональный тест read-only полей
  });

  /* Preconditions: authenticated user, profile data changed in Google (mocked)
     Action: wait for token refresh or trigger manually
     Assertions: Account block displays updated data
     Requirements: account-profile.1.3 */
  it('should update profile data when changed in Google', async () => {
    // Функциональный тест обновления профиля
  });

  /* Preconditions: authenticated user with profile displayed
     Action: perform logout
     Assertions: Account block cleared from UI, returns to empty state, profile data in database persists
     Requirements: account-profile.1.3 */
  it('should clear profile from UI on logout', async () => {
    // Функциональный тест очистки UI при logout
  });
});
```

### Критерии Завершения

Работа считается завершенной ТОЛЬКО когда:
- ✅ TypeScript компилируется без ошибок
- ✅ ESLint проходит без замечаний
- ✅ Prettier форматирование корректно
- ✅ Все модульные тесты проходят
- ✅ Покрытие кода минимум 85%
- ✅ Все требования покрыты тестами
- ✅ Все граничные случаи обработаны корректно

**Примечание**: Функциональные тесты НЕ являются обязательными для завершения работы. Они запускаются ТОЛЬКО при явной просьбе пользователя.

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| account-profile.1.1 | ✓ | ✓ |
| account-profile.1.2 | ✓ | ✓ |
| account-profile.1.3 | ✓ | ✓ |
| account-profile.1.4 | ✓ | ✓ |
| account-profile.1.5 | ✓ | ✓ |

## Стратегии Обновления Профиля

**Важное ограничение:** Google не предоставляет webhook/push notifications для изменений профиля обычных пользователей. Push notifications доступны только в Google Workspace Admin API для корпоративных аккаунтов. Для личных Google аккаунтов необходимо использовать polling (периодические запросы к API).

### Комбинированный подход: Обновление при запуске + при refresh token (Выбранная стратегия)

**Реализация:**

**1. Интеграция с LifecycleManager (обновление при запуске):**

```typescript
// Requirements: account-profile.1.3
// In src/main/LifecycleManager.ts

class LifecycleManager {
  private profileManager: UserProfileManager;
  private oauthClient: OAuthClientManager;

  constructor(
    userSettingsManager: UserSettingsManager,
    oauthClient: OAuthClientManager,
    // ... other dependencies
  ) {
    this.oauthClient = oauthClient;
    this.profileManager = new UserProfileManager(userSettingsManager, oauthClient);
    // ... other initializations
  }

  async initialize(): Promise<void> {
    console.log('[LifecycleManager] Initializing application');
    
    // ... existing initialization logic ...
    
    // Requirements: account-profile.1.3 - Fetch profile on startup if authenticated
    const authStatus = await this.oauthClient.getAuthStatus();
    if (authStatus.authorized) {
      console.log('[LifecycleManager] User authenticated, fetching profile');
      await this.profileManager.fetchProfile();
    } else {
      console.log('[LifecycleManager] User not authenticated, skipping profile fetch');
    }
    
    console.log('[LifecycleManager] Initialization complete');
  }
}
```

**2. Интеграция с OAuthClientManager (обновление при refresh token):**

```typescript
// Requirements: account-profile.1.3
// In src/main/auth/OAuthClientManager.ts

class OAuthClientManager {
  private profileManager: UserProfileManager | null = null;

  /**
   * Set profile manager for automatic profile updates
   * Should be called during initialization
   */
  setProfileManager(profileManager: UserProfileManager): void {
    this.profileManager = profileManager;
    console.log('[OAuthClientManager] Profile manager set for automatic updates');
  }

  async refreshAccessToken(): Promise<boolean> {
    console.log('[OAuthClientManager] Refreshing access token');
    
    // ... existing token refresh logic ...
    
    if (refreshed) {
      console.log('[OAuthClientManager] Token refreshed successfully');
      
      // Requirements: account-profile.1.3 - Automatically update profile after token refresh
      if (this.profileManager) {
        console.log('[OAuthClientManager] Triggering profile update after token refresh');
        await this.profileManager.updateProfileAfterTokenRefresh();
      }
    }
    
    return refreshed;
  }
}
```

**3. Инициализация в Main Process:**

```typescript
// Requirements: account-profile.1.3
// In src/main/index.ts

async function initializeApp() {
  const dbManager = new DatabaseManager();
  dbManager.initialize(storagePath);
  
  const userSettingsManager = new UserSettingsManager(dbManager);
  const oauthClient = new OAuthClientManager(/* ... */);
  const profileManager = new UserProfileManager(userSettingsManager, oauthClient);
  
  // Connect profile manager to oauth client for automatic updates
  oauthClient.setProfileManager(profileManager);
  
  const lifecycleManager = new LifecycleManager(
    dbManager,
    userSettingsManager,
    oauthClient,
    profileManager,
    // ... other dependencies
  );
  
  await lifecycleManager.initialize();
}
```

**Преимущества:**
- Данные всегда актуальны (обновляются при запуске и каждый час)
- Не требует действий от пользователя
- Минимальная задержка при отображении (данные в кэше)
- Покрывает случаи длительной работы приложения и перезапусков
- Оптимальный баланс между актуальностью и нагрузкой на API

**Недостатки:**
- Дополнительный API запрос при запуске
- Дополнительный API запрос каждый час
- Небольшое увеличение времени запуска и refresh операции

**Частота обновлений:**
- При запуске приложения: 1 раз
- При работе приложения: каждый час (при refresh token)
- Итого: ~25 запросов в день при непрерывной работе приложения 24 часа

### Альтернативный вариант: Ручное обновление (Не выбран)

**Реализация:**
```typescript
// Добавить кнопку "Refresh Profile" в UI
<button onClick={handleRefreshProfile}>
  Refresh Profile
</button>

const handleRefreshProfile = async () => {
  await window.api.auth.refreshProfile();
  await loadProfile();
};
```

**Преимущества:**
- Полный контроль пользователя
- Минимум API запросов
- Простая реализация

**Недостатки:**
- Требует действий от пользователя
- Данные могут быть устаревшими

## Технические Решения

### Решение 1: Стратегия Обновления Профиля

**Решение:** Использовать **комбинированный подход** - обновление при запуске приложения И при каждом refresh token.

**Обоснование:**
- Соответствует требованию account-profile.1.3 о автоматическом обновлении
- Обеспечивает максимальную актуальность данных
- Покрывает оба сценария: длительная работа приложения (обновление каждый час) и перезапуски (обновление при старте)
- Не требует действий от пользователя
- Дополнительные API запросы (при старте + каждый час) - приемлемая нагрузка для актуальности данных
- Интегрируется с существующими механизмами (lifecycle и token refresh)

**Альтернативы:**
- Ручное обновление через кнопку: требует действий пользователя, данные могут быть устаревшими
- Только при запуске: данные устаревают при длительной работе приложения
- Только при refresh token: данные не обновляются при перезапуске с валидным токеном

### Решение 2: Хранение Данных Профиля

**Решение:** Хранить данные профиля в SQLite через UserSettingsManager с ключом `user_profile`.

**Обоснование:**
- Использует существующую инфраструктуру
- Обеспечивает персистентность между запусками
- Позволяет отображать кэшированные данные при ошибках API (account-profile.1.1)
- Данные сохраняются даже после logout для лучшего UX при повторной авторизации

**Альтернативы:**
- Хранение в памяти: данные теряются при перезапуске
- Отдельная таблица в БД: избыточная сложность для простых key-value данных
- Файловая система: менее надежно, сложнее управление

### Решение 3: Read-Only Поля

**Решение:** Использовать HTML атрибут `readOnly` для полей ввода.

**Обоснование:**
- Соответствует требованию account-profile.1.2
- Визуально показывает, что поля не редактируемые
- Позволяет копировать текст из полей
- Стандартный HTML подход

**Альтернативы:**
- Отображение как текст (не input): нельзя копировать текст
- Disabled поля: визуально выглядят неактивными, хуже UX
- Кастомные компоненты: избыточная сложность

### Решение 4: Интеграция с OAuth через Dependency Injection

**Решение:** Передавать OAuthClientManager в конструктор UserProfileManager и использовать метод `setProfileManager()` для обратной связи.

**Обоснование:**
- Избегает циклических зависимостей
- Позволяет OAuthClientManager автоматически обновлять профиль после refresh token
- Чистая архитектура с явными зависимостями
- Легко тестируется с моками

**Альтернативы:**
- Прямая циклическая зависимость: проблемы с инициализацией и тестированием
- Event-based связь: избыточная сложность для простого случая
- Singleton паттерн: затрудняет тестирование
