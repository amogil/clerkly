# Документ Дизайна: Request Scope (Запрос Дополнительных Разрешений)

## Обзор

Функция `request_scope` реализует runtime-механизм запроса дополнительных Google OAuth scopes и app-level capabilities агентом. Архитектура следует существующим паттернам приложения: `AgentFeature` для регистрации инструментов, `UserSettingsManager` для персистентного хранения, event bus для коммуникации между процессами, IPC для renderer-main взаимодействия.

Ключевой принцип: вся чувствительная логика (токены, scopes, авторизация) выполняется исключительно в main process. Renderer получает только минимальный набор данных для отображения consent dialog.

## Архитектура

### Обзор Компонентов

```
LLM Agent Runtime
    │
    ├── RequestScopeFeature (AgentFeature)
    │       ├── request_scope tool
    │       └── dummy_tool
    │
    ├── RequestScopeHandler (main process orchestrator)
    │       ├── ScopeManager (persistence)
    │       ├── OAuthClientManager (re-auth)
    │       └── IPC → ScopeConsentDialog (renderer)
    │
    └── ScopeManager (key-value store via UserSettingsManager)
```

### Поток Данных

```
1. Agent calls dummy_tool
2. dummy_tool checks ScopeManager.hasCapability('dummy_tool')
3. NOT granted → return { code: 'missing_scope', scopes: ['dummy_tool'] }
4. Agent reads error, calls request_scope({ service: 'dummy', scopes: ['dummy_tool'], reason: '...' })
5. RequestScopeHandler:
   a. ScopeManager.getGrantedGoogleScopes() → check if Google scopes sufficient
   b. If not → OAuthClientManager.startReAuthFlow(additionalScopes)
      → User completes Google consent in browser
      → Deep link callback → tokens updated, scopes persisted
   c. IPC 'scope:request-consent' → ScopeConsentDialog in renderer
      → User clicks Allow/Deny
   d. If approved → ScopeManager.grantCapability('dummy_tool')
      → return { status: 'approved', scopes: ['dummy_tool'] }
   e. If denied → return { status: 'denied', scopes: [] }
6. Agent retries dummy_tool → success
```

## Компоненты Main Process

### ScopeManager

**Расположение:** `src/main/auth/ScopeManager.ts`

**Зависимости:** `UserSettingsManager`

**Хранение:** Использует существующий key-value store с ключами:
- `scope_granted_google_scopes` — JSON-массив granted Google scopes
- `scope_granted_capabilities` — JSON-массив granted app-level capabilities

```typescript
// Requirements: request-scope.1
export class ScopeManager {
  private readonly KEYS = {
    GOOGLE_SCOPES: 'scope_granted_google_scopes',
    CAPABILITIES: 'scope_granted_capabilities',
  } as const;

  constructor(private readonly settingsManager: IUserSettingsManager) {}

  // Requirements: request-scope.1.5
  getGrantedGoogleScopes(): string[] { ... }

  // Requirements: request-scope.1.1
  persistGrantedGoogleScopes(scopes: string[]): void { ... }

  // Requirements: request-scope.1.6
  getGrantedCapabilities(): string[] { ... }

  // Requirements: request-scope.1.3
  hasCapability(capability: string): boolean { ... }

  // Requirements: request-scope.1.2
  grantCapability(capability: string): void { ... }

  // Requirements: request-scope.6.4
  revokeCapability(capability: string): void { ... }

  // Requirements: request-scope.1.4
  clearAll(): void { ... }
}
```

### RequestScopeHandler

**Расположение:** `src/main/tools/RequestScopeHandler.ts`

**Зависимости:** `ScopeManager`, `OAuthClientManager`, IPC (для consent dialog)

Оркестрирует полный flow запроса разрешений. Сериализует concurrent requests — если request_scope уже выполняется, второй вызов ждёт завершения первого.

```typescript
// Requirements: request-scope.2
export interface RequestScopeInput {
  service: string;
  scopes: string[];
  reason: string;
}

export interface RequestScopeResult {
  status: 'approved' | 'denied' | 'cancelled' | 'error';
  scopes: string[];
}

export class RequestScopeHandler {
  constructor(
    private scopeManager: ScopeManager,
    private oauthClient: OAuthClientManager,
    private consentRequester: (input: ConsentRequest) => Promise<ConsentResponse>
  ) {}

  // Requirements: request-scope.2.1, request-scope.2.2, request-scope.2.3
  async execute(input: RequestScopeInput, signal?: AbortSignal): Promise<RequestScopeResult> {
    // 1. Check if Google scopes are sufficient
    // 2. If not, trigger incremental re-auth
    // 3. Show consent dialog
    // 4. Return result
  }
}
```

### DummyTool

**Расположение:** `src/main/tools/DummyTool.ts`

**Зависимости:** `ScopeManager`

```typescript
// Requirements: request-scope.3

export interface DummyToolInput {
  message: string;
}

export type DummyToolOutput =
  | { status: 'success'; echo: string }
  | { code: 'missing_scope'; scopes: string[]; message: string };

// Requirements: request-scope.3.1, request-scope.3.2, request-scope.3.3
export function executeDummyTool(
  input: DummyToolInput,
  scopeManager: ScopeManager
): DummyToolOutput {
  if (!scopeManager.hasCapability('dummy_tool')) {
    return {
      code: 'missing_scope',
      scopes: ['dummy_tool'],
      message: 'dummy_tool capability not granted. Use request_scope to request it.',
    };
  }
  return { status: 'success', echo: input.message };
}
```

### Инкрементальная Re-Авторизация

**Расположение:** Расширение `src/main/auth/OAuthClientManager.ts`

```typescript
// Requirements: request-scope.4.1
// Новый метод в OAuthClientManager
async startReAuthFlow(additionalScopes: string[]): Promise<AuthStatus> {
  // Merge existing scopes with additional
  const allScopes = [...new Set([...this.config.scopes, ...additionalScopes])];

  // Build auth URL with include_granted_scopes=true
  const authUrl = new URL(this.config.authorizationEndpoint);
  authUrl.searchParams.set('scope', allScopes.join(' '));
  authUrl.searchParams.set('include_granted_scopes', 'true');
  // ... standard PKCE params ...

  // Open browser, wait for deep link callback
  // Requirements: request-scope.4.2 — persist scope from TokenResponse
  // Requirements: request-scope.4.3 — on error, don't lose existing tokens
}
```

**Отличия от startAuthFlow:**
- Не использует `prompt=consent` (может использовать `prompt=consent` или default)
- Добавляет `include_granted_scopes=true`
- Объединяет scopes вместо замены
- При ошибке НЕ очищает существующие токены (в отличие от начальной авторизации)

### Различие startAuthFlow и startReAuthFlow

| Аспект | startAuthFlow | startReAuthFlow |
|--------|---------------|-----------------|
| Когда | Первая авторизация | Запрос дополнительных scopes |
| Scopes | Фиксированные из config | Текущие + дополнительные |
| include_granted_scopes | Нет | Да |
| При ошибке | Очищает всё | Сохраняет существующие токены |
| После успеха | Создаёт сессию | Обновляет токены, сохраняет scopes |

## Компоненты Renderer

### ScopeConsentDialog

**Расположение:** `src/renderer/components/auth/ScopeConsentDialog.tsx`

Модальный диалог, отображающий запрос на предоставление разрешения.

**Props (через IPC):**
```typescript
// Requirements: request-scope.5.1, request-scope.6.2
interface ConsentRequest {
  service: string;    // Название сервиса
  scopes: string[];   // Запрашиваемые разрешения
  reason: string;     // Причина запроса от агента
}
```

**Возврат (через IPC):**
```typescript
// Requirements: request-scope.5.2, request-scope.5.3
interface ConsentResponse {
  approved: boolean;
}
```

**UI контракт:**
- Модальный диалог поверх основного интерфейса
- Заголовок: "Permission Request"
- Секция с названием сервиса и причиной запроса
- Список запрашиваемых разрешений
- Кнопка "Allow" (primary) и "Deny" (secondary)
- Диалог блокирует взаимодействие с основным UI (modal overlay)

### IPC Контракт

**Канал:** `scope:request-consent`

**Main → Renderer:** `ConsentRequest`
**Renderer → Main:** `ConsentResponse`

Реализация через `ipcMain.handle` / `ipcRenderer.invoke`:

```typescript
// Main process
ipcMain.handle('scope:request-consent', async (event, request: ConsentRequest) => {
  // Send to renderer window and wait for response
  const window = BrowserWindow.getAllWindows()[0];
  // Use event-based approach: send request, wait for response event
  return new Promise<ConsentResponse>((resolve) => {
    // ... implementation
  });
});
```

## Интеграция с Event System

### Новые Event Types

**Расположение:** `src/shared/events/constants.ts`, `src/shared/events/types.ts`

```typescript
// Requirements: request-scope.2, request-scope.4, request-scope.5
export const EVENT_TYPES = {
  // ... existing ...
  SCOPE_REAUTH_STARTED: 'scope.reauth.started',
  SCOPE_REAUTH_COMPLETED: 'scope.reauth.completed',
  SCOPE_REAUTH_FAILED: 'scope.reauth.failed',
  SCOPE_CONSENT_REQUESTED: 'scope.consent.requested',
  SCOPE_CONSENT_APPROVED: 'scope.consent.approved',
  SCOPE_CONSENT_DENIED: 'scope.consent.denied',
} as const;
```

## Интеграция с LLM Agent Runtime

### RequestScopeFeature

**Расположение:** `src/main/agents/RequestScopeFeature.ts`

Реализует `AgentFeature` интерфейс. Предоставляет system prompt секцию и tool definitions для `request_scope` и `dummy_tool`.

```typescript
// Requirements: request-scope.7
export class RequestScopeFeature implements AgentFeature {
  name = 'request_scope';

  constructor(
    private scopeManager: ScopeManager,
    private requestScopeHandler: RequestScopeHandler
  ) {}

  // Requirements: request-scope.7.2, request-scope.7.3, request-scope.7.4
  getSystemPromptSection(): string {
    return [
      'Permission request workflow:',
      '- Some tools require capabilities/permissions that must be explicitly granted by the user.',
      '- If a tool returns an error with code "missing_scope", use `request_scope` to request the required capability.',
      '- `request_scope` input: { service: string, scopes: string[], reason: string }',
      '- `request_scope` result: { status: "approved"|"denied"|"cancelled"|"error", scopes: string[] }',
      '- If approved, retry the original tool call.',
      '- If denied or error, inform the user and continue without the requested capability.',
      '',
      'dummy_tool:',
      '- A test tool that requires the "dummy_tool" capability.',
      '- Input: { message: string }',
      '- If capability not granted: returns { code: "missing_scope", scopes: ["dummy_tool"], message: "..." }',
      '- If capability granted: returns { status: "success", echo: message }',
    ].join('\n');
  }

  // Requirements: request-scope.7.1
  getTools(): LLMTool[] {
    return [
      {
        name: 'request_scope',
        description: 'Request additional capabilities/permissions from the user.',
        parameters: {
          type: 'object',
          required: ['service', 'scopes', 'reason'],
          properties: {
            service: { type: 'string', description: 'Service name requiring the capability' },
            scopes: { type: 'array', items: { type: 'string' }, description: 'Required capabilities' },
            reason: { type: 'string', description: 'Why the agent needs this capability' },
          },
        },
        execute: async (args, signal) => {
          return this.requestScopeHandler.execute(args as RequestScopeInput, signal);
        },
      },
      {
        name: 'dummy_tool',
        description: 'Test tool requiring dummy_tool capability. Echoes input message.',
        parameters: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', description: 'Message to echo' },
          },
        },
        execute: async (args) => {
          return executeDummyTool(args as DummyToolInput, this.scopeManager);
        },
      },
    ];
  }
}
```

### Регистрация в index.ts

```typescript
// src/main/index.ts
// Requirements: request-scope.7.1
const scopeManager = new ScopeManager(dataManager);
const requestScopeHandler = new RequestScopeHandler(scopeManager, oauthClient, consentRequester);
const requestScopeFeature = new RequestScopeFeature(scopeManager, requestScopeHandler);

const promptBuilder = new PromptBuilder(
  BASE_SYSTEM_PROMPT,
  [new FinalAnswerFeature(), new CodeExecFeature(sandboxSessionManager), requestScopeFeature],
  new FullHistoryStrategy()
);
```

## Tool Timeout Consideration

`request_scope` — инструмент, который может выполняться минуты (пользователь проходит Google re-auth + принимает решение в consent dialog). Текущий `ToolRunnerPolicy.timeoutMs` по умолчанию 30 секунд.

Решение: инструменты `request_scope` и `dummy_tool` имеют свои `execute` функции, которые вызываются напрямую через `bindToolExecutors` в `MainPipeline` (не через `ToolRunner.executeBatch`). Timeout контролируется через AbortSignal от AI SDK, а не через ToolRunner policy.

## Стратегия Тестирования

### Модульные Тесты

- `tests/unit/auth/ScopeManager.test.ts` — persistence logic, grant/revoke, clearAll, edge cases
- `tests/unit/tools/RequestScopeHandler.test.ts` — orchestration, all status branches, abort handling
- `tests/unit/tools/DummyTool.test.ts` — capability check, missing_scope error, success path
- `tests/unit/auth/OAuthClientManager.reauth.test.ts` — incremental re-auth, scope merging, error preservation

### Функциональные Тесты

- `tests/functional/request-scope-flow.spec.ts` — full E2E workflow with real Electron, mock OAuth, consent dialog interaction

### Покрытие Требований

| Требование | Модульные Тесты | Функциональные Тесты |
|------------|-----------------|---------------------|
| request-scope.1.1 | `ScopeManager.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.1.2 | `ScopeManager.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.1.3 | `ScopeManager.test.ts` | - |
| request-scope.1.4 | `ScopeManager.test.ts` | - |
| request-scope.1.5 | `ScopeManager.test.ts` | - |
| request-scope.1.6 | `ScopeManager.test.ts` | - |
| request-scope.1.7 | `ScopeManager.test.ts` | - |
| request-scope.2.1 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.2.2 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.2.3 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.2.4 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.2.5 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.2.6 | `RequestScopeHandler.test.ts` | - |
| request-scope.3.1 | `DummyTool.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.3.2 | `DummyTool.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.3.3 | `DummyTool.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.3.4 | `DummyTool.test.ts` | - |
| request-scope.4.1 | `OAuthClientManager.reauth.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.4.2 | `OAuthClientManager.reauth.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.4.3 | `OAuthClientManager.reauth.test.ts` | - |
| request-scope.5.1 | - | `request-scope-flow.spec.ts` |
| request-scope.5.2 | - | `request-scope-flow.spec.ts` |
| request-scope.5.3 | - | `request-scope-flow.spec.ts` |
| request-scope.5.4 | Security review | - |
| request-scope.5.5 | `RequestScopeHandler.test.ts` | `request-scope-flow.spec.ts` |
| request-scope.6.1 | Architecture review | - |
| request-scope.6.2 | IPC contract test | - |
| request-scope.6.3 | Architecture review | - |
| request-scope.6.4 | `ScopeManager.test.ts` | - |
| request-scope.6.5 | `ScopeManager.test.ts` | - |
| request-scope.7.1 | `PromptBuilder` integration | `request-scope-flow.spec.ts` |
| request-scope.7.2 | Prompt snapshot test | - |
| request-scope.7.3 | Prompt snapshot test | - |
| request-scope.7.4 | Prompt snapshot test | - |
