// Requirements: agents.4.13.7
// Hook that creates a scroll-position-preserving wrapper for collapsible toggle actions.
// Captures scrollTop before toggle, suppresses isAtBottom on StickToBottomState during reflow,
// and restores scrollTop via requestAnimationFrame after the DOM settles.

import { useCallback } from 'react';
import type { StickToBottomContext } from 'use-stick-to-bottom';

/**
 * Returns a factory that wraps an optional `onOpenChange` callback with scroll-lock logic.
 * When the wrapped callback fires (e.g. user clicks a collapsible trigger):
 *   1. Captures current `scrollTop` from the scroll container.
 *   2. Sets `state.isAtBottom = false` to suppress use-stick-to-bottom auto-scroll on resize.
 *   3. After one rAF (reflow), restores `scrollTop`.
 *   4. After a second rAF (paint), conditionally restores `state.isAtBottom` based on proximity.
 */
// Requirements: agents.4.13.7
export function useToggleScrollLock(
  stickContextRef: React.RefObject<StickToBottomContext | null>
): (originalOnOpenChange?: (open: boolean) => void) => (open: boolean) => void {
  return useCallback(
    (originalOnOpenChange?: (open: boolean) => void) => {
      return (open: boolean) => {
        const ctx = stickContextRef.current;
        const scrollEl = ctx?.scrollRef?.current;

        if (scrollEl && ctx) {
          const savedScrollTop = scrollEl.scrollTop;
          const wasAtBottom = ctx.state.isAtBottom;

          // Suppress auto-scroll during resize triggered by collapsible animation
          ctx.state.isAtBottom = false;

          requestAnimationFrame(() => {
            scrollEl.scrollTop = savedScrollTop;

            // Restore isAtBottom after paint — check if still near bottom
            requestAnimationFrame(() => {
              if (wasAtBottom) {
                const diff = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
                // 70px is the threshold used by use-stick-to-bottom for isNearBottom
                ctx.state.isAtBottom = diff <= 70;
              }
            });
          });
        }

        originalOnOpenChange?.(open);
      };
    },
    [stickContextRef]
  );
}
