import { Calendar, CheckCircle2, Bell, User, Shield, Globe, Mic, FileText, Save } from 'lucide-react';
import { useState } from 'react';

export function Settings() {
  const [autoJoinMeetings, setAutoJoinMeetings] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [autoCreateTasks, setAutoCreateTasks] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [language, setLanguage] = useState('en');

  const integrations = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      icon: Calendar,
      status: 'connected',
      account: 'sarah.chen@company.com',
    },
    {
      id: 'jira',
      name: 'Jira',
      icon: CheckCircle2,
      status: 'connected',
      account: 'company.atlassian.net',
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Configure Clerkly to work the way you want
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Account</h2>
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
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    defaultValue="sarah.chen@company.com"
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Company
                </label>
                <input
                  type="text"
                  defaultValue="TechCorp"
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Mic className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Meeting Settings</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Auto-join meetings
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Automatically join meetings from your Google Calendar
                  </p>
                </div>
                <button
                  onClick={() => setAutoJoinMeetings(!autoJoinMeetings)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    autoJoinMeetings ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      autoJoinMeetings ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Auto-transcribe
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Automatically transcribe all meetings with speaker labels
                  </p>
                </div>
                <button
                  onClick={() => setAutoTranscribe(!autoTranscribe)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    autoTranscribe ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      autoTranscribe ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Auto-create tasks
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Automatically create tasks from action items in Jira
                  </p>
                </div>
                <button
                  onClick={() => setAutoCreateTasks(!autoCreateTasks)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    autoCreateTasks ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      autoCreateTasks ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="pt-4 border-t border-border">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Default meeting language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ru">Russian</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Notifications</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Email notifications
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Receive email summaries after each meeting
                  </p>
                </div>
                <button
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    emailNotifications ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      emailNotifications ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">
                    Slack notifications
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Post meeting summaries to Slack channels
                  </p>
                </div>
                <button
                  onClick={() => setSlackNotifications(!slackNotifications)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    slackNotifications ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      slackNotifications ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Connected Integrations</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {integrations.map((integration) => {
                const Icon = integration.icon;
                return (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">
                          {integration.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {integration.account}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                        Connected
                      </span>
                      <button className="text-sm text-primary hover:underline">
                        Configure
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">Privacy & Security</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-medium text-foreground mb-1">
                  Data retention
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Transcripts and recordings are stored for 90 days by default
                </p>
                <select className="w-full px-4 py-2 bg-input-background border border-border rounded-lg text-foreground">
                  <option value="30">30 days</option>
                  <option value="90" selected>90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                  <option value="forever">Forever</option>
                </select>
              </div>

              <div className="pt-4 border-t border-border">
                <button className="text-sm text-red-600 hover:underline">
                  Delete all my data
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
