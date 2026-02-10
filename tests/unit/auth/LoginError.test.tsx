/**
 * Unit tests for LoginError component
 * Tests loader functionality and button states
 * @jest-environment jsdom
 */

/* Preconditions: LoginError component with isLoading and isDisabled props
   Action: Test loader display and button states during error retry
   Assertions: Loader shows correctly, button disables properly
   Requirements: google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.15.1, google-oauth-auth.15.2 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoginError } from '../../../src/renderer/components/auth/LoginError';

describe('LoginError', () => {
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loader functionality', () => {
    /* Preconditions: LoginError rendered with isLoading=true
       Action: Render component with isLoading prop
       Assertions: Loader (spinner) is visible, "Signing in..." text is shown
       Requirements: google-oauth-auth.15.1 */
    it('should show loader when isLoading=true', () => {
      render(
        <LoginError
          errorCode="network_error"
          errorMessage="Network error"
          onRetry={mockOnRetry}
          isLoading={true}
        />
      );

      // Check for spinner (Loader2 icon with animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();

      // Check for "Signing in..." text
      expect(screen.getByText('Signing in...')).toBeInTheDocument();

      // Check that "Continue with Google" text is NOT shown
      expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    });
  });

  describe('Button state', () => {
    /* Preconditions: LoginError rendered with isDisabled=true
       Action: Render component with isDisabled prop
       Assertions: Button is disabled
       Requirements: google-oauth-auth.15.2 */
    it('should disable button when isDisabled=true', () => {
      render(
        <LoginError
          errorCode="network_error"
          errorMessage="Network error"
          onRetry={mockOnRetry}
          isDisabled={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });
});
