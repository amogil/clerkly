// Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3
import React, { useState, useEffect } from 'react';
import { ErrorNotificationManager } from '../managers/ErrorNotificationManager';
import type { ErrorNotification } from '../types/error-notification';

/**
 * Props for NotificationUI component
 */
interface NotificationUIProps {
  /**
   * ErrorNotificationManager instance to manage notifications
   */
  manager: ErrorNotificationManager;

  /**
   * Optional className for styling
   */
  className?: string;
}

/**
 * NotificationUI component displays error notifications to users
 *
 * This component subscribes to ErrorNotificationManager and displays
 * a list of active error notifications. Each notification shows:
 * - Context of the operation that failed
 * - Brief description of the problem
 * - Close button for manual dismissal
 *
 * Notifications automatically dismiss after 15 seconds (handled by manager)
 * or can be manually dismissed by clicking the close button.
 *
 * Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3
 * Properties: 20, 21, 22
 *
 * @example
 * ```tsx
 * const manager = new ErrorNotificationManager();
 * <NotificationUI manager={manager} />
 * ```
 */
export function NotificationUI({ manager, className = '' }: NotificationUIProps) {
  // Requirements: error-notifications.1.1 - Display error notifications
  // Property: 20
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  /**
   * Subscribe to notification changes from ErrorNotificationManager
   * Requirements: error-notifications.1.1
   */
  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = manager.subscribe((updatedNotifications) => {
      setNotifications(updatedNotifications);
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, [manager]);

  /**
   * Handle notification dismissal
   * Requirements: error-notifications.1.3
   * Property: 22
   */
  const handleDismiss = (id: string) => {
    manager.dismissNotification(id);
  };

  // Don't render anything if there are no notifications
  if (notifications.length === 0) {
    return null;
  }

  // Requirements: error-notifications.1.1, error-notifications.1.2, error-notifications.1.3
  // Property: 20, 21, 22
  return (
    <div className={`notification-container ${className}`}>
      <div className="notification-list">
        {notifications.map((notification) => (
          <div key={notification.id} className="notification-item">
            {/* Requirements: error-notifications.1.2 - Display context and message */}
            {/* Property: 21 */}
            <div className="notification-content">
              <div className="notification-context">{notification.context}</div>
              <div className="notification-message">{notification.message}</div>
            </div>

            {/* Requirements: error-notifications.1.3 - Close button for dismissal */}
            {/* Property: 22 */}
            <button
              className="notification-close"
              onClick={() => handleDismiss(notification.id)}
              aria-label="Dismiss notification"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 4L4 12M4 4L12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Inline styles for NotificationUI component */}
      {/* Requirements: error-notifications.1.2 - Styles integrated with application theme */}
      <style>{`
        .notification-container {
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 9999;
          max-width: 400px;
          width: calc(100% - 2rem);
          pointer-events: none;
        }

        /* Requirements: error-notifications.1.2 - Responsive design for different screen sizes */
        @media (max-width: 640px) {
          .notification-container {
            top: 0.5rem;
            right: 0.5rem;
            left: 0.5rem;
            max-width: none;
            width: calc(100% - 1rem);
          }
        }

        .notification-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          pointer-events: auto;
        }

        /* Requirements: error-notifications.1.2 - Notification item using theme colors */
        .notification-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: hsl(var(--destructive) / 0.1);
          border: 1px solid hsl(var(--destructive) / 0.3);
          border-radius: 0.75rem;
          padding: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          animation: slideIn 0.3s ease-out;
          backdrop-filter: blur(8px);
        }

        @keyframes slideIn {
          from {
            transform: translateX(calc(100% + 1rem));
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        /* Requirements: error-notifications.1.2 - Responsive padding for mobile */
        @media (max-width: 640px) {
          .notification-item {
            padding: 0.875rem;
            gap: 0.625rem;
          }
        }

        .notification-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }

        /* Requirements: error-notifications.1.2 - Context label using theme colors */
        .notification-context {
          font-size: 0.75rem;
          font-weight: 600;
          color: hsl(var(--destructive));
          text-transform: uppercase;
          letter-spacing: 0.025em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Requirements: error-notifications.1.2 - Message text using theme colors */
        .notification-message {
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          line-height: 1.5;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        /* Requirements: error-notifications.1.2 - Responsive font sizes for mobile */
        @media (max-width: 640px) {
          .notification-context {
            font-size: 0.6875rem;
          }

          .notification-message {
            font-size: 0.8125rem;
          }
        }

        /* Requirements: error-notifications.1.2 - Close button using theme colors */
        .notification-close {
          flex-shrink: 0;
          width: 1.5rem;
          height: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: hsl(var(--destructive));
          cursor: pointer;
          border-radius: 0.375rem;
          transition: background-color 0.2s, color 0.2s, transform 0.1s;
          padding: 0;
        }

        .notification-close:hover {
          background-color: hsl(var(--destructive) / 0.2);
          color: hsl(var(--destructive));
        }

        .notification-close:focus {
          outline: none;
          box-shadow: 0 0 0 2px hsl(var(--destructive) / 0.3);
        }

        .notification-close:active {
          transform: scale(0.95);
        }

        /* Requirements: error-notifications.1.2 - Responsive close button for mobile */
        @media (max-width: 640px) {
          .notification-close {
            width: 2rem;
            height: 2rem;
          }
        }

        /* Dark mode support using theme variables */
        @media (prefers-color-scheme: dark) {
          .notification-item {
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
          }
        }
      `}</style>
    </div>
  );
}
