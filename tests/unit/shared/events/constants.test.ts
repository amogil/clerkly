// Requirements: llm-integration.1.6, llm-integration.2.1

import { EVENT_TYPES } from '../../../../src/shared/events/constants';

describe('shared event constants', () => {
  /* Preconditions: runtime event type map is loaded
     Action: inspect message-related event constants
     Assertions: no separate message.tool_call event exists and canonical message events are present
     Requirements: llm-integration.1.6, llm-integration.2.1 */
  it('does not expose message.tool_call event and keeps canonical message events', () => {
    const values = Object.values(EVENT_TYPES);
    expect(values).not.toContain('message.tool_call');
    expect(EVENT_TYPES.MESSAGE_CREATED).toBe('message.created');
    expect(EVENT_TYPES.MESSAGE_UPDATED).toBe('message.updated');
  });
});
