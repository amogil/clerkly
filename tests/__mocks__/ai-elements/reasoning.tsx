import React from 'react';

export const Reasoning = ({
  children,
  isStreaming,
}: React.ComponentProps<'div'> & { isStreaming?: boolean }) => (
  <div data-streaming={isStreaming ? 'true' : 'false'} data-testid="reasoning-root">
    {children}
  </div>
);
export const ReasoningTrigger = ({ children, ...props }: React.ComponentProps<'button'>) => (
  <button {...props}>{children}</button>
);
export const ReasoningContent = ({
  children,
  ...props
}: {
  children: string;
  [key: string]: unknown;
}) => <div {...props}>{children}</div>;

export const useReasoning = () => ({
  isStreaming: false,
  isOpen: true,
  setIsOpen: () => {},
  duration: undefined,
});
