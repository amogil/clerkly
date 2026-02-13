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
