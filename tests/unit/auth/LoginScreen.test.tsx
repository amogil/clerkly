// Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4

import React from 'react';
import { LoginScreen } from '../../../src/renderer/components/auth/LoginScreen';

// Mock Logo component
jest.mock('../../../src/renderer/components/logo', () => ({
  Logo: ({ size, showText }: { size: string; showText: boolean }) => (
    <div data-testid="logo" data-size={size} data-show-text={showText}>
      Logo
    </div>
  ),
}));

describe('LoginScreen Component', () => {
  /* Preconditions: LoginScreen component is imported and mocked dependencies are set up
     Action: render LoginScreen component with onLogin callback
     Assertions: component renders with all required elements
     Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2, google-oauth-auth.12.3, google-oauth-auth.12.4 */
  it('should render all required elements', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    // Verify component structure exists
    expect(component).toBeDefined();
    expect(component.type).toBe('div');
    expect(component.props.className).toContain('min-h-screen');
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and inspect its structure
     Assertions: Logo component is rendered with correct props (size="lg", showText=false)
     Requirements: google-oauth-auth.12.1 */
  it('should display Clerkly logo with correct props', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    // Find Logo component in the tree
    const findLogo = (node: any): any => {
      if (!node) return null;
      if (node.type?.name === 'Logo') return node;
      if (node.props?.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children
          : [node.props.children];
        for (const child of children) {
          const found = findLogo(child);
          if (found) return found;
        }
      }
      return null;
    };

    const logo = findLogo(component);
    expect(logo).toBeDefined();
    expect(logo.props.size).toBe('lg');
    expect(logo.props.showText).toBe(false);
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and inspect text content
     Assertions: displays "Clerkly" heading, "Welcome" title, and description text
     Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2 */
  it('should display correct headings and description', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    // Convert component to string to check text content
    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Clerkly');
    expect(componentString).toContain('Welcome');
    expect(componentString).toContain('Your autonomous AI agent that listens, organizes, and acts');
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and find the Google sign-in button
     Assertions: button displays "Continue with Google" text and has Google icon
     Requirements: google-oauth-auth.12.3 */
  it('should display Continue with Google button', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Continue with Google');
    // Check for Google icon SVG paths
    expect(componentString).toContain('#4285F4'); // Google blue
    expect(componentString).toContain('#34A853'); // Google green
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and inspect button onClick handler
     Assertions: button has onClick handler that calls onLogin prop
     Requirements: google-oauth-auth.12.3 */
  it('should call onLogin when button is clicked', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

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
    expect(button.props.onClick).toBe(mockOnLogin);

    // Simulate click
    button.props.onClick();
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and inspect features preview section
     Assertions: displays all 4 feature previews with correct text
     Requirements: google-oauth-auth.12.4 */
  it('should display features preview with all 4 features', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain('Listen & Transcribe');
    expect(componentString).toContain('Extract Tasks');
    expect(componentString).toContain('Automate Actions');
    expect(componentString).toContain('Auto-Sync');
  });

  /* Preconditions: LoginScreen component is imported
     Action: create LoginScreen component and inspect terms text
     Assertions: displays terms of service and privacy policy text
     Requirements: google-oauth-auth.12.5 */
  it('should display terms of service text', () => {
    const mockOnLogin = jest.fn();
    const component = LoginScreen({ onLogin: mockOnLogin });

    const componentString = JSON.stringify(component);

    expect(componentString).toContain(
      "By continuing, you agree to Clerkly's Terms of Service and Privacy Policy"
    );
  });
});
