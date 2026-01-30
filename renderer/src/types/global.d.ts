export {};

type AuthResult = {
  success: boolean;
  error?: string;
};

declare global {
  interface Window {
    clerkly: {
      openGoogleAuth: () => Promise<AuthResult>;
      onAuthResult: (callback: (result: AuthResult) => void) => () => void;
    };
  }
}
