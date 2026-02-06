// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2
import { useState, useEffect } from 'react';
import { TopNavigation } from './components/top-navigation';
import { AIAgentPanel } from './components/ai-agent-panel';
import { DashboardUpdated } from './components/dashboard-updated';
import { CalendarView } from './components/calendar-view';
import { MeetingDetail } from './components/meeting-detail';
import { TasksViewNew } from './components/tasks-view-new';
import { Contacts } from './components/contacts';
import { Settings } from './components/settings';
import { LoginScreen } from './components/auth/LoginScreen';
import { LoginError } from './components/auth/LoginError';
import { parseCommand } from './utils/command-parser';

// Requirements: clerkly.1, google-oauth-auth.12.1, google-oauth-auth.12.2
export default function App() {
  // Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<{ message: string; code?: string } | null>(null);

  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [triggerAction, setTriggerAction] = useState<{
    action: string;
    params: Record<string, unknown>;
  } | null>(null);

  // Requirements: google-oauth-auth.12.1, google-oauth-auth.12.2
  // Check authentication status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const status = await window.api.auth.getStatus();
        setIsAuthorized(status.authorized);
      } catch (error) {
        console.error('[App] Failed to check auth status:', error);
        setIsAuthorized(false);
      }
    };

    checkAuthStatus();

    // Requirements: google-oauth-auth.8.4
    // Listen for auth success events
    window.api.auth.onAuthSuccess(() => {
      setIsAuthorized(true);
      setAuthError(null);
    });

    // Requirements: google-oauth-auth.8.4
    // Listen for auth error events
    window.api.auth.onAuthError((error: string, errorCode?: string) => {
      console.error('[App] Auth error:', error, errorCode);
      setAuthError({ message: error, code: errorCode });
      setIsAuthorized(false);
    });

    // Requirements: ui.6.8
    // Listen for logout events
    window.api.auth.onLogout(() => {
      console.log('[App] Logout event received');
      setIsAuthorized(false);
      setAuthError(null);
    });
  }, []);

  // Requirements: clerkly.1
  const handleNavigateToMeeting = (meetingId: string) => {
    setSelectedMeetingId(meetingId);
    setCurrentScreen('meeting-detail');
  };

  // Requirements: clerkly.1
  const handleBackToDashboard = () => {
    setSelectedMeetingId(null);
    setCurrentScreen('dashboard');
  };

  // Requirements: clerkly.1
  const handleNavigateToCalendar = () => {
    setCurrentScreen('calendar');
  };

  // Requirements: clerkly.1
  const handleNavigateToTasks = () => {
    setCurrentScreen('tasks');
  };

  // Requirements: clerkly.1, google-oauth-auth.12.3
  const handleLogin = async () => {
    try {
      setAuthError(null);
      const result = await window.api.auth.startLogin();
      if (!result.success) {
        setAuthError({ message: result.error || 'Failed to start login' });
      }
    } catch (error) {
      console.error('[App] Login failed:', error);
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
      console.error('[App] Logout failed:', error);
    }
  };

  // Requirements: clerkly.1
  const handleCommand = (command: string) => {
    const parsed = parseCommand(command);

    // Handle navigation
    if (parsed.action === 'navigate' && parsed.entity === 'screen') {
      setCurrentScreen(parsed.params.screen);
    }

    // Handle entity creation/manipulation
    if (parsed.action === 'create') {
      if (parsed.entity === 'project' || parsed.entity === 'task') {
        setCurrentScreen('tasks');
      } else if (parsed.entity === 'contact') {
        setCurrentScreen('contacts');
      }

      // Trigger the action in the respective component
      setTriggerAction({
        action: parsed.action,
        params: { entity: parsed.entity, ...parsed.params },
      });

      // Reset trigger after a short delay
      setTimeout(() => setTriggerAction(null), 100);
    }

    // Handle show commands
    if (parsed.action === 'show') {
      if (parsed.entity === 'task') {
        setCurrentScreen('tasks');
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

  // Requirements: google-oauth-auth.12.5
  // Show error screen if authentication failed
  if (authError) {
    return (
      <LoginError
        error={authError.message}
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
        return <TasksViewNew triggerAction={triggerAction} />;
      case 'contacts':
        return <Contacts triggerAction={triggerAction} />;
      case 'settings':
        return <Settings onSignOut={handleSignOut} />;
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
      <TopNavigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <AIAgentPanel onCommand={handleCommand} />
      <div className="pt-16 pr-[33.333333%]">{renderScreen()}</div>
    </div>
  );
}
