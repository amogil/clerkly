import { Logo } from './logo';

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Logo size="lg" showText={false} />
          </div>
          <h1 className="text-4xl font-semibold text-foreground mb-3">
            Clerkly
          </h1>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Welcome
            </h2>
            <p className="text-sm text-muted-foreground">
              Your autonomous AI agent that listens, organizes, and acts
            </p>
          </div>

          {/* Google Sign In Button */}
          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium py-3.5 px-6 rounded-lg border border-gray-300 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
          >
            {/* Google Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Additional Info */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              By continuing, you agree to Clerkly's Terms of Service and Privacy Policy
            </p>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-12 grid grid-cols-4 gap-6 text-center">
          <div className="space-y-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Listen & Transcribe</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Extract Tasks</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Automate Actions</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Auto-Sync</p>
          </div>
        </div>
      </div>
    </div>
  );
}