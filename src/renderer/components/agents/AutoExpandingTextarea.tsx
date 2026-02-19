import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// Requirements: agents.4.5, agents.4.6, agents.4.7
export interface AutoExpandingTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  chatAreaRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export interface AutoExpandingTextareaHandle {
  focus: () => void;
  blur: () => void;
}

/**
 * Auto-expanding textarea component for agent chat input
 * Requirements: agents.4.5, agents.4.6, agents.4.7
 */
export const AutoExpandingTextarea = forwardRef<
  AutoExpandingTextareaHandle,
  AutoExpandingTextareaProps
>(({ value, onChange, onSubmit, placeholder, disabled, chatAreaRef, className = '' }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose focus/blur methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
  }));

  // Requirements: agents.4.5, agents.4.6, agents.4.7
  // Auto-expand textarea height based on content, max 50% of chat area
  useEffect(() => {
    const textarea = textareaRef.current;
    const chatArea = chatAreaRef.current;
    if (!textarea || !chatArea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';

    // Calculate max height (50% of chat area)
    const maxHeight = chatArea.offsetHeight * 0.5;

    // Set height to scrollHeight, capped at maxHeight
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Show scrollbar if content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, chatAreaRef]);

  // Requirements: agents.4.3, agents.4.4
  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift = submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
    // Shift+Enter = new line (default behavior, no action needed)
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || 'Ask, reply, or give command...'}
      disabled={disabled}
      className={`resize-none ${className}`}
      rows={1}
      data-testid="auto-expanding-textarea"
    />
  );
});

AutoExpandingTextarea.displayName = 'AutoExpandingTextarea';
