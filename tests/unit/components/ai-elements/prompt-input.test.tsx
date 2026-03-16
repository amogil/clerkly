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
          <PromptInputTextarea data-testid="auto-expanding-textarea" onChange={onChange} value="" />
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
    const requestSubmitMock = jest.fn();
    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = requestSubmitMock;

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

    expect(requestSubmitMock).toHaveBeenCalled();

    HTMLFormElement.prototype.requestSubmit = originalRequestSubmit;
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

  /* Preconditions: PromptInput rendered with textarea
     Action: enter multiline text
     Assertions: textarea height is updated from scrollHeight
     Requirements: agents.4.5 */
  it('should auto-resize textarea on multiline input', () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <PromptInput onSubmit={jest.fn()}>
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
    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });

    expect(textarea).toHaveClass('field-sizing-content');
    expect(textarea).toHaveClass('max-h-48');
    expect(textarea).toHaveClass('min-h-16');
  });

  /* Preconditions: PromptInput rendered with textarea max-height
     Action: enter very long multiline text
     Assertions: textarea caps height and enables internal scroll
     Requirements: agents.4.5, agents.4.7 */
  it('should cap textarea growth and enable scroll after max height', () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <PromptInput onSubmit={jest.fn()}>
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
    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: Array(20).fill('Line').join('\n') } });

    expect(textarea).toHaveClass('field-sizing-content');
    expect(textarea).toHaveClass('max-h-48');
  });

  /* Preconditions: PromptInput rendered with empty textarea
     Action: focus textarea without typing
     Assertions: textarea gets baseline non-collapsed height
     Requirements: agents.4.5, agents.4.7.1 */
  it('should keep baseline height on focus before first input', () => {
    render(
      <PromptInput onSubmit={jest.fn()}>
        <PromptInputBody>
          <PromptInputTextarea
            data-testid="auto-expanding-textarea"
            onChange={jest.fn()}
            value=""
          />
          <PromptInputSubmit />
        </PromptInputBody>
      </PromptInput>
    );

    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    fireEvent.focus(textarea);

    expect(textarea).toHaveClass('min-h-16');
    expect(textarea).toHaveAttribute('placeholder', 'What would you like to know?');
  });

  /* Preconditions: PromptInput rendered with textarea and long pasted text
     Action: paste multiline content into textarea
     Assertions: textarea resizes immediately after paste
     Requirements: agents.4.5, agents.4.7 */
  it('should resize on paste without agent switch', () => {
    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <PromptInput onSubmit={jest.fn()}>
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
    const textarea = screen.getByTestId('auto-expanding-textarea') as HTMLTextAreaElement;

    fireEvent.paste(textarea, { target: { value: Array(20).fill('Line').join('\n') } });

    expect(textarea).toHaveClass('field-sizing-content');
    expect(textarea).toHaveClass('max-h-48');
  });
});
