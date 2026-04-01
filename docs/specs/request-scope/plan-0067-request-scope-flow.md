# Plan: Implement request_scope flow with app-level consent dialog (#67)

## Context

Issue: https://github.com/amogil/clerkly/issues/67
PR: https://github.com/amogil/clerkly/pull/125

The task has been rescoped: Google incremental re-authorization has been moved to a separate issue #128. This plan covers ONLY the app-level consent dialog flow:

**Flow:** agent calls `dummy_tool` -> `missing_scope` error -> agent calls `request_scope` -> app-level consent dialog -> user approves/denies -> agent retries.

No Google OAuth re-auth is involved. No changes to `OAuthClientManager`, `TokenStorageManager`, or `google-oauth-auth` specs.

### PR review thread summary

The PR comment flagged that Google incremental re-auth should be separated out. This rework addresses that by:
1. Reverting all google-oauth-auth spec changes (requirement 17, design section 1b, coverage table entries)
2. Removing all references to `OAuthClientManager`, `startReAuthFlow`, Google scopes from request-scope specs
3. Simplifying `RequestScopeHandler` to only handle app-level capabilities via consent dialog

## Analysis

### Root cause

The application has no mechanism for an agent to request app-level capabilities at runtime. There is no concept of granted capabilities, no consent dialog for agent-requested permissions, and no structured domain error for missing capabilities.

Key architectural observations:
1. **Tool registration pattern**: Tools are registered as `AgentFeature` implementations (`src/main/agents/PromptBuilder.ts:151-155`). Each feature provides system prompt sections and tool definitions. `CodeExecFeature` is the reference pattern.
2. **Tool execution**: The LLM provider calls `execute` on each tool definition. Tools run inside `bindToolExecutors` in `MainPipeline` (`src/main/agents/MainPipeline.ts:2335-2372`).
3. **Persistence**: `UserSettingsManager` (`src/main/UserSettingsManager.ts`) provides key-value storage scoped per user.
4. **IPC structure**: Auth IPC handlers in `src/main/auth/AuthIPCHandlers.ts`. Event types in `src/shared/events/types.ts`, constants in `src/shared/events/constants.ts`.
5. **App initialization**: `src/main/index.ts` wires everything together. PromptBuilder is created with feature array at line 249-253.

### Affected requirements

New feature. Builds on top of:
- `llm-integration.4.1` (`AgentFeature` interface) - new feature implementation
- `llm-integration.11` (Tool execution) - new tool + structured domain error
- `llm-integration.15.2` (Canonical tool list) - add `request_scope` and `dummy_tool`

### Affected specifications

- `docs/specs/request-scope/requirements.md` - REWRITE: remove all Google OAuth re-auth references, focus on app-level capabilities only (6 requirement groups instead of 7)
- `docs/specs/request-scope/design.md` - REWRITE: remove OAuthClientManager dependency, simplify RequestScopeHandler, remove re-auth sections
- `docs/specs/google-oauth-auth/requirements.md` - REVERT: remove requirement 17 (moved to #128)
- `docs/specs/google-oauth-auth/design.md` - REVERT: remove section 1b and coverage table entries for 17.x (moved to #128)
- `docs/specs/llm-integration/requirements.md` - KEEP: `request_scope` and `dummy_tool` in canonical tool registry (15.2)
- `docs/specs/llm-integration/design.md` - KEEP: `request_scope` and `dummy_tool` in canonical tool registry

## Action plan

### Phase 1: Specifications

- [x] Rewrite `docs/specs/request-scope/requirements.md` - remove all Google OAuth re-auth references, reduce to 6 requirement groups (remove old group 4 "Incremental Re-Authorization")
- [x] Rewrite `docs/specs/request-scope/design.md` - remove OAuthClientManager dependency, remove re-auth sections, simplify RequestScopeHandler
- [x] Revert `docs/specs/google-oauth-auth/requirements.md` - remove requirement 17 (moved to #128)
- [x] Revert `docs/specs/google-oauth-auth/design.md` - remove section 1b and coverage table entries for 17.x (moved to #128)
- [x] Keep `docs/specs/llm-integration/requirements.md` - `request_scope` and `dummy_tool` already in canonical tool registry
- [x] Keep `docs/specs/llm-integration/design.md` - `request_scope` and `dummy_tool` already in canonical tool registry

### Phase 2: Code

#### 2.1 Scope persistence layer
- [ ] Create `src/main/auth/ScopeManager.ts` - manages granted app-level capabilities
  - `getGrantedCapabilities(): string[]`
  - `hasCapability(capability: string): boolean`
  - `grantCapability(capability: string): void`
  - `revokeCapability(capability: string): void`
  - `clearAll()` (called on logout)
  - Uses `UserSettingsManager` with key `scope_granted_capabilities`

#### 2.2 Consent dialog (IPC + renderer)
- [ ] Add IPC channel `scope:request-consent` in preload
- [ ] Add IPC handler in main process
- [ ] Create `src/renderer/components/auth/ScopeConsentDialog.tsx` - modal dialog showing service name, requested scopes, and reason
- [ ] Dialog returns `{ approved: boolean }` to the main process

#### 2.3 Event types for scope flow
- [ ] Add event types to `src/shared/events/constants.ts`:
  - `SCOPE_CONSENT_REQUESTED`
  - `SCOPE_CONSENT_APPROVED`
  - `SCOPE_CONSENT_DENIED`
- [ ] Add corresponding event payloads to `src/shared/events/types.ts`

#### 2.4 request_scope tool implementation
- [ ] Create `src/main/tools/RequestScopeHandler.ts` - orchestrates the flow:
  1. Check if all requested capabilities are already granted via ScopeManager
  2. If all granted, return `{ status: 'approved', scopes: [...] }` immediately
  3. If not, show consent dialog via IPC
  4. If user approves, grant capabilities via ScopeManager and return `{ status: 'approved', scopes: [...] }`
  5. If user denies, return `{ status: 'denied', scopes: [] }`
  6. On error, return `{ status: 'error', scopes: [] }`
- [ ] Tool contract:
  - Input: `{ service: string, scopes: string[], reason: string }`
  - Output: `{ status: 'approved' | 'denied' | 'error', scopes: string[] }`

#### 2.5 dummy_tool implementation
- [ ] Create `src/main/tools/DummyTool.ts` - minimal tool that requires `dummy_tool` capability
  - Input: `{ message: string }`
  - If capability not granted: return `{ code: 'missing_scope', scopes: ['dummy_tool'], message: '...' }`
  - If capability granted: return `{ status: 'success', echo: message }`

#### 2.6 AgentFeature registration
- [ ] Create `src/main/agents/RequestScopeFeature.ts` implementing `AgentFeature`:
  - `getSystemPromptSection()`: instructions for using `request_scope` and `dummy_tool`
  - `getTools()`: returns `request_scope` and `dummy_tool` tool definitions with execute functions
- [ ] Register `RequestScopeFeature` in `src/main/index.ts` PromptBuilder feature array

#### 2.7 Wire ScopeManager into app initialization
- [ ] Create ScopeManager instance in `src/main/index.ts`
- [ ] Pass ScopeManager to RequestScopeFeature, RequestScopeHandler, DummyTool
- [ ] Connect ScopeManager.clearAll() to logout flow

### Phase 3: Tests

#### 3.1 Unit tests
- [ ] Add `tests/unit/auth/ScopeManager.test.ts` - scope persistence, capability grant/revoke, clearAll
  - Covers: `request-scope.1.1` through `request-scope.1.5`
- [ ] Add `tests/unit/tools/RequestScopeHandler.test.ts` - orchestration logic, all branches
  - Covers: `request-scope.2.1` through `request-scope.2.7`
- [ ] Add `tests/unit/tools/DummyTool.test.ts` - capability check, missing_scope error, success path
  - Covers: `request-scope.3.1` through `request-scope.3.4`

#### 3.2 Functional tests
- [ ] Add `tests/functional/request-scope-flow.spec.ts`:
  - "should show missing_scope error when dummy_tool called without capability"
  - "should complete full request_scope flow with dummy_tool"
  - "should handle user denial of scope consent"
  - "should allow dummy_tool to succeed after scope is granted"
  - Covers: `request-scope.4.1` through `request-scope.4.5`, `request-scope.6.1`

### Phase 4: Finalization

- [ ] Update coverage table in `docs/specs/request-scope/design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/request-scope/requirements.md` | REWRITE: remove Google OAuth re-auth, focus on app-level capabilities |
| `docs/specs/request-scope/design.md` | REWRITE: remove OAuthClientManager, simplify architecture |
| `docs/specs/google-oauth-auth/requirements.md` | REVERT: remove requirement 17 (moved to #128) |
| `docs/specs/google-oauth-auth/design.md` | REVERT: remove section 1b and coverage entries (moved to #128) |
| `src/main/auth/ScopeManager.ts` | NEW: App-level capability persistence |
| `src/main/tools/RequestScopeHandler.ts` | NEW: Orchestrates consent flow (no OAuth re-auth) |
| `src/main/tools/DummyTool.ts` | NEW: Minimal test tool requiring dummy capability |
| `src/main/agents/RequestScopeFeature.ts` | NEW: AgentFeature for request_scope + dummy_tool |
| `src/main/index.ts` | MODIFY: Wire ScopeManager, register RequestScopeFeature |
| `src/shared/events/constants.ts` | MODIFY: Add consent event types (no re-auth events) |
| `src/shared/events/types.ts` | MODIFY: Add consent event payloads |
| `src/preload/index.ts` | MODIFY: Expose scope:request-consent IPC channel |
| `src/renderer/components/auth/ScopeConsentDialog.tsx` | NEW: Consent dialog component |
| `tests/unit/auth/ScopeManager.test.ts` | NEW: Unit tests for capability persistence |
| `tests/unit/tools/RequestScopeHandler.test.ts` | NEW: Unit tests for consent orchestration |
| `tests/unit/tools/DummyTool.test.ts` | NEW: Unit tests for dummy_tool |
| `tests/functional/request-scope-flow.spec.ts` | NEW: Functional tests for full workflow |

## Expected result

After this plan is executed:

1. A `request_scope` tool is available to the LLM agent that requests app-level capabilities via a consent dialog.
2. A `dummy_tool` exists that requires a dedicated `dummy_tool` capability, exercising the full permission workflow end-to-end.
3. When `dummy_tool` is called without the required capability, it returns a structured `missing_scope` error.
4. When the agent calls `request_scope`, it shows an app-level consent dialog. The user can approve or deny.
5. Approved capabilities are persisted per-user via `UserSettingsManager`.
6. No Google OAuth re-auth is involved -- that's in separate issue #128.
7. No raw tokens are ever exposed to the renderer/sandbox.
8. The feature is fully testable in isolation via `dummy_tool` with no dependency on any real Google API.

## Risks

- **Risk 1: Long-running tool call during consent dialog** - The `request_scope` tool must wait for the user to make a decision. This could take tens of seconds. Mitigation: The tool's `execute` function returns a Promise. The LLM pipeline's `AbortSignal` support ensures the flow can be cancelled. Tool timeout is managed by AI SDK's AbortSignal, not ToolRunner policy. Model timeout pauses during tool execution per `llm-integration.3.6.1`.

- **Risk 2: Concurrent scope requests** - If two tools both need different scopes, the agent might call `request_scope` twice. Mitigation: `RequestScopeHandler` should serialize requests (queue or reject concurrent calls).

- **Risk 3: Security - renderer must not see tokens** - The consent dialog in the renderer must not receive or expose any token data. Mitigation: The IPC contract for `scope:request-consent` only sends `{ service, scopes, reason }` to the renderer and receives `{ approved: boolean }` back.
