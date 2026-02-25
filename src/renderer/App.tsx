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
import { SimpleRouter, NavigationManager, AuthGuard } from './navigation';
import { Logger } from './Logger';
import { ErrorNotificationManager } from './managers/ErrorNotificationManager';
import { NotificationUI } from './components/NotificationUI';
import { useEventSubscription } from './events/useEventSubscription';
import { RendererEventBus } from './events/RendererEventBus';
import { EVENT_TYPES } from '../shared/events/constants';
import { AuthStartedEvent } from '../shared/events/types';
import { ipcWithRetry } from './utils/ipcWithRetry';
import type {
  AuthCallbackReceivedPayload,
  AuthCompletedPayload,
  AuthFailedPayload,
  AuthCancelledPayload,
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
  const [isChatsLoading, setIsChatsLoading] = useState<boolean>(true);
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

  useEffect(() => {
    if (isAuthorized) {
      setIsChatsLoading(true);
    }
  }, [isAuthorized]);

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
  // Requirements: google-oauth-auth.8.4
  const handleAuthCallbackReceived = useCallback((_payload: AuthCallbackReceivedPayload) => {
    logger.info('Auth callback received - showing loader');
    setIsLoading(true);
    setAuthError(null);
  }, []);

  const handleAuthCompleted = useCallback(
    (payload: AuthCompletedPayload) => {
      logger.info('Auth completed: ' + JSON.stringify(payload));
      setIsLoading(false);
      setAuthError(null);
      setIsAuthorized(true);
      setIsChatsLoading(true);
      navigationManager.redirectToAgents();
    },
    [navigationManager]
  );

  const handleAuthFailed = useCallback((payload: AuthFailedPayload) => {
    logger.error('Auth failed: ' + JSON.stringify(payload));
    setIsLoading(false);
    setAuthError({ message: payload.message, code: payload.code });
    setIsAuthorized(false);
    setIsChatsLoading(false);
  }, []);

  const handleAuthCancelled = useCallback((_payload: AuthCancelledPayload) => {
    logger.info('Auth cancelled by user');
    setIsLoading(false);
    setAuthError({ message: 'User cancelled authentication', code: 'access_denied' });
    setIsAuthorized(false);
    setIsChatsLoading(false);
  }, []);

  const handleAuthSignedOut = useCallback(() => {
    logger.info('User signed out');
    setIsAuthorized(false);
    setAuthError(null);
    setIsLoading(false);
    setIsChatsLoading(false);
    navigationManager.redirectToLogin();
  }, [navigationManager]);

  const handleErrorCreated = useCallback((payload: ErrorCreatedPayload) => {
    logger.info('Error: ' + JSON.stringify(payload));
    errorNotificationManager.showNotification(payload.message, payload.context);
  }, []);

  useEventSubscription(EVENT_TYPES.AUTH_CALLBACK_RECEIVED, handleAuthCallbackReceived);
  useEventSubscription(EVENT_TYPES.AUTH_COMPLETED, handleAuthCompleted);
  useEventSubscription(EVENT_TYPES.AUTH_FAILED, handleAuthFailed);
  useEventSubscription(EVENT_TYPES.AUTH_CANCELLED, handleAuthCancelled);
  useEventSubscription(EVENT_TYPES.AUTH_SIGNED_OUT, handleAuthSignedOut);
  useEventSubscription(EVENT_TYPES.ERROR_CREATED, handleErrorCreated);

  // Requirements: error-notifications.2.7, error-notifications.2.8 - Global unhandled rejection handler
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error('Unhandled rejection: ' + String(event.reason));

      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);

      errorNotificationManager.showNotification(message, 'Unexpected error');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const status = await ipcWithRetry(() => window.api.auth.getStatus());
        setIsAuthorized(status.authorized);
        await navigationManager.initialize();
      } catch (error) {
        logger.error('Failed to check auth status: ' + error);
        setIsAuthorized(false);
      }
    };
    checkAuthStatus();

    // Note: auth.signed-out event is handled by handleAuthSignedOut via useEventSubscription
    // The onLogout callback is kept for backward compatibility with direct IPC calls
    const unsubscribeLogout = window.api.auth.onLogout(() => {
      logger.info('Logout IPC event received (legacy)');
    });

    return () => {
      unsubscribeLogout();
    };
  }, [navigationManager]);

  // Requirements: google-oauth-auth.8.4
  const handleLogin = async () => {
    try {
      // Publish auth.started event
      const eventBus = RendererEventBus.getInstance();
      eventBus.publish(new AuthStartedEvent());

      const result = await window.api.auth.startLogin();
      if (!result.success) {
        setAuthError({ message: result.error || 'Failed to start login' });
      }
    } catch (error) {
      logger.error('Login failed: ' + error);
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
    return <AppLoadingScreen />;
  }

  if (!isAuthorized) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        isLoading={isLoading}
        isDisabled={isLoading}
        errorMessage={authError?.message}
        errorCode={authError?.code}
      />
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'agents':
        return <Agents onNavigate={navigateToScreen} onChatsLoadingChange={setIsChatsLoading} />;
      case 'settings':
        return <Settings onSignOut={handleSignOut} onNavigate={navigateToScreen} />;
      case 'error-demo':
        return <ErrorDemoPage onBack={() => navigateToScreen('settings')} />;
      default:
        return <Agents onNavigate={navigateToScreen} />;
    }
  };

  return (
    <>
      {isChatsLoading && <AppLoadingScreen />}
      <div
        className={`min-h-screen bg-background${isChatsLoading ? ' hidden' : ''}`}
        data-testid="agents-screen"
      >
        <TopNavigation currentScreen={currentScreen} onNavigate={navigateToScreen} />
        <div className="pt-16">{renderScreen()}</div>
      </div>
    </>
  );
}

// Requirements: agents.13.2, agents.13.10
function AppLoadingScreen() {
  return (
    <div
      data-testid="app-loading-screen"
      className="min-h-screen bg-background flex items-center justify-center"
    >
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
