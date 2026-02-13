// Requirements: realtime-events.3.2, realtime-events.3.3, realtime-events.3.4, realtime-events.3.5, realtime-events.3.6
/**
 * Unit tests for event types and utility functions
 */

import {
  Agent,
  AgentCreatedPayload,
  AgentUpdatedPayload,
  AgentDeletedPayload,
  Message,
  MessageCreatedPayload,
  MessageUpdatedPayload,
  UserLoginPayload,
  UserLogoutPayload,
  UserProfileUpdatedPayload,
  EventType,
  EventPayload,
  getEntityId,
  getEventKey,
} from '../../../src/shared/events/types';

describe('EventTypes', () => {
  describe('entity.created events', () => {
    /* Preconditions: None
       Action: Create an agent.created event with full agent data
       Assertions: Event contains full data and timestamp
       Requirements: realtime-events.3.2 */
    it('should emit entity.created with full data', () => {
      const agent: Agent = {
        id: 'agent-123',
        name: 'Test Agent',
        description: 'A test agent',
        model: 'gpt-4',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const event: AgentCreatedPayload = {
        timestamp: Date.now(),
        data: agent,
      };

      expect(event.data).toEqual(agent);
      expect(event.data.id).toBe('agent-123');
      expect(event.data.name).toBe('Test Agent');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    /* Preconditions: None
       Action: Create a message.created event with full message data
       Assertions: Event contains full message data and timestamp
       Requirements: realtime-events.3.2 */
    it('should emit message.created with full data', () => {
      const message: Message = {
        id: 'msg-456',
        agentId: 'agent-123',
        role: 'user',
        content: 'Hello, world!',
        createdAt: Date.now(),
      };

      const event: MessageCreatedPayload = {
        timestamp: Date.now(),
        data: message,
      };

      expect(event.data).toEqual(message);
      expect(event.data.id).toBe('msg-456');
      expect(event.data.role).toBe('user');
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });

  describe('entity.updated events', () => {
    /* Preconditions: None
       Action: Create an agent.updated event with changedFields
       Assertions: Event contains id, changedFields (required), and timestamp
       Requirements: realtime-events.3.3 */
    it('should emit entity.updated with changedFields', () => {
      const event: AgentUpdatedPayload = {
        timestamp: Date.now(),
        id: 'agent-123',
        changedFields: {
          name: 'Updated Agent Name',
          description: 'Updated description',
        },
      };

      expect(event.id).toBe('agent-123');
      expect(event.changedFields).toBeDefined();
      expect(event.changedFields.name).toBe('Updated Agent Name');
      expect(event.changedFields.description).toBe('Updated description');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    /* Preconditions: None
       Action: Create a message.updated event with changedFields
       Assertions: Event contains id, changedFields, and timestamp
       Requirements: realtime-events.3.3 */
    it('should emit message.updated with changedFields', () => {
      const event: MessageUpdatedPayload = {
        timestamp: Date.now(),
        id: 'msg-456',
        changedFields: {
          content: 'Updated content',
        },
      };

      expect(event.id).toBe('msg-456');
      expect(event.changedFields.content).toBe('Updated content');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    /* Preconditions: None
       Action: Create a user.profile.updated event with changedFields
       Assertions: Event contains id, changedFields, and timestamp
       Requirements: realtime-events.3.3 */
    it('should emit user.profile.updated with changedFields', () => {
      const event: UserProfileUpdatedPayload = {
        timestamp: Date.now(),
        id: 'user-789',
        changedFields: {
          name: 'New Name',
          picture: 'https://example.com/avatar.jpg',
        },
      };

      expect(event.id).toBe('user-789');
      expect(event.changedFields.name).toBe('New Name');
      expect(event.changedFields.picture).toBe('https://example.com/avatar.jpg');
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });

  describe('entity.deleted events', () => {
    /* Preconditions: None
       Action: Create an agent.deleted event with ID only
       Assertions: Event contains only id and timestamp
       Requirements: realtime-events.3.4 */
    it('should emit entity.deleted with ID only', () => {
      const event: AgentDeletedPayload = {
        timestamp: Date.now(),
        id: 'agent-123',
      };

      expect(event.id).toBe('agent-123');
      expect(event.timestamp).toBeGreaterThan(0);
      // Should not have data or changedFields
      expect((event as any).data).toBeUndefined();
      expect((event as any).changedFields).toBeUndefined();
    });
  });

  describe('custom event types', () => {
    /* Preconditions: None
       Action: Use EventType and EventPayload generic types
       Assertions: Types are correctly inferred
       Requirements: realtime-events.3.5 */
    it('should support custom event types', () => {
      // Type-level test: ensure EventType includes all event types
      const eventTypes: EventType[] = [
        'agent.created',
        'agent.updated',
        'agent.deleted',
        'message.created',
        'message.updated',
        'user.login',
        'user.logout',
        'user.profile.updated',
      ];

      expect(eventTypes).toHaveLength(8);

      // Type-level test: EventPayload extracts correct payload type
      type AgentCreatedPayloadType = EventPayload<'agent.created'>;
      const payload: AgentCreatedPayloadType = {
        timestamp: Date.now(),
        data: {
          id: 'agent-1',
          name: 'Test',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      expect(payload.data.id).toBe('agent-1');
    });

    /* Preconditions: None
       Action: Create user.login and user.logout events
       Assertions: Events have correct structure
       Requirements: realtime-events.3.5 */
    it('should support user login/logout events', () => {
      const loginEvent: UserLoginPayload = {
        timestamp: Date.now(),
        userId: 'user-123',
      };

      const logoutEvent: UserLogoutPayload = {
        timestamp: Date.now(),
      };

      expect(loginEvent.userId).toBe('user-123');
      expect(loginEvent.timestamp).toBeGreaterThan(0);
      expect(logoutEvent.timestamp).toBeGreaterThan(0);
    });
  });

  describe('timestamp in all events', () => {
    /* Preconditions: None
       Action: Create various event types
       Assertions: All events include timestamp
       Requirements: realtime-events.3.6 */
    it('should include timestamp in all events', () => {
      const now = Date.now();

      const createdEvent: AgentCreatedPayload = {
        timestamp: now,
        data: { id: '1', name: 'Test', createdAt: now, updatedAt: now },
      };

      const updatedEvent: AgentUpdatedPayload = {
        timestamp: now + 1000,
        id: '1',
        changedFields: { name: 'Updated' },
      };

      const deletedEvent: AgentDeletedPayload = {
        timestamp: now + 2000,
        id: '1',
      };

      const loginEvent: UserLoginPayload = {
        timestamp: now + 3000,
        userId: 'user-1',
      };

      const logoutEvent: UserLogoutPayload = {
        timestamp: now + 4000,
      };

      expect(createdEvent.timestamp).toBe(now);
      expect(updatedEvent.timestamp).toBe(now + 1000);
      expect(deletedEvent.timestamp).toBe(now + 2000);
      expect(loginEvent.timestamp).toBe(now + 3000);
      expect(logoutEvent.timestamp).toBe(now + 4000);
    });
  });

  describe('utility functions', () => {
    /* Preconditions: None
       Action: Call getEntityId with various payloads
       Assertions: Returns correct entity ID or undefined
       Requirements: realtime-events.5.5 */
    it('should extract entity ID from created event', () => {
      const payload = {
        timestamp: Date.now(),
        data: { id: 'entity-123', name: 'Test' },
      };

      expect(getEntityId(payload)).toBe('entity-123');
    });

    /* Preconditions: None
       Action: Call getEntityId with updated/deleted event
       Assertions: Returns correct entity ID
       Requirements: realtime-events.5.5 */
    it('should extract entity ID from updated/deleted event', () => {
      const payload = {
        timestamp: Date.now(),
        id: 'entity-456',
        changedFields: { name: 'Updated' },
      };

      expect(getEntityId(payload)).toBe('entity-456');
    });

    /* Preconditions: None
       Action: Call getEntityId with event without ID
       Assertions: Returns undefined
       Requirements: realtime-events.5.5 */
    it('should return undefined for events without ID', () => {
      const payload = {
        timestamp: Date.now(),
      };

      expect(getEntityId(payload)).toBeUndefined();
    });

    /* Preconditions: None
       Action: Call getEventKey with various events
       Assertions: Returns correct key for deduplication
       Requirements: realtime-events.5.5 */
    it('should create event key for deduplication', () => {
      const createdPayload = {
        timestamp: Date.now(),
        data: { id: 'agent-123', name: 'Test' },
      };

      const updatedPayload = {
        timestamp: Date.now(),
        id: 'agent-456',
        changedFields: { name: 'Updated' },
      };

      const logoutPayload = {
        timestamp: Date.now(),
      };

      expect(getEventKey('agent.created', createdPayload)).toBe('agent.created:agent-123');
      expect(getEventKey('agent.updated', updatedPayload)).toBe('agent.updated:agent-456');
      expect(getEventKey('user.logout', logoutPayload)).toBe('user.logout');
    });
  });
});
