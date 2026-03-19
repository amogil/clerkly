import React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../src/renderer/components/ui/collapsible';

type ToolState =
  | 'approval-requested'
  | 'approval-responded'
  | 'input-available'
  | 'input-streaming'
  | 'output-available'
  | 'output-denied'
  | 'output-error';

export const Tool = ({ children, ...props }: React.ComponentProps<typeof Collapsible>) => (
  <Collapsible {...props}>{children}</Collapsible>
);

export const ToolHeader = ({
  children,
  title,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  title?: string;
  type?: string;
  state?: ToolState;
  toolName?: string;
}) => <CollapsibleTrigger {...props}>{children ?? title ?? null}</CollapsibleTrigger>;

export const ToolContent = ({
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) => (
  <CollapsibleContent {...props}>{children}</CollapsibleContent>
);

export const ToolInput = ({
  children,
  input,
  ...props
}: React.ComponentProps<'div'> & { input: unknown }) => (
  <div {...props}>{children ?? JSON.stringify(input, null, 2)}</div>
);

export const ToolOutput = ({
  children,
  output,
  errorText,
  ...props
}: React.ComponentProps<'div'> & { output: unknown; errorText: string | undefined }) => (
  <div {...props}>
    {children ??
      (errorText
        ? errorText
        : typeof output === 'string'
          ? output
          : JSON.stringify(output ?? {}, null, 2))}
  </div>
);
