// Requirements: code_exec.5.2

import { CODE_EXEC_LIMITS } from './contracts';

export interface LimitedOutput {
  value: string;
  truncated: boolean;
}

// Requirements: code_exec.5.2.1-5.2.3
export function limitOutput(text: string, maxBytes: number): LimitedOutput {
  const source = typeof text === 'string' ? text : String(text ?? '');
  const sourceBytes = Buffer.byteLength(source, 'utf8');
  if (sourceBytes <= maxBytes) {
    return { value: source, truncated: false };
  }

  let low = 0;
  let high = source.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = source.slice(0, mid);
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { value: source.slice(0, low), truncated: true };
}

export function applyStdStreamLimits(
  stdout: string,
  stderr: string
): {
  stdout: string;
  stderr: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
} {
  const stdoutLimited = limitOutput(stdout, CODE_EXEC_LIMITS.maxStdoutBytes);
  const stderrLimited = limitOutput(stderr, CODE_EXEC_LIMITS.maxStderrBytes);
  return {
    stdout: stdoutLimited.value,
    stderr: stderrLimited.value,
    stdout_truncated: stdoutLimited.truncated,
    stderr_truncated: stderrLimited.truncated,
  };
}
