import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Toaster } from 'sonner';
import { ErrorProvider } from './contexts/error-context';
import { TasksProvider } from './contexts/tasks-context';
import { ContactsProvider } from './contexts/contacts-context';
import { ErrorBoundary } from './components/error-boundary';
import { ErrorDemoPage } from './components/error-demo-page';
import { TopNavigation } from './components/top-navigation';
import { DashboardUpdated } from './components/dashboard-updated';
import { CalendarView } from './components/calendar-view';
import { MeetingDetail } from './components/meeting-detail';
import { TasksViewNew } from './components/tasks-view-new';
import { Contacts } from './components/contacts';
import { Triggers } from './components/triggers';
import { Agents } from './components/agents';
import { Settings } from './components/settings';
import { AuthDemo } from './components/auth-demo';
import { parseCommand } from './utils/command-parser';

function MainApp() {
  const [showAuthDemo, setShowAuthDemo] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<string>('agents');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [triggerAction, setTriggerAction] = useState<{ action: string; params: any } | null>(null);

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

  const handleNavigateToTasks = () => {
    setCurrentScreen('tasks');
  };

  const handleSignOut = () => {
    setShowAuthDemo(true);
  };

  const handleCommand = (command: string) => {
    const parsed = parseCommand(command);
    
    if (parsed.action === 'navigate' && parsed.entity === 'screen') {
      setCurrentScreen(parsed.params.screen);
    }
    
    if (parsed.action === 'create') {
      if (parsed.entity === 'project' || parsed.entity === 'task') {
        setCurrentScreen('tasks');
      } else if (parsed.entity === 'contact') {
        setCurrentScreen('contacts');
      }
      
      setTriggerAction({ action: parsed.action, params: { entity: parsed.entity, ...parsed.params } });
      setTimeout(() => setTriggerAction(null), 100);
    }
    
    if (parsed.action === 'show') {
      if (parsed.entity === 'task') {
        setCurrentScreen('tasks');
      }
    }
  };

  if (showAuthDemo) {
    return <AuthDemo onLoginSuccess={() => setShowAuthDemo(false)} />;
  }

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
          <MeetingDetail
            meetingId={selectedMeetingId || '1'}
            onBack={handleBackToDashboard}
          />
        );
      case 'tasks':
        return <TasksViewNew triggerAction={triggerAction} />;
      case 'contacts':
        return <Contacts triggerAction={triggerAction} />;
      case 'triggers':
        return <Triggers />;
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
      <TasksProvider>
        <ContactsProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <Toaster position="top-right" richColors closeButton />
              <Routes>
                <Route path="/" element={<MainApp />} />
                <Route path="/error-demo" element={<ErrorDemoPage />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </ContactsProvider>
      </TasksProvider>
    </ErrorProvider>
  );
}
