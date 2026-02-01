// Requirements: testing-infrastructure.2.4
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSystem, type IPCMock, type IPCCallRecord, type IPCEventListener } from "./mock-system";

describe("IPC Mock System", () => {
  let ipcMock: IPCMock;

  beforeEach(() => {
    ipcMock = mockSystem.mockIPC();
    ipcMock.reset();
  });

  describe("Basic IPC Operations", () => {
    /* Preconditions: fresh IPC mock instance
       Action: register handler and invoke channel
       Assertions: handler is called and returns expected result
       Requirements: testing-infrastructure.2.4 */
    it("should handle basic invoke/handle operations", async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });

      ipcMock.handle("test:channel", mockHandler);
      const result = await ipcMock.invoke("test:channel", "arg1", "arg2");

      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledWith("arg1", "arg2");
    });

    /* Preconditions: fresh IPC mock instance
       Action: invoke channel without registered handler
       Assertions: returns default empty object
       Requirements: testing-infrastructure.2.4 */
    it("should return default response for unhandled channels", async () => {
      const result = await ipcMock.invoke("unknown:channel");
      expect(result).toEqual({});
    });

    /* Preconditions: fresh IPC mock instance with event listener
       Action: send message to channel
       Assertions: event listener is triggered with correct arguments
       Requirements: testing-infrastructure.2.4 */
    it("should handle send/on event operations", () => {
      const mockListener = vi.fn();

      ipcMock.on("test:event", mockListener);
      ipcMock.send("test:event", "data1", "data2");

      expect(mockListener).toHaveBeenCalledWith("data1", "data2");
    });

    /* Preconditions: fresh IPC mock instance with multiple listeners
       Action: send message to channel
       Assertions: all listeners are triggered
       Requirements: testing-infrastructure.2.4 */
    it("should support multiple event listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      ipcMock.on("test:event", listener1);
      ipcMock.on("test:event", listener2);
      ipcMock.send("test:event", "data");

      expect(listener1).toHaveBeenCalledWith("data");
      expect(listener2).toHaveBeenCalledWith("data");
    });
  });

  describe("Event Listener Management", () => {
    /* Preconditions: IPC mock with registered listener
       Action: remove specific listener and send event
       Assertions: removed listener not called, others still called
       Requirements: testing-infrastructure.2.4 */
    it("should remove specific event listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      ipcMock.on("test:event", listener1);
      ipcMock.on("test:event", listener2);
      ipcMock.removeListener("test:event", listener1);
      ipcMock.send("test:event", "data");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith("data");
    });

    /* Preconditions: IPC mock with multiple listeners on different channels
       Action: remove all listeners for specific channel
       Assertions: listeners for that channel removed, others remain
       Requirements: testing-infrastructure.2.4 */
    it("should remove all listeners for specific channel", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      ipcMock.on("channel1", listener1);
      ipcMock.on("channel1", listener2);
      ipcMock.on("channel2", listener3);

      ipcMock.removeAllListeners("channel1");

      ipcMock.send("channel1", "data");
      ipcMock.send("channel2", "data");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).toHaveBeenCalledWith("data");
    });

    /* Preconditions: IPC mock with listeners on multiple channels
       Action: remove all listeners without specifying channel
       Assertions: all listeners removed from all channels
       Requirements: testing-infrastructure.2.4 */
    it("should remove all listeners from all channels", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      ipcMock.on("channel1", listener1);
      ipcMock.on("channel2", listener2);

      ipcMock.removeAllListeners();

      ipcMock.send("channel1", "data");
      ipcMock.send("channel2", "data");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe("Mock Response and Error Simulation", () => {
    /* Preconditions: IPC mock with mock response set
       Action: invoke channel
       Assertions: returns mock response instead of handler result
       Requirements: testing-infrastructure.2.4 */
    it("should return mock responses", async () => {
      const mockResponse = { mocked: true, data: "test" };
      const handler = vi.fn().mockResolvedValue({ original: true });

      ipcMock.handle("test:channel", handler);
      ipcMock.setMockResponse("test:channel", mockResponse);

      const result = await ipcMock.invoke("test:channel");

      expect(result).toEqual(mockResponse);
      expect(handler).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC mock with mock error set
       Action: invoke channel
       Assertions: throws mock error instead of executing handler
       Requirements: testing-infrastructure.2.4 */
    it("should throw mock errors", async () => {
      const mockError = new Error("Mock error");
      const handler = vi.fn().mockResolvedValue({ success: true });

      ipcMock.handle("test:channel", handler);
      ipcMock.setMockError("test:channel", mockError);

      await expect(ipcMock.invoke("test:channel")).rejects.toThrow("Mock error");
      expect(handler).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC mock with interceptor set
       Action: invoke channel
       Assertions: interceptor is called instead of handler
       Requirements: testing-infrastructure.2.4 */
    it("should use interceptors", async () => {
      const interceptor = vi.fn().mockResolvedValue({ intercepted: true });
      const handler = vi.fn().mockResolvedValue({ original: true });

      ipcMock.handle("test:channel", handler);
      ipcMock.setInterceptor("test:channel", interceptor);

      const result = await ipcMock.invoke("test:channel", "arg1");

      expect(result).toEqual({ intercepted: true });
      expect(interceptor).toHaveBeenCalledWith("test:channel", "arg1");
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Call History and Tracking", () => {
    /* Preconditions: fresh IPC mock instance
       Action: perform various IPC operations
       Assertions: all operations recorded in call history
       Requirements: testing-infrastructure.2.4 */
    it("should track call history", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const listener = vi.fn();

      ipcMock.handle("test:channel", handler);
      ipcMock.on("test:event", listener);
      await ipcMock.invoke("test:channel", "arg1");
      ipcMock.send("test:event", "data");

      const history = ipcMock.getCallHistory();

      expect(history).toHaveLength(4);
      expect(history[0]).toMatchObject({
        channel: "test:channel",
        type: "handle",
      });
      expect(history[1]).toMatchObject({
        channel: "test:event",
        type: "on",
      });
      expect(history[2]).toMatchObject({
        channel: "test:channel",
        type: "invoke",
        args: ["arg1"],
      });
      expect(history[3]).toMatchObject({
        channel: "test:event",
        type: "send",
        args: ["data"],
      });
    });

    /* Preconditions: IPC mock with call history
       Action: get calls for specific channel
       Assertions: returns only calls for that channel
       Requirements: testing-infrastructure.2.4 */
    it("should filter calls by channel", async () => {
      await ipcMock.invoke("channel1", "arg1");
      await ipcMock.invoke("channel2", "arg2");
      await ipcMock.invoke("channel1", "arg3");

      const channel1Calls = ipcMock.getCallsForChannel("channel1");

      expect(channel1Calls).toHaveLength(2);
      expect(channel1Calls[0].args).toEqual(["arg1"]);
      expect(channel1Calls[1].args).toEqual(["arg3"]);
    });

    /* Preconditions: IPC mock with call history
       Action: get last call for specific channel
       Assertions: returns most recent call for that channel
       Requirements: testing-infrastructure.2.4 */
    it("should get last call for channel", async () => {
      await ipcMock.invoke("test:channel", "first");
      await ipcMock.invoke("other:channel", "other");
      await ipcMock.invoke("test:channel", "last");

      const lastCall = ipcMock.getLastCall("test:channel");

      expect(lastCall).toBeDefined();
      expect(lastCall!.args).toEqual(["last"]);
    });

    /* Preconditions: IPC mock with call history
       Action: clear call history
       Assertions: history is empty after clearing
       Requirements: testing-infrastructure.2.4 */
    it("should clear call history", async () => {
      await ipcMock.invoke("test:channel", "arg");
      expect(ipcMock.getCallHistory().length).toBeGreaterThan(0);

      ipcMock.clearHistory();

      expect(ipcMock.getCallHistory()).toHaveLength(0);
    });
  });

  describe("Call Verification", () => {
    /* Preconditions: IPC mock with some calls made
       Action: verify call was made to specific channel
       Assertions: returns true for called channels, false for others
       Requirements: testing-infrastructure.2.4 */
    it("should verify if channel was called", async () => {
      await ipcMock.invoke("called:channel", "arg");

      expect(ipcMock.verifyCall("called:channel")).toBe(true);
      expect(ipcMock.verifyCall("not-called:channel")).toBe(false);
    });

    /* Preconditions: IPC mock with calls made with specific arguments
       Action: verify call was made with expected arguments
       Assertions: returns true only for exact argument matches
       Requirements: testing-infrastructure.2.4 */
    it("should verify calls with specific arguments", async () => {
      await ipcMock.invoke("test:channel", "arg1", "arg2");
      await ipcMock.invoke("test:channel", "different", "args");

      expect(ipcMock.verifyCall("test:channel", ["arg1", "arg2"])).toBe(true);
      expect(ipcMock.verifyCall("test:channel", ["wrong", "args"])).toBe(false);
    });

    /* Preconditions: IPC mock with multiple calls to same channel
       Action: verify call count for channel
       Assertions: returns true only for exact count matches
       Requirements: testing-infrastructure.2.4 */
    it("should verify call count", async () => {
      await ipcMock.invoke("test:channel", "call1");
      await ipcMock.invoke("test:channel", "call2");
      await ipcMock.invoke("other:channel", "other");

      expect(ipcMock.verifyCallCount("test:channel", 2)).toBe(true);
      expect(ipcMock.verifyCallCount("test:channel", 1)).toBe(false);
      expect(ipcMock.verifyCallCount("other:channel", 1)).toBe(true);
      expect(ipcMock.verifyCallCount("not-called:channel", 0)).toBe(true);
    });
  });

  describe("Enable/Disable Functionality", () => {
    /* Preconditions: IPC mock enabled by default
       Action: disable IPC mock and try to invoke
       Assertions: throws error when disabled
       Requirements: testing-infrastructure.2.4 */
    it("should throw error when disabled", async () => {
      ipcMock.setEnabled(false);

      await expect(ipcMock.invoke("test:channel")).rejects.toThrow("IPC Mock is disabled");
      expect(ipcMock.isIPCEnabled()).toBe(false);
    });

    /* Preconditions: IPC mock disabled
       Action: enable IPC mock and invoke
       Assertions: works normally when re-enabled
       Requirements: testing-infrastructure.2.4 */
    it("should work normally when re-enabled", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });

      ipcMock.handle("test:channel", handler);
      ipcMock.setEnabled(false);
      ipcMock.setEnabled(true);

      const result = await ipcMock.invoke("test:channel");

      expect(result).toEqual({ success: true });
      expect(ipcMock.isIPCEnabled()).toBe(true);
    });

    /* Preconditions: IPC mock disabled
       Action: send event when disabled
       Assertions: send operation is ignored when disabled
       Requirements: testing-infrastructure.2.4 */
    it("should ignore send operations when disabled", () => {
      const listener = vi.fn();

      ipcMock.on("test:event", listener);
      ipcMock.setEnabled(false);
      ipcMock.send("test:event", "data");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("Delay Simulation", () => {
    /* Preconditions: IPC mock with handler and delay simulation
       Action: invoke channel and measure time
       Assertions: operation takes at least the simulated delay time
       Requirements: testing-infrastructure.2.4 */
    it("should simulate network delays", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const delayMs = 100;

      ipcMock.handle("test:channel", handler);
      await ipcMock.simulateDelay("test:channel", delayMs);

      const startTime = Date.now();
      const result = await ipcMock.invoke("test:channel");
      const endTime = Date.now();

      expect(result).toEqual({ success: true });
      expect(endTime - startTime).toBeGreaterThanOrEqual(delayMs - 10); // Allow 10ms tolerance
    });
  });

  describe("Error Handling", () => {
    /* Preconditions: IPC mock with handler that throws error
       Action: invoke channel
       Assertions: error is caught and recorded in call history
       Requirements: testing-infrastructure.2.4 */
    it("should handle and record handler errors", async () => {
      const error = new Error("Handler error");
      const handler = vi.fn().mockRejectedValue(error);

      ipcMock.handle("test:channel", handler);

      await expect(ipcMock.invoke("test:channel")).rejects.toThrow("Handler error");

      const lastCall = ipcMock.getLastCall("test:channel");
      expect(lastCall?.error).toEqual(error);
    });

    /* Preconditions: IPC mock with event listener that throws error
       Action: send event to channel
       Assertions: error is caught and logged, other listeners still work
       Requirements: testing-infrastructure.2.4 */
    it("should handle event listener errors gracefully", () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      ipcMock.on("test:event", errorListener);
      ipcMock.on("test:event", goodListener);

      ipcMock.send("test:event", "data");

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalledWith("data");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in IPC event listener"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Memory Management", () => {
    /* Preconditions: fresh IPC mock instance
       Action: make many IPC calls to exceed history limit
       Assertions: history is limited to prevent memory leaks
       Requirements: testing-infrastructure.2.4 */
    it("should limit call history size to prevent memory leaks", async () => {
      // Make more than 1000 calls to test history limit
      for (let i = 0; i < 1100; i++) {
        await ipcMock.invoke("test:channel", i);
      }

      const history = ipcMock.getCallHistory();
      expect(history.length).toBeLessThanOrEqual(1000);

      // Should keep the most recent calls
      const lastCall = history[history.length - 1];
      expect(lastCall.args).toEqual([1099]);
    });
  });

  describe("Reset Functionality", () => {
    /* Preconditions: IPC mock with handlers, listeners, and call history
       Action: reset the mock
       Assertions: all state is cleared and mock is re-enabled
       Requirements: testing-infrastructure.2.4 */
    it("should reset all state", async () => {
      const handler = vi.fn();
      const listener = vi.fn();

      // Set up various state
      ipcMock.handle("test:channel", handler);
      ipcMock.on("test:event", listener);
      ipcMock.setMockResponse("mock:channel", { mocked: true });
      ipcMock.setMockError("error:channel", new Error("Mock error"));
      await ipcMock.invoke("test:channel");
      ipcMock.setEnabled(false);

      // Verify state exists
      expect(ipcMock.getCallHistory().length).toBeGreaterThan(0);
      expect(ipcMock.isIPCEnabled()).toBe(false);

      // Reset
      ipcMock.reset();

      // Verify all state is cleared
      expect(ipcMock.getCallHistory()).toHaveLength(0);
      expect(ipcMock.isIPCEnabled()).toBe(true);

      // Verify handlers are cleared - should return default response
      const result = await ipcMock.invoke("test:channel");
      expect(result).toEqual({}); // Default response

      // Verify listeners are cleared
      ipcMock.send("test:event", "data");
      expect(listener).not.toHaveBeenCalled();

      // Verify mock responses are cleared
      const mockResult = await ipcMock.invoke("mock:channel");
      expect(mockResult).toEqual({}); // Should not return mocked response

      // Verify mock errors are cleared - should not throw
      const errorResult = await ipcMock.invoke("error:channel");
      expect(errorResult).toEqual({}); // Should not throw error
    });
  });

  describe("Integration with Mock System", () => {
    /* Preconditions: mock system with IPC mock
       Action: get IPC mock from mock system and use it
       Assertions: IPC mock works correctly through mock system interface
       Requirements: testing-infrastructure.2.4 */
    it("should integrate with mock system", async () => {
      const systemIpcMock = mockSystem.mockIPC();
      const handler = vi.fn().mockResolvedValue({ integrated: true });

      systemIpcMock.handle("integration:test", handler);
      const result = await systemIpcMock.invoke("integration:test", "data");

      expect(result).toEqual({ integrated: true });
      expect(handler).toHaveBeenCalledWith("data");
    });

    /* Preconditions: mock system with all mocks
       Action: restore all mocks including IPC
       Assertions: IPC mock is reset when restoring all mocks
       Requirements: testing-infrastructure.2.4 */
    it("should be reset when restoring all mocks", async () => {
      const systemIpcMock = mockSystem.mockIPC();

      systemIpcMock.handle("test:channel", vi.fn());
      await systemIpcMock.invoke("test:channel");

      expect(systemIpcMock.getCallHistory().length).toBeGreaterThan(0);

      mockSystem.restoreAll();

      expect(systemIpcMock.getCallHistory()).toHaveLength(0);
    });
  });
});
