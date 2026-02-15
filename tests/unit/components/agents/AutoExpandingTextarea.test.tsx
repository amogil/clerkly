/**
 * @jest-environment jsdom
 */

import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AutoExpandingTextarea } from '../../../../src/renderer/components/agents/AutoExpandingTextarea';

// Requirements: agents.4.5, agents.4.6, agents.4.7

describe('AutoExpandingTextarea', () => {
  let mockOnChange: jest.Mock;
  let mockOnSubmit: jest.Mock;

  beforeEach(() => {
    mockOnChange = jest.fn();
    mockOnSubmit = jest.fn();
  });

  const TestWrapper = ({
    value = '',
    disabled = false,
  }: {
    value?: string;
    disabled?: boolean;
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    return (
      <div>
        <div ref={ref} style={{ height: '400px' }} data-testid="chat-area" />
        <AutoExpandingTextarea
          value={value}
          onChange={mockOnChange}
          onSubmit={mockOnSubmit}
          chatAreaRef={ref}
          disabled={disabled}
        />
      </div>
    );
  };

  /* Preconditions: Component renders with empty value
     Action: Render component
     Assertions: Textarea is visible with placeholder
     Requirements: agents.4.1 */
  it('should render with placeholder', () => {
    render(<TestWrapper />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder', 'Ask, reply, or give command...');
  });

  /* Preconditions: Component renders with custom placeholder
     Action: Render component with custom placeholder
     Assertions: Custom placeholder is displayed
     Requirements: agents.4.1 */
  it('should render with custom placeholder', () => {
    const TestWrapperWithPlaceholder = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={ref} style={{ height: '400px' }} />
          <AutoExpandingTextarea
            value=""
            onChange={mockOnChange}
            onSubmit={mockOnSubmit}
            chatAreaRef={ref}
            placeholder="Custom placeholder"
          />
        </div>
      );
    };

    render(<TestWrapperWithPlaceholder />);
    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toHaveAttribute('placeholder', 'Custom placeholder');
  });

  /* Preconditions: Component renders with empty value
     Action: Type text into textarea
     Assertions: onChange is called with new value
     Requirements: agents.4.1 */
  it('should call onChange when text is typed', () => {
    render(<TestWrapper />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    expect(mockOnChange).toHaveBeenCalledWith('Hello');
  });

  /* Preconditions: Component renders with text value
     Action: Press Enter key without Shift
     Assertions: onSubmit is called, default prevented
     Requirements: agents.4.3 */
  it('should submit on Enter key without Shift', () => {
    render(<TestWrapper value="Hello" />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockOnSubmit).toHaveBeenCalled();
  });

  /* Preconditions: Component renders with empty value
     Action: Press Enter key without Shift
     Assertions: onSubmit is NOT called (empty input)
     Requirements: agents.4.2, agents.4.3 */
  it('should not submit on Enter if value is empty', () => {
    render(<TestWrapper value="" />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: Component renders with whitespace-only value
     Action: Press Enter key without Shift
     Assertions: onSubmit is NOT called (whitespace only)
     Requirements: agents.4.2, agents.4.3 */
  it('should not submit on Enter if value is only whitespace', () => {
    render(<TestWrapper value="   " />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: Component renders with text value
     Action: Press Shift+Enter
     Assertions: onSubmit is NOT called (new line should be added)
     Requirements: agents.4.4 */
  it('should not submit on Shift+Enter', () => {
    render(<TestWrapper value="Hello" />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: Component is disabled
     Action: Press Enter key
     Assertions: onSubmit is NOT called
     Requirements: agents.4.2 */
  it('should not submit when disabled', () => {
    render(<TestWrapper value="Hello" disabled={true} />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: Component renders with disabled prop
     Action: Render component
     Assertions: Textarea is disabled
     Requirements: agents.4.2 */
  it('should be disabled when disabled prop is true', () => {
    render(<TestWrapper disabled={true} />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toBeDisabled();
  });

  /* Preconditions: Component renders with short text
     Action: Render component
     Assertions: Component renders and has correct structure
     Requirements: agents.4.5 */
  it('should render textarea with resize-none class', () => {
    render(<TestWrapper value="Short text" />);

    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;
    expect(textarea).toHaveClass('resize-none');
    expect(textarea).toHaveAttribute('rows', '1');
  });

  /* Preconditions: Chat area ref is provided
     Action: Render component
     Assertions: Component accepts chatAreaRef prop
     Requirements: agents.4.6 */
  it('should accept chatAreaRef prop', () => {
    render(<TestWrapper value="Test" />);

    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toBeInTheDocument();
    // Component should render without errors when chatAreaRef is provided
  });

  /* Preconditions: Chat area has specific height
     Action: Add text that exceeds 50% of chat area height
     Assertions: Component structure is correct for height limiting
     Requirements: agents.4.6 */
  it('should have correct structure for height limiting', () => {
    const TestWrapperWithHeight = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={ref} style={{ height: '400px' }} data-testid="chat-area" />
          <AutoExpandingTextarea
            value={'Line\n'.repeat(10)}
            onChange={mockOnChange}
            onSubmit={mockOnSubmit}
            chatAreaRef={ref}
          />
        </div>
      );
    };

    render(<TestWrapperWithHeight />);

    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;
    const chatArea = screen.getByTestId('chat-area') as HTMLDivElement;

    expect(textarea).toBeInTheDocument();
    expect(chatArea).toBeInTheDocument();
    // Component should have access to chat area for height calculations
  });

  /* Preconditions: Textarea content exceeds max height
     Action: Render with long text
     Assertions: Component renders with long text
     Requirements: agents.4.7 */
  it('should render with long text content', () => {
    const TestWrapperWithLongText = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={ref} style={{ height: '400px' }} data-testid="chat-area" />
          <AutoExpandingTextarea
            value={'Line\n'.repeat(50)}
            onChange={mockOnChange}
            onSubmit={mockOnSubmit}
            chatAreaRef={ref}
          />
        </div>
      );
    };

    render(<TestWrapperWithLongText />);

    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toContain('Line');
    // Overflow behavior will be tested in functional tests with real DOM
  });

  /* Preconditions: Textarea content is short
     Action: Render with short text
     Assertions: Component renders correctly
     Requirements: agents.4.7 */
  it('should render with short text content', () => {
    render(<TestWrapper value="Short text" />);

    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Short text');
  });

  /* Preconditions: Component renders
     Action: Render with custom className
     Assertions: Custom className is applied
     Requirements: agents.4.1 */
  it('should apply custom className', () => {
    const TestWrapperWithClass = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={ref} style={{ height: '400px' }} />
          <AutoExpandingTextarea
            value=""
            onChange={mockOnChange}
            onSubmit={mockOnSubmit}
            chatAreaRef={ref}
            className="custom-class"
          />
        </div>
      );
    };

    render(<TestWrapperWithClass />);
    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toHaveClass('custom-class');
  });
});
