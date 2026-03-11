// Requirements: code_exec.2.7-2.8.2, code_exec.3.4-3.5

import {
  createSandboxToolsProxy,
  validateSandboxToolPolicy,
} from '../../../src/main/code_exec/SandboxBridge';

describe('validateSandboxToolPolicy', () => {
  it('denies unknown and empty tool names', () => {
    expect(validateSandboxToolPolicy(undefined).ok).toBe(false);
    expect(validateSandboxToolPolicy('').ok).toBe(false);
  });

  it('denies main-pipeline-only tools', () => {
    const finalAnswer = validateSandboxToolPolicy('final_answer');
    const codeExec = validateSandboxToolPolicy('code_exec');

    expect(finalAnswer.ok).toBe(false);
    expect(finalAnswer.reason).toContain('Main-pipeline-only');
    expect(codeExec.ok).toBe(false);
  });

  it('denies non-whitelisted sandbox tools', () => {
    const result = validateSandboxToolPolicy('search_docs');
    expect(result.ok).toBe(false);
  });
});

describe('createSandboxToolsProxy', () => {
  it('throws policy_denied through deny callback for unknown tool', () => {
    const proxy = createSandboxToolsProxy((message: string) => {
      throw new Error(`policy_denied::${message}`);
    });

    expect(() => proxy.anyTool()).toThrow('policy_denied::');
  });
});
