'use client';

import React from 'react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ToolProps = HTMLAttributes<HTMLDivElement>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <div
    className={cn('w-full rounded-xl border border-border/70 bg-muted/20 p-3 text-sm', className)}
    {...props}
  />
);

export type ToolHeaderProps = HTMLAttributes<HTMLDivElement>;

export const ToolHeader = ({ className, ...props }: ToolHeaderProps) => (
  <div className={cn('mb-2 flex items-center justify-between gap-3', className)} {...props} />
);

export type ToolContentProps = HTMLAttributes<HTMLDivElement>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <div className={cn('grid gap-2', className)} {...props} />
);

export type ToolInputProps = ComponentProps<'pre'>;

export const ToolInput = ({ className, ...props }: ToolInputProps) => (
  <pre
    className={cn(
      'overflow-auto rounded-md border border-border/60 bg-background/70 p-2 text-xs text-foreground',
      className
    )}
    {...props}
  />
);

export type ToolOutputProps = ComponentProps<'pre'>;

export const ToolOutput = ({ className, ...props }: ToolOutputProps) => (
  <pre
    className={cn(
      'overflow-auto rounded-md border border-border/60 bg-background/70 p-2 text-xs text-foreground',
      className
    )}
    {...props}
  />
);
