import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Eye, EyeOff, User, LogOut } from 'lucide-react';
import { Logger } from '../Logger';
import { useError } from '../contexts/error-context';
import { useEventSubscription } from '../events/useEventSubscription';
import { EVENT_TYPES } from '../../shared/events/constants';
import { callApi } from '../utils/apiWrapper';
import { toast } from 'sonner';
import type { LLMProvider } from '../../types';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('Settings');

interface SettingsProps {
  onSignOut?: () => void;
  onNavigate?: (screen: string) => void;
}

export function Settings({ onSignOut, onNavigate: _onNavigate }: SettingsProps) {
  const { showSuccess } = useError();
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isProductionLLMProviderLocked, setIsProductionLLMProviderLocked] = useState(false);
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
  const apiKeyPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveLLMProvider: LLMProvider = isProductionLLMProviderLocked ? 'openai' : llmProvider;

  // Requirements: settings.1.9, settings.1.11, settings.1.12, error-notifications.2.1
  const scheduleAPIKeyPersist = useCallback((provider: LLMProvider, nextApiKey: string) => {
    if (apiKeyPersistTimeoutRef.current) {
      clearTimeout(apiKeyPersistTimeoutRef.current);
    }

    apiKeyPersistTimeoutRef.current = setTimeout(async () => {
      if (nextApiKey.trim() === '') {
        await callApi<Record<string, never>>(
          () =>
            window.api.settings.deleteAPIKey(provider).then((r) => ({
              ...r,
              data: r.success ? ({} as Record<string, never>) : undefined,
            })),
          'Deleting API key'
        );
      } else {
        await callApi<Record<string, never>>(
          () =>
            window.api.settings.saveAPIKey(provider, nextApiKey).then((r) => ({
              ...r,
              data: r.success ? ({} as Record<string, never>) : undefined,
            })),
          'Saving API key'
        );
      }

      apiKeyPersistTimeoutRef.current = null;
    }, 500);
  }, []);

  // Requirements: settings.1.9, settings.1.11, settings.1.12
  const handleAPIKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextApiKey = event.target.value;
    setApiKey(nextApiKey);
    scheduleAPIKeyPersist(effectiveLLMProvider, nextApiKey);
  };

  // Load profile data
  const loadProfile = useCallback(async () => {
    try {
      const result = await window.api.auth.getUser();
      if (result.success && result.user) {
        setProfile({
          name: result.user.name || '',
          email: result.user.email || '',
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
  }, []);

  // Load profile data on mount
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Subscribe to profile updates from EventBus
  // Requirements: realtime-events.3.3, account-profile.1.5
  useEventSubscription(EVENT_TYPES.USER_PROFILE_UPDATED, () => {
    logger.info('Profile updated event received, reloading profile');
    loadProfile();
  });

  // Requirements: settings.1.20, settings.1.21, error-notifications.2.1 - Load AI Agent settings on mount
  useEffect(() => {
    const loadAIAgentSettings = async () => {
      let isPackaged = false;

      try {
        const runtimeInfo = await window.api.app.getRuntimeInfo?.();
        isPackaged = runtimeInfo?.success === true && runtimeInfo.data?.isPackaged === true;
      } catch (error) {
        logger.warn(`Failed to load runtime info, falling back to non-packaged mode: ${error}`);
      }

      setIsProductionLLMProviderLocked(isPackaged);

      if (isPackaged) {
        setLlmProvider('openai');

        const keyResult = await callApi<{ apiKey: string }>(
          () =>
            window.api.settings.loadAPIKey('openai') as Promise<{
              success: boolean;
              data?: { apiKey: string };
              error?: string;
            }>,
          'Loading API key'
        );

        setApiKey(keyResult?.apiKey || '');
        return;
      }

      // Requirements: error-notifications.2.1 - Use callApi for automatic error handling
      // Load LLM provider
      const providerResult = await callApi<{ provider: LLMProvider }>(
        () =>
          window.api.settings.loadLLMProvider() as Promise<{
            success: boolean;
            data?: { provider: LLMProvider };
            error?: string;
          }>,
        'Loading LLM provider'
      );

      if (providerResult?.provider) {
        setLlmProvider(providerResult.provider);

        // Load API key for the loaded provider
        const keyResult = await callApi<{ apiKey: string }>(
          () =>
            window.api.settings.loadAPIKey(providerResult.provider) as Promise<{
              success: boolean;
              data?: { apiKey: string };
              error?: string;
            }>,
          'Loading API key'
        );

        if (keyResult?.apiKey) {
          setApiKey(keyResult.apiKey);
        } else {
          setApiKey('');
        }
      } else {
        // Default values: openai provider, empty API key
        setLlmProvider('openai');
        setApiKey('');
      }
    };

    loadAIAgentSettings();
  }, []);

  // Requirements: settings.1.10, settings.1.19, error-notifications.2.1 - Save provider immediately and load API key for new provider
  useEffect(() => {
    if (isProductionLLMProviderLocked) {
      return;
    }

    // Skip on initial mount (initial load is handled by the load effect above)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const saveProviderAndLoadKey = async () => {
      // Requirements: error-notifications.2.1 - Use callApi for automatic error handling
      // Save provider immediately (no debounce)
      await callApi<Record<string, never>>(
        () =>
          window.api.settings.saveLLMProvider(llmProvider).then((r) => ({
            ...r,
            data: r.success ? ({} as Record<string, never>) : undefined,
          })),
        'Saving LLM provider'
      );

      // Load API key for the new provider
      const keyResult = await callApi<{ apiKey: string }>(
        () =>
          window.api.settings.loadAPIKey(llmProvider) as Promise<{
            success: boolean;
            data?: { apiKey: string };
            error?: string;
          }>,
        'Loading API key'
      );

      if (keyResult?.apiKey) {
        setApiKey(keyResult.apiKey);
      } else {
        // If key not found, show empty field with placeholder
        setApiKey('');
      }
    };

    saveProviderAndLoadKey();
  }, [isProductionLLMProviderLocked, llmProvider]);

  // Requirements: settings.1.9, settings.1.11, settings.1.12 - Cancel pending API key save when provider changes
  useEffect(() => {
    if (apiKeyPersistTimeoutRef.current) {
      clearTimeout(apiKeyPersistTimeoutRef.current);
      apiKeyPersistTimeoutRef.current = null;
    }
  }, [effectiveLLMProvider]);

  // Requirements: settings.1.9, settings.1.11, settings.1.12 - Cancel pending API key save on unmount
  useEffect(() => {
    return () => {
      if (apiKeyPersistTimeoutRef.current) {
        clearTimeout(apiKeyPersistTimeoutRef.current);
        apiKeyPersistTimeoutRef.current = null;
      }
    };
  }, []);

  // Requirements: settings.2.4, error-notifications.2.1 - Handle test connection
  const handleTestConnection = async () => {
    // Requirements: settings.2.4 - Set testing state
    setTestingConnection(true);

    // Requirements: error-notifications.2.1 - Handle test connection errors
    try {
      const result = await (window.api.llm.testConnection(effectiveLLMProvider, apiKey) as Promise<{
        success: boolean;
        data?: { success: boolean };
        error?: string;
      }>);

      // Requirements: settings.2.7, settings.2.8 - Reset button state
      setTestingConnection(false);

      if (result.success) {
        // Requirements: settings.2.7 - Show success notification
        showSuccess('Connection successful! Your API key is valid.');
        logger.info(`Connection test successful for ${effectiveLLMProvider}`);
      } else {
        // Requirements: settings.2.8 - Show error without context prefix
        toast.error(result.error || 'Connection test failed');
      }
    } catch (error) {
      setTestingConnection(false);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  return (
    <div data-testid="settings-screen" className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8">
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
                  value={effectiveLLMProvider}
                  onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
                  disabled={isProductionLLMProviderLocked}
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google">Google (Gemini)</option>
                </select>
                {isProductionLLMProviderLocked ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Currently only one provider is available: OpenAI.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">API Key</label>
                <div className="relative">
                  <input
                    id="ai-agent-api-key"
                    data-testid="ai-agent-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={handleAPIKeyChange}
                    placeholder="Enter your API key"
                    className="w-full px-4 py-2 pr-12 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    data-testid="ai-agent-api-key-toggle"
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
        </div>
      </div>
    </div>
  );
}
