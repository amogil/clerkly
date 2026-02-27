'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

export interface PromptInputMessage {
  text?: string;
  files?: File[];
}

interface PromptInputContextValue {
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  submitFromTextarea: () => void;
}

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null);

function usePromptInputContext(): PromptInputContextValue {
  const context = React.useContext(PromptInputContext);
  if (!context) {
    throw new Error('PromptInput components must be used within PromptInput');
  }
  return context;
}

export type PromptInputProps = Omit<React.ComponentProps<'form'>, 'onSubmit'> & {
  onSubmit?: (message: PromptInputMessage, event: React.FormEvent<HTMLFormElement>) => void;
};

// Requirements: agents.4.3, agents.4.4
export function PromptInput({ className, onSubmit, children, ...props }: PromptInputProps) {
  const [text, setText] = React.useState('');
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit?.({ text }, event);
    },
    [onSubmit, text]
  );

  const submitFromTextarea = React.useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <PromptInputContext.Provider value={{ text, setText, submitFromTextarea }}>
      <form
        ref={formRef}
        className={cn('border-t border-border bg-card p-4', className)}
        onSubmit={handleSubmit}
        {...props}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  );
}

export type PromptInputBodyProps = React.ComponentProps<'div'>;

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn('flex items-end gap-2', className)} {...props} />;
}

export type PromptInputFooterProps = React.ComponentProps<'div'>;

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return <div className={cn('mt-1.5 flex items-center justify-between', className)} {...props} />;
}

export type PromptInputTextareaProps = React.ComponentProps<typeof Textarea>;

export const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  ({ className, value, onChange, onKeyDown, ...props }, ref) => {
    const { setText, submitFromTextarea } = usePromptInputContext();

    React.useEffect(() => {
      if (typeof value === 'string') {
        setText(value);
      }
    }, [setText, value]);

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(event.target.value);
        onChange?.(event);
      },
      [onChange, setText]
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submitFromTextarea();
          return;
        }
        onKeyDown?.(event);
      },
      [onKeyDown, submitFromTextarea]
    );

    return (
      <Textarea
        ref={ref}
        className={cn('min-h-0 flex-1 text-sm', className)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        value={value}
        {...props}
      />
    );
  }
);

PromptInputTextarea.displayName = 'PromptInputTextarea';

export type PromptInputSubmitProps = Omit<React.ComponentProps<typeof Button>, 'type'> & {
  status?: 'submitted' | 'streaming' | 'error' | 'ready';
};

export function PromptInputSubmit({
  className,
  children,
  status,
  ...props
}: PromptInputSubmitProps) {
  return (
    <Button className={cn('h-10 w-10 shrink-0 p-0', className)} type="submit" {...props}>
      {children ?? <Send className="h-4 w-4" />}
      <span className="sr-only">
        {status === 'streaming' ? 'Streaming response' : 'Send message'}
      </span>
    </Button>
  );
}
