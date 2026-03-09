import { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X, ArrowLeft } from 'lucide-react';
import { useError } from '../contexts/error-context';

interface ErrorDemoPageProps {
  onBack: () => void;
}

export function ErrorDemoPage({ onBack }: ErrorDemoPageProps) {
  const { showSuccess, showError, showWarning, showInfo } = useError();
  const [showInlineError, setShowInlineError] = useState(false);
  const [showErrorState, setShowErrorState] = useState(false);
  const [throwError, setThrowError] = useState(false);

  // Trigger error boundary
  if (throwError) {
    throw new Error('Test error for Error Boundary demo');
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-primary hover:underline mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Settings
          </button>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Error Handling Demo</h1>
          <p className="text-muted-foreground">Comprehensive error handling system for Clerkly</p>
        </div>

        <div className="grid gap-6">
          {/* Toast Notifications */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Toast Notifications</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Quick pop-up notifications for immediate feedback
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => showSuccess('Operation completed successfully!')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                ✓ Success
              </button>
              <button
                onClick={() => showError('An error occurred while processing the operation')}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                ✕ Error
              </button>
              <button
                onClick={() => showWarning('Warning! This action requires confirmation')}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
              >
                ⚠ Warning
              </button>
              <button
                onClick={() => showInfo('A new feature is now available in Settings')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                ℹ Info
              </button>
            </div>
          </div>

          {/* Inline Error Messages */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">2. Inline Error Messages</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Contextual errors embedded directly in the interface
            </p>

            <button
              onClick={() => setShowInlineError(!showInlineError)}
              className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              {showInlineError ? 'Hide Error' : 'Show Inline Error'}
            </button>

            {showInlineError && (
              <div className="space-y-3">
                {/* Error inline */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 mb-1">
                        Failed to save changes
                      </p>
                      <p className="text-xs text-red-700">
                        Check your internet connection and try again
                      </p>
                    </div>
                    <button
                      onClick={() => setShowInlineError(false)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Warning inline */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900 mb-1">
                        Warning: this action cannot be undone
                      </p>
                      <p className="text-xs text-amber-700">
                        Make sure you really want to continue
                      </p>
                    </div>
                  </div>
                </div>

                {/* Success inline */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 mb-1">
                        Settings saved successfully
                      </p>
                      <p className="text-xs text-green-700">All changes have been applied</p>
                    </div>
                  </div>
                </div>

                {/* Info inline */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        New feature available
                      </p>
                      <p className="text-xs text-blue-700">
                        You can now automatically create tasks from meetings
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error States */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Error States</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Full-page states for critical situations
            </p>

            <button
              onClick={() => setShowErrorState(!showErrorState)}
              className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              {showErrorState ? 'Hide Error State' : 'Show Error State'}
            </button>

            {showErrorState && (
              <div className="border-2 border-dashed border-border rounded-lg p-8">
                <div className="text-center max-w-md mx-auto">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Failed to load data
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    There was a problem loading the data. Try refreshing the page or come back
                    later.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                      Try Again
                    </button>
                    <button
                      onClick={() => setShowErrorState(false)}
                      className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Boundary */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Error Boundary</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Catch critical React errors to prevent application crashes
            </p>

            <button
              onClick={() => setThrowError(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Trigger Critical Error
            </button>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 mb-1">Warning!</p>
                  <p className="text-xs text-amber-700">
                    This will trigger a critical error that will be caught by Error Boundary. The
                    app will not crash, and the user will see a clear recovery message.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Validation Example */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Form Validation</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Examples of input field validation errors
            </p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input
                  type="email"
                  defaultValue="invalid-email"
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">Please enter a valid email address</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                <input
                  type="password"
                  defaultValue="123"
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">
                  Password must contain at least 8 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value=""
                  readOnly
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">This field is required</p>
              </div>
            </div>
          </div>

          {/* Usage Guide */}
          <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">💡 How to Use</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">Toast notifications:</strong> Use the{' '}
                <code className="px-2 py-0.5 bg-secondary rounded text-primary">useError()</code>{' '}
                hook to display quick notifications
              </div>
              <div>
                <strong className="text-foreground">Inline errors:</strong> Embed error messages
                directly into the interface for contextual feedback
              </div>
              <div>
                <strong className="text-foreground">Error states:</strong> Show full-page states for
                critical data loading failures
              </div>
              <div>
                <strong className="text-foreground">Error Boundary:</strong> Automatically catches
                unhandled React errors and shows a clear message
              </div>
              <div>
                <strong className="text-foreground">Form validation:</strong> Display validation
                errors directly under input fields
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
