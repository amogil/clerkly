import { Calendar, CheckCircle2, Settings, AlertCircle, ExternalLink } from "lucide-react";

export function Integrations() {
  const integrations = [
    {
      id: "google-calendar",
      name: "Google Calendar",
      description: "Sync your meetings and schedule automatically",
      icon: Calendar,
      status: "connected" as const,
      connectedAccount: "sarah.chen@company.com",
      features: [
        "Automatic meeting detection",
        "Schedule sync",
        "Auto-join scheduled meetings",
        "Meeting metadata extraction",
      ],
    },
    {
      id: "jira",
      name: "Jira",
      description: "Automatically create and sync tasks",
      icon: CheckCircle2,
      status: "connected" as const,
      connectedAccount: "company.atlassian.net",
      features: [
        "Auto-create tickets from action items",
        "Assign tasks to team members",
        "Set due dates and priorities",
        "Bi-directional sync",
      ],
    },
    {
      id: "slack",
      name: "Slack",
      description: "Get notifications and share meeting summaries",
      icon: Settings,
      status: "not-connected" as const,
      features: [
        "Meeting summary notifications",
        "Action item reminders",
        "Share transcripts in channels",
        "Bot commands",
      ],
    },
  ];

  const connectionSteps = [
    {
      step: 1,
      title: "Connect Google Calendar",
      description: "Allow Clerkly to access your calendar so it knows which meetings to join",
      completed: true,
    },
    {
      step: 2,
      title: "Connect Jira or task manager",
      description: "Choose where extracted action items should be created as tasks",
      completed: true,
    },
    {
      step: 3,
      title: "Start your first meeting",
      description: "Clerkly will automatically join, listen, transcribe, and extract action items",
      completed: false,
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Integrations</h1>
          <p className="text-muted-foreground">Connect Clerkly with your tools and workflows</p>
        </div>

        {/* Getting Started */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-8 border border-primary/20 mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">Getting Started</h2>
          <div className="space-y-4">
            {connectionSteps.map((step) => (
              <div
                key={step.step}
                className={`flex items-start gap-4 p-4 rounded-lg bg-card border ${
                  step.completed ? "border-green-200" : "border-border"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                    step.completed
                      ? "bg-green-100 text-green-700"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {step.completed ? <CheckCircle2 className="w-5 h-5" /> : <span>{step.step}</span>}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Value Proposition */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-8 mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-3">How Clerkly Works</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Clerkly listens to your meetings, understands what needs to be done, and makes sure it
            lands on your calendar and task list. No more manual note-taking or forgotten action
            items.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">Calendar Sync</h4>
              <p className="text-sm text-muted-foreground">
                Automatically detects and joins meetings from your Google Calendar
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3">
                <Settings className="w-5 h-5 text-purple-600" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">AI Processing</h4>
              <p className="text-sm text-muted-foreground">
                Transcribes conversations and extracts action items with WHO, WHAT, WHEN
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">Task Creation</h4>
              <p className="text-sm text-muted-foreground">
                Creates tasks in Jira with assignees and due dates automatically
              </p>
            </div>
          </div>
        </div>

        {/* Connected Integrations */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Your Integrations</h2>
          {integrations.map((integration) => {
            const Icon = integration.icon;
            const isConnected = integration.status === "connected";

            return (
              <div
                key={integration.id}
                className="bg-card rounded-xl border border-border shadow-sm p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground">{integration.name}</h3>
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                            <AlertCircle className="w-3 h-3" />
                            Not connected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {integration.description}
                      </p>
                      {isConnected && integration.connectedAccount && (
                        <p className="text-xs text-muted-foreground">
                          Connected as: {integration.connectedAccount}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isConnected
                        ? "bg-secondary text-foreground hover:bg-secondary/80"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {isConnected ? "Configure" : "Connect"}
                  </button>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Features:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {integration.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-secondary/50 rounded-xl p-6 border border-border">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground mb-1">Need Help?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Check our documentation for detailed integration guides and troubleshooting tips.
              </p>
              <a
                href="#"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                View Documentation
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
