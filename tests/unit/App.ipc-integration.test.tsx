/**
 * Unit tests for App.tsx IPC integration with error notification system
 * Tests the integration between error:notify IPC events and ErrorNotificationManager
 * @jest-environment jsdom
 */

/* Preconditions: App component with ErrorProvider and ErrorNotificationManager integrated
   Action: Test IPC event listener setup and notification display
   Assertions: Component listens to error:notify events and shows notifications via NotificationUI
   Requirements: error-notifications.1.1 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../../src/renderer/App';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
  Toaster: () => <div data-testid="toaster">Toaster</div>,
}));

// Mock all child components to isolate App logic
jest.mock('../../src/renderer/components/top-navigation', () => ({
  TopNavigation: () => <div data-testid="top-navigation">TopNavigation</div>,
}));

jest.mock('../../src/renderer/components/ai-agent-panel', () => ({
  AIAgentPanel: () => <div data-testid="ai-agent-panel">AIAgentPanel</div>,
}));

jest.mock('../../src/renderer/components/dashboard-updated', () => ({
  DashboardUpdated: () => <div data-testid="dashboard">Dashboard</div>,
}));

jest.mock('../../src/renderer/components/calendar-view', () => ({
  CalendarView: () => <div data-testid="calendar">Calendar</div>,
}));

jest.mock('../../src/renderer/components/meeting-detail', () => ({
  MeetingDetail: () => <div data-testid="meeting-detail">MeetingDetail</div>,
}));

jest.mock('../../src/renderer/components/tasks-view-new', () => ({
  TasksViewNew: () => <div data-testid="tasks">Tasks</div>,
}));

jest.mock('../../src/renderer/components/contacts', () => ({
  Contacts: () => <div data-testid="contacts">Contacts</div>,
}));

jest.mock('../../src/renderer/components/triggers', () => ({
  Triggers: () => <div data-testid="triggers">Triggers</div>,
}));

jest.mock('../../src/renderer/components/error-demo-page', () => ({
  ErrorDemoPage: () => <div data-testid="error-demo">ErrorDemoPage</div>,
}));

jest.mock('../../src/renderer/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

describe('App IPC Integration with Error Notification System', () => {
  let mockOnNotify: jest.Mock;
  let mockUnsubscribe: jest.Mock;
  let errorNotifyCallback: ((message: string, context: string) => void) | null = null;

  beforeEach(() => {
    // Reset callback
    errorNotifyCallback = null;

    // Mock unsubscribe function
    mockUnsubscribe = jest.fn();

    // Mock window.api.error.onNotify to capture the callback
    mockOnNotify = jest.fn((callback: (message: string, context: string) => void) => {
      errorNotifyCallback = callback;
      return mockUnsubscribe;
    });

    // Mock window.api in jsdom environment
    Object.defineProperty(window, 'api', {
      writable: true,
      configurable: true,
      value: {
        auth: {
          getStatus: jest.fn().mockResolvedValue({ authorized: true }),
          onAuthSuccess: jest.fn(() => jest.fn()), // Return unsubscribe function
          onAuthError: jest.fn(() => jest.fn()), // Return unsubscribe function
          onLogout: jest.fn(() => jest.fn()), // Return unsubscribe function
          onShowLoader: jest.fn(() => jest.fn()), // Return unsubscribe function
          onHideLoader: jest.fn(() => jest.fn()), // Return unsubscribe function
        },
        error: {
          onNotify: mockOnNotify,
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up window.api
    delete (window as any).api;
  });

  /* Preconditions: App component is mounted
     Action: Render App component
     Assertions: window.api.error.onNotify is called to set up listener
     Requirements: error-notifications.1.1 */
  it('should set up error:notify IPC listener on mount', async () => {
    render(<App />);

    // Wait for useEffect to run
    await waitFor(() => {
      expect(mockOnNotify).toHaveBeenCalledTimes(1);
    });

    // Verify callback was registered
    expect(mockOnNotify).toHaveBeenCalledWith(expect.any(Function));
  });

  /* Preconditions: App component is mounted and IPC listener is set up
     Action: Trigger error:notify event through callback
     Assertions: Notification is displayed via ErrorNotificationManager
     Requirements: error-notifications.1.1 */
  it('should display notification when error:notify event is received', async () => {
    // Spy on console.info to verify notification logging (Logger uses console.info for info level)
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

    const { container } = render(<App />);

    // Wait for listener to be set up
    await waitFor(() => {
      expect(errorNotifyCallback).not.toBeNull();
    });

    // Trigger the error:notify event
    const testMessage = 'Failed to load data';
    const testContext = 'Loading user profile';

    if (errorNotifyCallback) {
      errorNotifyCallback(testMessage, testContext);
    }

    // Verify the event was logged with new Logger format: [timestamp] [INFO] [App] message
    await waitFor(() => {
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [App] Error notification received:')
      );
    });

    // Verify notification is displayed via NotificationUI component
    await waitFor(() => {
      const notificationContext = container.querySelector('.notification-context');
      const notificationMessage = container.querySelector('.notification-message');
      expect(notificationContext).toBeInTheDocument();
      expect(notificationContext).toHaveTextContent(testContext);
      expect(notificationMessage).toBeInTheDocument();
      expect(notificationMessage).toHaveTextContent(testMessage);
    });

    consoleInfoSpy.mockRestore();
  });

  /* Preconditions: App component is mounted
     Action: Unmount App component
     Assertions: Unsubscribe function is called to clean up listener
     Requirements: error-notifications.1.1 */
  it('should clean up error:notify listener on unmount', async () => {
    const { unmount } = render(<App />);

    // Wait for listener to be set up
    await waitFor(() => {
      expect(mockOnNotify).toHaveBeenCalled();
    });

    // Unmount component
    unmount();

    // Verify unsubscribe was called
    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  /* Preconditions: App component is mounted
     Action: Render App component
     Assertions: Toaster and NotificationUI components are rendered
     Requirements: error-notifications.1.1 */
  it('should render Toaster and NotificationUI components', async () => {
    const { getByTestId } = render(<App />);

    // Wait for component to render
    await waitFor(() => {
      const toaster = getByTestId('toaster');
      expect(toaster).toBeInTheDocument();
    });

    // NotificationUI is rendered but returns null when there are no notifications
    // We just verify the component doesn't crash during render
  });

  /* Preconditions: App component is mounted and multiple error events are received
     Action: Trigger multiple error:notify events
     Assertions: Each event triggers notification display via ErrorNotificationManager
     Requirements: error-notifications.1.1 */
  it('should handle multiple error:notify events', async () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

    const { container } = render(<App />);

    // Wait for listener to be set up
    await waitFor(() => {
      expect(errorNotifyCallback).not.toBeNull();
    });

    // Trigger multiple error events
    const errors = [
      { message: 'Network error', context: 'Syncing calendar' },
      { message: 'Auth failed', context: 'Refreshing token' },
      { message: 'Database error', context: 'Saving data' },
    ];

    for (const error of errors) {
      if (errorNotifyCallback) {
        errorNotifyCallback(error.message, error.context);
      }
    }

    // Verify all events were logged with new Logger format
    await waitFor(() => {
      errors.forEach((_error) => {
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.stringContaining('[INFO] [App] Error notification received:')
        );
      });
    });

    // Verify notifications are displayed via NotificationUI component
    await waitFor(() => {
      errors.forEach((_error) => {
        const notificationContext = container.querySelector('.notification-context');
        const notificationMessage = container.querySelector('.notification-message');
        expect(notificationContext).toBeInTheDocument();
        expect(notificationMessage).toBeInTheDocument();
      });
    });

    consoleInfoSpy.mockRestore();
  });
});
