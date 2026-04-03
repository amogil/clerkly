import React, { createContext, useContext } from 'react';

type StickToBottomContextValue = {
  isAtBottom: boolean;
  scrollToBottom: (...args: unknown[]) => void;
};

const StickToBottomContext = createContext<StickToBottomContextValue>({
  isAtBottom: true,
  scrollToBottom: () => undefined,
});

// Store last props passed to StickToBottom for test inspection
let lastStickToBottomProps: Record<string, unknown> = {};

// Requirements: agents.4.13.8
export function getLastStickToBottomProps(): Record<string, unknown> {
  return lastStickToBottomProps;
}

export function StickToBottom({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  lastStickToBottomProps = props;
  return (
    <StickToBottomContext.Provider value={{ isAtBottom: true, scrollToBottom: () => undefined }}>
      <div data-testid="stick-to-bottom-mock">{children}</div>
    </StickToBottomContext.Provider>
  );
}

export function useStickToBottomContext() {
  return useContext(StickToBottomContext);
}
