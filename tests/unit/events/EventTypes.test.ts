// Requirements: realtime-events.3.2, realtime-events.3.3, realtime-events.3.4, realtime-events.5.5

import {
  AgentArchivedPayload,
  AgentCreatedPayload,
  AgentSnapshot,
  AgentUpdatedPayload,
  getEntityId,
  getEventKey,
} from '../../../src/shared/events/types';

const createAgentSnapshot = (id: string, name: string = 'Test Agent'): AgentSnapshot => ({
  id,
  name,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archivedAt: null,
  status: 'new',
});

describe('Event Types', () => {
  /* Preconditions: Two different agent IDs
     Action: Generate event keys for each
     Assertions: Keys are different
     Requirements: realtime-events.5.5 */
  it('should create unique event keys for different entities', () => {
    const payload1: AgentCreatedPayload = {
      timestamp: Date.now(),
      agent: createAgentSnapshot('agent-1'),
    };
    const payload2: AgentCreatedPayload = {
      timestamp: Date.now(),
      agent: createAgentSnapshot('agent-2'),
    };

    expect(getEventKey('agent.created', payload1)).not.toBe(getEventKey('agent.created', payload2));
  });

  /* Preconditions: Same agent ID, different timestamps
     Action: Generate event keys
     Assertions: Keys are the same
     Requirements: realtime-events.5.5 */
  it('should create stable event keys for the same entity', () => {
    const payload1: AgentUpdatedPayload = {
      timestamp: 100,
      agent: createAgentSnapshot('agent-1', 'First'),
    };
    const payload2: AgentUpdatedPayload = {
      timestamp: 200,
      agent: createAgentSnapshot('agent-1', 'Second'),
    };

    expect(getEventKey('agent.updated', payload1)).toBe(getEventKey('agent.updated', payload2));
  });

  /* Preconditions: Same agent ID, different event types
     Action: Generate event keys
     Assertions: Keys are different
     Requirements: realtime-events.5.5 */
  it('should include event type in event keys', () => {
    const payload: AgentSnapshot = createAgentSnapshot('agent-1');
    const createdPayload: AgentCreatedPayload = { timestamp: Date.now(), agent: payload };
    const updatedPayload: AgentUpdatedPayload = { timestamp: Date.now(), agent: payload };
    const archivedPayload: AgentArchivedPayload = {
      timestamp: Date.now(),
      agent: { ...payload, archivedAt: Date.now() },
    };

    const createdKey = getEventKey('agent.created', createdPayload);
    const updatedKey = getEventKey('agent.updated', updatedPayload);
    const archivedKey = getEventKey('agent.archived', archivedPayload);

    expect(createdKey).not.toBe(updatedKey);
    expect(updatedKey).not.toBe(archivedKey);
    expect(createdKey).not.toBe(archivedKey);
  });

  /* Preconditions: reasoning payloads with different messageId
     Action: Generate keys for message.llm.reasoning.updated
     Assertions: Keys include messageId and differ for different messages
     Requirements: realtime-events.5.5, llm-integration.2 */
  it('should include messageId in reasoning event keys', () => {
    const payload1 = {
      timestamp: Date.now(),
      messageId: 101,
      agentId: 'agent-1',
      delta: 'a',
      accumulatedText: 'a',
    };
    const payload2 = {
      timestamp: Date.now(),
      messageId: 202,
      agentId: 'agent-1',
      delta: 'b',
      accumulatedText: 'b',
    };

    const key1 = getEventKey('message.llm.reasoning.updated', payload1);
    const key2 = getEventKey('message.llm.reasoning.updated', payload2);

    expect(key1).toBe('message.llm.reasoning.updated:101');
    expect(key2).toBe('message.llm.reasoning.updated:202');
    expect(key1).not.toBe(key2);
  });

  /* Preconditions: text payloads with different messageId
     Action: Generate keys for message.llm.text.updated
     Assertions: Keys include messageId and differ for different messages
     Requirements: realtime-events.5.5, llm-integration.2 */
  it('should include messageId in text event keys', () => {
    const payload1 = {
      timestamp: Date.now(),
      messageId: 303,
      agentId: 'agent-1',
      delta: 'a',
      accumulatedText: 'a',
    };
    const payload2 = {
      timestamp: Date.now(),
      messageId: 404,
      agentId: 'agent-1',
      delta: 'b',
      accumulatedText: 'b',
    };

    const key1 = getEventKey('message.llm.text.updated', payload1);
    const key2 = getEventKey('message.llm.text.updated', payload2);

    expect(key1).toBe('message.llm.text.updated:303');
    expect(key2).toBe('message.llm.text.updated:404');
    expect(key1).not.toBe(key2);
  });

  /* Preconditions: tool_call payloads with different llmMessageId
     Action: Generate keys for message.tool_call
     Assertions: Keys include llmMessageId and differ for different llm messages
     Requirements: realtime-events.5.5, llm-integration.11.2 */
  it('should include llmMessageId in tool call event keys', () => {
    const payload1 = {
      timestamp: Date.now(),
      agentId: 'agent-1',
      llmMessageId: 505,
      callId: 'call-1',
      toolName: 'search_docs',
      arguments: { q: 'a' },
    };
    const payload2 = {
      timestamp: Date.now(),
      agentId: 'agent-1',
      llmMessageId: 606,
      callId: 'call-2',
      toolName: 'search_docs',
      arguments: { q: 'b' },
    };

    const key1 = getEventKey('message.tool_call', payload1);
    const key2 = getEventKey('message.tool_call', payload2);

    expect(key1).toBe('message.tool_call:505');
    expect(key2).toBe('message.tool_call:606');
    expect(key1).not.toBe(key2);
  });

  /* Preconditions: Agent created/updated/archived payloads
     Action: Extract entity ID
     Assertions: ID extracted correctly
     Requirements: realtime-events.3.2, realtime-events.3.3, realtime-events.3.4 */
  it('should extract entity IDs from agent payloads', () => {
    const created: AgentCreatedPayload = {
      timestamp: Date.now(),
      agent: createAgentSnapshot('agent-created'),
    };
    const updated: AgentUpdatedPayload = {
      timestamp: Date.now(),
      agent: createAgentSnapshot('agent-updated'),
    };
    const archived: AgentArchivedPayload = {
      timestamp: Date.now(),
      agent: { ...createAgentSnapshot('agent-archived'), archivedAt: Date.now() },
    };

    expect(getEntityId(created)).toBe('agent-created');
    expect(getEntityId(updated)).toBe('agent-updated');
    expect(getEntityId(archived)).toBe('agent-archived');
  });
});
