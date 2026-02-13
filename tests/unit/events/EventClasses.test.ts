// Requirements: realtime-events.3.6
/**
 * Unit tests for TypedEventClass implementations
 * Tests event class constructors and toPayload methods
 */

import {
  AuthSucceededEvent,
  AuthFailedEvent,
  ProfileSyncedEvent,
  ErrorCreatedEvent,
  UserLoginEvent,
  UserLogoutEvent,
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentDeletedEvent,
  MessageCreatedEvent,
  MessageUpdatedEvent,
  UserProfileUpdatedEvent,
  isTypedEvent,
  Agent,
  Message,
} from '../../../src/shared/events/types';
import { User } from '../../../src/types';

describe('Event Classes', () => {
  describe('AuthSucceededEvent', () => {
    /* Preconditions: Valid userId provided
       Action: Create AuthSucceededEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with userId', () => {
      const event = new AuthSucceededEvent('user-123');

      expect(event.type).toBe('auth.succeeded');
      expect(event.userId).toBe('user-123');
      expect(event.toPayload()).toEqual({ userId: 'user-123' });
    });

    /* Preconditions: Empty userId provided
       Action: Create AuthSucceededEvent
       Assertions: Throws error
       Requirements: realtime-events.3.6 */
    it('should throw error for empty userId', () => {
      expect(() => new AuthSucceededEvent('')).toThrow(
        'AuthSucceededEvent requires a non-empty userId'
      );
    });
  });

  describe('AuthFailedEvent', () => {
    /* Preconditions: Error message provided
       Action: Create AuthFailedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with error message', () => {
      const event = new AuthFailedEvent('Authentication failed');

      expect(event.type).toBe('auth.failed');
      expect(event.error).toBe('Authentication failed');
      expect(event.errorCode).toBeUndefined();
      expect(event.toPayload()).toEqual({
        error: 'Authentication failed',
        errorCode: undefined,
      });
    });

    /* Preconditions: Error message and code provided
       Action: Create AuthFailedEvent
       Assertions: Event has correct type and payload with errorCode
       Requirements: realtime-events.3.6 */
    it('should create event with error message and code', () => {
      const event = new AuthFailedEvent('Access denied', 'access_denied');

      expect(event.type).toBe('auth.failed');
      expect(event.error).toBe('Access denied');
      expect(event.errorCode).toBe('access_denied');
      expect(event.toPayload()).toEqual({
        error: 'Access denied',
        errorCode: 'access_denied',
      });
    });
  });

  describe('ProfileSyncedEvent', () => {
    const mockUser: User = {
      user_id: 'abc123xyz0',
      email: 'test@example.com',
      name: 'Test User',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    /* Preconditions: User object provided
       Action: Create ProfileSyncedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with user data', () => {
      const event = new ProfileSyncedEvent(mockUser);

      expect(event.type).toBe('profile.synced');
      expect(event.user).toEqual(mockUser);
      expect(event.toPayload()).toEqual({ user: mockUser });
    });
  });

  describe('ErrorCreatedEvent', () => {
    /* Preconditions: Message and context provided
       Action: Create ErrorCreatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with message and context', () => {
      const event = new ErrorCreatedEvent('Failed to save', 'DataManager');

      expect(event.type).toBe('error.created');
      expect(event.message).toBe('Failed to save');
      expect(event.context).toBe('DataManager');
      expect(event.toPayload()).toEqual({
        message: 'Failed to save',
        context: 'DataManager',
      });
    });
  });

  describe('UserLoginEvent', () => {
    /* Preconditions: UserId provided
       Action: Create UserLoginEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with userId', () => {
      const event = new UserLoginEvent('user-456');

      expect(event.type).toBe('user.login');
      expect(event.userId).toBe('user-456');
      expect(event.toPayload()).toEqual({ userId: 'user-456' });
    });
  });

  describe('UserLogoutEvent', () => {
    /* Preconditions: None
       Action: Create UserLogoutEvent
       Assertions: Event has correct type and empty payload
       Requirements: realtime-events.3.6 */
    it('should create event with empty payload', () => {
      const event = new UserLogoutEvent();

      expect(event.type).toBe('user.logout');
      expect(event.toPayload()).toEqual({});
    });
  });

  describe('AgentCreatedEvent', () => {
    const mockAgent: Agent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'A test agent',
      model: 'gpt-4',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    /* Preconditions: Agent data provided
       Action: Create AgentCreatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with agent data', () => {
      const event = new AgentCreatedEvent(mockAgent);

      expect(event.type).toBe('agent.created');
      expect(event.data).toEqual(mockAgent);
      expect(event.toPayload()).toEqual({ data: mockAgent });
    });
  });

  describe('AgentUpdatedEvent', () => {
    /* Preconditions: Agent id and changed fields provided
       Action: Create AgentUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with id and changed fields', () => {
      const changedFields = { name: 'Updated Agent', model: 'gpt-4-turbo' };
      const event = new AgentUpdatedEvent('agent-1', changedFields);

      expect(event.type).toBe('agent.updated');
      expect(event.id).toBe('agent-1');
      expect(event.changedFields).toEqual(changedFields);
      expect(event.toPayload()).toEqual({ id: 'agent-1', changedFields });
    });
  });

  describe('AgentDeletedEvent', () => {
    /* Preconditions: Agent id provided
       Action: Create AgentDeletedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with id', () => {
      const event = new AgentDeletedEvent('agent-1');

      expect(event.type).toBe('agent.deleted');
      expect(event.id).toBe('agent-1');
      expect(event.toPayload()).toEqual({ id: 'agent-1' });
    });
  });

  describe('MessageCreatedEvent', () => {
    const mockMessage: Message = {
      id: 'msg-1',
      agentId: 'agent-1',
      role: 'user',
      content: 'Hello',
      createdAt: Date.now(),
    };

    /* Preconditions: Message data provided
       Action: Create MessageCreatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with message data', () => {
      const event = new MessageCreatedEvent(mockMessage);

      expect(event.type).toBe('message.created');
      expect(event.data).toEqual(mockMessage);
      expect(event.toPayload()).toEqual({ data: mockMessage });
    });
  });

  describe('MessageUpdatedEvent', () => {
    /* Preconditions: Message id and changed fields provided
       Action: Create MessageUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with id and changed fields', () => {
      const changedFields = { content: 'Updated content' };
      const event = new MessageUpdatedEvent('msg-1', changedFields);

      expect(event.type).toBe('message.updated');
      expect(event.id).toBe('msg-1');
      expect(event.changedFields).toEqual(changedFields);
      expect(event.toPayload()).toEqual({ id: 'msg-1', changedFields });
    });
  });

  describe('UserProfileUpdatedEvent', () => {
    /* Preconditions: User id and changed fields provided
       Action: Create UserProfileUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with id and changed fields', () => {
      const changedFields = { name: 'New Name', locale: 'ru' };
      const event = new UserProfileUpdatedEvent('user-1', changedFields);

      expect(event.type).toBe('user.profile.updated');
      expect(event.id).toBe('user-1');
      expect(event.changedFields).toEqual(changedFields);
      expect(event.toPayload()).toEqual({ id: 'user-1', changedFields });
    });
  });

  describe('isTypedEvent', () => {
    /* Preconditions: TypedEventClass instance provided
       Action: Call isTypedEvent
       Assertions: Returns true
       Requirements: realtime-events.3.6 */
    it('should return true for TypedEventClass instances', () => {
      const event = new UserLogoutEvent();
      expect(isTypedEvent(event)).toBe(true);
    });

    /* Preconditions: Non-TypedEventClass value provided
       Action: Call isTypedEvent
       Assertions: Returns false
       Requirements: realtime-events.3.6 */
    it('should return false for non-TypedEventClass values', () => {
      expect(isTypedEvent({})).toBe(false);
      expect(isTypedEvent(null)).toBe(false);
      expect(isTypedEvent(undefined)).toBe(false);
      expect(isTypedEvent('string')).toBe(false);
      expect(isTypedEvent(123)).toBe(false);
    });
  });
});
