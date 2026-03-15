/**
 * @jest-environment jsdom
 */

// Requirements: settings.2.1, settings.2.2, settings.2.3, settings.2.4, settings.2.7, settings.2.8, error-notifications.2.1

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock toast from sonner BEFORE importing Settings
const mockToast = {
  error: jest.fn(),
  success: jest.fn(),
};

jest.mock('sonner', () => ({
  toast: mockToast,
  Toaster: () => null,
}));

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

// Mock EventBus
jest.mock('../../../src/renderer/events/useEventSubscription', () => ({
  useEventSubscription: jest.fn(),
}));

// Import Settings AFTER mocks
import { Settings } from '../../../src/renderer/components/settings';

// Mock window.api
const mockTestConnection = jest.fn();
const mockLoadLLMProvider = jest.fn();
const mockLoadAPIKey = jest.fn();
const mockSaveLLMProvider = jest.fn();
const mockSaveAPIKey = jest.fn();
const mockDeleteAPIKey = jest.fn();
const mockGetUser = jest.fn();
const mockOnProfileUpdated = jest.fn();
const mockGetRuntimeInfo = jest.fn();

(global as any).window = Object.create(window);
(global as any).window.api = {
  app: {
    getRuntimeInfo: mockGetRuntimeInfo,
  },
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
    getUser: mockGetUser,
    onProfileUpdated: mockOnProfileUpdated,
  },
};

describe('Settings Component - Test Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mocks - use correct data structure for callApi
    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: false } });
    mockLoadLLMProvider.mockResolvedValue({ success: true, data: { provider: 'openai' } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: '' } });
    mockGetUser.mockResolvedValue({
      success: true,
      user: { name: 'Test User', email: 'test@example.com' },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /* Preconditions: Settings component rendered with empty API key
     Action: Check Test Connection button state
     Assertions: Button is disabled when API key is empty
     Requirements: settings.2.2 */
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
     Requirements: settings.2.3 */
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
     Requirements: settings.2.4 */
  it('should show "Testing..." during connection test', async () => {
    // Mock slow connection test - return data in correct format for callApi
    mockTestConnection.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, data: { success: true } }), 1000)
        )
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
     Requirements: settings.2.4 */
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
     Requirements: settings.2.7 */
  it('should show success notification on successful connection', async () => {
    mockTestConnection.mockResolvedValue({ success: true, data: { success: true } });

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
     Assertions: Shows toast error notification via callApi
     Requirements: settings.2.8, error-notifications.2.1 */
  it('should show toast error notification on failed connection', async () => {
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

    // Requirements: error-notifications.2.1 - Verify toast.error was called without context prefix
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'Invalid API key. Please check your key and try again.'
      );
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Test connection throws exception
     Assertions: Shows toast error notification via callApi
     Requirements: settings.2.8, error-notifications.2.1 */
  it('should show toast error notification on connection exception', async () => {
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

    // Requirements: error-notifications.2.1 - Verify toast.error was called without context prefix
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Network error');
    });
  });

  /* Preconditions: Settings component rendered with different providers
     Action: Test connection with OpenAI provider
     Assertions: Calls testConnection with correct provider
     Requirements: settings.2.4 */
  it('should test connection for OpenAI provider', async () => {
    mockTestConnection.mockResolvedValue({ success: true, data: { success: true } });

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
     Requirements: settings.2.2 */
  it('should disable button during connection test', async () => {
    // Mock slow connection test - return data in correct format for callApi
    mockTestConnection.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, data: { success: true } }), 1000)
        )
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

    // Fast-forward all timers
    jest.runAllTimers();

    // Wait for test to complete
    await waitFor(() => {
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });
  });

  /* Preconditions: Settings component rendered with API key
     Action: Clear API key after successful test
     Assertions: Button becomes disabled again
     Requirements: settings.2.3 */
  it('should disable button when API key is cleared', async () => {
    mockTestConnection.mockResolvedValue({ success: true, data: { success: true } });

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

  /* Preconditions: Settings screen rendered
     Action: Inspect LLM provider block content
     Assertions: API key security text and Test Connection action are visible
     Requirements: settings.1.25, settings.1.26 */
  it('should show API key security text and Test Connection button', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    expect(
      screen.getByText(
        'Your API key is stored securely. It will only be used to communicate with your selected LLM provider.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Test Connection')).toBeInTheDocument();
  });

  /* Preconditions: Settings component runs in packaged production mode
     Action: Render settings screen
     Assertions: Provider selector is disabled, fixed to OpenAI, and helper text is visible
     Requirements: settings.1.1.1, settings.1.1.2, settings.1.20.1 */
  it('should lock provider selector to OpenAI in packaged production mode', async () => {
    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: true } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: 'sk-openai-prod' } });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('openai');
    });

    expect(mockLoadLLMProvider).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('OpenAI (GPT)')).toBeDisabled();
    expect(
      screen.getByText('Currently only one provider is available: OpenAI.')
    ).toBeInTheDocument();
  });

  /* Preconditions: Settings component runs in packaged production mode
     Action: Enter API key and test connection
     Assertions: Production-only UI continues to use OpenAI for connection checks
     Requirements: settings.1.20.1, settings.2.4 */
  it('should use OpenAI for connection test in packaged production mode', async () => {
    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: true } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: '' } });
    mockTestConnection.mockResolvedValue({ success: true, data: { success: true } });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('openai');
    });

    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-prod-openai' } });

    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith('openai', 'sk-prod-openai');
    });
  });

  /* Preconditions: Runtime info lookup fails before settings load
     Action: Render settings screen
     Assertions: Provider selector stays locked to OpenAI and non-OpenAI settings are not loaded
     Requirements: settings.1.1.1, settings.1.1.2, settings.1.20.1 */
  it('should keep provider selector locked to OpenAI when runtime info lookup fails', async () => {
    mockGetRuntimeInfo.mockRejectedValue(new Error('IPC unavailable'));
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: 'sk-openai-fallback' } });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('openai');
    });

    expect(mockLoadLLMProvider).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('OpenAI (GPT)')).toBeDisabled();
    expect(
      screen.getByText('Currently only one provider is available: OpenAI.')
    ).toBeInTheDocument();
  });

  /* Preconditions: Settings component runs in packaged production mode and API key loading is delayed
     Action: Render settings screen and advance debounce timer before loadAPIKey resolves
     Assertions: Initial autosave does not delete the persisted OpenAI key before the initial load finishes
     Requirements: settings.1.9, settings.1.20.1 */
  it('should not delete OpenAI key before delayed packaged settings load completes', async () => {
    let resolveAPIKey: ((value: { success: boolean; data: { apiKey: string } }) => void) | null =
      null;

    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: true } });
    mockLoadAPIKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAPIKey = resolve;
        })
    );

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('openai');
    });

    jest.advanceTimersByTime(1000);
    expect(mockDeleteAPIKey).not.toHaveBeenCalled();

    expect(resolveAPIKey).not.toBeNull();
    resolveAPIKey!({ success: true, data: { apiKey: 'sk-openai-delayed' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('sk-openai-delayed')).toBeInTheDocument();
    });

    expect(mockDeleteAPIKey).not.toHaveBeenCalled();
  });

  /* Preconditions: Settings component runs in packaged production mode and initial API key loading is delayed
     Action: Render settings screen before load completes
     Assertions: API key input and Test Connection stay disabled until initial settings are loaded
     Requirements: settings.1.20.1, settings.1.20.3, settings.2.2 */
  it('should block API key editing and connection testing until packaged settings load completes', async () => {
    let resolveAPIKey: ((value: { success: boolean; data: { apiKey: string } }) => void) | null =
      null;

    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: true } });
    mockLoadAPIKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAPIKey = resolve;
        })
    );

    render(<Settings />);

    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    const testButton = screen.getByText('Test Connection');

    expect(apiKeyInput).toBeDisabled();
    expect(testButton).toBeDisabled();

    fireEvent.change(apiKeyInput, { target: { value: 'sk-early-input' } });
    jest.advanceTimersByTime(1000);

    expect(mockSaveAPIKey).not.toHaveBeenCalled();
    expect(mockDeleteAPIKey).not.toHaveBeenCalled();
    expect(mockTestConnection).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('openai');
    });

    expect(resolveAPIKey).not.toBeNull();
    resolveAPIKey!({ success: true, data: { apiKey: 'sk-openai-loaded' } });

    await waitFor(() => {
      expect(apiKeyInput).not.toBeDisabled();
    });

    expect(screen.getByDisplayValue('sk-openai-loaded')).toBeInTheDocument();
  });
});

describe('Settings Component - Error Handling with callApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mocks
    mockGetRuntimeInfo.mockResolvedValue({ success: true, data: { isPackaged: false } });
    mockGetUser.mockResolvedValue({
      success: true,
      user: { name: 'Test User', email: 'test@example.com' },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /* Preconditions: Settings component loading fails
     Action: loadLLMProvider returns error
     Assertions: Toast error is shown via callApi
     Requirements: error-notifications.2.1 */
  it('should show toast error when loadLLMProvider fails', async () => {
    mockLoadLLMProvider.mockResolvedValue({
      success: false,
      error: 'Failed to load provider',
    });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: '' } });

    render(<Settings />);

    // Requirements: error-notifications.2.1 - Verify toast.error was called
    // Note: callApi formats error as "context: error"
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Loading LLM provider: Failed to load provider');
    });
  });

  /* Preconditions: Settings component loading fails
     Action: loadAPIKey returns error
     Assertions: Toast error is shown via callApi
     Requirements: error-notifications.2.1 */
  it('should show toast error when loadAPIKey fails', async () => {
    // Mock loadLLMProvider to return data in correct format for callApi
    mockLoadLLMProvider.mockResolvedValue({ success: true, data: { provider: 'openai' } });
    mockLoadAPIKey.mockResolvedValue({
      success: false,
      error: 'Failed to load API key',
    });
    // Mock deleteAPIKey to avoid errors when apiKey becomes empty
    mockDeleteAPIKey.mockResolvedValue({ success: true });

    render(<Settings />);

    // Requirements: error-notifications.2.1 - Verify toast.error was called
    // Note: callApi formats error as "context: error"
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Loading API key: Failed to load API key');
    });
  });

  /* Preconditions: Settings component rendered
     Action: saveLLMProvider returns error
     Assertions: Toast error is shown via callApi
     Requirements: error-notifications.2.1, settings.1.13 */
  it('should show toast error when saveLLMProvider fails', async () => {
    mockLoadLLMProvider.mockResolvedValue({ success: true, data: { provider: 'openai' } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: '' } });
    mockSaveLLMProvider.mockResolvedValue({
      success: false,
      error: 'Failed to save provider',
    });

    render(<Settings />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Clear previous toast calls
    mockToast.error.mockClear();

    // Change provider
    const providerSelect = screen.getByDisplayValue('OpenAI (GPT)');
    fireEvent.change(providerSelect, { target: { value: 'anthropic' } });

    // Requirements: error-notifications.2.1 - Verify toast.error was called
    // Note: callApi formats error as "context: error"
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Saving LLM provider: Failed to save provider');
    });
  });

  /* Preconditions: Settings component rendered
     Action: saveAPIKey returns error
     Assertions: Toast error is shown via callApi
     Requirements: error-notifications.2.1, settings.1.13 */
  it('should show toast error when saveAPIKey fails', async () => {
    mockLoadLLMProvider.mockResolvedValue({ success: true, data: { provider: 'openai' } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: '' } });
    mockSaveAPIKey.mockResolvedValue({
      success: false,
      error: 'Failed to save API key',
    });

    render(<Settings />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Clear previous toast calls
    mockToast.error.mockClear();

    // Enter API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test1234567890' } });

    // Fast-forward debounce timer
    jest.advanceTimersByTime(500);

    // Requirements: error-notifications.2.1 - Verify toast.error was called
    // Note: callApi formats error as "context: error"
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Saving API key: Failed to save API key');
    });
  });

  /* Preconditions: Settings component rendered
     Action: deleteAPIKey returns error
     Assertions: Toast error is shown via callApi
     Requirements: error-notifications.2.1, settings.1.13 */
  it('should show toast error when deleteAPIKey fails', async () => {
    mockLoadLLMProvider.mockResolvedValue({ success: true, data: { provider: 'openai' } });
    mockLoadAPIKey.mockResolvedValue({ success: true, data: { apiKey: 'sk-existing' } });
    mockDeleteAPIKey.mockResolvedValue({
      success: false,
      error: 'Failed to delete API key',
    });

    render(<Settings />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Clear previous toast calls
    mockToast.error.mockClear();

    // Clear API key
    const apiKeyInput = screen.getByTestId('ai-agent-api-key');
    fireEvent.change(apiKeyInput, { target: { value: '' } });

    // Fast-forward debounce timer
    jest.advanceTimersByTime(500);

    // Requirements: error-notifications.2.1 - Verify toast.error was called
    // Note: callApi formats error as "context: error"
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Deleting API key: Failed to delete API key');
    });
  });
});
