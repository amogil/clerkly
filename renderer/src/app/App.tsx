// Requirements: E.G.11, E.G.12, E.G.14, E.G.15, E.G.16, E.G.17, E.G.18
import { useState } from 'react';
import { AuthGate } from './components/auth-gate';
import { Navigation } from './components/navigation';
import { DashboardUpdated } from './components/dashboard-updated';
import { CalendarView } from './components/calendar-view';
import { MeetingDetail } from './components/meeting-detail';
import { TasksNew } from './components/tasks-new';
import { Contacts } from './components/contacts';
import { Settings } from './components/settings';

type AuthState = 'unauthorized' | 'authorizing' | 'authorized' | 'error';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('unauthorized');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthState('authorizing');

    try {
      const result = await window.clerkly.openGoogleAuth();

      if (result.success) {
        setAuthState('authorized');
        return;
      }

      setAuthError(result.error ?? 'Authorization failed. Please try again.');
      setAuthState('error');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authorization failed. Please try again.';
      setAuthError(message);
      setAuthState('error');
    }
  };

  const handleNavigateToMeeting = (meetingId: string) => {
    setSelectedMeetingId(meetingId);
    setCurrentScreen('meeting-detail');
  };

  const handleBackToDashboard = () => {
    setSelectedMeetingId(null);
    setCurrentScreen('dashboard');
  };

  const handleNavigateToCalendar = () => {
    setCurrentScreen('calendar');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <DashboardUpdated
            onNavigateToMeeting={handleNavigateToMeeting}
            onNavigateToCalendar={handleNavigateToCalendar}
          />
        );
      case 'calendar':
        return <CalendarView onNavigateToMeeting={handleNavigateToMeeting} />;
      case 'meeting-detail':
        return (
          <MeetingDetail
            meetingId={selectedMeetingId || '1'}
            onBack={handleBackToDashboard}
          />
        );
      case 'tasks':
        return <TasksNew />;
      case 'contacts':
        return <Contacts />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <DashboardUpdated
            onNavigateToMeeting={handleNavigateToMeeting}
            onNavigateToCalendar={handleNavigateToCalendar}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {authState === 'authorized' ? (
        <>
          <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
          <div className="ml-64">{renderScreen()}</div>
        </>
      ) : (
        <AuthGate
          isAuthorizing={authState === 'authorizing'}
          errorMessage={authError}
          onSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
