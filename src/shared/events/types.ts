// Requirements: realtime-events.1.2, realtime-events.3, realtime-events.8
/**
 * Event types and interfaces for the real-time event system
 * Source of truth for all event type definitions in Clerkly
 */

import { User } from '../../types';
import { EVENT_TYPES } from './constants';
import { AgentStatus, MessagePayload } from '../utils/agentStatus';

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
 * Agent entity for events
 * Contains all fields from DB plus computed status
 */
export interface AgentSnapshot {
  id: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  status: AgentStatus;
}

/**
 * Message payload kinds
 * Requirements: agents.7.2
 */
export type MessageKind =
  | 'user'
  | 'llm'
  | 'tool_call'
  | 'code_exec'
  | 'final_answer'
  | 'request_scope'
  | 'artifact';

/**
 * Message snapshot for events
 * Contains parsed payload instead of JSON string
 */
export interface MessageSnapshot {
  id: number;
  agentId: string;
  timestamp: number; // Unix timestamp in milliseconds
  payload: MessagePayload;
}

// ============================================================================
// Event Payloads
// ============================================================================

// Agent events
export interface AgentCreatedPayload extends BaseEvent {
  agent: AgentSnapshot;
  timestamp: number;
}
export interface AgentUpdatedPayload extends BaseEvent {
  agent: AgentSnapshot;
  timestamp: number;
}
export interface AgentArchivedPayload extends BaseEvent {
  agent: AgentSnapshot;
  timestamp: number;
}

// Message events
export interface MessageCreatedPayload extends BaseEvent {
  message: MessageSnapshot;
  timestamp: number;
}
export interface MessageUpdatedPayload extends BaseEvent {
  message: MessageSnapshot;
  timestamp: number;
}

// User events
export type UserLoginPayload = BaseEvent & { userId: string };
export type UserLogoutPayload = BaseEvent;
export type UserProfileUpdatedPayload = EntityUpdatedEvent<User>;

// ============================================================================
// Auth Events
// ============================================================================

/**
 * Auth started event payload
 * Emitted when user clicks "Continue with Google"
 * Requirements: google-oauth-auth.8.4
 */
export type AuthStartedPayload = BaseEvent;

/**
 * Auth callback received event payload
 * Emitted when deep link is received from Google
 * Requirements: google-oauth-auth.8.4
 */
export type AuthCallbackReceivedPayload = BaseEvent;

/**
 * Auth completed event payload
 * Emitted when OAuth flow completes successfully
 * Requirements: google-oauth-auth.8.4
 */
export interface AuthCompletedPayload extends BaseEvent {
  /** User ID */
  userId: string;
  /** User profile data */
  profile: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
}

/**
 * Auth failed event payload
 * Emitted when OAuth flow fails
 * Requirements: google-oauth-auth.8.4
 */
export interface AuthFailedPayload extends BaseEvent {
  /** Error code (e.g., 'token_exchange_failed', 'profile_fetch_failed') */
  code: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Auth cancelled event payload
 * Emitted when user cancels OAuth in Google
 * Requirements: google-oauth-auth.8.4
 */
export type AuthCancelledPayload = BaseEvent;

/**
 * Auth signed out event payload
 * Emitted when user signs out
 * Requirements: google-oauth-auth.8.4
 */
export type AuthSignedOutPayload = BaseEvent;

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
 * IMPORTANT: Use EVENT_TYPES constants for event type strings
 */
export interface ClerklyEvents {
  // Agent events
  [EVENT_TYPES.AGENT_CREATED]: AgentCreatedPayload;
  [EVENT_TYPES.AGENT_UPDATED]: AgentUpdatedPayload;
  [EVENT_TYPES.AGENT_ARCHIVED]: AgentArchivedPayload;

  // Message events
  [EVENT_TYPES.MESSAGE_CREATED]: MessageCreatedPayload;
  [EVENT_TYPES.MESSAGE_UPDATED]: MessageUpdatedPayload;

  // User events
  [EVENT_TYPES.USER_LOGIN]: UserLoginPayload;
  [EVENT_TYPES.USER_LOGOUT]: UserLogoutPayload;
  [EVENT_TYPES.USER_PROFILE_UPDATED]: UserProfileUpdatedPayload;

  // Auth events
  [EVENT_TYPES.AUTH_STARTED]: AuthStartedPayload;
  [EVENT_TYPES.AUTH_CALLBACK_RECEIVED]: AuthCallbackReceivedPayload;
  [EVENT_TYPES.AUTH_COMPLETED]: AuthCompletedPayload;
  [EVENT_TYPES.AUTH_FAILED]: AuthFailedPayload;
  [EVENT_TYPES.AUTH_CANCELLED]: AuthCancelledPayload;
  [EVENT_TYPES.AUTH_SIGNED_OUT]: AuthSignedOutPayload;

  // Error events
  [EVENT_TYPES.ERROR_CREATED]: ErrorCreatedPayload;
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

// Type aliases for event type literals (for use in generic constraints)
type AuthStartedType = typeof EVENT_TYPES.AUTH_STARTED;
type AuthCallbackReceivedType = typeof EVENT_TYPES.AUTH_CALLBACK_RECEIVED;
type AuthCompletedType = typeof EVENT_TYPES.AUTH_COMPLETED;
type AuthFailedType = typeof EVENT_TYPES.AUTH_FAILED;
type AuthCancelledType = typeof EVENT_TYPES.AUTH_CANCELLED;
type AuthSignedOutType = typeof EVENT_TYPES.AUTH_SIGNED_OUT;
type ErrorCreatedType = typeof EVENT_TYPES.ERROR_CREATED;
type UserLoginType = typeof EVENT_TYPES.USER_LOGIN;
type UserLogoutType = typeof EVENT_TYPES.USER_LOGOUT;
type AgentCreatedType = typeof EVENT_TYPES.AGENT_CREATED;
type AgentUpdatedType = typeof EVENT_TYPES.AGENT_UPDATED;
type AgentArchivedType = typeof EVENT_TYPES.AGENT_ARCHIVED;
type MessageCreatedType = typeof EVENT_TYPES.MESSAGE_CREATED;
type MessageUpdatedType = typeof EVENT_TYPES.MESSAGE_UPDATED;
type UserProfileUpdatedType = typeof EVENT_TYPES.USER_PROFILE_UPDATED;

/**
 * Auth started event
 * Emitted when user clicks "Continue with Google"
 */
export class AuthStartedEvent extends TypedEventClass<AuthStartedType> {
  readonly type = EVENT_TYPES.AUTH_STARTED;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthStartedType> {
    return {};
  }
}

/**
 * Auth callback received event
 * Emitted when deep link is received from Google
 */
export class AuthCallbackReceivedEvent extends TypedEventClass<AuthCallbackReceivedType> {
  readonly type = EVENT_TYPES.AUTH_CALLBACK_RECEIVED;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthCallbackReceivedType> {
    return {};
  }
}

/**
 * Auth completed event
 * Emitted when OAuth flow completes successfully
 */
export class AuthCompletedEvent extends TypedEventClass<AuthCompletedType> {
  readonly type = EVENT_TYPES.AUTH_COMPLETED;

  constructor(
    public readonly userId: string,
    public readonly profile: {
      id: string;
      email: string;
      name: string;
      picture?: string;
    }
  ) {
    super();
    if (!userId) {
      throw new Error('AuthCompletedEvent requires a non-empty userId');
    }
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthCompletedType> {
    return { userId: this.userId, profile: this.profile };
  }
}

/**
 * Auth failed event
 * Emitted when OAuth flow fails
 */
export class AuthFailedEvent extends TypedEventClass<AuthFailedType> {
  readonly type = EVENT_TYPES.AUTH_FAILED;

  constructor(
    public readonly code: string,
    public readonly message: string
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthFailedType> {
    return { code: this.code, message: this.message };
  }
}

/**
 * Auth cancelled event
 * Emitted when user cancels OAuth in Google
 */
export class AuthCancelledEvent extends TypedEventClass<AuthCancelledType> {
  readonly type = EVENT_TYPES.AUTH_CANCELLED;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthCancelledType> {
    return {};
  }
}

/**
 * Auth signed out event
 * Emitted when user signs out
 */
export class AuthSignedOutEvent extends TypedEventClass<AuthSignedOutType> {
  readonly type = EVENT_TYPES.AUTH_SIGNED_OUT;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AuthSignedOutType> {
    return {};
  }
}

/**
 * Error created event
 * Emitted when a background error occurs
 */
export class ErrorCreatedEvent extends TypedEventClass<ErrorCreatedType> {
  readonly type = EVENT_TYPES.ERROR_CREATED;

  constructor(
    public readonly message: string,
    public readonly context: string
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<ErrorCreatedType> {
    return { message: this.message, context: this.context };
  }
}

/**
 * User login event
 */
export class UserLoginEvent extends TypedEventClass<UserLoginType> {
  readonly type = EVENT_TYPES.USER_LOGIN;

  constructor(public readonly userId: string) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<UserLoginType> {
    return { userId: this.userId };
  }
}

/**
 * User logout event
 */
export class UserLogoutEvent extends TypedEventClass<UserLogoutType> {
  readonly type = EVENT_TYPES.USER_LOGOUT;

  constructor() {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<UserLogoutType> {
    return {};
  }
}

/**
 * Agent created event
 */
export class AgentCreatedEvent extends TypedEventClass<AgentCreatedType> {
  readonly type = EVENT_TYPES.AGENT_CREATED;
  readonly timestamp: number;

  constructor(public readonly agent: AgentSnapshot) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<AgentCreatedType> {
    return { agent: this.agent };
  }
}

/**
 * Agent updated event
 */
export class AgentUpdatedEvent extends TypedEventClass<AgentUpdatedType> {
  readonly type = EVENT_TYPES.AGENT_UPDATED;
  readonly timestamp: number;

  constructor(public readonly agent: AgentSnapshot) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<AgentUpdatedType> {
    return { agent: this.agent };
  }
}

/**
 * Agent archived event
 * Used when agent is "deleted" in UI (soft delete via archiving)
 * Requirements: agents.12.3
 */
export class AgentArchivedEvent extends TypedEventClass<AgentArchivedType> {
  readonly type = EVENT_TYPES.AGENT_ARCHIVED;
  readonly timestamp: number;

  constructor(public readonly agent: AgentSnapshot) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<AgentArchivedType> {
    return { agent: this.agent };
  }
}

/**
 * Message created event
 */
export class MessageCreatedEvent extends TypedEventClass<MessageCreatedType> {
  readonly type = EVENT_TYPES.MESSAGE_CREATED;
  readonly timestamp: number;

  constructor(public readonly message: MessageSnapshot) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<MessageCreatedType> {
    return { message: this.message };
  }
}

/**
 * Message updated event
 */
export class MessageUpdatedEvent extends TypedEventClass<MessageUpdatedType> {
  readonly type = EVENT_TYPES.MESSAGE_UPDATED;
  readonly timestamp: number;

  constructor(public readonly message: MessageSnapshot) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<MessageUpdatedType> {
    return { message: this.message };
  }
}

/**
 * User profile updated event
 */
export class UserProfileUpdatedEvent extends TypedEventClass<UserProfileUpdatedType> {
  readonly type = EVENT_TYPES.USER_PROFILE_UPDATED;

  constructor(
    public readonly id: string,
    public readonly changedFields: Partial<User>
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<UserProfileUpdatedType> {
    return { id: this.id, changedFields: this.changedFields };
  }
}

/**
 * Type guard to check if value is a TypedEventClass instance
 */
export function isTypedEvent(value: unknown): value is TypedEventClass {
  return value instanceof TypedEventClass;
}
