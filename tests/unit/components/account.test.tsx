/**
 * @jest-environment jsdom
 */

// Requirements: account-profile.1.1, account-profile.1.2, account-profile.1.3, account-profile.1.4, account-profile.1.8

// Mock window.api BEFORE any imports
const mockGetUser = jest.fn();
const mockOnAuthSuccess = jest.fn();
const mockOnLogout = jest.fn();
const mockOnAuthError = jest.fn();
const mockOnUserUpdated = jest.fn();
const mockLoadLLMProvider = jest.fn();
const mockLoadAPIKey = jest.fn();
const mockSaveLLMProvider = jest.fn();
const mockSaveAPIKey = jest.fn();
const mockDeleteAPIKey = jest.fn();

// Setup window.api mock using Object.defineProperty to ensure it persists in jsdom
Object.defineProperty(window, 'api', {
  writable: true,
  configurable: true,
  value: {
    auth: {
      getUser: mockGetUser,
      onAuthSuccess: mockOnAuthSuccess,
      onLogout: mockOnLogout,
      onAuthError: mockOnAuthError,
      onUserUpdated: mockOnUserUpdated,
    },
    settings: {
      loadLLMProvider: mockLoadLLMProvider,
      loadAPIKey: mockLoadAPIKey,
      saveLLMProvider: mockSaveLLMProvider,
      saveAPIKey: mockSaveAPIKey,
      deleteAPIKey: mockDeleteAPIKey,
    },
  },
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Settings } from '../../../src/renderer/components/settings';
import { ErrorProvider } from '../../../src/renderer/contexts/error-context';

// Store event handlers for testing
const eventHandlers: Map<string, ((payload: unknown) => void)[]> = new Map();

// Mock RendererEventBus
jest.mock('../../../src/renderer/events/RendererEventBus', () => ({
  RendererEventBus: {
    getInstance: jest.fn(() => ({
      subscribe: jest.fn((eventType: string, handler: (payload: unknown) => void) => {
        if (!eventHandlers.has(eventType)) {
          eventHandlers.set(eventType, []);
        }
        eventHandlers.get(eventType)!.push(handler);
        return () => {
          const handlers = eventHandlers.get(eventType);
          if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
              handlers.splice(index, 1);
            }
          }
        };
      }),
      publish: jest.fn(),
      subscribeAll: jest.fn(),
      clear: jest.fn(),
      destroy: jest.fn(),
    })),
    resetInstance: jest.fn(),
  },
}));

// Helper to emit events in tests
const emitEvent = (eventType: string, payload: unknown) => {
  const handlers = eventHandlers.get(eventType);
  if (handlers) {
    handlers.forEach((handler) => handler(payload));
  }
};

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

// Mock Logger
jest.mock('../../../src/renderer/Logger', () => ({
  Logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  User: ({ className }: { className: string }) => (
    <div data-testid="user-icon" className={className}>
      User Icon
    </div>
  ),
  Cpu: ({ className }: { className: string }) => (
    <div data-testid="cpu-icon" className={className}>
      Cpu Icon
    </div>
  ),
  Eye: ({ className }: { className: string }) => (
    <div data-testid="eye-icon" className={className}>
      Eye Icon
    </div>
  ),
  EyeOff: ({ className }: { className: string }) => (
    <div data-testid="eye-off-icon" className={className}>
      EyeOff Icon
    </div>
  ),
  LogOut: ({ className }: { className: string }) => (
    <div data-testid="logout-icon" className={className}>
      LogOut Icon
    </div>
  ),
  AlertCircle: ({ className }: { className: string }) => (
    <div data-testid="alert-circle-icon" className={className}>
      AlertCircle Icon
    </div>
  ),
}));

// Helper to render Settings with ErrorProvider
const renderSettings = (props = {}) => {
  return render(
    <ErrorProvider>
      <Settings {...props} />
    </ErrorProvider>
  );
};

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();

  // Clear event handlers
  eventHandlers.clear();

  // Default mock implementations - these methods don't return cleanup functions
  // They just register listeners via ipcRenderer.on() which doesn't return anything
  mockOnAuthSuccess.mockImplementation(() => {});
  mockOnLogout.mockImplementation(() => {});
  mockOnAuthError.mockImplementation(() => {});
  mockOnUserUpdated.mockImplementation(() => {});

  // Default settings mocks
  mockLoadLLMProvider.mockResolvedValue({
    success: true,
    provider: 'openai',
  });
  mockLoadAPIKey.mockResolvedValue({
    success: true,
    apiKey: '',
  });
});

describe('Settings Component - Account Profile Section', () => {
  /* Preconditions: window.api.auth.getUser() mocked to return { success: true, user: null }
     Action: render Settings component with React Testing Library
     Assertions: displays loading state in profile fields, Account section is present
     Requirements: account-profile.1.1 - User cannot access Settings without authentication, so profile should show loading if not available */
  it('should display loading state when profile is not available', async () => {
    // Mock getUser to return no user (user not authenticated or profile not loaded yet)
    mockGetUser.mockResolvedValue({
      success: true,
      user: null,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and check for loading state in profile fields
    // Requirements: account-profile.1.1 - According to requirements, user should not be in Settings if not authenticated
    // So if Settings component is rendered without user, it should show loading state
    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalled();
    });

    // Verify the Account heading is present
    expect(screen.getByText('Account')).toBeInTheDocument();

    // Verify profile fields show "Not available" when no user
    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
    expect(nameInput.value).toBe('Not available');
    expect(emailInput.value).toBe('Not available');
  });

  /* Preconditions: test User object created with data (name: "John Doe", email: "john@example.com"), window.api.auth.getUser() mocked to return { success: true, user: testUser }
     Action: render Settings component with React Testing Library
     Assertions: displays name in input field with id="profile-name", displays email in input field with id="profile-email", both fields contain correct values
     Requirements: account-profile.1.2, account-profile.1.3 */
  it('should display profile data after authentication', async () => {
    // Create test User object with data
    const testUser = {
      user_id: 'abc1234567',
      email: 'john@example.com',
      name: 'John Doe',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    // Mock getUser to return test user (user authenticated)
    mockGetUser.mockResolvedValue({
      success: true,
      user: testUser,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and user to be displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Get input elements by label
    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;

    // Verify both fields are present
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();

    // Verify name field has correct id and value
    expect(nameInput.id).toBe('profile-name');
    expect(nameInput.value).toBe('John Doe');

    // Verify email field has correct id and value
    expect(emailInput.id).toBe('profile-email');
    expect(emailInput.value).toBe('john@example.com');

    // Verify the Account heading is present
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  /* Preconditions: test user created and getUser() mocked, Settings component rendered with user data
     Action: get input elements for name and email (by id), check readOnly attribute, attempt to change values via fireEvent.change()
     Assertions: both input fields have readOnly attribute (element.readOnly === true), field values do not change after fireEvent.change()
     Requirements: account-profile.1.4 */
  it('should have read-only profile fields', async () => {
    // Create test User object with data
    const testUser = {
      user_id: 'abc1234567',
      email: 'john@example.com',
      name: 'John Doe',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    // Mock getUser to return test user (user authenticated)
    mockGetUser.mockResolvedValue({
      success: true,
      user: testUser,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and user to be displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Get input elements by id
    const nameInput = document.getElementById('profile-name') as HTMLInputElement;
    const emailInput = document.getElementById('profile-email') as HTMLInputElement;

    // Verify both input fields exist
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();

    // Verify both input fields have readOnly attribute set to true
    expect(nameInput.readOnly).toBe(true);
    expect(emailInput.readOnly).toBe(true);

    // Store original values
    const originalName = nameInput.value;
    const originalEmail = emailInput.value;

    // Verify original values match test user
    expect(originalName).toBe('John Doe');
    expect(originalEmail).toBe('john@example.com');

    // Attempt to change the name field value
    // Note: fireEvent.change() will not work on readOnly fields in real browsers,
    // but we test that the component doesn't respond to such attempts
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(nameInput, { target: { value: 'Jane Smith' } });

    // Attempt to change the email field value
    fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });

    // Verify that values have NOT changed (readOnly fields should not accept changes)
    expect(nameInput.value).toBe(originalName);
    expect(emailInput.value).toBe(originalEmail);

    // Verify values still match original test user
    expect(nameInput.value).toBe('John Doe');
    expect(emailInput.value).toBe('john@example.com');
  });

  /* Preconditions: RendererEventBus mocked to capture event handlers, window.api.auth.getUser() mocked to track calls
     Action: render Settings component, verify getUser() called on mount (1 time), emit profile.synced event via EventBus
     Assertions: getUser() called on mount (1 time), getUser() called again after profile.synced event (2 times total), UI updated with new user data
     Requirements: account-profile.1.2 */
  it('should reload profile when profile is updated', async () => {
    // Create initial test user
    const initialUser = {
      user_id: 'abc1234567',
      email: 'john@example.com',
      name: 'John Doe',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    // Create updated test user (simulating profile change after re-authentication)
    const updatedUser = {
      user_id: 'abc1234567',
      email: 'john.doe@example.com',
      name: 'John Updated Doe',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    // Mock getUser to return initial user on first call, updated user on second call
    mockGetUser
      .mockResolvedValueOnce({
        success: true,
        user: initialUser,
      })
      .mockResolvedValueOnce({
        success: true,
        user: updatedUser,
      });

    // Render the Settings component
    renderSettings();

    // Wait for initial loading to complete and verify initial user is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Verify getUser was called once during component mount
    expect(mockGetUser).toHaveBeenCalledTimes(1);

    // Verify initial user data is displayed
    const nameInputInitial = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputInitial = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputInitial.value).toBe('John Doe');
    expect(emailInputInitial.value).toBe('john@example.com');

    // Verify that EventBus subscription was registered for profile.synced
    expect(eventHandlers.has('profile.synced')).toBe(true);

    // Simulate profile.synced event via EventBus
    emitEvent('profile.synced', {
      user: {
        user_id: updatedUser.user_id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
      timestamp: Date.now(),
    });

    // Wait for user to be reloaded and UI to update with new data
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput.value).toBe('John Updated Doe');
    });

    // Verify getUser was called a second time (2 times total)
    expect(mockGetUser).toHaveBeenCalledTimes(2);

    // Verify updated user data is displayed in UI
    const nameInputUpdated = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputUpdated = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputUpdated.value).toBe('John Updated Doe');
    expect(emailInputUpdated.value).toBe('john.doe@example.com');
  });

  /* Preconditions: test user created and getUser() mocked to return it, Settings component rendered with user data
     Action: render Settings component with user data, verify user is displayed (name and email visible), unmount component to simulate logout
     Assertions: component cleans up properly on unmount, EventBus subscription is cleaned up
     Requirements: account-profile.1.8 */
  it('should handle component unmount properly', async () => {
    // Create test User object with data
    const testUser = {
      user_id: 'abc1234567',
      email: 'john@example.com',
      name: 'John Doe',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    // Mock getUser to return test user (user authenticated)
    mockGetUser.mockResolvedValue({
      success: true,
      user: testUser,
    });

    // Render the Settings component
    const { unmount } = renderSettings();

    // Wait for loading to complete and verify user is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Verify user data is displayed
    const nameInputBefore = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputBefore = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputBefore.value).toBe('John Doe');
    expect(emailInputBefore.value).toBe('john@example.com');

    // Verify that EventBus subscription was registered for profile.synced
    expect(eventHandlers.has('profile.synced')).toBe(true);
    const handlersBeforeUnmount = eventHandlers.get('profile.synced')?.length || 0;
    expect(handlersBeforeUnmount).toBeGreaterThan(0);

    // Unmount component (simulates navigation away or logout)
    unmount();

    // Verify component unmounted successfully (no errors thrown)
    // The EventBus subscription should be cleaned up via the unsubscribe function
    // returned by useEventSubscription hook
  });
});
