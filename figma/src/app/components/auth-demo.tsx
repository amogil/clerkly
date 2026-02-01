import { useState } from 'react';
import { LoginScreen } from './login-screen';
import { LoginError } from './login-error';

type AuthState = 'login' | 'error';

export function AuthDemo() {
  const [authState, setAuthState] = useState<AuthState>('login');

  // Demo controls
  const [showControls] = useState(true);

  const handleLogin = () => {
    // Simulate login attempt - 70% success, 30% error for demo
    const random = Math.random();
    if (random > 0.7) {
      setAuthState('error');
    } else {
      // In real app, would navigate to dashboard
      alert('Login successful! Would navigate to dashboard.');
      // Keep on login screen for demo purposes
    }
  };

  const handleRetry = () => {
    setAuthState('login');
  };

  const renderAuthScreen = () => {
    switch (authState) {
      case 'login':
        return <LoginScreen onLogin={handleLogin} />;
      case 'error':
        return (
          <LoginError
            errorCode="popup_closed_by_user"
            onRetry={handleRetry}
          />
        );
      default:
        return <LoginScreen onLogin={handleLogin} />;
    }
  };

  return (
    <div className="relative">
      {renderAuthScreen()}

      {/* Demo Controls */}
      {showControls && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-900 text-white rounded-xl shadow-2xl p-4 border border-gray-700">
            <p className="text-xs font-medium mb-3 text-gray-300">Demo Controls</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAuthState('login')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authState === 'login'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setAuthState('error')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authState === 'error'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Error
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
