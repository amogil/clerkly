// Requirements: code_exec.4.1-4.1.2, code_exec.4.7-4.9

// Requirements: code_exec.4.1.2, code_exec.4.8
export function buildRunningToolPayload(
  payloadData: Record<string, unknown>,
  startedAt: string
): { data: Record<string, unknown> } {
  return {
    data: {
      ...payloadData,
      output: {
        status: 'running',
        stdout: '',
        stderr: '',
        stdout_truncated: false,
        stderr_truncated: false,
        started_at: startedAt,
      },
    },
  };
}

// Requirements: code_exec.4.1.2, code_exec.4.8-4.9
export function buildTerminalToolPayload(
  payloadData: Record<string, unknown>,
  terminalOutput: Record<string, unknown>,
  startedAt: string,
  finishedAt: string
): { data: Record<string, unknown> } {
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  return {
    data: {
      ...payloadData,
      output: {
        ...terminalOutput,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
      },
    },
  };
}
