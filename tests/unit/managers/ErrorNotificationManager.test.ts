// Requirements: ui.7.1, ui.7.2, ui.7.3
import { ErrorNotificationManager } from '../../../src/renderer/managers/ErrorNotificationManager';
import type { ErrorNotification } from '../../../src/renderer/types/error-notification';

describe('ErrorNotificationManager', () => {
  let manager: ErrorNotificationManager;

  beforeEach(() => {
    manager = new ErrorNotificationManager();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /* Preconditions: ErrorNotificationManager instance created
     Action: call showNotification() with message and context
     Assertions: notification created with correct data (id, message, context, timestamp)
     Requirements: ui.7.1, ui.7.2 */
  it('should create notification with correct data', () => {
    const message = 'Failed to load user profile';
    const context = 'Loading profile data';

    const id = manager.showNotification(message, context);

    expect(id).toBeDefined();
    expect(id).toMatch(/^error-\d+-\d+\.?\d*$/);
  });

  /* Preconditions: ErrorNotificationManager with active notification
     Action: call dismissNotification() with notification id
     Assertions: notification removed from active notifications
     Requirements: ui.7.3 */
  it('should dismiss notification by id', () => {
    const id = manager.showNotification('Error message', 'Error context');

    const listener = jest.fn();
    manager.subscribe(listener);

    manager.dismissNotification(id);

    // Listener should be called with empty array
    expect(listener).toHaveBeenCalledWith([]);
  });

  /* Preconditions: ErrorNotificationManager with active notification
     Action: wait 15 seconds
     Assertions: notification automatically dismissed
     Requirements: ui.7.3 */
  it('should auto-dismiss notification after 15 seconds', () => {
    manager.showNotification('Error message', 'Error context');

    const listener = jest.fn();
    manager.subscribe(listener);

    // Fast-forward time by 15 seconds
    jest.advanceTimersByTime(15000);

    // Listener should be called with empty array (notification dismissed)
    expect(listener).toHaveBeenCalledWith([]);
  });

  /* Preconditions: ErrorNotificationManager instance created
     Action: subscribe to notifications, show notification
     Assertions: listener called with notification array
     Requirements: ui.7.1 */
  it('should notify listeners when notification is shown', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    const message = 'Network error';
    const context = 'Syncing data';
    manager.showNotification(message, context);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          message,
          context,
        }),
      ])
    );
  });

  /* Preconditions: ErrorNotificationManager with subscribed listener
     Action: show notification, then dismiss it
     Assertions: listener called twice (show and dismiss)
     Requirements: ui.7.3 */
  it('should notify listeners when notification is dismissed', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    const id = manager.showNotification('Error', 'Context');
    expect(listener).toHaveBeenCalledTimes(1);

    manager.dismissNotification(id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith([]);
  });

  /* Preconditions: ErrorNotificationManager with multiple notifications
     Action: show multiple notifications
     Assertions: all notifications tracked in array
     Requirements: ui.7.1 */
  it('should manage multiple notifications', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    const id1 = manager.showNotification('Error 1', 'Context 1');
    const id2 = manager.showNotification('Error 2', 'Context 2');
    const id3 = manager.showNotification('Error 3', 'Context 3');

    // Listener should be called 3 times (once per notification)
    expect(listener).toHaveBeenCalledTimes(3);

    // Last call should have all 3 notifications
    const lastCall = listener.mock.calls[2][0] as ErrorNotification[];
    expect(lastCall).toHaveLength(3);
    expect(lastCall.map((n) => n.id)).toEqual([id1, id2, id3]);
  });

  /* Preconditions: ErrorNotificationManager with subscribed listener
     Action: call unsubscribe function
     Assertions: listener no longer called on changes
     Requirements: ui.7.1 */
  it('should unsubscribe listener', () => {
    const listener = jest.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.showNotification('Error', 'Context');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    manager.showNotification('Another error', 'Another context');
    // Listener should not be called again after unsubscribe
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: ErrorNotificationManager with multiple notifications
     Action: dismiss one notification
     Assertions: only specified notification removed, others remain
     Requirements: ui.7.3 */
  it('should dismiss only specified notification', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    const id1 = manager.showNotification('Error 1', 'Context 1');
    const id2 = manager.showNotification('Error 2', 'Context 2');
    const id3 = manager.showNotification('Error 3', 'Context 3');

    manager.dismissNotification(id2);

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as ErrorNotification[];
    expect(lastCall).toHaveLength(2);
    expect(lastCall.map((n) => n.id)).toEqual([id1, id3]);
  });

  /* Preconditions: ErrorNotificationManager instance
     Action: dismiss non-existent notification id
     Assertions: no error thrown, no changes to notifications
     Requirements: ui.7.3 */
  it('should handle dismissing non-existent notification gracefully', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    manager.showNotification('Error', 'Context');
    const callCount = listener.mock.calls.length;

    // Try to dismiss non-existent notification
    manager.dismissNotification('non-existent-id');

    // Listener should not be called again
    expect(listener).toHaveBeenCalledTimes(callCount);
  });

  /* Preconditions: ErrorNotificationManager with notification
     Action: check notification structure
     Assertions: notification has all required fields (id, message, context, timestamp)
     Requirements: ui.7.2 */
  it('should create notification with all required fields', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    const message = 'Test error';
    const context = 'Test context';
    const beforeTimestamp = Date.now();

    manager.showNotification(message, context);

    const afterTimestamp = Date.now();
    const notifications = listener.mock.calls[0][0] as ErrorNotification[];
    const notification = notifications[0];

    expect(notification).toHaveProperty('id');
    expect(notification).toHaveProperty('message', message);
    expect(notification).toHaveProperty('context', context);
    expect(notification).toHaveProperty('timestamp');
    expect(notification.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(notification.timestamp).toBeLessThanOrEqual(afterTimestamp);
  });

  /* Preconditions: ErrorNotificationManager with multiple listeners
     Action: show notification
     Assertions: all listeners notified
     Requirements: ui.7.1 */
  it('should notify all subscribed listeners', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    const listener3 = jest.fn();

    manager.subscribe(listener1);
    manager.subscribe(listener2);
    manager.subscribe(listener3);

    manager.showNotification('Error', 'Context');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener3).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: ErrorNotificationManager with notification
     Action: receive notifications array from listener
     Assertions: array is a copy, modifications don't affect internal state
     Requirements: ui.7.1 */
  it('should provide copy of notifications array to listeners', () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    manager.showNotification('Error', 'Context');

    const notifications = listener.mock.calls[0][0] as ErrorNotification[];
    const originalLength = notifications.length;

    // Try to modify the array
    notifications.push({
      id: 'fake-id',
      message: 'Fake',
      context: 'Fake',
      timestamp: Date.now(),
    });

    // Show another notification to trigger listener again
    manager.showNotification('Error 2', 'Context 2');

    const newNotifications = listener.mock.calls[1][0] as ErrorNotification[];
    // Should have 2 notifications (original + new), not 3 (original + fake + new)
    expect(newNotifications).toHaveLength(originalLength + 1);
  });
});
