# Plan: Suppress auto-scroll on code block / reasoning toggle (#111)

## Context

When a collapsible block (`code_exec` or reasoning/thought) is near the bottom of the chat, expanding or collapsing it triggers auto-scroll, jumping the viewport unexpectedly. The user expects the viewport to remain at their current scroll position when toggling these blocks.

Issue: https://github.com/nicktesh/clerkly/issues/111

## Analysis

### Root cause

The `Conversation` component wraps `StickToBottom` from `use-stick-to-bottom` with `resize="smooth"` (`src/renderer/components/ai-elements/conversation.tsx:17`).

Inside `use-stick-to-bottom` (`node_modules/use-stick-to-bottom/dist/useStickToBottom.js:306-361`), a `ResizeObserver` watches the content element. When content height changes:

- **Height increases** (expand): lines 318-331 call `scrollToBottom({ preserveScrollPosition: true, ... })`. If `isAtBottom` was true, this scrolls the viewport down. Even with `preserveScrollPosition: true`, the scroll-to-bottom animation re-triggers whenever the user is currently "at bottom."
- **Height decreases** (collapse): lines 333-343 check `isNearBottom` and if true, re-lock `isAtBottom = true`, which then leads to scroll-to-bottom on the next resize tick.

Both collapsible block types (`Reasoning` and `Tool`/`code_exec`) use Radix `Collapsible` primitives, which animate open/closed states. These animations cause content height changes detected by the ResizeObserver, triggering the unwanted scroll behavior.

**Specific code paths:**
- `src/renderer/components/agents/AgentMessage.tsx:326-332` — Reasoning block via `<Reasoning>` wrapping `<Collapsible>`
- `src/renderer/components/agents/AgentMessage.tsx:444-508` — code_exec block via `<Tool>` which is `<Collapsible>`
- `src/renderer/components/ai-elements/reasoning.tsx:136-147` — Reasoning = Collapsible
- `src/renderer/components/ai-elements/tool.tsx:26-31` — Tool = Collapsible
- `src/renderer/components/ai-elements/conversation.tsx:13-21` — Conversation = StickToBottom with resize="smooth"

**Why this only happens near the bottom:** When the user's scroll position is near the bottom, `use-stick-to-bottom` considers the user "at bottom" (`isAtBottom = true` or `isNearBottom = true`, with a 70px threshold at line 28). Any resize while at-bottom triggers the scroll-to-bottom logic. When scrolled up further, `isAtBottom` is false and `scrollToBottom` with `preserveScrollPosition: true` becomes a no-op.

**Solution approach:** Intercept user-initiated toggle events and temporarily suppress the `use-stick-to-bottom` scroll behavior. The cleanest approach is:

1. Create a scroll-position-preserving wrapper for collapsible toggle actions.
2. Before the toggle, capture the current `scrollTop` from the scroll container.
3. After the toggle completes (content reflows), restore `scrollTop` to the captured value.
4. During this window, suppress `use-stick-to-bottom` from auto-scrolling by temporarily setting `isAtBottom = false` on the state object, then restoring it afterward.

Access to the `StickToBottom` state is available through the `stickContextRef` (`AgentChat.tsx:143`) which exposes `state: StickToBottomState` including `scrollTop`, `isAtBottom`, and `resizeObserver`.

The implementation will:
- Add a `useScrollLock` hook (or inline utility) that wraps toggle callbacks.
- Provide it to `AgentMessage` as a callback prop so toggle clicks use it.
- The hook accesses `stickContextRef.current.state` to manipulate `isAtBottom`.

**Alternative considered:** Patching `use-stick-to-bottom` or overriding its `ResizeObserver` — rejected as too fragile and couples to library internals too deeply.

**Preferred approach — scroll position restoration via `onOpenChange` interception:** 
- In `AgentChatInner`, wrap each collapsible block's `onOpenChange` to capture `scrollTop` before the state change and restore it in a `requestAnimationFrame` after reflow.
- This requires passing the scroll container ref (accessible via `stickContextRef.current.scrollRef`) down to message components.

### Affected requirements

- `agents.4.13` — Auto-scroll to last message: the new requirement is that toggling collapsible blocks SHALL NOT trigger auto-scroll.
- `agents.4.13.2` — Already states "auto-scroll SHALL NOT force user down when not at bottom" but the bug occurs even when at bottom (expand/collapse should not scroll).

### Affected specifications

- `docs/specs/agents/requirements.md` — Add requirement `agents.4.13.7` for toggle-scroll suppression
- `docs/specs/agents/design.md` — Add design section describing the scroll-lock mechanism during toggle, update coverage table

## Action plan

### Phase 1: Specifications
- [x] Update `requirements.md` — Add requirement `agents.4.13.7`: WHEN user toggles (expands or collapses) a collapsible block (code_exec, reasoning), auto-scroll SHALL NOT be triggered and viewport SHALL remain at the user's current scroll position
- [x] Update `design.md` — Add "Scroll Suppression During Collapsible Toggle" section describing the mechanism, update coverage table

### Phase 2: Code
- [x] Add `useToggleScrollLock` hook in `src/renderer/hooks/useToggleScrollLock.ts` — captures `scrollTop` before toggle, restores it via `requestAnimationFrame` after reflow, temporarily suppresses `isAtBottom` on `StickToBottomState`
- [x] Modify `src/renderer/components/agents/AgentChat.tsx` — pass scroll lock callback via context or prop to `AgentMessage`
- [x] Modify `src/renderer/components/agents/AgentMessage.tsx` — wrap `onOpenChange` of `Reasoning` and `Tool` (code_exec) collapsibles with the scroll lock callback
- [x] Alternatively, create a wrapper component `ScrollLockedCollapsible` that intercepts `onOpenChange` and applies scroll position preservation

### Phase 3: Tests
- [x] Add unit test `tests/unit/hooks/useToggleScrollLock.test.ts` — verifies scroll position is preserved during open/close toggle, covers `agents.4.13.7`
- [x] Add unit test case in `tests/unit/components/agents/AgentMessage.test.tsx` — verifies `onOpenChange` wrappers are applied to Reasoning and Tool blocks, covers `agents.4.13.7`
- [x] Add unit test case in `tests/unit/components/agents-autoscroll.test.tsx` — verifies toggling a collapsible near bottom does not trigger auto-scroll, covers `agents.4.13.7`
- [x] Add functional test `tests/functional/llm-chat.spec.ts` — "should not auto-scroll when toggling code_exec block near bottom of chat", covers `agents.4.13.7`

### Phase 4: Finalization
- [x] Update coverage table in `design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/agents/requirements.md` | Add requirement `agents.4.13.7` for toggle-scroll suppression |
| `docs/specs/agents/design.md` | Add scroll suppression design section, update coverage table |
| `src/renderer/hooks/useToggleScrollLock.ts` | New hook: captures scrollTop, suppresses isAtBottom, restores after reflow |
| `src/renderer/components/agents/AgentChat.tsx` | Pass scroll lock context/callback to AgentMessage |
| `src/renderer/components/agents/AgentMessage.tsx` | Wrap Reasoning and Tool onOpenChange with scroll lock |
| `tests/unit/hooks/useToggleScrollLock.test.ts` | Unit tests for the scroll lock hook |
| `tests/unit/components/agents/AgentMessage.test.tsx` | Test that onOpenChange wrappers are present |
| `tests/unit/components/agents-autoscroll.test.tsx` | Test toggle does not trigger auto-scroll |
| `tests/functional/llm-chat.spec.ts` | Functional test for toggle scroll suppression |

## Expected result

After implementation:
1. Expanding or collapsing a `code_exec` block near the bottom of the chat does NOT trigger auto-scroll. The viewport stays at the user's current scroll position.
2. Expanding or collapsing a reasoning/thought block near the bottom of the chat does NOT trigger auto-scroll.
3. Normal auto-scroll behavior (new messages arriving while user is at bottom) continues to work correctly.
4. The scroll-to-bottom button continues to work correctly.
5. Manual scroll up/down by the user continues to work correctly.

## Risks

- **Risk 1: Library internal state manipulation** — The solution manipulates `StickToBottomState.isAtBottom` directly. If `use-stick-to-bottom` changes its internal state shape, this could break. *Mitigation:* Pin the library version; the state object is part of the public `StickToBottomState` interface in types.
- **Risk 2: Timing of scroll position restoration** — `requestAnimationFrame` may not be sufficient if Radix Collapsible uses multi-frame animations. *Mitigation:* Use a `ResizeObserver` on the scroll container or listen for `transitionend` as a fallback; test with real Electron.
- **Risk 3: Interaction with streaming auto-scroll** — During active LLM streaming, messages grow in real-time. If a user toggles a block during streaming, the scroll lock must not interfere with streaming scroll behavior. *Mitigation:* The scroll lock is applied only for the brief toggle reflow window (single rAF tick), then releases, so streaming resumes normally.
- **Risk 4: Auto-close reasoning after streaming** — `Reasoning` auto-closes after streaming ends (1s delay, `reasoning.tsx:108-122`). This auto-close is not user-initiated and currently would trigger auto-scroll. This is a borderline case — it may or may not need suppression. *Mitigation:* Initially only suppress user-initiated toggles (click on trigger); gather user feedback on the auto-close case separately.
