// Requirements: code_exec.3.1, code_exec.3.1.3, code_exec.5.1

import {
  CODE_EXEC_LIMITS,
  CODE_EXEC_TOOL_SCHEMA,
  makeCodeExecError,
  validateCodeExecInput,
} from '../../../src/main/code_exec/contracts';

describe('validateCodeExecInput', () => {
  /* Preconditions: minimal valid code_exec input without explicit timeout
     Action: validate the input
     Assertions: validation succeeds and default timeout is applied
     Requirements: code_exec.3.1, code_exec.3.1.1, code_exec.3.1.4 */
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

  /* Preconditions: task_summary contains surrounding whitespace and exactly 200 meaningful characters
     Action: validate the input
     Assertions: task_summary is trimmed and accepted at the 200-character boundary
     Requirements: code_exec.3.1.1.3 */
  it('trims task_summary and accepts exactly 200 characters after trim', () => {
    const summary = `  ${'x'.repeat(200)}  `;
    const result = validateCodeExecInput({
      task_summary: summary,
      code: 'console.log(1);',
    });

    expect(result.ok).toBe(true);
    expect(result.value?.taskSummary).toBe('x'.repeat(200));
  });

  /* Preconditions: input contains an unsupported extra property
     Action: validate the input
     Assertions: validation fails with invalid_tool_arguments
     Requirements: code_exec.3.1 */
  it('rejects unknown properties', () => {
    const result = validateCodeExecInput({ task_summary: 'Run code', code: '1', bad: true });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_tool_arguments');
  });

  /* Preconditions: input omits required task_summary/code fields
     Action: validate the input
     Assertions: validation fails and the error explains that required fields are missing
     Requirements: code_exec.3.1, code_exec.3.1.1.2 */
  it('rejects missing required fields', () => {
    const result = validateCodeExecInput({});
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('requires string fields "task_summary" and "code"');
  });

  /* Preconditions: inputs are missing task_summary, contain blank task_summary, or exceed the size limit
     Action: validate each input
     Assertions: validation fails for missing, empty, and oversized task_summary values
     Requirements: code_exec.3.1.1.2, code_exec.3.1.1.3, code_exec.3.1.1.4 */
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

  /* Preconditions: task_summary is provided as a non-string value
     Action: validate the input
     Assertions: validation fails with a task_summary type error
     Requirements: code_exec.3.1.1.2 */
  it('rejects non-string task_summary', () => {
    const result = validateCodeExecInput({
      task_summary: 123,
      code: '1',
    } as unknown as Record<string, unknown>);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('task_summary must be a string');
  });

  /* Preconditions: code and timeout_ms are provided with invalid types
     Action: validate both inputs
     Assertions: validation fails for non-string code and non-integer timeout
     Requirements: code_exec.3.1, code_exec.3.1.4 */
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

  /* Preconditions: timeout_ms is below the minimum or above the policy cap
     Action: validate both inputs
     Assertions: validation fails for out-of-range timeout values
     Requirements: code_exec.3.1.4 */
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

  /* Preconditions: code exceeds the maximum allowed byte size
     Action: validate the input
     Assertions: validation fails and the error mentions the code size limit
     Requirements: code_exec.3.1.3 */
  it('rejects code larger than limit', () => {
    const big = 'a'.repeat(CODE_EXEC_LIMITS.maxCodeBytes + 1);
    const result = validateCodeExecInput({ task_summary: 'Run code', code: big });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('30 KiB');
  });

  /* Preconditions: timeout_ms is set to the minimum allowed value
     Action: validate the input
     Assertions: validation succeeds and preserves the explicit timeout
     Requirements: code_exec.3.1.4 */
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
  /* Preconditions: code_exec tool schema is defined
     Action: inspect the exported schema
     Assertions: schema requires task_summary/code and disallows additional properties
     Requirements: code_exec.3.1, code_exec.3.1.1 */
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
  /* Preconditions: a standardized code_exec error must be produced
     Action: build an error payload with makeCodeExecError
     Assertions: the returned payload uses the expected terminal error shape
     Requirements: code_exec.3.1.2 */
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
