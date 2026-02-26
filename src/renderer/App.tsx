// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, navigation.1.1, navigation.1.2, navigation.1.3, navigation.1.4, error-notifications.1.1
import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider } from './contexts/error-context';
import { TopNavigation } from './components/top-navigation';
import { Agents } from './components/agents';
import { Settings } from './components/settings';
import { ErrorDemoPage } from './components/error-demo-page';
import { LoginScreen } from './components/auth/LoginScreen';
import { Logger } from './Logger';
import { ErrorNotificationManager } from './managers/ErrorNotificationManager';
import { NotificationUI } from './components/NotificationUI';
import { useEventSubscription } from './events/useEventSubscription';
import { RendererEventBus } from './events/RendererEventBus';
import { useAppCoordinatorState } from './hooks/useAppCoordinatorState';
import { EVENT_TYPES } from '../shared/events/constants';
import { AuthStartedEvent } from '../shared/events/types';
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
  const { state: appState, isBootstrapping } = useAppCoordinatorState();
  const [authError, setAuthError] = useState<{ message: string; code?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [currentScreen, setCurrentScreen] = useState<'agents' | 'settings' | 'error-demo'>('agents');

  useEffect(() => {
    if (!appState?.authorized) return;
    if (appState.targetScreen === 'settings') setCurrentScreen('settings');
    if (appState.targetScreen === 'error-demo') setCurrentScreen('error-demo');
    if (appState.targetScreen === 'agents') setCurrentScreen('agents');
  }, [appState]);

  const navigateToScreen = useCallback((screen: string) => {
    if (!appState?.authorized) return;
    if (screen === 'agents' || screen === 'settings' || screen === 'error-demo') {
      setCurrentScreen(screen);
    }
  }, [appState?.authorized]);

  const handleAuthCallbackReceived = useCallback((_payload: AuthCallbackReceivedPayload) => {
    logger.info('Auth callback received - showing loader');
    setIsAuthLoading(true);
    setAuthError(null);
  }, []);

  const handleAuthCompleted = useCallback((_payload: AuthCompletedPayload) => {
    setIsAuthLoading(false);
    setAuthError(null);
    setCurrentScreen('agents');
  }, []);

  const handleAuthFailed = useCallback((payload: AuthFailedPayload) => {
    logger.error('Auth failed: ' + JSON.stringify(payload));
    setIsAuthLoading(false);
    setAuthError({ message: payload.message, code: payload.code });
  }, []);

  const handleAuthCancelled = useCallback((_payload: AuthCancelledPayload) => {
    logger.info('Auth cancelled by user');
    setIsAuthLoading(false);
    setAuthError({ message: 'User cancelled authentication', code: 'access_denied' });
  }, []);

  const handleAuthSignedOut = useCallback(() => {
    setIsAuthLoading(false);
    setAuthError(null);
    setCurrentScreen('agents');
  }, []);

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
    } catch (error) {
      logger.error('Logout failed: ' + error);
    }
  };

  if (isBootstrapping || !appState || appState.phase === 'booting') {
    return <AppLoadingScreen />;
  }

  if (!appState.authorized || appState.targetScreen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        isLoading={isAuthLoading}
        isDisabled={isAuthLoading}
        errorMessage={authError?.message}
        errorCode={authError?.code}
      />
    );
  }

  const isGlobalLoading =
    appState.phase === 'authenticating' ||
    appState.phase === 'preparing-session' ||
    appState.phase === 'waiting-for-chats';

  const renderScreen = () => {
    switch (currentScreen) {
      case 'agents':
        return <Agents onNavigate={navigateToScreen} />;
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
      {isGlobalLoading && <AppLoadingScreen />}
      <div
        className={`min-h-screen bg-background${isGlobalLoading ? ' hidden' : ''}`}
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
