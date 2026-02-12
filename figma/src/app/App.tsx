import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Toaster } from 'sonner';
import { ErrorProvider } from './contexts/error-context';
import { ErrorBoundary } from './components/error-boundary';
import { ErrorDemoPage } from './components/error-demo-page';
import { TopNavigation } from './components/top-navigation';
import { Agents } from './components/agents';
import { Settings } from './components/settings';
import { AuthDemo } from './components/auth-demo';

function MainApp() {
  const [showAuthDemo, setShowAuthDemo] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<string>('agents');

  const handleSignOut = () => {
    setShowAuthDemo(true);
  };

  if (showAuthDemo) {
    return <AuthDemo onLoginSuccess={() => setShowAuthDemo(false)} />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'agents':
        return <Agents />;
      case 'settings':
        return <Settings onSignOut={handleSignOut} />;
      default:
        return <Agents />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="pt-16">{renderScreen()}</div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/" element={<MainApp />} />
            <Route path="/error-demo" element={<ErrorDemoPage />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ErrorProvider>
  );
}