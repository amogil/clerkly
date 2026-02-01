// Requirements: ui-cleanup.1.3, ui-cleanup.2.1, ui-cleanup.2.2, ui-cleanup.2.3, ui-cleanup.2.4, ui-cleanup.2.5, ui-cleanup.2.6, ui-cleanup.2.7
import { useEffect, useState } from "react";
import { AuthGate } from "./components/auth-gate";

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
  const [authState, setAuthState] = useState<AuthState>("authorizing");
  const [authError, setAuthError] = useState<string | null>(null);

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

  const handleSignOut = async () => {
    await window.clerkly.signOut();
    setAuthState("unauthorized");
    setAuthError(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {authState === "authorized" ? (
        <div className="min-h-screen bg-white" />
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
