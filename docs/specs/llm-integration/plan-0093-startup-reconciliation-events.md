# Plan: Startup reconciliation event emission (#93)

## Context

Issue: https://github.com/amogil/clerkly4/issues/93

Startup reconciliation (introduced in #87, extended in #92/#97) finalizes stale `tool_call` records and hides stale `kind:llm` messages directly via `MessagesRepository` without emitting `MessageUpdatedEvent`. This was a deliberate decision because at startup:

- Renderer is not yet created (main window is created inside `authWindowManager.initializeApp()`)
- `MainEventBus` exists but no IPC-relay subscribers are attached
- Events go nowhere and are GC'd
- Renderer reads finalized data from DB on first load

The issue proposes two approaches for future-proofing:
1. Emit `MessageUpdatedEvent` during startup (requires extra DB reads via `getById` for each updated row)
2. Introduce a dedicated `StartupReconciliationEvent` with batch semantics

## Analysis

### Root cause

The two startup reconciliation methods in `MessageManager` bypass the normal event-emitting code paths:

- `finalizeAllStaleToolCallsOnStartup()` (`src/main/agents/MessageManager.ts:412-457`) calls `this.dbManager.messages.update()` directly instead of `this.update()` (which emits `MessageUpdatedEvent`)
- `hideAllStaleLlmOnStartup()` (`src/main/agents/MessageManager.ts:466-480`) calls `this.dbManager.messages.setHidden()` directly instead of `this.setHidden()` (which emits `MessageUpdatedEvent`)

Both methods explicitly document: "Uses MessagesRepository directly -- no events emitted (renderer not yet available)."

The startup sequence in `src/main/index.ts:317-321` runs reconciliation after `userManager.initialize()` but before `lifecycleManager.initialize()` (which creates `BrowserWindow`). At this point:
- `MainEventBus` singleton exists (lazy-initialized on first access)
- `registerEventIPCHandlers()` has NOT been called yet (line 365)
- No `BrowserWindow` exists for `broadcastToRenderer()` (created later inside `authWindowManager.initializeApp()`, line 398)
- Main-process-only subscribers (e.g., `EventLogger`) have NOT subscribed yet (line 393)

If events were emitted, `MainEventBus.publish()` would:
1. Queue events via `queueMicrotask`
2. On flush: emit locally via mitt (no subscribers) + broadcast to renderer (no windows) -- effectively a no-op
3. Events would update `lastEventTimestamps` cache, which could theoretically interfere with later real events for the same messages (though timestamp deduplication uses `<` for `message.updated`, so a later event with a newer timestamp would still pass)

### Decision: Emit `MessageUpdatedEvent` via `MessageManager` methods

The cleanest approach is to refactor the startup methods to use the existing event-emitting methods (`this.update()` and `this.setHidden()`) instead of bypassing them. This:

1. **Removes the gap** -- any future pre-renderer subscriber (analytics, audit, sync) will see reconciliation events
2. **Maintains consistency** -- all message mutations flow through the same code paths
3. **Has minimal overhead** -- `getById()` reads are cheap (SQLite, local, already in cache), and this runs once at startup with typically 0-5 stale rows
4. **No risk of timestamp conflicts** -- `message.updated` uses non-coalesced mode in EventBus (unique `batchKey` per event), and the reconciliation events will have timestamps earlier than any post-renderer events

For `finalizeAllStaleToolCallsOnStartup()`: replace `this.dbManager.messages.update(...)` with `this.update(...)` (which emits `MessageUpdatedEvent`).

For `hideAllStaleLlmOnStartup()`: replace `this.dbManager.messages.setHidden(...)` with `this.setHidden(...)` (which emits `MessageUpdatedEvent`).

### Affected requirements

- `llm-integration.11.6.3` -- startup reconciliation for stale `tool_call`; current spec says "no events emitted (renderer not yet available)" -- needs update
- `llm-integration.11.6.4` -- startup reconciliation for stale `kind:llm`; same update needed
- `llm-integration.2.3` -- `message.updated` SHALL be emitted on any message update (currently violated by startup reconciliation)

### Affected specifications

- `docs/specs/llm-integration/requirements.md` -- no changes needed (requirements already say startup SHALL finalize/hide; they don't mandate no-event behavior)
- `docs/specs/llm-integration/design.md` -- update startup reconciliation sections to remove "no events emitted" constraint

## Action plan

### Phase 1: Specifications

- [x] Update `docs/specs/llm-integration/design.md` -- Startup reconciliation (llm-integration.11.6.3): remove "Не emit'ит MessageUpdatedEvent" and replace with note that events are emitted via standard `MessageManager` methods
- [x] Update `docs/specs/llm-integration/design.md` -- Startup reconciliation for stale kind:llm (llm-integration.11.6.4): same change
- [x] Update `docs/specs/llm-integration/design.md` -- Unit test descriptions: update `finalizeAllStaleToolCallsOnStartup` and `hideAllStaleLlmOnStartup` test descriptions to reflect event emission instead of no-event-emission

### Phase 2: Code

- [ ] Modify `src/main/agents/MessageManager.ts` -- `finalizeAllStaleToolCallsOnStartup()`: replace `this.dbManager.messages.update(row.id, row.agentId, JSON.stringify({...}), true)` with `this.update(row.id, row.agentId, {...}, true)` which uses `MessageManager.update()` and emits `MessageUpdatedEvent`
- [ ] Modify `src/main/agents/MessageManager.ts` -- `hideAllStaleLlmOnStartup()`: replace `this.dbManager.messages.setHidden(row.id, row.agentId)` with `this.setHidden(row.id, row.agentId)` which uses `MessageManager.setHidden()` and emits `MessageUpdatedEvent`
- [ ] Remove method-level comments "Uses MessagesRepository directly -- no events emitted" from both methods

### Phase 3: Tests

- [ ] Update unit test `tests/unit/agents/MessageManager.test.ts` -- `finalizeAllStaleToolCallsOnStartup` > "should not emit MessageUpdatedEvent": reverse the assertion to verify that `MessageUpdatedEvent` IS emitted for each finalized row. Rename test to "should emit MessageUpdatedEvent for each finalized row". Requirement IDs: `llm-integration.11.6.3`, `llm-integration.2.3`
- [ ] Update unit test `tests/unit/agents/MessageManager.test.ts` -- `finalizeAllStaleToolCallsOnStartup` > "should use MessagesRepository.update directly (bypass MessageManager.update)": reverse to verify `MessageManager.update` IS called (not repo directly). Rename test to "should use MessageManager.update (emits events)". Requirement IDs: `llm-integration.11.6.3`
- [ ] Update unit test `tests/unit/agents/MessageManager.test.ts` -- `hideAllStaleLlmOnStartup` > "should not emit MessageUpdatedEvent (renderer not available)": reverse to verify that `MessageUpdatedEvent` IS emitted. Rename to "should emit MessageUpdatedEvent for each hidden row". Requirement IDs: `llm-integration.11.6.4`, `llm-integration.2.3`
- [ ] Update unit test `tests/unit/agents/MessageManager.test.ts` -- `hideAllStaleLlmOnStartup` > "should use MessagesRepository.setHidden directly (bypass MessageManager.setHidden)": reverse to verify `MessageManager.setHidden` IS called. Rename to "should use MessageManager.setHidden (emits events)". Requirement IDs: `llm-integration.11.6.4`
- [ ] Existing functional tests in `tests/functional/startup-recovery.spec.ts` do not need changes -- they verify DB state after restart, not event emission. Events are a no-op at startup since no renderer/subscribers exist.

### Phase 4: Finalization

- [ ] Update coverage table in `design.md` -- no new requirement IDs added, existing coverage unchanged
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/llm-integration/design.md` | Update startup reconciliation sections to reflect event emission; update unit test descriptions |
| `src/main/agents/MessageManager.ts` | `finalizeAllStaleToolCallsOnStartup()` -- use `this.update()` instead of repo direct; `hideAllStaleLlmOnStartup()` -- use `this.setHidden()` instead of repo direct |
| `tests/unit/agents/MessageManager.test.ts` | Reverse 4 tests from "no event" to "emits event"; rename accordingly |

## Expected result

After implementation:
1. `finalizeAllStaleToolCallsOnStartup()` emits `MessageUpdatedEvent` for each finalized stale tool_call via `MessageManager.update()`
2. `hideAllStaleLlmOnStartup()` emits `MessageUpdatedEvent` for each hidden stale llm message via `MessageManager.setHidden()`
3. At startup time, these events are effectively no-ops (no subscribers/windows), but any future pre-renderer subscriber will receive them
4. All message mutations consistently flow through event-emitting code paths
5. Unit tests verify event emission behavior
6. Functional tests continue to pass (they verify DB state, not events)

## Risks

- **Risk: Timestamp cache pollution at startup** -- Emitting events populates `lastEventTimestamps` in `MainEventBus` for reconciled messages. Later, when renderer connects and loads messages from DB, it will receive `message.created` events via `agents:list` IPC (which returns snapshots, not events) and apply them directly. The startup `message.updated` events in the cache have timestamps from startup, which will be older than any subsequent real `message.updated` events, so deduplication will correctly allow them through. **Mitigation:** Non-issue due to timestamp ordering (startup events are always earlier than runtime events).

- **Risk: Performance overhead from extra DB reads** -- `MessageManager.update()` calls `getById()` after updating to build the snapshot for the event. For startup reconciliation with typically 0-5 stale rows, this adds 0-5 trivial SQLite reads. **Mitigation:** Negligible cost; startup reconciliation is a once-per-launch operation.

- **Risk: `MessageManager.setHidden()` emits event but also reads back message** -- `setHidden()` calls `getById()` to build snapshot. For stale llm messages at startup, this is a trivial read. **Mitigation:** Same as above.
