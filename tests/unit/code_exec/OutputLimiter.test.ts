// Requirements: code_exec.5.2

import { applyStdStreamLimits, limitOutput } from '../../../src/main/code_exec/OutputLimiter';
import { CODE_EXEC_LIMITS } from '../../../src/main/code_exec/contracts';

describe('limitOutput', () => {
  /* Preconditions: short utf-8 text and byte limit above source bytes
     Action: call limitOutput
     Assertions: output remains unchanged and truncation flag is false
     Requirements: code_exec.5.2 */
  it('keeps text unchanged when below limit', () => {
    const value = limitOutput('hello', 20);
    expect(value).toEqual({ value: 'hello', truncated: false });
  });

  /* Preconditions: multibyte utf-8 text and limit below source bytes
     Action: call limitOutput
     Assertions: output is truncated on byte boundary and truncation flag is true
     Requirements: code_exec.5.2 */
  it('truncates text by utf-8 byte limit', () => {
    const source = 'abc😀def';
    const value = limitOutput(source, 7);
    expect(Buffer.byteLength(value.value, 'utf8')).toBeLessThanOrEqual(7);
    expect(value.truncated).toBe(true);
  });

  /* Preconditions: non-string input passed through runtime cast
     Action: call limitOutput
     Assertions: input is normalized to string and processed without truncation
     Requirements: code_exec.5.2 */
  it('normalizes non-string values before applying byte limit', () => {
    const value = limitOutput(42 as unknown as string, 10);
    expect(value).toEqual({ value: '42', truncated: false });
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
