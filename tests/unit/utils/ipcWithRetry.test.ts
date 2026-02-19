/* Preconditions: ipcWithRetry utility exists
   Action: Test retry logic with various scenarios
   Assertions: Retries work correctly with exponential backoff
   Requirements: N/A (utility function) */

import { ipcWithRetry } from '../../../src/renderer/utils/ipcWithRetry';

describe('ipcWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* Preconditions: IPC call succeeds on first attempt
     Action: Call ipcWithRetry with successful IPC call
     Assertions: Returns result immediately without retries
     Requirements: N/A */
  it('should return result on first successful attempt', async () => {
    const mockIpcCall = jest.fn().mockResolvedValue({ success: true, data: 'test' });

    const promise = ipcWithRetry(mockIpcCall);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ success: true, data: 'test' });
    expect(mockIpcCall).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: IPC call fails with "No handler registered" then succeeds
     Action: Call ipcWithRetry with IPC call that fails once
     Assertions: Retries and returns result on second attempt
     Requirements: N/A */
  it('should retry on "No handler registered" error', async () => {
    const mockIpcCall = jest
      .fn()
      .mockRejectedValueOnce(new Error('No handler registered for auth:get-status'))
      .mockResolvedValueOnce({ success: true, data: 'test' });

    const promise = ipcWithRetry(mockIpcCall);

    // First attempt fails
    await jest.advanceTimersByTimeAsync(0);

    // Wait for retry delay (100ms)
    await jest.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).toEqual({ success: true, data: 'test' });
    expect(mockIpcCall).toHaveBeenCalledTimes(2);
  });

  /* Preconditions: IPC call fails multiple times then succeeds
     Action: Call ipcWithRetry with IPC call that fails 3 times
     Assertions: Retries with exponential backoff and succeeds
     Requirements: N/A */
  it('should use exponential backoff for retries', async () => {
    const mockIpcCall = jest
      .fn()
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockResolvedValueOnce({ success: true });

    const promise = ipcWithRetry(mockIpcCall);

    // First attempt fails
    await jest.advanceTimersByTimeAsync(0);
    expect(mockIpcCall).toHaveBeenCalledTimes(1);

    // Wait 100ms for first retry
    await jest.advanceTimersByTimeAsync(100);
    expect(mockIpcCall).toHaveBeenCalledTimes(2);

    // Wait 200ms for second retry
    await jest.advanceTimersByTimeAsync(200);
    expect(mockIpcCall).toHaveBeenCalledTimes(3);

    // Wait 400ms for third retry
    await jest.advanceTimersByTimeAsync(400);
    expect(mockIpcCall).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  /* Preconditions: IPC call fails with non-handler error
     Action: Call ipcWithRetry with IPC call that fails with different error
     Assertions: Throws error immediately without retries
     Requirements: N/A */
  it('should not retry on non-handler errors', async () => {
    const mockIpcCall = jest.fn().mockRejectedValue(new Error('Network error'));

    const promise = ipcWithRetry(mockIpcCall);

    await expect(promise).rejects.toThrow('Network error');
    expect(mockIpcCall).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: IPC call fails all retry attempts
     Action: Call ipcWithRetry with IPC call that always fails
     Assertions: Throws error after max attempts
     Requirements: N/A */
  it('should throw error after max attempts', async () => {
    const mockIpcCall = jest
      .fn()
      .mockRejectedValue(new Error('No handler registered for auth:get-status'));

    const promise = ipcWithRetry(mockIpcCall, { maxAttempts: 3 });

    // Set up expectation first
    const expectation = expect(promise).rejects.toThrow(
      'No handler registered for auth:get-status'
    );

    // Run all timers to completion
    await jest.runAllTimersAsync();

    // Wait for expectation
    await expectation;
    expect(mockIpcCall).toHaveBeenCalledTimes(3);
  });

  /* Preconditions: Custom retry options provided
     Action: Call ipcWithRetry with custom options
     Assertions: Uses custom delays and max attempts
     Requirements: N/A */
  it('should respect custom retry options', async () => {
    const mockIpcCall = jest
      .fn()
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockResolvedValueOnce({ success: true });

    const promise = ipcWithRetry(mockIpcCall, {
      maxAttempts: 3,
      initialDelay: 50,
      backoffMultiplier: 3,
    });

    // First attempt fails
    await jest.advanceTimersByTimeAsync(0);
    expect(mockIpcCall).toHaveBeenCalledTimes(1);

    // Wait 50ms for first retry
    await jest.advanceTimersByTimeAsync(50);
    expect(mockIpcCall).toHaveBeenCalledTimes(2);

    // Wait 150ms for second retry (50 * 3)
    await jest.advanceTimersByTimeAsync(150);
    expect(mockIpcCall).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  /* Preconditions: Delay exceeds maxDelay
     Action: Call ipcWithRetry with delays that would exceed maxDelay
     Assertions: Caps delay at maxDelay
     Requirements: N/A */
  it('should cap delay at maxDelay', async () => {
    const mockIpcCall = jest
      .fn()
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockRejectedValueOnce(new Error('No handler registered'))
      .mockResolvedValueOnce({ success: true });

    const promise = ipcWithRetry(mockIpcCall, {
      initialDelay: 100,
      maxDelay: 250,
      backoffMultiplier: 2,
    });

    // First attempt fails
    await jest.advanceTimersByTimeAsync(0);

    // Wait 100ms for first retry
    await jest.advanceTimersByTimeAsync(100);

    // Wait 200ms for second retry
    await jest.advanceTimersByTimeAsync(200);

    // Wait 250ms for third retry (capped at maxDelay, not 400ms)
    await jest.advanceTimersByTimeAsync(250);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(mockIpcCall).toHaveBeenCalledTimes(4);
  });
});
