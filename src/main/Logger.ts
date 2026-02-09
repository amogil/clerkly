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
 * Supports two usage patterns:
 * 1. Static methods: Logger.info('Context', 'message')
 * 2. Parameterized instance: const logger = Logger.create('Context'); logger.info('message')
 *
 * Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.3, clerkly.3.4, clerkly.3.5, clerkly.3.6, clerkly.3.7, clerkly.3.9
 */
export class Logger {
  private context: string;

  /**
   * Private constructor for creating parameterized logger instances
   * Requirements: clerkly.3.5
   */
  private constructor(context: string) {
    this.context = context;
  }

  /**
   * Creates a parameterized logger instance for a module
   * Requirements: clerkly.3.5, clerkly.3.7
   *
   * @param context - Component name or context identifier
   * @returns Logger instance with the specified context
   */
  static create(context: string): Logger {
    return new Logger(context);
  }
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

  /**
   * Logs a message with specified level (instance method)
   * Requirements: clerkly.3.5, clerkly.3.7
   *
   * @param message - Message to log (WITHOUT context duplication)
   * @param level - Log level (optional, defaults to 'info')
   */
  log(message: string, level: LogLevel = 'info'): void {
    Logger.log(this.context, message, level);
  }

  /**
   * Logs a debug message (instance method)
   * Requirements: clerkly.3.4, clerkly.3.7
   *
   * @param message - Message to log
   */
  debug(message: string): void {
    this.log(message, 'debug');
  }

  /**
   * Logs an info message (instance method)
   * Requirements: clerkly.3.4, clerkly.3.7
   *
   * @param message - Message to log
   */
  info(message: string): void {
    this.log(message, 'info');
  }

  /**
   * Logs a warning message (instance method)
   * Requirements: clerkly.3.4, clerkly.3.7
   *
   * @param message - Message to log
   */
  warn(message: string): void {
    this.log(message, 'warn');
  }

  /**
   * Logs an error message (instance method)
   * Requirements: clerkly.3.4, clerkly.3.7
   *
   * @param message - Message to log
   */
  error(message: string): void {
    this.log(message, 'error');
  }
}
