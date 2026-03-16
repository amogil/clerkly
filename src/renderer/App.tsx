// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, navigation.1.1, navigation.1.2, navigation.1.3, navigation.1.4, error-notifications.1.1
import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider } from './contexts/error-context';
import { TooltipProvider } from './components/ui/tooltip';
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
  LLMPipelineDiagnosticPayload,
  MessageCreatedPayload,
} from '../shared/events/types';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('App');

// Requirements: error-notifications.1.1 - Create ErrorNotificationManager instance
const errorNotificationManager = new ErrorNotificationManager();

function describeUnhandledReason(reason: unknown): string {
  if (reason instanceof Error) {
    return JSON.stringify(
      {
        type: 'Error',
        name: reason.name,
        message: reason.message,
        stack: reason.stack ?? null,
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      type: typeof reason,
      value: String(reason),
    },
    null,
    2
  );
}

function isBenignCancellationReason(reason: unknown): boolean {
  const name = reason instanceof Error ? reason.name : '';
  const message = reason instanceof Error ? reason.message : String(reason ?? '');
  const normalized = message.toLowerCase();

  return (
    name === 'AbortError' ||
    normalized.includes('aborted') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled')
  );
}

// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, navigation.1.1, navigation.1.3, navigation.1.4, error-notifications.1.1
export default function App() {
  return (
    <ErrorProvider>
      <TooltipProvider>
        <ErrorBoundary>
          <Toaster position="top-right" richColors closeButton duration={15000} />
          <NotificationUI manager={errorNotificationManager} />
          <AppContent />
        </ErrorBoundary>
      </TooltipProvider>
    </ErrorProvider>
  );
}

function AppContent() {
  const { state: appState, isBootstrapping } = useAppCoordinatorState();
  const [authError, setAuthError] = useState<{ message: string; code?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [currentScreen, setCurrentScreen] = useState<'agents' | 'settings' | 'error-demo'>(
    'agents'
  );

  useEffect(() => {
    if (!appState?.authorized) return;
    if (appState.targetScreen === 'settings') setCurrentScreen('settings');
    if (appState.targetScreen === 'error-demo') setCurrentScreen('error-demo');
    if (appState.targetScreen === 'agents') setCurrentScreen('agents');
  }, [appState]);

  const navigateToScreen = useCallback(
    (screen: string) => {
      if (!appState?.authorized) return;
      if (screen === 'agents' || screen === 'settings' || screen === 'error-demo') {
        setCurrentScreen(screen);
      }
    },
    [appState?.authorized]
  );

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
  }, []);

  const handleErrorCreated = useCallback((payload: ErrorCreatedPayload) => {
    logger.info('Error: ' + JSON.stringify(payload));
    errorNotificationManager.showNotification(payload.message, payload.context);
  }, []);

  // Requirements: realtime-events.4.10
  const handleLLMPipelineDiagnostic = useCallback((payload: LLMPipelineDiagnosticPayload) => {
    const details = JSON.stringify(payload.details);
    const message = `LLM pipeline diagnostic (${payload.context}): ${payload.message}; details=${details}`;
    if (payload.level === 'warn') {
      logger.warn(message);
      return;
    }
    logger.error(message);
  }, []);

  // Requirements: realtime-events.4.12
  const handleMessageCreated = useCallback((payload: MessageCreatedPayload) => {
    const message = payload.message;
    if (message.kind === 'error') {
      const data =
        message.payload && typeof message.payload === 'object'
          ? (message.payload.data as Record<string, unknown> | undefined)
          : undefined;
      const errorInfo =
        data && typeof data['error'] === 'object' && data['error'] !== null
          ? (data['error'] as { message?: unknown })
          : undefined;
      const errorText =
        typeof errorInfo?.message === 'string' && errorInfo.message.length > 0
          ? errorInfo.message
          : 'Unknown error';
      logger.error(
        `Chat message created (kind:error, id:${message.id}, agentId:${message.agentId}): ${errorText}`
      );
      return;
    }

    logger.info(
      `Chat message created (kind:${message.kind}, id:${message.id}, agentId:${message.agentId})`
    );
  }, []);

  useEventSubscription(EVENT_TYPES.AUTH_CALLBACK_RECEIVED, handleAuthCallbackReceived);
  useEventSubscription(EVENT_TYPES.AUTH_COMPLETED, handleAuthCompleted);
  useEventSubscription(EVENT_TYPES.AUTH_FAILED, handleAuthFailed);
  useEventSubscription(EVENT_TYPES.AUTH_CANCELLED, handleAuthCancelled);
  useEventSubscription(EVENT_TYPES.AUTH_SIGNED_OUT, handleAuthSignedOut);
  useEventSubscription(EVENT_TYPES.ERROR_CREATED, handleErrorCreated);
  useEventSubscription(EVENT_TYPES.LLM_PIPELINE_DIAGNOSTIC, handleLLMPipelineDiagnostic);
  useEventSubscription(EVENT_TYPES.MESSAGE_CREATED, handleMessageCreated);

  // Requirements: error-notifications.2.7, error-notifications.2.8 - Global unhandled rejection handler
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.warn(
        `Unhandled rejection captured in renderer: ${describeUnhandledReason(event.reason)}`
      );

      if (isBenignCancellationReason(event.reason)) {
        logger.info(
          `Unhandled rejection filtered as cancellation: ${describeUnhandledReason(event.reason)}`
        );
        event.preventDefault();
        return;
      }

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

  const phase = appState?.phase ?? 'none';
  const isGlobalLoading =
    phase === 'authenticating' || phase === 'preparing-session' || phase === 'waiting-for-chats';

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

  return (
    <>
      {isGlobalLoading && <AppLoadingScreen />}
      <div
        className={`h-screen overflow-hidden bg-background${
          isGlobalLoading ? ' opacity-0 pointer-events-none select-none' : ''
        }`}
        data-testid="agents-screen"
        aria-hidden={isGlobalLoading}
      >
        <TopNavigation currentScreen={currentScreen} onNavigate={navigateToScreen} />
        <div className="h-full pt-16">
          <div
            className={`${currentScreen === 'agents' ? 'h-full' : 'opacity-0 pointer-events-none absolute inset-0'}`}
          >
            <Agents onNavigate={navigateToScreen} />
          </div>
          {currentScreen === 'settings' && (
            <Settings onSignOut={handleSignOut} onNavigate={navigateToScreen} />
          )}
          {currentScreen === 'error-demo' && (
            <ErrorDemoPage onBack={() => navigateToScreen('settings')} />
          )}
        </div>
      </div>
    </>
  );
}

// Requirements: agents.13.2, agents.13.10
function AppLoadingScreen() {
  return (
    <div
      data-testid="app-loading-screen"
      className="fixed inset-0 z-[200] bg-background flex items-center justify-center"
    >
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
