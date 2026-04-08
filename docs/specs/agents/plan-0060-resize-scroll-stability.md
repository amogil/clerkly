# Plan: Chat content lags and auto-scrolls during window resize (#60)

## Context

GitHub issue: #60 - Chat content lags and auto-scrolls during window resize.

When resizing the app window, the chat UI becomes unstable: content reflows with visible lag and the message list repeatedly auto-scrolls to the bottom. This happens because the `use-stick-to-bottom` library uses a `ResizeObserver` on the content element, and every resize event that changes content height triggers `scrollToBottom()` if `state.isAtBottom` is true. During continuous window resize, this creates a flood of scroll-to-bottom calls with `resize="smooth"` animation, causing visible stutter and repeated forced scrolling.

## Analysis

### Root cause

The `Conversation` component passes `resize="smooth"` to `StickToBottom` (`src/renderer/components/ai-elements/conversation.tsx:17`). The `use-stick-to-bottom` library internally attaches a `ResizeObserver` to the content element. On every content height change (which happens on each window resize frame as text reflows), the library's `ResizeObserver` callback fires and calls `scrollToBottom()` with the `resize` animation if the user is currently "at bottom" (`state.isAtBottom === true`).

Looking at `node_modules/use-stick-to-bottom/dist/useStickToBottom.js:306-360`:
- The `ResizeObserver` fires on every content height change
- For positive height changes (or any reflow), if `isAtBottom` is true, it calls `scrollToBottom({ animation: resize, wait: true, preserveScrollPosition: true, ... })`
- With `resize="smooth"`, each resize frame starts a new spring-based smooth scroll animation
- The animations compound and compete, causing visible jank
- Even for negative resizes, if `isNearBottom` is true, it re-locks `isAtBottom = true`, perpetuating the cycle

The current `resize="smooth"` setting is appropriate for content growth (new messages), but it is problematic during window resize because:
1. Window resize causes many rapid, small content height changes (text reflow)
2. Each triggers a new smooth-scroll animation
3. These animations queue/compete with each other (`wait: true`)
4. The visual result is repeated stuttering scrolls

### Solution approach

Override the `resize` prop on `<Conversation>` at the call site in `AgentChat.tsx` by passing `resize="instant"`. The vendor `Conversation` component (`src/renderer/components/ai-elements/conversation.tsx`) defaults to `resize="smooth"`, but its JSX uses `{...props}` spread after the inline defaults, so passing `resize="instant"` from the call site overrides the default. This ensures that when content height changes due to window resize (while user is at bottom), the scroll position jumps instantly to the new bottom position without animation.

**IMPORTANT:** `conversation.tsx` is a vendor/external component in `src/renderer/components/ai-elements/` and MUST NOT be modified directly, as changes will be lost on updates via `npm run ai-elements:update-all`.

The `initial="smooth"` prop remains unchanged, so the first scroll-to-bottom on load still animates smoothly. New messages still trigger smooth autoscroll through the default behavior of `scrollToBottom()`.

Additionally, the `useToggleScrollLock` hook already handles scroll suppression for collapsible block toggles, so the `resize="instant"` override is complementary and does not conflict.

### Affected requirements

- `agents.4.13` - Autoscroll to last message on new messages (behavior preserved, only resize animation changes)
- `agents.4.13.1` - Autoscroll when user is at bottom (preserved - smooth scroll on new content via default animation)
- `agents.4.13.2` - No forced scroll when user is not at bottom (preserved - `preserveScrollPosition: true` in resize path)
- `agents.4.13.7` - No autoscroll on collapsible toggle (preserved - `useToggleScrollLock` still works)

### New requirement needed

A new requirement is needed to specify resize behavior explicitly:
- `agents.4.13.8` - During window resize, scroll position must remain stable without visible animation or stutter

### Affected specifications

- `docs/specs/agents/requirements.md` - Add requirement `agents.4.13.8` for resize scroll stability
- `docs/specs/agents/design.md` - Document the `resize="instant"` choice and resize behavior in the autoscroll section

## Action plan

### Phase 1: Specifications

- [x] Update `requirements.md` - Add `agents.4.13.8`: WHEN window size changes, scroll position SHALL remain stable without visible repeated scrolling or animation stutter; auto-scroll-to-bottom SHALL only apply instantaneously if user was already at bottom
- [x] Update `design.md` - Document the `resize="instant"` prop choice in the autoscroll section and coverage table

### Phase 2: Code

- [x] Revert `src/renderer/components/ai-elements/conversation.tsx` to original `resize="smooth"` (vendor file MUST NOT be modified)
- [x] Pass `resize="instant"` at the call site in `src/renderer/components/agents/AgentChat.tsx` on the `<Conversation>` element, which overrides the vendor default via props spread

### Phase 3: Tests

- [x] Rewrite unit test in `tests/unit/components/agents-autoscroll.test.tsx` to render `AgentChat` with mocked dependencies and verify `resize="instant"` prop arrives at the `Conversation` mock at runtime (not fs.readFileSync string check); covers `agents.4.13.8`
- [x] Remove dead `getLastStickToBottomProps()` export from `tests/__mocks__/use-stick-to-bottom.tsx`
- [x] Update `StickToBottom` mock to expose `data-resize` attribute for prop inspection

### Phase 4: Finalization

- [x] Update coverage table in `design.md`
- [x] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/agents/requirements.md` | Add requirement `agents.4.13.8` for resize scroll stability |
| `docs/specs/agents/design.md` | Document `resize="instant"` override at call site; update coverage table |
| `src/renderer/components/ai-elements/conversation.tsx` | Reverted to original `resize="smooth"` (vendor file, not modified) |
| `src/renderer/components/agents/AgentChat.tsx` | Pass `resize="instant"` on `<Conversation>` call site to override vendor default |
| `tests/unit/components/agents-autoscroll.test.tsx` | Rewrite test to render AgentChat and verify `resize="instant"` prop at runtime |
| `tests/__mocks__/use-stick-to-bottom.tsx` | Remove dead `getLastStickToBottomProps()`; expose `data-resize` attribute |

## Expected result

After implementation:
1. During window resize, the chat content reflows without visible lag or stutter
2. If the user is at the bottom of the chat, the scroll position jumps instantly to the new bottom (no smooth animation during resize)
3. If the user is scrolled up, the scroll position remains stable during resize (no forced scroll-to-bottom)
4. Auto-scroll behavior for new messages remains smooth and unchanged
5. Collapsible block toggle scroll suppression continues to work correctly

## Risks

- **Risk: AI Elements update overwriting the change.** Mitigated: The `conversation.tsx` vendor file is NOT modified. The `resize="instant"` override is applied at the call site in `AgentChat.tsx`, which is app-owned code. Updates via `npm run ai-elements:update-all` will not affect this override as long as `Conversation` continues to use `{...props}` spread.
- **Risk: `resize="instant"` might cause visual jump on collapsible toggle.** When a collapsible block (code_exec, reasoning) is toggled, the content height changes and the instant resize would jump scroll. Mitigation: The `useToggleScrollLock` hook already sets `state.isAtBottom = false` before the toggle, so the library's resize handler sees `isAtBottom === false` and does not trigger `scrollToBottom`. This is validated by existing tests.
- **Risk: `resize="instant"` might affect the visual quality of scroll when new streaming content grows the container.** Mitigation: From the library source, the `resize` animation is used in the `ResizeObserver` path with `preserveScrollPosition: true` and `wait: true`. The normal `scrollToBottom()` calls from user actions use the base spring animation. However, during streaming, content growth triggers the `ResizeObserver` which would use `resize="instant"`. This actually improves the streaming experience by eliminating the spring-bounce effect during rapid content growth. The scroll stays locked to bottom without animated lag.

---

## Additional Finding: Scroll resets to top after streaming completes

### Problem discovered

While investigating scroll behavior, a new issue was found (unrelated to #60):

**When user creates a new chat and asks a question with a long answer:**
1. During streaming — chat correctly scrolls down as content arrives
2. After streaming **completes** — chat **resets to the top** (position 0) without user action

### Root cause (preliminary)

In `src/renderer/hooks/useAgentChat.ts:94-97`:
```typescript
onFinish: () => {
  void syncPersistedMessages();
},
```

After streaming completes, `syncPersistedMessages()`:
1. Calls `window.api.messages.list(agentId)` to reload all messages from DB
2. Calls `setRawMessages(sortedSnapshots)` with a completely new array
3. This triggers re-render of `AgentChatInner` which rebuilds the message list

This state update may conflict with `use-stick-to-bottom` internal state, causing scroll reset.

### Why current tests did not catch this

| Test type | What it tests | What it misses |
|-----------|---------------|----------------|
| Functional | Adding pre-created messages via `createAgentMessage` | Real LLM streaming |
| Functional | Autoscroll when messages added | Scroll behavior **after streaming completes** |
| Unit | `resize="instant"` prop | Streaming completion behavior |

The functional tests use `createAgentMessage` which directly inserts messages into the database — this does NOT simulate real streaming where `use-chat` receives `text-delta` events and the `onFinish` callback triggers `syncPersistedMessages()`.

### Action needed

1. **Create new issue** for scroll-reset-after-streaming (separate from #60)
2. **Create functional test** that:
   - Uses `MockLLMServer` for real streaming (like `llm-chat.spec.ts`)
   - Sends user message via UI
   - Waits for streaming to complete
   - Verifies scroll position stays at bottom after completion
3. **Fix the root cause** — likely optimize `syncPersistedMessages()` or prevent it from causing scroll reset

### Recommended test location

New test in `tests/functional/agent-scroll-position.spec.ts`:
```typescript
test('should keep scroll position at bottom after streaming completes', async () => {
  // Use MockLLMServer with slow streaming
  // Send user message
  // Wait for streaming to finish
  // Verify scroll is still at bottom
});
```

This follows the pattern in `tests/functional/llm-chat.spec.ts` which already uses `MockLLMServer` for streaming tests.
