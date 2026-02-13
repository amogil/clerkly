// Requirements: realtime-events.1.2, realtime-events.3, realtime-events.8
/**
 * Event types and interfaces for the real-time event system
 * Source of truth for all event type definitions in Clerkly
 */

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

/**
 * User profile
 */
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  picture?: string;
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
export type UserProfileUpdatedPayload = EntityUpdatedEvent<UserProfile>;

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
