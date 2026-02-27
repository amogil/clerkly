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
      event.currentTarget.reset();
      setText('');
    },
    [onSubmit, setText, text]
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
const DEFAULT_PROMPT_TEXTAREA_MAX_HEIGHT_PX = 160;

export const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  ({ className, style, value, onChange, onFocus, onInput, onPaste, onKeyDown, ...props }, ref) => {
    const { text, setText, submitFromTextarea } = usePromptInputContext();
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const resolvedMaxHeight = React.useMemo(() => {
      const maxHeight = style?.maxHeight;
      if (typeof maxHeight === 'number') return maxHeight;
      if (typeof maxHeight === 'string' && maxHeight.endsWith('px')) {
        const parsed = Number.parseFloat(maxHeight);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return DEFAULT_PROMPT_TEXTAREA_MAX_HEIGHT_PX;
    }, [style?.maxHeight]);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const resizeTextarea = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight);
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
      const borderTop = Number.parseFloat(computedStyle.borderTopWidth) || 0;
      const borderBottom = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
      const singleLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20;
      const minHeight = Math.ceil(
        singleLineHeight + paddingTop + paddingBottom + borderTop + borderBottom
      );

      textarea.style.height = 'auto';
      textarea.style.minHeight = `${minHeight}px`;
      const measuredHeight = textarea.scrollHeight > 0 ? textarea.scrollHeight : minHeight;
      const nextHeight = Math.min(Math.max(measuredHeight, minHeight), resolvedMaxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = measuredHeight > resolvedMaxHeight ? 'auto' : 'hidden';
    }, [resolvedMaxHeight]);

    React.useEffect(() => {
      if (typeof value === 'string') {
        setText(value);
      }
    }, [setText, value]);

    React.useLayoutEffect(() => {
      resizeTextarea();
    }, [resizeTextarea, text, value]);

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(event.target.value);
        onChange?.(event);
        resizeTextarea();
      },
      [onChange, resizeTextarea, setText]
    );

    const handleFocus = React.useCallback(
      (event: React.FocusEvent<HTMLTextAreaElement>) => {
        resizeTextarea();
        onFocus?.(event);
      },
      [onFocus, resizeTextarea]
    );

    const handleInput = React.useCallback(
      (event: React.InputEvent<HTMLTextAreaElement>) => {
        resizeTextarea();
        onInput?.(event);
      },
      [onInput, resizeTextarea]
    );

    const handlePaste = React.useCallback(
      (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        onPaste?.(event);
        window.requestAnimationFrame(() => {
          resizeTextarea();
        });
      },
      [onPaste, resizeTextarea]
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
        ref={setRefs}
        className={cn('min-h-0 flex-1 text-sm', className)}
        onChange={handleChange}
        onFocus={handleFocus}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={1}
        style={{
          ...style,
          maxHeight:
            style?.maxHeight === undefined
              ? `${DEFAULT_PROMPT_TEXTAREA_MAX_HEIGHT_PX}px`
              : style.maxHeight,
        }}
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
