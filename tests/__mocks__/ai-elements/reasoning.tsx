import React from 'react';

export const Reasoning = ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>;
export const ReasoningTrigger = ({ children }: React.ComponentProps<'button'>) => <button>{children}</button>;
export const ReasoningContent = ({ children }: { children: string }) => <div>{children}</div>;
