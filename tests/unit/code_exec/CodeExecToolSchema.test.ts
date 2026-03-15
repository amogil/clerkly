// Requirements: code_exec.3.1, code_exec.3.1.3, code_exec.5.1

import {
  CODE_EXEC_LIMITS,
  CODE_EXEC_TOOL_SCHEMA,
  makeCodeExecError,
  validateCodeExecInput,
} from '../../../src/main/code_exec/contracts';

describe('validateCodeExecInput', () => {
  it('validates minimal input and applies default timeout', () => {
    const result = validateCodeExecInput({
      task_summary: 'Print a value',
      code: 'console.log(1);',
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      taskSummary: 'Print a value',
      code: 'console.log(1);',
      timeoutMs: CODE_EXEC_LIMITS.timeoutMsDefault,
    });
  });

  it('trims task_summary and accepts exactly 200 characters after trim', () => {
    const summary = `  ${'x'.repeat(200)}  `;
    const result = validateCodeExecInput({
      task_summary: summary,
      code: 'console.log(1);',
    });

    expect(result.ok).toBe(true);
    expect(result.value?.taskSummary).toBe('x'.repeat(200));
  });

  it('rejects unknown properties', () => {
    const result = validateCodeExecInput({ task_summary: 'Run code', code: '1', bad: true });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_tool_arguments');
  });

  it('rejects missing required fields', () => {
    const result = validateCodeExecInput({});
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('requires string fields "task_summary" and "code"');
  });

  it('rejects missing, empty, and oversized task_summary', () => {
    const missingSummary = validateCodeExecInput({ code: '1' } as Record<string, unknown>);
    const emptySummary = validateCodeExecInput({ task_summary: '   ', code: '1' });
    const oversizedSummary = validateCodeExecInput({
      task_summary: 'x'.repeat(201),
      code: '1',
    });

    expect(missingSummary.ok).toBe(false);
    expect(emptySummary.ok).toBe(false);
    expect(oversizedSummary.ok).toBe(false);
  });

  it('rejects non-string task_summary', () => {
    const result = validateCodeExecInput({
      task_summary: 123,
      code: '1',
    } as unknown as Record<string, unknown>);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('task_summary must be a string');
  });

  it('rejects non-string code and non-integer timeout', () => {
    const badCode = validateCodeExecInput({
      task_summary: 'Run code',
      code: 1,
    } as unknown as Record<string, unknown>);
    const badTimeout = validateCodeExecInput({
      task_summary: 'Run code',
      code: '1',
      timeout_ms: 1.5,
    });

    expect(badCode.ok).toBe(false);
    expect(badCode.error?.message).toContain('code must be a string');
    expect(badTimeout.ok).toBe(false);
    expect(badTimeout.error?.message).toContain('must be an integer');
  });

  it('rejects timeout outside allowed range', () => {
    const tooSmall = validateCodeExecInput({
      task_summary: 'Run code',
      code: '1',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsMin - 1,
    });
    const tooLarge = validateCodeExecInput({
      task_summary: 'Run code',
      code: '1',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsPolicyCap + 1,
    });

    expect(tooSmall.ok).toBe(false);
    expect(tooLarge.ok).toBe(false);
  });

  it('rejects code larger than limit', () => {
    const big = 'a'.repeat(CODE_EXEC_LIMITS.maxCodeBytes + 1);
    const result = validateCodeExecInput({ task_summary: 'Run code', code: big });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('30 KiB');
  });

  it('accepts explicit timeout in valid range', () => {
    const result = validateCodeExecInput({
      task_summary: 'Run code',
      code: 'ok',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsMin,
    });

    expect(result.ok).toBe(true);
    expect(result.value?.timeoutMs).toBe(CODE_EXEC_LIMITS.timeoutMsMin);
  });
});

describe('CODE_EXEC_TOOL_SCHEMA', () => {
  it('defines additionalProperties=false and required task_summary/code', () => {
    expect(CODE_EXEC_TOOL_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['task_summary', 'code'],
      properties: {
        task_summary: expect.objectContaining({
          minLength: 1,
          maxLength: 200,
          pattern: '.*\\S.*',
        }),
      },
    });
  });
});

describe('makeCodeExecError', () => {
  it('returns standardized error payload', () => {
    const result = makeCodeExecError('policy_denied', 'blocked');
    expect(result).toEqual({
      status: 'error',
      stdout: '',
      stderr: '',
      stdout_truncated: false,
      stderr_truncated: false,
      error: { code: 'policy_denied', message: 'blocked' },
    });
  });
});
