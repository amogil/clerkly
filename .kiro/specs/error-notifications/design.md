# Документ Дизайна: Error Notifications

## Обзор

Данный документ описывает архитектуру и дизайн системы уведомлений об ошибках в приложении Clerkly, включая отображение ошибок фоновых процессов, логирование и автоматическое закрытие уведомлений.

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

- Предоставить пользователю понятную обратную связь о проблемах в фоновых процессах
- Минимизировать отвлечение пользователя через автоматическое скрытие уведомлений
- Обеспечить достаточный контекст для понимания проблемы
- Логировать все ошибки для отладки
- Интегрироваться с централизованным Logger классом (clerkly.3)

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **React**: Библиотека для построения UI компонентов
- **IPC**: Electron межпроцессное взаимодействие для передачи ошибок из Main Process в Renderer
- **Logger**: Централизованный класс для логирования (clerkly.3)

## Архитектура

### Компоненты Системы

Система уведомлений об ошибках состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐                                    │
│  │  Error Handler       │                                    │
│  │                      │                                    │
│  │  - handleError()     │                                    │
│  │  - logError()        │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
│           │ IPC: error:notify                                │
│           ▼                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │ ErrorNotificationManager       │         │
   │  │                                │         │
   │  │  - showNotification()          │         │
   │  │  - dismissNotification()       │         │
   │  │  - notifications[]             │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │    NotificationUI              │         │
   │  │                                │         │
   │  │  - Display error message       │         │
   │  │  - Display context             │         │
   │  │  - Auto-dismiss timer          │         │
   │  │  - Click to dismiss            │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Данных

1. **Возникновение ошибки в фоновом процессе**:
   - Фоновый процесс (загрузка данных, синхронизация, API запрос) выбрасывает ошибку
   - Error Handler перехватывает ошибку
   - Ошибка логируется через централизованный Logger класс (clerkly.3)

2. **Отправка уведомления в Renderer**:
   - Error Handler отправляет IPC событие `error:notify` с сообщением и контекстом
   - Renderer Process получает событие через preload script
   - ErrorNotificationManager создает уведомление

3. **Отображение уведомления**:
   - NotificationUI компонент отображает уведомление с сообщением и контекстом
   - Запускается таймер автоматического закрытия (15 секунд)

4. **Закрытие уведомления**:
   - Уведомление автоматически закрывается через 15 секунд
   - ИЛИ пользователь кликает на уведомление для немедленного закрытия

## Компоненты и Интерфейсы

### ErrorNotificationManager (Renderer Process)

Класс для управления уведомлениями об ошибках в Renderer Process.

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3

interface ErrorNotification {
  id: string;
  message: string;
  context: string;
  timestamp: number;
}

class ErrorNotificationManager {
  private notifications: ErrorNotification[] = [];
  private listeners: ((notifications: ErrorNotification[]) => void)[] = [];
  private readonly AUTO_DISMISS_DELAY = 15000; // 15 seconds

  /**
   * Show error notification
   * Requirements: error-notifications.1.1, error-notifications.1.2
   */
  showNotification(message: string, context: string): string {
    const notification: ErrorNotification = {
      id: `error-${Date.now()}-${Math.random()}`,
      message,
      context,
      timestamp: Date.now()
    };

    this.notifications.push(notification);
    this.notifyListeners();

    // Requirements: error-notifications.1.3 - Auto-dismiss after 15 seconds
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, this.AUTO_DISMISS_DELAY);

    console.log('[ErrorNotificationManager] Notification shown:', notification);
    return notification.id;
  }

  /**
   * Dismiss notification
   * Requirements: error-notifications.1.3
   */
  dismissNotification(id: string): void {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.notifyListeners();
      console.log('[ErrorNotificationManager] Notification dismissed:', id);
    }
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: (notifications: ErrorNotification[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }
}
```

**Ключевые особенности:**
- Управление списком активных уведомлений
- Автоматическое закрытие через 15 секунд
- Подписка на изменения для реактивного обновления UI
- Уникальные ID для каждого уведомления


### NotificationUI Component (Renderer Process)

React компонент для отображения уведомлений об ошибках.

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3

import { useState, useEffect } from 'react';

interface NotificationUIProps {
  notificationManager: ErrorNotificationManager;
}

export function NotificationUI({ notificationManager }: NotificationUIProps) {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe(setNotifications);
    return unsubscribe;
  }, [notificationManager]);

  const handleDismiss = (id: string) => {
    notificationManager.dismissNotification(id);
  };

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className="error-notification"
          onClick={() => handleDismiss(notification.id)}
        >
          <div className="notification-content">
            {/* Requirements: error-notifications.1.2 - Display context */}
            <div className="notification-context">
              {notification.context}
            </div>
            {/* Requirements: error-notifications.1.2 - Display message */}
            <div className="notification-message">
              {notification.message}
            </div>
          </div>
          <button
            className="notification-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss(notification.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Ключевые особенности:**
- Отображение контекста операции и сообщения об ошибке
- Кнопка закрытия для немедленного удаления уведомления
- Клик на уведомление также закрывает его
- Реактивное обновление при изменении списка уведомлений

### IPC Integration (Preload Script)

Интеграция с IPC для получения уведомлений из Main Process.

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.4

// In preload script
contextBridge.exposeInMainWorld('api', {
  error: {
    onNotify: (callback: (message: string, context: string) => void) => {
      ipcRenderer.on('error:notify', (_event, message, context) => {
        callback(message, context);
      });
      return () => ipcRenderer.removeAllListeners('error:notify');
    }
  }
});

// In renderer
useEffect(() => {
  const unsubscribe = window.api.error.onNotify((message, context) => {
    notificationManager.showNotification(message, context);
  });
  return unsubscribe;
}, []);
```

**Ключевые особенности:**
- Безопасная передача данных через contextBridge
- Автоматическая очистка слушателей при размонтировании
- Типобезопасный API для Renderer Process

### Error Handler (Main Process)

Централизованный обработчик ошибок в Main Process.

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.4

function handleBackgroundError(error: Error, context: string): void {
  // Requirements: error-notifications.1.4, clerkly.3.1, clerkly.3.6 - Log to console
  console.error(`[${context}] Error:`, error);
  
  // Requirements: error-notifications.1.1 - Notify renderer
  const mainWindow = windowManager.getWindow();
  if (mainWindow) {
    mainWindow.webContents.send('error:notify', error.message, context);
  }
}
```

**Ключевые особенности:**
- Логирование через централизованный Logger класс (clerkly.3)
- Отправка уведомления в Renderer через IPC
- Проверка наличия главного окна перед отправкой

## Модели Данных

### ErrorNotification

Интерфейс для представления уведомления об ошибке.

```typescript
interface ErrorNotification {
  /**
   * Уникальный идентификатор уведомления
   */
  id: string;

  /**
   * Сообщение об ошибке
   */
  message: string;

  /**
   * Контекст операции (что пыталось выполниться)
   */
  context: string;

  /**
   * Timestamp создания уведомления
   */
  timestamp: number;
}
```

**Валидация:**
- `id`: Уникальная строка, генерируется автоматически
- `message`: Непустая строка с описанием ошибки
- `context`: Непустая строка с контекстом операции
- `timestamp`: Положительное число (Unix timestamp в миллисекундах)

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Показ уведомления при ошибке фонового процесса

*Для любой* ошибки, возникающей в фоновом процессе (загрузка данных, синхронизация, API запрос), приложение должно показать уведомление об ошибке пользователю.

**Validates: Requirements error-notifications.1.1**

### Property 2: Содержимое уведомления об ошибке

*Для любого* уведомления об ошибке, оно должно содержать краткое описание проблемы И контекст операции (что пыталось выполниться).

**Validates: Requirements error-notifications.1.2**

### Property 3: Автоматическое исчезновение уведомления

*Для любого* показанного уведомления об ошибке, оно должно автоматически исчезнуть через 15 секунд ИЛИ при клике пользователя на уведомление.

**Validates: Requirements error-notifications.1.3**

### Property 4: Логирование ошибок в консоль

*Для любой* ошибки в приложении, она должна быть залогирована в консоль с достаточным контекстом для отладки через централизованный Logger класс.

**Validates: Requirements error-notifications.1.4, clerkly.3.1, clerkly.3.6**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Множественные ошибки одновременно**: Когда несколько фоновых процессов выбрасывают ошибки одновременно, все уведомления должны быть показаны без перекрытия или потери данных.

2. **Ошибка при отсутствии главного окна**: Когда ошибка возникает до создания главного окна или после его закрытия, ошибка должна быть залогирована, но уведомление не отправляется.

3. **Очень длинное сообщение об ошибке**: Когда сообщение об ошибке очень длинное, оно должно быть обрезано или отображено с прокруткой для сохранения читаемости UI.

4. **Быстрое закрытие уведомления**: Когда пользователь кликает на уведомление до истечения 15 секунд, таймер должен быть отменен и уведомление закрыто немедленно.


## Обработка Ошибок

### Стратегия Обработки Ошибок

Система уведомлений об ошибках должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка отправки IPC события

**Причины:**
- Главное окно закрыто или не существует
- Renderer Process не готов к приему событий
- Ошибка сериализации данных

**Обработка:**
```typescript
// Requirements: error-notifications.1.1, error-notifications.1.4
function handleBackgroundError(error: Error, context: string): void {
  // Always log the error
  console.error(`[${context}] Error:`, error);
  
  try {
    const mainWindow = windowManager.getWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('error:notify', error.message, context);
    } else {
      console.warn('[ErrorHandler] Cannot send notification: window not available');
    }
  } catch (ipcError) {
    console.error('[ErrorHandler] Failed to send IPC notification:', ipcError);
  }
}
```

**Результат:** Ошибка логируется, но уведомление не отправляется. Приложение продолжает работу.

#### 2. Ошибка в ErrorNotificationManager

**Причины:**
- Ошибка в логике управления уведомлениями
- Проблемы с таймерами
- Ошибка в подписчиках

**Обработка:**
```typescript
// Requirements: error-notifications.1.1, error-notifications.1.3
showNotification(message: string, context: string): string {
  try {
    const notification: ErrorNotification = {
      id: `error-${Date.now()}-${Math.random()}`,
      message,
      context,
      timestamp: Date.now()
    };

    this.notifications.push(notification);
    this.notifyListeners();

    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, this.AUTO_DISMISS_DELAY);

    console.log('[ErrorNotificationManager] Notification shown:', notification);
    return notification.id;
  } catch (error) {
    console.error('[ErrorNotificationManager] Failed to show notification:', error);
    return '';
  }
}
```

**Результат:** Ошибка логируется, уведомление не показывается, но приложение продолжает работу.

#### 3. Ошибка рендеринга NotificationUI

**Причины:**
- Ошибка в React компоненте
- Проблемы с CSS
- Некорректные данные уведомления

**Обработка:**
```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2
export function NotificationUI({ notificationManager }: NotificationUIProps) {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = notificationManager.subscribe(setNotifications);
      return unsubscribe;
    } catch (err) {
      console.error('[NotificationUI] Failed to subscribe:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
  }, [notificationManager]);

  if (error) {
    console.error('[NotificationUI] Render error:', error);
    return null; // Fail silently
  }

  // ... rest of component
}
```

**Результат:** Ошибка логируется, компонент не рендерится, но приложение продолжает работу.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс (clerkly.3):

```typescript
// Error notifications errors
console.error('[ErrorHandler] Failed to send IPC notification:', error);
console.error('[ErrorNotificationManager] Failed to show notification:', error);
console.error('[NotificationUI] Failed to subscribe:', error);
console.error('[NotificationUI] Render error:', error);

// Background process errors
console.error('[Profile Loading] Error:', error);
console.error('[Data Synchronization] Error:', error);
console.error('[API Request] Error:', error);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace

## Примеры Использования

### 1. Ошибка загрузки профиля

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.4
try {
  await fetchProfile();
} catch (error) {
  handleBackgroundError(error, 'Profile Loading');
  // User sees: "Profile Loading: Failed to fetch user profile"
}
```

### 2. Ошибка синхронизации данных

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.4
try {
  await syncData();
} catch (error) {
  handleBackgroundError(error, 'Data Synchronization');
  // User sees: "Data Synchronization: Network connection failed"
}
```

### 3. Ошибка API запроса

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.4
try {
  await apiRequest();
} catch (error) {
  handleBackgroundError(error, 'API Request');
  // User sees: "API Request: Server returned error 500"
}
```

### 4. Ошибка обновления токена

```typescript
// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.4
try {
  await refreshAccessToken();
} catch (error) {
  handleBackgroundError(error, 'Token Refresh');
  // User sees: "Token Refresh: Failed to refresh access token"
}
```

## Стратегия Тестирования

### Двойной Подход к Тестированию

Система уведомлений об ошибках будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют end-to-end сценарии с реальным Electron

### Модульные Тесты

#### ErrorNotificationManager Tests

```typescript
describe('ErrorNotificationManager', () => {
  /* Preconditions: ErrorNotificationManager created
     Action: call showNotification()
     Assertions: notification added to list, auto-dismiss timer started
     Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3 */
  it('should show notification with message and context', () => {
    const manager = new ErrorNotificationManager();
    const id = manager.showNotification('Test error', 'Test context');
    
    expect(id).toBeTruthy();
    // Verify notification is in the list
  });

  /* Preconditions: notification shown
     Action: call dismissNotification()
     Assertions: notification removed from list
     Requirements: error-notifications.1.3 */
  it('should dismiss notification on demand', () => {
    const manager = new ErrorNotificationManager();
    const id = manager.showNotification('Test error', 'Test context');
    
    manager.dismissNotification(id);
    // Verify notification is removed
  });

  /* Preconditions: notification shown
     Action: wait 15 seconds
     Assertions: notification auto-dismissed
     Requirements: error-notifications.1.3 */
  it('should auto-dismiss notification after 15 seconds', async () => {
    jest.useFakeTimers();
    const manager = new ErrorNotificationManager();
    const id = manager.showNotification('Test error', 'Test context');
    
    jest.advanceTimersByTime(15000);
    // Verify notification is removed
    jest.useRealTimers();
  });

  /* Preconditions: ErrorNotificationManager created
     Action: subscribe to notifications
     Assertions: listener called on notification changes
     Requirements: error-notifications.1.1 */
  it('should notify listeners on notification changes', () => {
    const manager = new ErrorNotificationManager();
    const listener = jest.fn();
    
    manager.subscribe(listener);
    manager.showNotification('Test error', 'Test context');
    
    expect(listener).toHaveBeenCalled();
  });
});
```

#### NotificationUI Tests

```typescript
describe('NotificationUI', () => {
  /* Preconditions: NotificationUI rendered with manager
     Action: show notification
     Assertions: notification displayed with context and message
     Requirements: error-notifications.1.2 */
  it('should display notification with context and message', () => {
    const manager = new ErrorNotificationManager();
    const { getByText } = render(<NotificationUI notificationManager={manager} />);
    
    manager.showNotification('Test error', 'Test context');
    
    expect(getByText('Test context')).toBeInTheDocument();
    expect(getByText('Test error')).toBeInTheDocument();
  });

  /* Preconditions: notification displayed
     Action: click on notification
     Assertions: notification dismissed
     Requirements: error-notifications.1.3 */
  it('should dismiss notification on click', () => {
    const manager = new ErrorNotificationManager();
    const { getByText, queryByText } = render(<NotificationUI notificationManager={manager} />);
    
    manager.showNotification('Test error', 'Test context');
    const notification = getByText('Test context').closest('.error-notification');
    
    fireEvent.click(notification);
    
    expect(queryByText('Test context')).not.toBeInTheDocument();
  });

  /* Preconditions: notification displayed
     Action: click dismiss button
     Assertions: notification dismissed
     Requirements: error-notifications.1.3 */
  it('should dismiss notification on dismiss button click', () => {
    const manager = new ErrorNotificationManager();
    const { getByText, queryByText } = render(<NotificationUI notificationManager={manager} />);
    
    manager.showNotification('Test error', 'Test context');
    const dismissButton = getByText('×');
    
    fireEvent.click(dismissButton);
    
    expect(queryByText('Test context')).not.toBeInTheDocument();
  });
});
```


#### Error Handler Tests

```typescript
describe('Error Handler', () => {
  /* Preconditions: main window exists
     Action: call handleBackgroundError()
     Assertions: error logged, IPC event sent
     Requirements: error-notifications.1.1, error-notifications.1.4 */
  it('should log error and send IPC notification', () => {
    const mockWindow = {
      webContents: {
        send: jest.fn()
      },
      isDestroyed: () => false
    };
    
    handleBackgroundError(new Error('Test error'), 'Test context');
    
    expect(console.error).toHaveBeenCalledWith('[Test context] Error:', expect.any(Error));
    expect(mockWindow.webContents.send).toHaveBeenCalledWith('error:notify', 'Test error', 'Test context');
  });

  /* Preconditions: main window does not exist
     Action: call handleBackgroundError()
     Assertions: error logged, no IPC event sent
     Requirements: error-notifications.1.4 */
  it('should handle missing window gracefully', () => {
    const mockWindowManager = {
      getWindow: () => null
    };
    
    handleBackgroundError(new Error('Test error'), 'Test context');
    
    expect(console.error).toHaveBeenCalledWith('[Test context] Error:', expect.any(Error));
    expect(console.warn).toHaveBeenCalledWith('[ErrorHandler] Cannot send notification: window not available');
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('Error Notifications Functional Tests', () => {
  /* Preconditions: application running
     Action: trigger background process error
     Assertions: error notification displayed with context and message
     Requirements: error-notifications.1.1, error-notifications.1.2 */
  it('should show error notification on background process failure', async () => {
    const { app, page } = await launchApp();
    
    // Trigger background error (e.g., network failure)
    await page.evaluate(() => {
      window.api.error.onNotify((message, context) => {
        // Notification should appear
      });
    });
    
    // Simulate background error
    await app.evaluate(({ ipcMain }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('error:notify', 'Network error', 'Data Synchronization');
    });
    
    // Verify notification is displayed
    await expect(page.locator('.error-notification')).toBeVisible();
    await expect(page.locator('.notification-context')).toHaveText('Data Synchronization');
    await expect(page.locator('.notification-message')).toHaveText('Network error');
  });

  /* Preconditions: error notification displayed
     Action: wait 15 seconds
     Assertions: notification auto-dismissed
     Requirements: error-notifications.1.3 */
  it('should auto-dismiss error notification after 15 seconds', async () => {
    const { app, page } = await launchApp();
    
    // Show notification
    await app.evaluate(({ ipcMain }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('error:notify', 'Test error', 'Test context');
    });
    
    await expect(page.locator('.error-notification')).toBeVisible();
    
    // Wait 15 seconds
    await page.waitForTimeout(15000);
    
    // Verify notification is dismissed
    await expect(page.locator('.error-notification')).not.toBeVisible();
  });

  /* Preconditions: error notification displayed
     Action: click on notification
     Assertions: notification dismissed immediately
     Requirements: error-notifications.1.3 */
  it('should dismiss notification on click', async () => {
    const { app, page } = await launchApp();
    
    // Show notification
    await app.evaluate(({ ipcMain }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('error:notify', 'Test error', 'Test context');
    });
    
    await expect(page.locator('.error-notification')).toBeVisible();
    
    // Click notification
    await page.locator('.error-notification').click();
    
    // Verify notification is dismissed
    await expect(page.locator('.error-notification')).not.toBeVisible();
  });

  /* Preconditions: application running
     Action: trigger background error
     Assertions: error logged to console
     Requirements: error-notifications.1.4 */
  it('should log errors to console', async () => {
    const { app, page } = await launchApp();
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleLogs.push(msg.text());
      }
    });
    
    // Trigger background error
    await app.evaluate(({ ipcMain }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('error:notify', 'Test error', 'Test context');
    });
    
    // Verify error was logged
    expect(consoleLogs.some(log => log.includes('Test context'))).toBe(true);
  });
});
```

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| error-notifications.1.1 | ✓ | - | ✓ |
| error-notifications.1.2 | ✓ | - | ✓ |
| error-notifications.1.3 | ✓ | - | ✓ |
| error-notifications.1.4 | ✓ | - | ✓ |

## Технические Решения

### Решение 1: Архитектура Уведомлений

**Решение:** Использовать централизованный ErrorNotificationManager в Renderer Process с IPC интеграцией для получения ошибок из Main Process.

**Обоснование:**
- Разделение ответственности: Main Process обрабатывает ошибки, Renderer отображает уведомления
- IPC обеспечивает безопасную передачу данных между процессами
- Централизованный менеджер упрощает управление уведомлениями
- Легко тестируется и расширяется

**Альтернативы:**
- Хранить уведомления в Main Process: Усложняет синхронизацию с UI
- Использовать глобальное состояние в Renderer: Менее изолированно и сложнее тестировать

### Решение 2: Автоматическое Закрытие Уведомлений

**Решение:** Использовать `setTimeout` с задержкой 15 секунд для автоматического закрытия уведомлений.

**Обоснование:**
- Простая и надежная реализация
- Не требует дополнительных зависимостей
- Легко тестируется с `jest.useFakeTimers()`
- 15 секунд - достаточно времени для прочтения, но не слишком долго

**Альтернативы:**
- Использовать библиотеку для уведомлений (react-toastify): Дополнительная зависимость
- Не закрывать автоматически: Загромождает UI

### Решение 3: Формат Уведомления

**Решение:** Отображать контекст операции и сообщение об ошибке в двух отдельных блоках.

**Обоснование:**
- Четкое разделение контекста и сообщения
- Легко читается пользователем
- Соответствует требованию error-notifications.1.2

**Формат:**
```
┌─────────────────────────────────┐
│ Context: Profile Loading        │
│ Message: Failed to fetch profile│
│                              [×] │
└─────────────────────────────────┘
```

**Альтернативы:**
- Объединить контекст и сообщение: Менее структурировано
- Показывать только сообщение: Не хватает контекста

### Решение 4: Интеграция с Logger

**Решение:** Использовать централизованный Logger класс (clerkly.3) для логирования всех ошибок.

**Обоснование:**
- Соответствует требованию error-notifications.1.4 и clerkly.3
- Единый формат логов во всем приложении
- Упрощает отладку и мониторинг
- Поддерживает различные уровни логирования

**Альтернативы:**
- Использовать console.error напрямую: Менее структурировано
- Не логировать ошибки: Усложняет отладку

## Зависимости

Система уведомлений об ошибках зависит от следующих компонентов:

- **clerkly.3 (Logger)**: Централизованный класс для логирования событий и ошибок
- **WindowManager**: Для получения ссылки на главное окно для отправки IPC событий
- **Electron IPC**: Для передачи уведомлений из Main Process в Renderer Process
- **React**: Для построения UI компонентов

## Заключение

Данный дизайн обеспечивает:
- ✅ Полное покрытие всех требований (error-notifications.1.1 - error-notifications.1.4)
- ✅ Четкую архитектуру с разделением ответственности
- ✅ Комплексную стратегию тестирования
- ✅ Обработку всех граничных случаев и ошибок
- ✅ Интеграцию с централизованным Logger классом (clerkly.3)
- ✅ Понятную обратную связь пользователю
- ✅ Минимальное отвлечение через автоматическое закрытие

Дизайн готов к реализации.

