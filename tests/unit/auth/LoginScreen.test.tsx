/**
 * Unit tests for LoginScreen component
 * Tests loader functionality and button states
 * @jest-environment jsdom
 */

/* Preconditions: LoginScreen component with isLoading and isDisabled props
   Action: Test loader display, button states, and element visibility
   Assertions: Loader shows correctly, button disables properly, all elements remain visible
   Requirements: google-oauth-auth.6.1, google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.7 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoginScreen } from '../../../src/renderer/components/auth/LoginScreen';

describe('LoginScreen', () => {
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
      render(<LoginScreen onLogin={mockOnLogin} isLoading={true} />);

      // Check for spinner (Loader2 icon with animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();

      // Check for "Signing in..." text
      expect(screen.getByText('Signing in...')).toBeInTheDocument();

      // Check that "Continue with Google" text is NOT shown
      expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    });

    /* Preconditions: LoginScreen rendered with isLoading=false
       Action: Render component without isLoading prop
       Assertions: Loader is not visible, "Continue with Google" text is shown
       Requirements: google-oauth-auth.15.1 */
    it('should not show loader when isLoading=false', () => {
      render(<LoginScreen onLogin={mockOnLogin} isLoading={false} />);

      // Check that spinner is NOT present
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();

      // Check that "Signing in..." text is NOT shown
      expect(screen.queryByText('Signing in...')).not.toBeInTheDocument();

      // Check that "Continue with Google" text IS shown
      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    });

    /* Preconditions: LoginScreen rendered without isLoading prop (default)
       Action: Render component with only onLogin prop
       Assertions: Loader is not visible by default
       Requirements: google-oauth-auth.15.1 */
    it('should not show loader by default', () => {
      render(<LoginScreen onLogin={mockOnLogin} />);

      // Check that spinner is NOT present
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();

      // Check that "Continue with Google" text IS shown
      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    });
  });

  describe('Button state', () => {
    /* Preconditions: LoginScreen rendered with isDisabled=true
       Action: Render component with isDisabled prop
       Assertions: Button is disabled
       Requirements: google-oauth-auth.15.2 */
    it('should disable button when isDisabled=true', () => {
      render(<LoginScreen onLogin={mockOnLogin} isDisabled={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    /* Preconditions: LoginScreen rendered with isLoading=true
       Action: Render component with isLoading prop
       Assertions: Button is disabled during loading
       Requirements: google-oauth-auth.15.3 */
    it('should disable button when isLoading=true', () => {
      render(<LoginScreen onLogin={mockOnLogin} isLoading={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    /* Preconditions: LoginScreen rendered with both isDisabled=true and isLoading=true
       Action: Render component with both props
       Assertions: Button is disabled
       Requirements: google-oauth-auth.15.2, google-oauth-auth.15.3 */
    it('should disable button when both isDisabled and isLoading are true', () => {
      render(<LoginScreen onLogin={mockOnLogin} isDisabled={true} isLoading={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    /* Preconditions: LoginScreen rendered without isDisabled or isLoading props
       Action: Render component with only onLogin prop
       Assertions: Button is enabled
       Requirements: google-oauth-auth.15.2, google-oauth-auth.15.3 */
    it('should enable button when isDisabled=false and isLoading=false', () => {
      render(<LoginScreen onLogin={mockOnLogin} isDisabled={false} isLoading={false} />);

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });

    /* Preconditions: LoginScreen rendered without props (defaults)
       Action: Render component with only onLogin prop
       Assertions: Button is enabled by default
       Requirements: google-oauth-auth.15.2, google-oauth-auth.15.3 */
    it('should enable button by default', () => {
      render(<LoginScreen onLogin={mockOnLogin} />);

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Element visibility during loader', () => {
    /* Preconditions: LoginScreen rendered with isLoading=true
       Action: Render component with isLoading prop
       Assertions: All Login Screen elements remain visible (logo, header, card, features, terms)
       Requirements: google-oauth-auth.15.7 */
    it('should keep all elements visible during loader', () => {
      render(<LoginScreen onLogin={mockOnLogin} isLoading={true} />);

      // Check brand block includes logo and title
      const brandBlock = screen.getByTestId('login-brand');
      const logo = brandBlock.querySelector('svg');
      expect(logo).toBeInTheDocument();
      expect(screen.getByText('Clerkly')).toBeInTheDocument();

      // Check "Welcome" card header is visible
      expect(screen.getByText('Welcome')).toBeInTheDocument();

      // Check description is visible
      expect(
        screen.getByText('Your autonomous AI agent that listens, organizes, and acts')
      ).toBeInTheDocument();

      // Check button is visible (even if disabled)
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toBeVisible();

      // Check Terms of Service text is visible
      expect(
        screen.getByText(
          /By continuing, you agree to Clerkly's Terms of Service and Privacy Policy/
        )
      ).toBeInTheDocument();

      // Check Features preview is visible
      expect(screen.getByText('Listen & Transcribe')).toBeInTheDocument();
      expect(screen.getByText('Extract Tasks')).toBeInTheDocument();
      expect(screen.getByText('Automate Actions')).toBeInTheDocument();
      expect(screen.getByText('Auto-Sync')).toBeInTheDocument();
    });

    /* Preconditions: LoginScreen rendered with isLoading=false
       Action: Render component without isLoading prop
       Assertions: All elements are visible when not loading
       Requirements: google-oauth-auth.15.7 */
    it('should keep all elements visible when not loading', () => {
      render(<LoginScreen onLogin={mockOnLogin} isLoading={false} />);

      // Check all major elements are visible
      const brandBlock = screen.getByTestId('login-brand');
      const logo = brandBlock.querySelector('svg');
      expect(logo).toBeInTheDocument();
      expect(screen.getByText('Clerkly')).toBeInTheDocument();
      expect(screen.getByText('Welcome')).toBeInTheDocument();
      expect(screen.getByText('Continue with Google')).toBeInTheDocument();
      expect(screen.getByText('Listen & Transcribe')).toBeInTheDocument();
      expect(screen.getByText('Extract Tasks')).toBeInTheDocument();
      expect(screen.getByText('Automate Actions')).toBeInTheDocument();
      expect(screen.getByText('Auto-Sync')).toBeInTheDocument();
    });
  });

  describe('Integration scenarios', () => {
    /* Preconditions: LoginScreen rendered with isLoading=true and isDisabled=true
       Action: Render component with both props
       Assertions: Loader shows, button is disabled, all elements visible
       Requirements: google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.7 */
    it('should handle loading and disabled state together', () => {
      render(<LoginScreen onLogin={mockOnLogin} isLoading={true} isDisabled={true} />);

      // Check loader is visible
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(screen.getByText('Signing in...')).toBeInTheDocument();

      // Check button is disabled
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();

      // Check all elements are visible
      expect(screen.getByText('Clerkly')).toBeInTheDocument();
      expect(screen.getByText('Welcome')).toBeInTheDocument();
      expect(screen.getByText('Listen & Transcribe')).toBeInTheDocument();
    });
  });
});
