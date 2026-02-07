import { Clock, Cpu, Eye, EyeOff, User, LogOut, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface SettingsProps {
  onSignOut?: () => void;
  onNavigate?: (screen: string) => void;
}

export function Settings({ onSignOut, onNavigate }: SettingsProps) {
  const [timeFormat, setTimeFormat] = useState('12h');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [llmProvider, setLlmProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

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
                    console.log('Logging out...');
                    if (onSignOut) {
                      onSignOut();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Sarah Chen"
                    disabled
                    className="w-full px-4 py-2 bg-secondary/30 border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                  <input
                    type="email"
                    defaultValue="sarah.chen@company.com"
                    disabled
                    className="w-full px-4 py-2 bg-secondary/30 border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Synced from Google Account</p>
            </div>
          </div>

          {/* Display Preferences */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Display Preferences</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Time Format
                </label>
                <select
                  value={timeFormat}
                  onChange={(e) => setTimeFormat(e.target.value)}
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                >
                  <option value="12h">12-hour</option>
                  <option value="24h">24-hour</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Date Format
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                </select>
              </div>
            </div>
          </div>

          {/* AI Agent Settings */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">AI Agent Settings</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  LLM Provider
                </label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
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
                  Your API key is encrypted and stored securely. It will only be used to communicate
                  with your selected LLM provider.
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <button className="text-sm px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                  Test Connection
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
