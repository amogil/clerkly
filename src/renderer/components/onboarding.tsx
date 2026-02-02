import { Mic, FileText, CheckCircle, ArrowRight, Calendar, Zap } from 'lucide-react';

export function Onboarding() {
  const steps = [
    {
      icon: Mic,
      title: 'Clerkly listens',
      description:
        'Connect your calendar and meeting tools. Clerkly joins your calls quietly, recording and transcribing everything in real-time.',
    },
    {
      icon: FileText,
      title: 'Clerkly writes it down',
      description:
        'Every word is captured and organized. Speaker labels, timestamps, and context-aware transcription ensure nothing gets lost.',
    },
    {
      icon: CheckCircle,
      title: 'Clerkly makes sure it gets done',
      description:
        'Action items are automatically extracted with WHO, WHAT, and WHEN. Tasks sync to Jira or your todo list instantly.',
    },
  ];

  const features = [
    {
      icon: Calendar,
      title: 'Calendar Integration',
      description: 'Automatically joins scheduled meetings',
    },
    {
      icon: Mic,
      title: 'Real-time Transcription',
      description: 'Accurate transcripts with speaker labels',
    },
    {
      icon: Zap,
      title: 'Smart Action Items',
      description: 'AI-powered task extraction and routing',
    },
    {
      icon: CheckCircle,
      title: 'Jira Sync',
      description: 'Seamless integration with your workflow',
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-6">
            <Mic className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-semibold text-foreground mb-4">Welcome to Clerkly</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Your AI clerk for modern teams. Let Clerkly handle the notes while you focus on what
            matters.
          </p>
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-center text-foreground mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="relative">
                  <div className="bg-card rounded-xl border border-border p-8 shadow-sm h-full">
                    <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-xl mb-6">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                      <ArrowRight className="w-6 h-6 text-border" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-center text-foreground mb-12">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-primary/10 rounded-lg">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-12 text-center border border-primary/20">
          <h2 className="text-2xl font-semibold text-foreground mb-3">Ready to get started?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Connect your calendar and meeting tools to let Clerkly start working for you. Your AI
            clerk is ready to take notes.
          </p>
          <button className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm">
            Connect Calendar
          </button>
        </div>

        {/* Trust Section */}
        <div className="mt-16 pt-16 border-t border-border">
          <div className="text-center max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-foreground mb-3">
              Built for trust and reliability
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your data is encrypted end-to-end. Clerkly integrates with your existing tools without
              disrupting your workflow. SOC 2 Type II certified and GDPR compliant.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
