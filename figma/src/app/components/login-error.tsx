import { Logo } from './logo';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface LoginErrorProps {
  errorMessage?: string;
  errorCode?: string;
  onRetry: () => void;
}

export function LoginError({ 
  errorMessage = 'Unable to authenticate with Google',
  errorCode,
  onRetry, 
}: LoginErrorProps) {
  // Map common error codes to user-friendly messages
  const getErrorDetails = () => {
    if (errorCode === 'popup_closed_by_user') {
      return {
        title: 'Sign in cancelled',
        message: 'You closed the sign-in window before completing authentication.',
        suggestion: 'Please try again and complete the sign-in process.'
      };
    }
    if (errorCode === 'access_denied') {
      return {
        title: 'Access denied',
        message: 'You denied access to your Google account.',
        suggestion: 'Clerkly needs access to your Google account to function properly.'
      };
    }
    if (errorCode === 'network_error') {
      return {
        title: 'Network error',
        message: 'Unable to connect to Google authentication servers.',
        suggestion: 'Please check your internet connection and try again.'
      };
    }
    return {
      title: 'Authentication failed',
      message: errorMessage,
      suggestion: 'Please try signing in again or contact support if the problem persists.'
    };
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Error Icon */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-6">
            {/* Error circle */}
            <div className="relative bg-red-500 rounded-full p-4 shadow-lg">
              <AlertCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <h1 className="text-3xl font-semibold text-foreground mb-2">
            {errorDetails.title}
          </h1>
          <p className="text-muted-foreground">
            Something went wrong during sign in
          </p>
        </div>

        {/* Error Details Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 mb-6">
          {/* Error Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900 mb-1">
                  {errorDetails.message}
                </p>
                <p className="text-xs text-red-700">
                  {errorDetails.suggestion}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={onRetry}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3.5 px-6 rounded-lg shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        </div>

        {/* Troubleshooting Tips */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h4 className="text-sm font-semibold text-foreground mb-4">Troubleshooting</h4>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-2"></div>
              <p className="text-sm text-muted-foreground">
                Check that pop-ups are enabled for this site
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-2"></div>
              <p className="text-sm text-muted-foreground">
                Ensure you're using a supported browser (Chrome, Firefox, Safari, Edge)
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-2"></div>
              <p className="text-sm text-muted-foreground">
                Try clearing your browser cache and cookies
              </p>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-2"></div>
              <p className="text-sm text-muted-foreground">
                Verify your internet connection is stable
              </p>
            </li>
          </ul>
        </div>

        {/* Support Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Still having issues?{' '}
            <button className="text-primary hover:underline font-medium">
              Contact Support
            </button>
          </p>
        </div>

        {/* Logo at bottom */}
        <div className="mt-8 flex justify-center opacity-50">
          <Logo size="sm" showText={true} />
        </div>
      </div>
    </div>
  );
}