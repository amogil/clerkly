import React from 'react';
import { Send } from 'lucide-react';
import { AutoExpandingTextarea, AutoExpandingTextareaHandle } from './AutoExpandingTextarea';

// Requirements: agents.4.3, agents.4.7

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  textareaRef: React.RefObject<AutoExpandingTextareaHandle>;
  chatAreaRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  textareaRef,
  chatAreaRef,
}: ChatInputProps) {
  return (
    <div className="p-4 border-t border-border bg-card flex-shrink-0">
      <div className="flex gap-2 items-end">
        <AutoExpandingTextarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          chatAreaRef={chatAreaRef}
          disabled={disabled}
          className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
