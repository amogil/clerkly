/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AgentMessage,
  buildJavaScriptFence,
} from '../../../../src/renderer/components/agents/AgentMessage';
import type { MessageSnapshot } from '../../../../src/shared/events/types';

const mockRetryLast = jest.fn().mockResolvedValue({ success: true });
(window as any).api = {
  messages: {
    retryLast: mockRetryLast,
  },
};

const baseMessage = (overrides: Partial<MessageSnapshot> = {}): MessageSnapshot =>
  ({
    id: 1,
    agentId: 'agent1',
    kind: 'user',
    timestamp: new Date('2024-01-01T00:00:00Z').getTime(),
    hidden: false,
    done: true,
    payload: { data: { text: 'Hello' } },
    replyToMessageId: null,
    ...overrides,
  }) as MessageSnapshot;

describe('buildJavaScriptFence', () => {
  /* Preconditions: code contains triple backticks
     Action: build fenced markdown for code_exec input
     Assertions: fence length is expanded beyond content backtick run
     Requirements: agents.7.4.6.8 */
  it('uses a fence longer than any backtick run in code', () => {
    const fenced = buildJavaScriptFence("console.log('a');\n```in-code```");
    expect(fenced.startsWith('````javascript\n')).toBe(true);
    expect(fenced.endsWith('\n````')).toBe(true);
    expect(fenced).toContain('```in-code```');
  });
});

describe('AgentMessage — user', () => {
  /* Preconditions: kind:user message
     Action: render AgentMessage
     Assertions: message-user testid visible, text rendered
     Requirements: agents.4.9, agents.4.22 */
  it('should render user message text', () => {
    render(
      <AgentMessage
        message={baseMessage({ kind: 'user', payload: { data: { text: 'Hello world' } } })}
      />
    );
    expect(screen.getByTestId('message-user')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  /* Preconditions: kind:user message with empty text
     Action: render AgentMessage
     Assertions: renders without crash, empty string shown
     Requirements: agents.4.9 */
  it('should render empty user message without crash', () => {
    render(<AgentMessage message={baseMessage({ kind: 'user', payload: { data: {} } })} />);
    expect(screen.getByTestId('message-user')).toBeInTheDocument();
  });
});

describe('AgentMessage — tool_call', () => {
  /* Preconditions: persisted kind:tool_call with done=false
     Action: render AgentMessage
     Assertions: tool block renders header and input, output is hidden while in-progress
     Requirements: llm-integration.11.3, llm-integration.11.6 */
  it('should render in-progress tool_call without output block', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: false,
          payload: {
            data: {
              callId: 'call-1',
              toolName: 'search_docs',
              arguments: { query: 'streaming' },
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-tool-call')).toBeInTheDocument();
    expect(screen.getByText('search_docs')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('message-tool-call-header'));
    expect(screen.getByTestId('message-tool-call-input')).toBeInTheDocument();
    expect(screen.queryByTestId('message-tool-call-output')).not.toBeInTheDocument();
  });

  /* Preconditions: persisted kind:tool_call with done=true and output
     Action: render AgentMessage
     Assertions: tool output is rendered
     Requirements: llm-integration.11.2, llm-integration.11.3 */
  it('should render completed tool_call with output block', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-1',
              toolName: 'search_docs',
              arguments: { query: 'streaming' },
              output: { status: 'success', content: 'result' },
            },
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('message-tool-call-header'));

    const output = screen.getByTestId('message-tool-call-output');
    expect(output).toBeInTheDocument();
    expect(output).toHaveTextContent('"content": "result"');
  });

  /* Preconditions: persisted kind:tool_call for code_exec with status/stdout/stderr
     Action: render AgentMessage, verify default collapsed state, expand by toggle, collapse, then reopen
     Assertions: dedicated code_exec block renders Code header with icon/status, starts collapsed with centered header spacing, deactivates hidden content when closed, and reopens successfully
     Requirements: agents.7.4.5, agents.7.4.6, agents.7.4.6.9, agents.7.4.6.9.1, agents.7.4.7 */
  it('should render code_exec tool_call block with Code header, icon, status, and streams', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-code',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Print ok to stdout',
                code: "console.log('ok')",
              },
              output: {
                status: 'success',
                stdout: 'ok\\n',
                stderr: 'warn\\n',
                stdout_truncated: false,
                stderr_truncated: false,
              },
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-code-exec-block')).toBeInTheDocument();
    expect(screen.getByTestId('message-code-exec-block')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-block')).toHaveClass('min-w-0');
    expect(screen.getByTestId('message-code-exec-block')).toHaveClass('max-w-full');
    expect(screen.getByTestId('message-code-exec-block')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('message-code-exec-icon')).toBeInTheDocument();
    expect(screen.getByTestId('message-code-exec-title')).toHaveTextContent('Print ok to stdout');
    expect(screen.getByTestId('message-code-exec-status')).toHaveTextContent('success');
    expect(screen.getByTestId('message-code-exec-status')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-status-icon')).toBeInTheDocument();
    expect(screen.getByTestId('message-code-exec-status-icon')).toHaveClass('text-emerald-600');
    expect(screen.getByTestId('message-code-exec-header')).toHaveClass('mb-0');
    expect(screen.getByTestId('message-code-exec-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-stdout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-stderr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-error')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('message-code-exec-toggle'));

    expect(screen.getByTestId('message-code-exec-header')).toHaveClass('mb-2');
    expect(screen.getByTestId('message-code-exec-content')).toHaveClass('min-w-0');
    expect(screen.getByTestId('message-code-exec-content')).toHaveClass('max-w-full');
    expect(screen.getByTestId('message-code-exec-content')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('message-code-exec-content')).toHaveClass(
      'data-[state=closed]:pointer-events-none'
    );
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-code-exec-input')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-input')).toHaveClass(
      'message-code-exec-text-section'
    );
    expect(screen.getByTestId('message-code-exec-stdout')).toHaveTextContent('ok');
    expect(screen.getByTestId('message-code-exec-stdout')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-stdout')).toHaveClass(
      'message-code-exec-text-section'
    );
    expect(screen.getByTestId('message-code-exec-stderr')).toHaveTextContent('warn');
    expect(screen.getByTestId('message-code-exec-stderr')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-stderr')).toHaveClass(
      'message-code-exec-text-section'
    );

    fireEvent.click(screen.getByTestId('message-code-exec-toggle'));

    expect(screen.queryByTestId('message-code-exec-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-stdout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-stderr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-code-exec-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-code-exec-header')).toHaveClass('mb-0');

    fireEvent.click(screen.getByTestId('message-code-exec-toggle'));

    expect(screen.getByTestId('message-code-exec-input')).toHaveTextContent("console.log('ok')");
    expect(screen.getByTestId('message-code-exec-stdout')).toHaveTextContent('ok');
    expect(screen.getByTestId('message-code-exec-stderr')).toHaveTextContent('warn');
  });

  /* Preconditions: persisted kind:tool_call for code_exec with terminal error payload
     Action: render AgentMessage, then expand by toggle
     Assertions: renderer shows separate code_exec error section from structured output.error
     Requirements: agents.7.4.6, agents.7.4.6.5.1, agents.7.4.6.5.2, agents.7.4.7, agents.7.4.9 */
  it('should render separate code_exec error section from structured output.error', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-code-error',
              toolName: 'code_exec',
              arguments: {
                task_summary: 'Attempt forbidden request',
                code: "window.open('https://example.com')",
              },
              output: {
                status: 'error',
                stdout: '',
                stderr: 'console.error fallback\\n',
                stdout_truncated: false,
                stderr_truncated: false,
                error: {
                  code: 'policy_denied',
                  message: 'Tool is not allowed in sandbox allowlist.',
                },
              },
            },
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('message-code-exec-toggle'));

    expect(screen.getByTestId('message-code-exec-status')).toHaveTextContent('error');
    expect(screen.getByTestId('message-code-exec-status-icon')).toHaveClass('text-red-600');
    expect(screen.getByTestId('message-code-exec-stderr')).toHaveTextContent(
      'console.error fallback'
    );
    expect(screen.getByTestId('message-code-exec-error')).toHaveTextContent(
      'policy_denied: Tool is not allowed in sandbox allowlist.'
    );
    expect(screen.getByTestId('message-code-exec-error')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('message-code-exec-error')).toHaveClass(
      'message-code-exec-text-section'
    );
  });

  /* Preconditions: persisted historical kind:tool_call for code_exec without task_summary
     Action: render AgentMessage
     Assertions: renderer falls back to "Code" title for backward compatibility
     Requirements: agents.7.4.6.3, agents.7.4.6.3.1 */
  it('should render fallback Code title for historical code_exec payload without task_summary', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-code-legacy',
              toolName: 'code_exec',
              arguments: {
                code: "console.log('legacy')",
              },
              output: {
                status: 'success',
                stdout: 'legacy\\n',
                stderr: '',
                stdout_truncated: false,
                stderr_truncated: false,
              },
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-code-exec-title')).toHaveTextContent('Code');
  });

  /* Preconditions: persisted historical tool_call payloads contain auto-title metadata comments in visible tool text fields
     Action: render AgentMessage for code_exec header and final_answer checklist
     Assertions: renderer strips metadata comments from persisted tool text before display
     Requirements: agents.7.4.2.2.1, agents.7.4.6.3, agents.14.5 */
  it('should strip auto-title metadata comments from persisted tool payload text', () => {
    const codeExecMessage = baseMessage({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-code-title-meta-render',
          toolName: 'code_exec',
          arguments: {
            task_summary:
              'Attempt <!-- clerkly:title-meta: {"title":"Hidden","rename_need_score":90} --> request',
          },
          output: {
            status: 'error',
            stdout: 'stdout\n',
            stderr: 'stderr\n',
            error: {
              code: 'sandbox_runtime_error',
              message:
                'Visible <!-- clerkly:title-meta: {"title":"Hidden","rename_need_score":90} --> error',
            },
            stdout_truncated: false,
            stderr_truncated: false,
          },
        },
      },
    });

    const finalAnswerMessage = baseMessage({
      kind: 'tool_call',
      done: true,
      payload: {
        data: {
          callId: 'call-final-title-meta-render',
          toolName: 'final_answer',
          arguments: {
            summary_points: [
              'Visible <!-- clerkly:title-meta: {"title":"Hidden","rename_need_score":90} --> point',
              '<!-- clerkly:title-meta: {"title":"Hidden","rename_need_score":90} -->',
            ],
          },
        },
      },
    });

    const { rerender } = render(<AgentMessage message={codeExecMessage} />);

    expect(screen.getByTestId('message-code-exec-title')).toHaveTextContent('Attempt request');
    fireEvent.click(screen.getByTestId('message-code-exec-toggle'));
    expect(screen.getByTestId('message-code-exec-error')).toHaveTextContent(
      'sandbox_runtime_error: Visible error'
    );
    expect(screen.queryByText(/clerkly:title-meta:/)).not.toBeInTheDocument();

    rerender(<AgentMessage message={finalAnswerMessage} />);

    expect(screen.getAllByTestId('message-final-answer-item')).toHaveLength(1);
    expect(screen.getByTestId('message-final-answer-summary')).toHaveTextContent(/Visible\s+point/);
    expect(screen.queryByText(/clerkly:title-meta:/)).not.toBeInTheDocument();
  });

  /* Preconditions: persisted kind:tool_call for final_answer with summary_points
     Action: render AgentMessage
     Assertions: renders Final Answer checklist items without title/header
     Requirements: agents.7.4.1, agents.7.4.2, agents.7.4.2.4, llm-integration.9.7 */
  it('should render final_answer as Final Answer block with summary list', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-final',
              toolName: 'final_answer',
              arguments: {
                summary_points: ['Point 1', 'Point 2'],
              },
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-final-answer-block')).toBeInTheDocument();
    expect(screen.getByTestId('message-final-answer-summary')).toBeInTheDocument();
    expect(screen.getAllByTestId('message-final-answer-item')).toHaveLength(2);
    expect(screen.getByText('Point 1')).toBeInTheDocument();
    expect(screen.getAllByTestId('message-final-answer-item')[0]).toHaveClass('items-start');
    expect(screen.getAllByTestId('message-final-answer-item')[0].querySelector('span')).toHaveClass(
      'mt-0.5'
    );
    expect(screen.queryByTestId('message-final-answer-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-tool-call')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-completed-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-completed-summary')).not.toBeInTheDocument();
  });

  /* Preconditions: final_answer with empty summary
     Action: render AgentMessage
     Assertions: summary container renders with zero checklist items and no title/header
     Requirements: agents.7.4.3, llm-integration.9.6 */
  it('should render empty checklist container when summary is absent', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-final',
              toolName: 'final_answer',
              arguments: {
                summary_points: [],
              },
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-final-answer-summary')).toBeInTheDocument();
    expect(screen.queryAllByTestId('message-final-answer-item')).toHaveLength(0);
    expect(screen.queryByTestId('message-final-answer-title')).not.toBeInTheDocument();
  });

  /* Preconditions: final_answer includes mixed summary_points types
     Action: render AgentMessage
     Assertions: only string checklist items are rendered
     Requirements: agents.7.4.2 */
  it('should render only string summary_points items for final_answer', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-final-mixed',
              toolName: 'final_answer',
              arguments: {
                summary_points: ['Point 1', 42, null, 'Point 2'],
              },
            },
          },
        })}
      />
    );

    expect(screen.getAllByTestId('message-final-answer-item')).toHaveLength(2);
    expect(screen.getByText('Point 1')).toBeInTheDocument();
    expect(screen.getByText('Point 2')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  /* Preconditions: final_answer includes long summary item
     Action: render AgentMessage
     Assertions: full summary text is rendered without truncation markers
     Requirements: agents.7.4.2 */
  it('should render long final_answer summary item as full visible text', () => {
    const longPoint =
      'This is a deliberately long checklist entry that should remain fully visible in the final answer block without one-line truncation.';

    render(
      <AgentMessage
        message={baseMessage({
          kind: 'tool_call',
          done: true,
          payload: {
            data: {
              callId: 'call-final-long',
              toolName: 'final_answer',
              arguments: {
                summary_points: [longPoint],
              },
            },
          },
        })}
      />
    );

    expect(screen.getByText(longPoint)).toBeInTheDocument();
  });
});

describe('AgentMessage — llm', () => {
  /* Preconditions: kind:llm with data.text
     Action: render AgentMessage
     Assertions: message-llm and message-llm-action visible, content rendered
     Requirements: llm-integration.7 */
  it('should render llm message with data.text', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: { data: { text: 'Response text' } },
        })}
      />
    );
    expect(screen.getByTestId('message-llm')).toBeInTheDocument();
    expect(screen.getByTestId('message-llm-action')).toBeInTheDocument();
    expect(screen.getByText('Response text')).toBeInTheDocument();
  });

  /* Preconditions: kind:llm without data.text and without reasoning
     Action: render AgentMessage
     Assertions: no loading indicator and no response text content
     Requirements: llm-integration.7 */
  it('should not render loading indicator when text and reasoning are absent', () => {
    render(<AgentMessage message={baseMessage({ kind: 'llm', payload: { data: {} } })} />);
    expect(screen.queryByTestId('message-llm-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-llm-action')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm with reasoning and data.text
     Action: render AgentMessage
     Assertions: reasoning testid present, response text present
     Requirements: llm-integration.2, llm-integration.7 */
  it('should render reasoning block when present', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: 'Thinking...' },
              text: 'Answer',
            },
          },
        })}
      />
    );
    expect(screen.getByTestId('message-llm-reasoning-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('message-llm-reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-root')).toHaveAttribute('data-streaming', 'false');
    expect(screen.getByTestId('message-llm-action')).toBeInTheDocument();
  });

  /* Preconditions: kind:llm reasoning text has glued bold opener after plain text
     Action: render AgentMessage
     Assertions: reasoning text has paragraph break before heading-like bold fragment
     Requirements: agents.4.11.3 */
  it('should normalize glued bold opener spacing in reasoning text', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: 'Soon!**Resolving next step**' },
              text: 'Answer',
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('message-llm-reasoning')).toHaveTextContent(
      'Soon! **Resolving next step**'
    );
    const reasoningText = screen.getByTestId('message-llm-reasoning').textContent ?? '';
    expect(reasoningText).toContain('Soon!\n\n**Resolving next step**');
  });

  /* Preconditions: reasoning text contains glued bold outside code and `**` inside fenced/inline code
     Action: render AgentMessage
     Assertions: only non-code reasoning text is normalized; code segments stay unchanged
     Requirements: agents.4.11.3, agents.4.11.5 */
  it('should normalize reasoning spacing only outside fenced and inline code', () => {
    const reasoning = [
      'Outside!**Bold**',
      '',
      '```js',
      "const x='a**b';",
      '```',
      '',
      '`x**y`',
    ].join('\n');

    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: reasoning },
              text: 'Answer',
            },
          },
        })}
      />
    );

    const node = screen.getByTestId('message-llm-reasoning');
    expect(node).toHaveTextContent('Outside! **Bold**');
    expect(node).toHaveTextContent("const x='a**b';");
    expect(node).toHaveTextContent('x**y');
  });

  /* Preconditions: kind:llm with reasoning, active streaming for this message
     Action: render AgentMessage with isReasoningStreaming=true
     Assertions: Reasoning receives data-streaming=true
     Requirements: llm-integration.2, llm-integration.7.2 */
  it('should pass streaming flag to Reasoning for active reasoning message', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: 'Thinking...' },
            },
          },
        })}
        isReasoningStreaming={true}
      />
    );
    expect(screen.getByTestId('reasoning-root')).toHaveAttribute('data-streaming', 'true');
    expect(screen.queryByTestId('message-llm-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-llm-avatar')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm without reasoning text, but message is currently streaming
     Action: render AgentMessage with isReasoningStreaming=true
     Assertions: reasoning block is still shown for active stream
     Requirements: llm-integration.2, llm-integration.7.2 */
  it('should render reasoning block when stream is active even before first reasoning delta', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {},
          },
          done: false,
        })}
        isReasoningStreaming={true}
      />
    );
    expect(screen.getByTestId('message-llm-reasoning-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-root')).toHaveAttribute('data-streaming', 'true');
  });

  /* Preconditions: kind:llm with data.text but no reasoning
     Action: render AgentMessage
     Assertions: no reasoning block rendered
     Requirements: llm-integration.7 */
  it('should not render reasoning when absent', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: { data: { text: 'Answer' } },
        })}
      />
    );
    expect(screen.queryByTestId('message-llm-reasoning')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm message with data.text
     Action: render AgentMessage
     Assertions: top message avatar is not rendered as separate block
     Requirements: agents.4.11 */
  it('should not render top avatar for llm message with data.text', () => {
    render(
      <AgentMessage message={baseMessage({ kind: 'llm', payload: { data: { text: 'Hi' } } })} />
    );
    expect(screen.queryByTestId('message-llm-avatar')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:llm with reasoning
     Action: render AgentMessage
     Assertions: top message avatar is hidden to avoid duplication with reasoning trigger icon
     Requirements: agents.4.11, agents.4.11.1, llm-integration.7.2 */
  it('should keep top avatar hidden for llm message when reasoning is present', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'llm',
          payload: {
            data: {
              reasoning: { text: 'Thinking...' },
            },
          },
        })}
        isReasoningStreaming={true}
      />
    );
    expect(screen.queryByTestId('message-llm-avatar')).not.toBeInTheDocument();
  });
});

describe('AgentMessage — error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: kind:error with error message
     Action: render AgentMessage
     Assertions: message-error testid visible, error text shown
     Requirements: llm-integration.7 */
  it('should render error message text', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: { data: { error: { message: 'Something went wrong' } } },
        })}
      />
    );
    expect(screen.getByTestId('message-error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  /* Preconditions: kind:error without error info
     Action: render AgentMessage
     Assertions: fallback "Unknown error" shown
     Requirements: llm-integration.7 */
  it('should render fallback text when error info absent', () => {
    render(<AgentMessage message={baseMessage({ kind: 'error', payload: { data: {} } })} />);
    expect(screen.getByText('Unknown error')).toBeInTheDocument();
  });

  /* Preconditions: kind:error with action_link, onNavigate provided
     Action: click action_link button
     Assertions: onNavigate called with correct screen
     Requirements: llm-integration.3.4.1 */
  it('should call onNavigate when action_link clicked', () => {
    const onNavigate = jest.fn();
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                type: 'auth',
                message: 'API key invalid',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
          replyToMessageId: 99,
        })}
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByTestId('message-error-action-link'));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  /* Preconditions: auth error with action link
     Action: render AgentMessage
     Assertions: Open Settings is first(outline), Retry is second(default)
     Requirements: agents.4.10.3, agents.4.10.4 */
  it('should render auth actions in required order and variants', () => {
    const onNavigate = jest.fn();
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                type: 'auth',
                message: 'API key invalid',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
        })}
        onNavigate={onNavigate}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Open Settings');
    expect(buttons[0]).toHaveAttribute('data-variant', 'outline');
    expect(buttons[1]).toHaveTextContent('Retry');
    expect(buttons[1]).toHaveAttribute('data-variant', 'default');
  });

  /* Preconditions: kind:error auth
     Action: click Retry button
     Assertions: retryLast called for agent
     Requirements: llm-integration.3.4.3 */
  it('should retry last message when retry action clicked', async () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                type: 'auth',
                message: 'API key invalid',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('message-error-retry'));
    await Promise.resolve();
    expect(mockRetryLast).toHaveBeenCalledWith('agent1');
    expect(screen.queryByTestId('message-error')).not.toBeInTheDocument();
  });

  /* Preconditions: kind:error with action_link, no onNavigate
     Action: render AgentMessage
     Assertions: action_link button not rendered
     Requirements: llm-integration.3.4.1 */
  it('should not render action_link when onNavigate not provided', () => {
    render(
      <AgentMessage
        message={baseMessage({
          kind: 'error',
          payload: {
            data: {
              error: {
                message: 'Error',
                action_link: { label: 'Open Settings', screen: 'settings' },
              },
            },
          },
        })}
      />
    );
    expect(screen.queryByTestId('message-error-action-link')).not.toBeInTheDocument();
  });
});
