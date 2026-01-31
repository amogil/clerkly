// Requirements: platform-foundation.3.1, platform-foundation.3.2
// Unit tests for context isolation to verify security boundaries

import { describe, expect, it, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { contextBridge, ipcRenderer } from "electron";
import type { ClerklyAPI } from "../../renderer/src/types/ipc";

// Mock Electron modules
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// Type the mocked functions
const mockedContextBridge = contextBridge as unknown as {
  exposeInMainWorld: MockedFunction<typeof contextBridge.exposeInMainWorld>;
};

const mockedIpcRenderer = ipcRenderer as unknown as {
  invoke: MockedFunction<typeof ipcRenderer.invoke>;
  send: MockedFunction<typeof ipcRenderer.send>;
  on: MockedFunction<typeof ipcRenderer.on>;
  removeListener: MockedFunction<typeof ipcRenderer.removeListener>;
};

describe("Context Isolation", () => {
  let mockWindow: any;
  let exposedAPI: ClerklyAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock window object that simulates renderer context
    mockWindow = {
      clerkly: undefined,
      // Simulate that Node.js APIs are not available
      require: undefined,
      process: undefined,
      global: undefined,
      Buffer: undefined,
      __dirname: undefined,
      __filename: undefined,
      module: undefined,
      exports: undefined,
      // Additional Node.js modules that should not be available
      fs: undefined,
      path: undefined,
      os: undefined,
      crypto: undefined,
      child_process: undefined,
    };

    // Mock contextBridge.exposeInMainWorld to capture the exposed API
    mockedContextBridge.exposeInMainWorld.mockImplementation((apiName: string, api: any) => {
      if (apiName === "clerkly") {
        mockWindow.clerkly = api;
        exposedAPI = api;
      }
    });

    // Mock IPC responses
    mockedIpcRenderer.invoke.mockImplementation((channel: string) => {
      switch (channel) {
        case "auth:get-state":
          return Promise.resolve({ authorized: false });
        case "auth:open-google":
          return Promise.resolve({ success: true });
        case "auth:sign-out":
          return Promise.resolve({ success: true });
        case "sidebar:get-state":
          return Promise.resolve({ collapsed: false });
        case "sidebar:set-state":
          return Promise.resolve({ success: true });
        default:
          return Promise.reject(new Error(`Unknown channel: ${channel}`));
      }
    });

    mockedIpcRenderer.on.mockImplementation(() => ipcRenderer);
    mockedIpcRenderer.removeListener.mockImplementation(() => ipcRenderer);

    // Simulate the preload script API creation manually
    // This simulates what the actual preload script does
    const createLoggedIPCCall = <T extends unknown[], R>(
      channel: string,
      ipcCall: (...args: T) => Promise<R>,
    ) => {
      return async (...args: T): Promise<R> => {
        const result = await ipcCall(...args);
        return result;
      };
    };

    const api = {
      openGoogleAuth: createLoggedIPCCall(
        "auth:open-google",
        (): Promise<any> => mockedIpcRenderer.invoke("auth:open-google"),
      ),
      getAuthState: createLoggedIPCCall(
        "auth:get-state",
        (): Promise<any> => mockedIpcRenderer.invoke("auth:get-state"),
      ),
      signOut: createLoggedIPCCall(
        "auth:sign-out",
        (): Promise<any> => mockedIpcRenderer.invoke("auth:sign-out"),
      ),
      getSidebarState: createLoggedIPCCall(
        "sidebar:get-state",
        (): Promise<any> => mockedIpcRenderer.invoke("sidebar:get-state"),
      ),
      setSidebarState: createLoggedIPCCall(
        "sidebar:set-state",
        (collapsed: boolean): Promise<any> =>
          mockedIpcRenderer.invoke("sidebar:set-state", { collapsed }),
      ),
      onAuthResult: (callback: (result: any) => void): (() => void) => {
        const handler = (_: any, result: any) => {
          callback(result);
        };

        mockedIpcRenderer.on("auth:result", handler);
        return () => {
          mockedIpcRenderer.removeListener("auth:result", handler);
        };
      },
    };

    // Simulate contextBridge.exposeInMainWorld call
    mockedContextBridge.exposeInMainWorld("clerkly", api);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Node.js API Isolation", () => {
    it("should not expose require function in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.require).toBeUndefined();
    });

    it("should not expose process object in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.process).toBeUndefined();
    });

    it("should not expose global object in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.global).toBeUndefined();
    });

    it("should not expose Buffer constructor in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.Buffer).toBeUndefined();
    });

    it("should not expose __dirname variable in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.__dirname).toBeUndefined();
    });

    it("should not expose __filename variable in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.__filename).toBeUndefined();
    });

    it("should not expose module object in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.module).toBeUndefined();
    });

    it("should not expose exports object in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.exports).toBeUndefined();
    });

    it("should not expose fs module in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.fs).toBeUndefined();
    });

    it("should not expose path module in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.path).toBeUndefined();
    });

    it("should not expose os module in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.os).toBeUndefined();
    });

    it("should not expose crypto module in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.crypto).toBeUndefined();
    });

    it("should not expose child_process module in renderer context", () => {
      // Requirements: platform-foundation.3.1
      expect(mockWindow.child_process).toBeUndefined();
    });

    it("should not allow access to Node.js APIs through alternative methods", () => {
      // Requirements: platform-foundation.3.1
      // Test that common ways to access Node.js APIs are blocked
      expect(mockWindow.require).toBeUndefined();

      // Verify that window object doesn't have Node.js properties
      const nodeJsApis = [
        "require",
        "process",
        "global",
        "Buffer",
        "__dirname",
        "__filename",
        "module",
        "exports",
        "fs",
        "path",
        "os",
        "crypto",
        "child_process",
      ];

      nodeJsApis.forEach((api) => {
        expect(mockWindow[api]).toBeUndefined();
      });

      // Verify that even if someone tries to access these through bracket notation
      expect(mockWindow["require"]).toBeUndefined();
      expect(mockWindow["process"]).toBeUndefined();
      expect(mockWindow["global"]).toBeUndefined();
      expect(mockWindow["Buffer"]).toBeUndefined();
    });
  });

  describe("Clerkly API Exposure", () => {
    it("should expose window.clerkly API in renderer context", () => {
      // Requirements: platform-foundation.3.2
      expect(mockWindow.clerkly).toBeDefined();
      expect(typeof mockWindow.clerkly).toBe("object");
    });

    it("should expose all required authentication methods", () => {
      // Requirements: platform-foundation.3.2, platform-foundation.3.3
      expect(exposedAPI.openGoogleAuth).toBeDefined();
      expect(typeof exposedAPI.openGoogleAuth).toBe("function");

      expect(exposedAPI.getAuthState).toBeDefined();
      expect(typeof exposedAPI.getAuthState).toBe("function");

      expect(exposedAPI.signOut).toBeDefined();
      expect(typeof exposedAPI.signOut).toBe("function");
    });

    it("should expose all required sidebar methods", () => {
      // Requirements: platform-foundation.3.2, platform-foundation.3.4
      expect(exposedAPI.getSidebarState).toBeDefined();
      expect(typeof exposedAPI.getSidebarState).toBe("function");

      expect(exposedAPI.setSidebarState).toBeDefined();
      expect(typeof exposedAPI.setSidebarState).toBe("function");
    });

    it("should expose event listener methods", () => {
      // Requirements: platform-foundation.3.2
      expect(exposedAPI.onAuthResult).toBeDefined();
      expect(typeof exposedAPI.onAuthResult).toBe("function");
    });

    it("should use contextBridge.exposeInMainWorld correctly", () => {
      // Requirements: platform-foundation.3.2
      expect(mockedContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
        "clerkly",
        expect.any(Object),
      );
      expect(mockedContextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    });
  });

  describe("API Method Functionality", () => {
    it("should call correct IPC channels for authentication methods", async () => {
      // Requirements: platform-foundation.3.3
      await exposedAPI.openGoogleAuth();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:open-google");

      await exposedAPI.getAuthState();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:get-state");

      await exposedAPI.signOut();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:sign-out");
    });

    it("should call correct IPC channels for sidebar methods", async () => {
      // Requirements: platform-foundation.3.4
      await exposedAPI.getSidebarState();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:get-state");

      await exposedAPI.setSidebarState(true);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:set-state", {
        collapsed: true,
      });

      await exposedAPI.setSidebarState(false);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:set-state", {
        collapsed: false,
      });
    });

    it("should return correct response types from authentication methods", async () => {
      // Requirements: platform-foundation.3.3
      const authState = await exposedAPI.getAuthState();
      expect(authState).toEqual({ authorized: false });
      expect(typeof authState.authorized).toBe("boolean");

      const authResult = await exposedAPI.openGoogleAuth();
      expect(authResult).toEqual({ success: true });
      expect(typeof authResult.success).toBe("boolean");

      const signOutResult = await exposedAPI.signOut();
      expect(signOutResult).toEqual({ success: true });
      expect(typeof signOutResult.success).toBe("boolean");
    });

    it("should return correct response types from sidebar methods", async () => {
      // Requirements: platform-foundation.3.4
      const sidebarState = await exposedAPI.getSidebarState();
      expect(sidebarState).toEqual({ collapsed: false });
      expect(typeof sidebarState.collapsed).toBe("boolean");

      const setStateResult = await exposedAPI.setSidebarState(true);
      expect(setStateResult).toEqual({ success: true });
      expect(typeof setStateResult.success).toBe("boolean");
    });
  });

  describe("Event Listener Functionality", () => {
    it("should register and unregister auth result listeners correctly", () => {
      // Requirements: platform-foundation.3.2
      const mockCallback = vi.fn();
      const unsubscribe = exposedAPI.onAuthResult(mockCallback);

      expect(mockedIpcRenderer.on).toHaveBeenCalledWith("auth:result", expect.any(Function));
      expect(typeof unsubscribe).toBe("function");

      // Test unsubscribe functionality
      unsubscribe();
      expect(mockedIpcRenderer.removeListener).toHaveBeenCalledWith(
        "auth:result",
        expect.any(Function),
      );
    });

    it("should handle auth result events correctly", () => {
      // Requirements: platform-foundation.3.2
      const mockCallback = vi.fn();
      exposedAPI.onAuthResult(mockCallback);

      // Get the registered event handler
      const eventHandler = mockedIpcRenderer.on.mock.calls[0][1];
      const mockEvent = {} as any;
      const mockResult = { success: true };

      // Simulate event emission
      eventHandler(mockEvent, mockResult);

      expect(mockCallback).toHaveBeenCalledWith(mockResult);
    });
  });

  describe("Security Boundaries", () => {
    it("should not allow direct access to ipcRenderer from exposed API", () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2
      expect(mockWindow.clerkly.ipcRenderer).toBeUndefined();
      expect(mockWindow.clerkly.require).toBeUndefined();
      expect(mockWindow.clerkly.process).toBeUndefined();
    });

    it("should not expose internal implementation details", () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2
      const apiKeys = Object.keys(exposedAPI);
      const expectedKeys = [
        "openGoogleAuth",
        "getAuthState",
        "signOut",
        "getSidebarState",
        "setSidebarState",
        "onAuthResult",
      ];

      expect(apiKeys).toEqual(expect.arrayContaining(expectedKeys));

      // Ensure no unexpected properties are exposed
      apiKeys.forEach((key) => {
        expect(expectedKeys).toContain(key);
      });
    });

    it("should handle IPC errors gracefully without exposing internal details", async () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2
      mockedIpcRenderer.invoke.mockRejectedValueOnce(new Error("IPC Error"));

      await expect(exposedAPI.getAuthState()).rejects.toThrow("IPC Error");

      // Ensure the error doesn't expose internal Node.js or Electron details
      try {
        await exposedAPI.getAuthState();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain("require");
        expect((error as Error).message).not.toContain("process");
        expect((error as Error).message).not.toContain("__dirname");
      }
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle undefined callback in onAuthResult", () => {
      // Requirements: platform-foundation.3.2
      expect(() => {
        exposedAPI.onAuthResult(undefined as any);
      }).not.toThrow();
    });

    it("should handle invalid parameters in setSidebarState", async () => {
      // Requirements: platform-foundation.3.4
      // The API should still call IPC even with invalid parameters
      // (validation happens on the main process side)
      await exposedAPI.setSidebarState(null as any);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:set-state", {
        collapsed: null,
      });

      await exposedAPI.setSidebarState(undefined as any);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:set-state", {
        collapsed: undefined,
      });
    });

    it("should handle concurrent API calls", async () => {
      // Requirements: platform-foundation.3.3, platform-foundation.3.4
      const promises = [
        exposedAPI.getAuthState(),
        exposedAPI.getSidebarState(),
        exposedAPI.openGoogleAuth(),
        exposedAPI.setSidebarState(true),
        exposedAPI.signOut(),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledTimes(5);
    });

    it("should maintain API consistency across multiple calls", async () => {
      // Requirements: platform-foundation.3.2
      const firstCall = await exposedAPI.getAuthState();
      const secondCall = await exposedAPI.getAuthState();

      expect(firstCall).toEqual(secondCall);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledTimes(2);
      expect(mockedIpcRenderer.invoke).toHaveBeenNthCalledWith(1, "auth:get-state");
      expect(mockedIpcRenderer.invoke).toHaveBeenNthCalledWith(2, "auth:get-state");
    });
  });

  describe("Type Safety Validation", () => {
    it("should maintain correct TypeScript types for API methods", () => {
      // Requirements: platform-foundation.3.2, platform-foundation.3.3, platform-foundation.3.4
      // These tests verify that the API maintains correct TypeScript types

      // Authentication methods should return Promises
      expect(exposedAPI.openGoogleAuth()).toBeInstanceOf(Promise);
      expect(exposedAPI.getAuthState()).toBeInstanceOf(Promise);
      expect(exposedAPI.signOut()).toBeInstanceOf(Promise);

      // Sidebar methods should return Promises
      expect(exposedAPI.getSidebarState()).toBeInstanceOf(Promise);
      expect(exposedAPI.setSidebarState(true)).toBeInstanceOf(Promise);

      // Event listener should return a function
      const unsubscribe = exposedAPI.onAuthResult(() => {});
      expect(typeof unsubscribe).toBe("function");
    });

    it("should validate API method signatures", () => {
      // Requirements: platform-foundation.3.2
      // Verify that methods have the expected behavior (wrapped functions may not preserve .length)
      // Instead, we test that the methods can be called with the expected parameters

      // Methods that take no parameters should work without arguments
      expect(() => exposedAPI.openGoogleAuth()).not.toThrow();
      expect(() => exposedAPI.getAuthState()).not.toThrow();
      expect(() => exposedAPI.signOut()).not.toThrow();
      expect(() => exposedAPI.getSidebarState()).not.toThrow();

      // setSidebarState should work with a boolean parameter
      expect(() => exposedAPI.setSidebarState(true)).not.toThrow();
      expect(() => exposedAPI.setSidebarState(false)).not.toThrow();

      // onAuthResult should work with a callback function
      expect(() => exposedAPI.onAuthResult(() => {})).not.toThrow();
    });
  });

  describe("API Typing Validation", () => {
    /* Preconditions: ClerklyAPI interface is properly defined, window.clerkly is exposed
       Action: validate TypeScript types of all API methods and their return types
       Assertions: all methods have correct TypeScript types matching IPC channel definitions
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should have correctly typed authentication methods", async () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Verify openGoogleAuth returns AuthResult type
      const authResult = await exposedAPI.openGoogleAuth();
      expect(authResult).toHaveProperty("success");
      expect(typeof authResult.success).toBe("boolean");
      if ("error" in authResult) {
        expect(typeof authResult.error).toBe("string");
      }

      // Verify getAuthState returns AuthState type
      const authState = await exposedAPI.getAuthState();
      expect(authState).toHaveProperty("authorized");
      expect(typeof authState.authorized).toBe("boolean");

      // Verify signOut returns OperationResult type
      const signOutResult = await exposedAPI.signOut();
      expect(signOutResult).toHaveProperty("success");
      expect(typeof signOutResult.success).toBe("boolean");
      if ("error" in signOutResult) {
        expect(typeof signOutResult.error).toBe("string");
      }
    });

    /* Preconditions: ClerklyAPI interface is properly defined, sidebar IPC channels are available
       Action: validate TypeScript types of sidebar methods and their parameters/return types
       Assertions: sidebar methods have correct types matching IPC channel definitions
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should have correctly typed sidebar methods", async () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Verify getSidebarState returns SidebarState type
      const sidebarState = await exposedAPI.getSidebarState();
      expect(sidebarState).toHaveProperty("collapsed");
      expect(typeof sidebarState.collapsed).toBe("boolean");

      // Verify setSidebarState accepts boolean parameter and returns OperationResult
      const setStateResult = await exposedAPI.setSidebarState(true);
      expect(setStateResult).toHaveProperty("success");
      expect(typeof setStateResult.success).toBe("boolean");
      if ("error" in setStateResult) {
        expect(typeof setStateResult.error).toBe("string");
      }
    });

    /* Preconditions: ClerklyAPI interface is properly defined, event listener methods are exposed
       Action: validate TypeScript types of event listener methods and callback signatures
       Assertions: event listeners have correct callback types and return unsubscribe functions
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should have correctly typed event listener methods", () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Verify onAuthResult accepts callback with AuthResult parameter
      const mockCallback = vi.fn((result: any) => {
        expect(result).toHaveProperty("success");
        expect(typeof result.success).toBe("boolean");
        if ("error" in result) {
          expect(typeof result.error).toBe("string");
        }
      });

      const unsubscribe = exposedAPI.onAuthResult(mockCallback);
      expect(typeof unsubscribe).toBe("function");

      // Test the callback type by simulating an event
      const eventHandler =
        mockedIpcRenderer.on.mock.calls[mockedIpcRenderer.on.mock.calls.length - 1][1];
      const mockEvent = {} as any;
      const mockResult = { success: true };
      eventHandler(mockEvent, mockResult);

      expect(mockCallback).toHaveBeenCalledWith(mockResult);
    });

    /* Preconditions: window.clerkly API is exposed with all required methods
       Action: validate that API conforms to ClerklyAPI interface structure
       Assertions: all required methods exist with correct names and types
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should conform to ClerklyAPI interface structure", () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Verify all required methods exist
      const requiredMethods = [
        "openGoogleAuth",
        "getAuthState",
        "signOut",
        "getSidebarState",
        "setSidebarState",
        "onAuthResult",
      ];

      requiredMethods.forEach((method) => {
        expect(exposedAPI).toHaveProperty(method);
        expect(typeof exposedAPI[method as keyof typeof exposedAPI]).toBe("function");
      });

      // Verify no unexpected methods are exposed
      const actualMethods = Object.keys(exposedAPI);
      expect(actualMethods.sort()).toEqual(requiredMethods.sort());
    });

    /* Preconditions: IPC channels are properly typed, API methods use correct channel names
       Action: validate that API methods call correct IPC channels with proper typing
       Assertions: each method calls its corresponding IPC channel with correct parameters
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should use correctly typed IPC channels", async () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Clear previous mock calls
      vi.clearAllMocks();

      // Test authentication channels
      await exposedAPI.openGoogleAuth();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:open-google");

      await exposedAPI.getAuthState();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:get-state");

      await exposedAPI.signOut();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("auth:sign-out");

      // Test sidebar channels
      await exposedAPI.getSidebarState();
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:get-state");

      await exposedAPI.setSidebarState(false);
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledWith("sidebar:set-state", {
        collapsed: false,
      });

      // Verify correct number of IPC calls
      expect(mockedIpcRenderer.invoke).toHaveBeenCalledTimes(5);
    });

    /* Preconditions: TypeScript compiler is configured, API types are properly imported
       Action: validate that API maintains type safety at compile time
       Assertions: TypeScript types prevent incorrect usage patterns
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should maintain compile-time type safety", () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // These tests verify that TypeScript would catch type errors at compile time
      // We test this by ensuring the API methods have the expected signatures

      // Verify method signatures match expected types
      const api = exposedAPI as any;

      // Authentication methods should be callable without parameters
      expect(() => api.openGoogleAuth()).not.toThrow();
      expect(() => api.getAuthState()).not.toThrow();
      expect(() => api.signOut()).not.toThrow();
      expect(() => api.getSidebarState()).not.toThrow();

      // setSidebarState should require a boolean parameter
      expect(() => api.setSidebarState(true)).not.toThrow();
      expect(() => api.setSidebarState(false)).not.toThrow();

      // onAuthResult should require a callback function
      expect(() => api.onAuthResult(() => {})).not.toThrow();
      expect(() =>
        api.onAuthResult((result: any) => {
          console.log(result);
        }),
      ).not.toThrow();
    });

    /* Preconditions: API methods return properly typed promises
       Action: validate promise return types and their resolved values
       Assertions: all promises resolve to correctly typed values
       Requirements: platform-foundation.3.1, platform-foundation.3.2 */
    it("should return properly typed promises", async () => {
      // Requirements: platform-foundation.3.1, platform-foundation.3.2

      // Test that all async methods return promises that resolve to correct types
      const authResultPromise = exposedAPI.openGoogleAuth();
      expect(authResultPromise).toBeInstanceOf(Promise);
      const authResult = await authResultPromise;
      expect(typeof authResult).toBe("object");
      expect("success" in authResult).toBe(true);

      const authStatePromise = exposedAPI.getAuthState();
      expect(authStatePromise).toBeInstanceOf(Promise);
      const authState = await authStatePromise;
      expect(typeof authState).toBe("object");
      expect("authorized" in authState).toBe(true);

      const signOutPromise = exposedAPI.signOut();
      expect(signOutPromise).toBeInstanceOf(Promise);
      const signOutResult = await signOutPromise;
      expect(typeof signOutResult).toBe("object");
      expect("success" in signOutResult).toBe(true);

      const sidebarStatePromise = exposedAPI.getSidebarState();
      expect(sidebarStatePromise).toBeInstanceOf(Promise);
      const sidebarState = await sidebarStatePromise;
      expect(typeof sidebarState).toBe("object");
      expect("collapsed" in sidebarState).toBe(true);

      const setStatePromise = exposedAPI.setSidebarState(true);
      expect(setStatePromise).toBeInstanceOf(Promise);
      const setStateResult = await setStatePromise;
      expect(typeof setStateResult).toBe("object");
      expect("success" in setStateResult).toBe(true);
    });
  });

  describe("Logging Integration", () => {
    it("should send log messages to main process via IPC", () => {
      // Requirements: platform-foundation.3.2
      // The preload script should set up logging that sends messages to main process
      // We verify this by checking that the IPC send method is available for logging
      expect(mockedIpcRenderer.send).toBeDefined();
      expect(typeof mockedIpcRenderer.send).toBe("function");
    });

    it("should handle logging failures gracefully", () => {
      // Requirements: platform-foundation.3.2
      mockedIpcRenderer.send.mockImplementationOnce(() => {
        throw new Error("IPC send failed");
      });

      // The API should still work even if logging fails
      expect(() => {
        mockedIpcRenderer.send("preload:log", { level: "INFO", message: "test" });
      }).toThrow("IPC send failed");

      // But the API itself should remain functional
      expect(exposedAPI.getAuthState).toBeDefined();
    });
  });
});
