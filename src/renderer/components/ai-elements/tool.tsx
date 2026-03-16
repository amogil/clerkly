'use client';

import React from 'react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { Collapsible, CollapsibleContent } from '../ui/collapsible';
import { cn } from '@/lib/utils';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, defaultOpen = true, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      'w-full min-w-0 max-w-full rounded-xl border border-border/70 bg-muted/20 p-3 text-sm',
      className
    )}
    defaultOpen={defaultOpen}
    {...props}
  />
);

export type ToolHeaderProps = HTMLAttributes<HTMLDivElement>;

export const ToolHeader = ({ className, ...props }: ToolHeaderProps) => (
  <div className={cn('mb-2 flex items-center justify-between gap-3', className)} {...props} />
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent className={cn('grid min-w-0 gap-2', className)} {...props} />
);

export type ToolInputProps = ComponentProps<'pre'>;

export const ToolInput = ({ className, ...props }: ToolInputProps) => (
  <pre
    className={cn(
      'w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md border border-border/60 bg-background/70 p-2 text-xs text-foreground',
      className
    )}
    {...props}
  />
);

export type ToolOutputProps = ComponentProps<'pre'>;

export const ToolOutput = ({ className, ...props }: ToolOutputProps) => (
  <pre
    className={cn(
      'w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md border border-border/60 bg-background/70 p-2 text-xs text-foreground',
      className
    )}
    {...props}
  />
);
