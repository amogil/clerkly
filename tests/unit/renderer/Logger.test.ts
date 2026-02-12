/* Preconditions: Logger class is imported and console methods are mocked
   Action: Test all log levels and instance methods
   Assertions: Verify correct console methods are called with formatted messages
   Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.4, clerkly.3.5, clerkly.3.7 */

import { Logger } from '../../../src/renderer/Logger';
import { DateTimeFormatter } from '../../../src/renderer/utils/DateTimeFormatter';

// Mock DateTimeFormatter
jest.mock('../../../src/renderer/utils/DateTimeFormatter');

describe('Logger (Renderer)', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock DateTimeFormatter
    (DateTimeFormatter.formatLogTimestamp as jest.Mock).mockReturnValue(
      '2024-01-01T12:00:00+00:00'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Static methods', () => {
    /* Preconditions: Console.debug is mocked
       Action: Call Logger.debug with context and message
       Assertions: console.debug called with formatted message
       Requirements: clerkly.3.1, clerkly.3.4 */
    it('should call console.debug for debug level', () => {
      Logger.debug('TestContext', 'Debug message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [DEBUG] [TestContext] Debug message'
      );
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    /* Preconditions: Console.info is mocked
       Action: Call Logger.info with context and message
       Assertions: console.info called with formatted message
       Requirements: clerkly.3.1, clerkly.3.4 */
    it('should call console.info for info level', () => {
      Logger.info('TestContext', 'Info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [INFO] [TestContext] Info message'
      );
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    /* Preconditions: Console.warn is mocked
       Action: Call Logger.warn with context and message
       Assertions: console.warn called with formatted message
       Requirements: clerkly.3.1, clerkly.3.4 */
    it('should call console.warn for warn level', () => {
      Logger.warn('TestContext', 'Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [WARN] [TestContext] Warning message'
      );
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    /* Preconditions: Console.error is mocked
       Action: Call Logger.error with context and message
       Assertions: console.error called with formatted message
       Requirements: clerkly.3.1, clerkly.3.4 */
    it('should call console.error for error level', () => {
      Logger.error('TestContext', 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [ERROR] [TestContext] Error message'
      );
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    /* Preconditions: Console methods are mocked
       Action: Call Logger.log with explicit level parameter
       Assertions: Correct console method called
       Requirements: clerkly.3.1, clerkly.3.4 */
    it('should use info level by default when level not specified', () => {
      Logger.log('TestContext', 'Default message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [INFO] [TestContext] Default message'
      );
    });
  });

  describe('Instance methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.create('InstanceContext');
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance debug() method
       Assertions: console.debug called with context from instance
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should call console.debug for instance debug() method', () => {
      logger.debug('Instance debug message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [DEBUG] [InstanceContext] Instance debug message'
      );
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance info() method
       Assertions: console.info called with context from instance
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should call console.info for instance info() method', () => {
      logger.info('Instance info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [INFO] [InstanceContext] Instance info message'
      );
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance warn() method
       Assertions: console.warn called with context from instance
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should call console.warn for instance warn() method', () => {
      logger.warn('Instance warn message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [WARN] [InstanceContext] Instance warn message'
      );
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance error() method
       Assertions: console.error called with context from instance
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should call console.error for instance error() method', () => {
      logger.error('Instance error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [ERROR] [InstanceContext] Instance error message'
      );
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance log() method with explicit level
       Assertions: Correct console method called with instance context
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should support explicit level in instance log() method', () => {
      logger.log('Custom level message', 'warn');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [WARN] [InstanceContext] Custom level message'
      );
    });

    /* Preconditions: Logger instance created with context
       Action: Call instance log() without level parameter
       Assertions: Defaults to info level
       Requirements: clerkly.3.5, clerkly.3.7 */
    it('should default to info level in instance log() method', () => {
      logger.log('Default level message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00+00:00] [INFO] [InstanceContext] Default level message'
      );
    });
  });

  describe('Timestamp formatting', () => {
    /* Preconditions: DateTimeFormatter.formatLogTimestamp is mocked
       Action: Call any Logger method
       Assertions: DateTimeFormatter.formatLogTimestamp called with Date object
       Requirements: clerkly.3.2, clerkly.3.6 */
    it('should use DateTimeFormatter for timestamp', () => {
      Logger.info('TestContext', 'Message');

      expect(DateTimeFormatter.formatLogTimestamp).toHaveBeenCalledWith(expect.any(Date));
    });
  });
});
