import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Send } from 'lucide-react';

// Requirements: agents.4.3, agents.4.5, agents.4.6, agents.4.7

export interface AgentPromptInputHandle {
  focus: () => void;
  blur: () => void;
}

interface AgentPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  chatAreaRef: React.RefObject<HTMLDivElement | null>;
}

export const AgentPromptInput = forwardRef<AgentPromptInputHandle, AgentPromptInputProps>(
  ({ value, onChange, onSubmit, disabled, chatAreaRef }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose focus/blur to parent for autofocus on agent switch (agents.4.7.1)
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
    }));

    // Requirements: agents.4.5, agents.4.6 — auto-expand up to 50% of chat area height
    useEffect(() => {
      const textarea = textareaRef.current;
      const chatArea = chatAreaRef.current;
      if (!textarea || !chatArea) return;

      textarea.style.height = 'auto';
      const maxHeight = chatArea.offsetHeight * 0.5;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [value, chatAreaRef]);

    // Requirements: agents.4.3, agents.4.4 — Enter to submit, Shift+Enter for newline
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled) onSubmit();
      }
    };

    return (
      <div className="p-4 border-t border-border bg-card flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask, reply, or give command..."
            disabled={disabled}
            rows={1}
            data-testid="auto-expanding-textarea"
            className="flex-1 resize-none px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
);

AgentPromptInput.displayName = 'AgentPromptInput';
