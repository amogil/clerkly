/**
 * @jest-environment jsdom
 */

/* Preconditions: Settings component is rendered with mocked window.api
   Action: Test AI Agent Settings section rendering and functionality
   Assertions: Verify UI elements, loading, saving, and error handling
   Requirements: ui.10.1, ui.10.2, ui.10.3, ui.10.4, ui.10.5, ui.10.7, ui.10.8, ui.10.9, ui.10.10, ui.10.11, ui.10.12, ui.10.13, ui.10.15 */

// Mock window.api BEFORE any imports
const mockGetProfile = jest.fn();
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Settings } from '../../../src/renderer/components/settings';

describe('Settings Component - AI Agent Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mocks
    mockGetProfile.mockResolvedValue({
      success: true,
      profile: { name: 'Test User', email: 'test@example.com' },
    });
    mockOnProfileUpdated.mockImplementation(() => {});
    mockLoadLLMProvider.mockResolvedValue({
      success: true,
      provider: 'openai',
    });
    mockLoadAPIKey.mockResolvedValue({
      success: true,
      apiKey: '',
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /* Preconditions: Settings component is rendered
     Action: Check for AI Agent Settings section elements
     Assertions: LLM Provider dropdown, API Key field, toggle button, and info text are present
     Requirements: ui.10.1, ui.10.2, ui.10.3 */
  test('51.1: should display AI Agent Settings section', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Check for section heading
    expect(screen.getByText('AI Agent Settings')).toBeInTheDocument();

    // Check for LLM Provider dropdown
    expect(screen.getByText('LLM Provider')).toBeInTheDocument();
    const providerSelects = screen.getAllByRole('combobox');
    expect(providerSelects.length).toBeGreaterThan(0);

    // Check for API Key field
    expect(screen.getByText('API Key')).toBeInTheDocument();
    const apiKeyInput = screen.getByPlaceholderText('Enter your API key');
    expect(apiKeyInput).toBeInTheDocument();

    // Check for toggle visibility button (find by SVG)
    const toggleButtons = screen.getAllByRole('button');
    const hasToggleButton = toggleButtons.some((btn) => btn.querySelector('svg'));
    expect(hasToggleButton).toBe(true);

    // Check for informational text
    expect(screen.getByText(/Your API key is stored securely/i)).toBeInTheDocument();
  });

  /* Preconditions: Settings component is mounted
     Action: Component loads settings from API
     Assertions: loadLLMProvider and loadAPIKey are called
     Requirements: ui.10.15 */
  test('51.2: should load settings on mount', async () => {
    mockLoadLLMProvider.mockResolvedValue({
      success: true,
      provider: 'anthropic',
    });
    mockLoadAPIKey.mockResolvedValue({
      success: true,
      apiKey: 'test-key-123',
    });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('anthropic');
    });
  });

  /* Preconditions: Settings component is rendered with openai provider
     Action: Change LLM Provider to anthropic
     Assertions: saveLLMProvider called immediately, loadAPIKey called for new provider
     Requirements: ui.10.10, ui.10.19 */
  test('51.3: should save provider immediately when changed', async () => {
    mockSaveLLMProvider.mockResolvedValue({ success: true });
    mockLoadAPIKey.mockResolvedValue({ success: true, apiKey: '' });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const providerSelects = screen.getAllByRole('combobox');
    const providerSelect = providerSelects.find((select) => {
      const parent = select.closest('div');
      return parent?.textContent?.includes('LLM Provider');
    });

    expect(providerSelect).toBeDefined();
    if (providerSelect) {
      fireEvent.change(providerSelect, { target: { value: 'anthropic' } });
    }

    // Should save immediately (no debounce)
    await waitFor(() => {
      expect(mockSaveLLMProvider).toHaveBeenCalledWith('anthropic');
    });

    // Should load API key for new provider
    await waitFor(() => {
      expect(mockLoadAPIKey).toHaveBeenCalledWith('anthropic');
    });
  });

  /* Preconditions: Settings component is rendered
     Action: Change API Key multiple times quickly
     Assertions: saveAPIKey called once after 500ms with last value
     Requirements: ui.10.9, ui.10.12 */
  test('51.4: should save API key with debounce', async () => {
    mockSaveAPIKey.mockResolvedValue({ success: true });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const apiKeyInput = screen.getByPlaceholderText('Enter your API key');

    // Change API key multiple times quickly
    fireEvent.change(apiKeyInput, { target: { value: 'key1' } });
    fireEvent.change(apiKeyInput, { target: { value: 'key2' } });
    fireEvent.change(apiKeyInput, { target: { value: 'key3' } });

    // Should NOT be called immediately
    expect(mockSaveAPIKey).not.toHaveBeenCalled();

    // Advance timers by 500ms
    jest.advanceTimersByTime(500);

    // Should be called once with the last value
    await waitFor(() => {
      expect(mockSaveAPIKey).toHaveBeenCalledTimes(1);
      expect(mockSaveAPIKey).toHaveBeenCalledWith('openai', 'key3');
    });
  });

  /* Preconditions: Settings component is rendered with API key filled
     Action: Clear API Key field (empty string)
     Assertions: deleteAPIKey called after 500ms
     Requirements: ui.10.11 */
  test('51.5: should delete API key when field is cleared', async () => {
    mockLoadAPIKey.mockResolvedValue({
      success: true,
      apiKey: 'existing-key',
    });
    mockDeleteAPIKey.mockResolvedValue({ success: true });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const apiKeyInput = screen.getByPlaceholderText('Enter your API key');

    // Clear the field
    fireEvent.change(apiKeyInput, { target: { value: '' } });

    // Advance timers by 500ms
    jest.advanceTimersByTime(500);

    // Should call deleteAPIKey
    await waitFor(() => {
      expect(mockDeleteAPIKey).toHaveBeenCalledWith('openai');
    });
  });

  /* Preconditions: Settings component is rendered
     Action: Click toggle visibility button
     Assertions: Input type changes between password and text, icon changes
     Requirements: ui.10.3, ui.10.4, ui.10.5 */
  test('51.6: should toggle API key visibility', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const apiKeyInput = screen.getByPlaceholderText('Enter your API key') as HTMLInputElement;

    // Initially should be password type
    expect(apiKeyInput.type).toBe('password');

    // Find the toggle button - it's the button with type="button" near the API key input
    const allButtons = screen.getAllByRole('button');
    // The toggle button should be a button with type="button" (not submit)
    const toggleButton = allButtons.find(
      (btn) => btn.getAttribute('type') === 'button' && btn.querySelector('svg')
    );

    expect(toggleButton).toBeDefined();

    // Click toggle button
    if (toggleButton) {
      fireEvent.click(toggleButton);
    }

    // Should change to text type
    await waitFor(() => {
      expect(apiKeyInput.type).toBe('text');
    });

    // Click again
    if (toggleButton) {
      fireEvent.click(toggleButton);
    }

    // Should change back to password
    await waitFor(() => {
      expect(apiKeyInput.type).toBe('password');
    });
  });

  /* Preconditions: Settings component is rendered
     Action: Click toggle visibility button
     Assertions: saveAPIKey is NOT called
     Requirements: ui.10.7 */
  test('51.7: should not trigger save when toggling visibility', async () => {
    mockSaveAPIKey.mockResolvedValue({ success: true });

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const toggleButtons = screen.getAllByRole('button');
    const toggleButton = toggleButtons.find((btn) => btn.querySelector('svg'));

    // Click toggle button
    if (toggleButton) {
      fireEvent.click(toggleButton);
    }

    // Advance timers
    jest.advanceTimersByTime(500);

    // saveAPIKey should NOT be called
    expect(mockSaveAPIKey).not.toHaveBeenCalled();
  });

  /* Preconditions: Settings component is rendered and visibility toggled
     Action: Unmount and remount component
     Assertions: Visibility state resets to hidden (password type)
     Requirements: ui.10.8 */
  test('51.8: should not persist visibility state between sessions', async () => {
    const { unmount } = render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const allButtons = screen.getAllByRole('button');
    const toggleButton = allButtons.find(
      (btn) => btn.getAttribute('type') === 'button' && btn.querySelector('svg')
    );

    // Toggle to visible
    if (toggleButton) {
      fireEvent.click(toggleButton);
    }

    const apiKeyInput1 = screen.getByPlaceholderText('Enter your API key') as HTMLInputElement;
    await waitFor(() => {
      expect(apiKeyInput1.type).toBe('text');
    });

    // Unmount
    unmount();

    // Remount
    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    // Should be back to password type
    const apiKeyInput2 = screen.getByPlaceholderText('Enter your API key') as HTMLInputElement;
    expect(apiKeyInput2.type).toBe('password');
  });

  /* Preconditions: Settings component is rendered, saveAPIKey throws error
     Action: Change API Key
     Assertions: Error is logged (no notification manager in this test)
     Requirements: ui.10.13 */
  test('51.9: should handle save errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSaveAPIKey.mockRejectedValue(new Error('Save failed'));

    render(<Settings />);

    await waitFor(() => {
      expect(mockLoadLLMProvider).toHaveBeenCalled();
    });

    const apiKeyInput = screen.getByPlaceholderText('Enter your API key');
    fireEvent.change(apiKeyInput, { target: { value: 'test-key' } });

    // Advance timers
    jest.advanceTimersByTime(500);

    // Error should be logged with new Logger format: [timestamp] [ERROR] [Settings] message
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] [Settings] Failed to save/delete API key:')
      );
    });

    consoleErrorSpy.mockRestore();
  });
});
