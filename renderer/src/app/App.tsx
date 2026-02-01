// Requirements: E.T.4, E.U.1, E.U.6, E.U.7, E.S.7, E.I.3, E.A.1, E.A.2, E.A.3, E.A.4, E.A.5, E.A.11, E.A.14, E.A.22, E.A.27, sidebar-navigation.4.1, sidebar-navigation.4.3, sidebar-navigation.4.4
import { useEffect, useLayoutEffect, useState } from "react";
import { AuthGate } from "./components/auth-gate";
import { Navigation } from "./components/navigation";
import { DashboardUpdated } from "./components/dashboard-updated";
import { CalendarView } from "./components/calendar-view";
import { MeetingDetail } from "./components/meeting-detail";
import { TasksNew } from "./components/tasks-new";
import { Contacts } from "./components/contacts";
import { Settings } from "./components/settings";

type AuthState = "unauthorized" | "authorizing" | "authorized" | "error";
const mapAuthErrorMessage = (error?: string | null): string | null => {
  if (!error) {
    return null;
  }
  const normalized = error.trim().toLowerCase();
  if (normalized === "access_denied") {
    return "Authorization was canceled. Please try again.";
  }
  return error;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<string>("dashboard");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("authorizing");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Requirements: sidebar-navigation.4.4
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);

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

      setAuthError(mapAuthErrorMessage(result.error) ?? "Authorization failed. Please try again.");
      setAuthState("error");
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Requirements: sidebar-navigation.4.1, sidebar-navigation.4.3, sidebar-navigation.4.4
  // Load sidebar state before first render to prevent UI flickering
  useLayoutEffect(() => {
    window.clerkly
      .getSidebarState()
      .then((state) => {
        // Requirements: sidebar-navigation.4.1
        setIsSidebarCollapsed(Boolean(state.collapsed));
      })
      .catch((error) => {
        // Requirements: sidebar-navigation.4.3
        // Fallback to default expanded state on error
        console.error("Failed to load sidebar state:", error);
        setIsSidebarCollapsed(false);
      })
      .finally(() => {
        // Requirements: sidebar-navigation.4.4
        setIsSidebarLoading(false);
      });
  }, []);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthState("authorizing");

    try {
      const result = await window.clerkly.openGoogleAuth();

      if (!result.success) {
        setAuthError(
          mapAuthErrorMessage(result.error) ?? "Authorization failed. Please try again.",
        );
        setAuthState("error");
        return;
      }

      setAuthState((prev) => (prev === "authorizing" ? "unauthorized" : prev));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authorization failed. Please try again.";
      setAuthError(mapAuthErrorMessage(message) ?? message);
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

  // Requirements: sidebar-navigation.4.2, sidebar-navigation.5.2
  const handleToggleSidebar = async () => {
    const newState = !isSidebarCollapsed;

    // Optimistic UI update
    setIsSidebarCollapsed(newState);

    try {
      // Immediately save to database via IPC
      const result = await window.clerkly.setSidebarState(newState);

      if (!result.success) {
        // Rollback UI state on save error
        setIsSidebarCollapsed(!newState);
        console.error("Failed to save sidebar state");
      }
    } catch (error) {
      // Rollback UI state on IPC/network error
      setIsSidebarCollapsed(!newState);
      console.error("Failed to save sidebar state:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {authState === "authorized" ? (
        <>
          {/* Requirements: sidebar-navigation.4.4 - Prevent UI flickering during sidebar state load */}
          {!isSidebarLoading && (
            <>
              <Navigation
                currentScreen={currentScreen}
                onNavigate={setCurrentScreen}
                collapsed={isSidebarCollapsed}
                onToggleCollapse={handleToggleSidebar}
              />
              <div className={isSidebarCollapsed ? "ml-20" : "ml-64"}>{renderScreen()}</div>
            </>
          )}
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
