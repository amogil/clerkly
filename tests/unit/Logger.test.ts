// Requirements: clerkly.3.1, clerkly.3.2, clerkly.3.3, clerkly.3.4, clerkly.3.5, clerkly.3.6, clerkly.2.1, clerkly.2.8

import { Logger } from '../../src/main/Logger';

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: Logger class is available with static methods
     Action: call Logger.debug() with context and message
     Assertions: console.debug is called with formatted message containing timestamp, DEBUG level, context, and message
     Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5 */
  it('should log debug message with correct format', () => {
    Logger.debug('TestComponent', 'Debug message');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [TestComponent] Debug message')
    );
  });

  /* Preconditions: Logger class is available with static methods
     Action: call Logger.info() with context and message
     Assertions: console.info is called with formatted message containing timestamp, INFO level, context, and message
     Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5 */
  it('should log info message with correct format', () => {
    Logger.info('TestComponent', 'Info message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [TestComponent] Info message')
    );
  });

  /* Preconditions: Logger class is available with static methods
     Action: call Logger.warn() with context and message
     Assertions: console.warn is called with formatted message containing timestamp, WARN level, context, and message
     Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5 */
  it('should log warn message with correct format', () => {
    Logger.warn('TestComponent', 'Warning message');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN] [TestComponent] Warning message')
    );
  });

  /* Preconditions: Logger class is available with static methods
     Action: call Logger.error() with context and message
     Assertions: console.error is called with formatted message containing timestamp, ERROR level, context, and message
     Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5 */
  it('should log error message with correct format', () => {
    Logger.error('TestComponent', 'Error message');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [TestComponent] Error message')
    );
  });

  /* Preconditions: Logger class is available with static log() method
     Action: call Logger.log() with context, message, and no level (default)
     Assertions: console.info is called (default level is 'info')
     Requirements: clerkly.3.1, clerkly.3.5 */
  it('should use info level by default when calling log()', () => {
    Logger.log('TestComponent', 'Default level message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [TestComponent] Default level message')
    );
  });

  /* Preconditions: Logger class is available with static log() method
     Action: call Logger.log() with context, message, and explicit level 'debug'
     Assertions: console.debug is called with correct level
     Requirements: clerkly.3.1, clerkly.3.4, clerkly.3.5 */
  it('should use specified level when calling log() with explicit level', () => {
    Logger.log('TestComponent', 'Explicit debug message', 'debug');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [TestComponent] Explicit debug message')
    );
  });

  /* Preconditions: Logger class is available
     Action: call Logger.info() and capture the logged message
     Assertions: message contains timestamp in format YYYY-MM-DD HH:MM:SS±HH:MM
     Requirements: clerkly.3.2, clerkly.3.3, clerkly.3.6 */
  it('should use correct timestamp format with timezone (YYYY-MM-DD HH:MM:SS±HH:MM)', () => {
    Logger.info('TestComponent', 'Test message');

    const loggedMessage = consoleInfoSpy.mock.calls[0][0];
    // Regex for YYYY-MM-DD HH:MM:SS±HH:MM format
    const timestampRegex = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\]/;
    expect(loggedMessage).toMatch(timestampRegex);
  });

  /* Preconditions: Logger class is available
     Action: call Logger.info() with specific context
     Assertions: logged message contains the context in square brackets
     Requirements: clerkly.3.5 */
  it('should include context in every log message', () => {
    Logger.info('MyComponent', 'Test message');

    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('[MyComponent]'));
  });

  /* Preconditions: Logger class is available
     Action: call Logger methods with different levels
     Assertions: each logged message contains the correct level in square brackets and uppercase
     Requirements: clerkly.3.4, clerkly.3.5 */
  it('should include log level in every log message', () => {
    Logger.debug('TestComponent', 'Debug');
    Logger.info('TestComponent', 'Info');
    Logger.warn('TestComponent', 'Warn');
    Logger.error('TestComponent', 'Error');

    expect(consoleDebugSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
  });

  /* Preconditions: Logger class is available
     Action: call Logger.debug()
     Assertions: console.debug is called (not console.info/warn/error)
     Requirements: clerkly.3.4, clerkly.3.9 */
  it('should use console.debug for debug level', () => {
    Logger.debug('TestComponent', 'Debug message');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /* Preconditions: Logger class is available
     Action: call Logger.info()
     Assertions: console.info is called (not console.debug/warn/error)
     Requirements: clerkly.3.4, clerkly.3.9 */
  it('should use console.info for info level', () => {
    Logger.info('TestComponent', 'Info message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /* Preconditions: Logger class is available
     Action: call Logger.warn()
     Assertions: console.warn is called (not console.debug/info/error)
     Requirements: clerkly.3.4, clerkly.3.9 */
  it('should use console.warn for warn level', () => {
    Logger.warn('TestComponent', 'Warning message');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /* Preconditions: Logger class is available
     Action: call Logger.error()
     Assertions: console.error is called (not console.debug/info/warn)
     Requirements: clerkly.3.4, clerkly.3.9 */
  it('should use console.error for error level', () => {
    Logger.error('TestComponent', 'Error message');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  /* Preconditions: Logger class is available
     Action: call Logger methods multiple times with different contexts and messages
     Assertions: all messages follow the same format [timestamp] [LEVEL] [context] message
     Requirements: clerkly.3.5 */
  it('should maintain consistent format across multiple log messages', () => {
    Logger.info('Component1', 'Message 1');
    Logger.error('Component2', 'Message 2');
    Logger.debug('Component3', 'Message 3');

    const formatRegex =
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\] \[(DEBUG|INFO|WARN|ERROR)\] \[.+\] .+$/;

    expect(consoleInfoSpy.mock.calls[0][0]).toMatch(formatRegex);
    expect(consoleErrorSpy.mock.calls[0][0]).toMatch(formatRegex);
    expect(consoleDebugSpy.mock.calls[0][0]).toMatch(formatRegex);
  });

  /* Preconditions: Logger class is available with static methods
     Action: call Logger methods with different contexts
     Assertions: each context is independent and correctly included in messages
     Requirements: clerkly.3.5 */
  it('should handle different contexts independently', () => {
    Logger.info('Context1', 'Message from context 1');
    Logger.info('Context2', 'Message from context 2');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(consoleInfoSpy.mock.calls[0][0]).toContain('[Context1]');
    expect(consoleInfoSpy.mock.calls[1][0]).toContain('[Context2]');
  });

  /* Preconditions: Logger class is available with create() method
     Action: call Logger.create() with a context
     Assertions: returns a Logger instance
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should create parameterized logger instance', () => {
    const logger = Logger.create('TestModule');

    expect(logger).toBeInstanceOf(Logger);
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.info() method
     Assertions: console.info is called with formatted message containing context from create()
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should log info message using instance method', () => {
    const logger = Logger.create('TestModule');
    logger.info('Instance info message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [TestModule] Instance info message')
    );
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.debug() method
     Assertions: console.debug is called with formatted message containing context from create()
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should log debug message using instance method', () => {
    const logger = Logger.create('TestModule');
    logger.debug('Instance debug message');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [TestModule] Instance debug message')
    );
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.warn() method
     Assertions: console.warn is called with formatted message containing context from create()
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should log warn message using instance method', () => {
    const logger = Logger.create('TestModule');
    logger.warn('Instance warn message');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN] [TestModule] Instance warn message')
    );
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.error() method
     Assertions: console.error is called with formatted message containing context from create()
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should log error message using instance method', () => {
    const logger = Logger.create('TestModule');
    logger.error('Instance error message');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [TestModule] Instance error message')
    );
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.log() with message and no level (default)
     Assertions: console.info is called (default level is 'info')
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should use info level by default when calling instance log()', () => {
    const logger = Logger.create('TestModule');
    logger.log('Default level message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [TestModule] Default level message')
    );
  });

  /* Preconditions: Logger instance created with Logger.create()
     Action: call instance.log() with message and explicit level 'error'
     Assertions: console.error is called with correct level
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should use specified level when calling instance log() with explicit level', () => {
    const logger = Logger.create('TestModule');
    logger.log('Explicit error message', 'error');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [TestModule] Explicit error message')
    );
  });

  /* Preconditions: Multiple Logger instances created with different contexts
     Action: call methods on different instances
     Assertions: each instance uses its own context correctly
     Requirements: clerkly.3.5, clerkly.3.7 */
  it('should maintain separate contexts for different instances', () => {
    const logger1 = Logger.create('Module1');
    const logger2 = Logger.create('Module2');

    logger1.info('Message from module 1');
    logger2.info('Message from module 2');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(consoleInfoSpy.mock.calls[0][0]).toContain('[Module1]');
    expect(consoleInfoSpy.mock.calls[1][0]).toContain('[Module2]');
  });
});
