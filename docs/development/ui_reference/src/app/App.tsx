import { useState } from "react";
import { Navigation } from "./components/navigation";
import { DashboardUpdated } from "./components/dashboard-updated";
import { CalendarView } from "./components/calendar-view";
import { MeetingDetail } from "./components/meeting-detail";
import { TasksNew } from "./components/tasks-new";
import { Contacts } from "./components/contacts";
import { Settings } from "./components/settings";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>("dashboard");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const handleNavigateToMeeting = (meetingId: string) => {
    setSelectedMeetingId(meetingId);
    setCurrentScreen("meeting-detail");
  };

  const handleBackToDashboard = () => {
    setSelectedMeetingId(null);
    setCurrentScreen("dashboard");
  };

  const handleNavigateToCalendar = () => {
    setCurrentScreen("calendar");
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case "dashboard":
        return (
          <DashboardUpdated
            onNavigateToMeeting={handleNavigateToMeeting}
            onNavigateToCalendar={handleNavigateToCalendar}
          />
        );
      case "calendar":
        return <CalendarView onNavigateToMeeting={handleNavigateToMeeting} />;
      case "meeting-detail":
        return (
          <MeetingDetail meetingId={selectedMeetingId || "1"} onBack={handleBackToDashboard} />
        );
      case "tasks":
        return <TasksNew />;
      case "contacts":
        return <Contacts />;
      case "settings":
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
      <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="ml-64">{renderScreen()}</div>
    </div>
  );
}
