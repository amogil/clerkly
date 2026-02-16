// Requirements: realtime-events.3.6, realtime-events.9, google-oauth-auth.8.4
/**
 * Unit tests for TypedEventClass implementations
 * Tests event class constructors and toPayload methods
 */

import {
  AuthStartedEvent,
  AuthCallbackReceivedEvent,
  AuthCompletedEvent,
  AuthFailedEvent,
  AuthCancelledEvent,
  AuthSignedOutEvent,
  ErrorCreatedEvent,
  UserLoginEvent,
  UserLogoutEvent,
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
  MessageCreatedEvent,
  MessageUpdatedEvent,
  UserProfileUpdatedEvent,
  isTypedEvent,
  AgentSnapshot,
  MessageSnapshot,
} from '../../../src/shared/events/types';

describe('Event Classes', () => {
  describe('AuthStartedEvent', () => {
    /* Preconditions: None
       Action: Create AuthStartedEvent
       Assertions: Event has correct type and empty payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with empty payload', () => {
      const event = new AuthStartedEvent();

      expect(event.type).toBe('auth.started');
      expect(event.toPayload()).toEqual({});
    });
  });

  describe('AuthCallbackReceivedEvent', () => {
    /* Preconditions: None
       Action: Create AuthCallbackReceivedEvent
       Assertions: Event has correct type and empty payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with empty payload', () => {
      const event = new AuthCallbackReceivedEvent();

      expect(event.type).toBe('auth.callback-received');
      expect(event.toPayload()).toEqual({});
    });
  });

  describe('AuthCompletedEvent', () => {
    const mockProfile = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    };

    /* Preconditions: Valid userId and profile provided
       Action: Create AuthCompletedEvent
       Assertions: Event has correct type and payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with userId and profile', () => {
      const event = new AuthCompletedEvent('user-123', mockProfile);

      expect(event.type).toBe('auth.completed');
      expect(event.userId).toBe('user-123');
      expect(event.profile).toEqual(mockProfile);
      expect(event.toPayload()).toEqual({ userId: 'user-123', profile: mockProfile });
    });

    /* Preconditions: Empty userId provided
       Action: Create AuthCompletedEvent
       Assertions: Throws error
       Requirements: google-oauth-auth.8.4 */
    it('should throw error for empty userId', () => {
      expect(() => new AuthCompletedEvent('', mockProfile)).toThrow(
        'AuthCompletedEvent requires a non-empty userId'
      );
    });

    /* Preconditions: Profile without picture provided
       Action: Create AuthCompletedEvent
       Assertions: Event has correct type and payload without picture
       Requirements: google-oauth-auth.8.4 */
    it('should create event with profile without picture', () => {
      const profileWithoutPicture = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const event = new AuthCompletedEvent('user-123', profileWithoutPicture);

      expect(event.type).toBe('auth.completed');
      expect(event.profile.picture).toBeUndefined();
    });
  });

  describe('AuthFailedEvent', () => {
    /* Preconditions: Error code and message provided
       Action: Create AuthFailedEvent
       Assertions: Event has correct type and payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with code and message', () => {
      const event = new AuthFailedEvent('token_exchange_failed', 'Ошибка обмена токенов');

      expect(event.type).toBe('auth.failed');
      expect(event.code).toBe('token_exchange_failed');
      expect(event.message).toBe('Ошибка обмена токенов');
      expect(event.toPayload()).toEqual({
        code: 'token_exchange_failed',
        message: 'Ошибка обмена токенов',
      });
    });
  });

  describe('AuthCancelledEvent', () => {
    /* Preconditions: None
       Action: Create AuthCancelledEvent
       Assertions: Event has correct type and empty payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with empty payload', () => {
      const event = new AuthCancelledEvent();

      expect(event.type).toBe('auth.cancelled');
      expect(event.toPayload()).toEqual({});
    });
  });

  describe('AuthSignedOutEvent', () => {
    /* Preconditions: None
       Action: Create AuthSignedOutEvent
       Assertions: Event has correct type and empty payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with empty payload', () => {
      const event = new AuthSignedOutEvent();

      expect(event.type).toBe('auth.signed-out');
      expect(event.toPayload()).toEqual({});
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
    const mockAgentSnapshot: AgentSnapshot = {
      id: 'agent-1',
      name: 'Test Agent',
      createdAt: 1705315800000,
      updatedAt: 1705315800000,
      archivedAt: null,
      status: 'new',
    };

    /* Preconditions: AgentSnapshot provided
       Action: Create AgentCreatedEvent
       Assertions: Event has correct type, timestamp, and payload with snapshot
       Requirements: realtime-events.3.6, realtime-events.9.1, realtime-events.9.7 */
    it('should create event with agent snapshot and timestamp', () => {
      const event = new AgentCreatedEvent(mockAgentSnapshot);

      expect(event.type).toBe('agent.created');
      expect(event.agent).toEqual(mockAgentSnapshot);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('number');
      expect(event.toPayload()).toEqual({ agent: mockAgentSnapshot });
    });
  });

  describe('AgentUpdatedEvent', () => {
    const mockAgentSnapshot: AgentSnapshot = {
      id: 'agent-1',
      name: 'Updated Agent',
      createdAt: 1705315800000,
      updatedAt: 1705316000000,
      archivedAt: null,
      status: 'in-progress',
    };

    /* Preconditions: AgentSnapshot provided
       Action: Create AgentUpdatedEvent
       Assertions: Event has correct type, timestamp, and payload with snapshot
       Requirements: realtime-events.3.6, realtime-events.9.1, realtime-events.9.7 */
    it('should create event with agent snapshot and timestamp', () => {
      const event = new AgentUpdatedEvent(mockAgentSnapshot);

      expect(event.type).toBe('agent.updated');
      expect(event.agent).toEqual(mockAgentSnapshot);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('number');
      expect(event.toPayload()).toEqual({ agent: mockAgentSnapshot });
    });
  });

  describe('AgentArchivedEvent', () => {
    const mockArchivedSnapshot: AgentSnapshot = {
      id: 'agent-1',
      name: 'Archived Agent',
      createdAt: 1705315800000,
      updatedAt: 1705316000000,
      archivedAt: 1705316200000,
      status: 'completed',
    };

    /* Preconditions: AgentSnapshot with archivedAt provided
       Action: Create AgentArchivedEvent
       Assertions: Event has correct type, timestamp, and payload with snapshot
       Requirements: realtime-events.3.6, realtime-events.9.1, realtime-events.9.7, agents.12.3 */
    it('should create event with agent snapshot and timestamp', () => {
      const event = new AgentArchivedEvent(mockArchivedSnapshot);

      expect(event.type).toBe('agent.archived');
      expect(event.agent).toEqual(mockArchivedSnapshot);
      expect(event.agent.archivedAt).toBe(1705316200000);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('number');
      expect(event.toPayload()).toEqual({ agent: mockArchivedSnapshot });
    });
  });

  describe('MessageCreatedEvent', () => {
    const mockMessageSnapshot: MessageSnapshot = {
      id: 1,
      agentId: 'agent-1',
      timestamp: 1705315800000,
      payload: { kind: 'user', data: { text: 'Hello' } },
    };

    /* Preconditions: MessageSnapshot provided
       Action: Create MessageCreatedEvent
       Assertions: Event has correct type, timestamp, and payload with snapshot
       Requirements: realtime-events.3.6, realtime-events.9.1, realtime-events.9.7, agents.7.1 */
    it('should create event with message snapshot and timestamp', () => {
      const event = new MessageCreatedEvent(mockMessageSnapshot);

      expect(event.type).toBe('message.created');
      expect(event.message).toEqual(mockMessageSnapshot);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('number');
      expect(event.toPayload()).toEqual({ message: mockMessageSnapshot });
    });

    /* Preconditions: MessageSnapshot with parsed payload provided
       Action: Create MessageCreatedEvent
       Assertions: Payload is object, not JSON string
       Requirements: realtime-events.9.4 */
    it('should have parsed payload object, not JSON string', () => {
      const event = new MessageCreatedEvent(mockMessageSnapshot);

      expect(typeof event.message.payload).toBe('object');
      expect(event.message.payload.kind).toBe('user');
      expect(event.message.payload.data).toEqual({ text: 'Hello' });
    });
  });

  describe('MessageUpdatedEvent', () => {
    const mockMessageSnapshot: MessageSnapshot = {
      id: 1,
      agentId: 'agent-1',
      timestamp: 1705315800000,
      payload: { kind: 'user', data: { text: 'Updated' } },
    };

    /* Preconditions: MessageSnapshot provided
       Action: Create MessageUpdatedEvent
       Assertions: Event has correct type, timestamp, and payload with snapshot
       Requirements: realtime-events.3.6, realtime-events.9.1, realtime-events.9.7, agents.7.1 */
    it('should create event with message snapshot and timestamp', () => {
      const event = new MessageUpdatedEvent(mockMessageSnapshot);

      expect(event.type).toBe('message.updated');
      expect(event.message).toEqual(mockMessageSnapshot);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe('number');
      expect(event.toPayload()).toEqual({ message: mockMessageSnapshot });
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
