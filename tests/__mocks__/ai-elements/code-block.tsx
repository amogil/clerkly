import React from 'react';

export function CodeBlock({
  code,
  language,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: string;
}) {
  return (
    <div data-testid="mock-code-block" data-language={language} className={className} {...props}>
      {children}
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CodeBlockContainer(
  props: React.HTMLAttributes<HTMLDivElement> & { language: string }
) {
  const { language, ...rest } = props;
  return <div data-testid="mock-code-block" data-language={language} {...rest} />;
}

export function CodeBlockHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="mock-code-block-header" {...props} />;
}

export function CodeBlockTitle(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-testid="mock-code-block-title" {...props} />;
}

export function CodeBlockFilename(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-testid="mock-code-block-filename" {...props} />;
}
