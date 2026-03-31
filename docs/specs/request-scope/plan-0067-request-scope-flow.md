# Plan: Implement first-class request_scope flow with dummy_tool for testing (#67)

## Context

Issue: https://github.com/amogil/clerkly/issues/67

Implement a first-class `request_scope` runtime capability that allows an agent to pause execution, request additional Google scopes from the user, wait for the user's decision, and continue after approval. The feature must be built independently from any specific Google product integration (e.g., Gmail) so it can be tested in isolation using a minimal `dummy_tool`.

The feature spans every layer of the application: main process (scope persistence, re-authorization, consent dialog coordination), renderer (consent dialog UI), IPC (new channels), OAuth stack (incremental re-auth), and the LLM agent runtime (new tool definitions, structured domain errors).

No existing PR.

## Analysis

### Root cause

The application currently has no mechanism for an agent to request additional Google API scopes at runtime. The OAuth flow (`src/main/auth/OAuthClientManager.ts:168-207`) always requests the same fixed set of scopes (`openid`, `email`, `profile` via `OAuthConfig.scopes`). There is no concept of granted capabilities, no consent dialog for agent-requested permissions, and no structured domain error for missing scopes.

### Key architectural observations

1. **Tool registration pattern**: Tools are registered as `AgentFeature` implementations (`src/main/agents/PromptBuilder.ts:151-155`). Each feature provides system prompt sections and tool definitions. `CodeExecFeature` (`src/main/agents/PromptBuilder.ts:483+`) is the reference pattern.

2. **Tool execution**: The LLM provider calls `execute` on each tool definition. Tools run inside `bindToolExecutors` in `MainPipeline` (`src/main/agents/MainPipeline.ts:2335-2372`). The `execute` function receives args and an `AbortSignal`.

3. **ToolRunner**: `src/main/tools/ToolRunner.ts` provides a standalone batch executor with status types `'success' | 'error' | 'policy_denied'`. Tool results flow back to the LLM as structured JSON.

4. **OAuth stack**: `OAuthClientManager` (`src/main/auth/OAuthClientManager.ts`) handles the full PKCE flow. `startAuthFlow()` builds an auth URL with fixed `this.config.scopes` and opens the system browser. The `TokenResponse` includes an optional `scope` field but it is never read or persisted. There is no re-authorization capability.

5. **Token storage**: Uses `UserSettingsManager` (`src/main/UserSettingsManager.ts`) via `TokenStorageManager` (`src/main/auth/TokenStorageManager.ts`). Key-value pairs scoped per user. Currently stores `oauth_access_token`, `oauth_refresh_token`, `oauth_expires_at`, `oauth_token_type`.

6. **IPC structure**: Auth IPC handlers in `src/main/auth/AuthIPCHandlers.ts`. Event types in `src/shared/events/types.ts`, constants in `src/shared/events/constants.ts`.

7. **DB schema**: `src/main/db/schema.ts` - no capabilities/scopes table.

8. **App initialization**: `src/main/index.ts` wires everything together. PromptBuilder is created with feature array at line 249-253.

### Affected requirements

This is a new feature. No existing requirement IDs are directly affected, though the feature builds on top of:
- `google-oauth-auth.1` (OAuth flow initialization) - will need extension for incremental scopes
- `google-oauth-auth.3` (Token exchange) - will need to persist `scope` from `TokenResponse`
- `llm-integration.4.1` (`AgentFeature` interface) - new feature implementation
- `llm-integration.11` (Tool execution) - new tool + structured domain error

### Affected specifications

- `docs/specs/request-scope/requirements.md` - NEW: full requirements for request_scope feature (7 requirement groups, 30+ acceptance criteria)
- `docs/specs/request-scope/design.md` - NEW: architecture and design (ScopeManager, RequestScopeHandler, DummyTool, ScopeConsentDialog, IPC, events, AgentFeature)
- `docs/specs/google-oauth-auth/requirements.md` - UPDATE: add requirement 17 (Incremental Re-Authorization, 5 acceptance criteria)
- `docs/specs/google-oauth-auth/design.md` - UPDATE: add section 1b (startReAuthFlow, comparison table, deep link handler re-auth flag), add requirements 17.1-17.5 to coverage table
- `docs/specs/llm-integration/requirements.md` - UPDATE: add `request_scope` and `dummy_tool` to canonical tool registry (15.2)
- `docs/specs/llm-integration/design.md` - UPDATE: add `request_scope` and `dummy_tool` to canonical tool registry

## Action plan

### Phase 1: Specifications

- [x] Create `docs/specs/request-scope/requirements.md` with full requirements for the feature
- [x] Create `docs/specs/request-scope/design.md` with architecture and design
- [x] Update `docs/specs/google-oauth-auth/requirements.md` - add requirement 17: Incremental Re-Authorization (5 acceptance criteria)
- [x] Update `docs/specs/google-oauth-auth/design.md` - add section 1b: Incremental Re-Authorization with startReAuthFlow method, comparison table, deep link handler flag; add requirements 17.1-17.5 to coverage table
- [x] Update `docs/specs/llm-integration/requirements.md` - add `request_scope` and `dummy_tool` to canonical tool registry (15.2)
- [x] Update `docs/specs/llm-integration/design.md` - add `request_scope` and `dummy_tool` to canonical tool registry

### Phase 2: Code

#### 2.1 Scope persistence layer
- [ ] Add `granted_scopes` key to `TokenStorageManager` (new key in existing key-value store, no migration needed)
- [ ] Create `src/main/auth/ScopeManager.ts` - manages granted Google scopes + app-level capabilities
  - `getGrantedGoogleScopes(): string[]`
  - `getGrantedCapabilities(): string[]`
  - `persistGrantedGoogleScopes(scopes: string[])`
  - `grantCapability(capability: string)`
  - `revokeCapability(capability: string)`
  - `hasCapability(capability: string): boolean`
  - `clearAll()` (called on logout)

#### 2.2 Incremental re-authorization
- [ ] Modify `OAuthClientManager.startAuthFlow()` to accept optional `additionalScopes: string[]` parameter
- [ ] When `additionalScopes` is provided, merge with existing scopes for the authorization URL
- [ ] After successful token exchange, read `scope` field from `TokenResponse` and persist via `ScopeManager`
- [ ] On logout, clear scope data via `ScopeManager.clearAll()`

#### 2.3 Consent dialog (IPC + renderer)
- [ ] Add IPC channel `scope:request-consent` in preload
- [ ] Add IPC handler in main process that opens an app-level consent dialog
- [ ] Create `src/renderer/components/auth/ScopeConsentDialog.tsx` - modal dialog showing what the agent is requesting and why
- [ ] Dialog returns `{ approved: boolean }` to the main process

#### 2.4 Event types for scope flow
- [ ] Add event types to `src/shared/events/constants.ts`:
  - `SCOPE_REAUTH_STARTED`
  - `SCOPE_REAUTH_COMPLETED`
  - `SCOPE_REAUTH_FAILED`
  - `SCOPE_CONSENT_REQUESTED`
  - `SCOPE_CONSENT_APPROVED`
  - `SCOPE_CONSENT_DENIED`
- [ ] Add corresponding event classes and payloads to `src/shared/events/types.ts`

#### 2.5 request_scope tool implementation
- [ ] Create `src/main/tools/RequestScopeHandler.ts` - orchestrates the full flow:
  1. Check if Google auth already covers requested scopes (via ScopeManager)
  2. If not, trigger incremental re-auth (via OAuthClientManager)
  3. After re-auth, check if app-level capability is already granted (via ScopeManager)
  4. If not, show consent dialog (via IPC)
  5. If user approves, grant capability and return `{ status: 'approved', scopes: [...] }`
  6. If user denies/cancels/error, return `{ status: 'denied' | 'cancelled' | 'error', scopes: [] }`
- [ ] Tool contract:
  - Input: `{ service: string, scopes: string[], reason: string }`
  - Output: `{ status: 'approved' | 'denied' | 'cancelled' | 'error', scopes: string[] }`

#### 2.6 dummy_tool implementation
- [ ] Create `src/main/tools/DummyTool.ts` - minimal tool that requires a dedicated dummy scope/capability
  - Tool name: `dummy_tool`
  - Input: `{ message: string }`
  - On execute: check if `dummy_tool` capability is granted via ScopeManager
  - If not granted: return structured error `{ code: 'missing_scope', scopes: ['dummy_tool'], message: 'dummy_tool capability not granted' }`
  - If granted: return `{ status: 'success', echo: message }`

#### 2.7 AgentFeature registration
- [ ] Create `src/main/agents/RequestScopeFeature.ts` implementing `AgentFeature`:
  - `getSystemPromptSection()`: instructions for using `request_scope` and `dummy_tool`
  - `getTools()`: returns `request_scope` and `dummy_tool` tool definitions with execute functions
- [ ] Register `RequestScopeFeature` in `src/main/index.ts` PromptBuilder feature array (line 251)

#### 2.8 Wire ScopeManager into app initialization
- [ ] Create ScopeManager instance in `src/main/index.ts`
- [ ] Pass ScopeManager to RequestScopeFeature, RequestScopeHandler, DummyTool
- [ ] Connect ScopeManager.clearAll() to logout flow in OAuthClientManager

### Phase 3: Tests

#### 3.1 Unit tests
- [ ] Add `tests/unit/auth/ScopeManager.test.ts` - scope persistence, capability grant/revoke, clearAll
  - Covers: `request-scope.1.1` through `request-scope.1.7`
- [ ] Add `tests/unit/tools/RequestScopeHandler.test.ts` - orchestration logic, all branches
  - Covers: `request-scope.2.1` through `request-scope.2.6`
- [ ] Add `tests/unit/tools/DummyTool.test.ts` - capability check, missing_scope error, success path
  - Covers: `request-scope.3.1` through `request-scope.3.4`
- [ ] Add `tests/unit/auth/OAuthClientManager.reauth.test.ts` - incremental re-auth with additional scopes
  - Covers: `request-scope.4.1` through `request-scope.4.3`

#### 3.2 Functional tests
- [ ] Add `tests/functional/request-scope-flow.spec.ts`:
  - "should show missing_scope error when dummy_tool called without capability"
  - "should complete full request_scope flow with dummy_tool using mock OAuth"
  - "should handle user denial of scope consent"
  - "should allow dummy_tool to succeed after scope is granted"
  - Covers: `request-scope.5.1` through `request-scope.5.4`

### Phase 4: Finalization

- [ ] Update coverage table in `docs/specs/request-scope/design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/request-scope/requirements.md` | NEW: Full requirements for request_scope feature |
| `docs/specs/request-scope/design.md` | NEW: Architecture and design |
| `docs/specs/google-oauth-auth/requirements.md` | ADD: Requirement 17 - Incremental Re-Authorization |
| `docs/specs/google-oauth-auth/design.md` | ADD: Re-authorization flow section |
| `docs/specs/llm-integration/requirements.md` | ADD: Structured domain error requirement for missing_scope |
| `docs/specs/llm-integration/design.md` | ADD: request_scope and dummy_tool as AgentFeature |
| `src/main/auth/ScopeManager.ts` | NEW: Scope persistence and capability management |
| `src/main/auth/OAuthClientManager.ts` | MODIFY: Add incremental re-auth support |
| `src/main/auth/TokenStorageManager.ts` | MODIFY: Add granted_scopes key |
| `src/main/tools/RequestScopeHandler.ts` | NEW: Orchestrates request_scope flow |
| `src/main/tools/DummyTool.ts` | NEW: Minimal test tool requiring dummy capability |
| `src/main/agents/RequestScopeFeature.ts` | NEW: AgentFeature for request_scope + dummy_tool |
| `src/main/index.ts` | MODIFY: Wire ScopeManager, register RequestScopeFeature |
| `src/shared/events/constants.ts` | MODIFY: Add scope-related event types |
| `src/shared/events/types.ts` | MODIFY: Add scope event classes and payloads |
| `src/preload/index.ts` | MODIFY: Expose scope:request-consent IPC channel |
| `src/renderer/components/auth/ScopeConsentDialog.tsx` | NEW: Consent dialog component |
| `tests/unit/auth/ScopeManager.test.ts` | NEW: Unit tests for scope persistence |
| `tests/unit/tools/RequestScopeHandler.test.ts` | NEW: Unit tests for request_scope orchestration |
| `tests/unit/tools/DummyTool.test.ts` | NEW: Unit tests for dummy_tool |
| `tests/unit/auth/OAuthClientManager.reauth.test.ts` | NEW: Unit tests for incremental re-auth |
| `tests/functional/request-scope-flow.spec.ts` | NEW: Functional tests for full workflow |

## Expected result

After this plan is executed:

1. A new `request_scope` tool is available to the LLM agent that can request additional Google scopes and app-level capabilities at runtime.
2. A `dummy_tool` exists that requires a dedicated `dummy_tool` capability, exercising the full permission workflow end-to-end.
3. When `dummy_tool` is called without the required capability, it returns a structured `missing_scope` error.
4. When the agent calls `request_scope`, it triggers incremental Google re-authorization (if needed) followed by an app-level consent dialog.
5. The user can approve or deny the request; the agent receives a structured result and can retry or continue without the requested access.
6. All scope grants are persisted per-user in the existing key-value store.
7. No raw tokens are ever exposed to the renderer/sandbox.
8. The feature is fully testable in isolation via `dummy_tool` + mock OAuth server, with no dependency on any real Google API product integration.

## Risks

- **Risk 1: Long-running tool call during re-auth** - The `request_scope` tool must wait for the user to complete Google re-auth in the browser and then approve the consent dialog. This could take minutes. Mitigation: The tool's `execute` function returns a Promise that resolves only after the full flow completes. The LLM pipeline's `AbortSignal` support ensures the flow can be cancelled. The `ToolRunnerPolicy.timeoutMs` may need to be extended or bypassed for `request_scope`.

- **Risk 2: Google re-auth deep link handling** - The existing deep link handler in `src/main/index.ts` processes OAuth callbacks and publishes events. The re-auth flow must reuse this path but with different post-callback logic (update scopes instead of creating a new session). Mitigation: Add a flag/state in `OAuthClientManager` to distinguish initial auth from re-auth, and handle accordingly.

- **Risk 3: Concurrent scope requests** - If two tools both need different scopes, the agent might call `request_scope` twice. Mitigation: `RequestScopeHandler` should serialize requests (queue or reject concurrent calls).

- **Risk 4: Security - renderer must not see tokens** - The consent dialog in the renderer must not receive or expose any token data. Mitigation: The IPC contract for `scope:request-consent` only sends `{ service, scopes, reason }` to the renderer and receives `{ approved: boolean }` back. All token operations happen exclusively in the main process.

- **Risk 5: Scope of spec changes to google-oauth-auth** - Adding incremental re-auth changes the existing OAuth spec. Mitigation: The changes are additive (new requirement 17) and do not modify existing requirements. The re-auth flow reuses the same PKCE mechanism.
