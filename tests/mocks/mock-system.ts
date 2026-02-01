// Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
import { FileSystemMock, FileSystemMockImpl } from "./file-system-mock";
import {
  NetworkMock,
  NetworkMockImpl,
  MockResponse,
  RequestHandler,
  HttpMethod,
  RequestOptions,
  NetworkInterceptor,
  NetworkRequest,
} from "./network-mock";
import { DatabaseMock, DatabaseMockImpl, MockStatement } from "./database-mock";

// Re-export network mock types for convenience
export type {
  HttpMethod,
  RequestOptions,
  NetworkInterceptor,
  NetworkRequest,
  MockResponse,
  RequestHandler,
};
export { NetworkMock };

// Re-export database mock types for convenience
export type { MockStatement };
export { DatabaseMock };

/**
 * Interface for IPC mock operations
 * Requirements: testing-infrastructure.2.4
 */
export interface IPCMock {
  handle(channel: string, handler: (...args: any[]) => any): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
  send(channel: string, ...args: any[]): void;
  on(channel: string, listener: IPCEventListener): void;
  removeListener(channel: string, listener: IPCEventListener): void;
  removeAllListeners(channel?: string): void;
  setMockResponse(channel: string, response: any): void;
  setMockError(channel: string, error: Error): void;
  setInterceptor(channel: string, interceptor: (channel: string, ...args: any[]) => any): void;
  getCallHistory(): IPCCallRecord[];
  getCallsForChannel(channel: string): IPCCallRecord[];
  getLastCall(channel?: string): IPCCallRecord | undefined;
  clearHistory(): void;
  setEnabled(enabled: boolean): void;
  isIPCEnabled(): boolean;
  simulateDelay(channel: string, delayMs: number): Promise<void>;
  verifyCall(channel: string, expectedArgs?: any[]): boolean;
  verifyCallCount(channel: string, expectedCount: number): boolean;
  reset(): void;
}

/**
 * Main mock system interface for managing all external dependencies
 * Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
 */
export interface MockSystem {
  mockFileSystem(): FileSystemMock;
  mockNetwork(): NetworkMock;
  mockDatabase(): DatabaseMock;
  mockIPC(): IPCMock;
  restoreAll(): void;
}

/**
 * Implementation of the main mock system
 * Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
 */
export class MockSystemImpl implements MockSystem {
  private fileSystemMock: FileSystemMock;
  private networkMock: NetworkMock;
  private databaseMock: DatabaseMock;
  private ipcMock: IPCMock;

  constructor() {
    this.fileSystemMock = new FileSystemMockImpl();
    this.networkMock = new NetworkMockImpl();
    this.databaseMock = new DatabaseMockImpl();
    this.ipcMock = new IPCMockImpl();
  }

  /**
   * Get file system mock instance
   * Requirements: testing-infrastructure.2.1
   */
  mockFileSystem(): FileSystemMock {
    return this.fileSystemMock;
  }

  /**
   * Get network mock instance
   * Requirements: testing-infrastructure.2.2
   */
  mockNetwork(): NetworkMock {
    return this.networkMock;
  }

  /**
   * Get database mock instance
   * Requirements: testing-infrastructure.2.3
   */
  mockDatabase(): DatabaseMock {
    return this.databaseMock;
  }

  /**
   * Get IPC mock instance
   * Requirements: testing-infrastructure.2.4
   */
  mockIPC(): IPCMock {
    return this.ipcMock;
  }

  /**
   * Restore all mocks to their original state
   * Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
   */
  restoreAll(): void {
    this.fileSystemMock.reset();
    this.networkMock.reset();
    this.databaseMock.reset();
    this.ipcMock.reset();
  }
}

/**
/**
 * IPC event listener type for event-based communication
 * Requirements: testing-infrastructure.2.4
 */
export type IPCEventListener = (...args: any[]) => void;

/**
 * IPC call record for tracking and debugging
 * Requirements: testing-infrastructure.2.4
 */
export interface IPCCallRecord {
  channel: string;
  args: any[];
  timestamp: number;
  type: "invoke" | "send" | "handle" | "on" | "removeListener";
  result?: any;
  error?: Error;
}

/**
 * Comprehensive implementation of IPCMock for inter-process communication testing
 * Requirements: testing-infrastructure.2.4
 */
class IPCMockImpl implements IPCMock {
  private handlers: Map<string, (...args: any[]) => any> = new Map();
  private eventListeners: Map<string, IPCEventListener[]> = new Map();
  private callHistory: IPCCallRecord[] = [];
  private mockResponses: Map<string, any> = new Map();
  private mockErrors: Map<string, Error> = new Map();
  private interceptors: Map<string, (channel: string, ...args: any[]) => any> = new Map();
  private isEnabled: boolean = true;

  /**
   * Register IPC handler for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  handle(channel: string, handler: (...args: any[]) => any): void {
    this.recordCall(channel, [handler], "handle");
    this.handlers.set(channel, handler);
  }

  /**
   * Invoke IPC handler and return result
   * Requirements: testing-infrastructure.2.4
   */
  async invoke(channel: string, ...args: any[]): Promise<any> {
    if (!this.isEnabled) {
      this.recordCall(channel, args, "invoke", undefined, new Error("IPC Mock is disabled"));
      throw new Error("IPC Mock is disabled");
    }

    // Check for simulated errors
    if (this.mockErrors.has(channel)) {
      const error = this.mockErrors.get(channel)!;
      this.recordCall(channel, args, "invoke", undefined, error);
      throw error;
    }

    // Check for mock responses
    if (this.mockResponses.has(channel)) {
      const response = this.mockResponses.get(channel);
      this.recordCall(channel, args, "invoke", response);
      return response;
    }

    // Check for interceptors
    if (this.interceptors.has(channel)) {
      const interceptor = this.interceptors.get(channel)!;
      const result = await interceptor(channel, ...args);
      this.recordCall(channel, args, "invoke", result);
      return result;
    }

    // Use registered handler
    const handler = this.handlers.get(channel);
    if (handler) {
      try {
        const result = await handler(...args);
        this.recordCall(channel, args, "invoke", result);
        return result;
      } catch (error) {
        this.recordCall(channel, args, "invoke", undefined, error as Error);
        throw error;
      }
    }

    // Return default empty response for unknown channels
    const defaultResponse = {};
    this.recordCall(channel, args, "invoke", defaultResponse);
    return defaultResponse;
  }

  /**
   * Send IPC message (one-way communication)
   * Requirements: testing-infrastructure.2.4
   */
  send(channel: string, ...args: any[]): void {
    this.recordCall(channel, args, "send");

    if (!this.isEnabled) {
      return;
    }

    // Check for interceptors
    if (this.interceptors.has(channel)) {
      const interceptor = this.interceptors.get(channel)!;
      interceptor(channel, ...args);
      return;
    }

    // Trigger event listeners for this channel
    const listeners = this.eventListeners.get(channel) || [];
    listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in IPC event listener for channel ${channel}:`, error);
      }
    });
  }

  /**
   * Register event listener for IPC channel
   * Requirements: testing-infrastructure.2.4
   */
  on(channel: string, listener: IPCEventListener): void {
    this.recordCall(channel, [listener], "on");

    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, []);
    }
    this.eventListeners.get(channel)!.push(listener);
  }

  /**
   * Remove event listener from IPC channel
   * Requirements: testing-infrastructure.2.4
   */
  removeListener(channel: string, listener: IPCEventListener): void {
    this.recordCall(channel, [listener], "removeListener");

    const listeners = this.eventListeners.get(channel);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all listeners for a specific channel
   * Requirements: testing-infrastructure.2.4
   */
  removeAllListeners(channel?: string): void {
    if (channel) {
      this.eventListeners.delete(channel);
    } else {
      this.eventListeners.clear();
    }
  }

  /**
   * Set mock response for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  setMockResponse(channel: string, response: any): void {
    this.mockResponses.set(channel, response);
  }

  /**
   * Set mock error for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  setMockError(channel: string, error: Error): void {
    this.mockErrors.set(channel, error);
  }

  /**
   * Set interceptor function for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  setInterceptor(channel: string, interceptor: (channel: string, ...args: any[]) => any): void {
    this.interceptors.set(channel, interceptor);
  }

  /**
   * Get call history for debugging and testing
   * Requirements: testing-infrastructure.2.4
   */
  getCallHistory(): IPCCallRecord[] {
    return [...this.callHistory];
  }

  /**
   * Get calls for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  getCallsForChannel(channel: string): IPCCallRecord[] {
    return this.callHistory.filter((call) => call.channel === channel);
  }

  /**
   * Get last call for specific channel
   * Requirements: testing-infrastructure.2.4
   */
  getLastCall(channel?: string): IPCCallRecord | undefined {
    if (channel) {
      const channelCalls = this.getCallsForChannel(channel);
      return channelCalls[channelCalls.length - 1];
    }
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Clear call history
   * Requirements: testing-infrastructure.2.4
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Enable or disable IPC mock
   * Requirements: testing-infrastructure.2.4
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if IPC mock is enabled
   * Requirements: testing-infrastructure.2.4
   */
  isIPCEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Simulate network delay for IPC calls
   * Requirements: testing-infrastructure.2.4
   */
  async simulateDelay(channel: string, delayMs: number): Promise<void> {
    const originalHandler = this.handlers.get(channel);
    if (originalHandler) {
      this.handlers.set(channel, async (...args: any[]) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return originalHandler(...args);
      });
    }
  }

  /**
   * Verify that specific channel was called with expected arguments
   * Requirements: testing-infrastructure.2.4
   */
  verifyCall(channel: string, expectedArgs?: any[]): boolean {
    const calls = this.getCallsForChannel(channel);
    if (calls.length === 0) {
      return false;
    }

    if (expectedArgs) {
      return calls.some((call) => JSON.stringify(call.args) === JSON.stringify(expectedArgs));
    }

    return true;
  }

  /**
   * Verify that specific channel was called exactly N times
   * Requirements: testing-infrastructure.2.4
   */
  verifyCallCount(channel: string, expectedCount: number): boolean {
    const calls = this.getCallsForChannel(channel);
    return calls.length === expectedCount;
  }

  /**
   * Reset all mock data and state
   * Requirements: testing-infrastructure.2.4
   */
  reset(): void {
    this.handlers.clear();
    this.eventListeners.clear();
    this.callHistory = [];
    this.mockResponses.clear();
    this.mockErrors.clear();
    this.interceptors.clear();
    this.isEnabled = true;
  }

  /**
   * Record IPC call for history and debugging
   * Requirements: testing-infrastructure.2.4
   */
  private recordCall(
    channel: string,
    args: any[],
    type: "invoke" | "send" | "handle" | "on" | "removeListener",
    result?: any,
    error?: Error,
  ): void {
    const record: IPCCallRecord = {
      channel,
      args: JSON.parse(JSON.stringify(args)), // Deep clone to avoid mutations
      timestamp: Date.now(),
      type,
      result,
      error,
    };

    this.callHistory.push(record);

    // Limit history size to prevent memory leaks
    if (this.callHistory.length > 1000) {
      this.callHistory.shift();
    }
  }
}

/**
 * Global mock system instance
 * Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4
 */
export const mockSystem = new MockSystemImpl();
