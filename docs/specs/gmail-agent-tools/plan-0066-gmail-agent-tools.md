# Plan: Add Gmail agent tools (#66)

## Context

Issue #66 requests implementing agent-callable Gmail tools. Gmail integration must use `@googleapis/gmail` and `google-auth-library` in the Electron main process. Agent access goes through app-owned tools and a policy-controlled gateway. Tokens must never be exposed to the sandbox or renderer.

**Issue:** https://github.com/nickshanks347/clerkly2/issues/66

**Dependency:** #67 (first-class `request_scope` flow with `dummy_tool` for testing) -- the permission escalation and incremental re-authorization UI/flow. This plan assumes #67 is completed first. Gmail tool implementations will return structured `missing_scope` errors when the required Gmail scopes are not granted, integrating with the generic `request_scope` mechanism from #67.

No PR exists yet.

## Analysis

### Root cause

The application currently supports three tool types in the LLM pipeline:
- `final_answer` (main-pipeline-only, marks task completion)
- `code_exec` (sandboxed JS execution with `http_request` and `web_search` sub-tools)
- `http_request` / `web_search` (sandbox-only sub-tools within code_exec)

There is no mechanism for agents to interact with authenticated Google APIs (Gmail). The architecture reference (`docs/specs/AGENTS-DESIGN.md`) describes a `GoogleApiHandler` and `ToolGateway` that are not yet implemented.

Gmail operations require:
1. A new tool gateway layer in the main process that routes Gmail API calls through `@googleapis/gmail`
2. OAuth scope management -- Gmail requires `https://mail.google.com/` (restricted scope) or narrower per-operation scopes
3. Agent-facing tool definitions registered in `PromptBuilder` as a new `AgentFeature`
4. Integration with the sandbox tools allowlist so `code_exec` can call Gmail tools via `tools.*`
5. Structured error handling for missing scopes (integration point with #67's `request_scope`)

### Key architectural decisions

**Decision 1: Gmail tools as sandbox sub-tools (via `code_exec`)**

Gmail tools will be exposed as sandbox-accessible sub-tools (like `http_request` and `web_search`), called via `tools.gmail_*()` inside `code_exec` sandbox code. This follows the existing pattern in `SandboxSessionManager.ts:256-263` where tool invokers are registered per session.

Rationale:
- Consistent with existing `http_request` and `web_search` patterns
- Tokens stay in main process (only the handler in main touches OAuth tokens)
- Agent JS code composes Gmail calls with data processing logic in a single `code_exec` step
- No new top-level LLM tool schema needed -- the LLM generates JS that calls `tools.gmail_*()` within `code_exec`

**Decision 2: Phased tool rollout**

The issue lists ~35 tools. For MVP, prioritize the core read/write operations. Settings/admin tools can be added incrementally. Proposed MVP set:

**Phase A (read/compose -- lower risk):**
- `gmail_get_profile`
- `gmail_search_threads`
- `gmail_get_thread`
- `gmail_get_message`
- `gmail_get_attachment`
- `gmail_list_labels`
- `gmail_send_email`
- `gmail_create_draft`
- `gmail_update_draft`
- `gmail_send_draft`
- `gmail_delete_draft`
- `gmail_modify_message` (add/remove labels, mark read/unread)
- `gmail_modify_thread`

**Phase B (management -- higher risk, lower urgency):**
- `gmail_delete_message`, `gmail_delete_thread`
- `gmail_create_label`, `gmail_update_label`, `gmail_delete_label`
- `gmail_list_history`
- `gmail_create_filter`, `gmail_delete_filter`
- Settings tools (forwarding, send-as, vacation, IMAP, POP)
- `gmail_watch_mailbox`, `gmail_stop_mailbox_watch`

**Decision 3: Scope strategy**

Use `https://www.googleapis.com/auth/gmail.modify` for read + label/modify operations and `https://www.googleapis.com/auth/gmail.send` for sending. These are "sensitive" (not restricted) scopes. The full `https://mail.google.com/` restricted scope is avoided for MVP. Each tool declares which scopes it needs, and the handler checks at runtime.

### Affected requirements

- `llm-integration.4.1` -- AgentFeature interface for new Gmail feature
- `llm-integration.11` -- Tool execution pipeline (new tool type in ToolRunner path)
- `code_exec.2.7-2.8` -- Sandbox tools allowlist (needs Gmail tools added)
- `google-oauth-auth.10.3` -- OAuth scopes (new Gmail scopes needed)
- New requirement IDs will be created under `gmail-agent-tools.*`

### Affected specifications

- `docs/specs/gmail-agent-tools/requirements.md` -- **new** (Gmail feature requirements)
- `docs/specs/gmail-agent-tools/design.md` -- **new** (Gmail feature architecture)
- `docs/specs/google-oauth-auth/requirements.md` -- update scopes section for Gmail
- `docs/specs/google-oauth-auth/design.md` -- update token flow for incremental scopes
- `docs/specs/llm-integration/design.md` -- update tool registry for Gmail tools
- `docs/specs/code_exec/design.md` -- update sandbox allowlist documentation
- `docs/specs/AGENTS-DESIGN.md` -- no change needed (already describes GoogleApiHandler)

### Code study: integration points

| File | Lines | What |
|------|-------|------|
| `src/main/code_exec/SandboxBridge.ts` | 8 | `SANDBOX_TOOLS_ALLOWLIST` -- Gmail tool names must be added |
| `src/main/code_exec/SandboxSessionManager.ts` | 256-266 | Invoker registration per session -- Gmail handlers registered here |
| `src/main/agents/PromptBuilder.ts` | 482-557 | `CodeExecFeature` -- Gmail prompt section and credentials injection |
| `src/main/agents/MainPipeline.ts` | 2309-2315 | `injectFeatureCredentials` -- pass OAuth tokens to Gmail handler |
| `src/main/code_exec/ProviderMethodRegistry.ts` | 1-96 | Pattern for provider-method capabilities -- Gmail is not provider-specific but the registry pattern is useful |
| `src/main/auth/OAuthConfig.ts` | 112 | `scopes` array -- Gmail scopes must be added (or handled via incremental auth from #67) |
| `src/main/auth/TokenStorageManager.ts` | 1-155 | Token loading -- Gmail handler needs access to OAuth tokens |
| `src/preload/codeExecSandbox.ts` | 1-16 | Preload bridge -- no changes needed (already generic) |

## Action plan

### Phase 1: Specifications

- [ ] Create `docs/specs/gmail-agent-tools/requirements.md`
  - Define user stories for Gmail agent integration
  - Define acceptance criteria for each tool (input validation, output format, error handling)
  - Define security requirements (token isolation, scope checking, payload caps)
  - Define `missing_scope` error contract and link to #67's `request_scope` flow
  - Requirement IDs: `gmail-agent-tools.1.*` (core architecture), `gmail-agent-tools.2.*` (individual tools), `gmail-agent-tools.3.*` (security), `gmail-agent-tools.4.*` (error handling)

- [ ] Create `docs/specs/gmail-agent-tools/design.md`
  - Define `GmailApiHandler` class architecture (main process, `@googleapis/gmail`)
  - Define `GmailToolInvoker` per-tool dispatcher pattern
  - Define OAuth token adapter using `google-auth-library` with stored tokens
  - Define tool input/output schemas for each MVP tool
  - Define prompt section for Gmail tool guidance
  - Define sandbox allowlist additions
  - Define testing strategy and coverage table

- [ ] Update `docs/specs/google-oauth-auth/requirements.md` -- add section for incremental Gmail scopes
- [ ] Update `docs/specs/code_exec/design.md` -- document Gmail tools in sandbox allowlist

### Phase 2: Code

#### 2a. Dependencies and infrastructure

- [ ] Add npm dependencies: `@googleapis/gmail`, `google-auth-library`
  - These run only in main process (Electron Node.js context)

- [ ] Create `src/main/gmail/GmailAuthAdapter.ts`
  - Wraps `google-auth-library`'s `OAuth2Client` with stored tokens from `TokenStorageManager`
  - Provides `getAuthenticatedClient()` that loads current tokens, checks expiry, refreshes if needed
  - Returns structured `missing_scope` error if Gmail scopes not granted
  - Requirements: `gmail-agent-tools.1.1`, `gmail-agent-tools.3.1`

- [ ] Create `src/main/gmail/GmailApiHandler.ts`
  - Central handler for all Gmail API operations
  - Uses `@googleapis/gmail` client with authenticated OAuth2Client
  - Implements method allowlist (only supported operations)
  - Normalizes errors (auth, rate_limit, not_found, etc.)
  - Enforces response size caps
  - Requirements: `gmail-agent-tools.1.2`, `gmail-agent-tools.3.2`, `gmail-agent-tools.4.1`

- [ ] Create `src/main/gmail/GmailToolRegistry.ts`
  - Maps tool names to handler methods
  - Per-tool input validation schemas
  - Per-tool required scope declarations
  - Requirements: `gmail-agent-tools.1.3`

#### 2b. Individual tool handlers

- [ ] Create `src/main/gmail/tools/gmail_get_profile.ts`
  - Calls `users.getProfile`
  - Scope: `gmail.readonly` or `gmail.modify`
  - Returns: `{ emailAddress, messagesTotal, threadsTotal, historyId }`

- [ ] Create `src/main/gmail/tools/gmail_search_threads.ts`
  - Calls `users.threads.list` with query parameter
  - Pagination support (maxResults, pageToken)
  - Scope: `gmail.readonly` or `gmail.modify`
  - Returns: thread list with IDs and snippet

- [ ] Create `src/main/gmail/tools/gmail_get_thread.ts`
  - Calls `users.threads.get`
  - Format parameter (minimal, full, metadata)
  - Scope: `gmail.readonly` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_get_message.ts`
  - Calls `users.messages.get`
  - Format parameter support
  - MIME parsing for readable output
  - Scope: `gmail.readonly` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_get_attachment.ts`
  - Calls `users.messages.attachments.get`
  - Base64 decode, size cap enforcement
  - Scope: `gmail.readonly` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_send_email.ts`
  - Builds RFC 2822 MIME message
  - Calls `users.messages.send`
  - Scope: `gmail.send`

- [ ] Create `src/main/gmail/tools/gmail_create_draft.ts`
  - Builds MIME message, calls `users.drafts.create`
  - Scope: `gmail.compose` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_update_draft.ts`
  - Calls `users.drafts.update`
  - Scope: `gmail.compose` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_send_draft.ts`
  - Calls `users.drafts.send`
  - Scope: `gmail.send`

- [ ] Create `src/main/gmail/tools/gmail_delete_draft.ts`
  - Calls `users.drafts.delete`
  - Scope: `gmail.compose` or `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_list_labels.ts`
  - Calls `users.labels.list`
  - Scope: `gmail.labels` or `gmail.readonly`

- [ ] Create `src/main/gmail/tools/gmail_modify_message.ts`
  - Calls `users.messages.modify` (add/remove label IDs)
  - Scope: `gmail.modify`

- [ ] Create `src/main/gmail/tools/gmail_modify_thread.ts`
  - Calls `users.threads.modify` (add/remove label IDs)
  - Scope: `gmail.modify`

#### 2c. Integration with existing pipeline

- [ ] Modify `src/main/code_exec/SandboxBridge.ts`
  - Add Gmail tool names to `SANDBOX_TOOLS_ALLOWLIST`
  - All 13 MVP tool names: `gmail_get_profile`, `gmail_search_threads`, `gmail_get_thread`, `gmail_get_message`, `gmail_get_attachment`, `gmail_send_email`, `gmail_create_draft`, `gmail_update_draft`, `gmail_send_draft`, `gmail_delete_draft`, `gmail_list_labels`, `gmail_modify_message`, `gmail_modify_thread`

- [ ] Modify `src/main/code_exec/SandboxSessionManager.ts`
  - In `executeInOneSandbox` (around line 256), register Gmail tool invokers
  - Gmail invokers need OAuth tokens -- pass through session context
  - Create `GmailApiHandler` instance per session with auth adapter
  - Token access goes through `TokenStorageManager` (already in main process)

- [ ] Modify `src/main/agents/PromptBuilder.ts`
  - Add Gmail tools prompt section in `CodeExecFeature.getSystemPromptSection()`
  - Document each tool's invocation syntax, input schema, output schema
  - Add examples for common operations (search, read, send)

- [ ] Modify `src/main/agents/MainPipeline.ts`
  - In `injectFeatureCredentials`, pass token storage reference to CodeExecFeature for Gmail auth
  - The CodeExecFeature already receives `provider` and `apiKey` -- Gmail needs a separate credential path (OAuth tokens, not LLM API key)

- [ ] Modify `src/main/auth/OAuthConfig.ts`
  - For incremental auth (from #67): define Gmail scope constants
  - `GMAIL_SCOPES` constant with `gmail.readonly`, `gmail.modify`, `gmail.send`, `gmail.compose`, `gmail.labels`
  - Do NOT add Gmail scopes to default `OAUTH_CONFIG.scopes` -- they are requested incrementally

#### 2d. Error handling for missing scopes

- [ ] Create `src/main/gmail/GmailScopeChecker.ts`
  - Check currently granted scopes against tool's required scopes
  - Return structured `{ ok: false, missing_scopes: [...], tool_name: '...' }` when insufficient
  - Integration point with #67's `request_scope` flow

### Phase 3: Tests

- [ ] Create `tests/unit/gmail/GmailAuthAdapter.test.ts`
  - Token loading from storage, expiry checking, refresh flow
  - Missing token handling, missing scope detection
  - Covers: `gmail-agent-tools.1.1`, `gmail-agent-tools.3.1`

- [ ] Create `tests/unit/gmail/GmailApiHandler.test.ts`
  - Method allowlist enforcement
  - Error normalization (auth, rate_limit, not_found)
  - Response size cap enforcement
  - Covers: `gmail-agent-tools.1.2`, `gmail-agent-tools.3.2`, `gmail-agent-tools.4.1`

- [ ] Create `tests/unit/gmail/GmailToolRegistry.test.ts`
  - Tool name to handler mapping
  - Input validation for each tool
  - Scope declaration correctness
  - Covers: `gmail-agent-tools.1.3`

- [ ] Create `tests/unit/gmail/tools/gmail_get_profile.test.ts`
  - Success path, missing scope, API error
  - Covers: `gmail-agent-tools.2.1`

- [ ] Create `tests/unit/gmail/tools/gmail_search_threads.test.ts`
  - Query validation, pagination, empty results
  - Covers: `gmail-agent-tools.2.2`

- [ ] Create `tests/unit/gmail/tools/gmail_get_thread.test.ts`
  - Thread ID validation, format options
  - Covers: `gmail-agent-tools.2.3`

- [ ] Create `tests/unit/gmail/tools/gmail_get_message.test.ts`
  - Message ID validation, MIME parsing, format options
  - Covers: `gmail-agent-tools.2.4`

- [ ] Create `tests/unit/gmail/tools/gmail_get_attachment.test.ts`
  - Attachment ID validation, size cap, base64 handling
  - Covers: `gmail-agent-tools.2.5`

- [ ] Create `tests/unit/gmail/tools/gmail_send_email.test.ts`
  - MIME construction, required fields, scope check
  - Covers: `gmail-agent-tools.2.6`

- [ ] Create `tests/unit/gmail/tools/gmail_create_draft.test.ts`
  - Draft creation with MIME body
  - Covers: `gmail-agent-tools.2.7`

- [ ] Create `tests/unit/gmail/tools/gmail_modify_message.test.ts`
  - Label add/remove validation
  - Covers: `gmail-agent-tools.2.8`

- [ ] Create `tests/unit/gmail/tools/gmail_list_labels.test.ts`
  - Label list output normalization
  - Covers: `gmail-agent-tools.2.9`

- [ ] Create `tests/unit/code_exec/SandboxBridge.gmail.test.ts`
  - Gmail tool names in allowlist
  - Policy validation for Gmail tools
  - Covers: `code_exec.2.7`, `gmail-agent-tools.3.3`

- [ ] Create `tests/unit/gmail/GmailScopeChecker.test.ts`
  - Scope requirement checking per tool
  - Missing scope structured error format
  - Covers: `gmail-agent-tools.4.2`

### Phase 4: Finalization

- [ ] Update coverage table in `docs/specs/gmail-agent-tools/design.md`
- [ ] Update coverage table in `docs/specs/code_exec/design.md` for sandbox allowlist changes
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/gmail-agent-tools/requirements.md` | **New** -- Gmail feature requirements |
| `docs/specs/gmail-agent-tools/design.md` | **New** -- Gmail feature architecture and design |
| `docs/specs/google-oauth-auth/requirements.md` | Add Gmail scope constants and incremental auth section |
| `docs/specs/code_exec/design.md` | Update sandbox allowlist documentation |
| `package.json` | Add `@googleapis/gmail`, `google-auth-library` dependencies |
| `src/main/gmail/GmailAuthAdapter.ts` | **New** -- OAuth token adapter for Gmail API |
| `src/main/gmail/GmailApiHandler.ts` | **New** -- Central Gmail API handler |
| `src/main/gmail/GmailToolRegistry.ts` | **New** -- Tool name to handler mapping |
| `src/main/gmail/GmailScopeChecker.ts` | **New** -- Scope requirement checking |
| `src/main/gmail/tools/gmail_get_profile.ts` | **New** -- Get Gmail profile tool |
| `src/main/gmail/tools/gmail_search_threads.ts` | **New** -- Search threads tool |
| `src/main/gmail/tools/gmail_get_thread.ts` | **New** -- Get thread tool |
| `src/main/gmail/tools/gmail_get_message.ts` | **New** -- Get message tool |
| `src/main/gmail/tools/gmail_get_attachment.ts` | **New** -- Get attachment tool |
| `src/main/gmail/tools/gmail_send_email.ts` | **New** -- Send email tool |
| `src/main/gmail/tools/gmail_create_draft.ts` | **New** -- Create draft tool |
| `src/main/gmail/tools/gmail_update_draft.ts` | **New** -- Update draft tool |
| `src/main/gmail/tools/gmail_send_draft.ts` | **New** -- Send draft tool |
| `src/main/gmail/tools/gmail_delete_draft.ts` | **New** -- Delete draft tool |
| `src/main/gmail/tools/gmail_list_labels.ts` | **New** -- List labels tool |
| `src/main/gmail/tools/gmail_modify_message.ts` | **New** -- Modify message tool |
| `src/main/gmail/tools/gmail_modify_thread.ts` | **New** -- Modify thread tool |
| `src/main/code_exec/SandboxBridge.ts` | Add Gmail tool names to `SANDBOX_TOOLS_ALLOWLIST` |
| `src/main/code_exec/SandboxSessionManager.ts` | Register Gmail tool invokers in `executeInOneSandbox` |
| `src/main/agents/PromptBuilder.ts` | Add Gmail prompt section in `CodeExecFeature` |
| `src/main/agents/MainPipeline.ts` | Pass token storage to CodeExecFeature for Gmail auth |
| `src/main/auth/OAuthConfig.ts` | Add Gmail scope constants (not in default scopes) |
| `tests/unit/gmail/GmailAuthAdapter.test.ts` | **New** |
| `tests/unit/gmail/GmailApiHandler.test.ts` | **New** |
| `tests/unit/gmail/GmailToolRegistry.test.ts` | **New** |
| `tests/unit/gmail/GmailScopeChecker.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_get_profile.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_search_threads.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_get_thread.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_get_message.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_get_attachment.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_send_email.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_create_draft.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_modify_message.test.ts` | **New** |
| `tests/unit/gmail/tools/gmail_list_labels.test.ts` | **New** |
| `tests/unit/code_exec/SandboxBridge.gmail.test.ts` | **New** |

## Expected result

After plan execution:
- Agent-callable Gmail tools exist behind the app-owned main-process bridge
- Gmail API access is handled exclusively in the Electron main process using `@googleapis/gmail` and `google-auth-library`
- Gmail tools are accessible from `code_exec` sandbox via `tools.gmail_*()` calls
- OAuth tokens are never exposed to sandbox or renderer
- Gmail tools return structured `missing_scope` errors when Gmail scopes are not granted (integrating with #67's `request_scope` flow)
- Sandbox allowlist is updated to permit Gmail tool calls from generated JS
- LLM prompt includes guidance for Gmail tool usage
- Comprehensive unit tests cover auth adapter, API handler, tool registry, scope checker, and each individual tool
- Unsupported admin-only Gmail operations (Workspace delegation, service accounts) are explicitly out of scope

## Risks

- **Risk 1: Dependency on #67 (request_scope flow)**
  - Gmail tools need `missing_scope` -> `request_scope` integration. If #67 is not complete, Gmail tools will only return error objects for missing scopes without the interactive consent flow.
  - Mitigation: Design Gmail tools to return structured `missing_scope` errors independent of #67. When #67 lands, the pipeline will automatically handle the escalation. Gmail tools are functional for testing without #67 by manually granting scopes.

- **Risk 2: Google OAuth restricted scope verification**
  - `https://mail.google.com/` is a restricted scope requiring Google verification. Using narrower scopes (`gmail.modify`, `gmail.send`) avoids this for MVP but limits some operations.
  - Mitigation: Start with sensitive (non-restricted) scopes. Document which operations need the restricted scope and plan for verification process separately.

- **Risk 3: Gmail API rate limits**
  - Gmail API has per-user rate limits (250 quota units/second for users).
  - Mitigation: Add rate-limit-aware error handling in `GmailApiHandler`. Return structured rate_limit errors that the pipeline can surface to the agent.

- **Risk 4: MIME message construction complexity**
  - Building RFC 2822 compliant MIME messages for `gmail_send_email` is non-trivial (multipart, attachments, encoding).
  - Mitigation: Use `@googleapis/gmail`'s built-in MIME support. For MVP, support plain text and HTML bodies without attachments. Attachment sending can be added incrementally.

- **Risk 5: Response size for large threads/attachments**
  - Gmail threads can be very large. Attachments can be many MB.
  - Mitigation: Enforce response size caps in `GmailApiHandler` (e.g., 256KB per tool response). For attachments, enforce a per-attachment size limit and return truncation metadata.

- **Risk 6: Token refresh during Gmail operations**
  - Long-running Gmail operations may encounter expired tokens mid-execution.
  - Mitigation: `GmailAuthAdapter` checks token expiry before each API call and refreshes proactively. `google-auth-library` handles this transparently when configured with refresh token.
