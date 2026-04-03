import React, { createContext, useContext } from 'react';

type StickToBottomContextValue = {
  isAtBottom: boolean;
  scrollToBottom: (...args: unknown[]) => void;
};

const StickToBottomContext = createContext<StickToBottomContextValue>({
  isAtBottom: true,
  scrollToBottom: () => undefined,
});

export function StickToBottom({
  children,
  ...props
}: {
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <StickToBottomContext.Provider value={{ isAtBottom: true, scrollToBottom: () => undefined }}>
      <div data-testid="stick-to-bottom-mock" data-resize={props.resize as string | undefined}>
        {children}
      </div>
    </StickToBottomContext.Provider>
  );
}

export function useStickToBottomContext() {
  return useContext(StickToBottomContext);
}
