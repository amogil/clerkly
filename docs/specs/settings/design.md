# Документ Дизайна: Settings

## Обзор

Данный документ описывает архитектуру и дизайн страницы настроек приложения Clerkly, включая настройки LLM Provider (провайдер и API ключ) и форматирование дат и времени из системных настроек.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DatabaseManager) является единственным источником истины для всех данных приложения**.

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

- Обеспечить простую настройку провайдера LLM для работы с задачами
- Автоматически использовать системные настройки локали для форматирования дат
- Безопасно хранить API ключи с шифрованием (когда доступно)
- Изолировать настройки между пользователями
- Следовать принципу единого источника истины (база данных)

### Технологический Стек

- **Electron**: Фреймворк для создания десктопных приложений
- **TypeScript**: Язык программирования для типобезопасности
- **SQLite**: База данных для хранения настроек (через DatabaseManager и UserSettingsManager)
- **safeStorage API**: Electron API для безопасного хранения чувствительных данных
- **Intl.DateTimeFormat**: JavaScript API для форматирования дат по системной локали

## Архитектура Тестирования Подключения к LLM Provider

### Обзор

Система тестирования подключения позволяет пользователям проверить валидность API ключа и доступность выбранного LLM провайдера перед началом работы с агентом.

### Компоненты Системы Тестирования

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ LLMProviderFactory   │──────▶│   ILLMProvider      │     │
│  │                      │       │   (Interface)       │     │
│  │ - createProvider()   │       │  - testConnection() │     │
│  └──────────────────────┘       │  - getProviderName()│     │
│           │                      └─────────────────────┘     │
│           ▼                               │                  │
│  ┌──────────────────────┐                │                  │
│  │  OpenAIProvider      │◀───────────────┘                  │
│  │  AnthropicProvider   │                                    │
│  │  GoogleProvider      │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────┐                                    │
│  │  LLMIPCHandlers      │                                    │
│  │  - llm:test-connection│                                   │
│  └──────────────────────┘                                    │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │ IPC
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │  Settings Component            │         │
   │  │                                │         │
   │  │  - Test Connection button      │         │
   │  │  - testingConnection state     │         │
   │  │  - handleTestConnection()      │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │  Error Context                 │         │
   │  │  - showSuccess()               │         │
   │  │  - showError()                 │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Тестирования Подключения

1. **Инициация тестирования**:
   - Пользователь кликает кнопку "Test Connection"
   - Кнопка становится disabled, текст меняется на "Testing..."
   - UI отправляет IPC запрос `llm:test-connection` с провайдером и API ключом

2. **Обработка в Main Process**:
   - `LLMIPCHandlers` получает запрос
   - Создает экземпляр провайдера через `LLMProviderFactory`
   - Вызывает `testConnection()` с API ключом
   - Провайдер отправляет минимальный тестовый запрос к API
   - Обрабатывает ответ (success/error)

3. **Возврат результата**:
   - Результат возвращается в Renderer Process
   - При успехе: показывается уведомление об успехе
   - При ошибке: показывается уведомление об ошибке через error-notifications.1
   - Кнопка возвращается в состояние "Test Connection" и становится enabled

### Интерфейс ILLMProvider

```typescript
// Requirements: settings.3

interface TestConnectionResult {
  success: boolean;
  error?: string;
}

interface ILLMProvider {
  /**
   * Test connection to LLM provider
   * Requirements: settings.3.5, settings.3.6, settings.3.7, settings.3.8
   */
  testConnection(apiKey: string): Promise<TestConnectionResult>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}
```

### Реализации Провайдеров

#### OpenAIProvider

```typescript
// Requirements: settings.3.5

class OpenAIProvider implements ILLMProvider {
  getProviderName(): string {
    return 'OpenAI';
  }

  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          input: [{ role: 'user', content: 'Return JSON: {"ok": true}' }],
          max_output_tokens: 16,
          text: { format: { type: 'json_object' } }
        }),
        signal: AbortSignal.timeout(10000) // Requirements: settings.3.6 - 10 second timeout
      });

      // Requirements: settings.3.7, settings.3.8 - Handle response
      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: this.mapErrorToMessage(response.status, errorData)
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapExceptionToMessage(error)
      };
    }
  }

  private mapErrorToMessage(status: number, errorData: any): string {
    // Requirements: settings.3.8 - Error messages
    switch (status) {
      case 401:
        return 'Invalid API key. Please check your key and try again.';
      case 403:
        return 'Access forbidden. Please check your API key permissions.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      case 500:
      case 502:
      case 503:
        return 'Provider service unavailable. Please try again later.';
      default:
        return `Connection failed: ${errorData.error?.message || 'Unknown error'}`;
    }
  }

  private mapExceptionToMessage(error: any): string {
    // Requirements: settings.3.8 - Network errors
    if (error.name === 'AbortError') {
      return 'Model response timeout. The provider took too long to respond. Please try again later.';
    }
    return 'Network error. Please check your internet connection.';
  }
}
```

#### AnthropicProvider

```typescript
// Requirements: settings.3.5

class AnthropicProvider implements ILLMProvider {
  getProviderName(): string {
    return 'Anthropic';
  }

  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-6',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000) // Requirements: settings.3.6
      });

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: this.mapErrorToMessage(response.status, errorData)
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapExceptionToMessage(error)
      };
    }
  }

  private mapErrorToMessage(status: number, errorData: any): string {
    // Same mapping as OpenAI
    switch (status) {
      case 401:
        return 'Invalid API key. Please check your key and try again.';
      case 403:
        return 'Access forbidden. Please check your API key permissions.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      case 500:
      case 502:
      case 503:
        return 'Provider service unavailable. Please try again later.';
      default:
        return `Connection failed: ${errorData.error?.message || 'Unknown error'}`;
    }
  }

  private mapExceptionToMessage(error: any): string {
    if (error.name === 'AbortError') {
      return 'Model response timeout. The provider took too long to respond. Please try again later.';
    }
    return 'Network error. Please check your internet connection.';
  }
}
```

#### GoogleProvider

```typescript
// Requirements: settings.3.5

class GoogleProvider implements ILLMProvider {
  getProviderName(): string {
    return 'Google';
  }

  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    try {
      // Requirements: settings.3.5 - Minimal test request
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }]
          }),
          signal: AbortSignal.timeout(10000) // Requirements: settings.3.6
        }
      );

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: this.mapErrorToMessage(response.status, errorData)
      };
    } catch (error) {
      return {
        success: false,
        error: this.mapExceptionToMessage(error)
      };
    }
  }

  private mapErrorToMessage(status: number, errorData: any): string {
    // Same mapping as OpenAI
    switch (status) {
      case 401:
        return 'Invalid API key. Please check your key and try again.';
      case 403:
        return 'Access forbidden. Please check your API key permissions.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      case 500:
      case 502:
      case 503:
        return 'Provider service unavailable. Please try again later.';
      default:
        return `Connection failed: ${errorData.error?.message || 'Unknown error'}`;
    }
  }

  private mapExceptionToMessage(error: any): string {
    if (error.name === 'AbortError') {
      return 'Model response timeout. The provider took too long to respond. Please try again later.';
    }
    return 'Network error. Please check your internet connection.';
  }
}
```

### LLMProviderFactory

```typescript
// Requirements: settings.3

class LLMProviderFactory {
  static createProvider(type: 'openai' | 'anthropic' | 'google'): ILLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      case 'google':
        return new GoogleProvider();
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }
}
```

### IPC Handlers

```typescript
// Requirements: settings.3.4, settings.3.9

import { ipcMain } from 'electron';
import { Logger } from './Logger';

const logger = Logger.create('LLMIPCHandlers');

ipcMain.handle('llm:test-connection', async (event, { provider, apiKey }) => {
  try {
    // Requirements: settings.3.9 - Log attempt (only first 4 chars of key)
    logger.info(`Testing connection to ${provider} (key: ${apiKey.substring(0, 4)}...)`);

    const llmProvider = LLMProviderFactory.createProvider(provider);
    const result = await llmProvider.testConnection(apiKey);

    // Requirements: settings.3.9 - Log result
    if (result.success) {
      logger.info(`Connection test successful for ${provider}`);
    } else {
      logger.warn(`Connection test failed for ${provider}: ${result.error}`);
    }

    return result;
  } catch (error) {
    logger.error(`Test connection failed: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

### UI Component Updates

```typescript
// Requirements: settings.3.1, settings.3.2, settings.3.3, settings.3.4

export function Settings() {
  const { showSuccess, showError } = useError();
  const [testingConnection, setTestingConnection] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');

  // Requirements: settings.3.4 - Handle test connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await window.api.llm.testConnection(llmProvider, apiKey);
      
      if (result.success) {
        // Requirements: settings.3.7 - Show success notification
        showSuccess('Connection successful! Your API key is valid.');
      } else {
        // Requirements: settings.3.8 - Show error notification
        showError(result.error || 'Connection failed: Unknown error');
      }
    } catch (error) {
      showError(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Requirements: settings.3.7, settings.3.8 - Reset button state
      setTestingConnection(false);
    }
  };

  return (
    <div className="pt-4 border-t border-border">
      {/* Requirements: settings.3.1, settings.3.2, settings.3.3 */}
      <button
        onClick={handleTestConnection}
        disabled={testingConnection || apiKey.trim() === ''}
        className="text-sm px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testingConnection ? 'Testing...' : 'Test Connection'}
      </button>
    </div>
  );
}
```

### Preload API

```typescript
// Requirements: settings.3

contextBridge.exposeInMainWorld('api', {
  // ... existing API
  llm: {
    testConnection: (provider: string, apiKey: string) =>
      ipcRenderer.invoke('llm:test-connection', { provider, apiKey })
  }
});
```

## Архитектура

### Компоненты Системы

Система настроек состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ AIAgentSettingsManager│──────▶│  UserSettingsManager │     │
│  │                      │       │     (SQLite)        │     │
│  │ - saveSettings()     │       │  - saveData()       │     │
│  │ - loadSettings()     │       │  - loadData()       │     │
│  │ - encryptAPIKey()    │       │  - deleteData()     │     │
│  │ - decryptAPIKey()    │       └─────────────────────┘     │
│  └──────────────────────┘                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────┐                                    │
│  │  Electron            │                                    │
│  │  safeStorage API     │                                    │
│  └──────────────────────┘                                    │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │ IPC
            ▼
   ┌─────────────────────────────────────────────┐
   │          Renderer Process                   │
   │                                              │
   │  ┌────────────────────────────────┐         │
   │  │  Settings Component            │         │
   │  │  (LLM Provider Section)        │         │
   │  │                                │         │
   │  │  - LLM Provider dropdown       │         │
   │  │  - API Key input (password)    │         │
   │  │  - Toggle visibility button    │         │
   │  │  - Auto-save with debounce     │         │
   │  └────────────────────────────────┘         │
   │           │                                  │
   │           ▼                                  │
   │  ┌────────────────────────────────┐         │
   │  │  DateTimeFormatter             │         │
   │  │                                │         │
   │  │  - formatDate()                │         │
   │  │  - formatDateTime()            │         │
   │  │  - formatLogTimestamp()        │         │
   │  └────────────────────────────────┘         │
   └─────────────────────────────────────────────┘
```

### Поток Данных

1. **Загрузка настроек при запуске**:
   - `Settings Component` запрашивает настройки через IPC
   - `AIAgentSettingsManager` загружает настройки из базы данных через `UserSettingsManager`
   - Если настройки отсутствуют, используются значения по умолчанию
   - Настройки отображаются в UI

2. **Изменение LLM провайдера**:
   - Пользователь выбирает провайдера из выпадающего списка
   - Изменение немедленно сохраняется в базу данных (без debounce)
   - Поле API Key автоматически загружает ключ выбранного провайдера

3. **Изменение API ключа**:
   - Пользователь вводит API ключ
   - Изменения сохраняются с debounce 500ms
   - Ключ шифруется (если доступно) перед сохранением
   - Если поле очищено, запись удаляется из базы

4. **Форматирование дат**:
   - Компоненты используют `DateTimeFormatter` для форматирования timestamp
   - `DateTimeFormatter` использует системную локаль через `Intl.DateTimeFormat`
   - Даты отображаются в привычном для пользователя формате

## Компоненты и Интерфейсы

### AIAgentSettingsManager (Новый Компонент)

Класс для управления настройками AI агента.


```typescript
// Requirements: settings.1

interface AIAgentSettings {
  llmProvider: 'openai' | 'anthropic' | 'google';
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
  encryptionStatus: {
    openai?: boolean;
    anthropic?: boolean;
    google?: boolean;
  };
}

class AIAgentSettingsManager {
  private userSettingsManager: UserSettingsManager;
  private userProfileManager: UserProfileManager;
  
  constructor(userSettingsManager: UserSettingsManager, userProfileManager: UserProfileManager) {
    this.userSettingsManager = userSettingsManager;
    this.userProfileManager = userProfileManager;
  }

  /**
   * Save LLM provider selection
   * Requirements: settings.1.10
   */
  async saveLLMProvider(provider: 'openai' | 'anthropic' | 'google'): Promise<void> {
    try {
      await this.userSettingsManager.saveData('ai_agent_llm_provider', provider);
      console.log('[AIAgentSettingsManager] LLM provider saved:', provider);
    } catch (error) {
      console.error('[AIAgentSettingsManager] Failed to save LLM provider:', error);
      throw error;
    }
  }

  /**
   * Save API key for specific provider
   * Requirements: settings.1.9, settings.1.14, settings.1.15, settings.1.16, settings.1.17
   */
  async saveAPIKey(provider: 'openai' | 'anthropic' | 'google', apiKey: string): Promise<void> {
    try {
      const { safeStorage } = require('electron');
      let encryptedKey: string;
      let isEncrypted: boolean;

      // Requirements: settings.1.14, settings.1.15 - Try to encrypt, fallback to plain text
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = safeStorage.encryptString(apiKey);
          encryptedKey = buffer.toString('base64');
          isEncrypted = true;
          console.log(`[AIAgentSettingsManager] API key encrypted for ${provider}`);
        } catch (encryptError) {
          console.warn(`[AIAgentSettingsManager] Encryption failed, falling back to plain text:`, encryptError);
          encryptedKey = apiKey;
          isEncrypted = false;
        }
      } else {
        console.log(`[AIAgentSettingsManager] Encryption unavailable, storing plain text for ${provider}`);
        encryptedKey = apiKey;
        isEncrypted = false;
      }

      // Requirements: settings.1.16, settings.1.17 - Save with provider-specific keys
      await this.userSettingsManager.saveData(`ai_agent_api_key_${provider}`, encryptedKey);
      await this.userSettingsManager.saveData(`ai_agent_api_key_${provider}_encrypted`, isEncrypted);
      
      console.log(`[AIAgentSettingsManager] API key saved for ${provider}`);
    } catch (error) {
      console.error(`[AIAgentSettingsManager] Failed to save API key for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Load API key for specific provider
   * Requirements: settings.1.22
   */
  async loadAPIKey(provider: 'openai' | 'anthropic' | 'google'): Promise<string | null> {
    try {
      const keyResult = await this.userSettingsManager.loadData(`ai_agent_api_key_${provider}`);
      const encryptedResult = await this.userSettingsManager.loadData(`ai_agent_api_key_${provider}_encrypted`);

      if (!keyResult.success || !keyResult.data) {
        return null;
      }

      const storedKey = keyResult.data as string;
      const isEncrypted = encryptedResult.success && encryptedResult.data === true;

      // Requirements: settings.1.22 - Decrypt if encrypted
      if (isEncrypted) {
        try {
          const { safeStorage } = require('electron');
          const buffer = Buffer.from(storedKey, 'base64');
          const decryptedKey = safeStorage.decryptString(buffer);
          console.log(`[AIAgentSettingsManager] API key decrypted for ${provider}`);
          return decryptedKey;
        } catch (decryptError) {
          console.error(`[AIAgentSettingsManager] Decryption failed for ${provider}:`, decryptError);
          return null;
        }
      }

      console.log(`[AIAgentSettingsManager] API key loaded (plain text) for ${provider}`);
      return storedKey;
    } catch (error) {
      console.error(`[AIAgentSettingsManager] Failed to load API key for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Delete API key for specific provider
   * Requirements: settings.1.11
   */
  async deleteAPIKey(provider: 'openai' | 'anthropic' | 'google'): Promise<void> {
    try {
      await this.userSettingsManager.deleteData(`ai_agent_api_key_${provider}`);
      await this.userSettingsManager.deleteData(`ai_agent_api_key_${provider}_encrypted`);
      console.log(`[AIAgentSettingsManager] API key deleted for ${provider}`);
    } catch (error) {
      console.error(`[AIAgentSettingsManager] Failed to delete API key for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Load all settings
   * Requirements: settings.1.20, settings.1.21
   */
  async loadSettings(): Promise<AIAgentSettings> {
    try {
      const providerResult = await this.userSettingsManager.loadData('ai_agent_llm_provider');
      const provider = (providerResult.success && providerResult.data) 
        ? providerResult.data as 'openai' | 'anthropic' | 'google'
        : 'openai'; // Requirements: settings.1.21 - Default to openai

      const apiKeys = {
        openai: await this.loadAPIKey('openai'),
        anthropic: await this.loadAPIKey('anthropic'),
        google: await this.loadAPIKey('google')
      };

      const encryptionStatus = {
        openai: await this.isKeyEncrypted('openai'),
        anthropic: await this.isKeyEncrypted('anthropic'),
        google: await this.isKeyEncrypted('google')
      };

      return {
        llmProvider: provider,
        apiKeys: {
          ...(apiKeys.openai && { openai: apiKeys.openai }),
          ...(apiKeys.anthropic && { anthropic: apiKeys.anthropic }),
          ...(apiKeys.google && { google: apiKeys.google })
        },
        encryptionStatus
      };
    } catch (error) {
      console.error('[AIAgentSettingsManager] Failed to load settings:', error);
      // Requirements: settings.1.21 - Return defaults on error
      return {
        llmProvider: 'openai',
        apiKeys: {},
        encryptionStatus: {}
      };
    }
  }

  private async isKeyEncrypted(provider: 'openai' | 'anthropic' | 'google'): Promise<boolean> {
    const result = await this.userSettingsManager.loadData(`ai_agent_api_key_${provider}_encrypted`);
    return result.success && result.data === true;
  }
}
```

**Ключевые особенности:**
- Использует `UserSettingsManager` для персистентности настроек
- Автоматическое шифрование API ключей через `safeStorage` (когда доступно)
- Раздельное хранилище для каждого провайдера
- Graceful degradation при недоступности шифрования
- Изоляция данных по пользователям через `UserSettingsManager`


### DateTimeFormatter (Утилитный Класс)

Класс для форматирования дат и времени с использованием системной локали.

```typescript
// Requirements: settings.2

class DateTimeFormatter {
  /**
   * Format date using system locale
   * Requirements: settings.2.1, settings.2.2
   */
  static formatDate(timestamp: number): string {
    try {
      // Requirements: settings.2.1 - Use system locale (undefined = system default)
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      return formatter.format(new Date(timestamp));
    } catch (error) {
      console.error('[DateTimeFormatter] Failed to format date:', error);
      // Fallback to default locale
      return new Date(timestamp).toLocaleDateString();
    }
  }

  /**
   * Format datetime using system locale
   * Requirements: settings.2.1, settings.2.2
   */
  static formatDateTime(timestamp: number): string {
    try {
      // Requirements: settings.2.1 - Use system locale
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return formatter.format(new Date(timestamp));
    } catch (error) {
      console.error('[DateTimeFormatter] Failed to format datetime:', error);
      // Fallback to default locale
      return new Date(timestamp).toLocaleString();
    }
  }

  /**
   * Format timestamp for logs (fixed format)
   * Requirements: settings.2.3
   */
  static formatLogTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
```

**Ключевые особенности:**
- Использует `Intl.DateTimeFormat` с системной локалью (undefined)
- Фиксированный формат для логов (YYYY-MM-DD HH:MM:SS)
- Graceful fallback при ошибках форматирования
- Статические методы для удобства использования

### Settings Component (Renderer)

React компонент для страницы настроек с секцией LLM Provider.

```typescript
// Requirements: settings.1

import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type LLMProvider = 'openai' | 'anthropic' | 'google';

export function AIAgentSettings() {
  const [llmProvider, setLLMProvider] = useState<LLMProvider>('openai');
  const [apiKey, setAPIKey] = useState('');
  const [showAPIKey, setShowAPIKey] = useState(false); // Requirements: settings.1.2, settings.1.8
  const [loading, setLoading] = useState(true);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Requirements: settings.1.10 - Load API key when provider changes
  useEffect(() => {
    if (!loading) {
      loadAPIKeyForProvider(llmProvider);
    }
  }, [llmProvider, loading]);

  const loadSettings = async () => {
    try {
      const settings = await window.api.aiAgent.getSettings();
      setLLMProvider(settings.llmProvider);
      setAPIKey(settings.apiKeys[settings.llmProvider] || '');
    } catch (error) {
      console.error('[AIAgentSettings] Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAPIKeyForProvider = async (provider: LLMProvider) => {
    try {
      const key = await window.api.aiAgent.getAPIKey(provider);
      setAPIKey(key || '');
    } catch (error) {
      console.error(`[AIAgentSettings] Failed to load API key for ${provider}:`, error);
      setAPIKey('');
    }
  };

  // Requirements: settings.1.10 - Save provider immediately
  const handleProviderChange = async (provider: LLMProvider) => {
    setLLMProvider(provider);
    try {
      await window.api.aiAgent.saveLLMProvider(provider);
      console.log('[AIAgentSettings] Provider saved:', provider);
    } catch (error) {
      console.error('[AIAgentSettings] Failed to save provider:', error);
      // Requirements: settings.1.13 - Show error notification
      window.api.error.notify('Failed to save LLM provider', 'AI Agent Settings');
    }
  };

  // Requirements: settings.1.9 - Save API key with debounce
  const handleAPIKeyChange = useCallback((value: string) => {
    setAPIKey(value);

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Requirements: settings.1.9 - Debounce 500ms
    const timeout = setTimeout(async () => {
      try {
        if (value.trim() === '') {
          // Requirements: settings.1.11 - Delete if empty
          await window.api.aiAgent.deleteAPIKey(llmProvider);
          console.log('[AIAgentSettings] API key deleted');
        } else {
          await window.api.aiAgent.saveAPIKey(llmProvider, value);
          console.log('[AIAgentSettings] API key saved');
        }
      } catch (error) {
        console.error('[AIAgentSettings] Failed to save API key:', error);
        // Requirements: settings.1.13 - Show error notification
        window.api.error.notify('Failed to save API key', 'AI Agent Settings');
      }
    }, 500);

    setSaveTimeout(timeout);
  }, [llmProvider, saveTimeout]);

  // Requirements: settings.1.3, settings.1.4, settings.1.5, settings.1.6, settings.1.7 - Toggle visibility
  const toggleAPIKeyVisibility = () => {
    setShowAPIKey(!showAPIKey);
  };

  if (loading) {
    return <div>Loading AI Agent settings...</div>;
  }

  return (
    <div className="llm-provider-settings">
      <h3>LLM Provider</h3>
      
      {/* Requirements: settings.1.1 - LLM Provider dropdown */}
      <div className="setting-field">
        <label htmlFor="llm-provider">LLM Provider</label>
        <select
          id="llm-provider"
          value={llmProvider}
          onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
        >
          <option value="openai">OpenAI (GPT)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="google">Google (Gemini)</option>
        </select>
      </div>

      {/* Requirements: settings.1.1, settings.1.2, settings.1.3 - API Key input with toggle */}
      <div className="setting-field">
        <label htmlFor="api-key">API Key</label>
        <div className="api-key-input-wrapper">
          <input
            id="api-key"
            type={showAPIKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleAPIKeyChange(e.target.value)}
            placeholder="Enter your API key"
          />
          {/* Requirements: settings.1.3, settings.1.4, settings.1.5, settings.1.6, settings.1.7 */}
          <button
            type="button"
            className="toggle-visibility"
            onClick={toggleAPIKeyVisibility}
            aria-label={showAPIKey ? 'Hide API key' : 'Show API key'}
          >
            {showAPIKey ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      {/* Requirements: settings.1.24 - Security message */}
      <p className="security-message">
        Your API key is stored securely. It will only be used to communicate with your selected LLM provider.
      </p>

      {/* Requirements: settings.1.25 - Test Connection button (placeholder) */}
      <button type="button" className="test-connection" disabled>
        Test Connection
      </button>
    </div>
  );
}
```

**Ключевые особенности:**
- Автоматическая загрузка настроек при монтировании
- Немедленное сохранение провайдера (без debounce)
- Debounce 500ms для сохранения API ключа
- Toggle visibility для API ключа (Eye/EyeOff иконки)
- Автоматическая загрузка ключа при переключении провайдера
- Удаление ключа при очистке поля
- Показ уведомлений об ошибках


## Модели Данных

### AIAgentSettings

Интерфейс для представления настроек AI агента.

```typescript
interface AIAgentSettings {
  /**
   * Активный LLM провайдер
   */
  llmProvider: 'openai' | 'anthropic' | 'google';

  /**
   * API ключи для каждого провайдера
   */
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };

  /**
   * Статус шифрования для каждого провайдера
   */
  encryptionStatus: {
    openai?: boolean;
    anthropic?: boolean;
    google?: boolean;
  };
}
```

**Валидация:**
- `llmProvider`: Должен быть одним из: 'openai', 'anthropic', 'google'
- `apiKeys`: Опциональные строки для каждого провайдера
- `encryptionStatus`: Булевы значения, указывающие зашифрован ли ключ

### Схема Данных в SQLite

```sql
-- Таблица user_data используется для хранения настроек
-- (через UserSettingsManager с автоматической изоляцией по user_id)

-- LLM Provider
key: 'ai_agent_llm_provider'
value: 'openai' | 'anthropic' | 'google'
user_id: 'aB3xK9mNpQ'

-- API Keys (раздельное хранилище для каждого провайдера)
key: 'ai_agent_api_key_openai'
value: 'encrypted_or_plain_text_key'
user_id: 'aB3xK9mNpQ'

key: 'ai_agent_api_key_openai_encrypted'
value: true | false
user_id: 'aB3xK9mNpQ'

key: 'ai_agent_api_key_anthropic'
value: 'encrypted_or_plain_text_key'
user_id: 'aB3xK9mNpQ'

key: 'ai_agent_api_key_anthropic_encrypted'
value: true | false
user_id: 'aB3xK9mNpQ'

key: 'ai_agent_api_key_google'
value: 'encrypted_or_plain_text_key'
user_id: 'aB3xK9mNpQ'

key: 'ai_agent_api_key_google_encrypted'
value: true | false
user_id: 'aB3xK9mNpQ'
```

**Преимущества:**
- Изоляция данных по пользователям через `user_id` (автоматически через UserSettingsManager)
- Раздельное хранилище для каждого провайдера
- Метаданные о шифровании для каждого ключа
- Использует существующую инфраструктуру `UserSettingsManager`

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Сохранение LLM провайдера

*Для любого* выбранного LLM провайдера (openai, anthropic, google), изменение провайдера должно немедленно сохраниться в базу данных без debounce.

**Validates: Requirements settings.1.10**

### Property 2: Сохранение API ключа с debounce

*Для любого* введенного API ключа, изменения должны сохраняться в базу данных с задержкой 500ms после последнего изменения.

**Validates: Requirements settings.1.9**

### Property 3: Удаление пустого API ключа

*Для любого* провайдера, если пользователь очищает поле API ключа (пустая строка), запись для этого провайдера должна быть удалена из базы данных.

**Validates: Requirements settings.1.11**

### Property 4: Шифрование API ключа

*Для любого* API ключа, если `safeStorage.isEncryptionAvailable()` возвращает true, ключ должен быть зашифрован перед сохранением, и флаг `ai_agent_api_key_{provider}_encrypted` должен быть установлен в true.

**Validates: Requirements settings.1.14**

### Property 5: Сохранение без шифрования

*Для любого* API ключа, если `safeStorage.isEncryptionAvailable()` возвращает false, ключ должен быть сохранен как plain text, и флаг `ai_agent_api_key_{provider}_encrypted` должен быть установлен в false.

**Validates: Requirements settings.1.15**

### Property 6: Раздельное хранилище для провайдеров

*Для любого* LLM провайдера, API ключ должен храниться в отдельном ключе `ai_agent_api_key_{provider}`, и изменение ключа одного провайдера НЕ должно влиять на ключи других провайдеров.

**Validates: Requirements settings.1.16, settings.1.19**

### Property 7: Загрузка ключа при переключении провайдера

*Для любого* переключения между провайдерами, поле API Key должно автоматически загрузить ключ выбранного провайдера из базы данных (если он был сохранен ранее) или отобразить пустое поле с placeholder.

**Validates: Requirements settings.1.10**

### Property 8: Round-trip шифрования/дешифрования

*Для любого* API ключа, если он был зашифрован при сохранении (encrypted=true), то при загрузке он должен быть корректно расшифрован и вернуть исходное значение.

**Validates: Requirements settings.1.22**

### Property 9: Изоляция настроек по пользователям

*Для любых* двух пользователей с разными email, настройки AI Agent (провайдер и API ключи) должны быть изолированы - изменения одного пользователя НЕ должны влиять на настройки другого пользователя.

**Validates: Requirements settings.1.20 (через user-data-isolation.1)**

### Property 10: Форматирование дат по системной локали

*Для любого* timestamp, метод `DateTimeFormatter.formatDate()` должен использовать системную локаль (через `Intl.DateTimeFormat(undefined, ...)`) для форматирования даты.

**Validates: Requirements settings.2.1**

### Property 11: Фиксированный формат для логов

*Для любого* timestamp, метод `DateTimeFormatter.formatLogTimestamp()` должен возвращать строку в формате `YYYY-MM-DD HH:MM:SS` независимо от системной локали.

**Validates: Requirements settings.2.3**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Шифрование недоступно (settings.1.15)**: Когда `safeStorage.isEncryptionAvailable()` возвращает false (например, на некоторых Linux системах), API ключ должен быть сохранен как plain text с флагом encrypted=false.

2. **Ошибка шифрования (settings.1.14, settings.1.15)**: Когда `safeStorage.encryptString()` выбрасывает ошибку, система должна fallback к сохранению plain text с флагом encrypted=false.

3. **Ошибка дешифрования (settings.1.22)**: Когда `safeStorage.decryptString()` выбрасывает ошибку (например, ключ был зашифрован на другой системе), метод должен вернуть null, и пользователь увидит пустое поле.

4. **Первый запуск (settings.1.21)**: Когда настройки не найдены в базе данных (первый запуск или после очистки), должны использоваться значения по умолчанию: llmProvider='openai', apiKey=''.

5. **Переключение провайдера с сохраненными ключами (settings.1.19)**: Когда пользователь переключается между провайдерами, ключ предыдущего провайдера должен сохраниться в базе, и ключ нового провайдера должен загрузиться (если существует).

6. **Очистка поля API ключа (settings.1.11)**: Когда пользователь очищает поле API ключа (пустая строка), запись для текущего провайдера должна быть удалена из базы данных.

7. **Ошибка форматирования даты (settings.2.1)**: Когда `Intl.DateTimeFormat` выбрасывает ошибку, система должна использовать fallback форматирование через `toLocaleDateString()`.

8. **Изменение системной локали (settings.2.6)**: Когда пользователь изменяет системные настройки локали, приложение должно автоматически применить новый формат при следующем запуске.


## Обработка Ошибок

### Стратегия Обработки Ошибок

Система настроек должна обрабатывать ошибки gracefully, обеспечивая работоспособность приложения даже при возникновении проблем.

### Сценарии Ошибок

#### 1. Ошибка шифрования API ключа

**Причины:**
- safeStorage API недоступен на некоторых Linux системах
- Проблемы с системным keychain (macOS)
- Недостаточно прав доступа

**Обработка:**
```typescript
// Requirements: settings.1.14, settings.1.15
async saveAPIKey(provider: string, apiKey: string): Promise<void> {
  try {
    const { safeStorage } = require('electron');
    let encryptedKey: string;
    let isEncrypted: boolean;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = safeStorage.encryptString(apiKey);
        encryptedKey = buffer.toString('base64');
        isEncrypted = true;
        console.log(`[AIAgentSettingsManager] API key encrypted for ${provider}`);
      } catch (encryptError) {
        console.warn(`[AIAgentSettingsManager] Encryption failed, falling back to plain text:`, encryptError);
        encryptedKey = apiKey;
        isEncrypted = false;
      }
    } else {
      console.log(`[AIAgentSettingsManager] Encryption unavailable, storing plain text for ${provider}`);
      encryptedKey = apiKey;
      isEncrypted = false;
    }

    await this.userSettingsManager.saveData(`ai_agent_api_key_${provider}`, encryptedKey);
    await this.userSettingsManager.saveData(`ai_agent_api_key_${provider}_encrypted`, isEncrypted);
  } catch (error) {
    console.error(`[AIAgentSettingsManager] Failed to save API key:`, error);
    throw error;
  }
}
```

**Результат:** API ключ сохраняется как plain text, флаг encrypted=false. Приложение продолжает работу.

#### 2. Ошибка дешифрования API ключа

**Причины:**
- Ключ был зашифрован на другой системе
- Системный keychain изменился
- Поврежденные данные

**Обработка:**
```typescript
// Requirements: settings.1.22
async loadAPIKey(provider: string): Promise<string | null> {
  try {
    const keyResult = await this.userSettingsManager.loadData(`ai_agent_api_key_${provider}`);
    const encryptedResult = await this.userSettingsManager.loadData(`ai_agent_api_key_${provider}_encrypted`);

    if (!keyResult.success || !keyResult.data) {
      return null;
    }

    const storedKey = keyResult.data as string;
    const isEncrypted = encryptedResult.success && encryptedResult.data === true;

    if (isEncrypted) {
      try {
        const { safeStorage } = require('electron');
        const buffer = Buffer.from(storedKey, 'base64');
        const decryptedKey = safeStorage.decryptString(buffer);
        return decryptedKey;
      } catch (decryptError) {
        console.error(`[AIAgentSettingsManager] Decryption failed for ${provider}:`, decryptError);
        // Return null, user will need to re-enter the key
        return null;
      }
    }

    return storedKey;
  } catch (error) {
    console.error(`[AIAgentSettingsManager] Failed to load API key:`, error);
    return null;
  }
}
```

**Результат:** Возвращается null, пользователь видит пустое поле и может ввести ключ заново.

#### 3. Ошибка сохранения настроек

**Причины:**
- Ошибка записи в базу данных
- Недостаточно места на диске
- Проблемы с правами доступа

**Обработка:**
```typescript
// Requirements: settings.1.13
try {
  await window.api.aiAgent.saveAPIKey(llmProvider, value);
} catch (error) {
  console.error('[AIAgentSettings] Failed to save API key:', error);
  // Show error notification
  window.api.error.notify('Failed to save API key', 'AI Agent Settings');
}
```

**Результат:** Показывается уведомление об ошибке пользователю через стандартный механизм обработки ошибок.

#### 4. Ошибка загрузки системной локали

**Причины:**
- Некорректные системные настройки
- Неподдерживаемая локаль
- Ошибка Intl API

**Обработка:**
```typescript
// Requirements: settings.2.1
static formatDate(timestamp: number): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return formatter.format(new Date(timestamp));
  } catch (error) {
    console.error('[DateTimeFormatter] Failed to format date:', error);
    // Fallback to default locale
    return new Date(timestamp).toLocaleDateString();
  }
}
```

**Результат:** Используется fallback форматирование через `toLocaleDateString()`.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс (clerkly.3):

```typescript
// AI Agent Settings errors
console.error('[AIAgentSettingsManager] Failed to save LLM provider:', error);
console.error('[AIAgentSettingsManager] Failed to save API key:', error);
console.error('[AIAgentSettingsManager] Failed to load API key:', error);
console.error('[AIAgentSettingsManager] Encryption failed, falling back to plain text:', error);
console.error('[AIAgentSettingsManager] Decryption failed:', error);

// Date/Time Formatter errors
console.error('[DateTimeFormatter] Failed to format date:', error);
console.error('[DateTimeFormatter] Failed to format datetime:', error);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace


## Стратегия Тестирования

### Подход к Тестированию

Система настроек будет тестироваться модульными и функциональными тестами:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Функциональные тесты**: Проверяют пользовательские сценарии в UI

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок

### Модульные Тесты

#### AIAgentSettingsManager Tests

```typescript
describe('AIAgentSettingsManager', () => {
  /* Preconditions: AIAgentSettingsManager created with UserSettingsManager mock
     Action: call saveLLMProvider('anthropic')
     Assertions: UserSettingsManager.saveData called with 'ai_agent_llm_provider' and 'anthropic'
     Requirements: settings.1.10 */
  it('should save LLM provider immediately', () => {
    // Тест сохранения провайдера
  });

  /* Preconditions: safeStorage.isEncryptionAvailable() returns true
     Action: call saveAPIKey('openai', 'test-key')
     Assertions: key encrypted, saved with encrypted=true flag
     Requirements: settings.1.14 */
  it('should encrypt API key when encryption available', () => {
    // Тест шифрования ключа
  });

  /* Preconditions: safeStorage.isEncryptionAvailable() returns false
     Action: call saveAPIKey('openai', 'test-key')
     Assertions: key saved as plain text, encrypted=false flag
     Requirements: settings.1.15 */
  it('should save API key as plain text when encryption unavailable', () => {
    // Тест сохранения без шифрования
  });

  /* Preconditions: encrypted key saved in database
     Action: call loadAPIKey('openai')
     Assertions: key decrypted and returned
     Requirements: settings.1.22 */
  it('should decrypt API key when loading', () => {
    // Тест дешифрования ключа
  });

  /* Preconditions: decryption fails
     Action: call loadAPIKey('openai')
     Assertions: returns null, error logged
     Requirements: settings.1.22 */
  it('should handle decryption errors gracefully', () => {
    // Тест обработки ошибок дешифрования
  });

  /* Preconditions: API keys saved for multiple providers
     Action: call deleteAPIKey('openai')
     Assertions: only openai key deleted, other keys remain
     Requirements: settings.1.11, settings.1.16 */
  it('should delete API key for specific provider only', () => {
    // Тест удаления ключа конкретного провайдера
  });

  /* Preconditions: no settings in database
     Action: call loadSettings()
     Assertions: returns default settings (llmProvider='openai', empty apiKeys)
     Requirements: settings.1.21 */
  it('should return default settings when none exist', () => {
    // Тест возврата настроек по умолчанию
  });
});
```

#### DateTimeFormatter Tests

```typescript
describe('DateTimeFormatter', () => {
  /* Preconditions: system locale set to en-US
     Action: call formatDate(timestamp)
     Assertions: date formatted in en-US format (e.g., "Jan 15, 2024")
     Requirements: settings.2.1 */
  it('should format date using system locale', () => {
    // Тест форматирования даты по системной локали
  });

  /* Preconditions: any timestamp
     Action: call formatLogTimestamp(timestamp)
     Assertions: returns format "YYYY-MM-DD HH:MM:SS"
     Requirements: settings.2.3 */
  it('should format log timestamp in fixed format', () => {
    // Тест фиксированного формата для логов
  });

  /* Preconditions: Intl.DateTimeFormat throws error
     Action: call formatDate(timestamp)
     Assertions: fallback to toLocaleDateString(), error logged
     Requirements: settings.2.1 */
  it('should handle formatting errors gracefully', () => {
    // Тест обработки ошибок форматирования
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('Settings Functional Tests', () => {
  /* Preconditions: application launched, user authenticated, navigated to Settings
     Action: select LLM provider, enter API key, wait for auto-save
     Assertions: settings saved to database, persist after app restart
     Requirements: settings.1.9, settings.1.10 */
  it('should save and persist AI Agent settings', async () => {
    // Функциональный тест сохранения настроек
  });

  /* Preconditions: Settings page open, API key field visible
     Action: click toggle visibility button
     Assertions: input type changes from password to text, icon changes
     Requirements: settings.1.3, settings.1.4, settings.1.5 */
  it('should toggle API key visibility', async () => {
    // Функциональный тест переключения видимости
  });

  /* Preconditions: Settings page open, API keys saved for multiple providers
     Action: switch between providers
     Assertions: API key field updates with correct key for each provider
     Requirements: settings.1.10, settings.1.19 */
  it('should load correct API key when switching providers', async () => {
    // Функциональный тест переключения провайдеров
  });

  /* Preconditions: application launched with system locale en-US
     Action: view dates in application components
     Assertions: all dates formatted in en-US format
     Requirements: settings.2.1, settings.2.2 */
  it('should format dates using system locale', async () => {
    // Функциональный тест форматирования дат
  });
});
```


### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|
| settings.1.1 | ✓ | ✓ |
| settings.1.2 | ✓ | ✓ |
| settings.1.3 | ✓ | ✓ |
| settings.1.4 | ✓ | ✓ |
| settings.1.5 | ✓ | ✓ |
| settings.1.6 | ✓ | ✓ |
| settings.1.7 | ✓ | ✓ |
| settings.1.8 | ✓ | ✓ |
| settings.1.9 | ✓ | ✓ |
| settings.1.10 | ✓ | ✓ |
| settings.1.11 | ✓ | ✓ |
| settings.1.12 | ✓ | ✓ |
| settings.1.13 | ✓ | ✓ |
| settings.1.14 | ✓ | ✓ |
| settings.1.15 | ✓ | ✓ |
| settings.1.16 | ✓ | ✓ |
| settings.1.17 | ✓ | - |
| settings.1.18 | ✓ | - |
| settings.1.19 | ✓ | ✓ |
| settings.1.20 | ✓ | ✓ |
| settings.1.21 | ✓ | ✓ |
| settings.1.22 | ✓ | ✓ |
| settings.1.23 | ✓ | - | - |
| settings.1.24 | ✓ | - | - |
| settings.1.25 | - | - | - |
| settings.1.26 | ✓ | - | ✓ |
| settings.1.27 | ✓ | - | - |
| settings.3.1 | - | - | ✓ |
| settings.3.2 | ✓ | - | ✓ |
| settings.3.3 | ✓ | - | ✓ |
| settings.3.4 | ✓ | - | ✓ |
| settings.3.5 | ✓ | ✓ | ✓ |
| settings.3.6 | ✓ | - | ✓ |
| settings.3.7 | ✓ | - | ✓ |
| settings.3.8 | ✓ | ✓ | ✓ |
| settings.3.9 | ✓ | - | - |
| settings.3.10 | ✓ | - | - |
| settings.2.1 | ✓ | ✓ | ✓ |
| settings.2.2 | ✓ | ✓ | ✓ |
| settings.2.3 | ✓ | - | - |
| settings.2.4 | ✓ | - | ✓ |
| settings.2.5 | ✓ | - | ✓ |
| settings.2.6 | ✓ | - | ✓ |
| settings.2.7 | - | - | ✓ |

## Технические Решения

### Решение 1: Использование safeStorage для Шифрования

**Решение:** Использовать Electron `safeStorage` API для шифрования API ключей с graceful degradation к plain text.

**Альтернативы:**
- Хранить все ключи как plain text
- Использовать собственную реализацию шифрования
- Требовать шифрование (блокировать функциональность без него)

**Обоснование:**
- Соответствует требованиям settings.1.14, settings.1.15
- Использует нативные системные механизмы (Keychain на macOS)
- Максимальная безопасность когда возможно
- Graceful degradation когда шифрование недоступно
- Не блокирует функциональность на системах без шифрования
- Прозрачно для пользователя (автоматический выбор)

### Решение 2: Раздельное Хранилище для Провайдеров LLM

**Решение:** Хранить API ключ каждого провайдера в отдельном ключе базы данных (`ai_agent_api_key_{provider}`).

**Альтернативы:**
- Хранить все ключи в одном JSON объекте
- Перезаписывать ключ при смене провайдера
- Хранить только активный ключ

**Обоснование:**
- Соответствует требованиям settings.1.16, settings.1.19
- Позволяет сохранять ключи всех провайдеров одновременно
- Упрощает переключение между провайдерами (settings.1.10)
- Пользователь не теряет ключи при экспериментах с разными провайдерами
- Каждый ключ имеет свой флаг шифрования
- Легко расширяется для новых провайдеров

### Решение 3: Debounce для Сохранения API Ключа

**Решение:** Использовать debounce 500ms для сохранения API ключа при вводе.

**Альтернативы:**
- Сохранять при каждом изменении (без debounce)
- Сохранять только при blur (потеря фокуса)
- Использовать кнопку "Save"

**Обоснование:**
- Соответствует требованию settings.1.9
- Уменьшает количество операций записи в базу данных
- Не создает задержку для пользователя (500ms незаметно)
- Автоматическое сохранение без действий пользователя
- Баланс между отзывчивостью и производительностью
- Стандартный UX паттерн для auto-save

### Решение 4: Использование Intl.DateTimeFormat для Локализации

**Решение:** Использовать встроенный JavaScript API `Intl.DateTimeFormat(undefined, ...)` для форматирования дат по системной локали.

**Альтернативы:**
- Использовать библиотеку moment.js или date-fns
- Хардкодить формат даты
- Добавить настройку формата в UI

**Обоснование:**
- Соответствует требованию settings.2.1
- Нативный API, не требует зависимостей
- Автоматически использует системную локаль (undefined = system default)
- Поддерживает все локали без дополнительной конфигурации
- Легковесное решение
- Стандартный подход для локализации дат

### Решение 5: Фиксированный Формат для Логов

**Решение:** Использовать фиксированный формат `YYYY-MM-DD HH:MM:SS` для логов независимо от системной локали.

**Альтернативы:**
- Использовать системную локаль для логов
- Использовать ISO 8601 формат
- Использовать Unix timestamp

**Обоснование:**
- Соответствует требованию settings.2.3
- Консистентность логов независимо от локали пользователя
- Легко читается человеком
- Легко парсится программно
- Сортируется лексикографически
- Стандартный формат для логов

### Решение 6: Изоляция Данных через UserSettingsManager

**Решение:** Использовать существующий механизм изоляции данных в `UserSettingsManager` (колонка `user_id`) для автоматической изоляции настроек по пользователям.

**Альтернативы:**
- Реализовать отдельную логику изоляции для настроек
- Использовать отдельные таблицы для каждого пользователя
- Передавать user_id явно в каждый метод

**Обоснование:**
- Соответствует требованию settings.1.20 (через user-data-isolation.2)
- Использует существующую инфраструктуру
- Автоматическая изоляция без дополнительного кода
- Консистентность с остальными данными приложения
- Невозможно забыть добавить фильтрацию
- Централизованная логика изоляции

### Решение 7: Использование Существующих IPC Каналов

**Решение:** Использовать существующие IPC каналы `save-data`, `load-data`, `delete-data` для работы с настройками.

**Альтернативы:**
- Создать отдельные IPC каналы для настроек AI Agent
- Использовать REST API
- Хранить настройки в renderer process

**Обоснование:**
- Соответствует требованию settings.1.26
- Использует существующую инфраструктуру
- Не требует дополнительных IPC handlers
- Консистентность с остальными данными приложения
- Упрощает код и поддержку
