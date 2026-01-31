// Requirements: E.T.4, E.U.1, E.U.6, E.U.7, E.S.7, E.I.3, E.A.1, E.A.2, E.A.3, E.A.4, E.A.5, E.A.11, E.A.14, E.A.22
import { useEffect, useState } from "react";
import { AuthGate } from "./components/auth-gate";
import { Navigation } from "./components/navigation";
import { DashboardUpdated } from "./components/dashboard-updated";
import { CalendarView } from "./components/calendar-view";
import { MeetingDetail } from "./components/meeting-detail";
import { TasksNew } from "./components/tasks-new";
import { Contacts } from "./components/contacts";
import { Settings } from "./components/settings";

type AuthState = "unauthorized" | "authorizing" | "authorized" | "error";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>("dashboard");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("authorizing");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    window.clerkly
      .getAuthState()
      .then((state) => {
        setAuthState(state.authorized ? "authorized" : "unauthorized");
      })
      .catch(() => {
        setAuthState("unauthorized");
      });

    const unsubscribe = window.clerkly.onAuthResult((result) => {
      if (result.success) {
        setAuthState("authorized");
        setAuthError(null);
        return;
      }

      setAuthError(result.error ?? "Authorization failed. Please try again.");
      setAuthState("error");
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.clerkly
      .getSidebarState()
      .then((state) => {
        setIsSidebarCollapsed(Boolean(state.collapsed));
      })
      .catch(() => {
        setIsSidebarCollapsed(false);
      });
  }, []);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthState("authorizing");

    try {
      const result = await window.clerkly.openGoogleAuth();

      if (!result.success) {
        setAuthError(result.error ?? "Authorization failed. Please try again.");
        setAuthState("error");
        return;
      }

      setAuthState((prev) => (prev === "authorizing" ? "unauthorized" : prev));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authorization failed. Please try again.";
      setAuthError(message);
      setAuthState("error");
    }
  };

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

  const handleSignOut = async () => {
    await window.clerkly.signOut();
    setAuthState("unauthorized");
    setAuthError(null);
    setCurrentScreen("dashboard");
    setSelectedMeetingId(null);
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

  const handleToggleSidebar = async () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    await window.clerkly.setSidebarState(next);
  };

  return (
    <div className="min-h-screen bg-background">
      {authState === "authorized" ? (
        <>
          <Navigation
            currentScreen={currentScreen}
            onNavigate={setCurrentScreen}
            collapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
          />
          <div className={isSidebarCollapsed ? "ml-20" : "ml-64"}>{renderScreen()}</div>
        </>
      ) : (
        <AuthGate
          isAuthorizing={authState === "authorizing"}
          errorMessage={authError}
          onSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
