/**
 * @jest-environment jsdom
 */

// Requirements: ui.6.1, ui.6.2, ui.6.3, ui.6.4, ui.6.8

// Mock window.api BEFORE any imports
const mockGetProfile = jest.fn();
const mockOnAuthSuccess = jest.fn();
const mockOnLogout = jest.fn();
const mockOnAuthError = jest.fn();

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
    },
  },
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Account } from '../../../src/renderer/components/account';

// Mock lucide-react User icon
jest.mock('lucide-react', () => ({
  User: ({ className }: { className: string }) => (
    <div data-testid="user-icon" className={className}>
      User Icon
    </div>
  ),
}));

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();

  // Default mock implementations - these methods don't return cleanup functions
  // They just register listeners via ipcRenderer.on() which doesn't return anything
  mockOnAuthSuccess.mockImplementation(() => {});
  mockOnLogout.mockImplementation(() => {});
  mockOnAuthError.mockImplementation(() => {});
});

describe('Account Component', () => {
  /* Preconditions: window.api.auth.getProfile() mocked to return { success: true, profile: null }
     Action: render Account component with React Testing Library
     Assertions: displays "Not signed in" text, no profile fields (name, email inputs), no loading state
     Requirements: ui.6.1 */
  it('should display empty state when not authenticated', async () => {
    // Mock getProfile to return no profile (user not authenticated)
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: null,
    });

    // Render the Account component
    render(<Account />);

    // Wait for loading to complete and check for "Not signed in" text
    await waitFor(() => {
      expect(screen.getByText('Not signed in')).toBeInTheDocument();
    });

    // Verify "Sign in to view your account information" helper text is present
    expect(screen.getByText('Sign in to view your account information')).toBeInTheDocument();

    // Verify profile fields are NOT present
    const nameInput = screen.queryByLabelText('Name');
    const emailInput = screen.queryByLabelText('Email');
    expect(nameInput).not.toBeInTheDocument();
    expect(emailInput).not.toBeInTheDocument();

    // Verify loading state is NOT present
    const loadingText = screen.queryByText('Loading profile...');
    expect(loadingText).not.toBeInTheDocument();

    // Verify the Account heading is present
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  /* Preconditions: test UserProfile object created with data (name: "John Doe", email: "john@example.com"), window.api.auth.getProfile() mocked to return { success: true, profile: testProfile }
     Action: render Account component with React Testing Library
     Assertions: displays name in input field with id="profile-name", displays email in input field with id="profile-email", both fields contain correct values
     Requirements: ui.6.2, ui.6.3 */
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

    // Render the Account component
    render(<Account />);

    // Wait for loading to complete and profile to be displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
    });

    // Get input elements by label
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
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

    // Verify "Not signed in" text is NOT present
    const notSignedInText = screen.queryByText('Not signed in');
    expect(notSignedInText).not.toBeInTheDocument();

    // Verify the Account heading is present
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  /* Preconditions: test profile created and getProfile() mocked, Account component rendered with profile data
     Action: get input elements for name and email (by id), check readOnly attribute, attempt to change values via fireEvent.change()
     Assertions: both input fields have readOnly attribute (element.readOnly === true), field values do not change after fireEvent.change()
     Requirements: ui.6.4 */
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

    // Render the Account component
    render(<Account />);

    // Wait for loading to complete and profile to be displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
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

  /* Preconditions: window.api.auth.onAuthSuccess() mocked to return cleanup function, window.api.auth.getProfile() mocked to track calls
     Action: render Account component, verify getProfile() called on mount (1 time), get callback from onAuthSuccess mock, invoke callback to simulate auth:success event
     Assertions: getProfile() called on mount (1 time), getProfile() called again after auth:success event (2 times total), UI updated with new profile data
     Requirements: ui.6.2 */
  it('should reload profile when auth:success event is received', async () => {
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

    // Variable to capture the auth:success callback
    let authSuccessCallback: (() => void) | undefined;

    // Mock onAuthSuccess to capture the callback function
    mockOnAuthSuccess.mockImplementation((callback: () => void) => {
      authSuccessCallback = callback;
      // No return value - matches real API
    });

    // Render the Account component
    render(<Account />);

    // Wait for initial loading to complete and verify initial profile is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('John Doe');
    });

    // Verify getProfile was called once during component mount
    expect(mockGetProfile).toHaveBeenCalledTimes(1);

    // Verify initial profile data is displayed
    const nameInputInitial = screen.getByLabelText('Name') as HTMLInputElement;
    const emailInputInitial = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputInitial.value).toBe('John Doe');
    expect(emailInputInitial.value).toBe('john@example.com');

    // Verify that onAuthSuccess was called to register the listener
    expect(mockOnAuthSuccess).toHaveBeenCalledTimes(1);
    expect(authSuccessCallback).toBeDefined();

    // Simulate auth:success event by calling the captured callback
    if (authSuccessCallback) {
      authSuccessCallback();
    }

    // Wait for profile to be reloaded and UI to update with new data
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('John Updated Doe');
    });

    // Verify getProfile was called a second time (2 times total)
    expect(mockGetProfile).toHaveBeenCalledTimes(2);

    // Verify updated profile data is displayed in UI
    const nameInputUpdated = screen.getByLabelText('Name') as HTMLInputElement;
    const emailInputUpdated = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputUpdated.value).toBe('John Updated Doe');
    expect(emailInputUpdated.value).toBe('john.doe@example.com');
  });

  /* Preconditions: test profile created and getProfile() mocked to return it, window.api.auth.onLogout() mocked to return cleanup function
     Action: render Account component with profile data, verify profile is displayed (name and email visible), get callback from onLogout mock, invoke callback to simulate logout event
     Assertions: component returns to empty state (displays "Not signed in"), profile fields are no longer displayed
     Requirements: ui.6.8 */
  it('should clear profile on logout', async () => {
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

    // Variable to capture the logout callback
    let logoutCallback: (() => void) | undefined;

    // Mock onLogout to capture the callback function
    mockOnLogout.mockImplementation((callback: () => void) => {
      logoutCallback = callback;
      // No return value - matches real API
    });

    // Render the Account component
    render(<Account />);

    // Wait for loading to complete and verify profile is displayed
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
    });

    // Verify profile data is displayed
    const nameInputBefore = screen.getByLabelText('Name') as HTMLInputElement;
    const emailInputBefore = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nameInputBefore.value).toBe('John Doe');
    expect(emailInputBefore.value).toBe('john@example.com');

    // Verify "Not signed in" text is NOT present
    expect(screen.queryByText('Not signed in')).not.toBeInTheDocument();

    // Verify that onLogout was called to register the listener
    expect(mockOnLogout).toHaveBeenCalledTimes(1);
    expect(logoutCallback).toBeDefined();

    // Simulate logout event by calling the captured callback
    if (logoutCallback) {
      logoutCallback();
    }

    // Wait for component to update and return to empty state
    await waitFor(() => {
      expect(screen.getByText('Not signed in')).toBeInTheDocument();
    });

    // Verify "Not signed in" text is displayed
    expect(screen.getByText('Not signed in')).toBeInTheDocument();

    // Verify helper text is displayed
    expect(screen.getByText('Sign in to view your account information')).toBeInTheDocument();

    // Verify profile fields are NO LONGER displayed
    const nameInputAfter = screen.queryByLabelText('Name');
    const emailInputAfter = screen.queryByLabelText('Email');
    expect(nameInputAfter).not.toBeInTheDocument();
    expect(emailInputAfter).not.toBeInTheDocument();

    // Verify the Account heading is still present
    expect(screen.getByText('Account')).toBeInTheDocument();
  });
});
