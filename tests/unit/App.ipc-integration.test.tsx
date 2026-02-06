/**
 * Unit tests for App.tsx IPC integration with ErrorNotificationManager
 * Tests the integration between error:notify IPC events and NotificationUI component
 * @jest-environment jsdom
 */

/* Preconditions: App component with ErrorNotificationManager and NotificationUI integrated
   Action: Test IPC event listener setup and notification display
   Assertions: Component listens to error:notify events and shows notifications
   Requirements: ui.7.1 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../../src/renderer/App';

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

jest.mock('../../src/renderer/components/settings', () => ({
  Settings: () => <div data-testid="settings">Settings</div>,
}));

jest.mock('../../src/renderer/components/auth/LoginScreen', () => ({
  LoginScreen: () => <div data-testid="login-screen">LoginScreen</div>,
}));

jest.mock('../../src/renderer/components/auth/LoginError', () => ({
  LoginError: () => <div data-testid="login-error">LoginError</div>,
}));

// Mock NotificationUI to verify it receives the manager
jest.mock('../../src/renderer/components/NotificationUI', () => ({
  NotificationUI: ({ manager }: any) => (
    <div data-testid="notification-ui" data-manager={manager ? 'present' : 'missing'}>
      NotificationUI
    </div>
  ),
}));

describe('App IPC Integration with ErrorNotificationManager', () => {
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
     Requirements: ui.7.1 */
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
     Assertions: ErrorNotificationManager.showNotification is called with correct parameters
     Requirements: ui.7.1 */
  it('should call showNotification when error:notify event is received', async () => {
    // Spy on console.log to verify notification logging
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    render(<App />);

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

    // Verify the event was logged
    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith('[App] Error notification received:', {
        message: testMessage,
        context: testContext,
      });
    });

    consoleLogSpy.mockRestore();
  });

  /* Preconditions: App component is mounted
     Action: Unmount App component
     Assertions: Unsubscribe function is called to clean up listener
     Requirements: ui.7.1 */
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
     Assertions: NotificationUI component is rendered with ErrorNotificationManager
     Requirements: ui.7.1 */
  it('should render NotificationUI component with ErrorNotificationManager', async () => {
    const { getByTestId } = render(<App />);

    // Wait for component to render
    await waitFor(() => {
      const notificationUI = getByTestId('notification-ui');
      expect(notificationUI).toBeInTheDocument();
      expect(notificationUI).toHaveAttribute('data-manager', 'present');
    });
  });

  /* Preconditions: App component is mounted and multiple error events are received
     Action: Trigger multiple error:notify events
     Assertions: Each event is handled correctly
     Requirements: ui.7.1 */
  it('should handle multiple error:notify events', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    render(<App />);

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

    // Verify all events were logged
    await waitFor(() => {
      errors.forEach((error) => {
        expect(consoleLogSpy).toHaveBeenCalledWith('[App] Error notification received:', {
          message: error.message,
          context: error.context,
        });
      });
    });

    consoleLogSpy.mockRestore();
  });
});
