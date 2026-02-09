// Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.3, clerkly.3.4, clerkly.3.5, clerkly.3.6, clerkly.3.9, clerkly.2.9

import { DateTimeFormatter } from './utils/DateTimeFormatter';

/**
 * Log level type
 * Requirements: clerkly.3.4
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Centralized Logger class for consistent logging across the application
 * Uses fixed timestamp format with timezone for consistency
 * Only this class is allowed to use console.* methods directly
 *
 * Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.3, clerkly.3.4, clerkly.3.5, clerkly.3.6, clerkly.3.9
 */
export class Logger {
  /**
   * Logs a message with specified level
   * Automatically adds timestamp using DateTimeFormatter
   * Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.5, clerkly.3.6
   *
   * @param context - Component name or context identifier (required)
   * @param message - Message to log (required)
   * @param level - Log level (optional, defaults to 'info')
   */
  static log(context: string, message: string, level: LogLevel = 'info'): void {
    // Requirements: clerkly.3.2, clerkly.3.3, clerkly.3.6 - Automatically format timestamp with timezone
    const timestamp = DateTimeFormatter.formatLogTimestamp(new Date());

    // Requirements: clerkly.3.5 - Format message with timestamp, level, context
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;

    // Requirements: clerkly.3.9 - Only Logger class uses console.* methods directly
    // Map log levels to appropriate console methods
    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Logs a debug message
   * Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5
   *
   * @param context - Component name or context identifier
   * @param message - Message to log
   */
  static debug(context: string, message: string): void {
    // Requirements: clerkly.3.1, clerkly.3.4
    Logger.log(context, message, 'debug');
  }

  /**
   * Logs an info message
   * Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5
   *
   * @param context - Component name or context identifier
   * @param message - Message to log
   */
  static info(context: string, message: string): void {
    // Requirements: clerkly.3.1, clerkly.3.4
    Logger.log(context, message, 'info');
  }

  /**
   * Logs a warning message
   * Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5
   *
   * @param context - Component name or context identifier
   * @param message - Message to log
   */
  static warn(context: string, message: string): void {
    // Requirements: clerkly.3.1, clerkly.3.4
    Logger.log(context, message, 'warn');
  }

  /**
   * Logs an error message
   * Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5
   *
   * @param context - Component name or context identifier
   * @param message - Message to log
   */
  static error(context: string, message: string): void {
    // Requirements: clerkly.3.1, clerkly.3.4
    Logger.log(context, message, 'error');
  }
}
