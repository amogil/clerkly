/**
 * @jest-environment jsdom
 */
// Requirements: agents.4.3, agents.4.4, agents.4.5, agents.4.7.1
import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../../../../src/renderer/components/ai-elements/prompt-input';

describe('PromptInput', () => {
  /* Preconditions: PromptInput rendered with controlled value
     Action: type in textarea
     Assertions: onChange called with new value
     Requirements: agents.4.3 */
  it('should call onChange when typing', () => {
    const onChange = jest.fn();

    render(
      <PromptInput onSubmit={jest.fn()}>
        <PromptInputBody>
          <PromptInputTextarea
            data-testid="auto-expanding-textarea"
            onChange={onChange}
            value=""
          />
          <PromptInputSubmit />
        </PromptInputBody>
      </PromptInput>
    );

    fireEvent.change(screen.getByTestId('auto-expanding-textarea'), {
      target: { value: 'test' },
    });

    expect(onChange).toHaveBeenCalled();
  });

  /* Preconditions: PromptInput rendered with non-empty text
     Action: press Enter without Shift
     Assertions: onSubmit receives entered text
     Requirements: agents.4.3 */
  it('should submit on Enter without Shift', () => {
    const onSubmit = jest.fn();

    const Wrapper = () => {
      const [value, setValue] = React.useState('Hello');
      return (
        <PromptInput onSubmit={onSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              data-testid="auto-expanding-textarea"
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setValue(event.target.value)
              }
              value={value}
            />
            <PromptInputSubmit />
          </PromptInputBody>
        </PromptInput>
      );
    };

    render(<Wrapper />);
    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: false,
    });

    expect(onSubmit).toHaveBeenCalledWith(
      { text: 'Hello' },
      expect.objectContaining({ type: 'submit' })
    );
  });

  /* Preconditions: PromptInput rendered with non-empty text
     Action: press Shift+Enter
     Assertions: onSubmit NOT called
     Requirements: agents.4.4 */
  it('should not submit on Shift+Enter', () => {
    const onSubmit = jest.fn();

    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            data-testid="auto-expanding-textarea"
            onChange={jest.fn()}
            value="Hello"
          />
          <PromptInputSubmit />
        </PromptInputBody>
      </PromptInput>
    );

    fireEvent.keyDown(screen.getByTestId('auto-expanding-textarea'), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  /* Preconditions: PromptInput rendered with footer
     Action: render component tree
     Assertions: footer content is visible
     Requirements: agents.4.3 */
  it('should render footer content', () => {
    render(
      <PromptInput onSubmit={jest.fn()}>
        <PromptInputBody>
          <PromptInputTextarea onChange={jest.fn()} value="" />
          <PromptInputSubmit />
        </PromptInputBody>
        <PromptInputFooter>
          <p>Press Enter to send, Shift+Enter for new line</p>
        </PromptInputFooter>
      </PromptInput>
    );

    expect(screen.getByText(/Press Enter to send/i)).toBeInTheDocument();
  });

  /* Preconditions: PromptInputTextarea rendered with ref
     Action: inspect ref target
     Assertions: ref points to textarea element
     Requirements: agents.4.7.1 */
  it('should forward textarea ref', () => {
    const ref = createRef<HTMLTextAreaElement>();

    render(
      <PromptInput onSubmit={jest.fn()}>
        <PromptInputBody>
          <PromptInputTextarea ref={ref} onChange={jest.fn()} value="" />
          <PromptInputSubmit />
        </PromptInputBody>
      </PromptInput>
    );

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});
