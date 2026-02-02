// Requirements: clerkly.1
import { useState } from 'react';
import { TopNavigation } from './components/top-navigation';
import { AIAgentPanel } from './components/ai-agent-panel';
import { DashboardUpdated } from './components/dashboard-updated';
import { CalendarView } from './components/calendar-view';
import { MeetingDetail } from './components/meeting-detail';
import { TasksViewNew } from './components/tasks-view-new';
import { Contacts } from './components/contacts';
import { Settings } from './components/settings';
import { AuthDemo } from './components/auth-demo';
import { parseCommand } from './utils/command-parser';

// Requirements: clerkly.1
export default function App() {
  // Show auth demo by default
  const [showAuthDemo, setShowAuthDemo] = useState(false);

  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [triggerAction, setTriggerAction] = useState<{ action: string; params: any } | null>(null);

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
  const handleSignOut = () => {
    setShowAuthDemo(true);
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

  // Show auth demo
  if (showAuthDemo) {
    return <AuthDemo onLoginSuccess={() => setShowAuthDemo(false)} />;
  }

  // Requirements: clerkly.1
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
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background pt-8">
      <TopNavigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <AIAgentPanel onCommand={handleCommand} />
      <div className="pt-24 pr-[33.333333%]">{renderScreen()}</div>
    </div>
  );
}
