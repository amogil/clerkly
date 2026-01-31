// Requirements: E.T.4, E.A.1, E.A.2, E.A.3, E.A.4, E.A.5, E.U.2
import { Logo } from "./logo";
type AuthGateProps = {
  isAuthorizing: boolean;
  errorMessage?: string | null;
  onSignIn: () => void;
};

export function AuthGate({ isAuthorizing, errorMessage, onSignIn }: AuthGateProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo size="md" showText={true} />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground">Welcome to Clerkly</h1>
          <p className="text-base text-muted-foreground">
            Sign in with Google to access your workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignIn}
          disabled={isAuthorizing}
          className="inline-flex h-14 min-w-[320px] items-stretch overflow-hidden rounded-[3px] bg-[#4285F4] text-lg font-semibold text-white shadow-sm transition hover:bg-[#3977F5] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="flex w-14 items-center justify-center border-2 border-[#4285F4] bg-white">
            <svg className="h-6 w-6" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
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
          <span className="flex flex-1 items-center justify-center px-6">
            {isAuthorizing ? "Opening Google..." : "Sign in with Google"}
          </span>
        </button>

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
