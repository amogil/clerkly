// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3
import fc from 'fast-check';
import { ErrorNotificationManager } from '../../../src/renderer/managers/ErrorNotificationManager';
import type { ErrorNotification } from '../../../src/renderer/types/error-notification';

describe('ErrorNotificationManager Property Tests', () => {
  /* Feature: ui, Property 20: Показ уведомления при ошибке фонового процесса
     Preconditions: ErrorNotificationManager instance, various error messages and contexts
     Action: call showNotification() with generated message and context
     Assertions: notification created and added to active notifications
     Requirements: error-notifications.1.1 */
  it('should show notification for any error in background process', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }), // message
        fc.string({ minLength: 1, maxLength: 200 }), // context
        (message, context) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          // Property 20: For any error, notification should be shown
          const id = manager.showNotification(message, context);

          // Verify notification was created
          expect(id).toBeDefined();
          expect(typeof id).toBe('string');
          expect(id.length).toBeGreaterThan(0);

          // Verify listener was notified
          expect(listener).toHaveBeenCalledTimes(1);

          // Verify notification is in the list
          const notifications = listener.mock.calls[0][0];
          expect(notifications).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 21: Содержимое уведомления об ошибке
     Preconditions: ErrorNotificationManager instance, various messages and contexts
     Action: create notification with message and context
     Assertions: notification contains both message AND context
     Requirements: error-notifications.1.2 */
  it('should include both message and context in notification', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }), // message
        fc.string({ minLength: 1, maxLength: 200 }), // context
        (message, context) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          manager.showNotification(message, context);

          // Property 21: Notification must contain message AND context
          const notifications = listener.mock.calls[0][0];
          const notification = notifications[0];

          expect(notification.message).toBe(message);
          expect(notification.context).toBe(context);

          // Both fields must be present and non-empty
          expect(notification.message.length).toBeGreaterThan(0);
          expect(notification.context.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 22: Автоматическое исчезновение уведомления
     Preconditions: ErrorNotificationManager with notification, time passes
     Action: show notification, advance time by 15 seconds
     Assertions: notification automatically dismissed after 15 seconds OR on user click
     Requirements: error-notifications.1.3 */
  it('should auto-dismiss notification after 15 seconds', () => {
    jest.useFakeTimers();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }), // message
        fc.string({ minLength: 1, maxLength: 200 }), // context
        (message, context) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          const id = manager.showNotification(message, context);

          // Verify notification is shown
          let notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(1);
          expect(notifications[0].id).toBe(id);

          // Property 22: Notification should auto-dismiss after 15 seconds
          jest.advanceTimersByTime(15000);

          // Verify notification was dismissed
          notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );

    jest.useRealTimers();
  });

  /* Feature: ui, Property 22 (manual dismiss): Исчезновение при клике пользователя
     Preconditions: ErrorNotificationManager with notification
     Action: show notification, manually dismiss
     Assertions: notification dismissed immediately on user action
     Requirements: error-notifications.1.3 */
  it('should dismiss notification on user click', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }), // message
        fc.string({ minLength: 1, maxLength: 200 }), // context
        (message, context) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          const id = manager.showNotification(message, context);

          // Verify notification is shown
          let notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(1);

          // Property 22: Notification should dismiss on user click
          manager.dismissNotification(id);

          // Verify notification was dismissed
          notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 20, 21, 22: Multiple notifications management
     Preconditions: ErrorNotificationManager instance
     Action: show multiple notifications with various messages and contexts
     Assertions: all notifications tracked, each has unique id, all auto-dismiss
     Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3 */
  it('should manage multiple notifications independently', () => {
    jest.useFakeTimers();

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 100 }),
            context: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (notificationData) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          // Show all notifications
          const ids = notificationData.map((data) =>
            manager.showNotification(data.message, data.context)
          );

          // Verify all notifications are shown
          let notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(notificationData.length);

          // Verify all IDs are unique
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);

          // Verify all notifications have correct data
          notifications.forEach((notification: ErrorNotification, index: number) => {
            expect(notification.message).toBe(notificationData[index].message);
            expect(notification.context).toBe(notificationData[index].context);
          });

          // Fast-forward time by 15 seconds
          jest.advanceTimersByTime(15000);

          // All notifications should be auto-dismissed
          notifications = listener.mock.calls[listener.mock.calls.length - 1][0];
          expect(notifications).toHaveLength(0);
        }
      ),
      { numRuns: 50 } // Reduced runs for performance with multiple notifications
    );

    jest.useRealTimers();
  });

  /* Feature: ui, Property 20: Notification ID uniqueness
     Preconditions: ErrorNotificationManager instance
     Action: show many notifications rapidly
     Assertions: all notification IDs are unique
     Requirements: error-notifications.1.1 */
  it('should generate unique IDs for all notifications', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            context: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 10, maxLength: 50 }
        ),
        (notificationData) => {
          const manager = new ErrorNotificationManager();
          const ids: string[] = [];

          // Show all notifications rapidly
          notificationData.forEach((data) => {
            const id = manager.showNotification(data.message, data.context);
            ids.push(id);
          });

          // All IDs must be unique
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);

          // All IDs must match the expected format
          ids.forEach((id) => {
            expect(id).toMatch(/^error-\d+-\d+\.?\d*$/);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 21: Notification timestamp accuracy
     Preconditions: ErrorNotificationManager instance
     Action: show notification
     Assertions: timestamp is accurate (within reasonable bounds)
     Requirements: error-notifications.1.2 */
  it('should set accurate timestamp for notifications', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (message, context) => {
          const manager = new ErrorNotificationManager();
          const listener = jest.fn();
          manager.subscribe(listener);

          const beforeTimestamp = Date.now();
          manager.showNotification(message, context);
          const afterTimestamp = Date.now();

          const notifications = listener.mock.calls[0][0];
          const notification = notifications[0];

          // Timestamp should be between before and after
          expect(notification.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
          expect(notification.timestamp).toBeLessThanOrEqual(afterTimestamp);

          // Timestamp should be a valid number
          expect(typeof notification.timestamp).toBe('number');
          expect(notification.timestamp).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
