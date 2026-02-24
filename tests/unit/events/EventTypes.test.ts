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
