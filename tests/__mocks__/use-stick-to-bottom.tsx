import React, { createContext, useContext } from 'react';

type StickToBottomContextValue = {
  isAtBottom: boolean;
  scrollToBottom: (...args: unknown[]) => void;
};

const StickToBottomContext = createContext<StickToBottomContextValue>({
  isAtBottom: true,
  scrollToBottom: () => undefined,
});

// Store the last props passed to StickToBottom for testing
let lastReceivedProps: Record<string, unknown> = {};

export function getLastStickToBottomProps(): Record<string, unknown> {
  return lastReceivedProps;
}

type StickToBottomProps = {
  children?: React.ReactNode;
  className?: string;
  initial?: 'smooth' | 'instant' | 'auto';
  resize?: 'smooth' | 'instant' | 'auto';
  role?: string;
  [key: string]: unknown;
};

export function StickToBottom({ children, ...props }: StickToBottomProps) {
  lastReceivedProps = props;
  return (
    <StickToBottomContext.Provider value={{ isAtBottom: true, scrollToBottom: () => undefined }}>
      <div data-testid="stick-to-bottom-mock">{children}</div>
    </StickToBottomContext.Provider>
  );
}

export function useStickToBottomContext() {
  return useContext(StickToBottomContext);
}
