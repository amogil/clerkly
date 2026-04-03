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

Change the `resize` prop on `StickToBottom` from `"smooth"` to `"instant"`. This ensures that when content height changes due to window resize (while user is at bottom), the scroll position jumps instantly to the new bottom position without animation. This eliminates the compounding smooth-scroll animations that cause stutter.

The `initial="smooth"` prop remains unchanged, so the first scroll-to-bottom on load still animates smoothly. New messages still trigger smooth autoscroll through the default behavior of `scrollToBottom()` (which uses the base spring animation, not the `resize` animation).

From the library source (`useStickToBottom.js:323-324`), the `resize` animation is used specifically in the `ResizeObserver` callback, while user-initiated `scrollToBottom()` calls and initial scroll use their own animation settings. So changing `resize` to `"instant"` only affects the response to content height changes (reflow during window resize, collapsible toggle, etc.), not the smooth autoscroll on new messages.

Additionally, the `useToggleScrollLock` hook (`src/renderer/hooks/useToggleScrollLock.ts`) already handles scroll suppression for collapsible block toggles by temporarily setting `state.isAtBottom = false`, so the `resize="instant"` change is complementary and does not conflict with that mechanism.

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

- [x] Modify `src/renderer/components/ai-elements/conversation.tsx` - Change `resize="smooth"` to `resize="instant"` on line 17 in the `Conversation` component

### Phase 3: Tests

- [x] Add unit test in `tests/unit/components/agents-autoscroll.test.tsx` - Add a test case "should pass resize='instant' to StickToBottom for stable scroll during window resize" that renders the `Conversation` component and verifies it passes `resize="instant"` prop to the underlying `StickToBottom`; covers requirement `agents.4.13.8`. The mock at `tests/__mocks__/use-stick-to-bottom.tsx` already provides a mock `StickToBottom` that can be inspected for props.

### Phase 4: Finalization

- [x] Update coverage table in `design.md`
- [ ] Run `npm run validate`

## Files to change

| File | Change |
|------|--------|
| `docs/specs/agents/requirements.md` | Add requirement `agents.4.13.8` for resize scroll stability |
| `docs/specs/agents/design.md` | Document `resize="instant"` in autoscroll section; update coverage table |
| `src/renderer/components/ai-elements/conversation.tsx` | Change `resize="smooth"` to `resize="instant"` (line 17) |
| `tests/unit/components/agents-autoscroll.test.tsx` | Add unit test verifying `Conversation` passes `resize="instant"` prop to `StickToBottom`; covers `agents.4.13.8` |

## Expected result

After implementation:
1. During window resize, the chat content reflows without visible lag or stutter
2. If the user is at the bottom of the chat, the scroll position jumps instantly to the new bottom (no smooth animation during resize)
3. If the user is scrolled up, the scroll position remains stable during resize (no forced scroll-to-bottom)
4. Auto-scroll behavior for new messages remains smooth and unchanged
5. Collapsible block toggle scroll suppression continues to work correctly

## Risks

- **Risk: AI Elements update overwriting the change.** The `conversation.tsx` file is in the AI Elements vendor directory and may be overwritten by `npm run ai-elements:update-all`. Mitigation: The `resize` prop is app-level configuration on the `<StickToBottom>` wrapper, so any re-sync would need to be checked for this prop. Document this in the design spec.
- **Risk: `resize="instant"` might cause visual jump on collapsible toggle.** When a collapsible block (code_exec, reasoning) is toggled, the content height changes and the instant resize would jump scroll. Mitigation: The `useToggleScrollLock` hook already sets `state.isAtBottom = false` before the toggle, so the library's resize handler sees `isAtBottom === false` and does not trigger `scrollToBottom`. This is validated by existing tests.
- **Risk: `resize="instant"` might affect the visual quality of scroll when new streaming content grows the container.** Mitigation: From the library source, the `resize` animation is used in the `ResizeObserver` path with `preserveScrollPosition: true` and `wait: true`. The normal `scrollToBottom()` calls from user actions use the base spring animation. However, during streaming, content growth triggers the `ResizeObserver` which would use `resize="instant"`. This actually improves the streaming experience by eliminating the spring-bounce effect during rapid content growth. The scroll stays locked to bottom without animated lag.
