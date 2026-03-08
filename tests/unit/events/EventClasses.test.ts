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
  LLMPipelineDiagnosticEvent,
  UserLoginEvent,
  UserLogoutEvent,
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentArchivedEvent,
  MessageCreatedEvent,
  MessageUpdatedEvent,
  MessageLlmReasoningUpdatedEvent,
  MessageLlmTextUpdatedEvent,
  MessageToolCallEvent,
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

  describe('LLMPipelineDiagnosticEvent', () => {
    /* Preconditions: Diagnostic payload fields provided
       Action: Create LLMPipelineDiagnosticEvent
       Assertions: Event has correct type and payload for bridge to renderer Developer Log
       Requirements: realtime-events.4.8 */
    it('should create event with diagnostic details', () => {
      const event = new LLMPipelineDiagnosticEvent(
        'error',
        'MainPipeline',
        'Pipeline failure diagnostics: timeout',
        {
          agentId: 'agent-1',
          userMessageId: 42,
          signalAborted: false,
          errorName: 'LLMRequestAbortedError',
          errorType: 'timeout',
        }
      );

      expect(event.type).toBe('llm.pipeline.diagnostic');
      expect(event.toPayload()).toEqual({
        level: 'error',
        context: 'MainPipeline',
        message: 'Pipeline failure diagnostics: timeout',
        details: {
          agentId: 'agent-1',
          userMessageId: 42,
          signalAborted: false,
          errorName: 'LLMRequestAbortedError',
          errorType: 'timeout',
        },
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

    /* Preconditions: AgentSnapshot and changed fields provided
       Action: Create AgentUpdatedEvent with changed fields
       Assertions: Event payload includes changedFields
       Requirements: realtime-events.3.3 */
    it('should include changedFields when provided', () => {
      const event = new AgentUpdatedEvent(mockAgentSnapshot, ['status', 'updatedAt']);

      expect(event.changedFields).toEqual(['status', 'updatedAt']);
      expect(event.toPayload()).toEqual({
        agent: mockAgentSnapshot,
        changedFields: ['status', 'updatedAt'],
      });
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
      kind: 'user',
      timestamp: 1705315800000,
      replyToMessageId: null,
      payload: { data: { text: 'Hello' } },
      hidden: false,
      done: true,
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
      expect(event.message.kind).toBe('user');
      expect(event.message.payload.data).toEqual({ text: 'Hello' });
    });
  });

  describe('MessageUpdatedEvent', () => {
    const mockMessageSnapshot: MessageSnapshot = {
      id: 1,
      agentId: 'agent-1',
      kind: 'user',
      timestamp: 1705315800000,
      replyToMessageId: null,
      payload: { data: { text: 'Updated' } },
      hidden: false,
      done: true,
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

    /* Preconditions: MessageSnapshot and changed fields provided
       Action: Create MessageUpdatedEvent with changed fields
       Assertions: Event payload includes changedFields
       Requirements: realtime-events.3.3 */
    it('should include changedFields when provided', () => {
      const event = new MessageUpdatedEvent(mockMessageSnapshot, ['payload', 'done']);

      expect(event.changedFields).toEqual(['payload', 'done']);
      expect(event.toPayload()).toEqual({
        message: mockMessageSnapshot,
        changedFields: ['payload', 'done'],
      });
    });
  });

  describe('UserProfileUpdatedEvent', () => {
    /* Preconditions: User id and changed fields provided
       Action: Create UserProfileUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: realtime-events.3.6 */
    it('should create event with id and changed fields', () => {
      const changedFields = ['locale', 'name'];
      const event = new UserProfileUpdatedEvent('user-1', changedFields);

      expect(event.type).toBe('user.profile.updated');
      expect(event.id).toBe('user-1');
      expect(event.changedFields).toEqual(changedFields);
      expect(event.toPayload()).toEqual({ id: 'user-1', changedFields });
    });

    /* Preconditions: Only user id provided
       Action: Create UserProfileUpdatedEvent without changed fields
       Assertions: Payload contains only id
       Requirements: realtime-events.3.3.1 */
    it('should create event without changed fields when omitted', () => {
      const event = new UserProfileUpdatedEvent('user-1');

      expect(event.type).toBe('user.profile.updated');
      expect(event.id).toBe('user-1');
      expect(event.changedFields).toBeUndefined();
      expect(event.toPayload()).toEqual({ id: 'user-1' });
    });
  });

  describe('MessageLlmReasoningUpdatedEvent', () => {
    /* Preconditions: Reasoning chunk payload fields provided
       Action: Create MessageLlmReasoningUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: llm-integration.2 */
    it('should create reasoning streaming event with payload', () => {
      const event = new MessageLlmReasoningUpdatedEvent(11, 'agent-1', 'th', 'thinking');

      expect(event.type).toBe('message.llm.reasoning.updated');
      expect(event.toPayload()).toEqual({
        messageId: 11,
        agentId: 'agent-1',
        delta: 'th',
        accumulatedText: 'thinking',
      });
    });
  });

  describe('MessageLlmTextUpdatedEvent', () => {
    /* Preconditions: Text chunk payload fields provided
       Action: Create MessageLlmTextUpdatedEvent
       Assertions: Event has correct type and payload
       Requirements: llm-integration.2 */
    it('should create text streaming event with payload', () => {
      const event = new MessageLlmTextUpdatedEvent(12, 'agent-1', 'he', 'hello');

      expect(event.type).toBe('message.llm.text.updated');
      expect(event.toPayload()).toEqual({
        messageId: 12,
        agentId: 'agent-1',
        delta: 'he',
        accumulatedText: 'hello',
      });
    });
  });

  describe('MessageToolCallEvent', () => {
    /* Preconditions: Fully assembled tool call fields provided
       Action: Create MessageToolCallEvent
       Assertions: Event has correct type and payload
       Requirements: llm-integration.11.1 */
    it('should create single-shot tool call event with payload', () => {
      const event = new MessageToolCallEvent('agent-1', 13, 'call-1', 'search_docs', {
        query: 'changedFields format',
      });

      expect(event.type).toBe('message.tool_call');
      expect(event.toPayload()).toEqual({
        agentId: 'agent-1',
        llmMessageId: 13,
        callId: 'call-1',
        toolName: 'search_docs',
        arguments: { query: 'changedFields format' },
      });
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
