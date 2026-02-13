// Requirements: realtime-events.1.2, realtime-events.3, realtime-events.8
/**
 * Event types and interfaces for the real-time event system
 * Source of truth for all event type definitions in Clerkly
 */

import { User } from '../../types';

// ============================================================================
// Base Event Types
// ============================================================================

/**
 * Base event interface that all events must extend
 * Requirements: realtime-events.3.6
 */
export interface BaseEvent {
  /** Unix timestamp in milliseconds when the event was created */
  timestamp: number;
}

/**
 * Base class for all typed events
 * Requirements: realtime-events.3.6
 */
export abstract class TypedEventClass<T extends EventType = EventType> {
  /** Event type identifier */
  abstract readonly type: T;

  /** Get payload without timestamp (timestamp is added by EventBus) */
  abstract toPayload(): EventPayloadWithoutTimestamp<T>;

  /** Protected constructor to ensure proper initialization */
  protected constructor() {}
}

/**
 * Event for entity creation
 * Requirements: realtime-events.3.2
 */
export interface EntityCreatedEvent<T> extends BaseEvent {
  /** Full entity data */
  data: T;
}

/**
 * Event for entity update
 * Requirements: realtime-events.3.3
 */
export interface EntityUpdatedEvent<T> extends BaseEvent {
  /** Entity ID */
  id: string;
  /** Changed fields with new values */
  changedFields: Partial<T>;
}

/**
 * Event for entity deletion
 * Requirements: realtime-events.3.4
 */
export interface EntityDeletedEvent extends BaseEvent {
  /** Entity ID */
  id: string;
}

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Agent entity
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Message entity
 */
export interface Message {
  id: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

// ============================================================================
// Event Payloads
// ============================================================================

// Agent events
export type AgentCreatedPayload = EntityCreatedEvent<Agent>;
export type AgentUpdatedPayload = EntityUpdatedEvent<Agent>;
export type AgentDeletedPayload = EntityDeletedEvent;

// Message events
export type MessageCreatedPayload = EntityCreatedEvent<Message>;
export type MessageUpdatedPayload = EntityUpdatedEvent<Message>;

// User events
export type UserLoginPayload = BaseEvent & { userId: string };
export type UserLogoutPayload = BaseEvent;
export type UserProfileUpdatedPayload = EntityUpdatedEvent<User>;

// ============================================================================
// Auth Events
// ============================================================================

/**
 * Auth success event payload
 * Emitted when OAuth flow completes successfully
 */
export interface AuthSucceededPayload extends BaseEvent {
  /** User ID from OAuth provider */
  userId: string;
}

/**
 * Auth failed event payload
 * Emitted when OAuth flow fails
 */
export interface AuthFailedPayload extends BaseEvent {
  /** Error message */
  error: string;
  /** Error code (e.g., 'invalid_grant', 'access_denied') */
  errorCode?: string;
}

/**
 * Profile synced event payload
 * Emitted when user profile is synchronized (fetched and saved)
 */
export interface ProfileSyncedPayload extends BaseEvent {
  /** User data */
  user: User;
}

// ============================================================================
// Error Events
// ============================================================================

/**
 * Error notification event payload
 * Emitted when a background error occurs that should be shown to user
 */
export interface ErrorCreatedPayload extends BaseEvent {
  /** Error message */
  message: string;
  /** Context of the operation that failed */
  context: string;
}

// ============================================================================
// Event Map
// ============================================================================

/**
 * Map of all event types to their payloads
 * Requirements: realtime-events.3.1
 */
export interface ClerklyEvents {
  // Agent events
  'agent.created': AgentCreatedPayload;
  'agent.updated': AgentUpdatedPayload;
  'agent.deleted': AgentDeletedPayload;

  // Message events
  'message.created': MessageCreatedPayload;
  'message.updated': MessageUpdatedPayload;

  // User events
  'user.login': UserLoginPayload;
  'user.logout': UserLogoutPayload;
  'user.profile.updated': UserProfileUpdatedPayload;

  // Auth events
  'auth.succeeded': AuthSucceededPayload;
  'auth.failed': AuthFailedPayload;
  'profile.synced': ProfileSyncedPayload;

  // Error events
  'error.created': ErrorCreatedPayload;
}

/**
 * All valid event type strings
 */
export type EventType = keyof ClerklyEvents;

/**
 * Get payload type for a specific event type
 */
export type EventPayload<T extends EventType> = ClerklyEvents[T];

/**
 * Generic event with type and payload
 */
export interface TypedEvent<T extends EventType = EventType> {
  type: T;
  payload: EventPayload<T>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Event handler callback type
 */
export type EventHandler<T extends EventType> = (payload: EventPayload<T>) => void;

/**
 * Wildcard event handler that receives all events
 */
export type WildcardEventHandler = <T extends EventType>(type: T, payload: EventPayload<T>) => void;

/**
 * Unsubscribe function returned by subscribe methods
 */
export type Unsubscribe = () => void;

/**
 * Options for publishing events
 */
export interface PublishOptions {
  /** If true, event is only delivered locally (not sent via IPC) */
  localOnly?: boolean;
}

/**
 * Payload type without timestamp (for publish method)
 * Timestamp is added automatically by EventBus
 */
export type EventPayloadWithoutTimestamp<T extends EventType> = Omit<ClerklyEvents[T], 'timestamp'>;

/**
 * Extract entity ID from event payload
 */
export function getEntityId(
  payload: BaseEvent & { id?: string; data?: { id?: string } }
): string | undefined {
  if ('id' in payload && typeof payload.id === 'string') {
    return payload.id;
  }
  if ('data' in payload && payload.data && typeof payload.data.id === 'string') {
    return payload.data.id;
  }
  return undefined;
}

/**
 * Create a unique key for timestamp deduplication
 */
export function getEventKey(type: EventType, payload: BaseEvent): string {
  const entityId = getEntityId(payload as BaseEvent & { id?: string; data?: { id?: string } });
  return entityId ? `${type}:${entityId}` : type;
}

// ============================================================================
// Event Classes
// ============================================================================

/**
 * Auth succeeded event
 * Emitted when OAuth flow completes successfully
 */
export class AuthSucceededEvent extends TypedEventClass<'auth.succeeded'> {
  readonly type = 'auth.succeeded' as const;

  constructor(public readonly userId: string) {
    super();
    if (!userId) {
      throw new Error('AuthSucceededEvent requires a non-empty userId');
    }
  }

  toPayload(): EventPayloadWithoutTimestamp<'auth.succeeded'> {
    return { userId: this.userId };
  }
}

/**
 * Auth failed event
 * Emitted when OAuth flow fails
 */
export class AuthFailedEvent extends TypedEventClass<'auth.failed'> {
  readonly type = 'auth.failed' as const;

  constructor(
    public readonly error: string,
    public readonly errorCode?: string
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'auth.failed'> {
    return { error: this.error, errorCode: this.errorCode };
  }
}

/**
 * Profile synced event
 * Emitted when user profile is synchronized
 */
export class ProfileSyncedEvent extends TypedEventClass<'profile.synced'> {
  readonly type = 'profile.synced' as const;

  constructor(public readonly user: User) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'profile.synced'> {
    return { user: this.user };
  }
}

/**
 * Error created event
 * Emitted when a background error occurs
 */
export class ErrorCreatedEvent extends TypedEventClass<'error.created'> {
  readonly type = 'error.created' as const;

  constructor(
    public readonly message: string,
    public readonly context: string
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'error.created'> {
    return { message: this.message, context: this.context };
  }
}

/**
 * User login event
 */
export class UserLoginEvent extends TypedEventClass<'user.login'> {
  readonly type = 'user.login' as const;

  constructor(public readonly userId: string) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'user.login'> {
    return { userId: this.userId };
  }
}

/**
 * User logout event
 */
export class UserLogoutEvent extends TypedEventClass<'user.logout'> {
  readonly type = 'user.logout' as const;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'user.logout'> {
    return {};
  }
}

/**
 * Agent created event
 */
export class AgentCreatedEvent extends TypedEventClass<'agent.created'> {
  readonly type = 'agent.created' as const;

  constructor(public readonly data: Agent) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'agent.created'> {
    return { data: this.data };
  }
}

/**
 * Agent updated event
 */
export class AgentUpdatedEvent extends TypedEventClass<'agent.updated'> {
  readonly type = 'agent.updated' as const;

  constructor(
    public readonly id: string,
    public readonly changedFields: Partial<Agent>
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'agent.updated'> {
    return { id: this.id, changedFields: this.changedFields };
  }
}

/**
 * Agent deleted event
 */
export class AgentDeletedEvent extends TypedEventClass<'agent.deleted'> {
  readonly type = 'agent.deleted' as const;

  constructor(public readonly id: string) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'agent.deleted'> {
    return { id: this.id };
  }
}

/**
 * Message created event
 */
export class MessageCreatedEvent extends TypedEventClass<'message.created'> {
  readonly type = 'message.created' as const;

  constructor(public readonly data: Message) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'message.created'> {
    return { data: this.data };
  }
}

/**
 * Message updated event
 */
export class MessageUpdatedEvent extends TypedEventClass<'message.updated'> {
  readonly type = 'message.updated' as const;

  constructor(
    public readonly id: string,
    public readonly changedFields: Partial<Message>
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'message.updated'> {
    return { id: this.id, changedFields: this.changedFields };
  }
}

/**
 * User profile updated event
 */
export class UserProfileUpdatedEvent extends TypedEventClass<'user.profile.updated'> {
  readonly type = 'user.profile.updated' as const;

  constructor(
    public readonly id: string,
    public readonly changedFields: Partial<User>
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<'user.profile.updated'> {
    return { id: this.id, changedFields: this.changedFields };
  }
}

/**
 * Type guard to check if value is a TypedEventClass instance
 */
export function isTypedEvent(value: unknown): value is TypedEventClass {
  return value instanceof TypedEventClass;
}
