# Plan: Add functional test for app-restart recovery of stale messages (#94)

## Context

GitHub issue [#94](https://github.com/amogil/clerkly/issues/94) requests a functional (E2E) test that validates the full restart recovery flow for stale messages after a forced process kill. Currently, startup reconciliation for stale `tool_call` records (#87) and stale `kind:llm` messages (#92) is covered by unit tests only. There is no functional test that validates the complete SIGKILL -> restart -> recovery flow.

No PR exists yet for this issue.

## Analysis

### Root cause

The startup reconciliation logic (finalize stale `tool_call` records, hide stale `kind:llm` messages) is implemented and unit-tested but lacks end-to-end validation. The functional test gap is because:

1. **SIGKILL infrastructure is missing**: `closeElectron()` uses graceful `app.close()` which triggers `will-quit` handlers. A SIGKILL helper is needed to simulate a hard crash.
2. **Relaunch with same DB**: After killing the process, the test must relaunch Electron pointing to the **same** `testDataPath` (same SQLite DB) to verify reconciliation on startup.
3. **Stale `kind:llm` reconciliation is not yet implemented** (#92): The code at `src/main/index.ts:317-319` only calls `messageManager.finalizeAllStaleToolCallsOnStartup()`. There is no equivalent for stale `kind:llm` messages with `done=false, hidden=false`.

Relevant code:
- `src/main/index.ts:314-319` -- startup reconciliation call site
- `src/main/agents/MessageManager.ts:412-457` -- `finalizeAllStaleToolCallsOnStartup()`
- `src/main/db/repositories/MessagesRepository.ts:314-338` -- `listStaleToolCalls()`
- `src/main/agents/AgentManager.ts:48-82` -- `computeAgentStatus()` (stale `llm` with `done=false` maps to `IN_PROGRESS`)
- `src/main/TestIPCHandlers.ts` -- test IPC handlers for injecting DB state
- `tests/functional/helpers/electron.ts` -- `launchElectron()`, `closeElectron()`

### Affected requirements

- `llm-integration.11.6.3` -- startup reconciliation for stale `tool_call` (already implemented, needs functional test coverage)
- `llm-integration.3.2` -- stale `kind:llm` recovery after crash (issue #92, needs implementation + test)

### Affected specifications

- `docs/specs/llm-integration/requirements.md` -- add functional test reference for `llm-integration.11.6.3`; optionally add new requirement for stale `kind:llm` startup reconciliation (#92)
- `docs/specs/llm-integration/design.md` -- add stale `kind:llm` startup reconciliation design; add functional test entries; update coverage table
- `docs/specs/testing-infrastructure/design.md` -- document SIGKILL + relaunch test helper pattern

## Action plan

### Phase 1: Specifications

- [ ] Update `docs/specs/llm-integration/requirements.md`:
  - Add new requirement under section 11 (Tool Calling): a functional test entry for `llm-integration.11.6.3` pointing to `tests/functional/startup-recovery.spec.ts` -- "should finalize stale tool_call records after SIGKILL restart"
  - Add new requirement `llm-integration.17` (or sub-section of existing) for stale `kind:llm` startup reconciliation (from issue #92):
    - `17.1`: WHEN the application starts, system SHALL hide (`hidden=true`) all persisted `kind:llm` messages with `done=false` and `hidden=false` across all agents of the current user
    - `17.2`: Stale `kind:llm` reconciliation SHALL NOT emit realtime events (renderer not yet connected at startup)
  - Add functional test entry for the new requirement pointing to `tests/functional/startup-recovery.spec.ts` -- "should hide stale llm messages after SIGKILL restart"

- [ ] Update `docs/specs/llm-integration/design.md`:
  - Add section "Startup reconciliation for stale `kind:llm`" describing the SQL query and hide logic (analogous to existing `tool_call` reconciliation section)
  - Add functional test entries for `startup-recovery.spec.ts`
  - Update coverage table: mark `llm-integration.11.6.3` with functional test coverage; add rows for `llm-integration.17.*`

### Phase 2: Code

- [ ] Add helper `killElectron(context)` to `tests/functional/helpers/electron.ts`:
  - Retrieves the Electron process PID via `context.app.process()`
  - Sends `SIGKILL` to the process: `process.kill(pid, 'SIGKILL')`
  - Waits for the process to exit (poll `process.killed` or catch the exit event)
  - Does NOT clean up `testDataPath` (DB must be preserved for relaunch)

- [ ] Add test IPC handler `test:inject-stale-tool-call` to `src/main/TestIPCHandlers.ts`:
  - Creates a `kind:tool_call` message with `done=false`, `status=running` for a given agent
  - Accepts `agentId`, `toolName` (default `code_exec`), optional `callId`
  - Uses `messageManager.create()` with `done=false`

- [ ] Add test IPC handler `test:inject-stale-llm` to `src/main/TestIPCHandlers.ts`:
  - Creates a `kind:llm` message with `done=false`, `hidden=false` for a given agent
  - Accepts `agentId`, optional `text`/`reasoning`
  - Uses `messageManager.create()` with `done=false`

- [ ] Add test IPC handler `test:get-messages-raw` to `src/main/TestIPCHandlers.ts`:
  - Returns all messages for a given agent (including hidden) as raw DB rows
  - Used to assert DB state after restart without relying on UI rendering

- [ ] Implement stale `kind:llm` startup reconciliation in `src/main/agents/MessageManager.ts`:
  - Add method `hideAllStaleLlmMessagesOnStartup()`:
    - Queries: `SELECT * FROM messages WHERE done=false AND kind='llm' AND hidden=false AND agentId IN (SELECT agentId FROM agents WHERE userId=?)`
    - For each row: `UPDATE messages SET hidden=1 WHERE id=?`
    - No event emission (renderer not connected)
    - Logging with count of affected rows

- [ ] Add `listStaleLlmMessages()` to `src/main/db/repositories/MessagesRepository.ts`:
  - SQL: select `kind='llm'`, `done=false`, `hidden=false`, joined with agents on userId
  - Returns `Message[]`

- [ ] Call `messageManager.hideAllStaleLlmMessagesOnStartup()` in `src/main/index.ts`:
  - After existing `finalizeAllStaleToolCallsOnStartup()` call at line 318
  - Same guard: `if (userManager.getCurrentUserId())`

### Phase 3: Tests

- [ ] Add unit test in `tests/unit/agents/MessageManager.test.ts` -- `hideAllStaleLlmMessagesOnStartup`:
  - Covers: stale visible `kind:llm` hidden, already-hidden `kind:llm` untouched, done `kind:llm` untouched, no-op when no stale rows, no event emission
  - Requirement IDs: `llm-integration.17.1`, `llm-integration.17.2`

- [ ] Add unit test in `tests/unit/db/repositories/MessagesRepository.test.ts` -- `listStaleLlmMessages`:
  - Covers: returns visible stale `llm`, excludes hidden, excludes done, excludes other kinds
  - Requirement IDs: `llm-integration.17.1`

- [ ] Create functional test `tests/functional/startup-recovery.spec.ts`:
  - Test 1: "should finalize stale tool_call records after SIGKILL restart"
    - Launch app, authenticate, get agentId
    - Inject stale `tool_call(code_exec)` via `test:inject-stale-tool-call` with `done=false`, `status=running`
    - Verify agent shows `IN_PROGRESS` status (spinner)
    - SIGKILL the process via `killElectron(context)`
    - Relaunch with same `testDataPath`
    - Re-authenticate (same mock OAuth server, same user profile)
    - Verify via `test:get-messages-raw` that stale `tool_call` now has `done=true` and `status=cancelled`
    - Verify agent is NOT stuck in `IN_PROGRESS`
    - Requirement IDs: `llm-integration.11.6.3`

  - Test 2: "should hide stale llm messages after SIGKILL restart"
    - Launch app, authenticate, get agentId
    - Inject stale `kind:llm` via `test:inject-stale-llm` with `done=false`, `hidden=false`
    - Verify agent shows `IN_PROGRESS` status
    - SIGKILL the process
    - Relaunch with same `testDataPath`
    - Re-authenticate
    - Verify via `test:get-messages-raw` that stale `kind:llm` now has `hidden=true`
    - Verify agent is NOT stuck in `IN_PROGRESS`
    - Requirement IDs: `llm-integration.17.1`, `llm-integration.17.2`

  - Test 3: "should recover both stale tool_call and stale llm after SIGKILL restart"
    - Combined scenario: inject both stale tool_call and stale llm, kill, restart, verify both recovered
    - Requirement IDs: `llm-integration.11.6.3`, `llm-integration.17.1`

  - Test 4: "should handle SIGKILL restart with no stale messages (no-op)"
    - Launch, authenticate, kill, restart -- verify app starts normally, no errors
    - Requirement IDs: `llm-integration.11.6.3`, `llm-integration.17.1`

  - All tests follow testing.11 (no `waitForTimeout` for element waits), testing.12 (toast error check via `closeElectron`), testing.3.13 exception (LLM not used -- tests validate DB-level recovery, not LLM interaction; approved by issue scope)

### Phase 4: Finalization

- [ ] Update coverage table in `docs/specs/llm-integration/design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Add `llm-integration.17` (stale `kind:llm` startup reconciliation), add functional test refs for `11.6.3` |
| `docs/specs/llm-integration/design.md` | Add stale LLM reconciliation design section, add functional test entries, update coverage table |
| `tests/functional/helpers/electron.ts` | Add `killElectron(context)` helper for SIGKILL + process exit wait |
| `src/main/TestIPCHandlers.ts` | Add `test:inject-stale-tool-call`, `test:inject-stale-llm`, `test:get-messages-raw` IPC handlers |
| `src/main/agents/MessageManager.ts` | Add `hideAllStaleLlmMessagesOnStartup()` method |
| `src/main/db/repositories/MessagesRepository.ts` | Add `listStaleLlmMessages()` query method |
| `src/main/index.ts` | Add call to `messageManager.hideAllStaleLlmMessagesOnStartup()` after line 318 |
| `tests/functional/startup-recovery.spec.ts` | New file: 4 functional tests for startup recovery after SIGKILL |
| `tests/unit/agents/MessageManager.test.ts` | Add tests for `hideAllStaleLlmMessagesOnStartup` |
| `tests/unit/db/repositories/MessagesRepository.test.ts` | Add tests for `listStaleLlmMessages` |

## Expected result

After plan execution:
1. A `killElectron()` helper enables SIGKILL + relaunch in functional tests.
2. Startup reconciliation handles both stale `tool_call` (existing) and stale `kind:llm` (new) records.
3. Four functional tests in `startup-recovery.spec.ts` validate the full kill -> restart -> recovery flow.
4. Unit tests cover the new `hideAllStaleLlmMessagesOnStartup` and `listStaleLlmMessages` methods.
5. Coverage table in `design.md` reflects functional test coverage for `llm-integration.11.6.3` and new `llm-integration.17.*`.

## Risks

- **Risk 1: SIGKILL timing on CI.** The process may not release the SQLite DB lock immediately after SIGKILL. Mitigation: add a small delay after kill before relaunch; SQLite WAL mode handles crash recovery automatically.
- **Risk 2: Re-authentication after restart.** The mock OAuth server must serve the same user profile to map to the same userId/agents. Mitigation: reuse the same `MockOAuthServer` instance and user profile across kill/relaunch cycles; the OAuth tokens are persisted in the same DB.
- **Risk 3: Requirement numbering conflict.** Using `llm-integration.17` may conflict if other PRs add requirements. Mitigation: check latest `requirements.md` on the branch before committing; adjust numbering if needed.
- **Risk 4: Stale LLM reconciliation scope (#92).** Issue #92 mentions that stale `kind:llm` recovery is related to a broader "resume chat work on restart" feature. Mitigation: the plan implements the minimal reconciliation (hide stale rows) without any resume logic, which is the approach proposed in #92 itself.
