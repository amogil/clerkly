// Requirements: E.G.11, E.G.14, E.G.15, E.G.16, E.G.17, E.G.18
type AuthGateProps = {
  isAuthorizing: boolean;
  errorMessage?: string | null;
  onSignIn: () => void;
};

export function AuthGate({ isAuthorizing, errorMessage, onSignIn }: AuthGateProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground">Welcome to Clerkly</h1>
          <p className="text-base text-muted-foreground">
            Sign in with Google to access your workspace.
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSignIn}
          disabled={isAuthorizing}
          className="inline-flex items-center gap-3 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded bg-white">
            <svg
              className="h-5 w-5"
              viewBox="0 0 18 18"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#EA4335"
                d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.47C13.44.89 11.42 0 9 0 5.48 0 2.44 2.02 1.02 4.96l2.95 2.29C4.7 4.99 6.68 3.48 9 3.48Z"
              />
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.1-.18-1.58H9v3.06h4.84c-.1.79-.63 1.98-1.81 2.78l2.78 2.16c1.66-1.53 2.83-3.78 2.83-6.42Z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.76A5.47 5.47 0 0 1 3.7 9c0-.6.1-1.18.27-1.76L1.02 4.96A8.996 8.996 0 0 0 0 9c0 1.45.35 2.81 1.02 4.04l2.95-2.28Z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.78-2.16c-.75.52-1.76.88-3.18.88-2.32 0-4.3-1.52-5.03-3.77l-2.95 2.28C2.44 15.98 5.48 18 9 18Z"
              />
            </svg>
          </span>
          {isAuthorizing ? "Opening Google..." : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}
