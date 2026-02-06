/**
 * @jest-environment jsdom
 */

/* Preconditions: NotificationUI component and ErrorNotificationManager are implemented
   Action: Test NotificationUI component integration with ErrorNotificationManager
   Assertions: Component subscribes to manager, updates on changes, and cleans up properly
   Requirements: ui.7.1, ui.7.2, ui.7.3 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationUI } from '../../../src/renderer/components/NotificationUI';
import { ErrorNotificationManager } from '../../../src/renderer/managers/ErrorNotificationManager';

describe('NotificationUI Component', () => {
  let manager: ErrorNotificationManager;

  beforeEach(() => {
    manager = new ErrorNotificationManager();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /* Preconditions: NotificationUI component is rendered with ErrorNotificationManager
     Action: Render component and check if subscribe is called
     Assertions: Component subscribes to manager on mount
     Requirements: ui.7.1 */
  it('should subscribe to manager on mount', () => {
    // Spy on subscribe method
    const subscribeSpy = jest.spyOn(manager, 'subscribe');

    // Render component
    render(<NotificationUI manager={manager} />);

    // Verify subscribe was called
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledWith(expect.any(Function));

    subscribeSpy.mockRestore();
  });

  /* Preconditions: NotificationUI component is rendered with ErrorNotificationManager
     Action: Show notification through manager and trigger callback
     Assertions: Component updates and displays new notifications
     Requirements: ui.7.1, ui.7.2 */
  it('should update when notifications change', async () => {
    // Render component
    render(<NotificationUI manager={manager} />);

    // Initially no notifications
    expect(screen.queryByText('Test Context')).not.toBeInTheDocument();

    // Show notification through manager
    manager.showNotification('Test error message', 'Test Context');

    // Wait for component to update
    await waitFor(() => {
      expect(screen.getByText('Test Context')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });
  });

  /* Preconditions: NotificationUI component is rendered and subscribed
     Action: Unmount component
     Assertions: Subscription is cleaned up (unsubscribe is called)
     Requirements: ui.7.1 */
  it('should cleanup subscription on unmount', () => {
    // Create a mock unsubscribe function
    const unsubscribeMock = jest.fn();

    // Spy on subscribe to return our mock unsubscribe
    const subscribeSpy = jest.spyOn(manager, 'subscribe').mockReturnValue(unsubscribeMock);

    // Render and unmount component
    const { unmount } = render(<NotificationUI manager={manager} />);

    // Verify subscribe was called
    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    // Unmount component
    unmount();

    // Verify unsubscribe was called
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    subscribeSpy.mockRestore();
  });

  /* Preconditions: NotificationUI component is rendered with multiple notifications
     Action: Manager updates notifications list
     Assertions: Component displays all updated notifications correctly
     Requirements: ui.7.1, ui.7.2 */
  it('should display multiple notifications correctly', async () => {
    // Render component
    render(<NotificationUI manager={manager} />);

    // Show multiple notifications
    manager.showNotification('First error', 'Context 1');
    manager.showNotification('Second error', 'Context 2');
    manager.showNotification('Third error', 'Context 3');

    // Wait for all notifications to appear
    await waitFor(() => {
      expect(screen.getByText('Context 1')).toBeInTheDocument();
      expect(screen.getByText('First error')).toBeInTheDocument();
      expect(screen.getByText('Context 2')).toBeInTheDocument();
      expect(screen.getByText('Second error')).toBeInTheDocument();
      expect(screen.getByText('Context 3')).toBeInTheDocument();
      expect(screen.getByText('Third error')).toBeInTheDocument();
    });
  });

  /* Preconditions: NotificationUI component is rendered with notifications
     Action: Dismiss notification through manager
     Assertions: Component updates and removes dismissed notification
     Requirements: ui.7.1, ui.7.3 */
  it('should update when notification is dismissed', async () => {
    // Render component
    render(<NotificationUI manager={manager} />);

    // Show notification
    const id = manager.showNotification('Test error', 'Test Context');

    // Wait for notification to appear
    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    // Dismiss notification
    manager.dismissNotification(id);

    // Wait for notification to disappear
    await waitFor(() => {
      expect(screen.queryByText('Test error')).not.toBeInTheDocument();
    });
  });

  /* Preconditions: NotificationUI component is rendered with notification
     Action: Click dismiss button
     Assertions: Notification is dismissed through manager
     Requirements: ui.7.3 */
  it('should dismiss notification when close button is clicked', async () => {
    // Spy on dismissNotification
    const dismissSpy = jest.spyOn(manager, 'dismissNotification');

    // Render component
    render(<NotificationUI manager={manager} />);

    // Show notification
    manager.showNotification('Test error', 'Test Context');

    // Wait for notification to appear
    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    // Find and click close button
    const closeButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(closeButton);

    // Verify dismissNotification was called
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(dismissSpy).toHaveBeenCalledWith(expect.any(String));

    dismissSpy.mockRestore();
  });

  /* Preconditions: NotificationUI component is rendered without notifications
     Action: Render component with empty notifications
     Assertions: Component renders nothing (returns null)
     Requirements: ui.7.1 */
  it('should render nothing when there are no notifications', () => {
    // Render component
    const { container } = render(<NotificationUI manager={manager} />);

    // Verify nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  /* Preconditions: NotificationUI component is rendered with notification
     Action: Wait for auto-dismiss timeout (15 seconds)
     Assertions: Notification is automatically dismissed
     Requirements: ui.7.3 */
  it('should auto-dismiss notification after 15 seconds', async () => {
    // Render component
    render(<NotificationUI manager={manager} />);

    // Show notification
    manager.showNotification('Test error', 'Test Context');

    // Wait for notification to appear
    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    // Fast-forward time by 15 seconds
    jest.advanceTimersByTime(15000);

    // Wait for notification to disappear
    await waitFor(() => {
      expect(screen.queryByText('Test error')).not.toBeInTheDocument();
    });
  });

  /* Preconditions: NotificationUI component is rendered with custom className
     Action: Render component with className prop
     Assertions: Custom className is applied to container
     Requirements: ui.7.1 */
  it('should apply custom className to container', async () => {
    // Render component with custom className
    const { container } = render(<NotificationUI manager={manager} className="custom-class" />);

    // Show notification to make container visible
    manager.showNotification('Test error', 'Test Context');

    // Wait for notification container to appear
    await waitFor(() => {
      const notificationContainer = container.querySelector('.notification-container');
      expect(notificationContainer).not.toBeNull();
      expect(notificationContainer).toHaveClass('custom-class');
    });
  });

  /* Preconditions: NotificationUI component is rendered with notifications
     Action: Show and dismiss multiple notifications in sequence
     Assertions: Component correctly handles rapid changes
     Requirements: ui.7.1, ui.7.3 */
  it('should handle rapid notification changes', async () => {
    // Render component
    render(<NotificationUI manager={manager} />);

    // Show first notification
    const id1 = manager.showNotification('Error 1', 'Context 1');

    await waitFor(() => {
      expect(screen.getByText('Error 1')).toBeInTheDocument();
    });

    // Show second notification
    const id2 = manager.showNotification('Error 2', 'Context 2');

    await waitFor(() => {
      expect(screen.getByText('Error 2')).toBeInTheDocument();
    });

    // Dismiss first notification
    manager.dismissNotification(id1);

    await waitFor(() => {
      expect(screen.queryByText('Error 1')).not.toBeInTheDocument();
      expect(screen.getByText('Error 2')).toBeInTheDocument();
    });

    // Show third notification
    manager.showNotification('Error 3', 'Context 3');

    await waitFor(() => {
      expect(screen.getByText('Error 3')).toBeInTheDocument();
    });

    // Dismiss second notification
    manager.dismissNotification(id2);

    await waitFor(() => {
      expect(screen.queryByText('Error 2')).not.toBeInTheDocument();
      expect(screen.getByText('Error 3')).toBeInTheDocument();
    });
  });
});
