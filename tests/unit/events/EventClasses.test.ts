// Requirements: realtime-events.3.6, google-oauth-auth.8.4
/**
 * Unit tests for TypedEventClass implementations
 * Tests event class constructors and toPayload methods
 */

import {
  AuthStartedEvent,
  AuthCallbackReceivedEvent,
  AuthProfileFetchingEvent,
  AuthCompletedEvent,
  AuthFailedEvent,
  AuthCancelledEvent,
  AuthSignedOutEvent,
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

  describe('AuthProfileFetchingEvent', () => {
    /* Preconditions: None
       Action: Create AuthProfileFetchingEvent
       Assertions: Event has correct type and empty payload
       Requirements: google-oauth-auth.8.4 */
    it('should create event with empty payload', () => {
      const event = new AuthProfileFetchingEvent();

      expect(event.type).toBe('auth.profile-fetching');
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
