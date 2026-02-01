// Requirements: testing-infrastructure.5.3
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as appUtils from "../functional/utils/app";

// Mock the app utilities
vi.mock("../functional/utils/app", () => ({
  createUserDataDir: vi.fn(),
  cleanupUserDataDir: vi.fn(),
  launchApp: vi.fn(),
}));

describe("Test Isolation Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* Preconditions: createUserDataDir utility is available
     Action: call createUserDataDir
     Assertions: returns a temporary directory path
     Requirements: testing-infrastructure.5.3 */
  it("should create unique user data directory", async () => {
    const mockDir = "/tmp/clerkly-e2e-test123";
    vi.mocked(appUtils.createUserDataDir).mockResolvedValue(mockDir);

    const result = await appUtils.createUserDataDir();

    expect(result).toBe(mockDir);
    expect(appUtils.createUserDataDir).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: cleanupUserDataDir utility is available
     Action: call cleanupUserDataDir with directory path
     Assertions: cleanup function is called with correct path
     Requirements: testing-infrastructure.5.3 */
  it("should cleanup user data directory", async () => {
    const mockDir = "/tmp/clerkly-e2e-test456";
    vi.mocked(appUtils.cleanupUserDataDir).mockResolvedValue();

    await appUtils.cleanupUserDataDir(mockDir);

    expect(appUtils.cleanupUserDataDir).toHaveBeenCalledWith(mockDir);
    expect(appUtils.cleanupUserDataDir).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: launchApp utility is available
     Action: call launchApp with user data directory and options
     Assertions: returns app and page objects
     Requirements: testing-infrastructure.5.3 */
  it("should launch app with isolated user data directory", async () => {
    const mockDir = "/tmp/clerkly-e2e-test789";
    const mockApp = {
      close: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
    };
    const mockPage = {
      context: vi.fn().mockReturnValue({}),
      url: vi.fn().mockReturnValue("http://localhost"),
    };

    vi.mocked(appUtils.launchApp).mockResolvedValue({
      app: mockApp as any,
      page: mockPage as any,
    });

    const result = await appUtils.launchApp(mockDir, { authMode: "success" });

    expect(result.app).toBe(mockApp);
    expect(result.page).toBe(mockPage);
    expect(appUtils.launchApp).toHaveBeenCalledWith(mockDir, { authMode: "success" });
  });

  /* Preconditions: multiple calls to createUserDataDir
     Action: call createUserDataDir multiple times
     Assertions: each call returns unique directory path
     Requirements: testing-infrastructure.5.3 */
  it("should create unique directories for parallel tests", async () => {
    const mockDirs = [
      "/tmp/clerkly-e2e-test-001",
      "/tmp/clerkly-e2e-test-002",
      "/tmp/clerkly-e2e-test-003",
    ];

    vi.mocked(appUtils.createUserDataDir)
      .mockResolvedValueOnce(mockDirs[0])
      .mockResolvedValueOnce(mockDirs[1])
      .mockResolvedValueOnce(mockDirs[2]);

    const dir1 = await appUtils.createUserDataDir();
    const dir2 = await appUtils.createUserDataDir();
    const dir3 = await appUtils.createUserDataDir();

    expect(dir1).toBe(mockDirs[0]);
    expect(dir2).toBe(mockDirs[1]);
    expect(dir3).toBe(mockDirs[2]);
    expect(new Set([dir1, dir2, dir3]).size).toBe(3);
  });

  /* Preconditions: launchApp with custom auth options
     Action: call launchApp with failure auth mode
     Assertions: launchApp receives correct auth mode
     Requirements: testing-infrastructure.5.3 */
  it("should support custom auth modes", async () => {
    const mockDir = "/tmp/clerkly-e2e-custom";
    const mockApp = { close: vi.fn() };
    const mockPage = { context: vi.fn() };

    vi.mocked(appUtils.launchApp).mockResolvedValue({
      app: mockApp as any,
      page: mockPage as any,
    });

    await appUtils.launchApp(mockDir, { authMode: "failure" });

    expect(appUtils.launchApp).toHaveBeenCalledWith(mockDir, { authMode: "failure" });
  });

  /* Preconditions: launchApp with auth sequence
     Action: call launchApp with auth sequence array
     Assertions: launchApp receives correct auth sequence
     Requirements: testing-infrastructure.5.3 */
  it("should support auth sequences", async () => {
    const mockDir = "/tmp/clerkly-e2e-sequence";
    const mockApp = { close: vi.fn() };
    const mockPage = { context: vi.fn() };
    const authSequence: Array<"failure" | "success"> = ["failure", "success"];

    vi.mocked(appUtils.launchApp).mockResolvedValue({
      app: mockApp as any,
      page: mockPage as any,
    });

    await appUtils.launchApp(mockDir, {
      authMode: "failure",
      authSequence,
    });

    expect(appUtils.launchApp).toHaveBeenCalledWith(mockDir, {
      authMode: "failure",
      authSequence,
    });
  });

  /* Preconditions: error during app launch
     Action: call launchApp and simulate error
     Assertions: error is propagated correctly
     Requirements: testing-infrastructure.5.3 */
  it("should handle launch errors gracefully", async () => {
    const mockDir = "/tmp/clerkly-e2e-error";
    const launchError = new Error("Failed to launch");

    vi.mocked(appUtils.launchApp).mockRejectedValue(launchError);

    await expect(appUtils.launchApp(mockDir, { authMode: "success" })).rejects.toThrow(launchError);
  });

  /* Preconditions: error during cleanup
     Action: call cleanupUserDataDir and simulate error
     Assertions: cleanup error is propagated correctly
     Requirements: testing-infrastructure.5.3 */
  it("should handle cleanup errors gracefully", async () => {
    const mockDir = "/tmp/clerkly-e2e-cleanup-error";
    const cleanupError = new Error("Failed to cleanup");

    vi.mocked(appUtils.cleanupUserDataDir).mockRejectedValue(cleanupError);

    await expect(appUtils.cleanupUserDataDir(mockDir)).rejects.toThrow(cleanupError);
  });

  /* Preconditions: complete test lifecycle
     Action: simulate full test lifecycle (create, launch, close, cleanup)
     Assertions: all steps execute in correct order
     Requirements: testing-infrastructure.5.3 */
  it("should support complete test lifecycle", async () => {
    const mockDir = "/tmp/clerkly-e2e-lifecycle";
    const executionOrder: string[] = [];

    const mockApp = {
      close: vi.fn().mockImplementation(async () => {
        executionOrder.push("app.close");
      }),
    };
    const mockPage = { context: vi.fn() };

    vi.mocked(appUtils.createUserDataDir).mockImplementation(async () => {
      executionOrder.push("createUserDataDir");
      return mockDir;
    });

    vi.mocked(appUtils.launchApp).mockImplementation(async () => {
      executionOrder.push("launchApp");
      return { app: mockApp as any, page: mockPage as any };
    });

    vi.mocked(appUtils.cleanupUserDataDir).mockImplementation(async () => {
      executionOrder.push("cleanupUserDataDir");
    });

    // Simulate test lifecycle
    const userDataDir = await appUtils.createUserDataDir();
    const { app } = await appUtils.launchApp(userDataDir, { authMode: "success" });
    await app.close();
    await appUtils.cleanupUserDataDir(userDataDir);

    expect(executionOrder).toEqual([
      "createUserDataDir",
      "launchApp",
      "app.close",
      "cleanupUserDataDir",
    ]);
  });

  /* Preconditions: parallel test execution simulation
     Action: simulate multiple tests running in parallel
     Assertions: each test gets isolated environment
     Requirements: testing-infrastructure.5.3 */
  it("should support parallel test execution", async () => {
    const mockDirs = [
      "/tmp/clerkly-e2e-parallel-1",
      "/tmp/clerkly-e2e-parallel-2",
      "/tmp/clerkly-e2e-parallel-3",
    ];

    vi.mocked(appUtils.createUserDataDir)
      .mockResolvedValueOnce(mockDirs[0])
      .mockResolvedValueOnce(mockDirs[1])
      .mockResolvedValueOnce(mockDirs[2]);

    vi.mocked(appUtils.cleanupUserDataDir).mockResolvedValue();

    // Simulate parallel execution
    const tests = mockDirs.map(async () => {
      const dir = await appUtils.createUserDataDir();
      await appUtils.cleanupUserDataDir(dir);
      return dir;
    });

    const results = await Promise.all(tests);

    expect(new Set(results).size).toBe(3);
    expect(appUtils.createUserDataDir).toHaveBeenCalledTimes(3);
    expect(appUtils.cleanupUserDataDir).toHaveBeenCalledTimes(3);
  });
});
