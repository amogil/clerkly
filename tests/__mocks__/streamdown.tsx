import React from 'react';

interface StreamdownProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function Streamdown({ children, ...props }: StreamdownProps) {
  return <div {...props}>{children}</div>;
}
