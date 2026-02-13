// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, navigation.1.1, navigation.1.2, navigation.1.3, navigation.1.4, error-notifications.1.1
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider } from './contexts/error-context';
import { TopNavigation } from './components/top-navigation';
import { Agents } from './components/agents';
import { Settings } from './components/settings';
import { ErrorDemoPage } from './components/error-demo-page';
import { LoginScreen } from './components/auth/LoginScreen';
import { LoginError } from './components/auth/LoginError';
import { SimpleRouter, NavigationManager, AuthGuard } from './navigation';
import { Logger } from './Logger';
import { ErrorNotificationManager } from './managers/ErrorNotificationManager';
import { NotificationUI } from './components/NotificationUI';
import { useEventSubscription } from './events/useEventSubscription';
import type {
  AuthSucceededPayload,
  AuthFailedPayload,
  ProfileSyncedPayload,
  ErrorCreatedPayload,
} from '../shared/events/types';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('App');

// Requirements: error-notifications.1.1 - Create ErrorNotificationManager instance
const errorNotificationManager = new ErrorNotificationManager();

// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, navigation.1.1, navigation.1.3, navigation.1.4, error-notifications.1.1
export default function App() {
  return (
    <ErrorProvider>
      <ErrorBoundary>
        <Toaster position="top-right" richColors closeButton duration={15000} />
        <NotificationUI manager={errorNotificationManager} />
        <AppContent />
      </ErrorBoundary>
    </ErrorProvider>
  );
}

function AppContent() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<{ message: string; code?: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isWaitingForProfile, setIsWaitingForProfile] = useState<boolean>(false);
  const [currentScreen, setCurrentScreen] = useState<string>('agents');

  const router = useMemo(() => {
    return new SimpleRouter(currentScreen, (route: string) => {
      const screenMap: Record<string, string> = {
        '/login': 'login',
        '/agents': 'agents',
        '/settings': 'settings',
        '/error-demo': 'error-demo',
      };
      const screen = screenMap[route] || 'agents';
      setCurrentScreen(screen);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigationManager = useMemo(() => new NavigationManager(router), [router]);
  const authGuard = useMemo(() => new AuthGuard(navigationManager), [navigationManager]);

  useEffect(() => {
    const routeMap: Record<string, string> = {
      login: '/login',
      agents: '/agents',
      settings: '/settings',
      'error-demo': '/error-demo',
    };
    router.updateCurrentRoute(routeMap[currentScreen] || '/agents');
  }, [currentScreen, router]);

  const navigateToScreen = async (screen: string) => {
    const routeMap: Record<string, string> = {
      login: '/login',
      agents: '/agents',
      settings: '/settings',
      'error-demo': '/error-demo',
    };
    const canAccess = await authGuard.canActivate(routeMap[screen] || '/agents');
    if (canAccess) setCurrentScreen(screen);
  };

  // Event handlers via EventBus
  const handleAuthFailed = useCallback((payload: AuthFailedPayload) => {
    logger.error('Auth failed: ' + JSON.stringify(payload));
    setIsLoading(false);
    setIsWaitingForProfile(false);
    setAuthError({ message: payload.error, code: payload.errorCode });
    setIsAuthorized(false);
  }, []);

  const handleAuthSucceeded = useCallback((payload: AuthSucceededPayload) => {
    logger.info('Auth succeeded: ' + JSON.stringify(payload));
    setAuthError(null);
    setIsLoading(true);
    setIsWaitingForProfile(true);
  }, []);

  const handleProfileSynced = useCallback(
    (payload: ProfileSyncedPayload) => {
      logger.info('Profile synced: ' + JSON.stringify(payload));
      setIsLoading(false);
      setIsWaitingForProfile(false);
      setAuthError(null);
      setIsAuthorized(true);
      navigationManager.redirectToDashboard();
    },
    [navigationManager]
  );

  const handleErrorCreated = useCallback((payload: ErrorCreatedPayload) => {
    logger.info('Error: ' + JSON.stringify(payload));
    errorNotificationManager.showNotification(payload.message, payload.context);
  }, []);

  useEventSubscription('auth.failed', handleAuthFailed);
  useEventSubscription('auth.succeeded', handleAuthSucceeded);
  useEventSubscription('profile.synced', handleProfileSynced);
  useEventSubscription('error.created', handleErrorCreated);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const status = await window.api.auth.getStatus();
        setIsAuthorized(status.authorized);
        await navigationManager.initialize();
      } catch (error) {
        logger.error('Failed to check auth status: ' + error);
        setIsAuthorized(false);
      }
    };
    checkAuthStatus();

    const unsubscribeLogout = window.api.auth.onLogout(() => {
      logger.info('Logout event received');
      setIsAuthorized(false);
      setAuthError(null);
      setIsLoading(false);
      navigationManager.redirectToLogin();
    });

    return () => {
      unsubscribeLogout();
    };
  }, [navigationManager]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      const result = await window.api.auth.startLogin();
      if (!result.success) {
        setIsLoading(false);
        setAuthError({ message: result.error || 'Failed to start login' });
      }
    } catch (error) {
      logger.error('Login failed: ' + error);
      setIsLoading(false);
      setAuthError({ message: 'Failed to start login' });
    }
  };

  const handleSignOut = async () => {
    try {
      await window.api.auth.logout();
      setIsAuthorized(false);
      setAuthError(null);
      setIsLoading(false);
    } catch (error) {
      logger.error('Logout failed: ' + error);
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError && !isWaitingForProfile) {
    return (
      <LoginError
        errorMessage={authError.message}
        errorCode={authError.code}
        onRetry={handleLogin}
        isLoading={isLoading}
        isDisabled={isLoading}
      />
    );
  }

  if (!isAuthorized) {
    return <LoginScreen onLogin={handleLogin} isLoading={isLoading} isDisabled={isLoading} />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'agents':
        return <Agents />;
      case 'settings':
        return <Settings onSignOut={handleSignOut} onNavigate={navigateToScreen} />;
      case 'error-demo':
        return <ErrorDemoPage onBack={() => navigateToScreen('settings')} />;
      default:
        return <Agents />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation currentScreen={currentScreen} onNavigate={navigateToScreen} />
      <div className="pt-16">{renderScreen()}</div>
    </div>
  );
}
