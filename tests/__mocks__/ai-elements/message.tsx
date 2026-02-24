import React from 'react';

export const Message = ({ children, className, ...props }: React.ComponentProps<'div'>) => (
  <div className={className} {...props}>
    {children}
  </div>
);
export const MessageContent = ({ children, ...props }: React.ComponentProps<'div'>) => (
  <div {...props}>{children}</div>
);
export const MessageResponse = ({ children }: { children?: React.ReactNode }) => (
  <div>{children}</div>
);
export const MessageActions = ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>;
export const MessageAction = ({ children }: React.ComponentProps<'button'>) => (
  <button>{children}</button>
);
export const MessageToolbar = ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>;
