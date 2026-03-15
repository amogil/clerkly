// Requirements: code_exec.3, code_exec.5

export const CODE_EXEC_LIMITS = {
  timeoutMsMin: 10_000,
  timeoutMsDefault: 60_000,
  timeoutMsPolicyCap: 3_600_000,
  maxCodeBytes: 30 * 1024,
  maxStdoutBytes: 10 * 1024,
  maxStderrBytes: 10 * 1024,
  sandboxCpuLimit: 1,
  sandboxMemoryLimitBytes: 2 * 1024 * 1024 * 1024,
  shutdownTimeoutMs: 15_000,
  monitorIntervalMs: 200,
} as const;

export type CodeExecErrorCode =
  | 'policy_denied'
  | 'sandbox_runtime_error'
  | 'invalid_tool_arguments'
  | 'limit_exceeded'
  | 'internal_error';

export type CodeExecStatus = 'running' | 'success' | 'error' | 'timeout' | 'cancelled';

export interface CodeExecToolInput {
  task_summary: string;
  code: string;
  timeout_ms?: number;
}

export interface CodeExecError {
  code: CodeExecErrorCode;
  message: string;
}

export interface CodeExecToolOutput {
  status: CodeExecStatus;
  stdout: string;
  stderr: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  error?: CodeExecError;
}

export interface CodeExecValidationResult {
  ok: boolean;
  value?: { taskSummary: string; code: string; timeoutMs: number };
  error?: CodeExecError;
}

// Requirements: code_exec.3.1.1-3.1.1.4, code_exec.3.1.3-3.1.5, code_exec.5.1
export function validateCodeExecInput(args: Record<string, unknown>): CodeExecValidationResult {
  const keys = Object.keys(args);
  if (!keys.includes('task_summary') || !keys.includes('code')) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec requires string fields "task_summary" and "code".',
      },
    };
  }

  if (keys.some((key) => key !== 'task_summary' && key !== 'code' && key !== 'timeout_ms')) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec accepts only: task_summary, code, timeout_ms.',
      },
    };
  }

  const taskSummary = args.task_summary;
  if (typeof taskSummary !== 'string') {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec.task_summary must be a string.',
      },
    };
  }

  const trimmedTaskSummary = taskSummary.trim();
  if (trimmedTaskSummary.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec.task_summary must not be empty.',
      },
    };
  }

  if (trimmedTaskSummary.length > 200) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec.task_summary must be 1..200 characters after trim.',
      },
    };
  }

  const code = args.code;
  if (typeof code !== 'string') {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec.code must be a string.',
      },
    };
  }

  const codeBytes = Buffer.byteLength(code, 'utf8');
  if (codeBytes > CODE_EXEC_LIMITS.maxCodeBytes) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: `code_exec.code exceeds limit ${CODE_EXEC_LIMITS.maxCodeBytes} bytes (30 KiB).`,
      },
    };
  }

  const timeoutRaw = args.timeout_ms;
  const timeoutCandidate =
    timeoutRaw === undefined ? CODE_EXEC_LIMITS.timeoutMsDefault : timeoutRaw;
  if (typeof timeoutCandidate !== 'number' || !Number.isInteger(timeoutCandidate)) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: 'code_exec.timeout_ms must be an integer.',
      },
    };
  }
  const timeoutMs = timeoutCandidate;

  if (
    timeoutMs < CODE_EXEC_LIMITS.timeoutMsMin ||
    timeoutMs > CODE_EXEC_LIMITS.timeoutMsPolicyCap
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid_tool_arguments',
        message: `code_exec.timeout_ms must be in range ${CODE_EXEC_LIMITS.timeoutMsMin}..${CODE_EXEC_LIMITS.timeoutMsPolicyCap}.`,
      },
    };
  }

  return {
    ok: true,
    value: { taskSummary: trimmedTaskSummary, code, timeoutMs },
  };
}

export function makeCodeExecError(code: CodeExecErrorCode, message: string): CodeExecToolOutput {
  return {
    status: 'error',
    stdout: '',
    stderr: '',
    stdout_truncated: false,
    stderr_truncated: false,
    error: { code, message },
  };
}

export const CODE_EXEC_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['task_summary', 'code'],
  properties: {
    task_summary: {
      type: 'string',
      description:
        'Required short description of the work performed by this code execution (1..200 characters).',
      minLength: 1,
      maxLength: 200,
      pattern: '.*\\S.*',
    },
    code: {
      type: 'string',
      description: `JavaScript code to run in sandbox runtime (max ${CODE_EXEC_LIMITS.maxCodeBytes} bytes).`,
    },
    timeout_ms: {
      type: 'integer',
      description: `Optional timeout in ms (${CODE_EXEC_LIMITS.timeoutMsMin}..${CODE_EXEC_LIMITS.timeoutMsPolicyCap}). Default ${CODE_EXEC_LIMITS.timeoutMsDefault}.`,
      minimum: CODE_EXEC_LIMITS.timeoutMsMin,
      maximum: CODE_EXEC_LIMITS.timeoutMsPolicyCap,
    },
  },
};
