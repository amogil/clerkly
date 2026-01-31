export {};

type AuthResult = {
  success: boolean;
  error?: string;
};

declare global {
  interface Window {
    clerkly: {
      openGoogleAuth: () => Promise<AuthResult>;
      getAuthState: () => Promise<{ authorized: boolean }>;
      signOut: () => Promise<{ success: boolean }>;
      getSidebarState: () => Promise<{ collapsed: boolean }>;
      setSidebarState: (collapsed: boolean) => Promise<{ success: boolean }>;
      onAuthResult: (callback: (result: AuthResult) => void) => () => void;
    };
  }
}
