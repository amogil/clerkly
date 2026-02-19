// Requirements: error-notifications.1.1, error-notifications.1.4, error-notifications.1.5

import { handleBackgroundError, shouldFilterError } from '../../src/main/ErrorHandler';
import { MainEventBus } from '../../src/main/events/MainEventBus';

// Mock MainEventBus module
jest.mock('../../src/main/events/MainEventBus', () => {
  const mockPublish = jest.fn();
  return {
    MainEventBus: {
      getInstance: jest.fn(() => ({
        publish: mockPublish,
        subscribe: jest.fn(),
        subscribeAll: jest.fn(),
        clear: jest.fn(),
        destroy: jest.fn(),
        cleanupTimestampForEntity: jest.fn(),
        getTimestampCacheSize: jest.fn(),
      })),
      resetInstance: jest.fn(),
    },
  };
});

// Mock Logger
jest.mock('../../src/main/Logger', () => ({
  Logger: {
    create: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('ErrorHandler', () => {
  let mockPublish: jest.Mock;

  beforeEach(() => {
    // Get the mock publish function
    mockPublish = (MainEventBus.getInstance() as any).publish;
    mockPublish.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: Error object and context provided
     Action: call handleBackgroundError()
     Assertions: error.created event published via EventBus
     Requirements: error-notifications.1.1 */
  it('should publish error.created event via EventBus', () => {
    const error = new Error('Test error');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const publishedEvent = mockPublish.mock.calls[0][0];
    expect(publishedEvent.type).toBe('error.created');
    expect(publishedEvent.message).toBe('Test error');
    expect(publishedEvent.context).toBe('Test Context');
  });

  /* Preconditions: String error message
     Action: call handleBackgroundError()
     Assertions: error.created event published with string message
     Requirements: error-notifications.1.1 */
  it('should handle string error messages', () => {
    const error = 'Simple error message';
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const publishedEvent = mockPublish.mock.calls[0][0];
    expect(publishedEvent.type).toBe('error.created');
    expect(publishedEvent.message).toBe('Simple error message');
    expect(publishedEvent.context).toBe('Test Context');
  });

  /* Preconditions: Error with special characters in message
     Action: call handleBackgroundError()
     Assertions: message properly published
     Requirements: error-notifications.1.1 */
  it('should handle errors with special characters', () => {
    const error = new Error('Error: "test" & <special> chars');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const publishedEvent = mockPublish.mock.calls[0][0];
    expect(publishedEvent.type).toBe('error.created');
    expect(publishedEvent.message).toBe('Error: "test" & <special> chars');
    expect(publishedEvent.context).toBe('Test Context');
  });
});

describe('shouldFilterError', () => {
  /* Preconditions: Error "No user logged in" during logout
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout', () => {
    const error = new Error('No user logged in');
    const context = 'Logout';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "No user logged in" during logout (case insensitive)
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout (case insensitive)', () => {
    const error = new Error('NO USER LOGGED IN');
    const context = 'LOGOUT';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "No user logged in" during different context
     Action: call shouldFilterError()
     Assertions: returns false (error should NOT be filtered)
     Requirements: error-notifications.1.5 */
  it('should NOT filter "No user logged in" error during other operations', () => {
    const error = new Error('No user logged in');
    const context = 'Profile Loading';

    expect(shouldFilterError(error, context)).toBe(false);
  });

  /* Preconditions: Error "Operation cancelled"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter cancelled operation errors', () => {
    const error = new Error('Operation cancelled');
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Request aborted"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter aborted operation errors', () => {
    const error = new Error('Request aborted');
    const context = 'API Request';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Race condition detected"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter race condition errors', () => {
    const error = new Error('Race condition detected');
    const context = 'Background Process';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Concurrent operation failed"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter concurrent operation errors', () => {
    const error = new Error('Concurrent operation failed');
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: String error message "cancelled"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should handle string error messages', () => {
    const error = 'Operation cancelled';
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Normal error that should not be filtered
     Action: call shouldFilterError()
     Assertions: returns false (error should NOT be filtered)
     Requirements: error-notifications.1.5 */
  it('should NOT filter normal errors', () => {
    const error = new Error('Network connection failed');
    const context = 'API Request';

    expect(shouldFilterError(error, context)).toBe(false);
  });
});

describe('handleBackgroundError with filtering', () => {
  let mockPublish: jest.Mock;

  beforeEach(() => {
    // Get the mock publish function
    mockPublish = (MainEventBus.getInstance() as any).publish;
    mockPublish.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Preconditions: Error "No user logged in" during logout
     Action: call handleBackgroundError()
     Assertions: no event published (filtered)
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout', () => {
    const error = new Error('No user logged in');
    const context = 'Logout';

    handleBackgroundError(error, context);

    // No event should be published (filtered)
    expect(mockPublish).not.toHaveBeenCalled();
  });

  /* Preconditions: Error "Operation cancelled"
     Action: call handleBackgroundError()
     Assertions: no event published (filtered)
     Requirements: error-notifications.1.5 */
  it('should filter cancelled operation errors', () => {
    const error = new Error('Operation cancelled');
    const context = 'Data Sync';

    handleBackgroundError(error, context);

    // No event should be published (filtered)
    expect(mockPublish).not.toHaveBeenCalled();
  });

  /* Preconditions: Error "Race condition detected"
     Action: call handleBackgroundError()
     Assertions: no event published (filtered)
     Requirements: error-notifications.1.5 */
  it('should filter race condition errors', () => {
    const error = new Error('Race condition detected');
    const context = 'Background Process';

    handleBackgroundError(error, context);

    // No event should be published (filtered)
    expect(mockPublish).not.toHaveBeenCalled();
  });

  /* Preconditions: Normal error that should not be filtered
     Action: call handleBackgroundError()
     Assertions: event published
     Requirements: error-notifications.1.1, error-notifications.1.4 */
  it('should NOT filter normal errors', () => {
    const error = new Error('Network connection failed');
    const context = 'API Request';

    handleBackgroundError(error, context);

    // Event should be published
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const publishedEvent = mockPublish.mock.calls[0][0];
    expect(publishedEvent.type).toBe('error.created');
    expect(publishedEvent.message).toBe('Network connection failed');
    expect(publishedEvent.context).toBe('API Request');
  });
});
