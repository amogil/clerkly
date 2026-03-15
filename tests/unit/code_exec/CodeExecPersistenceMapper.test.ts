// Requirements: code_exec.4.1-4.1.2, code_exec.4.7-4.9

import {
  buildRunningToolPayload,
  buildTerminalToolPayload,
} from '../../../src/main/code_exec/CodeExecPersistenceMapper';

describe('CodeExecPersistenceMapper', () => {
  it('builds running payload with required fields', () => {
    const startedAt = '2026-03-10T10:00:00.000Z';
    const payload = buildRunningToolPayload(
      {
        callId: 'call-1',
        toolName: 'code_exec',
        arguments: { task_summary: 'Compute 1+1', code: '1+1' },
      },
      startedAt
    );

    expect(payload).toEqual({
      data: {
        callId: 'call-1',
        toolName: 'code_exec',
        arguments: { task_summary: 'Compute 1+1', code: '1+1' },
        output: {
          status: 'running',
          stdout: '',
          stderr: '',
          stdout_truncated: false,
          stderr_truncated: false,
          started_at: startedAt,
        },
      },
    });
  });

  it('builds terminal payload with finished_at and duration_ms', () => {
    const payload = buildTerminalToolPayload(
      {
        callId: 'call-1',
        toolName: 'code_exec',
        arguments: { task_summary: 'Compute 1+1', code: '1+1' },
      },
      {
        status: 'success',
        stdout: '2',
        stderr: '',
        stdout_truncated: false,
        stderr_truncated: false,
      },
      '2026-03-10T10:00:00.000Z',
      '2026-03-10T10:00:01.250Z'
    );

    expect(payload).toEqual({
      data: {
        callId: 'call-1',
        toolName: 'code_exec',
        arguments: { task_summary: 'Compute 1+1', code: '1+1' },
        output: {
          status: 'success',
          stdout: '2',
          stderr: '',
          stdout_truncated: false,
          stderr_truncated: false,
          started_at: '2026-03-10T10:00:00.000Z',
          finished_at: '2026-03-10T10:00:01.250Z',
          duration_ms: 1250,
        },
      },
    });
  });
});
