import React from 'react';

// Mock ReactMarkdown for tests
const ReactMarkdown = ({ children }: { children: string }) => {
  return <div data-testid="react-markdown">{children}</div>;
};

export default ReactMarkdown;
