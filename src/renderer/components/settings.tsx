import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Eye, EyeOff, User, LogOut, AlertCircle } from 'lucide-react';
import { Logger } from '../Logger';
import { useError } from '../contexts/error-context';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('Settings');

interface SettingsProps {
  onSignOut?: () => void;
  onNavigate?: (screen: string) => void;
}

export function Settings({ onSignOut, onNavigate }: SettingsProps) {
  const { showError, showSuccess } = useError();
  const [llmProvider, setLlmProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    loading: boolean;
  }>({
    name: '',
    email: '',
    loading: true,
  });

  // Track if this is the first render to avoid saving on initial mount
  const isFirstRender = useRef(true);

  // Load profile data on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const result = await window.api.auth.getProfile();
        if (result.success && result.profile) {
          setProfile({
            name: result.profile.name || '',
            email: result.profile.email || '',
            loading: false,
          });
        } else {
          setProfile({
            name: '',
            email: '',
            loading: false,
          });
        }
      } catch (error) {
        logger.error(`Failed to load profile: ${error}`);
        setProfile({
          name: '',
          email: '',
          loading: false,
        });
      }
    };

    loadProfile();

    // Listen for profile updates
    const handleProfileUpdate = () => {
      logger.info('Profile updated, reloading...');
      loadProfile();
    };

    window.api.auth.onProfileUpdated(handleProfileUpdate);

    // Cleanup
    return () => {
      // Note: There's no removeListener for onProfileUpdated in the current API
      // If needed, this should be added to the preload API
    };
  }, []);

  // Requirements: settings.1.20, settings.1.21 - Load AI Agent settings on mount
  useEffect(() => {
    const loadAIAgentSettings = async () => {
      try {
        // Load LLM provider
        const providerResult = await window.api.settings.loadLLMProvider();
        if (providerResult.success && providerResult.provider) {
          setLlmProvider(providerResult.provider);

          // Load API key for the loaded provider
          const keyResult = await window.api.settings.loadAPIKey(providerResult.provider);
          if (keyResult.success && keyResult.apiKey) {
            setApiKey(keyResult.apiKey);
          } else {
            setApiKey('');
          }
        } else {
          // Default values: openai provider, empty API key
          setLlmProvider('openai');
          setApiKey('');
        }
      } catch (error) {
        logger.error(`Failed to load AI Agent settings: ${error}`);
        // Use default values on error
        setLlmProvider('openai');
        setApiKey('');
      }
    };

    loadAIAgentSettings();
  }, []);

  // Requirements: settings.1.10, settings.1.19 - Save provider immediately and load API key for new provider
  useEffect(() => {
    // Skip on initial mount (initial load is handled by the load effect above)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const saveProviderAndLoadKey = async () => {
      try {
        // Save provider immediately (no debounce)
        const saveResult = await window.api.settings.saveLLMProvider(llmProvider);
        if (!saveResult.success) {
          logger.error(`Failed to save LLM provider: ${saveResult.error}`);
          // Requirements: settings.1.13 - Show error notification on save failure
          // Note: Error notification will be handled by task 48.8
        }

        // Load API key for the new provider
        const keyResult = await window.api.settings.loadAPIKey(llmProvider);
        if (keyResult.success && keyResult.apiKey) {
          setApiKey(keyResult.apiKey);
        } else {
          // If key not found, show empty field with placeholder
          setApiKey('');
        }
      } catch (error) {
        logger.error(`Failed to save provider or load API key: ${error}`);
      }
    };

    saveProviderAndLoadKey();
  }, [llmProvider]);

  // Requirements: settings.1.9, settings.1.11, settings.1.12 - Debounced save for API key (500ms)
  useEffect(() => {
    // Debounce API key save
    const timeoutId = setTimeout(async () => {
      try {
        if (apiKey.trim() === '') {
          // Requirements: settings.1.11 - Delete API key when field is cleared
          const deleteResult = await window.api.settings.deleteAPIKey(llmProvider);
          if (!deleteResult.success) {
            logger.error(`Failed to delete API key: ${deleteResult.error}`);
            // Requirements: settings.1.13 - Show error notification on save failure
            // Note: Error notification will be handled by task 48.8
          }
        } else {
          // Save API key with debounce
          const saveResult = await window.api.settings.saveAPIKey(llmProvider, apiKey);
          if (!saveResult.success) {
            logger.error(`Failed to save API key: ${saveResult.error}`);
            // Requirements: settings.1.13 - Show error notification on save failure
            showError(`Failed to save API key: ${saveResult.error || 'Unknown error'}`);
          }
          // Requirements: settings.1.12 - No visual indicator for saving (silent save)
        }
      } catch (error) {
        logger.error(`Failed to save/delete API key: ${error}`);
      }
    }, 500);

    // Cleanup: cancel previous timeout
    return () => clearTimeout(timeoutId);
  }, [apiKey, llmProvider, showError]);

  // Requirements: settings.3.4 - Handle test connection
  const handleTestConnection = async () => {
    // Requirements: settings.3.4 - Set testing state
    setTestingConnection(true);
    try {
      logger.info(`Testing connection to ${llmProvider}...`);
      const result = await window.api.llm.testConnection(llmProvider, apiKey);

      if (result.success) {
        // Requirements: settings.3.7 - Show success notification
        showSuccess('Connection successful! Your API key is valid.');
        logger.info(`Connection test successful for ${llmProvider}`);
      } else {
        // Requirements: settings.3.8 - Show error notification
        showError(result.error || 'Connection failed: Unknown error');
        logger.warn(`Connection test failed for ${llmProvider}: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Connection test error: ${error}`);
      showError(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Requirements: settings.3.7, settings.3.8 - Reset button state
      setTestingConnection(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Account Settings */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Account</h2>
                </div>
                <button
                  onClick={() => {
                    logger.info('Logging out...');
                    if (onSignOut) {
                      onSignOut();
                    }
                  }}
                  className="sign-out-button flex items-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-name"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Full Name
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={profile.loading ? 'Loading...' : profile.name || 'Not available'}
                    readOnly
                    className="w-full px-4 py-2 bg-secondary/30 border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-email"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profile.loading ? 'Loading...' : profile.email || 'Not available'}
                    readOnly
                    className="w-full px-4 py-2 bg-secondary/30 border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Synced from Google Account</p>
            </div>
          </div>

          {/* LLM Provider */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">LLM Provider</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  LLM Provider
                </label>
                <select
                  value={llmProvider}
                  onChange={(e) =>
                    setLlmProvider(e.target.value as 'openai' | 'anthropic' | 'google')
                  }
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                >
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google">Google (Gemini)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">API Key</label>
                <div className="relative">
                  <input
                    id="ai-agent-api-key"
                    data-testid="ai-agent-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full px-4 py-2 pr-12 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded transition-colors"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <Eye className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Your API key is stored securely. It will only be used to communicate with your
                  selected LLM provider.
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection || apiKey.trim() === ''}
                  className="text-sm px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
          </div>

          {/* Save Button - REMOVED */}

          {/* Error Handling System */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Система обработки ошибок</h2>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-muted-foreground mb-4">
                Просмотрите демонстрацию комплексной системы обработки ошибок, включая
                toast-уведомления, inline-сообщения, состояния ошибок и error boundary.
              </p>
              <button
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('error-demo');
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <AlertCircle className="w-4 h-4" />
                Открыть демонстрацию ошибок
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
