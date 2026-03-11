// Requirements: code_exec.5.2

import { applyStdStreamLimits, limitOutput } from '../../../src/main/code_exec/OutputLimiter';
import { CODE_EXEC_LIMITS } from '../../../src/main/code_exec/contracts';

describe('limitOutput', () => {
  it('keeps text unchanged when below limit', () => {
    const value = limitOutput('hello', 20);
    expect(value).toEqual({ value: 'hello', truncated: false });
  });

  it('truncates text by utf-8 byte limit', () => {
    const source = 'abc😀def';
    const value = limitOutput(source, 7);
    expect(Buffer.byteLength(value.value, 'utf8')).toBeLessThanOrEqual(7);
    expect(value.truncated).toBe(true);
  });
});

describe('applyStdStreamLimits', () => {
  it('applies stdout/stderr limits and flags', () => {
    const stdout = 'x'.repeat(CODE_EXEC_LIMITS.maxStdoutBytes + 10);
    const stderr = 'y'.repeat(CODE_EXEC_LIMITS.maxStderrBytes + 10);
    const result = applyStdStreamLimits(stdout, stderr);

    expect(result.stdout_truncated).toBe(true);
    expect(result.stderr_truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(
      CODE_EXEC_LIMITS.maxStdoutBytes
    );
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(
      CODE_EXEC_LIMITS.maxStderrBytes
    );
  });
});
