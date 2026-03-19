import React from 'react';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  duration: number | undefined;
};

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);

export const Reasoning = ({
  children,
  isStreaming,
}: React.ComponentProps<'div'> & { isStreaming?: boolean }) => (
  <ReasoningWithState isStreaming={isStreaming}>{children}</ReasoningWithState>
);

const ReasoningWithState = ({
  children,
  isStreaming,
}: {
  children: React.ReactNode;
  isStreaming?: boolean;
}) => {
  const [isOpen, setIsOpen] = React.useState(Boolean(isStreaming));
  return (
    <ReasoningContext.Provider
      value={{
        isStreaming: Boolean(isStreaming),
        isOpen,
        setIsOpen,
        duration: undefined,
      }}
    >
      <div
        data-state={isOpen ? 'open' : 'closed'}
        data-streaming={isStreaming ? 'true' : 'false'}
        data-testid="reasoning-root"
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
};

export const ReasoningTrigger = ({
  children,
  onClick,
  ...props
}: React.ComponentProps<'button'>) => {
  const ctx = React.useContext(ReasoningContext);
  return (
    <button
      {...props}
      onClick={(event) => {
        ctx?.setIsOpen((prev) => !prev);
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
};
export const ReasoningContent = ({
  children,
  ...props
}: {
  children: string;
  [key: string]: unknown;
}) => {
  const ctx = React.useContext(ReasoningContext);
  return (
    <div data-state={ctx?.isOpen ? 'open' : 'closed'} {...props}>
      {children}
    </div>
  );
};

export const useReasoning = () => {
  const ctx = React.useContext(ReasoningContext);
  return (
    ctx ?? {
      isStreaming: false,
      isOpen: false,
      setIsOpen: () => {},
      duration: undefined,
    }
  );
};
