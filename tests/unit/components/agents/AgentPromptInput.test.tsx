/**
 * @jest-environment jsdom
 */
import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AgentPromptInput,
  AgentPromptInputHandle,
} from '../../../../src/renderer/components/agents/AgentPromptInput';

const chatAreaRef = { current: document.createElement('div') };

describe('AgentPromptInput', () => {
  /* Preconditions: component rendered with value
     Action: render AgentPromptInput
     Assertions: textarea with data-testid visible, value shown
     Requirements: agents.4.3, agents.4.5 */
  it('should render textarea with correct testid and value', () => {
    render(
      <AgentPromptInput
        value="Hello"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    const textarea = screen.getByTestId('auto-expanding-textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Hello');
  });

  /* Preconditions: component rendered
     Action: type in textarea
     Assertions: onChange called with new value
     Requirements: agents.4.3 */
  it('should call onChange when typing', () => {
    const onChange = jest.fn();
    render(
      <AgentPromptInput
        value=""
        onChange={onChange}
        onSubmit={jest.fn()}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
      target: { value: 'test' },
    });
    expect(onChange).toHaveBeenCalledWith('test');
  });

  /* Preconditions: component with non-empty value
     Action: press Enter (no Shift)
     Assertions: onSubmit called
     Requirements: agents.4.3, agents.4.4 */
  it('should call onSubmit on Enter without Shift', () => {
    const onSubmit = jest.fn();
    render(
      <AgentPromptInput
        value="Hello"
        onChange={jest.fn()}
        onSubmit={onSubmit}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: false,
    });
    expect(onSubmit).toHaveBeenCalled();
  });

  /* Preconditions: component with non-empty value
     Action: press Shift+Enter
     Assertions: onSubmit NOT called
     Requirements: agents.4.4 */
  it('should not call onSubmit on Shift+Enter', () => {
    const onSubmit = jest.fn();
    render(
      <AgentPromptInput
        value="Hello"
        onChange={jest.fn()}
        onSubmit={onSubmit}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: component with empty value
     Action: press Enter
     Assertions: onSubmit NOT called (empty message)
     Requirements: agents.4.3 */
  it('should not call onSubmit when value is empty', () => {
    const onSubmit = jest.fn();
    render(
      <AgentPromptInput
        value=""
        onChange={jest.fn()}
        onSubmit={onSubmit}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: false,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: component disabled
     Action: press Enter with value
     Assertions: onSubmit NOT called
     Requirements: agents.4.3 */
  it('should not call onSubmit when disabled', () => {
    const onSubmit = jest.fn();
    render(
      <AgentPromptInput
        value="Hello"
        onChange={jest.fn()}
        onSubmit={onSubmit}
        disabled={true}
        chatAreaRef={chatAreaRef}
      />
    );
    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: false,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: component rendered with ref
     Action: call ref.focus()
     Assertions: textarea receives focus
     Requirements: agents.4.7.1 */
  it('should expose focus via ref', () => {
    const ref = createRef<AgentPromptInputHandle>();
    render(
      <AgentPromptInput
        ref={ref}
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe('function');
    expect(typeof ref.current?.blur).toBe('function');
  });

  /* Preconditions: component rendered
     Action: check hint text
     Assertions: "Press Enter to send" hint visible
     Requirements: agents.4.3 */
  it('should show keyboard hint text', () => {
    render(
      <AgentPromptInput
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    expect(screen.getByText(/Press Enter to send/i)).toBeInTheDocument();
  });

  /* Preconditions: empty value
     Action: render send button
     Assertions: send button disabled when value empty
     Requirements: agents.4.3 */
  it('should disable send button when value is empty', () => {
    render(
      <AgentPromptInput
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        disabled={false}
        chatAreaRef={chatAreaRef}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
