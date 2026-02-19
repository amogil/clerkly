// Requirements: agents.7.7

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownMessageProps {
  content: string;
  format?: 'markdown' | 'text';
}

export function MarkdownMessage({ content, format = 'text' }: MarkdownMessageProps) {
  if (format === 'markdown') {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{content}</p>;
}
