// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, ui.8.1, ui.8.2, ui.8.3, ui.8.4, ui.7.1
import React, { useState, useEffect, useMemo } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider, useError } from './contexts/error-context';
import { TopNavigation } from './components/top-navigation';
import { AIAgentPanel } from './components/ai-agent-panel';
import { DashboardUpdated } from './components/dashboard-updated';
import { CalendarView } from './components/calendar-view';
import { MeetingDetail } from './components/meeting-detail';
import { TasksViewNew } from './components/tasks-view-new';
import { Contacts } from './components/contacts';
import { Triggers } from './components/triggers';
import { Settings } from './components/settings';
import { ErrorDemoPage } from './components/error-demo-page';
import { LoginScreen } from './components/auth/LoginScreen';
import { LoginError } from './components/auth/LoginError';
import { parseCommand } from './utils/command-parser';
import { SimpleRouter, NavigationManager, AuthGuard } from './navigation';
import { Logger } from './Logger';

// Requirements: clerkly.3.5, clerkly.3.7
const logger = Logger.create('App');

// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2, ui.8.1, ui.8.3, ui.8.4, ui.7.1
export default function App() {
  return (
    <ErrorProvider>
      <ErrorBoundary>
        <Toaster position="top-right" richColors closeButton duration={15000} />
        <AppContent />
      </ErrorBoundary>
    </ErrorProvider>
  );
}

function AppContent() {
  // Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<{ message: string; code?: string } | null>(null);
  // Requirements: ui.6.4 - State for synchronous profile loading during authorization
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Requirements: ui.7.1 - Use new error notification system
  const { showError } = useError();

  // Requirements: ui.8.1, ui.8.2, ui.8.3, ui.8.4
  // Create router, navigation manager, and auth guard
  const router = useMemo(() => {
    return new SimpleRouter(currentScreen, (route: string) => {
      // Map routes to screen names
      const screenMap: Record<string, string> = {
        '/login': 'login',
        '/dashboard': 'dashboard',
        '/calendar': 'calendar',
        '/tasks': 'tasks',
        '/contacts': 'contacts',
        '/settings': 'settings',
        '/triggers': 'triggers',
        '/error-demo': 'error-demo',
      };
      const screen = screenMap[route] || 'dashboard';
      setCurrentScreen(screen);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigationManager = useMemo(() => {
    return new NavigationManager(router);
  }, [router]);

  // Requirements: ui.8.2 - Create AuthGuard to protect routes
  const authGuard = useMemo(() => {
    return new AuthGuard(navigationManager);
  }, [navigationManager]);

  // Update router's current route when screen changes
  useEffect(() => {
    const routeMap: Record<string, string> = {
      login: '/login',
      dashboard: '/dashboard',
      calendar: '/calendar',
      tasks: '/tasks',
      contacts: '/contacts',
      settings: '/settings',
      triggers: '/triggers',
      'error-demo': '/error-demo',
    };
    const route = routeMap[currentScreen] || '/dashboard';
    router.updateCurrentRoute(route);
  }, [currentScreen, router]);

  // Requirements: ui.8.2 - Protected navigation function that checks access via AuthGuard
  const navigateToScreen = async (screen: string) => {
    // Map screen names to routes
    const routeMap: Record<string, string> = {
      login: '/login',
      dashboard: '/dashboard',
      calendar: '/calendar',
      tasks: '/tasks',
      contacts: '/contacts',
      settings: '/settings',
      triggers: '/triggers',
      'error-demo': '/error-demo',
      'meeting-detail': '/dashboard', // Meeting detail is part of dashboard
    };
    const route = routeMap[screen] || '/dashboard';

    // Check access through AuthGuard
    const canAccess = await authGuard.canActivate(route);

    if (canAccess) {
      setCurrentScreen(screen);
    }
    // If canAccess === false, AuthGuard already redirected to login
  };

  // Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2, ui.8.1, ui.8.3
  // Check authentication status on mount and initialize navigation
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const status = await window.api.auth.getStatus();
        setIsAuthorized(status.authorized);

        // Requirements: ui.8.1, ui.8.3 - Initialize navigation after auth check
        await navigationManager.initialize();
      } catch (error) {
        logger.error('[App] Failed to check auth status:', error);
        setIsAuthorized(false);
      }
    };

    checkAuthStatus();

    // Requirements: google-oauth-auth.8.4, ui.8.3, ui.6.4
    // Listen for auth success events and redirect to dashboard
    const unsubscribeAuthSuccess = window.api.auth.onAuthSuccess(() => {
      logger.info('[App] Auth success event received');
      // Requirements: ui.6.4 - Show loader during synchronous profile fetch
      // The profile is fetched synchronously in Main Process before this event is emitted
      // So by the time we receive this event, the profile is already loaded
      setIsLoadingProfile(false);
      setIsAuthorized(true);
      setAuthError(null);
      // Requirements: ui.8.3 - Redirect to dashboard after successful authentication
      navigationManager.redirectToDashboard();
    });

    // Requirements: google-oauth-auth.8.4, ui.6.4
    // Listen for auth error events
    const unsubscribeAuthError = window.api.auth.onAuthError(
      (error: string, errorCode?: string) => {
        logger.error('[App] Auth error event received:', { error, errorCode });
        logger.info('[App] Setting authError state and isAuthorized=false');
        // Requirements: ui.6.4 - Hide loader on error
        setIsLoadingProfile(false);
        setAuthError({ message: error, code: errorCode });
        setIsAuthorized(false);
        logger.info('[App] State updated, should trigger re-render');
      }
    );

    // Requirements: ui.6.8, ui.8.4
    // Listen for logout events and redirect to login
    const unsubscribeLogout = window.api.auth.onLogout(() => {
      logger.info('[App] Logout event received');
      setIsAuthorized(false);
      setAuthError(null);
      // Requirements: ui.8.4 - Redirect to login after logout
      navigationManager.redirectToLogin();
    });

    // Requirements: ui.7.1 - Listen for error notification events from Main Process
    const unsubscribeErrorNotify = window.api.error.onNotify((message: string, context: string) => {
      logger.info(`Error notification received: ${JSON.stringify({ message, context })}`);
      showError(`${context}: ${message}`);
    });

    return () => {
      unsubscribeAuthSuccess();
      unsubscribeAuthError();
      unsubscribeLogout();
      unsubscribeErrorNotify();
    };
  }, [navigationManager, showError]);

  // Requirements: clerkly.1
  const handleNavigateToMeeting = (meetingId: string) => {
    setSelectedMeetingId(meetingId);
    navigateToScreen('meeting-detail');
  };

  // Requirements: clerkly.1
  const handleBackToDashboard = () => {
    setSelectedMeetingId(null);
    navigateToScreen('dashboard');
  };

  // Requirements: clerkly.1
  const handleNavigateToCalendar = () => {
    navigateToScreen('calendar');
  };

  // Requirements: clerkly.1
  const handleNavigateToTasks = () => {
    navigateToScreen('tasks');
  };

  // Requirements: clerkly.1, google-oauth-auth.12.3, ui.6.4
  const handleLogin = async () => {
    try {
      setAuthError(null);
      // Requirements: ui.6.4 - Show loader during authorization and profile fetch
      setIsLoadingProfile(true);
      const result = await window.api.auth.startLogin();
      if (!result.success) {
        setIsLoadingProfile(false);
        setAuthError({ message: result.error || 'Failed to start login' });
      }
      // Note: If success, loader will be hidden by auth:success or auth:error event
    } catch (error) {
      logger.error('[App] Login failed:', error);
      setIsLoadingProfile(false);
      setAuthError({ message: 'Failed to start login' });
    }
  };

  // Requirements: clerkly.1, google-oauth-auth.8.3
  const handleSignOut = async () => {
    try {
      await window.api.auth.logout();
      setIsAuthorized(false);
      setAuthError(null);
    } catch (error) {
      logger.error('[App] Logout failed:', error);
    }
  };

  // Requirements: clerkly.1
  const handleCommand = (command: string) => {
    const parsed = parseCommand(command);

    // Handle navigation
    if (parsed.action === 'navigate' && parsed.entity === 'screen') {
      navigateToScreen(parsed.params.screen as string);
    }

    // Handle entity creation/manipulation
    if (parsed.action === 'create') {
      if (parsed.entity === 'project' || parsed.entity === 'task') {
        navigateToScreen('tasks');
      } else if (parsed.entity === 'contact') {
        navigateToScreen('contacts');
      }
    }

    // Handle show commands
    if (parsed.action === 'show') {
      if (parsed.entity === 'task') {
        navigateToScreen('tasks');
      }
    }
  };

  // Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2
  // Show loading state while checking auth
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

  // Requirements: ui.6.4 - Show loader during synchronous profile fetch
  // This loader is shown after OAuth success but before profile is loaded
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Requirements: google-oauth-auth.12.5, ui.6.4
  // Show error screen if authentication failed (including profile fetch failure)
  if (authError) {
    return (
      <LoginError
        errorMessage={authError.message}
        errorCode={authError.code}
        onRetry={() => {
          setAuthError(null);
          handleLogin();
        }}
      />
    );
  }

  // Requirements: google-oauth-auth.12.2
  // Show login screen if not authorized
  if (!isAuthorized) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Requirements: clerkly.1
  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <DashboardUpdated
            onNavigateToMeeting={handleNavigateToMeeting}
            onNavigateToCalendar={handleNavigateToCalendar}
            onNavigateToTasks={handleNavigateToTasks}
          />
        );
      case 'calendar':
        return <CalendarView onNavigateToMeeting={handleNavigateToMeeting} />;
      case 'meeting-detail':
        return (
          <MeetingDetail meetingId={selectedMeetingId || '1'} onBack={handleBackToDashboard} />
        );
      case 'tasks':
        return <TasksViewNew />;
      case 'contacts':
        return <Contacts />;
      case 'triggers':
        return <Triggers />;
      case 'settings':
        return <Settings onSignOut={handleSignOut} onNavigate={navigateToScreen} />;
      case 'error-demo':
        return <ErrorDemoPage onBack={() => navigateToScreen('settings')} />;
      default:
        return (
          <DashboardUpdated
            onNavigateToMeeting={handleNavigateToMeeting}
            onNavigateToCalendar={handleNavigateToCalendar}
            onNavigateToTasks={handleNavigateToTasks}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation currentScreen={currentScreen} onNavigate={navigateToScreen} />
      <AIAgentPanel onCommand={handleCommand} />
      <div className="pt-16 pr-[33.333333%]">{renderScreen()}</div>
    </div>
  );
}
