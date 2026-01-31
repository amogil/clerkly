// Requirements: platform-foundation.2.1
import fs from "fs";
import path from "path";

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_ROTATIONS = 3;

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Current log level configuration (can be set via environment variable)
let currentLogLevel: LogLevel = LogLevel.INFO;

// Set log level from environment variable or default to INFO
const envLogLevel = process.env.CLERKLY_LOG_LEVEL?.toUpperCase();
if (envLogLevel && envLogLevel in LogLevel) {
  currentLogLevel = LogLevel[envLogLevel as keyof typeof LogLevel];
}

const getLogPath = (rootDir: string): string => {
  return path.join(rootDir, "clerkly.log");
};

const shouldLog = (level: LogLevel): boolean => {
  return level >= currentLogLevel;
};

const formatLogEntry = (level: LogLevel, message: string, data?: unknown): string => {
  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];

  let dataText = "";
  if (data !== undefined) {
    if (data instanceof Error) {
      dataText = `\n${data.message}${data.stack ? `\n${data.stack}` : ""}`;
    } else {
      try {
        dataText = `\n${JSON.stringify(data, null, 2)}`;
      } catch {
        dataText = `\n${String(data)}`;
      }
    }
  }

  return `[${timestamp}] [${levelName}] ${message}${dataText}\n`;
};

const writeLogEntry = (rootDir: string, level: LogLevel, message: string, data?: unknown): void => {
  if (!shouldLog(level)) {
    return;
  }

  const logPath = getLogPath(rootDir);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  rotateLogs(logPath);

  const entry = formatLogEntry(level, message, data);
  fs.appendFileSync(logPath, entry, { encoding: "utf8" });
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

// Public API functions for each log level
export const logDebug = (rootDir: string, message: string, data?: unknown): void => {
  writeLogEntry(rootDir, LogLevel.DEBUG, message, data);
};

export const logInfo = (rootDir: string, message: string, data?: unknown): void => {
  writeLogEntry(rootDir, LogLevel.INFO, message, data);
};

export const logWarn = (rootDir: string, message: string, data?: unknown): void => {
  writeLogEntry(rootDir, LogLevel.WARN, message, data);
};

export const logError = (rootDir: string, message: string, error?: unknown): void => {
  writeLogEntry(rootDir, LogLevel.ERROR, message, error);
};

// Configuration functions
export const setLogLevel = (level: LogLevel): void => {
  currentLogLevel = level;
};

export const getLogLevel = (): LogLevel => {
  return currentLogLevel;
};

// Timing utilities for IPC operations
export const logIPCTiming = (
  rootDir: string,
  channel: string,
  startTime: number,
  endTime: number,
  success: boolean,
  error?: unknown,
): void => {
  const duration = endTime - startTime;
  const status = success ? "SUCCESS" : "ERROR";
  const message = `IPC ${channel} completed in ${duration}ms [${status}]`;

  if (success) {
    logInfo(rootDir, message);
  } else {
    logError(rootDir, message, error);
  }
};

export const createIPCTimer = () => {
  const startTime = performance.now();
  return {
    end: (rootDir: string, channel: string, success: boolean, error?: unknown) => {
      const endTime = performance.now();
      logIPCTiming(rootDir, channel, startTime, endTime, success, error);
    },
  };
};
