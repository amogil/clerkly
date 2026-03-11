// Requirements: code_exec.3.1, code_exec.3.1.3, code_exec.5.1

import {
  CODE_EXEC_LIMITS,
  CODE_EXEC_TOOL_SCHEMA,
  makeCodeExecError,
  validateCodeExecInput,
} from '../../../src/main/code_exec/contracts';

describe('validateCodeExecInput', () => {
  it('validates minimal input and applies default timeout', () => {
    const result = validateCodeExecInput({ code: 'console.log(1);' });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      code: 'console.log(1);',
      timeoutMs: CODE_EXEC_LIMITS.timeoutMsDefault,
    });
  });

  it('rejects unknown properties', () => {
    const result = validateCodeExecInput({ code: '1', bad: true });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_tool_arguments');
  });

  it('rejects missing code field', () => {
    const result = validateCodeExecInput({});
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('requires a string field "code"');
  });

  it('rejects non-string code and non-integer timeout', () => {
    const badCode = validateCodeExecInput({ code: 1 } as unknown as Record<string, unknown>);
    const badTimeout = validateCodeExecInput({ code: '1', timeout_ms: 1.5 });

    expect(badCode.ok).toBe(false);
    expect(badCode.error?.message).toContain('must be a string');
    expect(badTimeout.ok).toBe(false);
    expect(badTimeout.error?.message).toContain('must be an integer');
  });

  it('rejects timeout outside allowed range', () => {
    const tooSmall = validateCodeExecInput({
      code: '1',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsMin - 1,
    });
    const tooLarge = validateCodeExecInput({
      code: '1',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsPolicyCap + 1,
    });

    expect(tooSmall.ok).toBe(false);
    expect(tooLarge.ok).toBe(false);
  });

  it('rejects code larger than limit', () => {
    const big = 'a'.repeat(CODE_EXEC_LIMITS.maxCodeBytes + 1);
    const result = validateCodeExecInput({ code: big });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('30 KiB');
  });

  it('accepts explicit timeout in valid range', () => {
    const result = validateCodeExecInput({
      code: 'ok',
      timeout_ms: CODE_EXEC_LIMITS.timeoutMsMin,
    });

    expect(result.ok).toBe(true);
    expect(result.value?.timeoutMs).toBe(CODE_EXEC_LIMITS.timeoutMsMin);
  });
});

describe('CODE_EXEC_TOOL_SCHEMA', () => {
  it('defines additionalProperties=false and required code', () => {
    expect(CODE_EXEC_TOOL_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['code'],
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
