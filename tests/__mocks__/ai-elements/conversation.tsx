import React from 'react';

export const Conversation = ({ children, className, ...props }: React.ComponentProps<'div'>) => (
  <div className={className} data-testid="conversation" {...props}>
    {children}
  </div>
);

export const ConversationContent = ({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div className={className} {...props}>
    {children}
  </div>
);

export const ConversationScrollButton = () => null;
export const ConversationEmptyState = ({ children }: React.ComponentProps<'div'>) => (
  <div>{children}</div>
);
