/**
 * @jest-environment jsdom
 */

// Requirements: settings.3.1, settings.3.2, settings.3.3, settings.3.4, settings.3.7, settings.3.8

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Settings } from '../../../src/renderer/components/settings';

// Mock window.api
const mockTestConnection = jest.fn();
const mockLoadLLMProvider = jest.fn();
const mockLoadAPIKey = jest.fn();
const mockSaveLLMProvider = jest.fn();
const mockSaveAPIKey = jest.fn();
const mockDeleteAPIKey = jest.fn();
const mockGetProfile = jest.fn();
const mockOnProfileUpdated = jest.fn();

(global as any).window = Object.create(window);
(global as any).window.api = {
  llm: {
    testConnection: mockTestConnection,
  },
  settings: {
    loadLLMProvider: mockLoadLLMProvider,
    loadAPIKey: mockLoadAPIKey,
    saveLLMProvider: mockSaveLLMProvider,
    saveAPIKey: mockSaveAPIKey,
    deleteAPIKey: mockDeleteAPIKey,
  },
  auth: {
    getProfile: mockGetProfile,
    onProfileUpdated: mockOnProfileUpdated,
  },
};

// Mock error context
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();

jest.mock('../../../src/renderer/contexts/error-context', () => ({
  useError: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
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

describe('Settings Component - Test Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mocks
    mockLoadLLMProvider.mockResolvedValue({ success: true, provider: 'openai' });
    mockLoadAPIKey.mockResolvedValue({ success: true, apiKey: '' });
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: { name: 'Test User', email: 'test@example.com' },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /* Preconditions: Settings component rendered with empty API key
     Action: Check Test Connection button state
     Assertions: Button is disabled when API key is empty
     Requirements: settings.3.1, settings.3.2 */
  it('should disable Test Connection button when API key is empty', async () => {
    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Find Test Connection button
    const testButton = screen.getByText('Test Connection');
    expect(testButton).toBeDisabled();
  });

  /* Preconditions: Settings component rendered with filled API key
     Action: Enter API key and check button state
     Assertions: Button is enabled when API key is filled
     Requirements: settings.3.1, settings.3.2 */
  it('should enable Test Connection button when API key is filled', async () => {
    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Find API key input and enter value
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Find Test Connection button
    const testButton = screen.getByText('Test Connection');
    expect(testButton).not.toBeDisabled();
  });

  /* Preconditions: Settings component rendered with API key
     Action: Click Test Connection button
     Assertions: Shows "Testing..." during connection test
     Requirements: settings.3.3, settings.3.4 */
  it('should show "Testing..." during connection test', async () => {
    // Mock slow connection test
    mockTestConnection.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
    );

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Check button shows "Testing..."
    await waitFor(() => {
      expect(screen.getByText('Testing...')).toBeInTheDocument();
    });

    // Button should be disabled during testing
    expect(screen.getByText('Testing...')).toBeDisabled();

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    // Wait for test to complete
    await waitFor(() => {
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Click Test Connection button
     Assertions: Calls window.api.llm.testConnection with correct params
     Requirements: settings.3.4 */
  it('should call window.api.llm.testConnection with correct params', async () => {
    mockTestConnection.mockResolvedValue({ success: true });

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Verify testConnection was called with correct params
    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith('openai', 'sk-test1234567890');
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Test connection succeeds
     Assertions: Shows success notification
     Requirements: settings.3.7 */
  it('should show success notification on successful connection', async () => {
    mockTestConnection.mockResolvedValue({ success: true });

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Verify success notification was shown
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Connection successful! Your API key is valid.');
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Test connection fails
     Assertions: Shows error notification
     Requirements: settings.3.8 */
  it('should show error notification on failed connection', async () => {
    mockTestConnection.mockResolvedValue({
      success: false,
      error: 'Invalid API key. Please check your key and try again.',
    });

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'invalid-key' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Verify error notification was shown
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Invalid API key. Please check your key and try again.'
      );
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Test connection throws exception
     Assertions: Shows error notification with exception message
     Requirements: settings.3.8 */
  it('should show error notification on connection exception', async () => {
    mockTestConnection.mockRejectedValue(new Error('Network error'));

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Verify error notification was shown
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Connection failed: Network error');
    });
  });

  /* Preconditions: Settings component rendered with different providers
     Action: Test connection with OpenAI provider
     Assertions: Calls testConnection with correct provider
     Requirements: settings.3.4 */
  it('should test connection for OpenAI provider', async () => {
    mockTestConnection.mockResolvedValue({ success: true });

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Test OpenAI
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-openai-key' } });

    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith('openai', 'sk-openai-key');
    });
  });

  /* Preconditions: Settings component rendered, connection test in progress
     Action: Button is disabled during testing
     Assertions: Button remains disabled until test completes
     Requirements: settings.3.3 */
  it('should disable button during connection test', async () => {
    // Mock slow connection test
    mockTestConnection.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
    );

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Click Test Connection button
    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    // Button should be disabled during testing
    await waitFor(() => {
      expect(screen.getByText('Testing...')).toBeDisabled();
    });

    // Try clicking again (should not trigger another test)
    const testingButton = screen.getByText('Testing...');
    fireEvent.click(testingButton);

    // Should still only have one call
    expect(mockTestConnection).toHaveBeenCalledTimes(1);

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    // Wait for test to complete
    await waitFor(() => {
      const finalButton = screen.getByText('Test Connection');
      expect(finalButton).not.toBeDisabled();
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Clear API key after successful test
     Assertions: Button becomes disabled again
     Requirements: settings.3.2 */
  it('should disable button when API key is cleared', async () => {
    mockTestConnection.mockResolvedValue({ success: true });

    render(<Settings />);

    // Wait for component to load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Button should be enabled
    let testButton = screen.getByText('Test Connection');
    expect(testButton).not.toBeDisabled();

    // Clear API key
    fireEvent.change(apiKeyInput, { target: { value: '' } });

    // Button should be disabled
    testButton = screen.getByText('Test Connection');
    expect(testButton).toBeDisabled();
  });
});
