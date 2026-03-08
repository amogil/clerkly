// Requirements: realtime-events.4.5
/**
 * Constants for the real-time event system
 */

/**
 * IPC channel names for event communication between main and renderer
 */
export const IPC_CHANNELS = {
  /** Channel for sending events from main to renderer */
  EVENT_FROM_MAIN: 'events:from-main',
  /** Channel for sending events from renderer to main */
  EVENT_FROM_RENDERER: 'events:from-renderer',
} as const;

/**
 * Event type constants for type-safe event handling
 */
export const EVENT_TYPES = {
  // Auth events (new event system)
  AUTH_STARTED: 'auth.started',
  AUTH_CALLBACK_RECEIVED: 'auth.callback-received',
  AUTH_COMPLETED: 'auth.completed',
  AUTH_FAILED: 'auth.failed',
  AUTH_CANCELLED: 'auth.cancelled',
  AUTH_SIGNED_OUT: 'auth.signed-out',
  APP_COORDINATOR_STATE_CHANGED: 'app.coordinator.state-changed',

  // User events
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_PROFILE_UPDATED: 'user.profile.updated',

  // Agent events
  AGENT_CREATED: 'agent.created',
  AGENT_UPDATED: 'agent.updated',
  AGENT_ARCHIVED: 'agent.archived',

  // Message events
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_LLM_REASONING_UPDATED: 'message.llm.reasoning.updated',
  MESSAGE_LLM_TEXT_UPDATED: 'message.llm.text.updated',

  // Error events
  ERROR_CREATED: 'error.created',
  LLM_PIPELINE_DIAGNOSTIC: 'llm.pipeline.diagnostic',

  // Agent rate limit event
  AGENT_RATE_LIMIT: 'agent.rate_limit',
} as const;

/**
 * Configuration constants
 */
export const EVENT_CONFIG = {
  /** Maximum payload size in bytes (1MB) */
  MAX_PAYLOAD_SIZE: 1024 * 1024,
  /** Recommended payload size in bytes (100KB) */
  RECOMMENDED_PAYLOAD_SIZE: 100 * 1024,
  /** Interval for cleaning up stale timestamp entries (1 minute) */
  TIMESTAMP_CLEANUP_INTERVAL_MS: 60 * 1000,
  /** TTL for timestamp entries (6 hours) */
  TIMESTAMP_TTL_MS: 6 * 60 * 60 * 1000,
} as const;
