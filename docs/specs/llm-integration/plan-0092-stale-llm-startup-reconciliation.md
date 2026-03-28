# Plan: Stale kind:llm startup reconciliation (#92)

## Context

After a forced process termination (kill, OOM, Activity Monitor force-quit) during active LLM streaming, a `kind:llm` message with `done=false, hidden=false` can remain persisted in the database. On next app startup, `computeAgentStatus()` returns `IN_PROGRESS` from this stale message, resulting in a permanent spinner in the chat UI.

Issue: https://github.com/nicekid1/clerkly/issues/92

This is analogous to issue #87 (stale `kind:tool_call`), which was fixed in PR #97 (merged). That fix added startup reconciliation for `tool_call` rows. This issue requires a similar reconciliation for `kind:llm` rows, but with a different remediation: set `hidden=true` (analogous to `hideAndMarkIncomplete`) rather than marking as terminal with `done=true`.

## Analysis

### Root cause

All graceful paths (`handleRunError` at `src/main/agents/MainPipeline.ts:2485`, `cancelActivePipelineAndNormalizeTail` at `src/main/agents/AgentIPCHandlers.ts:400`) call `hideAndMarkIncomplete()` which sets `hidden=true, done=false` on in-flight `kind:llm`. But if the process is killed between `kind:llm` creation (`done=false`) and its finalization (`done=true` or `hidden=true`), the row is orphaned with `done=false, hidden=false`.

The `computeAgentStatus()` at `src/main/agents/AgentManager.ts:61-62` treats `kind:llm` with `done=false` as `IN_PROGRESS`:
```typescript
if (lastMessage.kind === MESSAGE_KIND.LLM) {
  return lastMessage.done ? AGENT_STATUS.AWAITING_RESPONSE : AGENT_STATUS.IN_PROGRESS;
}
```

Since there is no active pipeline on restart, this status never resolves, leaving the chat permanently stuck.

### Proposed fix

Add startup reconciliation for stale `kind:llm` messages, following the same pattern as the existing `finalizeAllStaleToolCallsOnStartup()`:

1. **New repository method** `listStaleLlmMessages()` — queries all `kind:llm` messages with `done=false` and `hidden=false` across all agents for the current user.
2. **New MessageManager method** `hideAllStaleLlmOnStartup()` — iterates stale rows and sets `hidden=true` on each (leaving `done=false`, consistent with `hideAndMarkIncomplete` semantics). No events emitted (renderer not yet connected).
3. **Startup call** in `src/main/index.ts` — call `hideAllStaleLlmOnStartup()` right after the existing `finalizeAllStaleToolCallsOnStartup()` call, under the same `userManager.getCurrentUserId()` guard.

The fix sets `hidden=true` rather than `done=true` because:
- This matches the existing graceful cancellation semantics (`hideAndMarkIncomplete` sets `hidden=true, done=false`).
- A `kind:llm` with `done=false` is by definition an incomplete message (streaming was interrupted). It should be hidden, not marked as complete.
- `computeAgentStatus` skips hidden messages, so the status resolves correctly to the previous visible message.

### Affected requirements

- `llm-integration.11.6.3` — currently only covers startup reconciliation for `tool_call`. Needs extension to cover `kind:llm`.
- `agents.9.2` — status algorithm relies on hidden filtering; the fix ensures orphaned llm messages get hidden so status resolves correctly.

### Affected specifications

- `docs/specs/llm-integration/requirements.md` — add new requirement for `kind:llm` startup reconciliation (new sub-requirement under section 11 or new section)
- `docs/specs/llm-integration/design.md` — add design for `kind:llm` startup reconciliation, new unit tests in test matrix and coverage table

## Action plan

### Phase 1: Specifications

- [ ] Update `docs/specs/llm-integration/requirements.md`:
  - Add new requirement `llm-integration.11.6.4`:
    > WHEN the application starts, the system SHALL hide all persisted `kind:llm` messages with `done=false` and `hidden=false` across all agents of the current user by setting `hidden=true`. The `done` flag SHALL remain `false` (consistent with `hideAndMarkIncomplete` semantics).
  - Add note that this is analogous to `llm-integration.11.6.3` but for `kind:llm` instead of `kind:tool_call`.
- [ ] Update `docs/specs/llm-integration/design.md`:
  - Add "Startup reconciliation for stale kind:llm" section (next to existing "Startup reconciliation" for tool_call at line 431).
  - Document `MessagesRepository.listStaleLlmMessages()` SQL query.
  - Document `MessageManager.hideAllStaleLlmOnStartup()` method.
  - Document call site in `src/main/index.ts` (after `finalizeAllStaleToolCallsOnStartup()`).
  - Add unit test entries to the test matrix.
  - Add `llm-integration.11.6.4` to the coverage table.

### Phase 2: Code

- [ ] Add `listStaleLlmMessages()` to `src/main/db/repositories/MessagesRepository.ts`:
  - SQL: `SELECT * FROM messages INNER JOIN agents ON messages.agentId = agents.agentId WHERE agents.userId = ? AND messages.kind = 'llm' AND messages.done = false AND messages.hidden = false ORDER BY messages.id ASC`
  - Pattern: identical to `listStaleToolCalls()` but with `kind='llm'` and `hidden=false` filter.
  - Note: Unlike `listStaleToolCalls()` which includes `hidden=true` rows (because tool calls need terminal state regardless), this method only targets `hidden=false` rows because `hidden=true` llm messages are already in the correct state.

- [ ] Add `hideAllStaleLlmOnStartup()` to `src/main/agents/MessageManager.ts`:
  - Call `this.dbManager.messages.listStaleLlmMessages()`.
  - For each stale row: call `this.dbManager.messages.setHidden(row.id, row.agentId)` to set `hidden=true`.
  - No event emission (renderer not yet connected at startup).
  - Log count of processed rows.
  - Requirements comment: `// Requirements: llm-integration.11.6.4`

- [ ] Add startup call in `src/main/index.ts`:
  - After line 318 (`messageManager.finalizeAllStaleToolCallsOnStartup();`), add:
    ```typescript
    messageManager.hideAllStaleLlmOnStartup();
    ```
  - Under the same `if (userManager.getCurrentUserId())` guard (line 317).

### Phase 3: Tests

- [ ] Add unit test `tests/unit/db/repositories/MessagesRepository.test.ts`:
  - Test `listStaleLlmMessages()` returns `kind:llm` with `done=false, hidden=false`.
  - Test `listStaleLlmMessages()` excludes `kind:llm` with `done=true` (already complete).
  - Test `listStaleLlmMessages()` excludes `kind:llm` with `hidden=true` (already hidden).
  - Test `listStaleLlmMessages()` excludes other kinds (`user`, `error`, `tool_call`).
  - Test `listStaleLlmMessages()` filters by current user via agents join.
  - Covers requirement ID: `llm-integration.11.6.4`.

- [ ] Add unit test `tests/unit/agents/MessageManager.test.ts`:
  - Test `hideAllStaleLlmOnStartup()` — hides visible stale llm message (`hidden=false, done=false`).
  - Test `hideAllStaleLlmOnStartup()` — no-op when no stale llm messages exist.
  - Test `hideAllStaleLlmOnStartup()` — handles multiple stale rows across agents.
  - Test `hideAllStaleLlmOnStartup()` — does not emit MessageUpdatedEvent (renderer not available).
  - Test `hideAllStaleLlmOnStartup()` — uses `MessagesRepository.setHidden` directly (bypass MessageManager.setHidden to avoid events).
  - Test `hideAllStaleLlmOnStartup()` — logs count of hidden rows.
  - Covers requirement ID: `llm-integration.11.6.4`.

### Phase 4: Finalization

- [ ] Update coverage table in `docs/specs/llm-integration/design.md` with `llm-integration.11.6.4` row.
- [ ] Run `npm run validate`.

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/requirements.md` | Add requirement `llm-integration.11.6.4` for kind:llm startup reconciliation |
| `docs/specs/llm-integration/design.md` | Add startup reconciliation design for kind:llm, unit test entries, coverage table row |
| `src/main/db/repositories/MessagesRepository.ts` | Add `listStaleLlmMessages()` method |
| `src/main/agents/MessageManager.ts` | Add `hideAllStaleLlmOnStartup()` method |
| `src/main/index.ts` | Add call to `messageManager.hideAllStaleLlmOnStartup()` after existing tool_call reconciliation |
| `tests/unit/db/repositories/MessagesRepository.test.ts` | Add tests for `listStaleLlmMessages()` |
| `tests/unit/agents/MessageManager.test.ts` | Add tests for `hideAllStaleLlmOnStartup()` |

## Expected result

After implementing this plan:
1. On application startup, any orphaned `kind:llm` messages with `done=false, hidden=false` will be automatically hidden (`hidden=true`).
2. `computeAgentStatus()` will skip these hidden messages and resolve the agent status from the previous visible message (typically `kind:user` -> `awaiting-response` since pipeline is inactive, or `new` if no other messages exist).
3. The permanent spinner / IN_PROGRESS state after forced process termination will no longer occur.
4. The fix is consistent with existing graceful cancellation semantics (`hideAndMarkIncomplete`).
5. The fix follows the same architectural pattern as the tool_call startup reconciliation from PR #97.

## Risks

- **Risk: Hidden messages accumulate in DB** — Mitigation: This is consistent with existing behavior for cancelled llm messages. Hidden messages are kept for audit/debugging purposes (per `llm-integration.3.8`). No user-visible impact since hidden messages are excluded from all UI queries and model history.
- **Risk: Edge case where llm message is legitimately in-progress at startup** — Mitigation: This cannot happen because the process was killed; there is no active pipeline. On restart, all pipelines are clean. A `kind:llm` with `done=false` after restart is always orphaned.
- **Risk: Interaction with concurrent startups** — Mitigation: The reconciliation runs after `userManager.initialize()` and before renderer creation, same as existing tool_call reconciliation. Single instance lock prevents concurrent Electron instances.
