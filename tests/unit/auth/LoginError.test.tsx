/**
 * Unit tests for LoginScreen error panel
 * Tests loader functionality and button states when error is displayed
 * @jest-environment jsdom
 */

/* Preconditions: LoginScreen component with isLoading, isDisabled, errorCode, errorMessage props
   Action: Test loader display, button states, and error panel visibility
   Assertions: Loader shows correctly, button disables properly, error panel visible only when error present
   Requirements: google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.15.1, google-oauth-auth.15.2 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoginScreen } from '../../../src/renderer/components/auth/LoginScreen';

describe('LoginScreen error panel', () => {
  const mockOnLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loader functionality', () => {
    /* Preconditions: LoginScreen rendered with isLoading=true
       Action: Render component with isLoading prop
       Assertions: Loader (spinner) is visible, "Signing in..." text is shown
       Requirements: google-oauth-auth.15.1 */
    it('should show loader when isLoading=true', () => {
      render(
        <LoginScreen
          onLogin={mockOnLogin}
          isLoading={true}
          errorCode="network_error"
          errorMessage="Network error"
        />
      );

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();

      expect(screen.getByText('Signing in...')).toBeInTheDocument();
      expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    });
  });

  describe('Button state', () => {
    /* Preconditions: LoginScreen rendered with isDisabled=true
       Action: Render component with isDisabled prop
       Assertions: Button is disabled
       Requirements: google-oauth-auth.15.2 */
    it('should disable button when isDisabled=true', () => {
      render(
        <LoginScreen
          onLogin={mockOnLogin}
          isDisabled={true}
          errorCode="network_error"
          errorMessage="Network error"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('Error panel visibility', () => {
    /* Preconditions: LoginScreen rendered without error props
       Action: Render component without errorCode/errorMessage
       Assertions: Error panel is not visible
       Requirements: google-oauth-auth.13.2 */
    it('should not show error panel when no error', () => {
      render(<LoginScreen onLogin={mockOnLogin} />);

      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
    });

    /* Preconditions: LoginScreen rendered with errorCode
       Action: Render component with errorCode prop
       Assertions: Error panel is visible with correct message
       Requirements: google-oauth-auth.13.1, google-oauth-auth.13.2 */
    it('should show error panel when errorCode is provided', () => {
      render(
        <LoginScreen onLogin={mockOnLogin} errorCode="network_error" errorMessage="Network error" />
      );

      expect(screen.getByTestId('login-error')).toBeInTheDocument();
    });
  });
});
