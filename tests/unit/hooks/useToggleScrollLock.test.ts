/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: useToggleScrollLock
 *
 * Tests for the scroll-position-preserving toggle wrapper hook.
 * Requirements: agents.4.13.7
 */

import { renderHook, act } from '@testing-library/react';
import { useToggleScrollLock } from '../../../src/renderer/hooks/useToggleScrollLock';
import type { StickToBottomContext } from 'use-stick-to-bottom';

// Helper to create a mock StickToBottomContext
function createMockContext(overrides?: Partial<{
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isAtBottom: boolean;
}>): { ref: React.RefObject<StickToBottomContext | null>; scrollEl: HTMLElement } {
  const scrollEl = document.createElement('div');
  Object.defineProperty(scrollEl, 'scrollTop', {
    get: () => overrides?.scrollTop ?? 500,
    set: jest.fn(),
    configurable: true,
  });
  Object.defineProperty(scrollEl, 'scrollHeight', {
    get: () => overrides?.scrollHeight ?? 2000,
    configurable: true,
  });
  Object.defineProperty(scrollEl, 'clientHeight', {
    get: () => overrides?.clientHeight ?? 600,
    configurable: true,
  });

  const state = {
    scrollTop: overrides?.scrollTop ?? 500,
    targetScrollTop: 0,
    calculatedTargetScrollTop: 0,
    scrollDifference: 0,
    resizeDifference: 0,
    velocity: 0,
    accumulated: 0,
    escapedFromLock: false,
    isAtBottom: overrides?.isAtBottom ?? true,
    isNearBottom: false,
  };

  const ctx = {
    scrollRef: { current: scrollEl } as unknown as StickToBottomContext['scrollRef'],
    contentRef: { current: null } as unknown as StickToBottomContext['contentRef'],
    scrollToBottom: jest.fn(),
    stopScroll: jest.fn(),
    isAtBottom: state.isAtBottom,
    escapedFromLock: false,
    get targetScrollTop() { return null; },
    set targetScrollTop(_v: unknown) {},
    state,
  } as unknown as StickToBottomContext;

  const ref = { current: ctx } as React.RefObject<StickToBottomContext | null>;
  return { ref, scrollEl };
}

describe('useToggleScrollLock', () => {
  let originalRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    // Make rAF synchronous for testing
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    jest.restoreAllMocks();
  });

  /* Preconditions: stickContextRef has a valid context with isAtBottom=true, scrollTop=500
     Action: Call the wrapped onOpenChange callback
     Assertions: isAtBottom is set to false before toggle, scrollTop is restored after rAF
     Requirements: agents.4.13.7 */
  it('should suppress isAtBottom and restore scrollTop during toggle', () => {
    const { ref, scrollEl } = createMockContext({ scrollTop: 500, isAtBottom: true });
    const scrollTopSetter = jest.fn();
    Object.defineProperty(scrollEl, 'scrollTop', {
      get: () => 500,
      set: scrollTopSetter,
      configurable: true,
    });

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current();

    act(() => {
      wrappedOnOpenChange(true);
    });

    // scrollTop should have been restored
    expect(scrollTopSetter).toHaveBeenCalledWith(500);
  });

  /* Preconditions: stickContextRef has a valid context with isAtBottom=true
     Action: Call wrapped callback; after rAFs, scroll is near bottom (diff <= 70)
     Assertions: isAtBottom is restored to true
     Requirements: agents.4.13.7 */
  it('should restore isAtBottom to true when still near bottom after toggle', () => {
    const { ref } = createMockContext({
      scrollTop: 1350,
      scrollHeight: 2000,
      clientHeight: 600,
      isAtBottom: true,
    });
    // diff = 2000 - 1350 - 600 = 50, which is <= 70

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current();

    act(() => {
      wrappedOnOpenChange(false);
    });

    // After two rAF ticks (synchronous in test), isAtBottom should be restored
    expect(ref.current!.state.isAtBottom).toBe(true);
  });

  /* Preconditions: stickContextRef has a valid context with isAtBottom=false
     Action: Call wrapped callback
     Assertions: isAtBottom stays false (was not at bottom before toggle)
     Requirements: agents.4.13.7 */
  it('should not restore isAtBottom when user was not at bottom before toggle', () => {
    const { ref } = createMockContext({
      scrollTop: 100,
      scrollHeight: 2000,
      clientHeight: 600,
      isAtBottom: false,
    });

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current();

    act(() => {
      wrappedOnOpenChange(true);
    });

    // isAtBottom should remain false
    expect(ref.current!.state.isAtBottom).toBe(false);
  });

  /* Preconditions: onToggleScrollLock wraps an original onOpenChange callback
     Action: Call wrapped callback with open=true
     Assertions: Original onOpenChange is called with the same argument
     Requirements: agents.4.13.7 */
  it('should call the original onOpenChange callback', () => {
    const { ref } = createMockContext();
    const originalOnOpenChange = jest.fn();

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current(originalOnOpenChange);

    act(() => {
      wrappedOnOpenChange(true);
    });

    expect(originalOnOpenChange).toHaveBeenCalledWith(true);
  });

  /* Preconditions: onToggleScrollLock wraps an original onOpenChange callback
     Action: Call wrapped callback with open=false (collapse)
     Assertions: Original onOpenChange is called with false
     Requirements: agents.4.13.7 */
  it('should call the original onOpenChange with false for collapse', () => {
    const { ref } = createMockContext();
    const originalOnOpenChange = jest.fn();

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current(originalOnOpenChange);

    act(() => {
      wrappedOnOpenChange(false);
    });

    expect(originalOnOpenChange).toHaveBeenCalledWith(false);
  });

  /* Preconditions: stickContextRef.current is null (no context available)
     Action: Call wrapped callback
     Assertions: No error thrown, original onOpenChange still called
     Requirements: agents.4.13.7 */
  it('should handle null context gracefully', () => {
    const ref = { current: null } as React.RefObject<StickToBottomContext | null>;
    const originalOnOpenChange = jest.fn();

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current(originalOnOpenChange);

    expect(() => {
      act(() => {
        wrappedOnOpenChange(true);
      });
    }).not.toThrow();

    expect(originalOnOpenChange).toHaveBeenCalledWith(true);
  });

  /* Preconditions: No original onOpenChange provided (undefined)
     Action: Call wrapped callback
     Assertions: No error thrown, scroll lock still applied
     Requirements: agents.4.13.7 */
  it('should handle undefined original onOpenChange', () => {
    const { ref } = createMockContext();

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current(undefined);

    expect(() => {
      act(() => {
        wrappedOnOpenChange(true);
      });
    }).not.toThrow();
  });

  /* Preconditions: stickContextRef has valid context, wasAtBottom=true but scroll moved far from bottom
     Action: Call wrapped callback; after rAFs, diff > 70
     Assertions: isAtBottom is set to false (user scrolled away)
     Requirements: agents.4.13.7 */
  it('should set isAtBottom to false when scroll moved away from bottom after toggle', () => {
    const { ref } = createMockContext({
      scrollTop: 500,
      scrollHeight: 2000,
      clientHeight: 600,
      isAtBottom: true,
    });
    // diff = 2000 - 500 - 600 = 900, which is > 70

    const { result } = renderHook(() => useToggleScrollLock(ref));
    const wrappedOnOpenChange = result.current();

    act(() => {
      wrappedOnOpenChange(true);
    });

    // After two rAF ticks, isAtBottom should be false because diff > 70
    expect(ref.current!.state.isAtBottom).toBe(false);
  });

  /* Preconditions: Hook returns stable reference across re-renders
     Action: Re-render with same ref
     Assertions: The factory function identity is stable
     Requirements: agents.4.13.7 */
  it('should return stable callback identity for same ref', () => {
    const { ref } = createMockContext();

    const { result, rerender } = renderHook(() => useToggleScrollLock(ref));
    const first = result.current;
    rerender();
    const second = result.current;

    expect(first).toBe(second);
  });
});
