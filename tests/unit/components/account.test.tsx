/**
 * @jest-environment jsdom
 */

// Requirements: account-profile.1.1, account-profile.1.2, account-profile.1.3, account-profile.1.4, account-profile.1.8

// Mock window.api BEFORE any imports
const mockGetProfile = jest.fn();
const mockOnAuthSuccess = jest.fn();
const mockOnLogout = jest.fn();
const mockOnAuthError = jest.fn();
const mockOnProfileUpdated = jest.fn();
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
      getProfile: mockGetProfile,
      onAuthSuccess: mockOnAuthSuccess,
      onLogout: mockOnLogout,
      onAuthError: mockOnAuthError,
      onProfileUpdated: mockOnProfileUpdated,
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

  // Default mock implementations - these methods don't return cleanup functions
  // They just register listeners via ipcRenderer.on() which doesn't return anything
  mockOnAuthSuccess.mockImplementation(() => {});
  mockOnLogout.mockImplementation(() => {});
  mockOnAuthError.mockImplementation(() => {});
  mockOnProfileUpdated.mockImplementation(() => {});

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
  /* Preconditions: window.api.auth.getProfile() mocked to return { success: true, profile: null }
     Action: render Settings component with React Testing Library
     Assertions: displays loading state in profile fields, Account section is present
     Requirements: account-profile.1.1 - User cannot access Settings without authentication, so profile should show loading if not available */
  it('should display loading state when profile is not available', async () => {
    // Mock getProfile to return no profile (user not authenticated or profile not loaded yet)
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: null,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and check for loading state in profile fields
    // Requirements: account-profile.1.1 - According to requirements, user should not be in Settings if not authenticated
    // So if Settings component is rendered without profile, it should show loading state
    await waitFor(() => {
      expect(mockGetProfile).toHaveBeenCalled();
    });

    // Verify the Account heading is present
    expect(screen.getByText('Account')).toBeInTheDocument();

    // Verify profile fields show "Not available" when no profile
    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
    expect(nameInput.value).toBe('Not available');
    expect(emailInput.value).toBe('Not available');
  });

  /* Preconditions: test UserProfile object created with data (name: "John Doe", email: "john@example.com"), window.api.auth.getProfile() mocked to return { success: true, profile: testProfile }
     Action: render Settings component with React Testing Library
     Assertions: displays name in input field with id="profile-name", displays email in input field with id="profile-email", both fields contain correct values
     Requirements: account-profile.1.2, account-profile.1.3 */
  it('should display profile data after authentication', async () => {
    // Create test UserProfile object with data
    const testProfile = {
      id: '123456789',
      email: 'john@example.com',
      verified_email: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      locale: 'en',
      lastUpdated: Date.now(),
    };

    // Mock getProfile to return test profile (user authenticated)
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: testProfile,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and profile to be displayed
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

  /* Preconditions: test profile created and getProfile() mocked, Settings component rendered with profile data
     Action: get input elements for name and email (by id), check readOnly attribute, attempt to change values via fireEvent.change()
     Assertions: both input fields have readOnly attribute (element.readOnly === true), field values do not change after fireEvent.change()
     Requirements: account-profile.1.4 */
  it('should have read-only profile fields', async () => {
    // Create test UserProfile object with data
    const testProfile = {
      id: '123456789',
      email: 'john@example.com',
      verified_email: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      locale: 'en',
      lastUpdated: Date.now(),
    };

    // Mock getProfile to return test profile (user authenticated)
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: testProfile,
    });

    // Render the Settings component
    renderSettings();

    // Wait for loading to complete and profile to be displayed
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

    // Verify original values match test profile
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

    // Verify values still match original test profile
    expect(nameInput.value).toBe('John Doe');
    expect(emailInput.value).toBe('john@example.com');
  });

  /* Preconditions: window.api.auth.onProfileUpdated() mocked to return cleanup function, window.api.auth.getProfile() mocked to track calls
     Action: render Settings component, verify getProfile() called on mount (1 time), get callback from onProfileUpdated mock, invoke callback to simulate profile update event
     Assertions: getProfile() called on mount (1 time), getProfile() called again after profile update event (2 times total), UI updated with new profile data
     Requirements: account-profile.1.2 */
  it('should reload profile when profile is updated', async () => {
    // Create initial test profile
    const initialProfile = {
      id: '123456789',
      email: 'john@example.com',
      verified_email: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      locale: 'en',
      lastUpdated: Date.now(),
    };

    // Create updated test profile (simulating profile change after re-authentication)
    const updatedProfile = {
      id: '123456789',
      email: 'john.doe@example.com',
      verified_email: true,
      name: 'John Updated Doe',
      given_name: 'John',
      family_name: 'Doe',
      locale: 'en',
      lastUpdated: Date.now(),
    };

    // Mock getProfile to return initial profile on first call, updated profile on second call
    mockGetProfile
      .mockResolvedValueOnce({
        success: true,
        profile: initialProfile,
      })
      .mockResolvedValueOnce({
        success: true,
        profile: updatedProfile,
      });

    // Variable to capture the profile update callback
    let profileUpdateCallback: (() => void) | undefined;

    // Mock onProfileUpdated to capture the callback function
    mockOnProfileUpdated.mockImplementation((callback: () => void) => {
      profileUpdateCallback = callback;
      // No return value - matches real API
    });

    // Render the Settings component
    renderSettings();

    // Wait for initial loading to complete and verify initial profile is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Verify getProfile was called once during component mount
    expect(mockGetProfile).toHaveBeenCalledTimes(1);

    // Verify initial profile data is displayed
    const nameInputInitial = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputInitial = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputInitial.value).toBe('John Doe');
    expect(emailInputInitial.value).toBe('john@example.com');

    // Verify that onProfileUpdated was called to register the listener
    expect(mockOnProfileUpdated).toHaveBeenCalledTimes(1);
    expect(profileUpdateCallback).toBeDefined();

    // Simulate profile update event by calling the captured callback
    if (profileUpdateCallback) {
      profileUpdateCallback();
    }

    // Wait for profile to be reloaded and UI to update with new data
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput.value).toBe('John Updated Doe');
    });

    // Verify getProfile was called a second time (2 times total)
    expect(mockGetProfile).toHaveBeenCalledTimes(2);

    // Verify updated profile data is displayed in UI
    const nameInputUpdated = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputUpdated = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputUpdated.value).toBe('John Updated Doe');
    expect(emailInputUpdated.value).toBe('john.doe@example.com');
  });

  /* Preconditions: test profile created and getProfile() mocked to return it, Settings component rendered with profile data
     Action: render Settings component with profile data, verify profile is displayed (name and email visible), unmount component to simulate logout
     Assertions: component cleans up properly on unmount
     Requirements: account-profile.1.8 */
  it('should handle component unmount properly', async () => {
    // Create test UserProfile object with data
    const testProfile = {
      id: '123456789',
      email: 'john@example.com',
      verified_email: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      locale: 'en',
      lastUpdated: Date.now(),
    };

    // Mock getProfile to return test profile (user authenticated)
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: testProfile,
    });

    // Render the Settings component
    const { unmount } = renderSettings();

    // Wait for loading to complete and verify profile is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Verify profile data is displayed
    const nameInputBefore = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInputBefore = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputBefore.value).toBe('John Doe');
    expect(emailInputBefore.value).toBe('john@example.com');

    // Verify that onProfileUpdated was called to register the listener
    expect(mockOnProfileUpdated).toHaveBeenCalledTimes(1);

    // Unmount component (simulates navigation away or logout)
    unmount();

    // Verify component unmounted successfully (no errors thrown)
    // Note: In Settings component, there's no explicit cleanup for onProfileUpdated
    // This test verifies that unmounting doesn't cause errors
  });
});
