// Requirements: agents.4, agents.7, agents.13, llm-integration.3.8, llm-integration.8.5

import * as fc from 'fast-check';
import { toUIMessage, toUIMessages } from '../../../src/renderer/lib/messageMapper';
import type { MessageSnapshot } from '../../../src/shared/events/types';
import type { MessagePayload } from '../../../src/shared/utils/agentStatus';

// Arbitraries
const kindArb = fc.oneof(
  fc.constant('user'),
  fc.constant('llm'),
  fc.constant('error'),
  fc.constant('tool_call'),
  fc.constant('code_exec'),
  fc.constant('final_answer'),
  fc.constant('artifact')
);

const userPayloadArb = fc.record({
  data: fc.record({ text: fc.string() }),
}) as fc.Arbitrary<MessagePayload>;

const llmPayloadArb = fc.oneof(
  fc.record({ data: fc.constant({}) }) as fc.Arbitrary<MessagePayload>,
  fc.record({
    data: fc.record({ action: fc.record({ content: fc.string() }) }),
  }) as fc.Arbitrary<MessagePayload>
);

const errorPayloadArb = fc.record({
  data: fc.record({ message: fc.string() }),
}) as fc.Arbitrary<MessagePayload>;

const snapshotArb = fc
  .record({
    id: fc.integer({ min: 1, max: 100000 }),
    agentId: fc.string({ minLength: 1, maxLength: 20 }),
    kind: kindArb,
    timestamp: fc.integer({ min: 0 }),
    hidden: fc.boolean(),
  })
  .chain((base) => {
    let payloadArb: fc.Arbitrary<MessagePayload>;
    if (base.kind === 'user') payloadArb = userPayloadArb;
    else if (base.kind === 'llm') payloadArb = llmPayloadArb;
    else if (base.kind === 'error') payloadArb = errorPayloadArb;
    else payloadArb = fc.record({ data: fc.constant({}) }) as fc.Arbitrary<MessagePayload>;

    return payloadArb.map((payload) => ({ ...base, payload }) as MessageSnapshot);
  });

describe('messageMapper property-based tests', () => {
  /* Preconditions: any array of MessageSnapshots
     Action: call toUIMessages
     Assertions: result length <= input length (invariant)
     Requirements: agents.13 */
  it('Property 1: toUIMessages result length <= input length', () => {
    fc.assert(
      fc.property(fc.array(snapshotArb, { minLength: 0, maxLength: 20 }), (msgs) => {
        const result = toUIMessages(msgs);
        return result.length <= msgs.length;
      }),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any MessageSnapshot with kind: 'user' and hidden: false
     Action: call toUIMessage
     Assertions: result always has role: 'user'
     Requirements: agents.7.3 */
  it('Property 2: user messages always map to role: user', () => {
    fc.assert(
      fc.property(
        snapshotArb.filter((m) => m.kind === 'user' && !m.hidden),
        (msg) => {
          const result = toUIMessage(msg);
          return result !== null && result.role === 'user';
        }
      ),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any MessageSnapshot with hidden: true
     Action: call toUIMessage
     Assertions: result is always null
     Requirements: llm-integration.3.8, llm-integration.8.5 */
  it('Property 3: hidden messages always return null', () => {
    fc.assert(
      fc.property(
        snapshotArb.map((m) => ({ ...m, hidden: true })),
        (msg) => {
          return toUIMessage(msg) === null;
        }
      ),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any array of MessageSnapshots
     Action: call toUIMessages
     Assertions: no hidden messages appear in result
     Requirements: llm-integration.3.8, llm-integration.8.5 */
  it('Property 4: no hidden messages in toUIMessages result', () => {
    fc.assert(
      fc.property(fc.array(snapshotArb, { minLength: 0, maxLength: 20 }), (msgs) => {
        const result = toUIMessages(msgs);
        // For each result message, there must be at least one non-hidden input with that id
        const visibleIds = new Set(msgs.filter((m) => !m.hidden).map((m) => String(m.id)));
        return result.every((r) => visibleIds.has(r.id));
      }),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any MessageSnapshot with kind: 'llm' or 'error' and hidden: false
     Action: call toUIMessage
     Assertions: result always has role: 'assistant'
     Requirements: agents.7.3 */
  it('Property 5: llm and error messages always map to role: assistant', () => {
    fc.assert(
      fc.property(
        snapshotArb.filter((m) => (m.kind === 'llm' || m.kind === 'error') && !m.hidden),
        (msg) => {
          const result = toUIMessage(msg);
          return result !== null && result.role === 'assistant';
        }
      ),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any MessageSnapshot with unknown kind and hidden: false
     Action: call toUIMessage
     Assertions: result is null for non-displayable kinds
     Requirements: agents.7.4 */
  it('Property 6: non-displayable kinds return null', () => {
    const nonDisplayableKinds = [
      'tool_call',
      'code_exec',
      'final_answer',
      'artifact',
      'request_scope',
    ];
    fc.assert(
      fc.property(
        snapshotArb.filter((m) => nonDisplayableKinds.includes(m.kind) && !m.hidden),
        (msg) => {
          return toUIMessage(msg) === null;
        }
      ),
      { numRuns: 200 }
    );
  });

  /* Preconditions: any MessageSnapshot with kind: 'error' and hidden: false
     Action: call toUIMessage
     Assertions: metadata.isError is always true
     Requirements: llm-integration.3.4 */
  it('Property 7: error messages always have isError: true in metadata', () => {
    fc.assert(
      fc.property(
        snapshotArb.filter((m) => m.kind === 'error' && !m.hidden),
        (msg) => {
          const result = toUIMessage(msg);
          if (result === null) return false;
          const meta = result.metadata as Record<string, unknown> | undefined;
          return meta?.isError === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
