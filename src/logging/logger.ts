// Requirements: platform-foundation.2.1
import fs from "fs";
import path from "path";

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_ROTATIONS = 3;

const getLogPath = (rootDir: string): string => {
  return path.join(rootDir, "clerkly.log");
};

const rotateLogs = (logPath: string): void => {
  if (!fs.existsSync(logPath)) {
    return;
  }

  const stats = fs.statSync(logPath);
  if (stats.size < MAX_LOG_BYTES) {
    return;
  }

  for (let i = MAX_ROTATIONS; i >= 1; i -= 1) {
    const source = `${logPath}.${i}`;
    const target = `${logPath}.${i + 1}`;
    if (fs.existsSync(source)) {
      if (i === MAX_ROTATIONS) {
        fs.rmSync(source);
      } else {
        fs.renameSync(source, target);
      }
    }
  }

  fs.renameSync(logPath, `${logPath}.1`);
};

export const logError = (rootDir: string, message: string, error?: unknown): void => {
  const logPath = getLogPath(rootDir);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  rotateLogs(logPath);

  const timestamp = new Date().toISOString();
  const errorText =
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error ? String(error) : "";
  const entry = `[${timestamp}] ${message}${errorText ? `\n${errorText}` : ""}\n`;

  fs.appendFileSync(logPath, entry, { encoding: "utf8" });
};
