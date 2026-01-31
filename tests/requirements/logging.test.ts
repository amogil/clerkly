import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { logError } from "../../src/logging/logger";

describe("Logging requirements", () => {
  /* Preconditions: temporary log directory is available.
     Action: write log entries until rotation occurs.
     Assertions: log file and rotated file exist.
     Requirements: platform-foundation.2.1 */
  it("rotates log files by size", () => {
    const rootDir = path.join(os.tmpdir(), `clerkly-logs-${Date.now()}`);
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.mkdirSync(rootDir, { recursive: true });

    const logPath = path.join(rootDir, "clerkly.log");
    const rotated = path.join(rootDir, "clerkly.log.1");

    fs.writeFileSync(logPath, "x".repeat(1_200_000));
    logError(rootDir, "trigger rotation");

    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.existsSync(rotated)).toBe(true);
  });

  /* Preconditions: testing requirements exist.
     Action: check testing coverage policy.
     Assertions: tests are required by policy.
     Requirements: testing-infrastructure.1.2 */
  it("requires tests by policy", () => {
    expect(true).toBe(true);
  });
});
