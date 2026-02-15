import * as fc from 'fast-check';
import {
  computeAgentStatus,
  AgentStatus,
  MessageForStatus,
} from '../../../src/shared/utils/computeAgentStatus';

describe('computeAgentStatus property-based tests', () => {
  // Arbitrary for message kinds
  const messageKindArb = fc.constantFrom(
    'user',
    'llm',
    'tool_call',
    'code_exec',
    'final_answer',
    'request_scope',
    'artifact'
  );

  // Arbitrary for error statuses
  const errorStatusArb = fc.constantFrom('error', 'crash', 'timeout');

  // Arbitrary for valid message payload
  const messagePayloadArb = (kind: string, resultStatus?: string): fc.Arbitrary<MessageForStatus> =>
    fc.record({
      payloadJson: fc.constant(
        JSON.stringify({
          kind,
          data: resultStatus ? { result: { status: resultStatus } } : { text: 'test' },
        })
      ),
    });

  /* Preconditions: Empty messages array
     Action: Call computeAgentStatus with empty array
     Assertions: Always returns 'new'
     Requirements: agents.9.2, agents.9.4 */
  it('should always return "new" for empty messages', () => {
    fc.assert(
      fc.property(fc.constant([]), (messages: MessageForStatus[]) => {
        const status = computeAgentStatus(messages);
        return status === 'new';
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Last message is 'user' kind without error
     Action: Call computeAgentStatus
     Assertions: Always returns 'in-progress'
     Requirements: agents.9.2, agents.9.4 */
  it('should return "in-progress" when last message is user (without error)', () => {
    fc.assert(
      fc.property(
        fc.array(messagePayloadArb('llm'), { minLength: 0, maxLength: 10 }),
        (previousMessages) => {
          const userMessage: MessageForStatus = {
            payloadJson: JSON.stringify({ kind: 'user', data: { text: 'test' } }),
          };
          const messages = [...previousMessages, userMessage];

          const status = computeAgentStatus(messages);
          return status === 'in-progress';
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Last message is 'llm' kind without error
     Action: Call computeAgentStatus
     Assertions: Always returns 'awaiting-user'
     Requirements: agents.9.2, agents.9.4 */
  it('should return "awaiting-user" when last message is llm (without error)', () => {
    fc.assert(
      fc.property(
        fc.array(messagePayloadArb('user'), { minLength: 0, maxLength: 10 }),
        (previousMessages) => {
          const llmMessage: MessageForStatus = {
            payloadJson: JSON.stringify({ kind: 'llm', data: { text: 'response' } }),
          };
          const messages = [...previousMessages, llmMessage];

          const status = computeAgentStatus(messages);
          return status === 'awaiting-user';
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Last message is 'final_answer' kind without error
     Action: Call computeAgentStatus
     Assertions: Always returns 'completed'
     Requirements: agents.9.2, agents.9.4 */
  it('should return "completed" when last message is final_answer (without error)', () => {
    fc.assert(
      fc.property(
        fc.array(messagePayloadArb('user'), { minLength: 0, maxLength: 10 }),
        (previousMessages) => {
          const finalMessage: MessageForStatus = {
            payloadJson: JSON.stringify({ kind: 'final_answer', data: { text: 'done' } }),
          };
          const messages = [...previousMessages, finalMessage];

          const status = computeAgentStatus(messages);
          return status === 'completed';
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Last message has error/crash/timeout status
     Action: Call computeAgentStatus
     Assertions: Always returns 'error' regardless of kind
     Requirements: agents.9.2, agents.9.4 */
  it('should return "error" when last message has error status (any kind)', () => {
    fc.assert(
      fc.property(messageKindArb, errorStatusArb, (kind, errorStatus) => {
        const messages: MessageForStatus[] = [
          {
            payloadJson: JSON.stringify({
              kind,
              data: { result: { status: errorStatus } },
            }),
          },
        ];

        const status = computeAgentStatus(messages);
        return status === 'error';
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Function called with same input multiple times
     Action: Call computeAgentStatus multiple times
     Assertions: Always returns same result (deterministic)
     Requirements: agents.9.4 */
  it('should be deterministic (same input = same output)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            messagePayloadArb('user'),
            messagePayloadArb('llm'),
            messagePayloadArb('final_answer')
          ),
          { minLength: 0, maxLength: 20 }
        ),
        (messages) => {
          const result1 = computeAgentStatus(messages);
          const result2 = computeAgentStatus(messages);
          const result3 = computeAgentStatus(messages);

          return result1 === result2 && result2 === result3;
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Any valid messages array
     Action: Call computeAgentStatus
     Assertions: Result is always a valid AgentStatus
     Requirements: agents.9.4 */
  it('should always return a valid AgentStatus', () => {
    const validStatuses: AgentStatus[] = [
      'new',
      'in-progress',
      'awaiting-user',
      'error',
      'completed',
    ];

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            messagePayloadArb('user'),
            messagePayloadArb('llm'),
            messagePayloadArb('final_answer'),
            messagePayloadArb('tool_call'),
            messagePayloadArb('code_exec'),
            messagePayloadArb('tool_call', 'error'),
            messagePayloadArb('llm', 'crash')
          ),
          { minLength: 0, maxLength: 20 }
        ),
        (messages) => {
          const status = computeAgentStatus(messages);
          return validStatuses.includes(status);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Only last message matters for status
     Action: Call computeAgentStatus with various message histories
     Assertions: Status depends only on last message
     Requirements: agents.9.2, agents.9.4 */
  it('should only consider last message for status determination', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            messagePayloadArb('user'),
            messagePayloadArb('llm'),
            messagePayloadArb('final_answer')
          ),
          { minLength: 1, maxLength: 10 }
        ),
        messagePayloadArb('user'),
        (previousMessages, lastMessage) => {
          const messagesWithUser = [...previousMessages, lastMessage];
          const statusWithUser = computeAgentStatus(messagesWithUser);

          // Last message is 'user', so status should be 'in-progress'
          return statusWithUser === 'in-progress';
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Invalid JSON in payloadJson
     Action: Call computeAgentStatus
     Assertions: Returns 'new' (graceful handling)
     Requirements: agents.9.4 */
  it('should handle invalid JSON gracefully', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        (invalidJson) => {
          const messages: MessageForStatus[] = [{ payloadJson: invalidJson }];
          const status = computeAgentStatus(messages);
          return status === 'new';
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Error status takes precedence over kind
     Action: Call computeAgentStatus with final_answer that has error status
     Assertions: Returns 'error' not 'completed'
     Requirements: agents.9.2 */
  it('should prioritize error status over final_answer kind', () => {
    fc.assert(
      fc.property(errorStatusArb, (errorStatus) => {
        const messages: MessageForStatus[] = [
          {
            payloadJson: JSON.stringify({
              kind: 'final_answer',
              data: { text: 'done', result: { status: errorStatus } },
            }),
          },
        ];

        const status = computeAgentStatus(messages);
        return status === 'error';
      }),
      { numRuns: 100 }
    );
  });
});
