import { computeAgentStatus, MessageForStatus } from '../../../src/shared/utils/computeAgentStatus';

describe('computeAgentStatus', () => {
  /* Preconditions: Empty messages array
     Action: Call computeAgentStatus with empty array
     Assertions: Returns 'new' status
     Requirements: agents.9.2 */
  it('should return "new" for agent with no messages', () => {
    const messages: MessageForStatus[] = [];

    const status = computeAgentStatus(messages);

    expect(status).toBe('new');
  });

  /* Preconditions: Last message has kind = 'user'
     Action: Call computeAgentStatus
     Assertions: Returns 'in-progress' status
     Requirements: agents.9.2 */
  it('should return "in-progress" when last message is from user', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'user',
          data: { text: 'Hello agent' },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('in-progress');
  });

  /* Preconditions: Last message has kind = 'llm' (not final_answer)
     Action: Call computeAgentStatus
     Assertions: Returns 'awaiting-user' status
     Requirements: agents.9.2 */
  it('should return "awaiting-user" when last message is from LLM', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'user',
          data: { text: 'Hello' },
        }),
      },
      {
        payloadJson: JSON.stringify({
          kind: 'llm',
          data: { action: { type: 'text' }, text: 'How can I help?' },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('awaiting-user');
  });

  /* Preconditions: Last message has kind = 'final_answer'
     Action: Call computeAgentStatus
     Assertions: Returns 'completed' status
     Requirements: agents.9.2 */
  it('should return "completed" when last message is final_answer', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'user',
          data: { text: 'What is 2+2?' },
        }),
      },
      {
        payloadJson: JSON.stringify({
          kind: 'final_answer',
          data: { text: 'The answer is 4', format: 'text' },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('completed');
  });

  /* Preconditions: Last message has result.status = 'error'
     Action: Call computeAgentStatus
     Assertions: Returns 'error' status
     Requirements: agents.9.2 */
  it('should return "error" when last message has error status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'tool_call',
          data: {
            result: { status: 'error', error: { message: 'Something went wrong' } },
          },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('error');
  });

  /* Preconditions: Last message has result.status = 'crash'
     Action: Call computeAgentStatus
     Assertions: Returns 'error' status
     Requirements: agents.9.2 */
  it('should return "error" when last message has crash status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'code_exec',
          data: {
            result: { status: 'crash' },
          },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('error');
  });

  /* Preconditions: Last message has result.status = 'timeout'
     Action: Call computeAgentStatus
     Assertions: Returns 'error' status
     Requirements: agents.9.2 */
  it('should return "error" when last message has timeout status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'tool_call',
          data: {
            result: { status: 'timeout' },
          },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('error');
  });

  /* Preconditions: Last message has kind = 'tool_call' without error
     Action: Call computeAgentStatus
     Assertions: Returns 'new' status (default for non-user/llm/final_answer)
     Requirements: agents.9.2 */
  it('should return "new" for tool_call without error status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'tool_call',
          data: { tool: 'search', result: { status: 'success' } },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('new');
  });

  /* Preconditions: Last message has kind = 'code_exec' without error
     Action: Call computeAgentStatus
     Assertions: Returns 'new' status
     Requirements: agents.9.2 */
  it('should return "new" for code_exec without error status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'code_exec',
          data: { code: 'print("hello")', result: { status: 'success' } },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('new');
  });

  /* Preconditions: Message has invalid JSON in payloadJson
     Action: Call computeAgentStatus
     Assertions: Returns 'new' status (graceful handling)
     Requirements: agents.9.4 */
  it('should return "new" for invalid JSON payload', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: 'invalid json {{{',
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('new');
  });

  /* Preconditions: Multiple messages in conversation, last is user message
     Action: Call computeAgentStatus
     Assertions: Returns 'in-progress' based on last message only
     Requirements: agents.9.2, agents.9.4 */
  it('should only consider the last message for status', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({ kind: 'user', data: { text: 'First' } }),
      },
      {
        payloadJson: JSON.stringify({ kind: 'llm', data: { text: 'Response' } }),
      },
      {
        payloadJson: JSON.stringify({ kind: 'final_answer', data: { text: 'Done' } }),
      },
      {
        payloadJson: JSON.stringify({ kind: 'user', data: { text: 'New question' } }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('in-progress');
  });

  /* Preconditions: Error status takes precedence over kind
     Action: Call computeAgentStatus with llm message that has error status
     Assertions: Returns 'error' not 'awaiting-user'
     Requirements: agents.9.2 */
  it('should prioritize error status over message kind', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'llm',
          data: {
            text: 'Processing...',
            result: { status: 'error', error: { message: 'API failed' } },
          },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('error');
  });

  /* Preconditions: Function is called multiple times with same input
     Action: Call computeAgentStatus multiple times
     Assertions: Returns same result each time (deterministic)
     Requirements: agents.9.4 */
  it('should be deterministic (pure function)', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({ kind: 'user', data: { text: 'Test' } }),
      },
    ];

    const result1 = computeAgentStatus(messages);
    const result2 = computeAgentStatus(messages);
    const result3 = computeAgentStatus(messages);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
    expect(result1).toBe('in-progress');
  });

  /* Preconditions: Message payload has no data field
     Action: Call computeAgentStatus
     Assertions: Handles gracefully without error
     Requirements: agents.9.4 */
  it('should handle payload without data field', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({ kind: 'user' }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('in-progress');
  });

  /* Preconditions: Message payload has data but no result field
     Action: Call computeAgentStatus
     Assertions: Handles gracefully without error
     Requirements: agents.9.4 */
  it('should handle payload without result field', () => {
    const messages: MessageForStatus[] = [
      {
        payloadJson: JSON.stringify({
          kind: 'tool_call',
          data: { tool: 'search' },
        }),
      },
    ];

    const status = computeAgentStatus(messages);

    expect(status).toBe('new');
  });
});
