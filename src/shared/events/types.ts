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
  kind: string;
  timestamp: number; // Unix timestamp in milliseconds
  payload: MessagePayload;
  replyToMessageId: number | null;
  /** Hidden messages are not shown in UI and excluded from LLM history */
  hidden: boolean;
  /** Completion flag for message lifecycle */
  done: boolean;
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

// LLM reasoning streaming event
export interface MessageLlmReasoningUpdatedPayload extends BaseEvent {
  messageId: number;
  agentId: string;
  /** New reasoning chunk */
  delta: string;
  /** Full accumulated reasoning text so far */
  accumulatedText: string;
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

/**
 * App coordinator state changed event payload
 * Emitted when AppCoordinator transitions between phases
 */
export interface AppCoordinatorStateChangedPayload extends BaseEvent {
  state: AppCoordinatorState;
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

/**
 * LLM pipeline diagnostic event payload
 * Emitted for main-process LLM pipeline failures to mirror diagnostics into renderer Developer Log
 * Requirements: realtime-events.4.9
 */
export interface LLMPipelineDiagnosticPayload extends BaseEvent {
  /** Log level for renderer console output */
  level: 'warn' | 'error';
  /** Main-process context that produced diagnostic */
  context: 'MainPipeline';
  /** Human-readable diagnostic message */
  message: string;
  /** Structured details for debugging */
  details: {
    agentId: string;
    userMessageId: number;
    signalAborted: boolean;
    errorName: string;
    errorType: 'auth' | 'rate_limit' | 'provider' | 'network' | 'timeout';
  };
}

/**
 * Agent rate limit event payload
 * Emitted when LLM returns 429 — triggers countdown banner in UI
 * Requirements: llm-integration.3.7
 */
export interface AgentRateLimitPayload extends BaseEvent {
  agentId: string;
  /** ID of the user message that triggered the rate-limited request */
  userMessageId: number;
  /** Seconds to wait before retrying */
  retryAfterSeconds: number;
}

// App coordinator events
export type AppScreen = 'login' | 'agents' | 'settings' | 'error-demo';
export type AppPhase =
  | 'booting'
  | 'unauthenticated'
  | 'authenticating'
  | 'preparing-session'
  | 'waiting-for-chats'
  | 'ready'
  | 'error';

export interface AppCoordinatorState {
  phase: AppPhase;
  authorized: boolean;
  targetScreen: AppScreen;
  reason?: string;
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
  [EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED]: MessageLlmReasoningUpdatedPayload;

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
  [EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED]: AppCoordinatorStateChangedPayload;

  // Error events
  [EVENT_TYPES.ERROR_CREATED]: ErrorCreatedPayload;
  [EVENT_TYPES.LLM_PIPELINE_DIAGNOSTIC]: LLMPipelineDiagnosticPayload;

  // Rate limit events
  [EVENT_TYPES.AGENT_RATE_LIMIT]: AgentRateLimitPayload;
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
  payload: BaseEvent & {
    id?: string;
    data?: { id?: string };
    agent?: { id?: string };
    message?: { id?: number };
    messageId?: number;
  }
): string | undefined {
  // Old format: payload.id
  if ('id' in payload && typeof payload.id === 'string') {
    return payload.id;
  }
  // Old format: payload.data.id
  if ('data' in payload && payload.data && typeof payload.data.id === 'string') {
    return payload.data.id;
  }
  // New snapshot format: payload.agent.id (AgentSnapshot)
  if ('agent' in payload && payload.agent && typeof payload.agent.id === 'string') {
    return payload.agent.id;
  }
  // New snapshot format: payload.message.id (MessageSnapshot)
  if ('message' in payload && payload.message && typeof payload.message.id === 'number') {
    return String(payload.message.id);
  }
  // Message reasoning payload: payload.messageId
  if ('messageId' in payload && typeof payload.messageId === 'number') {
    return String(payload.messageId);
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
type AppCoordinatorStateChangedType = typeof EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED;
type ErrorCreatedType = typeof EVENT_TYPES.ERROR_CREATED;
type LLMPipelineDiagnosticType = typeof EVENT_TYPES.LLM_PIPELINE_DIAGNOSTIC;
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
 * App coordinator state changed event
 * Emitted when AppCoordinator transitions between phases
 */
export class AppCoordinatorStateChangedEvent extends TypedEventClass<AppCoordinatorStateChangedType> {
  readonly type = EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED;

  constructor(public readonly state: AppCoordinatorState) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<AppCoordinatorStateChangedType> {
    return { state: this.state };
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
 * LLM pipeline diagnostic event
 * Emitted for LLM pipeline failures to mirror diagnostics into renderer Developer Log
 * Requirements: realtime-events.4.8, realtime-events.4.9
 */
export class LLMPipelineDiagnosticEvent extends TypedEventClass<LLMPipelineDiagnosticType> {
  readonly type = EVENT_TYPES.LLM_PIPELINE_DIAGNOSTIC;

  constructor(
    public readonly level: 'warn' | 'error',
    public readonly context: 'MainPipeline',
    public readonly message: string,
    public readonly details: {
      agentId: string;
      userMessageId: number;
      signalAborted: boolean;
      errorName: string;
      errorType: 'auth' | 'rate_limit' | 'provider' | 'network' | 'timeout';
    }
  ) {
    super();
  }

  toPayload(): EventPayloadWithoutTimestamp<LLMPipelineDiagnosticType> {
    return {
      level: this.level,
      context: this.context,
      message: this.message,
      details: this.details,
    };
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
 * Message LLM reasoning updated event
 * Emitted on each reasoning chunk during LLM streaming
 * Requirements: llm-integration.5.1
 */
export class MessageLlmReasoningUpdatedEvent extends TypedEventClass<
  typeof EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED
> {
  readonly type = EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED;
  readonly timestamp: number;

  constructor(
    public readonly messageId: number,
    public readonly agentId: string,
    public readonly delta: string,
    public readonly accumulatedText: string
  ) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<typeof EVENT_TYPES.MESSAGE_LLM_REASONING_UPDATED> {
    return {
      messageId: this.messageId,
      agentId: this.agentId,
      delta: this.delta,
      accumulatedText: this.accumulatedText,
    };
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

type AgentRateLimitType = typeof EVENT_TYPES.AGENT_RATE_LIMIT;

/**
 * Agent rate limit event
 * Emitted when LLM returns 429 — triggers countdown banner in UI
 * Requirements: llm-integration.3.7
 */
export class AgentRateLimitEvent extends TypedEventClass<AgentRateLimitType> {
  readonly type = EVENT_TYPES.AGENT_RATE_LIMIT;
  readonly timestamp: number;

  constructor(
    public readonly agentId: string,
    public readonly userMessageId: number,
    public readonly retryAfterSeconds: number
  ) {
    super();
    this.timestamp = Date.now();
  }

  toPayload(): EventPayloadWithoutTimestamp<AgentRateLimitType> {
    return {
      agentId: this.agentId,
      userMessageId: this.userMessageId,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

/**
 * Type guard to check if value is a TypedEventClass instance
 */
export function isTypedEvent(value: unknown): value is TypedEventClass {
  return value instanceof TypedEventClass;
}
