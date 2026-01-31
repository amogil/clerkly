// Requirements: platform-foundation.3.3, platform-foundation.3.4
// Global type definitions for renderer process

import type { ClerklyAPI } from "./ipc";

export {};

declare global {
  interface Window {
    clerkly: ClerklyAPI;
  }
}
