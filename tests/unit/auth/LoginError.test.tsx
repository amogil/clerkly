// Requirements: google-oauth-auth.13.1, google-oauth-auth.13.2, google-oauth-auth.13.3, google-oauth-auth.13.4, google-oauth-auth.13.5, google-oauth-auth.13.6

import React from 'react';
import { LoginError } from '../../../src/renderer/components/auth/LoginError';

// Mock Logo component
jest.mock('../../../src/renderer/components/logo', () => ({
  Logo: ({ size, showText }: { size: string; showText: boolean }) => (
    <div data-testid="logo" data-size={size} data-show-text={showText}>
      Logo
    </div>
  ),
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-circle">AlertCircle</div>,
}));

describe('LoginError Component', () => {
  /* Preconditions: LoginError component is imported with mocked dependencies
     Action: render LoginError component with error props
     Assertions: component renders with all LoginScreen elements plus error block
     Requirements: google-oauth-auth.13.1, google-oauth-auth.13.2 */
  it('should render all LoginScreen elements plus error block', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorMessage: 'Test error',
      errorCode: 'test_error',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    // Check for LoginScreen elements
    expect(componentString).toContain('Clerkly');
    expect(componentString).toContain('Welcome');
    expect(componentString).toContain('Continue with Google');

    // Check for error styling
    expect(componentString).toContain('bg-red-50');
    expect(componentString).toContain('border-red-200');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="popup_closed_by_user"
     Assertions: displays correct error title, message, and suggestion
     Requirements: google-oauth-auth.13.3 */
  it('should display correct error for popup_closed_by_user', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'popup_closed_by_user',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain(
      'You closed the sign-in window before completing authentication.'
    );
    expect(componentString).toContain('Please try again and complete the sign-in process.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="access_denied"
     Assertions: displays correct error title, message, and suggestion
     Requirements: google-oauth-auth.13.4 */
  it('should display correct error for access_denied', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'access_denied',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('You denied access to your Google account.');
    expect(componentString).toContain(
      'Clerkly needs access to your Google account to function properly.'
    );
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="network_error"
     Assertions: displays correct error title, message, and suggestion
     Requirements: google-oauth-auth.13.5 */
  it('should display correct error for network_error', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'network_error',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Unable to connect to Google authentication servers.');
    expect(componentString).toContain('Please check your internet connection and try again.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="invalid_grant"
     Assertions: displays session expired error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for invalid_grant', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'invalid_grant',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Your authentication session has expired.');
    expect(componentString).toContain('Please sign in again to continue.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="invalid_request"
     Assertions: displays invalid request error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for invalid_request', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'invalid_request',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('The authentication request was malformed.');
    expect(componentString).toContain(
      'Please try again or contact support if the problem persists.'
    );
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="server_error"
     Assertions: displays server error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for server_error', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'server_error',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Google authentication servers are experiencing issues.');
    expect(componentString).toContain('Please try again in a few moments.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="temporarily_unavailable"
     Assertions: displays service unavailable error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for temporarily_unavailable', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'temporarily_unavailable',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Google authentication service is temporarily unavailable.');
    expect(componentString).toContain('Please try again in a few moments.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="csrf_attack_detected"
     Assertions: displays security error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for csrf_attack_detected', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'csrf_attack_detected',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('The authentication request failed security validation.');
    expect(componentString).toContain('Please try signing in again.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with errorCode="database_error"
     Assertions: displays storage error message
     Requirements: google-oauth-auth.9.6 */
  it('should display correct error for database_error', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorCode: 'database_error',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Unable to save authentication data.');
    expect(componentString).toContain('Please check application permissions and try again.');
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError with unknown errorCode and custom errorMessage
     Assertions: displays default error title with custom message
     Requirements: google-oauth-auth.13.6 */
  it('should display default error for unknown error code', () => {
    const mockOnRetry = jest.fn();
    const customMessage = 'Custom error message';
    const component = LoginError({
      errorMessage: customMessage,
      errorCode: 'unknown_error',
      onRetry: mockOnRetry,
    });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain(customMessage);
    expect(componentString).toContain(
      'Please try signing in again or contact support if the problem persists.'
    );
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError and find retry button, then simulate click
     Assertions: onRetry callback is called when button is clicked
     Requirements: google-oauth-auth.13.7 */
  it('should call onRetry when button is clicked', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorMessage: 'Test error',
      onRetry: mockOnRetry,
    });

    // Find button in component tree
    const findButton = (node: any): any => {
      if (!node) return null;
      if (node.type === 'button') return node;
      if (node.props?.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children
          : [node.props.children];
        for (const child of children) {
          const found = findButton(child);
          if (found) return found;
        }
      }
      return null;
    };

    const button = findButton(component);
    expect(button).toBeDefined();
    expect(button.props.onClick).toBe(mockOnRetry);

    // Simulate click
    button.props.onClick();
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: LoginError component is imported
     Action: render LoginError and inspect error block styling
     Assertions: error block has red background and border with AlertCircle icon
     Requirements: google-oauth-auth.13.2 */
  it('should display error block with correct styling', () => {
    const mockOnRetry = jest.fn();
    const component = LoginError({
      errorMessage: 'Test error',
      onRetry: mockOnRetry,
    });

    // Find error div in component tree
    const findErrorDiv = (node: any): any => {
      if (!node) return null;
      if (
        node.type === 'div' &&
        node.props?.className?.includes('bg-red-50') &&
        node.props?.className?.includes('border-red-200')
      ) {
        return node;
      }
      if (node.props?.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children
          : [node.props.children];
        for (const child of children) {
          const found = findErrorDiv(child);
          if (found) return found;
        }
      }
      return null;
    };

    const errorDiv = findErrorDiv(component);
    expect(errorDiv).toBeDefined();
    expect(errorDiv.props.className).toContain('bg-red-50');
    expect(errorDiv.props.className).toContain('border-red-200');
    expect(errorDiv.props.className).toContain('rounded-lg');
  });
});
